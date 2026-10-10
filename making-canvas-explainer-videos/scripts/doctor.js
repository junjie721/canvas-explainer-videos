#!/usr/bin/env node
// Dependency check: says exactly what is missing and how to install it. Run this before the first
// export instead of finding out halfway through one.
// Usage: node doctor.js [--browser]    --browser actually launches a browser (slower) to prove it works.
const { spawnSync } = require('child_process');
const { loadPlaywright, launchBrowser, findFfmpeg, findEdgeTts, WIN } = require('./lib');

const rows = [], tips = [], missing = [];
function row(mark, name, state, tip) {
  rows.push([mark, name, state]);
  if (mark === '✗') { missing.push(name); if (tip) tips.push(tip); }
}

(async () => {
  row('✓', 'node', process.version);

  let pw = null;
  try { pw = loadPlaywright(); row('✓', 'playwright', 'installed'); }
  catch (e) { row('✗', 'playwright', 'not installed (needed for export and self-check)', 'npm i -g playwright'); }

  if (pw && process.argv.includes('--browser')) {
    try { const b = await launchBrowser(pw.chromium); row('✓', 'browser', 'launches'); await b.close(); }
    catch (e) { row('✗', 'browser', String(e.message).split('\n')[0], 'set PW_CHANNEL=msedge (or chrome) and retry'); }
  } else if (pw) row('·', 'browser', 'not checked (add --browser to verify)');

  try {
    const f = findFfmpeg();
    const v = String(spawnSync(f.ffmpeg, ['-version'], { encoding: 'utf8' }).stdout || '').split('\n')[0]
      .replace(/^ffmpeg version\s*/, '').split(' Copyright')[0].trim();
    row('✓', 'ffmpeg', v + '  ·  ' + f.ffmpeg);
  } catch (e) { row('✗', 'ffmpeg', String(e.message).split('\n')[0], WIN ? 'winget install Gyan.FFmpeg' : 'brew install ffmpeg (macOS) / apt install ffmpeg (Linux)'); }

  const py = findEdgeTts();
  if (py) row('✓', 'edge-tts', 'usable (' + py + ')');
  else row('△', 'edge-tts', 'unavailable → falls back to the OS voice, which differs from the browser preview (acceptable, not required)', 'python -m pip install edge-tts');

  if (WIN) {
    const r = spawnSync('powershell', ['-NoProfile', '-Command',
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count'], { encoding: 'utf8' });
    const n = parseInt((r.stdout || '').trim(), 10);
    row(Number.isFinite(n) && n > 0 ? '✓' : '△', 'OS voice (SAPI)', Number.isFinite(n) && n > 0 ? n + ' voice(s)' : 'unavailable (with edge-tts also missing there is no narration at all)', 'Settings → Time & language → Speech → add voices');
  } else if (process.platform === 'darwin') {
    row(spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).status === 0 ? '✓' : '△', 'OS voice (say)', 'built into macOS');
  }

  const w = Math.max(...rows.map(r => r[1].length));
  rows.forEach(([m, n, s]) => console.log(`${m} ${n.padEnd(w)}  ${s}`));
  if (tips.length) { console.log('\nInstall with:'); tips.forEach(t => console.log('  ' + t)); }
  console.log(missing.length ? `\n${missing.length} required dependency/dependencies missing: ${missing.join(', ')}` : '\nAll required dependencies are present — you can export video');
  process.exit(missing.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
