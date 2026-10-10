#!/usr/bin/env node
// 对所有技能脚本跑 node --check（跨平台，CI 的 Windows/macOS/Linux 都能用）
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
console.log(bad ? `\n${bad} 个脚本有语法错误` : `\n${files.length} 个脚本语法正确`);
process.exit(bad ? 1 : 0);
