#!/usr/bin/env node
// Fast self-check (a few seconds): render every frame to catch runtime errors, verify the timeline,
// estimate whether each narration line fits its window, and write key preview frames.
// Usage: node check.js <page.html> [--preview 0.2,0.5,0.8]
// A non-zero exit code means something is wrong: runtime error / narration too long / SEG timeline
// not continuous / narration starting outside the segment it describes.
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { loadPlaywright, launchBrowser, validateTimeline } = require('./lib');

const argv = process.argv.slice(2), file = argv.find(a => a.endsWith('.html'));
const USAGE = 'usage: node check.js <page.html> [--preview 0.2,0.5,0.8]';
if (!file) { console.log(USAGE); process.exit(1); }
const pf = argv.indexOf('--preview'), pv = pf >= 0 ? argv[pf + 1] : '';
if (!fs.existsSync(path.resolve(file))) { console.log(`file not found: ${path.resolve(file)}`); process.exit(1); }
const marks = (pv && !pv.startsWith('--') ? pv : '0.15,0.4,0.65,0.9')
  .split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 1);
if (!marks.length) marks.push(0.5);

// Rough speaking-rate model, used only to warn before the real TTS runs.
// CJK ~4.6 characters/second, English ~2.6 words/second (with edge-tts at +5%).
const CJK_PER_SEC = 4.6, WORDS_PER_SEC = 2.6;
const CJK = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g;
function estimateSeconds(text) {
  const cjk = (text.match(CJK) || []).length;
  const words = (text.replace(CJK, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
  return cjk / CJK_PER_SEC + words / WORDS_PER_SEC + 0.6;
}

(async () => {
  const { chromium } = loadPlaywright(), b = await launchBrowser(chromium);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(pathToFileURL(path.resolve(file)).href + '?capture=1');
  const r = await p.evaluate(() => {
    const t0 = performance.now(); for (let f = 0; f < window.TOTAL_FRAMES; f++) window.renderFrame(f);
    return { meta: window.VIDEO_META, ms: Math.round(performance.now() - t0), music: typeof window.musicWavBase64 === 'function' };
  });
  if (!r.meta) { console.log('✗ window.VIDEO_META is missing'); process.exit(1); }
  console.log(`${r.meta.frames} frames (${r.meta.duration}s @${r.meta.fps}fps), rendered in ${r.ms}ms, music ${r.music ? '✓' : '✗'}, runtime errors: ${errs.length ? '✗ ' + errs.join(' | ') : '✓ none'}`);
  let bad = 0;

  // Timeline check: do the SEGs tile 0..DURATION, and does each narration line start in its segment?
  const tl = validateTimeline(r.meta);
  tl.forEach(([mark, msg]) => { if (mark === '✗') bad++; console.log(`  ${mark} timeline: ${msg}`); });
  if (r.meta.segs && r.meta.segs.length && !tl.some(([m]) => m === '✗')) console.log('  ✓ timeline: SEGs are continuous and narration lines up with its segments');

  (r.meta.narration || []).forEach((n, k, a) => {
    const end = k + 1 < a.length ? a[k + 1].start : r.meta.duration - 0.3, win = end - n.start - 0.15;
    const est = estimateSeconds(n.text);
    const flag = est > win * 1.2 ? '✗ too long' : est > win ? '△ tight (will speed up)' : '✓';
    if (est > win * 1.2) bad++;
    console.log(`  ${flag}  @${n.start}s  window ${win.toFixed(1)}s  est ${est.toFixed(1)}s  ${n.text}`);
  });

  const dir = path.join(path.dirname(path.resolve(file)), 'preview'); fs.mkdirSync(dir, { recursive: true });
  for (const k of marks) {
    const f = Math.min(r.meta.frames - 1, Math.floor(r.meta.frames * k));
    const u = await p.evaluate(n => { window.renderFrame(n); return document.querySelector('canvas').toDataURL('image/png'); }, f);
    fs.writeFileSync(path.join(dir, `${path.basename(file, '.html')}_${f}.png`), Buffer.from(u.split(',')[1], 'base64'));
  }
  console.log(`previews → ${dir}`);
  await b.close();
  process.exit(errs.length || bad ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
