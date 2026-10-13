#!/usr/bin/env node
/* Inlines seed + engine + parser + tests + ui + css into one
   self-contained birr.html that opens straight from the filesystem. */

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');

const css = read('styles.css');
const js = ['seed.js', 'engine.js', 'parser.js', 'tests.js', 'ui.js']
  .map(f => `\n/* ===== ${f} ===== */\n` + read(f))
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Birr Household Finance</title>
<style>
${css}
</style>
</head>
<body>
<header class="app">
  <div class="inner">
    <div class="brand"><h1>Birr</h1><span class="asof" id="asof"></span></div>
    <nav class="tabs" id="tabs"></nav>
  </div>
</header>
<div class="wrap"><div id="view"></div></div>
<script>
${js}
</script>
</body>
</html>
`;

fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(dir, 'dist', 'birr.html'), html);
console.log(`dist/birr.html written — ${(html.length / 1024).toFixed(0)} KB, no network needed`);
