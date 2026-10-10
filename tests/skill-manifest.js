#!/usr/bin/env node
// 校验技能包本身：frontmatter、命名、文件完整性、文档与脚本不漂移。
// 不依赖网络、浏览器、Python，CI 里可秒级跑完。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const skillDir = path.join(root, 'making-canvas-explainer-videos');
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };
const read = p => fs.readFileSync(p, 'utf8');

// --- SKILL.md frontmatter ---
const skillMd = path.join(skillDir, 'SKILL.md');
check(fs.existsSync(skillMd), 'making-canvas-explainer-videos/SKILL.md 存在');
const md = read(skillMd);
const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
check(!!fm, 'SKILL.md 有 YAML frontmatter');
const get = key => {
  const m = fm && fm[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const name = get('name');
const desc = get('description');
check(name === path.basename(skillDir), `frontmatter name (${name}) 与目录名一致`);
check(/^[a-z0-9][a-z0-9-]{0,63}$/.test(name), `name 符合规范（小写字母/数字/连字符，<64 字符）：${name}`);
check(desc.length > 40 && desc.length < 1024, `description 长度合适（${desc.length} 字符）`);
check(/when|Use when|用/i.test(desc), 'description 说明了「什么时候用」');
check(/^metadata:\s*$/m.test(fm ? fm[1] : '') || /metadata:/.test(fm ? fm[1] : ''), 'frontmatter 带 metadata');
check(!/TODO|FIXME|XXX|\{\{/.test(md), 'SKILL.md 没有遗留占位符');

// --- 必备文件 ---
for (const f of ['template.html', 'scripts/lib.js', 'scripts/check.js', 'scripts/make-video.js', 'scripts/doctor.js', 'agents/openai.yaml']) {
  check(fs.existsSync(path.join(skillDir, f)), `存在 ${f}`);
}

// --- SKILL.md 里提到的脚本都要真的存在（防止文档漂移） ---
const mentioned = [...md.matchAll(/scripts\/([A-Za-z0-9_.-]+\.js)/g)].map(m => m[1]);
for (const f of new Set(mentioned)) {
  check(fs.existsSync(path.join(skillDir, 'scripts', f)), `SKILL.md 提到的 scripts/${f} 存在`);
}
check(mentioned.length > 0, 'SKILL.md 至少引用了一个脚本');

// --- agents/openai.yaml ---
const yaml = read(path.join(skillDir, 'agents', 'openai.yaml'));
for (const key of ['display_name', 'short_description', 'default_prompt']) {
  const m = yaml.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
  check(!!m, `openai.yaml 有 ${key}`);
  if (m) check(/^["'].*["']$/.test(m[1].trim()), `${key} 用引号包裹`);
}
const dp = (yaml.match(/default_prompt:\s*"(.+)"/) || [])[1] || '';
check(dp.includes(`$${name}`), `default_prompt 显式提到 $${name}`);

// --- 示例工程 ---
const example = path.join(root, 'examples', 'tcp-handshake', 'page.html');
check(fs.existsSync(example), 'examples/tcp-handshake/page.html 存在');
if (fs.existsSync(example)) {
  const page = read(example);
  check(/DURATION = \d+/.test(page) && /SCALE = [\d.]+/.test(page), '示例页含 DURATION / SCALE');
  check(/const NARRATION = \[/.test(page) && /const SEG = \[/.test(page), '示例页含 SEG / NARRATION');
}

console.log(fails.length ? `\n${fails.length} 项未通过` : '\n技能包结构校验通过');
process.exit(fails.length ? 1 : 0);
