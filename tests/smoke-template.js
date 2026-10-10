#!/usr/bin/env node
// Offline smoke test: no browser, no network, no ffmpeg.
// Loads template.html in a minimal DOM stub and checks:
//   1. every frame renders without throwing (the precondition for reproducible export)
//   2. VIDEO_META is complete, the timeline is continuous and narration lines up with its segments
//      (reusing the skill's own validateTimeline)
//   3. every narration line fits its time window
//   4. the background music is deterministic (two identical renders) with a valid WAV header/length
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const skillDir = path.join(root, 'making-canvas-explainer-videos');
const htmlPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(skillDir, 'template.html');
const { validateTimeline } = require(path.join(skillDir, 'scripts', 'lib.js'));

const CJK_PER_SEC = 4.6, WORDS_PER_SEC = 2.6;      // same model as check.js
const CJK = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g;
const estimateSeconds = text => (text.match(CJK) || []).length / CJK_PER_SEC +
  (text.replace(CJK, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length / WORDS_PER_SEC + 0.6;

const fails = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };

function loadPage(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no inline <script> in the page');
  const draws = [];
  const base = {
    globalAlpha: 1, lineWidth: 1, shadowBlur: 0, lineDashOffset: 0, lineCap: 'butt',
    fillStyle: '', strokeStyle: '', shadowColor: '', font: '', textAlign: '', textBaseline: '',
    fillText: s => draws.push(String(s)),
    measureText: s => ({ width: String(s).length * 9 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} })
  };
  const ctx = new Proxy(base, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
  const canvas = { width: 1280, height: 720, getContext: () => ctx, addEventListener() {} };
  const sandbox = {
    document: { getElementById: () => canvas, querySelector: () => canvas, body: { classList: { add() {}, remove() {} } } },
    location: { search: '?capture=1' },
    URLSearchParams,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    setTimeout: () => 0, clearTimeout: () => {},
    performance: { now: () => Date.now() },
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: file });
  return { sandbox, draws };
}

console.log(`template: ${htmlPath}\n`);
let page;
try { page = loadPage(htmlPath); }
catch (e) { console.log(`✗ failed to load: ${e.message}`); process.exit(1); }
const { sandbox } = page;
const meta = sandbox.VIDEO_META;
check(!!meta, 'export interface window.VIDEO_META exists');
if (!meta) process.exit(1);

for (const k of ['fps', 'width', 'height', 'scale', 'duration', 'frames', 'narration', 'segs']) {
  check(meta[k] !== undefined, `VIDEO_META.${k} exists`);
}
check(typeof sandbox.renderFrame === 'function', 'export interface window.renderFrame exists');
check(typeof sandbox.musicWavBase64 === 'function', 'export interface window.musicWavBase64 exists');
check(meta.frames === Math.round(meta.fps * meta.duration), `frames matches fps×duration (${meta.frames})`);
check(meta.duration >= 15 && meta.duration <= 90, `video length is within 15~90s (${meta.duration}s)`);

// 1) render every frame
const errs = new Set();
let rendered = 0;
for (let f = 0; f < meta.frames; f++) {
  try { sandbox.renderFrame(f); rendered++; } catch (e) { errs.add(`${f}: ${e.message}`); }
}
check(errs.size === 0 && rendered === meta.frames, `all ${meta.frames} frames render without errors${errs.size ? ': ' + [...errs].slice(0, 3).join(' | ') : ''}`);

// 2) timeline + narration alignment
const tl = validateTimeline(meta);
const hard = tl.filter(([m]) => m === '✗');
check(hard.length === 0, `timeline is valid${hard.length ? ': ' + hard.map(([, m]) => m).join('; ') : ''}`);

// 3) does every narration line fit its window (same model as check.js)
const narr = meta.narration || [];
check(narr.length > 0, 'narration text is present');
narr.forEach((n, i) => {
  const end = i + 1 < narr.length ? narr[i + 1].start : meta.duration - 0.3;
  const win = end - n.start - 0.15;
  const est = estimateSeconds(n.text);
  check(win > 0 && est <= win * 1.2, `narration #${i} fits its window (est ${est.toFixed(2)}s / window ${win.toFixed(2)}s)`);
});

// 4) deterministic music + WAV structure
const sr = 8000;                                  // low sample rate: enough to check the structure
const a = sandbox.musicWavBase64(sr), b = sandbox.musicWavBase64(sr);
const h = s => crypto.createHash('sha1').update(s).digest('hex');
check(h(a) === h(b), 'background music is deterministic (two renders are identical)');
const buf = Buffer.from(a, 'base64');
const n = Math.ceil(sr * meta.duration);          // same rounding as synthMusic
check(buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WAVE', 'WAV header is valid');
check(buf.length === 44 + n * 2, `WAV length matches the duration (${buf.length} bytes)`);
let peak = 0;
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf.readInt16LE(44 + i * 2)) / 32768);
check(peak > 0.3 && peak <= 1.01, `music has signal and stays in range (peak ${peak.toFixed(3)})`);

console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nsmoke test passed');
process.exit(fails.length ? 1 : 0);
