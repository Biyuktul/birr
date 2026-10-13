/* Render every screen in a stubbed DOM to catch reference/runtime errors
   without needing a browser. */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'dist', 'birr.html'), 'utf8');
const js = src.split('<script>')[1].split('</script>')[0];

const store = {};
const el = () => ({
  innerHTML: '', textContent: '', value: '', style: {},
  setAttribute(){}, getAttribute(){}, querySelector: () => el(),
  getBoundingClientRect: () => ({ left:0, top:0, width:760, height:260 }),
  parentElement: { getBoundingClientRect: () => ({ left:0, top:0, width:760, height:260 }) },
});
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k] = String(v); },
};
global.document = { getElementById: () => el(), addEventListener: () => {}, createElement: el };
global.window = { scrollTo: () => {} };
global.alert = m => { throw new Error('unexpected alert: ' + m); };

const sandbox = {};
const fn = new Function('localStorage','document','window','alert', js + `
  return { VIEWS, render, TABS, setTab: t => { TAB = t; }, E, SEED, STATE,
           parseInbox, markPaid, postpone, skip, commitInbox, setDays,
           get state(){ return STATE; } };`);
const app = fn(global.localStorage, global.document, global.window, global.alert);

let fail = 0;
for (const [id] of app.TABS) {
  try {
    app.setTab(id);
    const out = app.VIEWS[id]();
    if (typeof out !== 'string' || out.length < 50) throw new Error('view returned ' + typeof out + ' len ' + (out||'').length);
    if (/undefined|NaN/.test(out.replace(/undefined"/g,''))) {
      const m = out.match(/.{0,60}(undefined|NaN).{0,60}/);
      throw new Error('rendered "' + m[1] + '": …' + m[0].replace(/\s+/g,' ') + '…');
    }
    console.log(` PASS  ${id} renders (${(out.length/1024).toFixed(1)} KB)`);
  } catch (e) {
    console.log(`*FAIL  ${id}: ${e.message}`);
    fail++;
  }
}

/* exercise the interactions */
try {
  app.setDays(30); app.VIEWS.forecast();
  console.log(' PASS  forecast day-range switch');
} catch (e) { console.log('*FAIL  forecast switch: ' + e.message); fail++; }

console.log(fail === 0 ? '\nall screens render clean' : `\n${fail} screen(s) broken`);
process.exit(fail ? 1 : 0);
