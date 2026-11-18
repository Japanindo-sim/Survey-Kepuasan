const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment, payload, complaint } = require('./helpers/gas-mock.cjs');
test('valid positive branch preserves all 18 columns and safe cell text', () => {
  const env = environment();
  const data = payload({ nama: '=IMPORTXML("x")', saran: '@mention', paket: 'Paket 50GB/Bulan' });
  const result = env.post(data);
  assert.equal(result.success,true);
  assert.equal(result.requestId,data.requestId);
  assert.equal(env.answers().data[1].length,18);
  assert.equal(env.answers().data[1][1], '\'=IMPORTXML("x")');
  assert.equal(env.answers().data[1][2], "'+6281234567890");
  assert.equal(env.answers().data[1][10], "'@mention");
  assert.equal(env.answers().data[1][17],data.paket);
  assert.equal(env.releases,1);
  assert.equal(env.files.size,0);
});

test('negative branch stores one private screenshot and returns explicit acknowledgment', () => {
  const env = environment();
  const result = env.post(complaint());
  assert.equal(result.success,true);
  assert.deepEqual(result.warnings,[]);
  assert.equal(env.files.size,1);
  assert.equal(env.answers().data[1][16],'https://drive.google.com/file/d/file1/view');
});

test('invalid inputs are rejected before lock or service writes', () => {
  const cases = [null, [], {}, payload({ nama: '' }), payload({ nama: 9 }), payload({ nama: 'x'.repeat(121) }),
    payload({ whatsapp: 'abc' }), payload({ sinyal: 'Cukup' }), payload({ paket: 'other' }),
    payload({ sejakkendala: 'hidden branch' }), payload({ namaReferral: 'hidden friend' }),
    complaint({ merkHP: '' }), complaint({ imageBase64: 'invalid' }),
    complaint({ imageType: 'image/svg+xml' }), complaint({ imageBase64: Buffer.from('not a PNG').toString('base64') }),
    payload({ requestId: 'bad' }), payload({ unknown: true }), complaint({ imageBase64: 123 })];
  for (const data of cases) {
    const env = environment();
    assert.equal(env.post(data).success,false,JSON.stringify(data));
    assert.equal(env.lockAttempts,0);
    assert.equal(env.sheets.size,0);
    assert.equal(env.files.size,0);
  }
});

test('body limit, malformed JSON, and oversized decoded image are rejected', () => {
  const env = environment();
  for (const contents of ['{', 'x'.repeat(7020001)]) assert.equal(JSON.parse(env.api.doPost({ postData: { contents } }).text).success,false);
  const bytes = Buffer.alloc(5 * 1024 * 1024 + 1);
  bytes.set([137,80,78,71,13,10,26,10]); bytes.write('IHDR',12);
  assert.equal(env.post(complaint({ imageBase64: bytes.toString('base64') })).code,'VALIDATION');
  assert.equal(env.lockAttempts,0);
});

test('phone normalization supports Indonesian/Japanese formats and rejects arbitrary text', () => {
  const normalize = environment().api.normalizePhone_;
  for (const phone of ['+6281234567890','0812-3456-7890','62 812 3456 7890']) assert.equal(normalize(phone),'+6281234567890');
  for (const phone of ['+81 80-1234-5678','080-1234-5678','00818012345678']) assert.equal(normalize(phone),'+818012345678');
  for (const phone of ['++6281234567890','+8108012345678','hello','+12345']) assert.equal(normalize(phone),'');
});

test('retry after completed request returns same result without new answer or file', () => {
  const env = environment(); const data = complaint();
  assert.equal(env.post(data).success,true);
  const result = env.post(data);
  assert.equal(result.success,true); assert.equal(result.duplicate,true);
  assert.equal(env.answers().getLastRow(),2); assert.equal(env.files.size,1); assert.equal(env.ledger().getLastRow(),2);
  assert.equal(env.post({ ...data, nama: 'Changed' }).code,'REQUEST_CONFLICT');
});

for (const failpoint of ['ledger.reserve.after', 'note.after', 'file.create.after', 'answer.write.before', 'answer.write.after', 'ledger.commit.before', 'ledger.commit.after']) {
  test('recover retry after ' + failpoint + ' without duplicate side effects', () => {
    const env = environment(); const data = complaint(); env.fail = failpoint;
    assert.equal(env.post(data).success,false);
    assert.equal(env.locked,false);
    assert.equal(env.post(data).success,true);
    assert.equal(env.answers().getLastRow(),2);
    assert.equal(env.ledger().getLastRow(),2);
    assert.equal(env.files.size,1);
    assert.match(env.answers().data[1][16],/file1/);
  });
}

test('occupied row with another marker is preserved', () => {
  const env = environment(); const data = payload(); env.fail = 'note.before';
  assert.equal(env.post(data).success,false);
  env.answers().data[1] = ['Manual entry'];
  assert.equal(env.post(data).code,'ROW_CONFLICT');
  assert.equal(env.answers().data[1][0],'Manual entry');
});

test('unknown headers stop writes; known 17-column schema only appends package header', () => {
  const env = environment(); assert.equal(env.post(payload()).success,true);
  const saved = env.answers().data[1].slice();
  [env.answers().data[0][1],env.answers().data[0][2]] = [env.answers().data[0][2],env.answers().data[0][1]];
  assert.equal(env.post(payload()).code,'SCHEMA_MISMATCH'); assert.deepEqual(env.answers().data[1],saved);
  const legacy = environment(); assert.equal(legacy.post(payload()).success,true);
  legacy.answers().data[0].pop(); legacy.answers().data[1].pop();
  assert.equal(legacy.post(payload()).success,true);
  assert.equal(legacy.answers().data[0][17],'Paket saat ini');
  assert.equal(legacy.answers().data[1].length,17);
});

test('public or unapproved shared folder yields a stored answer with explicit warning, no file', () => {
  for (const kind of ['public','unknown editor']) {
    const env = environment();
    if (kind === 'public') env.folderAccess = 'ANYONE_WITH_LINK'; else env.folderEditors = ['unapproved@example.test'];
    const result = env.post(complaint());
    assert.equal(result.success,true); assert.equal(result.warnings.length,1); assert.equal(env.files.size,0);
    assert.equal(env.answers().data[1][16],'[Screenshot tidak tersimpan]');
  }
});

test('approved reviewer permits private folder without opening public sharing', () => {
  const env = environment(); env.folderEditors = ['reviewer@example.test'];
  env.properties.UPLOAD_REVIEWER_EMAILS = 'reviewer@example.test';
  assert.equal(env.post(complaint()).success,true); assert.equal(env.files.size,1);
});
test('unknown owner and opaque collaborator identities fail closed for uploads', () => {
  for (const kind of ['unknown owner','opaque collaborator']) {
    const env = environment();
    if (kind === 'unknown owner') env.ownerEmail = ''; else env.folderEditors = [''];
    const result = env.post(complaint());
    assert.equal(result.success,true); assert.equal(result.warnings.length,1); assert.equal(env.files.size,0);
  }
});

test('rate limit blocks new submissions but allows retry of known request', () => {
  const env = environment(); const first = payload();
  assert.equal(env.post(first).success,true);
  assert.equal(env.post(payload()).success,true); assert.equal(env.post(payload()).success,true);
  assert.equal(env.post(payload()).code,'RATE_LIMIT'); assert.equal(env.post(first).success,true);
});

test('busy and unconfigured environments fail closed', () => {
  const env = environment(); env.allowLock = false;
  assert.equal(env.post(payload()).code,'BUSY'); assert.equal(env.releases,0);
  const unconfigured = environment(); unconfigured.properties = {};
  assert.equal(unconfigured.post(payload()).code,'CONFIG_REQUIRED'); assert.equal(unconfigured.lockAttempts,0);
});

test('simultaneous request cannot enter locked critical section; retry resolves same ID', () => {
  const env = environment(); const data = complaint(); env.locked = true;
  assert.equal(env.post(data).code,'BUSY'); env.locked = false;
  assert.equal(env.post(data).success,true); assert.equal(env.post(data).duplicate,true);
  assert.equal(env.answers().getLastRow(),2); assert.equal(env.files.size,1);
});

test('validation stays outside critical section, with anonymous timing logs', () => {
  const env = environment(); const data = complaint(); env.post(data);
  const timing = env.logs.find(log => log.event === 'submission_timing');
  assert.equal(timing.validationMs,25); assert.equal(timing.lockedMs,525);
  assert.ok(timing.lockedMs < timing.lockedMs + timing.validationMs);
  const logs = JSON.stringify(env.logs); assert.ok(!logs.includes(data.nama)); assert.ok(!logs.includes(data.whatsapp));
});
