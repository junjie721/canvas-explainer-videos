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
const userMarks = (pv && !pv.startsWith('--') ? pv : '')
  .split(',').filter(s => s.trim() !== '')          // Number('') is 0, which would look like a real mark
  .map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 1);
const wantSheet = argv.includes('--sheet');          // also write a storyboard contact sheet
// Default previews: one frame per segment, taken at the segment's midpoint — elements usually fade in
// shortly after a segment starts, so an early frame can still show the previous segment's content. A fixed
// set of fractions (0.15/0.4/…) can silently skip a whole segment, which is how a mismatch slips through.
const marksFor = meta => userMarks.length ? userMarks
  : (meta.segs && meta.segs.length
    ? [0.04, ...meta.segs.slice(1).map(s => Math.min(0.99, (s.s + (s.e - s.s) * 0.5) * (meta.scale || 1) / meta.duration))]
    : [0.15, 0.4, 0.65, 0.9]);

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
  const marks = marksFor(r.meta);
  for (const k of marks) {
    const f = Math.min(r.meta.frames - 1, Math.floor(r.meta.frames * k));
    const u = await p.evaluate(n => { window.renderFrame(n); return document.querySelector('canvas').toDataURL('image/png'); }, f);
    fs.writeFileSync(path.join(dir, `${path.basename(file, '.html')}_${f}.png`), Buffer.from(u.split(',')[1], 'base64'));
  }
  console.log(`previews → ${dir}`);

  // Storyboard: every segment's frame + its caption + its narration line, so the whole arc (and whether
  // the picture matches the words) can be reviewed in one image. Drawn in the page, so no ffmpeg needed.
  if (wantSheet && r.meta.segs && r.meta.segs.length) {
    const sheet = await p.evaluate(m => {
      const src = document.querySelector('canvas');
      const cols = 2, cw = 620, ch = 349, pad = 16, head = 84, capH = 66;
      const rows = Math.ceil(m.segs.length / cols);
      const c = document.createElement('canvas');
      c.width = cols * cw + (cols + 1) * pad;
      c.height = head + rows * (ch + capH) + pad;
      const g = c.getContext('2d');
      g.fillStyle = '#05070f'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#dbe7ff'; g.font = 'bold 30px "Segoe UI", Arial, sans-serif';
      g.fillText('Storyboard', pad, 46);
      g.fillStyle = 'rgba(170,190,230,0.65)'; g.font = '16px "Segoe UI", Arial, sans-serif';
      g.fillText(`${m.segs.length} segments · ${m.duration}s · one frame per segment`, pad + 200, 46);
      m.segs.forEach((s, i) => {
        const f = Math.min(m.frames - 1, Math.round((s.s + (s.e - s.s) * 0.5) * m.scale * m.fps));   // mid-segment
        window.renderFrame(f);
        const x = pad + (i % cols) * (cw + pad), y = head + Math.floor(i / cols) * (ch + capH);
        g.drawImage(src, x, y, cw, ch);
        g.strokeStyle = 'rgba(120,150,220,0.35)'; g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
        const line = (m.narration || []).find(n => Math.abs(n.start - (s.s * m.scale + m.lead)) < 0.02);
        g.fillStyle = s.c || '#dbe7ff'; g.font = 'bold 17px "Segoe UI", Arial, sans-serif';
        g.fillText(`${i === 0 ? 'intro' : 'SEG ' + i}: ${s.cap || '(no caption)'}`, x + 6, y + ch + 26);
        g.fillStyle = 'rgba(170,190,230,0.75)'; g.font = '15px "Segoe UI", Arial, sans-serif';
        const txt = line ? line.text : '(no narration in this segment)';
        g.fillText(txt.length > 58 ? txt.slice(0, 58) + '…' : txt, x + 6, y + ch + 50);
      });
      return c.toDataURL('image/png');
    }, { segs: r.meta.segs, scale: r.meta.scale || 1, fps: r.meta.fps, frames: r.meta.frames, duration: r.meta.duration, narration: r.meta.narration || [], lead: r.meta.narrationLead === undefined ? 0.3 : r.meta.narrationLead });
    const sheetPath = path.join(dir, `${path.basename(file, '.html')}_sheet.png`);
    fs.writeFileSync(sheetPath, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`storyboard → ${sheetPath}`);
  }
  await b.close();
  process.exit(errs.length || bad ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
