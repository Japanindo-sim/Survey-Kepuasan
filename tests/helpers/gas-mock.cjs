const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const SOURCE = fs.readFileSync(path.join(__dirname,'..','..','code.gs'),'utf8');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
function payload(overrides = {}) {
  return Object.assign({ requestId: crypto.randomUUID(), nama: 'Penguji 日本', whatsapp: '+6281234567890',
    lamaUse: '1–3 bulan', paket: 'Paket 20GB/Bulan', domisili: '大阪市 4-20', sinyal: 'Bagus' }, overrides);
}
function complaint(overrides = {}) {
  return payload(Object.assign({ sinyal: 'Kurang Bagus', sejakkendala: 'Dua minggu',
    lokasiKendala: 'Di dalam ruangan (Indoor)', kondisiArea: 'Perkotaan',
    jamAktivitas: 'Jam 20.00, video call', merkHP: 'iPhone 15',
    imageBase64: PNG, imageType: 'image/png', imageName: 'speedtest.png' }, overrides));
}

function environment() {
  const state = { sheets: new Map(), files: new Map(), cache: new Map(), logs: [],
    locked: false, allowLock: true, lockAttempts: 0, releases: 0, fail: null,
    folderAccess: 'PRIVATE', folderEditors: [], ownerEmail: 'owner@example.test', calls: [], clock: 1000000,
    properties: { ENVIRONMENT: 'test', SPREADSHEET_ID: 'TEST_SHEET', DRIVE_FOLDER_ID: 'TEST_FOLDER' } };
  const tick = (event) => {
    state.calls.push(event);
    if (state.fail === event) { state.fail = null; throw new Error('Injected failure: ' + event); }
  };
  class Range {
    constructor(sheet, row, col, rows = 1, cols = 1) { Object.assign(this, { sheet, row, col, rows, cols }); }
    getValues() {
      return Array.from({ length: this.rows }, (_,r) => Array.from({ length: this.cols }, (_,c) => this.sheet.data[this.row+r-1]?.[this.col+c-1] ?? ''));
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(values) {
      assert.equal(values.length, this.rows);
      for (const row of values) assert.equal(row.length, this.cols);
      const event = this.sheet.name.startsWith('_') ? (values[0][3] === 'COMMITTED' ? 'ledger.commit' : 'ledger.reserve') : (this.row === 1 ? 'headers.write' : 'answer.write');
      tick(event + '.before');
      values.forEach((row,r) => row.forEach((value,c) => {
        this.sheet.data[this.row+r-1] ||= [];
        this.sheet.data[this.row+r-1][this.col+c-1] = value;
      }));
      tick(event + '.after');
      return this;
    }
    setValue(value) { return this.setValues([[value]]); }
    setNumberFormat() { return this; }
    getNote() { return this.sheet.notes.get(this.row + ':' + this.col) || ''; }
    setNote(note) { tick('note.before'); this.sheet.notes.set(this.row + ':' + this.col,note); tick('note.after'); return this; }
    getRow() { return this.row; }
    createTextFinder(value) {
      return { matchEntireCell() { return this; }, findNext: () => {
        for (let r = this.row; r < this.row + this.rows; r++) if (this.sheet.data[r-1]?.[this.col-1] === value) return this.sheet.getRange(r,this.col);
        return null;
      } };
    }
  }
  class Sheet {
    constructor(name, id) { Object.assign(this, { name, id, data: [], notes: new Map(), maxRows: 1000 }); }
    getRange(...args) { return new Range(this,...args); }
    getSheetId() { return this.id; }
    getLastRow() { let last = this.data.length; while (last > 0 && (!this.data[last-1] || this.data[last-1].every(v => v === ''))) last--; return last; }
    getLastColumn() { return Math.max(0,...this.data.map(row => row.length)); }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_,n) { this.maxRows += n; }
    setFrozenRows() {}
  }
  const user = email => ({ getEmail: () => email });
  function makeFile(name, blob) {
    const id = 'file' + (state.files.size + 1);
    const file = { name, blob, getId: () => id, getOwner: () => state.ownerEmail ? user(state.ownerEmail) : null,
      getSharingAccess: () => state.folderAccess, getEditors: () => state.folderEditors.map(user), getViewers: () => [] };
    state.files.set(id,file);
    return file;
  }
  const folder = {
    getOwner: () => state.ownerEmail ? user(state.ownerEmail) : null, getSharingAccess: () => state.folderAccess,
    getEditors: () => state.folderEditors.map(user), getViewers: () => [],
    getFilesByName: name => { const files = [...state.files.values()].filter(f => f.name === name); return { hasNext: () => Boolean(files.length), next: () => files.shift() }; },
    createFile: blob => { tick('file.create.before'); state.clock += 500; const file = makeFile(blob.name,blob); tick('file.create.after'); return file; },
  };
  const ss = { getSheetByName: name => state.sheets.get(name) || null, insertSheet: name => {
    const sheet = new Sheet(name,state.sheets.size + 1); state.sheets.set(name,sheet); return sheet;
  } };
  const context = vm.createContext({
    Date: class extends Date { static now() { return state.clock; } },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => state.properties }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { state.lockAttempts++; if (state.locked || !state.allowLock) return false; state.locked = true; return true; }, releaseLock: () => { assert.equal(state.locked,true); state.locked = false; state.releases++; } }) },
    SpreadsheetApp: { openById: id => { assert.equal(id,'TEST_SHEET'); tick('sheet.open'); return ss; }, flush: () => tick('flush') },
    DriveApp: { Access: { PRIVATE: 'PRIVATE' }, getFolderById: id => { assert.equal(id,'TEST_FOLDER'); tick('folder.open'); return folder; }, getFileById: id => state.files.get(id) },
    CacheService: { getScriptCache: () => ({ get: key => state.cache.get(key) || null, put: (key,value) => state.cache.set(key,value) }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_,text) => { state.clock += 25; return [...crypto.createHash('sha256').update(text).digest()]; },
      base64Decode: text => [...Buffer.from(text,'base64')], newBlob: (bytes,mime,name) => ({ bytes,mime,name }),
      formatDate: () => '2026-11-18 13:00:00' },
    Logger: { log: value => state.logs.push(JSON.parse(value)) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
  });
  vm.runInContext(SOURCE,context);
  state.api = vm.runInContext('({ doPost, validatePayload_, HEADERS, normalizePhone_, matchesImage_, sha256_ })',context);
  state.post = data => JSON.parse(state.api.doPost({ postData: { contents: JSON.stringify(data) } }).text);
  state.answers = () => [...state.sheets.values()].find(s => !s.name.startsWith('_'));
  state.ledger = () => state.sheets.get('_JP_SURVEY_REQUESTS_V2');
  return state;
}


module.exports = { environment, payload, complaint };
