// JP Smart SIM Survey v2 — configuration and deployment: README.md.
// Google service calls are tested with mocks; no test helper writes to production.
const HEADERS = [
  'Timestamp', 'Nama Lengkap', 'No. WhatsApp', 'Lama Penggunaan',
  'Domisili / Wilayah', 'Kualitas Sinyal', 'Tertarik Autodebet', 'Ada Referral',
  'Nama Referral', 'WA Referral', 'Saran', 'Sejak Kapan Kendala',
  'Lokasi Kendala', 'Kondisi Area', 'Jam / Aktivitas Kendala',
  'Merk & Tipe HP', 'Link Screenshot Speedtest', 'Paket saat ini',
];
const LEDGER_HEADERS = ['Request ID', 'Payload SHA256', 'Reserved Row', 'Status',
  'File ID', 'Warning', 'Created At', 'Sheet ID'];
const LIMITS = { imageBytes: 5 * 1024 * 1024, bodyChars: 7020000 };
const CHOICES = {
  lamaUse: ['< 1 bulan', '1–3 bulan', '3–6 bulan', '> 6 bulan'],
  paket: ['Paket 3GB/Bulan', 'Paket 20GB/Bulan', 'Paket MAX (3GB / Hari)'],
  sinyal: ['Sangat Bagus', 'Bagus', 'Kurang Bagus', 'Sangat Jelek'],
  autodebet: ['', 'Ya, hubungi saya', 'Tidak untuk saat ini'],
  adaReferral: ['', 'Ada', 'Belum ada'],
  lokasiKendala: ['', 'Di dalam ruangan (Indoor)', 'Di luar ruangan (Outdoor)'],
  kondisiArea: ['', 'Perkotaan', 'Pegunungan', 'Pesisir Pantai', 'Lainnya'],
};
const TEXT_LIMITS = { nama: 120, whatsapp: 40, lamaUse: 40, paket: 80,
  domisili: 500, sinyal: 40, autodebet: 80, adaReferral: 40,
  namaReferral: 120, waReferral: 40, saran: 2000, sejakkendala: 500,
  lokasiKendala: 80, kondisiArea: 40, jamAktivitas: 500, merkHP: 120 };

function failure_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getConfig_() {
  const p = PropertiesService.getScriptProperties().getProperties();
  if (!['test', 'production'].includes(p.ENVIRONMENT) || !p.SPREADSHEET_ID || !p.DRIVE_FOLDER_ID) {
    throw failure_('CONFIG_REQUIRED', 'Layanan belum dikonfigurasi. Hubungi tim JP Smart SIM.');
  }
  return {
    spreadsheetId: p.SPREADSHEET_ID, folderId: p.DRIVE_FOLDER_ID,
    sheetName: p.SHEET_NAME || '03 SURVEY KEPUASAN DAN KELUHAN',
    ledgerName: p.LEDGER_NAME || '_JP_SURVEY_REQUESTS_V2',
    reviewers: (p.UPLOAD_REVIEWER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  };
}

function doPost(e) {
  const started = Date.now();
  let locked = false;
  let lock;
  let requestId = '';
  let acquired = 0;
  try {
    // Parsing, type validation, decoding and hashing do not require a global lock.
    const body = e && e.postData && e.postData.contents;
    if (typeof body !== 'string' || body.length > LIMITS.bodyChars) {
      throw failure_('INVALID_BODY', 'Ukuran atau format kiriman tidak valid.');
    }
    let raw;
    try { raw = JSON.parse(body); }
    catch (_) { throw failure_('INVALID_JSON', 'Format data tidak valid.'); }
    const parsed = validatePayload_(raw);
    const data = parsed.data;
    requestId = data.requestId;
    const fingerprint = sha256_(JSON.stringify(data));
    const config = getConfig_();
    const validated = Date.now();
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw failure_('BUSY', 'Server sedang sibuk. Coba kirim kembali dengan isian yang sama.');
    locked = true;
    acquired = Date.now();

    const ss = SpreadsheetApp.openById(config.spreadsheetId);
    const sheet = ss.getSheetByName(config.sheetName) || ss.insertSheet(config.sheetName);
    const ledger = ss.getSheetByName(config.ledgerName) || ss.insertSheet(config.ledgerName);
    if (config.sheetName === config.ledgerName) throw failure_('CONFIG_REQUIRED', 'Konfigurasi tab perlu diperiksa tim JP Smart SIM.');
    ensureHeaders_(sheet, HEADERS, true);
    ensureHeaders_(ledger, LEDGER_HEADERS, false);
    let record = findRecord_(ledger, requestId);
    if (record && (record.values[1] !== fingerprint || Number(record.values[7]) !== sheet.getSheetId())) {
      throw failure_('REQUEST_CONFLICT', 'Identitas kiriman sudah digunakan untuk data lain. Muat ulang formulir untuk kiriman baru.');
    }
    if (record && record.values[3] === 'COMMITTED') {
      return jsonResponse(true, 'Jawaban sudah tersimpan.', { requestId: requestId, warnings: warnings_(record.values[5]), duplicate: true });
    }
    if (!record) {
      checkRateLimit_(data.whatsapp);
      const lastReserved = ledger.getLastRow() > 1 ? Number(ledger.getRange(ledger.getLastRow(), 3).getValue()) : 1;
      if (!Number.isInteger(lastReserved) || lastReserved < 1) throw failure_('LEDGER_INVALID', 'Pencatatan kiriman perlu diperiksa tim JP Smart SIM.');
      const row = Math.max(sheet.getLastRow() + 1, lastReserved + 1);
      const values = [requestId, fingerprint, row, 'RESERVED', '', '',
        Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), sheet.getSheetId()];
      record = { row: ledger.getLastRow() + 1, values: values };
      writeRecord_(ledger, record);
      SpreadsheetApp.flush(); // Persist the reservation before any Drive side effect.
    }

    // A stable filename and a durable reservation allow retries after a lost response.
    // Drive I/O remains in the lock: moving it out needs a distributed lease and risks duplicates.
    let imageLink = '';
    if (parsed.bytes && !record.values[5]) {
      const uploadStarted = Date.now();
      try {
        const file = uploadImageToDrive_(data, parsed.bytes, config, record.values[4]);
        record.values[4] = file.getId();
        writeRecord_(ledger, record);
        SpreadsheetApp.flush();
        imageLink = 'https://drive.google.com/file/d/' + record.values[4] + '/view';
      } catch (error) {
        if (error.code !== 'UPLOAD_ACCESS') throw error;
        record.values[5] = 'Jawaban tersimpan, tetapi screenshot tidak tersimpan karena akses folder belum sesuai. Hubungi tim JP Smart SIM.';
        writeRecord_(ledger, record);
      } finally {
        Logger.log(JSON.stringify({ event: 'upload_timing', milliseconds: Date.now() - uploadStarted }));
      }
    }
    if (record.values[4] && !record.values[5]) imageLink = 'https://drive.google.com/file/d/' + record.values[4] + '/view';
    const rowValues = buildRow_(data, imageLink || (record.values[5] ? '[Screenshot tidak tersimpan]' : ''), record.values[6]);
    commitRow_(sheet, record, rowValues);
    record.values[3] = 'COMMITTED';
    writeRecord_(ledger, record);
    SpreadsheetApp.flush();
    Logger.log(JSON.stringify({ event: 'submission_timing', validationMs: validated - started,
      waitMs: acquired - validated, lockedMs: Date.now() - acquired }));
    return jsonResponse(true, 'Data berhasil disimpan. Terima kasih sudah mengisi survey!',
      { requestId: requestId, warnings: warnings_(record.values[5]), duplicate: false });
  } catch (error) {
    const code = error.code || 'STORAGE_UNCERTAIN';
    Logger.log(JSON.stringify({ event: 'submission_error', code: code }));
    return jsonResponse(false, error.code ? error.message :
      'Penyimpanan belum dapat dipastikan. Coba kirim kembali tanpa mengubah isian.',
    { code: code, requestId: requestId, warnings: [] });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ status: 'active', version: '2.0.0',
    script: 'JP Smart SIM Survey API', timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function validatePayload_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw failure_('VALIDATION', 'Data formulir harus berupa objek.');
  if (typeof raw.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw.requestId)) {
    throw failure_('VALIDATION', 'Identitas kiriman tidak valid. Muat ulang formulir.');
  }
  const allowed = Object.keys(TEXT_LIMITS).concat(['requestId', 'imageBase64', 'imageType', 'imageName']);
  if (Object.keys(raw).some(key => !allowed.includes(key))) throw failure_('VALIDATION', 'Kiriman memuat field yang tidak dikenal.');
  const data = { requestId: raw.requestId.toLowerCase() };
  Object.keys(TEXT_LIMITS).forEach(key => {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') throw failure_('VALIDATION', 'Tipe isian ' + key + ' tidak valid.');
    const value = (raw[key] || '').trim();
    if (value.length > TEXT_LIMITS[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
      throw failure_('VALIDATION', 'Panjang atau isi ' + key + ' tidak valid.');
    }
    data[key] = value;
  });
  ['nama', 'whatsapp', 'lamaUse', 'paket', 'domisili', 'sinyal'].forEach(key => {
    if (!data[key]) throw failure_('VALIDATION', 'Informasi dasar belum lengkap.');
  });
  Object.keys(CHOICES).forEach(key => {
    if (!CHOICES[key].includes(data[key])) throw failure_('VALIDATION', 'Pilihan ' + key + ' tidak valid.');
  });
  data.whatsapp = normalizePhone_(data.whatsapp);
  if (!data.whatsapp) throw failure_('VALIDATION', 'Gunakan nomor WhatsApp Indonesia (+62) atau Jepang (+81) yang valid.');
  if (data.waReferral) {
    data.waReferral = normalizePhone_(data.waReferral);
    if (!data.waReferral) throw failure_('VALIDATION', 'Nomor WhatsApp teman tidak valid.');
  }
  const badSignal = ['Kurang Bagus', 'Sangat Jelek'].includes(data.sinyal);
  const complaintKeys = ['sejakkendala', 'lokasiKendala', 'kondisiArea', 'jamAktivitas', 'merkHP'];
  const goodKeys = ['autodebet', 'adaReferral', 'namaReferral', 'waReferral', 'saran'];
  if (badSignal && complaintKeys.some(key => !data[key])) throw failure_('VALIDATION', 'Detail kendala belum lengkap.');
  if ((badSignal ? goodKeys : complaintKeys).some(key => data[key])) throw failure_('VALIDATION', 'Isian tidak sesuai jalur penilaian sinyal.');
  if (data.adaReferral !== 'Ada' && (data.namaReferral || data.waReferral)) throw failure_('VALIDATION', 'Detail teman tidak sesuai pilihan referral.');
  let bytes = null;
  if (raw.imageBase64 !== undefined && raw.imageBase64 !== '') {
    if (!badSignal || typeof raw.imageBase64 !== 'string' || raw.imageBase64.length > Math.ceil(LIMITS.imageBytes / 3) * 4 ||
      raw.imageBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.imageBase64)) {
      throw failure_('VALIDATION', 'Gambar tidak valid atau melebihi 5 MB.');
    }
    if (typeof raw.imageType !== 'string' || !['image/jpeg', 'image/png', 'image/heic', 'image/heif'].includes(raw.imageType)) {
      throw failure_('VALIDATION', 'Gunakan gambar JPG, PNG, atau HEIC.');
    }
    if (raw.imageName !== undefined && (typeof raw.imageName !== 'string' || raw.imageName.length > 255)) throw failure_('VALIDATION', 'Nama berkas tidak valid.');
    try { bytes = Utilities.base64Decode(raw.imageBase64); }
    catch (_) { throw failure_('VALIDATION', 'Gambar tidak dapat dibaca.'); }
    if (!bytes.length || bytes.length > LIMITS.imageBytes || !matchesImage_(bytes, raw.imageType)) throw failure_('VALIDATION', 'Isi gambar tidak sesuai jenis berkas.');
    data.imageBase64 = raw.imageBase64;
    data.imageType = raw.imageType;
  } else if (raw.imageType || raw.imageName) {
    throw failure_('VALIDATION', 'Data gambar tidak lengkap.');
  }
  return { data: data, bytes: bytes };
}

function normalizePhone_(value) {
  if (!/^[+\d\s().-]+$/.test(value)) return '';
  let phone = value.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (/^0[789]0\d{8}$/.test(phone)) phone = '+81' + phone.slice(1);
  else if (/^08/.test(phone)) phone = '+62' + phone.slice(1);
  else if (/^0[1-9]/.test(phone)) phone = '+81' + phone.slice(1);
  else if (/^(62|81)/.test(phone)) phone = '+' + phone;
  return /^(?:\+628\d{7,11}|\+81[1-9]\d{8,9})$/.test(phone) ? phone : '';
}

function matchesImage_(bytes, mime) {
  const b = bytes.map(n => n & 255);
  if (mime === 'image/jpeg') return b.length > 4 && b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length - 2] === 255 && b[b.length - 1] === 217;
  if (mime === 'image/png') return b.length >= 24 && [137,80,78,71,13,10,26,10].every((n,i) => b[i] === n) && String.fromCharCode.apply(null, b.slice(12,16)) === 'IHDR';
  const header = String.fromCharCode.apply(null, b.slice(8, Math.min(b.length, 64)));
  return b.length >= 16 && String.fromCharCode.apply(null, b.slice(4,8)) === 'ftyp' && /(heic|heix|hevc|hevx|mif1|msf1)/.test(header);
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(n => ('0' + ((n + 256) % 256).toString(16)).slice(-2)).join('');
}

function checkRateLimit_(phone) {
  // Best-effort abuse guard, not authentication. Cache eviction can reset counters.
  const cache = CacheService.getScriptCache();
  const bucket = Math.floor(Date.now() / 60000);
  const keys = [ ['global:' + bucket, 30, 120], ['phone:' + sha256_(phone) + ':' + Math.floor(bucket / 10), 3, 660] ];
  const counts = keys.map(item => Number(cache.get(item[0]) || 0));
  if (counts.some((count, i) => count >= keys[i][1])) throw failure_('RATE_LIMIT', 'Terlalu banyak kiriman baru. Tunggu beberapa menit lalu coba kembali.');
  keys.forEach((item, i) => cache.put(item[0], String(counts[i] + 1), item[2]));
}

function ensureHeaders_(sheet, expected, allowLegacy) {
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    sheet.setFrozenRows(1);
    return;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expected.length)).getValues()[0];
  const exact = expected.every((h, i) => String(existing[i] || '').trim() === h) && existing.slice(expected.length).every(v => !v);
  if (exact) return;
  // Recognize only the known 17-column version; never relabel an unknown schema.
  if (allowLegacy && sheet.getLastColumn() === 17 && expected.slice(0,17).every((h,i) => String(existing[i] || '').trim() === h)) {
    sheet.getRange(1,18).setValue(expected[17]);
    return;
  }
  throw failure_('SCHEMA_MISMATCH', 'Susunan kolom perlu diperiksa tim JP Smart SIM. Data lama tidak diubah.');
}

function findRecord_(ledger, requestId) {
  if (ledger.getLastRow() < 2) return null;
  const match = ledger.getRange(2,1,ledger.getLastRow() - 1,1).createTextFinder(requestId).matchEntireCell(true).findNext();
  return match ? { row: match.getRow(), values: ledger.getRange(match.getRow(),1,1,LEDGER_HEADERS.length).getValues()[0] } : null;
}

function writeRecord_(ledger, record) {
  ledger.getRange(record.row,1,1,LEDGER_HEADERS.length).setValues([record.values]);
}

function restricted_(resource, config) {
  const owner = resource.getOwner();
  const allowed = config.reviewers.concat(owner ? [owner.getEmail().toLowerCase()] : []);
  return resource.getSharingAccess() === DriveApp.Access.PRIVATE &&
    resource.getEditors().concat(resource.getViewers()).every(user => allowed.includes(user.getEmail().toLowerCase()));
}

function uploadImageToDrive_(data, bytes, config, fileId) {
  const folder = DriveApp.getFolderById(config.folderId);
  if (!restricted_(folder, config)) throw failure_('UPLOAD_ACCESS', 'Folder upload tidak terbatas.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif' }[data.imageType];
  const filename = 'speedtest_' + data.requestId + '.' + extension;
  let file;
  if (fileId) file = DriveApp.getFileById(fileId);
  else {
    const existing = folder.getFilesByName(filename);
    file = existing.hasNext() ? existing.next() : folder.createFile(Utilities.newBlob(bytes, data.imageType, filename));
  }
  if (!restricted_(file, config)) throw failure_('UPLOAD_PRIVACY_UNCERTAIN', 'Akses screenshot perlu diperiksa tim. Coba kembali setelah tim memeriksa akses.');
  return file;
}

function safeCell_(value) {
  // Keep user strings literal in Sheets, including international phone numbers.
  const text = String(value || '');
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function buildRow_(data, imageLink, timestamp) {
  return [timestamp, data.nama, data.whatsapp, data.lamaUse, data.domisili, data.sinyal,
    data.autodebet, data.adaReferral, data.namaReferral, data.waReferral, data.saran,
    data.sejakkendala, data.lokasiKendala, data.kondisiArea, data.jamAktivitas,
    data.merkHP, imageLink, data.paket].map(safeCell_);
}

function commitRow_(sheet, record, values) {
  const row = Number(record.values[2]);
  if (!Number.isInteger(row) || row < 2) throw failure_('LEDGER_INVALID', 'Nomor baris kiriman tidak valid.');
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), row - sheet.getMaxRows());
  const first = sheet.getRange(row,1);
  const marker = 'JP_SURVEY:' + record.values[0] + ':' + record.values[1];
  const range = sheet.getRange(row,1,1,HEADERS.length);
  const occupied = range.getValues()[0].some(value => value !== '');
  const note = first.getNote();
  if ((note && note !== marker) || (occupied && note !== marker)) throw failure_('ROW_CONFLICT', 'Baris kiriman perlu diperiksa tim. Data yang ada tidak ditimpa.');
  if (!occupied) {
    first.setNote(marker);
    SpreadsheetApp.flush();
    range.setNumberFormat('@').setValues([values]);
    SpreadsheetApp.flush();
  }
  // If the values were written before a crash, the matching note identifies the same commit.
}

function warnings_(warning) { return warning ? [String(warning)] : []; }

function jsonResponse(success, message, details) {
  return ContentService.createTextOutput(JSON.stringify(Object.assign({ success: success, message: message }, details || {})))
    .setMimeType(ContentService.MimeType.JSON);
}
