import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml' };
const root = join(process.cwd(), 'dist');
const server = createServer(async (req,res) => {
  try {
    let p = normalize(new URL(req.url,'http://x').pathname).replace(/^(\.\.[/\\])+/,'');
    if (p === '/') p = '/index.html';
    const f = join(root,p); const body = await readFile(f);
    res.writeHead(200,{'content-type':TYPES[extname(f)]||'application/octet-stream'}); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(4175, r));
const BASE = 'http://localhost:4175';

const issues = [];
const note = (s) => { issues.push(s); console.log('  ✗ ' + s); };
const ok = (s) => console.log('  ok ' + s);

const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text()); });

await p.goto(BASE); await p.waitForSelector('nav.bottom'); await p.waitForTimeout(300);

/* ---- 1. typing keeps focus in EVERY editable field in Setup ---- */
console.log('\n[1] focus retention across all Setup sections');
await p.evaluate(() => { location.hash = '/setup'; }); await p.waitForTimeout(300);
for (const label of ['Accounts','Income','Bills','Loan','Ekub','Relocation','Budgets']) {
  await p.click(`button.rowlink:has-text("${label}")`);
  await p.waitForTimeout(300);
  const fields = p.locator('.card input[type="text"], .card input[type="number"]');
  const n = Math.min(await fields.count(), 6);
  let lost = 0;
  for (let i = 0; i < n; i++) {
    const f = fields.nth(i);
    await f.click(); await p.waitForTimeout(60);
    await p.keyboard.type('7', { delay: 40 });
    await p.waitForTimeout(90);
    const still = await p.evaluate(() => document.activeElement?.tagName);
    if (still !== 'INPUT') lost++;
  }
  if (lost) note(`${label}: focus lost in ${lost}/${n} fields`); else ok(`${label}: ${n} fields keep focus`);
  await p.click(`button.rowlink:has-text("${label}")`);  // collapse
  await p.waitForTimeout(150);
}

/* ---- 2. clearing a date field must not corrupt anything ---- */
console.log('\n[2] clearing a required date');
await p.click('button.rowlink:has-text("Accounts")'); await p.waitForTimeout(300);
const dateF = p.locator('input[type="date"]').first();
await dateF.fill('');
await p.waitForTimeout(350);
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).accounts[0].openingDate);
await p.evaluate(() => { location.hash = '/home'; }); await p.waitForTimeout(500);
const homeTxt = await p.textContent('main');
if (/NaN|Invalid/.test(homeTxt)) note(`empty date leaks "NaN/Invalid" onto Home (stored: "${stored}")`);
else ok(`empty date handled (stored: "${stored}")`);
await p.evaluate(() => { location.hash = '/forecast'; }); await p.waitForTimeout(600);
const fcTxt = await p.textContent('main');
if (/NaN|Invalid/.test(fcTxt)) note('empty date leaks NaN onto Forecast');
else ok('forecast survives an empty date');

/* reset for the remaining checks */
await p.evaluate(() => localStorage.removeItem('birr.data.v1'));
await p.goto(BASE); await p.waitForTimeout(400);

/* ---- 3. deleting every account ---- */
console.log('\n[3] removing all accounts');
await p.evaluate(() => { location.hash = '/setup'; }); await p.waitForTimeout(300);
await p.click('button.rowlink:has-text("Accounts")'); await p.waitForTimeout(300);
for (let i = 0; i < 8; i++) {
  const rm = p.locator('.editrow button:has-text("remove")').first();
  if (await rm.count() === 0) break;
  await rm.click(); await p.waitForTimeout(140);
}
const left = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).accounts.length);
for (const r of ['home','calendar','forecast','accounts','budget','checks']) {
  await p.evaluate(x => { location.hash = '/' + x; }, r); await p.waitForTimeout(400);
  const txt = await p.textContent('main').catch(() => null);
  if (!txt) note(`${r} failed to render with ${left} accounts`);
}
if (errs.length) note(`removing all accounts raised: ${errs.slice(-2).join(' | ')}`);
else ok(`app survives with ${left} accounts`);

/* ---- 4. a very distant relocation date (performance) ---- */
await p.evaluate(() => localStorage.removeItem('birr.data.v1'));
await p.goto(BASE); await p.waitForTimeout(400);
console.log('\n[4] a relocation date far in the future');
await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('birr.data.v1'));
  d.relocation.targetDate = '2075-01-01';
  localStorage.setItem('birr.data.v1', JSON.stringify(d));
});
await p.goto(BASE + '#/relocation');
const t0 = Date.now();
await p.waitForTimeout(100);
let rendered = false;
try { await p.waitForSelector('.card', { timeout: 20000 }); rendered = true; } catch {}
const ms = Date.now() - t0;
if (!rendered) note(`relocation 50 years out did not render within 20s`);
else if (ms > 4000) note(`relocation 50 years out took ${ms}ms to render`);
else ok(`relocation 50 years out renders in ${ms}ms`);

/* ---- 5. does the bottom nav cover a focused field? ---- */
await p.evaluate(() => localStorage.removeItem('birr.data.v1'));
await p.goto(BASE + '#/inbox'); await p.waitForTimeout(500);
console.log('\n[5] bottom nav vs a focused field');
const ta = p.locator('textarea').first();
await ta.scrollIntoViewIfNeeded(); await ta.click(); await p.waitForTimeout(200);
const overlap = await p.evaluate(() => {
  const el = document.activeElement; const nav = document.querySelector('nav.bottom');
  if (!el || !nav) return null;
  const a = el.getBoundingClientRect(), b = nav.getBoundingClientRect();
  return a.bottom > b.top && a.top < b.bottom;
});
if (overlap) note('the bottom nav sits on top of the focused field (it will fight the keyboard)');
else ok('focused field is clear of the bottom nav');

/* ---- 6. older-Safari API use ---- */
console.log('\n[6] APIs that older iPhones may not have');
const src = await readFile(join(root, 'assets', (await import('node:fs')).readdirSync(join(root,'assets')).find(f=>f.endsWith('.js'))), 'utf8');
for (const [api, since] of [['structuredClone','Safari 15.4'],['\\.at\\(','Safari 15.4'],['replaceAll','Safari 13.1'],['Object\\.hasOwn','Safari 15.4']]) {
  if (new RegExp(api).test(src)) note(`uses ${api.replace(/\\\\/g,'')} — needs ${since}`);
}
if (!issues.some(i=>i.includes('needs Safari'))) ok('no APIs newer than Safari 13 in the bundle');

await b.close(); server.close();
console.log('\n' + (issues.length ? `${issues.length} issue(s) found` : 'no further issues found'));
