import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { join } from 'node:path';
const errors = [];
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14 Pro'], colorScheme: 'dark' });
const p = await ctx.newPage();
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await p.goto('file://' + join(process.cwd(), 'preview', 'birr.html'));
await p.waitForSelector('nav.bottom', { timeout: 5000 });
for (const r of ['home','calendar','inbox','forecast','more','setup','checks','forecast']) {
  await p.evaluate(t => { location.hash = '/' + t; }, r);
  await p.waitForTimeout(260);
  const t = await p.textContent('main');
  if (!t || t.length < 40) errors.push(`${r} blank`);
}
await p.evaluate(() => { location.hash = '/checks'; });
await p.waitForTimeout(400);
const checks = (await p.textContent('.hero')).trim();
if (!/^(\d+) of \1 pass$/.test(checks)) errors.push(`checks: ${checks}`);
const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (over) errors.push('horizontal overflow');
await p.evaluate(() => { location.hash = '/home'; });
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/claude-0/shots/preview-home.png' });
await b.close();
console.log(errors.length ? 'PROBLEMS:\n' + errors.join('\n') : `single-file preview works offline — self-test ${checks}`);
process.exit(errors.length ? 1 : 0);
