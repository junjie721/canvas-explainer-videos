#!/usr/bin/env node
// 把"相对计算量"算出来并存档，供视频引用（纯数学，不依赖任何模型或外部数据）
// 注意力里每个 token 都要和序列中每个 token 比较一次，所以计算量按 n² 增长。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = 2048;                                  // 以 2k 上下文为基准 1×
const lengths = [2048, 4096, 8192, 16384, 32768];

const rows = lengths.map(n => ({
  tokens: n,
  label: `${n / 1024}k`,
  relative: Number(((n / BASE) ** 2).toFixed(2)),
  comparisons: n * n
}));

const out = { formula: 'attention work ~ n^2 (each token attends to every token)', base: BASE, rows };
fs.writeFileSync(path.join(here, 'attention-cost.json'), JSON.stringify(out, null, 2) + '\n');

console.log(`base = ${BASE} tokens = 1x`);
for (const r of rows) console.log(`  ${r.label.padStart(4)}  →  ${String(r.relative).padStart(7)}x   (${r.comparisons.toLocaleString('en-US')} comparisons)`);
console.log(`written: ${path.join(here, 'attention-cost.json')}`);
