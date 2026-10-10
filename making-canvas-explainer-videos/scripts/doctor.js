#!/usr/bin/env node
// 依赖自检：一次说清缺什么、怎么装。首次用这个技能之前跑一遍，别等导出时才报错。
// 用法: node doctor.js [--browser]      --browser 会真启动一次浏览器（较慢），验证 chromium/Edge/Chrome 哪个可用
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
  try { pw = loadPlaywright(); row('✓', 'playwright', '已安装'); }
  catch (e) { row('✗', 'playwright', '未安装（导出/自检都需要）', 'npm i -g playwright'); }

  if (pw && process.argv.includes('--browser')) {
    try { const b = await launchBrowser(pw.chromium); row('✓', 'browser', '可启动'); await b.close(); }
    catch (e) { row('✗', 'browser', String(e.message).split('\n')[0], '设置 PW_CHANNEL=msedge（或 chrome）后重试'); }
  } else if (pw) row('·', 'browser', '未检查（加 --browser 验证）');

  try {
    const f = findFfmpeg();
    const v = String(spawnSync(f.ffmpeg, ['-version'], { encoding: 'utf8' }).stdout || '').split('\n')[0]
      .replace(/^ffmpeg version\s*/, '').split(' Copyright')[0].trim();
    row('✓', 'ffmpeg', v + '  ·  ' + f.ffmpeg);
  } catch (e) { row('✗', 'ffmpeg', String(e.message).split('\n')[0], WIN ? 'winget install Gyan.FFmpeg' : 'brew install ffmpeg（macOS）/ apt install ffmpeg（Linux）'); }

  const py = findEdgeTts();
  if (py) row('✓', 'edge-tts', '可用（' + py + '）');
  else row('△', 'edge-tts', '不可用 → 会退回系统离线语音，音色与浏览器预览不同（可接受，非必须）', 'python -m pip install edge-tts');

  if (WIN) {
    const r = spawnSync('powershell', ['-NoProfile', '-Command',
      'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count'], { encoding: 'utf8' });
    const n = parseInt((r.stdout || '').trim(), 10);
    row(Number.isFinite(n) && n > 0 ? '✓' : '△', '离线语音(SAPI)', Number.isFinite(n) && n > 0 ? n + ' 个语音' : '不可用（edge-tts 也缺就没声音）', '设置 → 时间和语言 → 语音 → 添加语音包');
  } else if (process.platform === 'darwin') {
    row(spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).status === 0 ? '✓' : '△', '离线语音(say)', 'macOS 内置');
  }

  const w = Math.max(...rows.map(r => r[1].length));
  rows.forEach(([m, n, s]) => console.log(`${m} ${n.padEnd(w)}  ${s}`));
  if (tips.length) { console.log('\n安装命令：'); tips.forEach(t => console.log('  ' + t)); }
  console.log(missing.length ? `\n缺 ${missing.length} 项核心依赖：${missing.join('、')}` : '\n核心依赖齐全，可以导出视频');
  process.exit(missing.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
