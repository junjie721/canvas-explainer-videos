#!/usr/bin/env node
// Run `node --check` over every skill script (works on Windows, macOS and Linux CI).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(path.resolve(__dirname, '..'), 'making-canvas-explainer-videos', 'scripts');
const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js')).sort();
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', path.join(scriptsDir, f)], { encoding: 'utf8' });
  console.log(`${r.status === 0 ? '✓' : '✗'} ${f}`);
  if (r.status !== 0) { bad++; console.log((r.stderr || '').trim()); }
}
console.log(bad ? `\n${bad} script(s) have syntax errors` : `\n${files.length} scripts are syntactically valid`);
process.exit(bad ? 1 : 0);
