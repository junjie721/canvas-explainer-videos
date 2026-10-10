// 共享工具：定位 Playwright、启动浏览器、定位 ffmpeg（Windows / macOS / Linux）
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const WIN = process.platform === 'win32';

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* 继续尝试全局安装 */ }
  const r = spawnSync('npm root -g', { encoding: 'utf8', shell: true });   // 整条命令走 shell，避免 DEP0190 警告
  const root = (r.stdout || '').trim();
  const tries = root ? [
    path.join(root, 'playwright'),
    path.join(root, '@playwright', 'cli', 'node_modules', 'playwright'),
    path.join(root, '@playwright', 'test', 'node_modules', 'playwright')
  ] : [];
  for (const t of tries) { try { return require(t); } catch (e) { /* 下一个 */ } }
  throw new Error('找不到 playwright：执行 npm i -g playwright（或在当前目录 npm i playwright）');
}

// 依次尝试：Playwright 自带 Chromium → 系统 Edge → 系统 Chrome；可用 PW_CHANNEL 强制指定
async function launchBrowser(chromium) {
  const channels = process.env.PW_CHANNEL ? [process.env.PW_CHANNEL] : [undefined, 'msedge', 'chrome'];
  let last;
  for (const ch of channels) {
    try { return await chromium.launch(ch ? { channel: ch } : {}); } catch (e) { last = e; }
  }
  throw new Error('无法启动浏览器：执行 npx playwright install chromium，或设置 PW_CHANNEL=msedge|chrome\n' + (last && last.message));
}

// ffmpeg 优先用 PATH；找不到时按常见安装位置搜索（winget / choco / scoop / 自定义目录 / *nix 常见 bin）
function findFfmpeg() {
  const exe = n => (WIN ? n + '.exe' : n);
  const works = p => { try { return spawnSync(p, ['-version'], { encoding: 'utf8' }).status === 0; } catch (e) { return false; } };
  const hit = d => {                                  // d 为空串表示直接走 PATH
    const f = d ? path.join(d, exe('ffmpeg')) : exe('ffmpeg');
    if (!works(f)) return null;
    const p = d ? path.join(d, exe('ffprobe')) : exe('ffprobe');
    if (!works(p)) throw new Error(`找到 ${f}，但 ffprobe 不可用：请安装完整版 ffmpeg（ffprobe 需与 ffmpeg 同目录或在 PATH 中）`);
    return { ffmpeg: f, ffprobe: p };
  };
  const inPath = hit('');
  if (inPath) return inPath;

  const dirs = [];
  const add = (...p) => { if (p.every(Boolean)) dirs.push(path.join(...p)); };
  if (WIN) {
    add(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links');
    add(process.env.ProgramData, 'chocolatey', 'bin');
    add(process.env.USERPROFILE, 'scoop', 'shims');
    add(process.env.ProgramFiles, 'ffmpeg', 'bin');
    add(process.env['ProgramFiles(x86)'], 'ffmpeg', 'bin');
    add(process.env.LOCALAPPDATA, 'Programs', 'ffmpeg', 'bin');
    add('C:', 'ffmpeg', 'bin');
  } else dirs.push('/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/snap/bin');
  for (const d of dirs) { const r = hit(d); if (r) return r; }

  // 包管理器把 ffmpeg 埋在多层目录里（如 Packages\<pkg>\<build>\bin），做有上限的递归搜索
  const roots = [
    WIN ? path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages') : '',
    WIN ? path.join(process.env.ProgramData || '', 'chocolatey', 'lib') : ''
  ].filter(d => d && fs.existsSync(d));
  let seen = 0;
  const walk = (d, depth) => {
    if (depth > 4 || ++seen > 4000) return null;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return null; }
    if (ents.some(e => e.isFile() && e.name.toLowerCase() === exe('ffmpeg'))) { const r = hit(d); if (r) return r; }
    for (const e of ents) if (e.isDirectory()) { const r = walk(path.join(d, e.name), depth + 1); if (r) return r; }
    return null;
  };
  for (const r of roots) { const found = walk(r, 0); if (found) return found; }

  throw new Error('找不到 ffmpeg：Windows 执行 winget install Gyan.FFmpeg；macOS 执行 brew install ffmpeg；Linux 用包管理器安装');
}

// 找能跑 edge-tts 的 python：常不在 PATH（Windows 用安装器装到用户目录时尤其常见），补上常见位置
function findPython() {
  const list = ['python', 'python3', 'py'];
  if (WIN) {
    const base = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
    try { for (const d of fs.readdirSync(base)) if (/^Python3/i.test(d)) list.push(path.join(base, d, 'python.exe')); } catch (e) { /* 没有该目录 */ }
  }
  return list;
}
function findEdgeTts() {
  return findPython().find(p => spawnSync(p, ['-c', 'import edge_tts'], { encoding: 'utf8' }).status === 0) || null;
}

// 校验 VIDEO_META 的时间轴：SEG 首尾相接覆盖 0~DURATION、cap 齐全、解说起点落在它描述的那段内
// 返回 [['✗'|'·', 说明], ...]：✗ 视为失败（这些错误不校验就会静默产出错位画面）
function validateTimeline(meta) {
  const segs = meta.segs || [], scale = meta.scale || 1, lead = meta.narrationLead === undefined ? 0.3 : meta.narrationLead;
  if (!segs.length) return [['·', 'VIDEO_META 无 segs 字段（旧模板？），跳过时间轴校验']];
  const out = [], animDur = meta.duration / scale;
  if (Math.abs(segs[0].s) > 1e-6) out.push(['✗', `SEG 首段从 ${segs[0].s}s 开始，应为 0s`]);
  segs.forEach((s, k) => {
    if (s.e <= s.s) out.push(['✗', `SEG #${k + 1} 区间非法：${s.s}s → ${s.e}s`]);
    if (k && Math.abs(s.s - segs[k - 1].e) > 1e-3) out.push(['✗', `SEG #${k} 结束于 ${segs[k - 1].e}s，但 #${k + 1} 从 ${s.s}s 开始（空档或重叠）`]);
    if (k && !String(s.cap).trim()) out.push(['✗', `SEG #${k + 1} 缺 cap 字幕`]);
  });
  const lastE = segs[segs.length - 1].e;
  if (Math.abs(lastE - animDur) > 1e-3) out.push(['✗', `SEG 末段结束于 ${lastE}s，与 DURATION ${animDur}s 不一致`]);
  (meta.narration || []).forEach((n, k) => {
    const at = +((n.start - lead) / scale).toFixed(3);
    if (!segs.some(s => at >= s.s - 1e-3 && at < s.e)) out.push(['✗', `解说 #${k} 起点 ${at}s 不落在任何 SEG 内：${String(n.text).slice(0, 12)}…`]);
  });
  const drift = meta.frames / meta.fps - meta.duration;
  if (Math.abs(drift) > 1 / meta.fps) out.push(['·', `frames/fps=${(meta.frames / meta.fps).toFixed(3)}s 与 duration=${meta.duration}s 相差 ${drift.toFixed(3)}s`]);
  return out;
}

module.exports = { loadPlaywright, launchBrowser, findFfmpeg, findEdgeTts, validateTimeline, WIN };

