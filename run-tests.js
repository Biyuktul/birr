const fs = require('fs');
const path = require('path');
// seed.js declares consts at top level; eval it in a scope and capture.
const seedSrc = fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8');
const SEED = eval(seedSrc + '; SEED');
const { makeEngine, money } = require('./engine.js');
const { parseMessage } = require('./parser.js');
const { runTests } = require('./tests.js');

const out = runTests({ makeEngine, parseMessage, SEED });
for (const r of out.results) {
  console.log(`${r.pass ? ' PASS' : '*FAIL'}  ${String(r.n).padStart(2)}. ${r.name}${r.pass ? '' : '\n         -> ' + r.detail}`);
}
console.log(`\n${out.passed}/${out.total} checks passed`);
process.exit(out.allPass ? 0 : 1);
