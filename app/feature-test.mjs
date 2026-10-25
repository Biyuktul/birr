import { chromium, devices } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const root=join(process.cwd(),'dist');
const server=createServer(async(req,res)=>{try{let p=normalize(new URL(req.url,'http://x').pathname).replace(/^(\.\.[/\\])+/,'');if(p==='/')p='/index.html';const f=join(root,p);const b=await readFile(f);res.writeHead(200,{'content-type':T[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4176,r));
const BASE='http://localhost:4176';
const fails=[]; const ok=s=>console.log('  ok '+s); const bad=s=>{fails.push(s);console.log('  ✗ '+s);};
const b=await chromium.launch();
const ctx=await b.newContext({...devices['iPhone 14 Pro']});
const p=await ctx.newPage();
p.on('pageerror',e=>bad('pageerror: '+e.message));
p.on('console',m=>{if(m.type()==='error')bad('console: '+m.text());});
const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('birr.data.v1')));

await p.goto(BASE); await p.waitForSelector('nav.bottom'); await p.waitForTimeout(400);

// make the ekub account opening date old enough that payments move money
await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('birr.data.v1'));
  d.ekub.contributionsPaid=[]; d.accounts.forEach(a=>a.openingDate='2026-01-01');
  localStorage.setItem('birr.data.v1',JSON.stringify(d));});
await p.reload(); await p.waitForTimeout(500);

// 1. Home tile is tappable and lands on the breakdown
await p.evaluate(()=>{location.hash='/home';}); await p.waitForTimeout(400);
const tileBtn=p.locator('button.tile-button:has-text("Everything you have")');
if(await tileBtn.count()===0) bad('"Everything you have" is not tappable');
else { await tileBtn.click(); await p.waitForTimeout(400);
  const h=await p.evaluate(()=>location.hash);
  if(!h.includes('accounts')) bad('tapping the total did not open the breakdown ('+h+')');
  else ok('tapping "Everything you have" opens the breakdown'); }

// 2. the breakdown lists each account with its money
const txt=await p.textContent('main');
for(const n of ['CBE','telebirr','Cash on hand']) if(!txt.includes(n)) bad('breakdown missing '+n);
if(!/Where it sits/.test(txt)) bad('no "Where it sits" section');
else ok('breakdown lists every account and what it holds');

// 3. editing a balance books a correction and changes the total
const before=await read();
const beforeTotal=before.accounts.reduce((s,a)=>s+a.opening,0);
await p.click('button.rowlink:has-text("telebirr")'); await p.waitForTimeout(350);
const balInput=p.locator('label:has-text("actually holds") + input');
if(await balInput.count()===0) bad('no balance field for telebirr');
else{
  await balInput.fill(''); await p.keyboard.type('2000',{delay:60}); await p.waitForTimeout(250);
  const setBtn=p.locator('button:has-text("Set balance")');
  await setBtn.click(); await p.waitForTimeout(500);
  const after=await read();
  const adj=after.transactions.filter(t=>t.isAdjustment);
  if(adj.length!==1) bad('expected 1 correction, got '+adj.length);
  else ok('editing a balance books a correction ('+adj[0].amount+')');
  await p.evaluate(()=>{location.hash='/home';}); await p.waitForTimeout(450);
  const homeTxt=await p.textContent('main');
  const expected=beforeTotal+(2000-before.accounts.find(a=>a.id==='telebirr').opening);
  if(!homeTxt.includes(String(Math.round(expected)).replace(/\B(?=(\d{3})+(?!\d))/g,','))) bad('home total did not follow the correction (wanted '+expected+')');
  else ok('the corrected balance shows in "Everything you have"');
}

// 4. marking an Ekub round paid takes the money out
await p.evaluate(()=>{location.hash='/ekub';}); await p.waitForTimeout(450);
const pre=await read(); const preCash=pre.accounts.find(a=>a.id===pre.ekub.accountId);
const payBtn=p.locator('button:has-text("Mark round")').first();
if(await payBtn.count()===0) bad('no "Mark round N paid" button');
else{
  await payBtn.click(); await p.waitForTimeout(600);
  const post=await read();
  const tx=post.transactions.filter(t=>t.category==='Ekub');
  if(tx.length!==1) bad('ekub payment not recorded as a transaction');
  else if(tx[0].accountId!==post.ekub.accountId) bad('ekub came out of the wrong account');
  else if(tx[0].amount!==-post.ekub.contributionAmount) bad('ekub amount wrong: '+tx[0].amount);
  else ok('marking Ekub paid takes '+Math.abs(tx[0].amount)+' out of '+preCash.name);
  if(post.ekub.contributionsPaid.length!==1) bad('the round did not advance the cycle');
  else ok('and advances the cycle to round '+(post.ekub.contributionsPaid.length+1));
}

// 5. per-round editing exists
const changeBtn=p.locator('.editrow button:has-text("change")').first();
if(await changeBtn.count()===0) bad('no per-round "change" control');
else{ await changeBtn.click(); await p.waitForTimeout(350);
  const t2=await p.textContent('main');
  if(!/Amount paid/.test(t2)||!/Date paid/.test(t2)) bad('round editor missing amount/date fields');
  else ok('each round can have its amount and date changed'); }

// 6. undo puts the money back
await p.evaluate(()=>{location.hash='/ekub';}); await p.waitForTimeout(400);
const cashBefore=await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('birr.data.v1'));return d.transactions.filter(t=>t.category==='Ekub').length;});
const notPaid=p.locator('button:has-text("Mark as not paid")').first();
if(await notPaid.count()>0){ await notPaid.click(); await p.waitForTimeout(500);
  const d=await read();
  if(d.transactions.filter(t=>t.category==='Ekub').length!==cashBefore-1) bad('undo did not remove the payment');
  else ok('undoing a round puts the money back'); }

// 7. no sideways scroll anywhere new
for(const r of ['accounts','ekub']){ await p.evaluate(x=>{location.hash='/'+x;},r); await p.waitForTimeout(350);
  if(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)) bad('horizontal overflow on '+r); }
ok('no horizontal overflow at 393px');

await p.evaluate(()=>{location.hash='/accounts';}); await p.waitForTimeout(400);
await p.screenshot({path:'/tmp/claude-0/shots/feat-accounts.png',fullPage:true});
await p.evaluate(()=>{location.hash='/ekub';}); await p.waitForTimeout(400);
await p.screenshot({path:'/tmp/claude-0/shots/feat-ekub.png',fullPage:true});

await b.close(); server.close();
console.log(fails.length?`\n${fails.length} problem(s)`:'\nall new features verified');
process.exit(fails.length?1:0);
