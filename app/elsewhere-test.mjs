import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const root=join(process.cwd(),'dist');
const server=createServer(async(req,res)=>{try{let p=normalize(new URL(req.url,'http://x').pathname).replace(/^(\.\.[/\\])+/,'');if(p==='/')p='/index.html';const f=join(root,p);const b=await readFile(f);res.writeHead(200,{'content-type':T[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4179,r));
const fails=[]; const ok=s=>console.log('  ok '+s); const bad=s=>{fails.push(s);console.log('  ✗ '+s);};
const b=await chromium.launch();
const p=await (await b.newContext({...devices['iPhone 14 Pro']})).newPage();
p.on('pageerror',e=>bad('pageerror: '+e.message));
p.on('console',m=>{if(m.type()==='error')bad('console: '+m.text());});
const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('birr.data.v1')));

await p.goto('http://localhost:4179'); await p.waitForSelector('nav.bottom'); await p.waitForTimeout(400);
const d0=await read(); const total0=d0.accounts.reduce((s,a)=>s+a.opening,0);

await p.evaluate(()=>{location.hash='/lending';}); await p.waitForTimeout(450);
await p.click('button:has-text("Lend money to someone")'); await p.waitForTimeout(350);
await p.fill('label:has-text("To whom") + input','Kebede');
const amt=p.locator('label:has-text("How much") + input');
await amt.fill(''); await p.keyboard.type('3000',{delay:50});
await p.selectOption('label:has-text("Where it came from") + select','__elsewhere__');
await p.waitForTimeout(300);

const srcField=p.locator('label:has-text("Where from") + input');
if(await srcField.count()===0) bad('no "where from" field appeared');
else{ await srcField.fill('cash I was holding'); ok('"where from" field appears for outside money'); }

const note=await p.textContent('.muted:has-text("None of your balances")').catch(()=>null);
if(!note) bad('no explanation that balances will not change');
else ok('says plainly: none of your balances change');

await p.locator('button.primary:has-text("Lend")').first().click(); await p.waitForTimeout(600);

const d1=await read();
if(d1.lending.length!==1) bad('not recorded');
else if(d1.lending[0].accountId!==null) bad('accountId should be null, got '+d1.lending[0].accountId);
else if(d1.lending[0].source!=='cash I was holding') bad('source not saved');
else ok('recorded with no account, source "cash I was holding"');
if(d1.transactions.filter(t=>t.isLending).length!==0) bad('it booked a movement it should not have');
else ok('no money movement booked');

await p.evaluate(()=>{location.hash='/home';}); await p.waitForTimeout(500);
const home=await p.textContent('main');
if(!home.includes(total0.toLocaleString('en-US'))) bad('total changed when it should not have');
else ok('"everything you have" unchanged at Br '+total0.toLocaleString('en-US'));

await p.evaluate(()=>{location.hash='/lending';}); await p.waitForTimeout(450);
const lend=await p.textContent('main');
if(!/3,000/.test(lend)) bad('not shown as owed');
else ok('still shown as Br 3,000 owed back');
if(!/cash I was holding/.test(lend)) bad('source not displayed');
else ok('shows it came from "cash I was holding"');

// repay into a real account — a genuine gain
await p.click('button.rowlink:has-text("Kebede")'); await p.waitForTimeout(400);
await p.selectOption('label:has-text("Back into") + select','cbe'); await p.waitForTimeout(250);
await p.locator('button.primary:has-text("Paid back in full")').click(); await p.waitForTimeout(600);
const d2=await read();
const cbeTx=d2.transactions.filter(t=>t.isLending&&t.amount>0);
if(cbeTx.length!==1||cbeTx[0].amount!==3000) bad('repayment into CBE not booked');
else ok('repaid into CBE as a real Br 3,000 gain');

for(const r of ['lending','home','accounts']){ await p.evaluate(x=>{location.hash='/'+x;},r); await p.waitForTimeout(300);
  if(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)) bad('overflow on '+r); }
ok('no horizontal overflow');

await b.close(); server.close();
console.log(fails.length?`\n${fails.length} problem(s)`:'\nlending from outside your accounts verified');
process.exit(fails.length?1:0);
