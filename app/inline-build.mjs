/* Produces one self-contained HTML file from the Vite build, so the app can be
   previewed on a phone with no hosting at all. The real deploy serves dist/ as-is.

   Note: every replacement uses a FUNCTION, never a string. A bundle is full of
   `$&`, `$'` and `$1` sequences, and String.replace treats those as capture-group
   patterns in a string replacement — which silently corrupts the code. */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const dist = 'dist';
let html = await readFile(join(dist, 'index.html'), 'utf8');
const clean = (p) => p.replace(/^\.?\//, '');

/* ---- inline the stylesheet ---- */
const cssTag = /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/;
const cssMatch = html.match(cssTag);
if (!cssMatch) throw new Error('no stylesheet link found in the build output');
const cssCode = await readFile(join(dist, clean(cssMatch[1])), 'utf8');
html = html.replace(cssTag, () => `<style>\n${cssCode}\n</style>`);

/* ---- inline the module script ---- */
const jsTag = /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/;
const jsMatch = html.match(jsTag);
if (!jsMatch) throw new Error('no module script found in the build output');
let jsCode = await readFile(join(dist, clean(jsMatch[1])), 'utf8');
// A literal </script> anywhere in the bundle would close the tag early.
jsCode = jsCode.replace(/<\/script>/gi, () => '<\\/script>');
html = html.replace(jsTag, () => `<script type="module">\n${jsCode}\n</script>`);

/* ---- inline the icons so the home-screen icon survives ---- */
const icon = await readFile('public/apple-touch-icon.png');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>/,
  () => `<link rel="apple-touch-icon" href="data:image/png;base64,${icon.toString('base64')}" />`);
const fav = await readFile('public/favicon.svg', 'utf8');
html = html.replace(/<link rel="icon"[^>]*>/,
  () => `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${Buffer.from(fav).toString('base64')}" />`);

/* ---- strip what a single file cannot use ---- */
html = html.replace(/<link rel="manifest"[^>]*>/g, () => '');
html = html.replace(/<script[^>]*vite-plugin-pwa:register-sw[^>]*><\/script>/g, () => '');
html = html.replace(/<link rel="modulepreload"[^>]*>/g, () => '');
html = html.replace(/<title>.*?<\/title>/, () => '<title>Birr Household Finance</title>');

/* ---- nothing external may remain, or it breaks offline ---- */
const leftovers = [...html.matchAll(/(?:src|href)="(?!data:)([^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !u.startsWith('#'));
if (leftovers.length) throw new Error('still references external files: ' + leftovers.join(', '));

await mkdir('preview', { recursive: true });
await writeFile(join('preview', 'birr.html'), html);
console.log(`preview/birr.html — ${(html.length / 1024).toFixed(0)} KB, nothing external`);
