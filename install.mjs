#!/usr/bin/env node
// 一条命令把技能装进某个 agent 的技能目录。
//   node install.mjs                      # 默认 Codex：~/.codex/skills
//   node install.mjs --target claude      # Claude Code：~/.claude/skills
//   node install.mjs --target agents      # 通用 agents 目录：~/.agents/skills
//   node install.mjs --target all         # 以上三个都装
//   node install.mjs --target project     # 装进当前项目的项目级技能目录（.claude/skills、.codeartsdoer/skills）
//   node install.mjs --target project --project ../my-app
//   node install.mjs --dir <path>         # 自定义技能目录
//   node install.mjs --force              # 目标已存在同名技能时覆盖
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILL_NAME = 'making-canvas-explainer-videos';
const src = path.join(here, SKILL_NAME);
const home = os.homedir();

const TARGETS = {
  codex: path.join(home, '.codex', 'skills'),
  claude: path.join(home, '.claude', 'skills'),
  agents: path.join(home, '.agents', 'skills')
};
// 项目级技能目录：跟着仓库走，只在项目里生效。
// 这两个是能在本机观察到实际约定的（.claude/skills 目录已存在；.codeartsdoer/skills 由 CodeArts Doer 自动创建）。
// 其他工具（如 GitHub Copilot）若支持项目级技能，用 --dir <它的目录> 指定即可，以官方文档为准。
const PROJECT_TARGETS = ['.claude/skills', '.codeartsdoer/skills'];

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const force = argv.includes('--force');

if (argv.includes('--help')) {
  console.log(`用法: node install.mjs [--target ${Object.keys(TARGETS).join('|')}|all|project] [--project <项目根>] [--dir <技能目录>] [--force]\n` +
    `  用户级（--target all 装全部）：${Object.entries(TARGETS).map(([k, v]) => `${k} → ${v}`).join('；')}\n` +
    `  项目级（--target project，默认当前目录）：${PROJECT_TARGETS.join('、')}\n` +
    `  其他目录：--dir <path>（例如 --dir .github/skills）`);
  process.exit(0);
}
if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
  console.error(`找不到技能本体：${src}\n请在仓库根目录运行本脚本。`);
  process.exit(1);
}

const dirs = [];
const custom = opt('--dir');
if (custom) dirs.push(path.resolve(custom));
else {
  const t = String(opt('--target', 'codex')).toLowerCase();
  if (t === 'all') dirs.push(...Object.values(TARGETS));
  else if (t === 'project' || t === 'project-level') {
    const root = path.resolve(opt('--project', process.cwd()));
    dirs.push(...PROJECT_TARGETS.map(d => path.join(root, d)));
  }
  else if (TARGETS[t]) dirs.push(TARGETS[t]);
  else { console.error(`未知的 --target: ${t}（可选 ${Object.keys(TARGETS).join(' / ')} / all / project，或改用 --dir）`); process.exit(1); }
}

let installed = 0;
for (const dir of dirs) {
  const dest = path.join(dir, SKILL_NAME);
  if (fs.existsSync(dest) && !force) {
    console.log(`跳过（已存在）：${dest}\n  要覆盖请加 --force`);
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`✓ 已安装：${dest}`);
  installed++;
}

if (installed) {
  if (dirs.some(d => PROJECT_TARGETS.some(p => d.endsWith(path.join(...p.split('/')))))) {
    console.log('\n提示：项目级技能是跟着仓库走的——想让它随项目一起提交就 git add，不想提交就把它加进 .gitignore。');
  }
  console.log(`\n下一步：\n  node "${path.join(dirs[0], SKILL_NAME, 'scripts', 'doctor.js')}"   # 依赖自检`);
  console.log('然后在支持 skills 的 agent 里描述需求，例如：用 making-canvas-explainer-videos 做一条 40 秒的中文解说短片。');
} else {
  console.log('\n没有安装任何技能（目标都已存在）。');
}
process.exit(installed ? 0 : 1);
