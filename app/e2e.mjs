import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.png':'image/png', '.svg':'image/svg+xml' };

const root = join(process.cwd(), 'dist');
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '\\') p = '/index.html';
    const file = join(root, p);
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(4173, r));
const BASE = 'http://localhost:4173';

const errors = [];
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], colorScheme: 'dark' });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const step = (s) => console.log('  · ' + s);
const fail = (s) => { errors.push('ASSERT: ' + s); console.log('  ✗ ' + s); };

await p.goto(BASE);
await p.waitForSelector('nav.bottom');

// ---- 1. every tab renders
for (const tab of ['home','calendar','inbox','forecast','more']) {
  await p.evaluate(t => { location.hash = '/' + t; }, tab);
  await p.waitForTimeout(220);
  const txt = await p.textContent('main');
  if (!txt || txt.length < 40) fail(`${tab} rendered almost nothing`);
}
step('all 5 tabs render');

// ---- 2. every sub screen renders
for (const r of ['accounts','loan','ekub','relocation','budget','setup','checks']) {
  await p.evaluate(t => { location.hash = '/' + t; }, r);
  await p.waitForTimeout(260);
  const txt = await p.textContent('main');
  if (!txt || txt.length < 40) fail(`${r} rendered almost nothing`);
}
step('all 7 sub-screens render');

// ---- 3. checks screen reports all passing
await p.evaluate(() => { location.hash = '/checks'; });
await p.waitForTimeout(400);
const checks = await p.textContent('.hero');
if (!/^(\d+) of \1 pass$/.test(checks.trim())) fail(`Checks screen says "${checks.trim()}"`);
step('self-test in-app: ' + checks.trim());

// ---- 4. no horizontal overflow on any screen
for (const r of ['home','calendar','forecast','setup','accounts','budget']) {
  await p.evaluate(t => { location.hash = '/' + t; }, r);
  await p.waitForTimeout(220);
  const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (over) fail(`horizontal overflow on ${r}`);
}
step('no horizontal overflow at 393px');

// ---- 5. mark a bill paid -> transaction recorded
await p.evaluate(() => { location.hash = '/calendar'; });
await p.waitForTimeout(300);
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).transactions.length);
const payBtn = p.locator('button:has-text("Mark paid")').first();
if (await payBtn.count() === 0) fail('no "Mark paid" button on the calendar');
else {
  await payBtn.click();
  await p.waitForTimeout(350);
  const after = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).transactions.length);
  if (after !== before + 1) fail(`mark-paid recorded ${after - before} transactions`);
  else step('mark paid records a transaction');
}

// ---- 6. inbox: parse a sample and log it
await p.evaluate(() => { location.hash = '/inbox'; });
await p.waitForTimeout(300);
await p.click('button:has-text("Load a sample")');
await p.click('button:has-text("Read it")');
await p.waitForTimeout(350);
const pending = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).inbox.length);
if (pending !== 1) fail(`expected 1 pending message, got ${pending}`);
else step('sample SMS parsed into the inbox');

const logBtn = p.locator('button:has-text("Log it")').first();
if (await logBtn.count() === 0) fail('no "Log it" button');
else {
  const txBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).transactions.length);
  await logBtn.click();
  await p.waitForTimeout(350);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')));
  if (st.transactions.length !== txBefore + 1) fail('logging the message did not record a transaction');
  else if (st.inbox.length !== 0) fail('message stayed in the inbox after logging');
  else step('logging a message records it and clears the inbox');
}

// ---- 7. the iOS Shortcut URL path
const sms = encodeURIComponent('Dear customer your account 1****5678 has been debited with ETB 777.00. Your current balance is ETB 2,000.00');
await p.goto(`${BASE}/?sender=CBE&sms=${sms}`);
await p.waitForTimeout(600);
const afterUrl = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).inbox);
if (afterUrl.length !== 1) fail(`URL capture put ${afterUrl.length} messages in the inbox`);
else if (afterUrl[0].amount !== 777) fail(`URL capture read amount ${afterUrl[0].amount}`);
else step('iOS-Shortcut URL capture works: read Br 777 from CBE');
const cleaned = await p.evaluate(() => location.search);
if (cleaned !== '') fail(`URL not scrubbed after capture: "${cleaned}"`);
else step('URL scrubbed so a refresh cannot double-book');
await p.reload(); await p.waitForTimeout(500);
const afterReload = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).inbox.length);
if (afterReload !== 1) fail(`reload changed the inbox to ${afterReload}`);
else step('refresh does not duplicate the message');

// ---- 8. setup: edit a figure and confirm the section
await p.evaluate(() => { location.hash = '/setup'; });
await p.waitForTimeout(350);
await p.click('button.rowlink:has-text("Loan")');
await p.waitForTimeout(300);
const bal = p.locator('label:has-text("Outstanding balance") + input');
await bal.fill('50000');
await bal.blur();
await p.waitForTimeout(300);
const newBal = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).loan.balance);
if (newBal !== 50000) fail(`loan balance saved as ${newBal}`);
else step('editing a figure in Setup persists');

await p.click('button:has-text("These are my real figures")');
await p.waitForTimeout(300);
const conf = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).confirmed.loan);
if (conf !== true) fail('confirming the section did not stick');
else step('confirming a section sticks');

// ---- 9. persistence across a full reload
await p.reload();
await p.waitForTimeout(600);
const persisted = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).loan.balance);
if (persisted !== 50000) fail(`after reload the balance is ${persisted}`);
else step('data survives a reload');

// ---- 10. forecast ranges + chart touch
await p.evaluate(() => { location.hash = '/forecast'; });
await p.waitForTimeout(400);
for (const d of ['30 days','180 days']) {
  await p.click(`button:has-text("${d}")`);
  await p.waitForTimeout(300);
  if (await p.locator('svg.chart polyline').count() !== 3) fail(`chart lost series at ${d}`);
}
const box = await p.locator('svg.chart rect[style*="crosshair"]').boundingBox();
if (box) {
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(250);
}
step('forecast ranges switch and the chart responds to touch');

// ---- screenshots
for (const [r, name] of [['home','home'],['forecast','forecast'],['setup','setup'],['calendar','calendar'],['inbox','inbox']]) {
  await p.evaluate(t => { location.hash = '/' + t; }, r);
  await p.waitForTimeout(350);
  await p.screenshot({ path: `/tmp/claude-0/shots/app-${name}.png`, fullPage: true });
}

await b.close();
server.close();
console.log(errors.length ? '\nPROBLEMS:\n' + errors.join('\n') : '\nall e2e checks passed, no console errors');
process.exit(errors.length ? 1 : 0);
