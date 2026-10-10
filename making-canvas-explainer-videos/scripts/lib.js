// Shared helpers: locate Playwright, launch a browser, locate ffmpeg (Windows / macOS / Linux).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const WIN = process.platform === 'win32';

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through to the global install */ }
  const r = spawnSync('npm root -g', { encoding: 'utf8', shell: true });   // through the shell, avoids the DEP0190 warning
  const root = (r.stdout || '').trim();
  const tries = root ? [
    path.join(root, 'playwright'),
    path.join(root, '@playwright', 'cli', 'node_modules', 'playwright'),
    path.join(root, '@playwright', 'test', 'node_modules', 'playwright')
  ] : [];
  for (const t of tries) { try { return require(t); } catch (e) { /* try the next one */ } }
  throw new Error('playwright not found: run `npm i -g playwright` (or `npm i playwright` in this directory)');
}

// Try in order: Playwright's bundled Chromium → system Edge → system Chrome. PW_CHANNEL forces one.
async function launchBrowser(chromium) {
  const channels = process.env.PW_CHANNEL ? [process.env.PW_CHANNEL] : [undefined, 'msedge', 'chrome'];
  let last;
  for (const ch of channels) {
    try { return await chromium.launch(ch ? { channel: ch } : {}); } catch (e) { last = e; }
  }
  throw new Error('could not launch a browser: run `npx playwright install chromium`, or set PW_CHANNEL=msedge|chrome\n' + (last && last.message));
}

// ffmpeg comes from PATH first; otherwise search the locations package managers use.
function findFfmpeg() {
  const exe = n => (WIN ? n + '.exe' : n);
  const works = p => { try { return spawnSync(p, ['-version'], { encoding: 'utf8' }).status === 0; } catch (e) { return false; } };
  const hit = d => {                                  // empty string means "look on PATH"
    const f = d ? path.join(d, exe('ffmpeg')) : exe('ffmpeg');
    if (!works(f)) return null;
    const p = d ? path.join(d, exe('ffprobe')) : exe('ffprobe');
    if (!works(p)) throw new Error(`found ${f} but ffprobe is not usable: install a full ffmpeg build (ffprobe must sit next to ffmpeg, or be on PATH)`);
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

  // Package managers bury ffmpeg several levels deep (e.g. Packages\<pkg>\<build>\bin), so walk with a budget.
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

  throw new Error('ffmpeg not found: on Windows run `winget install Gyan.FFmpeg`; on macOS `brew install ffmpeg`; on Linux use your package manager');
}

// Find a python that can run edge-tts. `python` is often missing from PATH, especially on Windows
// user installs, so the usual install locations are added to the candidate list.
function findPython() {
  const list = ['python', 'python3', 'py'];
  if (WIN) {
    const base = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
    try { for (const d of fs.readdirSync(base)) if (/^Python3/i.test(d)) list.push(path.join(base, d, 'python.exe')); } catch (e) { /* no such directory */ }
  }
  return list;
}
function findEdgeTts() {
  return findPython().find(p => spawnSync(p, ['-c', 'import edge_tts'], { encoding: 'utf8' }).status === 0) || null;
}

// Validate VIDEO_META's timeline: the SEGs must tile 0..DURATION without gaps, every SEG except the
// intro needs a caption, and every narration line must start inside the segment it describes.
// Returns [['✗'|'·', message], ...]; '✗' counts as a failure — unchecked, these problems silently
// produce wrong captions, colours and panel values while the export still looks fine.
function validateTimeline(meta) {
  const segs = meta.segs || [], scale = meta.scale || 1, lead = meta.narrationLead === undefined ? 0.3 : meta.narrationLead;
  if (!segs.length) return [['·', 'VIDEO_META has no `segs` (old template?), skipping timeline validation']];
  const out = [], animDur = meta.duration / scale;
  if (Math.abs(segs[0].s) > 1e-6) out.push(['✗', `SEG #1 starts at ${segs[0].s}s, expected 0s`]);
  segs.forEach((s, k) => {
    if (s.e <= s.s) out.push(['✗', `SEG #${k + 1} has an invalid range: ${s.s}s → ${s.e}s`]);
    if (k && Math.abs(s.s - segs[k - 1].e) > 1e-3) out.push(['✗', `SEG #${k} ends at ${segs[k - 1].e}s but #${k + 1} starts at ${s.s}s (gap or overlap)`]);
    if (k && !String(s.cap).trim()) out.push(['✗', `SEG #${k + 1} has no caption (cap)`]);
  });
  const lastE = segs[segs.length - 1].e;
  if (Math.abs(lastE - animDur) > 1e-3) out.push(['✗', `last SEG ends at ${lastE}s, which does not match DURATION ${animDur}s`]);
  (meta.narration || []).forEach((n, k) => {
    const at = +((n.start - lead) / scale).toFixed(3);
    if (!segs.some(s => at >= s.s - 1e-3 && at < s.e)) out.push(['✗', `narration #${k} starts at ${at}s, outside every SEG: ${String(n.text).slice(0, 12)}…`]);
  });
  const drift = meta.frames / meta.fps - meta.duration;
  if (Math.abs(drift) > 1 / meta.fps) out.push(['·', `frames/fps=${(meta.frames / meta.fps).toFixed(3)}s differs from duration=${meta.duration}s by ${drift.toFixed(3)}s`]);
  return out;
}

module.exports = { loadPlaywright, launchBrowser, findFfmpeg, findEdgeTts, validateTimeline, WIN };
