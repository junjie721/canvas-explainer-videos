#!/usr/bin/env node
// 离线冒烟测试：不需要浏览器、不需要联网、不需要 ffmpeg。
// 用一个最小 DOM 桩加载 template.html，检查：
//   1. 全部帧都能渲染且不抛错（逐帧导出可复现的前提）
//   2. VIDEO_META 字段齐全，时间轴连续、解说与分段对齐（复用技能自带的 validateTimeline）
//   3. 每句解说放得进它的时间窗口
//   4. 背景音乐是确定性的（两次合成结果完全一致），WAV 头与长度正确
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const skillDir = path.join(root, 'making-canvas-explainer-videos');
const htmlPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(skillDir, 'template.html');
const { validateTimeline } = require(path.join(skillDir, 'scripts', 'lib.js'));

const CHARS_PER_SEC = 4.6;                 // 与 check.js 保持同一经验值
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };

function loadPage(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('页面里找不到内联 <script>');
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

console.log(`模板：${htmlPath}\n`);
let page;
try { page = loadPage(htmlPath); }
catch (e) { console.log(`✗ 加载失败：${e.message}`); process.exit(1); }
const { sandbox } = page;
const meta = sandbox.VIDEO_META;
check(!!meta, '导出接口存在 window.VIDEO_META');
if (!meta) process.exit(1);

for (const k of ['fps', 'width', 'height', 'scale', 'duration', 'frames', 'narration', 'segs']) {
  check(meta[k] !== undefined, `VIDEO_META.${k} 存在`);
}
check(typeof sandbox.renderFrame === 'function', '导出接口存在 window.renderFrame');
check(typeof sandbox.musicWavBase64 === 'function', '导出接口存在 window.musicWavBase64');
check(meta.frames === Math.round(meta.fps * meta.duration), `frames 与 fps×duration 一致（${meta.frames}）`);
check(meta.duration >= 15 && meta.duration <= 90, `成片时长在 15~90s 内（${meta.duration}s）`);

// 1) 逐帧渲染
const errs = new Set();
let rendered = 0;
for (let f = 0; f < meta.frames; f++) {
  try { sandbox.renderFrame(f); rendered++; } catch (e) { errs.add(`${f}: ${e.message}`); }
}
check(errs.size === 0 && rendered === meta.frames, `全部 ${meta.frames} 帧渲染无异常${errs.size ? '：' + [...errs].slice(0, 3).join(' | ') : ''}`);

// 2) 时间轴 + 解说对齐
const tl = validateTimeline(meta);
const hard = tl.filter(([m]) => m === '✗');
check(hard.length === 0, `时间轴校验通过${hard.length ? '：' + hard.map(([, m]) => m).join('；') : ''}`);

// 3) 解说是否放得进窗口（与 check.js 同一算法）
const narr = meta.narration || [];
check(narr.length > 0, '存在解说文本');
narr.forEach((n, i) => {
  const end = i + 1 < narr.length ? narr[i + 1].start : meta.duration - 0.3;
  const win = end - n.start - 0.15;
  const est = n.text.replace(/[A-Za-z]+/g, 'xx').replace(/[\s，。、：；？！,.:;?!]/g, '').length / CHARS_PER_SEC + 0.6;
  check(win > 0 && est <= win * 1.2, `解说 #${i} 放得进窗口（预估 ${est.toFixed(2)}s / 窗口 ${win.toFixed(2)}s）`);
});

// 4) 音乐确定性 + WAV 结构
const sr = 8000;                                  // 测试用低采样率，够验证结构
const a = sandbox.musicWavBase64(sr), b = sandbox.musicWavBase64(sr);
const h = s => crypto.createHash('sha1').update(s).digest('hex');
check(h(a) === h(b), '背景音乐两次合成结果一致（确定性）');
const buf = Buffer.from(a, 'base64');
const n = Math.ceil(sr * meta.duration);          // 与模板 synthMusic 的取整方式一致
check(buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WAVE', 'WAV 头正确');
check(buf.length === 44 + n * 2, `WAV 长度与时长匹配（${buf.length} 字节）`);
let peak = 0;
for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf.readInt16LE(44 + i * 2)) / 32768);
check(peak > 0.3 && peak <= 1.01, `音乐有信号且不越界（峰值 ${peak.toFixed(3)}）`);

console.log(fails.length ? `\n${fails.length} 项未通过` : '\n冒烟测试全部通过');
process.exit(fails.length ? 1 : 0);
