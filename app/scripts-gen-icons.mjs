import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';

const svg = (size) => `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="0" fill="#0d0d0d"/>
  <circle cx="256" cy="256" r="196" fill="none" stroke="#2a78d6" stroke-width="26"/>
  <path d="M190 150 h86 a66 66 0 0 1 0 132 h-86 z M190 282 h96 a68 68 0 0 1 0 136 h-96 z"
        fill="none" stroke="#f0efec" stroke-width="30" stroke-linejoin="round"/>
  <line x1="160" y1="206" x2="330" y2="206" stroke="#2a78d6" stroke-width="22" stroke-linecap="round"/>
  <line x1="160" y1="352" x2="330" y2="352" stroke="#2a78d6" stroke-width="22" stroke-linecap="round"/>
</svg></body></html>`;

const b = await chromium.launch();
for (const [name, size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]) {
  const ctx = await b.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(svg(size));
  await p.screenshot({ path: 'public/' + name, omitBackground: false });
  await ctx.close();
  console.log('wrote public/' + name);
}
await b.close();
fs.writeFileSync('public/favicon.svg', svg(512).match(/<svg[\s\S]*<\/svg>/)[0]);
console.log('wrote public/favicon.svg');
