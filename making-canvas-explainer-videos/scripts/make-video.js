#!/usr/bin/env node
// 把「Canvas 动画 HTML」导出为带背景音乐 + 语音解说的 MP4
// 用法: node make-video.js <page.html> [--voice zh-CN-XiaoxiaoNeural] [--rate +5%] [--out x.mp4] [--keep] [--reuse] [--workers 4] [--quality 0.95] [--format jpeg|png]
// HTML 需满足 template.html 的接口约定: window.renderFrame(n) / window.VIDEO_META / window.musicWavBase64()
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process'), { pathToFileURL } = require('url');
const { loadPlaywright, launchBrowser, findFfmpeg, findEdgeTts, WIN } = require('./lib');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const file = argv.find(a => a.endsWith('.html'));
if (!file || argv.includes('--help')) {
  console.log('用法: node make-video.js <page.html> [--voice zh-CN-XiaoxiaoNeural] [--rate +5%] [--out x.mp4] [--keep] [--reuse] [--workers 4] [--quality 0.95] [--format jpeg|png]\n' +
    '  --voice   edge-tts 声音（男声: zh-CN-YunxiNeural；英文: en-US-AriaNeural）\n' +
    '  --keep    保留中间文件（帧/音频）  --reuse  复用上次的帧，只重做音频（page.html 改过会自动失效）\n' +
    '  --quality 0.3~1 的 JPEG 质量（默认 0.95）  --format png  无损帧（文字多时更清晰，体积更大）\n' +
    '  --workers 并行导帧的页面数（默认 4，上限 8）');
  process.exit(file || argv.includes('--help') ? 0 : 1);   // --help 单独调用算成功
}
const htmlPath = path.resolve(file), name = path.basename(file, '.html');
if (!fs.existsSync(htmlPath)) { console.error(`找不到 ${htmlPath}`); process.exit(1); }
const voice = opt('--voice', 'zh-CN-XiaoxiaoNeural'), rate = opt('--rate', '+5%');
const WORKERS = Math.min(8, Math.max(1, Math.round(+opt('--workers', 4)) || 4));
const FMT = String(opt('--format', 'jpeg')).toLowerCase() === 'png' ? 'png' : 'jpeg';
const EXT = FMT === 'png' ? 'png' : 'jpg', MIME = FMT === 'png' ? 'image/png' : 'image/jpeg';
const QUAL = Math.min(1, Math.max(0.3, +opt('--quality', 0.95) || 0.95));
const out = path.resolve(opt('--out', path.join(path.dirname(htmlPath), name + '.mp4')));
const work = path.join(os.tmpdir(), 'canvas-video-' + name), frames = path.join(work, 'frames');
const sig = fs.statSync(htmlPath).mtimeMs + ':' + fs.statSync(htmlPath).size, sigFile = path.join(work, 'source.txt');
const reuse = argv.includes('--reuse');
if (!reuse) fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });
const stale = reuse && fs.existsSync(sigFile) && fs.readFileSync(sigFile, 'utf8') !== sig;
if (stale) console.log('提示：page.html 改动过，忽略 --reuse 重新导帧');
const FF = findFfmpeg();
// 老版本 ffmpeg（如 2018 构建）的 amix 没有 normalize 选项，它会固定按 1/输入数 归一化，用后续 volume=N 抵消
const AMIX_NORMALIZE = /normalize/i.test(String(spawnSync(FF.ffmpeg, ['-hide_banner', '-h', 'filter=amix'], { encoding: 'utf8' }).stdout || ''));
if (!AMIX_NORMALIZE) console.log('提示：当前 ffmpeg 的 amix 不支持 normalize，已改用 volume 补偿（听感一致）');
const amix = (n, dur) => AMIX_NORMALIZE ? `amix=inputs=${n}:normalize=0:duration=${dur}` : `amix=inputs=${n}:duration=${dur},volume=${n}`;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} 失败: ${(r.stderr || String(r.error)).slice(-1500)}`);
  return r;
}
const probe = f => parseFloat(run(FF.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).stdout);

// 语音：优先 edge-tts（微软神经网络语音，需联网）→ Windows SAPI 离线语音 → macOS say
const PY = findEdgeTts();
if (!PY) console.log('⚠ 未找到可用的 edge-tts（python -m pip install edge-tts），将改用系统离线语音；音色与浏览器预览不同');
function tts(text, base) {
  if (PY) {
    const mp3 = base + '.mp3';
    const r = spawnSync(PY, ['-m', 'edge_tts', '--voice', voice, `--rate=${rate}`, '--text', text, '--write-media', mp3], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(mp3) && fs.statSync(mp3).size > 1000) return { file: mp3, engine: 'edge-tts' };
    // 已装 edge-tts 却失败（多为网络问题）：不要静默退回系统语音，否则同一视频里会混进两种音色
    throw new Error(`edge-tts 合成失败：${(r.stderr || String(r.error)).slice(-300).trim()}\n  联网后重跑，加 --reuse 可跳过已导出的帧`);
  }
  const txt = base + '.txt'; fs.writeFileSync(txt, text, 'utf8');
  if (WIN) {   // 文本走文件 + UTF-8 读取，避免 PowerShell 命令行中文乱码
    const wav = base + '.wav';
    const q = s => "'" + String(s).replace(/'/g, "''") + "'";   // PowerShell 单引号内转义，防止路径含 ' 时炸掉
    const ps = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
      "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'zh*' } | Select-Object -First 1; " +
      `if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.SetOutputToWaveFile(${q(wav)}); ` +
      `$s.Speak([IO.File]::ReadAllText(${q(txt)}, [Text.Encoding]::UTF8)); $s.Dispose()`;
    try { run('powershell', ['-NoProfile', '-Command', ps]); }
    catch (e) {   // Server 版 Windows / 未装语音包时 System.Speech 会直接抛 NullReference
      throw new Error('系统离线语音不可用（System.Speech 无语音包）：改装 edge-tts（python -m pip install edge-tts），' +
        '或在“设置 → 时间和语言 → 语音”里添加中文语音包\n  ' + String(e.message).split('\n')[0]);
    }
    return { file: wav, engine: 'SAPI' };
  }
  if (process.platform === 'darwin') { const aiff = base + '.aiff'; run('say', ['-f', txt, '-o', aiff]); return { file: aiff, engine: 'say' }; }
  throw new Error('没有可用的 TTS：python -m pip install edge-tts');
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await launchBrowser(chromium);
  const url = pathToFileURL(htmlPath).href + '?capture=1';
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url);
  const meta = await page.evaluate(() => window.VIDEO_META);
  if (!meta) throw new Error('页面缺少 window.VIDEO_META，请基于 template.html 编写');
  if (errs.length) throw new Error('页面脚本报错: ' + errs.join(' | '));

  console.log(`[1/4] 合成背景音乐（${meta.duration}s）`);
  const music = path.join(work, 'music.wav');
  fs.writeFileSync(music, Buffer.from(await page.evaluate(() => window.musicWavBase64()), 'base64'));

  const VW = meta.width || 1280, VH = meta.height || 720;    // 导出分辨率由 canvas 尺寸决定，viewport 只是让截图前布局正常
  await page.setViewportSize({ width: VW, height: VH });
  console.log(`[2/4] 导出 ${meta.frames} 帧（${WORKERS} 页并行，${VW}x${VH}，canvas → ${FMT.toUpperCase()}）`);
  const have = fs.readdirSync(frames).filter(f => f.endsWith('.' + EXT)).length;
  if (!(reuse && !stale && have === meta.frames)) {
    const per = Math.ceil(meta.frames / WORKERS); let done = 0, nextLog = 0;
    await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
      const pg = w === 0 ? page : await browser.newPage({ viewport: { width: VW, height: VH } });
      if (w > 0) await pg.goto(url);
      for (let f = w * per; f < Math.min(meta.frames, (w + 1) * per); f += 10) {
        const end = Math.min(meta.frames, (w + 1) * per, f + 10);
        const urls = await pg.evaluate(([a, b, mime, q]) => {
          const c = document.querySelector('canvas'), o = [];
          for (let i = a; i < b; i++) { window.renderFrame(i); o.push(c.toDataURL(mime, q)); }
          return o;
        }, [f, end, MIME, QUAL]);
        urls.forEach((u, k) => fs.writeFileSync(path.join(frames, `f_${String(f + k).padStart(5, '0')}.${EXT}`), Buffer.from(u.slice(u.indexOf(',') + 1), 'base64')));
        done += urls.length;
        if (done >= nextLog) { console.log(`      ${done}/${meta.frames}`); nextLog += 300; }
      }
    }));
  }
  fs.writeFileSync(sigFile, sig);
  await browser.close();

  const narr = meta.narration || [];
  console.log(`[3/4] 语音解说 ${narr.length} 句（${PY ? 'edge-tts ' + voice : '离线 TTS'}）`);
  const lines = narr.map((n, i) => {
    const r = tts(n.text, path.join(work, `voice_${i}`)), dur = probe(r.file);
    const end = i + 1 < narr.length ? narr[i + 1].start : meta.duration - 0.3;
    const avail = end - n.start - 0.15, tempo = dur > avail ? Math.min(1.5, dur / avail) : 1;
    const warn = tempo > 1.25 ? '  ⚠ 太长，建议缩短这句' : '';
    console.log(`      #${i} [${r.engine}] ${dur.toFixed(2)}s / 窗口 ${avail.toFixed(2)}s${tempo > 1 ? ` → 加速 x${tempo.toFixed(2)}` : ''}${warn}  ${n.text}`);
    return { ...n, ...r, tempo };
  });

  console.log('[4/4] 混音（解说时自动压低音乐）并编码 MP4');
  const args = ['-y', '-framerate', String(meta.fps), '-i', path.join(frames, 'f_%05d.' + EXT), '-i', music];
  lines.forEach(l => args.push('-i', l.file));
  // 老版本 ffmpeg 的 amix/sidechaincompress 无法自行推断声道布局，各处都显式声明 mono
  const fc = ['[1:a]aresample=44100,aformat=channel_layouts=mono,volume=0.35[bgm]'];
  if (lines.length) {
    lines.forEach((l, i) => {
      const ms = Math.round(l.start * 1000);
      fc.push(`[${i + 2}:a]aresample=44100,aformat=channel_layouts=mono${l.tempo > 1 ? `,atempo=${l.tempo.toFixed(3)}` : ''},adelay=${ms}|${ms}[v${i}]`);
    });
    fc.push(`${lines.map((_, i) => `[v${i}]`).join('')}${amix(lines.length, 'longest')},apad,aformat=channel_layouts=mono[vox]`);
    fc.push('[vox]asplit=2[vk0][vm0]');
    fc.push('[vk0]aformat=channel_layouts=mono[vk]', '[vm0]aformat=channel_layouts=mono[vm]');
    fc.push('[bgm][vk]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=500[duck]');
    fc.push(`[duck][vm]${amix(2, 'first')},aformat=channel_layouts=mono[aout]`);
  } else fc.push('[bgm]anull[aout]');
  args.push('-filter_complex', fc.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-r', String(meta.fps), '-c:a', 'aac', '-b:a', '160k', '-t', String(meta.duration), out);
  run(FF.ffmpeg, args);
  if (!argv.includes('--keep')) fs.rmSync(work, { recursive: true, force: true });
  console.log(`完成: ${out}（目标 ${meta.duration}s，实测 ${probe(out).toFixed(2)}s）`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

