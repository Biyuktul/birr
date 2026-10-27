import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const root=join(process.cwd(),'dist');
const server=createServer(async(req,res)=>{try{let p=normalize(new URL(req.url,'http://x').pathname).replace(/^(\.\.[/\\])+/,'');if(p==='/')p='/index.html';const f=join(root,p);const b=await readFile(f);res.writeHead(200,{'content-type':T[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4178,r));
const fails=[]; const ok=s=>console.log('  ok '+s); const bad=s=>{fails.push(s);console.log('  ✗ '+s);};
const b=await chromium.launch();
const p=await (await b.newContext({...devices['iPhone 14 Pro']})).newPage();
p.on('pageerror',e=>bad('pageerror: '+e.message));
p.on('console',m=>{if(m.type()==='error')bad('console: '+m.text());});
const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('birr.data.v1')));

await p.goto('http://localhost:4178'); await p.waitForSelector('nav.bottom'); await p.waitForTimeout(400);
await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('birr.data.v1'));
  d.accounts.forEach(a=>a.openingDate='2026-01-01'); localStorage.setItem('birr.data.v1',JSON.stringify(d));});
await p.reload(); await p.waitForTimeout(500);
const d0=await read(); const cbe0=d0.accounts.find(a=>a.id==='cbe').opening;

// ---- lending
await p.evaluate(()=>{location.hash='/lending';}); await p.waitForTimeout(450);
await p.click('button:has-text("Lend money to someone")'); await p.waitForTimeout(350);
await p.fill('label:has-text("To whom") + input','Abebe');
const amt=p.locator('label:has-text("How much") + input');
await amt.fill(''); await p.keyboard.type('2000',{delay:50});
await p.selectOption('label:has-text("Where it came from") + select','cbe');
await p.click('button:has-text("in a month")'); await p.waitForTimeout(250);
const saveBtn=p.locator('button.primary:has-text("Lend")').first();
console.log('  button: '+(await saveBtn.textContent()).trim());
await saveBtn.click(); await p.waitForTimeout(600);

const d1=await read();
if(d1.lending.length!==1) bad('loan not recorded');
else if(d1.lending[0].person!=='Abebe') bad('wrong person');
else if(!d1.lending[0].dueOn) bad('no due date set by the shortcut button');
else ok('lent Br 2,000 to Abebe from CBE, due '+d1.lending[0].dueOn);

const lt=d1.transactions.filter(t=>t.isLending);
if(lt.length!==1||lt[0].amount!==-2000) bad('money did not leave the account');
else ok('Br 2,000 left CBE');

await p.evaluate(()=>{location.hash='/accounts';}); await p.waitForTimeout(450);
const acc=await p.textContent('main');
if(!acc.includes((cbe0-2000).toLocaleString('en-US'))) bad('CBE not reduced');
else ok('CBE shows Br '+(cbe0-2000).toLocaleString('en-US'));

// partial repayment
await p.evaluate(()=>{location.hash='/lending';}); await p.waitForTimeout(450);
await p.click('button.rowlink:has-text("Abebe")'); await p.waitForTimeout(350);
const back=p.locator('label:has-text("Amount coming back") + input');
await back.fill(''); await p.keyboard.type('500',{delay:50}); await p.waitForTimeout(200);
await p.click('button.primary:has-text("Record")'); await p.waitForTimeout(600);
const d2=await read();
const repaid=d2.lending[0].repayments.reduce((s,r)=>s+r.amount,0);
if(repaid!==500) bad('repayment not recorded: '+repaid);
else ok('Br 500 recorded back, Br 1,500 still out');
const txt2=await p.textContent('main');
if(!txt2.includes('1,500')) bad('outstanding not shown as 1,500');
else ok('screen shows Br 1,500 outstanding');

// overdue alert
await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('birr.data.v1'));
  d.lending[0].dueOn='2026-10-01'; localStorage.setItem('birr.data.v1',JSON.stringify(d));});
await p.reload(); await p.waitForTimeout(600);
await p.evaluate(()=>{location.hash='/home';}); await p.waitForTimeout(500);
const home=await p.textContent('main');
if(!/due to return/i.test(home)) bad('no overdue warning on Home');
else ok('Home warns that Abebe is late');

// ---- account purpose
await p.evaluate(()=>{location.hash='/setup';}); await p.waitForTimeout(400);
await p.click('button.rowlink:has-text("Accounts")'); await p.waitForTimeout(400);
const purposeInputs=p.locator('label:has-text("What this account is for") + input');
if(await purposeInputs.count()===0) bad('no purpose field');
else{
  await purposeInputs.nth(3).fill('Coffee');  // Bunna
  await p.waitForTimeout(300);
  const chips=p.locator('.chipset').nth(3).locator('button:has-text("Eating out")');
  if(await chips.count()===0) bad('no category chips');
  else{ await chips.click(); await p.waitForTimeout(400);
    const d3=await read();
    const bunna=d3.accounts.find(a=>a.id==='bunna');
    if(bunna.purpose!=='Coffee') bad('purpose not saved: '+bunna.purpose);
    else if(!(bunna.categories||[]).includes('Eating out')) bad('category not linked');
    else ok('Bunna is now "Coffee", covering Eating out'); }
}
await p.evaluate(()=>{location.hash='/accounts';}); await p.waitForTimeout(450);
const acc2=await p.textContent('main');
if(!/for Coffee/.test(acc2)) bad('purpose not shown on the breakdown');
else ok('breakdown shows "for Coffee"');

for(const r of ['lending','accounts','setup']){ await p.evaluate(x=>{location.hash='/'+x;},r); await p.waitForTimeout(350);
  if(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)) bad('overflow on '+r); }
ok('no horizontal overflow');

await p.evaluate(()=>{location.hash='/lending';}); await p.waitForTimeout(400);
await p.screenshot({path:'/tmp/claude-0/shots/lending.png',fullPage:true});
await b.close(); server.close();
console.log(fails.length?`\n${fails.length} problem(s)`:'\nlending and account purposes verified');
process.exit(fails.length?1:0);
