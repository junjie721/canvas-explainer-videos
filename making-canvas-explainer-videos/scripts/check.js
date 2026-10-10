#!/usr/bin/env node
// 快速自检（几秒钟）：渲染全部帧查运行时错误、检查解说词能否放进时间窗口、导出关键帧预览
// 用法: node check.js <page.html> [--preview 0.2,0.5,0.8]
// 退出码非 0 = 有问题：运行时错误 / 解说超长 / SEG 时间轴不连续 / 解说不落在它描述的分段内
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { loadPlaywright, launchBrowser, validateTimeline } = require('./lib');

const argv = process.argv.slice(2), file = argv.find(a => a.endsWith('.html'));
const USAGE = '用法: node check.js <page.html> [--preview 0.2,0.5,0.8]';
if (!file) { console.log(USAGE); process.exit(1); }
const pf = argv.indexOf('--preview'), pv = pf >= 0 ? argv[pf + 1] : '';
if (!fs.existsSync(path.resolve(file))) { console.log(`找不到 ${path.resolve(file)}`); process.exit(1); }
const marks = (pv && !pv.startsWith('--') ? pv : '0.15,0.4,0.65,0.9')
  .split(',').map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 1);
if (!marks.length) marks.push(0.5);
const CHARS_PER_SEC = 4.6;   // edge-tts 中文 +5% 语速的经验值（英文约 2.6 词/秒）

(async () => {
  const { chromium } = loadPlaywright(), b = await launchBrowser(chromium);
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(pathToFileURL(path.resolve(file)).href + '?capture=1');
  const r = await p.evaluate(() => {
    const t0 = performance.now(); for (let f = 0; f < window.TOTAL_FRAMES; f++) window.renderFrame(f);
    return { meta: window.VIDEO_META, ms: Math.round(performance.now() - t0), music: typeof window.musicWavBase64 === 'function' };
  });
  if (!r.meta) { console.log('✗ 缺少 window.VIDEO_META'); process.exit(1); }
  console.log(`帧数 ${r.meta.frames}（${r.meta.duration}s @${r.meta.fps}fps），全量渲染 ${r.ms}ms，音乐函数 ${r.music ? '✓' : '✗'}，运行时错误 ${errs.length ? '✗ ' + errs.join(' | ') : '✓ 无'}`);
  let bad = 0;

  // 时间轴校验：SEG 是否首尾相接覆盖 0~DURATION、解说起点是否落在它描述的那一段里
  // （这两类错误在没有校验时是静默的：字幕/配色/右上阶段面板会整体错位，但视频照常导出）
  const tl = validateTimeline(r.meta);
  tl.forEach(([mark, msg]) => { if (mark === '✗') bad++; console.log(`  ${mark} 时间轴 ${msg}`); });
  if (r.meta.segs && r.meta.segs.length && !tl.some(([m]) => m === '✗')) console.log('  时间轴 ✓ SEG 连续且解说与分段对齐');

  (r.meta.narration || []).forEach((n, k, a) => {
    const end = k + 1 < a.length ? a[k + 1].start : r.meta.duration - 0.3, win = end - n.start - 0.15;
    const est = n.text.replace(/[A-Za-z]+/g, 'xx').replace(/[\s，。、：；？！,.:;?!]/g, '').length / CHARS_PER_SEC + 0.6;
    const flag = est > win * 1.2 ? '✗ 过长' : est > win ? '△ 偏长(会加速)' : '✓';
    if (est > win * 1.2) bad++;
    console.log(`  ${flag}  @${n.start}s 窗口 ${win.toFixed(1)}s 预估 ${est.toFixed(1)}s  ${n.text}`);
  });
  const dir = path.join(path.dirname(path.resolve(file)), 'preview'); fs.mkdirSync(dir, { recursive: true });
  for (const k of marks) {
    const f = Math.min(r.meta.frames - 1, Math.floor(r.meta.frames * k));
    const u = await p.evaluate(n => { window.renderFrame(n); return document.querySelector('canvas').toDataURL('image/png'); }, f);
    fs.writeFileSync(path.join(dir, `${path.basename(file, '.html')}_${f}.png`), Buffer.from(u.split(',')[1], 'base64'));
  }
  console.log(`预览图 → ${dir}`);
  await b.close();
  process.exit(errs.length || bad ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

