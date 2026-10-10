#!/usr/bin/env node
// 验证 install.mjs 的安装/跳过/覆盖/自定义目录行为（不碰真实用户目录，全部在临时目录里做）
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
  check(r0.status === 0 && /--target/.test(r0.stdout), '--help 可用且说明参数');

  // 项目级安装（默认目录来自 --project）
  const r1 = run(['--target', 'project', '--project', tmp]);
  check(r1.status === 0, '项目级安装返回 0');
  check(hasSkill(path.join(tmp, '.claude', 'skills')), '装到 .claude/skills');
  check(hasSkill(path.join(tmp, '.codeartsdoer', 'skills')), '装到 .codeartsdoer/skills');

  // 重复安装：跳过且返回非 0
  const r2 = run(['--target', 'project', '--project', tmp]);
  check(r2.status !== 0 && /跳过/.test(r2.stdout), '重复安装会跳过并返回非 0（不静默覆盖）');
  check(hasSkill(path.join(tmp, '.claude', 'skills')), '跳过时原文件仍在');

  // --force 覆盖
  const r3 = run(['--target', 'project', '--project', tmp, '--force']);
  check(r3.status === 0 && /已安装/.test(r3.stdout), '--force 覆盖安装成功');

  // 自定义目录
  const custom = path.join(tmp, 'somewhere', 'skills');
  const r4 = run(['--dir', custom]);
  check(r4.status === 0 && hasSkill(custom), '--dir 自定义目录可用');

  // 错误参数
  const r5 = run(['--target', 'nope']);
  check(r5.status !== 0 && /未知的 --target/.test(r5.stderr), '未知 --target 会报错');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(fails.length ? `\n${fails.length} 项未通过` : '\n安装脚本行为符合预期');
process.exit(fails.length ? 1 : 0);
