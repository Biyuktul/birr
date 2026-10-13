const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const errors = [];
  for (const theme of ['light','dark']) {
    const ctx = await b.newContext({ viewport:{width:900,height:1400}, deviceScaleFactor:2, colorScheme:theme });
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(`[${theme}] ${e.message}`));
    p.on('console', m => { if (m.type()==='error') errors.push(`[${theme}] console: ${m.text()}`); });
    await p.goto('file://' + path.join(__dirname,'dist','birr.html'));
    await p.waitForTimeout(400);
    for (const tab of ['home','forecast','relocation','budget','calendar','checks']) {
      await p.evaluate(t => go(t), tab);
      await p.waitForTimeout(250);
      await p.screenshot({ path: `/tmp/claude-0/shots/${theme}-${tab}.png`, fullPage: tab!=='calendar' });
    }
    await ctx.close();
  }
  // mobile width check for horizontal overflow
  const ctx = await b.newContext({ viewport:{width:390,height:900}, deviceScaleFactor:2 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`[mobile] ${e.message}`));
  await p.goto('file://' + path.join(__dirname,'dist','birr.html'));
  for (const tab of ['home','forecast']) {
    await p.evaluate(t => go(t), tab);
    await p.waitForTimeout(250);
    const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (over) errors.push(`[mobile] horizontal overflow on ${tab}`);
    await p.screenshot({ path: `/tmp/claude-0/shots/mobile-${tab}.png`, fullPage:true });
  }
  await b.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no JS errors, no mobile overflow');
})();
