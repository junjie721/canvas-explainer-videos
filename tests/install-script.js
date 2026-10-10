#!/usr/bin/env node
// Check install.mjs: install / skip / force / custom directory. Everything happens in a temp
// directory — the real user skill directories are never touched.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const installer = path.join(root, 'install.mjs');
const SKILL = 'making-canvas-explainer-videos';
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };
const run = args => spawnSync(process.execPath, [installer, ...args], { encoding: 'utf8' });
const hasSkill = dir => fs.existsSync(path.join(dir, SKILL, 'SKILL.md')) && fs.existsSync(path.join(dir, SKILL, 'scripts', 'make-video.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-install-test-'));
try {
  const r0 = run(['--help']);
  check(r0.status === 0 && /--target/.test(r0.stdout), '--help works and documents the flags');

  // project-level install (directory comes from --project)
  const r1 = run(['--target', 'project', '--project', tmp]);
  check(r1.status === 0, 'project install exits 0');
  check(hasSkill(path.join(tmp, '.claude', 'skills')), 'installed into .claude/skills');
  check(hasSkill(path.join(tmp, '.codeartsdoer', 'skills')), 'installed into .codeartsdoer/skills');

  // installing twice skips instead of silently overwriting
  const r2 = run(['--target', 'project', '--project', tmp]);
  check(r2.status !== 0 && /skip/i.test(r2.stdout), 'second install skips and exits non-zero (no silent overwrite)');
  check(hasSkill(path.join(tmp, '.claude', 'skills')), 'skipped install left the existing files alone');

  // --force overwrites
  const r3 = run(['--target', 'project', '--project', tmp, '--force']);
  check(r3.status === 0 && /install/i.test(r3.stdout), '--force overwrites');

  // custom destination
  const custom = path.join(tmp, 'somewhere', 'skills');
  const r4 = run(['--dir', custom]);
  check(r4.status === 0 && hasSkill(custom), '--dir installs into a custom directory');

  // bad argument
  const r5 = run(['--target', 'nope']);
  check(r5.status !== 0 && /unknown --target/i.test(r5.stderr), 'an unknown --target fails with a clear message');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(fails.length ? `\n${fails.length} check(s) failed` : '\ninstall script behaves as expected');
process.exit(fails.length ? 1 : 0);
