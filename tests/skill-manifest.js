#!/usr/bin/env node
// Validate the skill package itself: frontmatter, naming, required files, and that the docs
// and the scripts have not drifted apart. No network, no browser, no Python — runs in seconds.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const skillDir = path.join(root, 'making-canvas-explainer-videos');
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };
const read = p => fs.readFileSync(p, 'utf8');

// --- SKILL.md frontmatter ---
const skillMd = path.join(skillDir, 'SKILL.md');
check(fs.existsSync(skillMd), 'making-canvas-explainer-videos/SKILL.md exists');
const md = read(skillMd);
const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
check(!!fm, 'SKILL.md has YAML frontmatter');
const get = key => {
  const m = fm && fm[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
};
const name = get('name');
const desc = get('description');
check(name === path.basename(skillDir), `frontmatter name (${name}) matches the directory name`);
check(/^[a-z0-9][a-z0-9-]{0,63}$/.test(name), `name follows the rules (lowercase, digits, hyphens, <64 chars): ${name}`);
check(desc.length > 40 && desc.length < 1024, `description length is reasonable (${desc.length} chars)`);
check(/\bwhen\b|Use when/i.test(desc), 'description states when to use the skill');
check(/metadata:/.test(fm ? fm[1] : ''), 'frontmatter carries metadata');
check(!/TODO|FIXME|XXX|\{\{/.test(md), 'SKILL.md has no leftover placeholders');

// --- required files ---
for (const f of ['template.html', 'scripts/lib.js', 'scripts/check.js', 'scripts/make-video.js', 'scripts/doctor.js', 'agents/openai.yaml']) {
  check(fs.existsSync(path.join(skillDir, f)), `exists: ${f}`);
}

// --- every script mentioned in SKILL.md must really exist (catches doc drift) ---
const mentioned = [...md.matchAll(/scripts\/([A-Za-z0-9_.-]+\.js)/g)].map(m => m[1]);
for (const f of new Set(mentioned)) {
  check(fs.existsSync(path.join(skillDir, 'scripts', f)), `scripts/${f} referenced by SKILL.md exists`);
}
check(mentioned.length > 0, 'SKILL.md references at least one script');

// --- agents/openai.yaml ---
const yaml = read(path.join(skillDir, 'agents', 'openai.yaml'));
for (const key of ['display_name', 'short_description', 'default_prompt']) {
  const m = yaml.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
  check(!!m, `openai.yaml has ${key}`);
  if (m) check(/^["'].*["']$/.test(m[1].trim()), `${key} is quoted`);
}
const dp = (yaml.match(/default_prompt:\s*"(.+)"/) || [])[1] || '';
check(dp.includes(`$${name}`), `default_prompt mentions $${name}`);

// --- example project ---
const example = path.join(root, 'examples', 'tcp-handshake', 'page.html');
check(fs.existsSync(example), 'examples/tcp-handshake/page.html exists');
if (fs.existsSync(example)) {
  const page = read(example);
  check(/DURATION = \d+/.test(page) && /SCALE = [\d.]+/.test(page), 'example defines DURATION / SCALE');
  check(/const NARRATION = \[/.test(page) && /const SEG = \[/.test(page), 'example defines SEG / NARRATION');
}

console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nskill package structure is valid');
process.exit(fails.length ? 1 : 0);
