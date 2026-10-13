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
await new Promise(r => server.listen(4174, r));

const fails = [];
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'] });
const p = await ctx.newPage();
await p.goto('http://localhost:4174/#/setup');
await p.waitForSelector('nav.bottom');
await p.waitForTimeout(400);

// open the Accounts section
await p.click('button.rowlink:has-text("Accounts")');
await p.waitForTimeout(350);

// type into the first opening-balance field, one key at a time
const sel = 'label:has-text("Opening balance") + input';
const input = p.locator(sel).first();
await input.click();
await input.fill('');          // start from an empty box, or typing appends
await p.waitForTimeout(150);

const focusedBefore = await p.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.type||''));
await p.keyboard.type('98765', { delay: 90 });
await p.waitForTimeout(300);

const focusedAfter = await p.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.type||''));
const value = await input.inputValue();
const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('birr.data.v1')).accounts[0].opening);

console.log(`focus before typing : ${focusedBefore}`);
console.log(`focus after typing  : ${focusedAfter}`);
console.log(`field shows         : "${value}"`);
console.log(`stored value        : ${stored}`);

if (focusedAfter !== focusedBefore) fails.push(`FOCUS LOST while typing (was ${focusedBefore}, now ${focusedAfter})`);
if (value !== '98765') fails.push(`field should read "98765" but reads "${value}"`);
if (stored !== 98765) fails.push(`stored value should be 98765 but is ${stored}`);

// decimals must survive being typed
await p.evaluate(() => { location.hash = '/setup'; });
await p.waitForTimeout(200);
const b2 = p.locator('label:has-text("Buffer you never spend") + input');
await p.click('button.rowlink:has-text("Settings, backup and reset")');
await p.waitForTimeout(300);
if (await b2.count()) {
  await b2.click();
  await b2.fill('');
  await p.keyboard.type('12.5', { delay: 90 });
  await p.waitForTimeout(250);
  const v2 = await b2.inputValue();
  if (v2 !== '12.5') fails.push(`decimal typing mangled: field reads "${v2}" instead of "12.5"`);
  else console.log('decimal typing   : ok ("12.5")');
}

await b.close(); server.close();
console.log(fails.length ? '\nFAILURES:\n' + fails.map(f => ' ✗ ' + f).join('\n') : '\nfocus and typing are fine');
process.exit(fails.length ? 1 : 0);
