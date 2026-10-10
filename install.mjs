#!/usr/bin/env node
// Install the skill into an agent's skills directory with a single command.
//   node install.mjs                      # Codex (default): ~/.codex/skills
//   node install.mjs --target claude      # Claude Code: ~/.claude/skills
//   node install.mjs --target agents      # generic: ~/.agents/skills
//   node install.mjs --target all         # all three user-level directories
//   node install.mjs --target project     # project-level: ./.claude/skills, ./.codeartsdoer/skills
//   node install.mjs --target project --project ../my-app
//   node install.mjs --dir <path>         # any other skills directory (e.g. --dir .github/skills)
//   node install.mjs --force              # overwrite an existing copy of the skill
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
// Project-level skills directories travel with the repository and only apply inside that project.
// These two are the conventions that could be observed on a real machine (.claude/skills exists as a
// user directory; .codeartsdoer/skills is created by CodeArts Doer). For anything else — for example a
// tool that reads .github/skills — pass --dir with that directory; check your tool's own docs.
const PROJECT_TARGETS = ['.claude/skills', '.codeartsdoer/skills'];

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const force = argv.includes('--force');

if (argv.includes('--help')) {
  console.log(`usage: node install.mjs [--target ${Object.keys(TARGETS).join('|')}|all|project] [--project <root>] [--dir <skills-dir>] [--force]\n` +
    `  user-level (--target all installs every one): ${Object.entries(TARGETS).map(([k, v]) => `${k} → ${v}`).join('; ')}\n` +
    `  project-level (--target project, defaults to the current directory): ${PROJECT_TARGETS.join(', ')}\n` +
    `  anything else: --dir <path> (for example --dir .github/skills)`);
  process.exit(0);
}
if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
  console.error(`skill source not found: ${src}\nRun this script from the repository root.`);
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
  else { console.error(`unknown --target: ${t} (use ${Object.keys(TARGETS).join(' / ')} / all / project, or --dir)`); process.exit(1); }
}

let installed = 0;
const projectPaths = PROJECT_TARGETS.map(p => path.join(...p.split('/')));
for (const dir of dirs) {
  const dest = path.join(dir, SKILL_NAME);
  if (fs.existsSync(dest) && !force) {
    console.log(`skipped (already exists): ${dest}\n  add --force to overwrite`);
    continue;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`✓ installed: ${dest}`);
  installed++;
}

if (installed) {
  if (dirs.some(d => projectPaths.some(p => d.endsWith(p)))) {
    console.log('\nNote: project-level skills travel with the repository — `git add` them to commit them, or list them in .gitignore if you do not want them in the repo.');
  }
  console.log(`\nNext step:\n  node "${path.join(dirs[0], SKILL_NAME, 'scripts', 'doctor.js')}"   # dependency check`);
  console.log('Then describe what you want in any agent that supports skills, for example: make a 40-second narrated explainer about the TCP three-way handshake.');
} else {
  console.log('\ninstalled nothing (every destination already exists).');
}
process.exit(installed ? 0 : 1);
