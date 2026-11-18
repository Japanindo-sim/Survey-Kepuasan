const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const { environment } = require('./helpers/gas-mock.cjs');
const root = path.join(__dirname,'..');
const target = process.env.SURVEY_TARGET || 'index.html';
const baseline = fs.readFileSync(path.join(root,'archive','index.v1.html'),'utf8');
const html = fs.readFileSync(path.join(root,target),'utf8');
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
let browser, server, origin;
let mode = 'success';
let requests = [];
let errors = [];
let offsite = [];
let backend;

before(async () => {
  server = http.createServer((req,res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(req.url.startsWith('/baseline') ? baseline : html);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true, args: ['--disable-background-networking','--disable-sync','--no-first-run'], timeout: 30000 });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function pageFor(options = {}) {
  mode = options.mode || 'success'; requests = []; errors = [];
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = request.url();
    if (url.startsWith(origin) || url.startsWith('data:')) return request.continue();
    if (url.startsWith('https://script.google.com/macros/s/') && request.method() === 'GET') {
      return request.respond({ status:200, contentType:'application/json', headers:{ 'Access-Control-Allow-Origin':'*' },
        body:JSON.stringify({ status:'active', ...(mode === 'oldBackend' ? {} : { version:'2.0.0' }) }) });
    }
    if (url.startsWith('https://script.google.com/macros/s/') && request.method() === 'POST') {
      const data = JSON.parse(request.postData()); requests.push(data);
      if (mode === 'network') return request.abort('failed');
      const backendResult = mode.startsWith('backend') ? backend.post(data) : null;
      const lost = mode === 'backendLostResponse';
      if (lost) mode = 'backend';
      const result = backendResult || (mode === 'rejected' ? { success: false, message: 'Input ditolak.' } :
        mode === 'missingAck' ? { success: true } :
          { success: true, requestId: mode === 'wrongAck' ? 'wrong' : data.requestId, warnings: mode === 'warning' ? ['Screenshot tidak tersimpan. Hubungi tim.'] : [] });
      return request.respond({ status: mode === 'httpError' ? 503 : 200,
        contentType: mode === 'html' ? 'text/html' : 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: mode === 'html' || lost ? '<html>Login</html>' : JSON.stringify(result) });
    }
    offsite.push(url); return request.abort();
  });
  if (!options.noConfig) await page.evaluateOnNewDocument(() => {
    window.JP_SURVEY_CONFIG = { gasUrl: 'https://script.google.com/macros/s/local-test-v2/exec' };
  });
  if (options.mode && options.mode.startsWith('backend')) backend = environment();
  if (options.slowReader) await page.evaluateOnNewDocument(() => {
    const Native = window.FileReader;
    window.FileReader = class extends Native {
      readAsDataURL(blob) { setTimeout(() => super.readAsDataURL(blob),200); }
    };
  });
  if (options.fastTimeout) await page.evaluateOnNewDocument(() => {
    const native = window.setTimeout;
    window.setTimeout = (fn,ms,...args) => native(fn,ms === 60000 ? 5 : ms,...args);
    window.fetch = (_url,options) => new Promise((_resolve,reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError'))));
  });
  await page.goto(origin,{ waitUntil: 'networkidle0' });
  return page;
}
async function fill(page, bad = false) {
  await page.evaluate(bad => {
    const values = { f_nama: 'Penguji 日本', f_wa: '+81 80-1234-5678', f_lama: '1–3 bulan', f_paket: 'Paket 20GB/Bulan', f_domisili: '4-20 大阪市' };
    for (const [id,value] of Object.entries(values)) { document.getElementById(id).value = value; document.getElementById(id).dispatchEvent(new Event('input',{ bubbles:true })); }
    const radio = document.querySelector('input[name="sinyal"][value="' + (bad ? 'Kurang Bagus' : 'Bagus') + '"]');
    radio.checked = true; radio.dispatchEvent(new Event('change',{ bubbles:true }));
    if (bad) {
      for (const [id,value] of Object.entries({ f_sejak: 'Dua minggu', f_kondisi: 'Perkotaan', f_jam: 'Jam 20.00', f_hp: 'iPhone 15' })) {
        document.getElementById(id).value = value; document.getElementById(id).dispatchEvent(new Event('input',{ bubbles:true }));
      }
      const location = document.querySelector('input[name="lokasiKendala"]'); location.checked = true; location.dispatchEvent(new Event('change',{ bubbles:true }));
    }
  },bad);
}
async function submit(page) {
  await page.evaluate(() => document.getElementById('mainForm').requestSubmit());
}
async function setFile(page, name, type, base64 = png) {
  await page.evaluate(({ name,type,base64 }) => {
    const file = new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))],name,{ type });
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.getElementById('f_file'); input.files = transfer.files;
    input.dispatchEvent(new Event('change',{ bubbles:true }));
  },{ name,type,base64 });
}
async function snapshot(page) {
  return page.evaluate(() => ({
    questions: [...document.querySelectorAll('.field > label')].map(label => label.textContent.replace(/\s+/g,' ').trim()),
    controls: [...document.querySelectorAll('input,select,textarea')].map(input => ({ id:input.id, name:input.name, type:input.type,
      value: input.type === 'radio' ? input.value : '', options: input.tagName === 'SELECT' ? [...input.options].map(o => [o.value,o.textContent]) : null }))
  }));
}

test('question text and controls match v1 except the authorized 50GB package addition', async () => {
  const page = await pageFor(); const current = await snapshot(page);
  await page.goto(origin + '/baseline'); const original = await snapshot(page);
  const originalPackages = original.controls.find(control => control.id === 'f_paket').options;
  const after20GB = originalPackages.findIndex(option => option[0] === 'Paket 20GB/Bulan') + 1;
  assert.ok(after20GB > 0);
  originalPackages.splice(after20GB,0,['Paket 50GB/Bulan','Paket 50GB/Bulan']);
  assert.deepEqual(current,original); await page.close();
});
test('initial progress is zero and negative branch requires its additional questions', async () => {
  const page = await pageFor();
  assert.equal(await page.$eval('#progressTrack',e => e.getAttribute('aria-valuenow')),'0');
  await fill(page);
  assert.equal(await page.$eval('#progressTrack',e => e.getAttribute('aria-valuenow')),'100');
  await page.click('label:has(> input[name="sinyal"][value="Kurang Bagus"])');
  assert.ok(Number(await page.$eval('#progressTrack',e => e.getAttribute('aria-valuenow'))) < 100);
  await submit(page); assert.equal(requests.length,0);
  assert.ok(await page.$eval('#err_sejak',e => e.classList.contains('show'))); await page.close();
});
test('positive branch sends exact field contract and shows persistent acknowledged success', async () => {
  const page = await pageFor(); await fill(page); await submit(page);
  await page.waitForSelector('#successCard.show'); assert.equal(requests.length,1);
  assert.equal(requests[0].sinyal,'Bagus'); assert.equal(requests[0].paket,'Paket 20GB/Bulan');
  assert.equal(requests[0].merkHP,''); assert.ok(requests[0].requestId);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('jp-survey-pending-v2')),null);
  assert.deepEqual(errors,[]); await page.close();
});
test('unconfigured page and old backend are blocked before any POST', async () => {
  for (const options of [{ noConfig:true },{ mode:'oldBackend' }]) {
    const page = await pageFor(options); await fill(page); await submit(page);
    await page.waitForSelector('#errGlobal.show'); assert.equal(requests.length,0);
    assert.equal(await page.$('#successCard.show'),null); await page.close();
  }
});
test('negative branch includes screenshot and exposes upload warning after confirmed save', async () => {
  const page = await pageFor({ mode:'warning' }); await fill(page,true); await setFile(page,'speedtest.png','image/png');
  await page.waitForFunction(() => !document.getElementById('btnSubmit').disabled);
  await submit(page); await page.waitForSelector('#successCard.show');
  assert.equal(requests[0].imageBase64,png); assert.equal(requests[0].imageType,'image/png');
  assert.equal(await page.$eval('#successWarning',e => e.hidden),false); assert.deepEqual(errors,[]); await page.close();
});
for (const failure of ['html','httpError','rejected','missingAck','wrongAck','network']) {
  test(failure + ' response preserves values and never claims success; retry reuses request ID', async () => {
    const page = await pageFor({ mode:failure }); await fill(page); await submit(page);
    await page.waitForSelector('#errGlobal.show');
    assert.equal(await page.$('#successCard.show'),null);
    assert.equal(await page.$eval('#f_nama',e => e.value),'Penguji 日本');
    assert.equal(await page.$eval('#btnSubmit',e => e.disabled),false);
    const firstId = requests[0].requestId; mode = 'success';
    await submit(page); await page.waitForSelector('#successCard.show');
    assert.equal(requests[1].requestId,firstId); assert.deepEqual(errors,[]); await page.close();
  });
}
test('timeout explicitly leaves persistence uncertain and unlocks form', async () => {
  const page = await pageFor({ fastTimeout:true }); await fill(page); await submit(page);
  await page.waitForSelector('#errGlobal.show');
  assert.match(await page.$eval('#errGlobal',e => e.textContent),/belum dapat dipastikan/);
  assert.equal(await page.$eval('#btnSubmit',e => e.disabled),false); await page.close();
});
test('changed payload receives a new ID after a failed attempt', async () => {
  const page = await pageFor({ mode:'html' }); await fill(page); await submit(page);
  await page.waitForSelector('#errGlobal.show'); const old = requests[0].requestId;
  await page.$eval('#f_nama',e => e.value = 'Another valid respondent'); mode = 'success';
  await submit(page); await page.waitForSelector('#successCard.show'); assert.notEqual(requests[1].requestId,old); await page.close();
});
test('same payload after reload reuses pending request ID without storing answers in sessionStorage', async () => {
  const page = await pageFor({ mode:'html' }); await fill(page); await submit(page);
  await page.waitForSelector('#errGlobal.show'); const old = requests[0].requestId;
  const stored = await page.evaluate(() => sessionStorage.getItem('jp-survey-pending-v2'));
  assert.ok(!stored.includes('Penguji')); assert.ok(!stored.includes('1234-5678'));
  await page.reload({ waitUntil:'networkidle0' }); await fill(page); mode = 'success';
  await submit(page); await page.waitForSelector('#successCard.show'); assert.equal(requests[1].requestId,old); await page.close();
});
for (const bad of [false,true]) test('browser to actual Apps Script mock round trip: ' + (bad ? 'negative with image' : 'positive'), async () => {
  const page = await pageFor({ mode:'backend' }); await fill(page,bad);
  await page.select('#f_paket','Paket 50GB/Bulan');
  if (bad) { await setFile(page,'speedtest.png','image/png'); await page.waitForFunction(() => !document.getElementById('btnSubmit').disabled); }
  await submit(page); await page.waitForSelector('#successCard.show');
  assert.equal(backend.answers().getLastRow(),2); assert.equal(backend.files.size,bad ? 1 : 0);
  assert.equal(backend.answers().data[1][17],'Paket 50GB/Bulan');
  assert.equal(backend.answers().data[1][2],"'+818012345678"); assert.deepEqual(errors,[]); await page.close();
});
test('lost response after real mock save is recovered through browser retry without duplicate row or screenshot', async () => {
  const page = await pageFor({ mode:'backendLostResponse' }); await fill(page,true); await setFile(page,'speedtest.png','image/png');
  await page.waitForFunction(() => !document.getElementById('btnSubmit').disabled); await submit(page);
  await page.waitForSelector('#errGlobal.show'); assert.equal(backend.answers().getLastRow(),2);
  await submit(page); await page.waitForSelector('#successCard.show');
  assert.equal(backend.answers().getLastRow(),2); assert.equal(backend.files.size,1); assert.equal(requests[0].requestId,requests[1].requestId); await page.close();
});
test('invalid WhatsApp is rejected without any request', async () => {
  const page = await pageFor(); await fill(page); await page.$eval('#f_wa',e => e.value = 'hello'); await submit(page);
  assert.equal(requests.length,0); assert.equal(await page.$eval('#f_wa',e => e.getAttribute('aria-invalid')),'true'); await page.close();
});
test('referral toggle clears hidden data and switching signal branch resets inactive answers', async () => {
  const page = await pageFor(); await fill(page); await page.click('#r_ada'); await page.type('#f_namaRef','Teman');
  await page.type('#f_waRef','+6281234567890'); await page.click('#r_belum');
  assert.equal(await page.$eval('#f_namaRef',e => e.value),'');
  await page.click('#r_ada'); await page.type('#f_namaRef','Teman');
  await page.click('label:has(> input[name="sinyal"][value="Sangat Jelek"])');
  assert.equal(await page.$eval('#f_namaRef',e => e.value),'');
  assert.equal(await page.$eval('#sec3a',e => e.classList.contains('show')),false); await page.close();
});
test('replacement with invalid file clears prior screenshot; submit during reading is blocked', async () => {
  const page = await pageFor({ slowReader:true }); await fill(page,true);
  await setFile(page,'first.png','image/png'); assert.equal(await page.$eval('#btnSubmit',e => e.disabled),true);
  await submit(page); assert.equal(requests.length,0);
  await page.waitForFunction(() => !document.getElementById('btnSubmit').disabled);
  await setFile(page,'invalid.pdf','application/pdf');
  assert.equal(await page.$eval('#filePreview',e => e.classList.contains('show')),false);
  await submit(page); await page.waitForSelector('#successCard.show'); assert.equal(requests[0].imageBase64,undefined); await page.close();
});
test('late FileReader completion cannot restore a removed screenshot', async () => {
  const page = await pageFor({ slowReader:true }); await fill(page,true); await setFile(page,'removed.png','image/png');
  await page.evaluate(() => document.getElementById('btnRemove').click());
  await page.waitForFunction(() => !document.getElementById('btnSubmit').disabled);
  await new Promise(resolve => setTimeout(resolve,300));
  assert.equal(await page.$eval('#filePreview',e => e.classList.contains('show')),false);
  await submit(page); await page.waitForSelector('#successCard.show'); assert.equal(requests[0].imageBase64,undefined); await page.close();
});
test('no layout overflow at supported widths, keyboard focus visible, no offsite requests', async () => {
  const page = await pageFor(); await fill(page,true);
  for (const width of [320,390,768,1024,1440]) {
    await page.setViewport({ width,height:1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,'overflow at ' + width);
  }
  await page.focus('input[name="sinyal"][value="Sangat Bagus"]');
  assert.equal(await page.$eval('#sb_1',e => getComputedStyle(e).outlineWidth),'3px');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$eval('input[name="sinyal"]:checked',e => e.value),'Bagus');
  assert.equal(await page.$eval('#sec3a',e => e.classList.contains('show')),true);
  await fill(page,true);
  await page.evaluate(() => document.activeElement.blur());
  if (process.env.SURVEY_SCREENSHOTS === '1') {
    const out = path.join(root,'verification'); fs.mkdirSync(out,{ recursive:true });
    await page.setViewport({ width:390,height:900 }); await page.screenshot({ path:path.join(out,'survey-mobile.png'),fullPage:true });
    await page.setViewport({ width:1440,height:1000 }); await page.screenshot({ path:path.join(out,'survey-desktop.png'),fullPage:true });
  }
  assert.deepEqual(errors,[]); assert.deepEqual(offsite,[]); await page.close();
});
