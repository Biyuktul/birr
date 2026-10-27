import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const root=join(process.cwd(),'dist');
const server=createServer(async(req,res)=>{try{let p=normalize(new URL(req.url,'http://x').pathname).replace(/^(\.\.[/\\])+/,'');if(p==='/')p='/index.html';const f=join(root,p);const b=await readFile(f);res.writeHead(200,{'content-type':T[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4180,r));
const fails=[]; const ok=s=>console.log('  ok '+s); const bad=s=>{fails.push(s);console.log('  ✗ '+s);};
const b=await chromium.launch();
const p=await (await b.newContext({...devices['iPhone 14 Pro']})).newPage();
p.on('pageerror',e=>bad('pageerror: '+e.message));
p.on('console',m=>{if(m.type()==='error')bad('console: '+m.text());});

await p.goto('http://localhost:4180'); await p.waitForSelector('nav.bottom'); await p.waitForTimeout(400);
// seed several months of real-looking spending
await p.evaluate(()=>{
  const d=JSON.parse(localStorage.getItem('birr.data.v1'));
  d.accounts.forEach(a=>a.openingDate='2026-01-01');
  const tx=[]; let n=0;
  const add=(date,amt,cat)=>tx.push({id:'s'+(n++),date,accountId:'cbe',amount:-amt,category:cat,note:cat,isTransfer:false,source:'manual'});
  for(const [m,child,groc] of [['08',1200,3400],['09',800,3900],['10',1500,2800]]){
    add(`2026-${m}-05`,child,'Child');
    add(`2026-${m}-12`,groc,'Groceries');
    add(`2026-${m}-18`,600,'Transport');
  }
  add('2026-10-26',250,'Eating out'); add('2026-10-27',180,'Transport');
  // things that must NOT count
  add('2026-10-27',9000,'Other'); tx[tx.length-1].isTransfer=true;
  d.transactions=tx;
  localStorage.setItem('birr.data.v1',JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(600);

// tab bar
const tabs=await p.$$eval('nav.bottom button',e=>e.map(x=>x.textContent.trim()));
if(tabs.some(t=>/forecast/i.test(t))) bad('Forecast is still a tab');
else if(!tabs.some(t=>/spending/i.test(t))) bad('Spending is not a tab');
else ok('tab bar is '+tabs.join(' · '));

await p.click('nav.bottom button:has-text("Spending")'); await p.waitForTimeout(600);
let txt=await p.textContent('main');
// 1500 + 2800 + 600 + 250 + 180 = 5330. The 9,000 transfer must NOT be in it.
if(!/5,330/.test(txt)) bad('October total should be Br 5,330; got: '+txt.slice(0,120));
else if(/14,330/.test(txt)) bad('the 9,000 transfer was counted as spending');
else ok('October shows Br 5,330 — the 9,000 transfer excluded');

if(!/Child/.test(txt)) bad('no category breakdown');
else ok('breakdown lists categories');

// daily
await p.click('button:has-text("Daily")'); await p.waitForTimeout(500);
txt=await p.textContent('main');
if(!/180/.test(txt)) bad('today (Br 180) not shown in Daily');
else ok('Daily shows today at Br 180');

// weekly
await p.click('button:has-text("Weekly")'); await p.waitForTimeout(500);
txt=await p.textContent('main');
if(!/430/.test(txt)) bad('this week (250+180=430) not shown');
else ok('Weekly shows Br 430 for the week so far');

// monthly + child drill-down
await p.click('button:has-text("Monthly")'); await p.waitForTimeout(500);
await p.click('button.rowlink:has-text("Child")'); await p.waitForTimeout(500);
txt=await p.textContent('main');
if(!/per month/.test(txt)) bad('no per-month trend for Child');
else ok('Child opens a month-by-month trend');
if(!/averaging/.test(txt)) bad('no average for the category');
else ok('shows what Child averages a month');
if(!/What made it up/.test(txt)) bad('no transaction list behind the figure');
else ok('lists the transactions behind the figure');

// bars respond
const bars=await p.$$('svg.chart g');
if(bars.length<3) bad('no bars drawn');
else { await bars[1].click(); await p.waitForTimeout(500);
  ok('tapping a bar selects that period'); }

// forecast still reachable
await p.evaluate(()=>{location.hash='/more';}); await p.waitForTimeout(400);
const more=await p.textContent('main');
if(!/Forecast/.test(more)) bad('Forecast not reachable from More');
else ok('Forecast still reachable under More');
await p.evaluate(()=>{location.hash='/forecast';}); await p.waitForTimeout(500);
if(!/three ways it could go/i.test(await p.textContent('main'))) bad('Forecast screen broken');
else ok('Forecast screen still works');

for(const r of ['spending','forecast']){ await p.evaluate(x=>{location.hash='/'+x;},r); await p.waitForTimeout(350);
  if(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)) bad('overflow on '+r); }
ok('no horizontal overflow');

await p.evaluate(()=>{location.hash='/spending';}); await p.waitForTimeout(500);
await p.screenshot({path:'/tmp/claude-0/shots/spending.png',fullPage:true});
await b.close(); server.close();
console.log(fails.length?`\n${fails.length} problem(s)`:'\nspending analysis verified');
process.exit(fails.length?1:0);
