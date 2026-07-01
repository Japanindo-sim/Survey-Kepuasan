// ================================================================
//  JP Smart SIM — Google Apps Script
//  Menerima data survey dari HTML form → Google Sheets + Google Drive
//
//  CARA DEPLOY:
//  1. Buka script.google.com → New Project
//  2. Paste seluruh kode ini
//  3. Isi SPREADSHEET_ID dan DRIVE_FOLDER_ID di bawah
//  4. Deploy → New Deployment → Web App
//     - Execute as : Me (akun Google Kakak)
//     - Who has access : Anyone
//  5. Copy "Web app URL" → paste ke GAS_URL di survey-jp-smart-sim.html
// ================================================================

// ──────────────────────────────────────────────────────────────
// !! WAJIB DIUBAH !!
// ──────────────────────────────────────────────────────────────
const CONFIG = {
  SPREADSHEET_ID : '1yLihwoTdtBXf0YT924S7ONcU4UvgIClt9za3mbC-hNQ',
  // Cara ambil ID: buka spreadsheet → lihat URL
  // https://docs.google.com/spreadsheets/d/ [[ INI_ID_NYA ]] /edit
  
  DRIVE_FOLDER_ID: '1-xnep591KK-d9o7FPiUvjmr-aNII8Jcd',
  // Cara ambil ID: buka folder Drive → lihat URL
  // https://drive.google.com/drive/folders/ [[ INI_ID_NYA ]]
  
  SHEET_NAME: '03 SURVEY KEPUASAN DAN KELUHAN',
  // Nama sheet/tab di dalam spreadsheet
};

// ──────────────────────────────────────────────────────────────
// KOLOM TETAP — JANGAN UBAH URUTAN INI sembarangan.
// Jika ingin tambah kolom baru → TAMBAHKAN DI PALING AKHIR SAJA.
// Penambahan di tengah akan menggeser data yang sudah ada.
// ──────────────────────────────────────────────────────────────
const HEADERS = [
  'Timestamp',
  'Nama Lengkap',
  'No. WhatsApp',
  'Lama Penggunaan',
  'Domisili / Wilayah',
  'Kualitas Sinyal',
  'Tertarik Autodebet',
  'Ada Referral',
  'Nama Referral',
  'WA Referral',
  'Saran',
  'Sejak Kapan Kendala',
  'Lokasi Kendala',
  'Kondisi Area',
  'Jam / Aktivitas Kendala',
  'Merk & Tipe HP',
  'Link Screenshot Speedtest',
  'Paket saat ini',
];

// ================================================================
//  doPost — Entry point utama.
//  Dipanggil setiap kali form mengirim data.
// ================================================================
function doPost(e) {
  // ScriptLock: hindari race condition jika ada dua request masuk bersamaan
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (lockErr) {
    Logger.log('[LOCK] Timeout: ' + lockErr.toString());
    return jsonResponse(false, 'Server sedang sibuk, coba beberapa detik lagi.');
  }

  try {
    // ── 1. Parse body ───────────────────────────────────────────
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      lock.releaseLock();
      Logger.log('[PARSE ERROR] ' + parseErr.toString());
      return jsonResponse(false, 'Format data tidak valid. Pastikan survey dikirim dari form resmi.');
    }

    Logger.log('[RECEIVED] Nama: ' + data.nama + ' | Sinyal: ' + data.sinyal);

    // ── 2. Upload gambar ke Drive (jika ada) ────────────────────
    let imageLink = '';
    if (data.imageBase64 && String(data.imageBase64).length > 10) {
      try {
        imageLink = uploadImageToDrive_(data);
        Logger.log('[IMAGE] Berhasil upload: ' + imageLink);
      } catch (imgErr) {
        // TIDAK menggagalkan seluruh submission hanya karena gambar gagal upload
        imageLink = '[Upload gagal: ' + imgErr.message + ']';
        Logger.log('[IMAGE ERROR] ' + imgErr.toString());
      }
    }

    // ── 3. Simpan ke Spreadsheet ────────────────────────────────
    saveToSheet_(data, imageLink);
    Logger.log('[SAVED] Data berhasil masuk ke spreadsheet.');

    lock.releaseLock();
    return jsonResponse(true, 'Data berhasil disimpan. Terima kasih sudah mengisi survey!');

  } catch (err) {
    lock.releaseLock();
    Logger.log('[CRITICAL ERROR] ' + err.toString());
    return jsonResponse(false, 'Terjadi kesalahan di server: ' + err.toString());
  }
}

// ================================================================
//  doGet — Health-check endpoint.
//  Buka URL script di browser → harus muncul JSON status active.
// ================================================================
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'active',
      script: 'JP Smart SIM Survey API',
      timestamp: new Date().toISOString(),
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================================================================
//  uploadImageToDrive_ — Decode base64 → simpan ke Google Drive
// ================================================================
function uploadImageToDrive_(data) {
  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);

  const mimeType = data.imageType || 'image/jpeg';
  let ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');

  const safeName = (data.nama || 'unknown')
    .replace(/[^a-zA-Z0-9\u3040-\u30FF\u4E00-\u9FAF]/g, '_')
    .substring(0, 30);
  const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
  const fileName = 'speedtest_' + safeName + '_' + ts + '.' + ext;

  const decoded = Utilities.base64Decode(data.imageBase64);
  const blob    = Utilities.newBlob(decoded, mimeType, fileName);
  const file    = folder.createFile(blob);

  // ✅ Ambil ID dan bangun URL SEBELUM setSharing dipanggil.
  //    Dengan cara ini, URL selalu ada walau setSharing gagal.
  const fileId  = file.getId();
  const fileUrl = 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing';

  // setSharing dipisah di try-catch sendiri — gagal tidak memblokir URL.
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    // Ini hanya warning. File sudah tersimpan dan URL sudah ada.
    Logger.log('[SHARE WARNING] setSharing gagal (mungkin dibatasi admin/org): ' + shareErr.toString());
    Logger.log('[SHARE WARNING] File tetap tersimpan. ID: ' + fileId);
    // Coba cara alternatif: publish via Drive API v3 jika tersedia
    // (tidak perlu dalam kebanyakan kasus personal Google Account)
  }

  Logger.log('[IMAGE URL] ' + fileUrl);
  return fileUrl; // ← Selalu return URL, bukan pesan error
}

// ================================================================
//  saveToSheet_ — Simpan satu baris data ke Spreadsheet
// ================================================================
function saveToSheet_(data, imageLink) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  // Buat sheet baru jika belum ada
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    Logger.log('[SHEET] Sheet baru dibuat: ' + CONFIG.SHEET_NAME);
  }
  
  // Pastikan header baris 1 sudah benar
  ensureHeaders_(sheet);
  
  // Susun data SESUAI URUTAN HEADERS — ini kunci anti header-mismatch
  const row = [
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), // Timestamp (WIB +9)
    data.nama           || '',
    data.whatsapp       || '',
    data.lamaUse        || '',
    data.domisili       || '',
    data.sinyal         || '',
    data.autodebet      || '',
    data.adaReferral    || '',
    data.namaReferral   || '',
    data.waReferral     || '',
    data.saran          || '',
    data.sejakkendala   || '',
    data.lokasiKendala  || '',
    data.kondisiArea    || '',
    data.jamAktivitas   || '',
    data.merkHP         || '',
    imageLink           || '',
    data.paket          || '',
  ];
  
  // Validasi: pastikan jumlah kolom sama dengan HEADERS
  if (row.length !== HEADERS.length) {
    throw new Error(
      'Mismatch kolom! row=' + row.length + ' HEADERS=' + HEADERS.length +
      '. Periksa kode di saveToSheet_() dan array HEADERS.'
    );
  }
  
  sheet.appendRow(row);
}

// ================================================================
//  ensureHeaders_ — Pastikan baris pertama adalah header yang benar.
//  FIX untuk masalah klasik "Header not matched".
// ================================================================
function ensureHeaders_(sheet) {
  const lastRow = sheet.getLastRow();
  
  if (lastRow === 0) {
    // Sheet benar-benar kosong → buat header
    sheet.appendRow(HEADERS);
    formatHeaders_(sheet);
    Logger.log('[HEADERS] Header baru dibuat.');
    return;
  }
  
  // Ambil baris pertama yang ada
  const lastCol       = Math.max(sheet.getLastColumn(), HEADERS.length);
  const existingRange = sheet.getRange(1, 1, 1, lastCol);
  const existingRow   = existingRange.getValues()[0];
  
  // Cek apakah semua header cocok
  const allMatch = HEADERS.every(
    (h, i) => String(existingRow[i] || '').trim() === String(h).trim()
  );
  
  if (!allMatch) {
    // Header tidak cocok → perbaiki paksa
    Logger.log('[HEADERS] Header tidak cocok! Memperbaiki...');
    Logger.log('Ada  : ' + JSON.stringify(existingRow.slice(0, HEADERS.length)));
    Logger.log('Harus: ' + JSON.stringify(HEADERS));
    
    // Set ulang header (hanya baris 1, data tidak tersentuh)
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeaders_(sheet);
    Logger.log('[HEADERS] Header berhasil diperbaiki.');
  }
}

// ================================================================
//  formatHeaders_ — Styling visual untuk baris header
// ================================================================
function formatHeaders_(sheet) {
  const hRange = sheet.getRange(1, 1, 1, HEADERS.length);
  
  hRange.setBackground('#0F3460');     // navy blue
  hRange.setFontColor('#FFFFFF');
  hRange.setFontWeight('bold');
  hRange.setFontSize(11);
  hRange.setHorizontalAlignment('center');
  hRange.setVerticalAlignment('middle');
  hRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
  
  sheet.setFrozenRows(1);              // freeze baris header
  sheet.setRowHeight(1, 38);
  
  // Auto-resize semua kolom
  sheet.autoResizeColumns(1, HEADERS.length);
}

// ================================================================
//  jsonResponse — Helper membuat response JSON (dengan MIME type benar)
// ================================================================
function jsonResponse(success, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: success, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ================================================================
//  testSubmission — Jalankan ini dari editor GAS untuk testing
//  tanpa harus buka form HTML sama sekali.
// ================================================================
function testSubmission() {
  const mockData = {
    nama:          'Budi Santoso (Test)',
    whatsapp:      '+62812345678',
    lamaUse:       '1–3 bulan',
    domisili:      'Tokyo',
    sinyal:        'Bagus',
    autodebet:     'Tidak untuk saat ini',
    adaReferral:   'Ada',
    namaReferral:  'Ani Putri',
    waReferral:    '+62898765432',
    saran:         'Semoga makin lancar dan murah!',
    // Kolom 3B dikosongkan karena sinyal "Bagus"
    sejakkendala:  '',
    lokasiKendala: '',
    kondisiArea:   '',
    jamAktivitas:  '',
    merkHP:        '',
    paket:         'Paket 20GB/Bulan',
  };
  
  const mockEvent = {
    postData: { contents: JSON.stringify(mockData) }
  };
  
  const result = doPost(mockEvent);
  Logger.log('=== TEST RESULT ===');
  Logger.log(result.getContent());
}

// ================================================================
//  testBadSignal — Test untuk alur sinyal jelek + gambar dummy
// ================================================================
function testBadSignal() {
  // Buat gambar dummy 1x1 pixel PNG sebagai base64
  const dummyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  const mockData = {
    nama:          'Siti Rahayu (Test Bad Signal)',
    whatsapp:      '+62811222333',
    lamaUse:       '> 6 bulan',
    domisili:      'Osaka',
    sinyal:        'Kurang Bagus',
    autodebet:     '',
    adaReferral:   '',
    namaReferral:  '',
    waReferral:    '',
    saran:         '',
    sejakkendala:  'Sejak 3 minggu lalu setelah pindah apartemen',
    lokasiKendala: 'Di dalam ruangan (Indoor)',
    kondisiArea:   'Perkotaan',
    jamAktivitas:  'Malam jam 9, saat streaming YouTube',
    merkHP:        'iPhone 14 Pro',
    imageBase64:   dummyPng,
    imageName:     'test_speedtest.png',
    imageType:     'image/png',
    paket:         'Paket MAX (3GB / Hari)',
  };
  
  const mockEvent = {
    postData: { contents: JSON.stringify(mockData) }
  };
  
  const result = doPost(mockEvent);
  Logger.log('=== TEST BAD SIGNAL RESULT ===');
  Logger.log(result.getContent());
}
