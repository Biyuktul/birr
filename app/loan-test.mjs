import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const root=join(process.cwd(),'dist');
const server=createServer(async(req,res)=>{try{let p=normalize(new URL(req.url,'http://x').pathname).replace(/^(\.\.[/\\])+/,'');if(p==='/')p='/index.html';const f=join(root,p);const b=await readFile(f);res.writeHead(200,{'content-type':T[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4177,r));
const fails=[]; const ok=s=>console.log('  ok '+s); const bad=s=>{fails.push(s);console.log('  ✗ '+s);};
const b=await chromium.launch();
const p=await (await b.newContext({...devices['iPhone 14 Pro']})).newPage();
p.on('pageerror',e=>bad('pageerror: '+e.message));
p.on('console',m=>{if(m.type()==='error')bad('console: '+m.text());});
const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('birr.data.v1')));

await p.goto('http://localhost:4177'); await p.waitForSelector('nav.bottom'); await p.waitForTimeout(400);
// confirm the loan balance today, exactly as Setup does
await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('birr.data.v1'));
  d.loan.balance=78557; d.loan.balanceAsOf=d.meta.asOf; d.loan.manualPayments=[];
  d.accounts.forEach(a=>a.openingDate='2026-01-01');
  localStorage.setItem('birr.data.v1',JSON.stringify(d));});
await p.reload(); await p.waitForTimeout(500);

const d0=await read();
const cbe0=d0.accounts.find(a=>a.id==='cbe').opening;
const total0=d0.accounts.reduce((s,a)=>s+a.opening,0);

await p.evaluate(()=>{location.hash='/loan';}); await p.waitForTimeout(500);
const owedBefore=await p.textContent('.tile .value');
const amt=p.locator('label:has-text("Amount") + input');
await amt.fill(''); await p.keyboard.type('5000',{delay:60}); await p.waitForTimeout(250);
const payBtn=p.locator('button.primary').first();
console.log('  button says: '+(await payBtn.textContent()).trim());
await payBtn.click(); await p.waitForTimeout(600);

const d1=await read();
const owedAfter=await p.textContent('.tile .value');
console.log(`  owed ${owedBefore.trim()} -> ${owedAfter.trim()}`);
if(!owedAfter.includes('73,557')) bad('loan did not drop to Br 73,557');
else ok('loan dropped by the payment');

const tx=d1.transactions.filter(t=>t.category==='Debt');
if(tx.length!==1) bad('no money movement recorded ('+tx.length+')');
else if(tx[0].amount!==-5000) bad('wrong amount: '+tx[0].amount);
else if(tx[0].accountId!=='cbe') bad('came out of the wrong account: '+tx[0].accountId);
else ok('Br 5,000 left CBE');

// everywhere else
await p.evaluate(()=>{location.hash='/home';}); await p.waitForTimeout(500);
const home=await p.textContent('main');
const expTotal=(total0-5000).toLocaleString('en-US');
if(!home.includes(expTotal)) bad('home total is not '+expTotal);
else ok('"everything you have" fell to Br '+expTotal);
if(!home.includes('73,557')) bad('home loan tile does not show 73,557');
else ok('home shows the reduced loan');

await p.evaluate(()=>{location.hash='/more';}); await p.waitForTimeout(450);
const more=await p.textContent('main');
if(!more.includes('73,557')) bad('More does not show the reduced loan');
else ok('More shows the reduced loan');

await p.evaluate(()=>{location.hash='/accounts';}); await p.waitForTimeout(450);
const acc=await p.textContent('main');
if(!acc.includes((cbe0-5000).toLocaleString('en-US'))) bad('CBE balance not reduced on Accounts');
else ok('CBE shows Br '+(cbe0-5000).toLocaleString('en-US'));

// undo
await p.evaluate(()=>{location.hash='/loan';}); await p.waitForTimeout(500);
const rm=p.locator('button:has-text("remove")').first();
if(await rm.count()===0) bad('no remove control');
else{ await rm.click(); await p.waitForTimeout(600);
  const d2=await read();
  if(d2.transactions.filter(t=>t.category==='Debt').length!==0) bad('undo left the money movement behind');
  else if(d2.loan.manualPayments.length!==0) bad('undo left the payment behind');
  else ok('undo puts the debt and the money back'); }

await p.screenshot({path:'/tmp/claude-0/shots/loan.png',fullPage:true});
await b.close(); server.close();
console.log(fails.length?`\n${fails.length} problem(s)`:'\nloan payment verified end to end');
process.exit(fails.length?1:0);
