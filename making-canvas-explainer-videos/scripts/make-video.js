#!/usr/bin/env node
// Export a Canvas animation page to MP4 with synthesized background music and TTS narration.
// Usage: node make-video.js <page.html> [--voice en-US-AriaNeural] [--rate +5%] [--out x.mp4]
//        [--keep] [--reuse] [--workers 4] [--quality 0.95] [--format jpeg|png]
// The page must follow the template.html interface:
//   window.renderFrame(n) / window.VIDEO_META / window.musicWavBase64()
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process'), { pathToFileURL } = require('url');
const { loadPlaywright, launchBrowser, findFfmpeg, findEdgeTts, WIN } = require('./lib');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const file = argv.find(a => a.endsWith('.html'));
if (!file || argv.includes('--help')) {
  console.log('usage: node make-video.js <page.html> [--voice <name>] [--rate +5%] [--out x.mp4] [--keep] [--reuse] [--workers 4] [--quality 0.95] [--format jpeg|png]\n' +
    '  --voice   edge-tts voice; default follows the narration language\n' +
    '            (zh-CN-XiaoxiaoNeural / zh-CN-YunxiNeural for Chinese, en-US-AriaNeural / en-US-GuyNeural for English)\n' +
    '  --keep    keep intermediate files (frames/audio)   --reuse  reuse the frames and redo only the audio\n' +
    '  --quality JPEG quality 0.3~1 (default 0.95)        --format png  lossless frames (crisper text, larger files)\n' +
    '  --workers parallel browser pages for frame export (default 4, max 8)');
  process.exit(file || argv.includes('--help') ? 0 : 1);   // `--help` alone is a success
}
const htmlPath = path.resolve(file), name = path.basename(file, '.html');
if (!fs.existsSync(htmlPath)) { console.error(`file not found: ${htmlPath}`); process.exit(1); }
let voice = opt('--voice', '') || null;                    // resolved from the narration language below
const rate = opt('--rate', '+5%');
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
if (stale) console.log('note: page.html changed, ignoring --reuse and re-exporting frames');
const FF = findFfmpeg();
// Older ffmpeg builds (e.g. the 2018 one) have no `normalize` option on amix and always normalize by
// 1/N; compensate afterwards with volume=N, which is mathematically identical.
const AMIX_NORMALIZE = /normalize/i.test(String(spawnSync(FF.ffmpeg, ['-hide_banner', '-h', 'filter=amix'], { encoding: 'utf8' }).stdout || ''));
if (!AMIX_NORMALIZE) console.log('note: this ffmpeg has no amix `normalize` option, compensating with volume (same result)');
const amix = (n, dur) => AMIX_NORMALIZE ? `amix=inputs=${n}:normalize=0:duration=${dur}` : `amix=inputs=${n}:duration=${dur},volume=${n}`;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed: ${(r.stderr || String(r.error)).slice(-1500)}`);
  return r;
}
const probe = f => parseFloat(run(FF.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).stdout);

// Which language is the narration written in? Decides the default voice and the offline fallback voice.
function narrationScript(meta) {
  const text = (meta.narration || []).map(n => n.text).join(' ');
  const cjk = (text.match(/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return cjk > latin ? 'cjk' : 'latin';
}
let sapiLang = 'en';

// Narration: edge-tts (Microsoft neural voices, needs network) → Windows SAPI → macOS `say`.
const PY = findEdgeTts();
if (!PY) console.log('⚠ edge-tts not usable (python -m pip install edge-tts); falling back to the OS voice, which differs from the browser preview');
function tts(text, base) {
  if (PY) {
    const mp3 = base + '.mp3';
    const r = spawnSync(PY, ['-m', 'edge_tts', '--voice', voice, `--rate=${rate}`, '--text', text, '--write-media', mp3], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(mp3) && fs.statSync(mp3).size > 1000) return { file: mp3, engine: 'edge-tts' };
    // edge-tts is installed but this line failed (usually the network). Don't silently fall back to the
    // OS voice, or one video ends up with two different voices.
    throw new Error(`edge-tts failed: ${(r.stderr || String(r.error)).slice(-300).trim()}\n  check the network and re-run; add --reuse to skip the already-exported frames`);
  }
  const txt = base + '.txt'; fs.writeFileSync(txt, text, 'utf8');
  if (WIN) {   // text goes through a file + UTF-8 read, so no command-line encoding surprises
    const wav = base + '.wav';
    const q = s => "'" + String(s).replace(/'/g, "''") + "'";   // PowerShell single-quote escaping
    const ps = 'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
      `$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like '${sapiLang}*' } | Select-Object -First 1; ` +
      `if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.SetOutputToWaveFile(${q(wav)}); ` +
      `$s.Speak([IO.File]::ReadAllText(${q(txt)}, [Text.Encoding]::UTF8)); $s.Dispose()`;
    try { run('powershell', ['-NoProfile', '-Command', ps]); }
    catch (e) {   // Server editions / missing voice packs make System.Speech throw a NullReference
      throw new Error('the OS voice is unavailable (System.Speech has no voice packs): install edge-tts ' +
        '(python -m pip install edge-tts), or add a voice in Settings → Time & language → Speech\n  ' + String(e.message).split('\n')[0]);
    }
    return { file: wav, engine: 'SAPI' };
  }
  if (process.platform === 'darwin') { const aiff = base + '.aiff'; run('say', ['-f', txt, '-o', aiff]); return { file: aiff, engine: 'say' }; }
  throw new Error('no usable TTS: python -m pip install edge-tts');
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await launchBrowser(chromium);
  const url = pathToFileURL(htmlPath).href + '?capture=1';
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(url);
  const meta = await page.evaluate(() => window.VIDEO_META);
  if (!meta) throw new Error('the page has no window.VIDEO_META — start from template.html');
  if (errs.length) throw new Error('page threw: ' + errs.join(' | '));
  const script = narrationScript(meta);
  if (!voice) voice = script === 'cjk' ? 'zh-CN-XiaoxiaoNeural' : 'en-US-AriaNeural';
  sapiLang = script === 'cjk' ? 'zh' : 'en';

  console.log(`[1/4] synthesizing background music (${meta.duration}s)`);
  const music = path.join(work, 'music.wav');
  fs.writeFileSync(music, Buffer.from(await page.evaluate(() => window.musicWavBase64()), 'base64'));

  const VW = meta.width || 1280, VH = meta.height || 720;    // export size comes from the canvas; the viewport only keeps the layout sane
  await page.setViewportSize({ width: VW, height: VH });
  console.log(`[2/4] exporting ${meta.frames} frames (${WORKERS} pages in parallel, ${VW}x${VH}, canvas → ${FMT.toUpperCase()})`);
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
  console.log(`[3/4] narration: ${narr.length} line(s) (${PY ? 'edge-tts ' + voice : 'offline TTS'})`);
  const lines = narr.map((n, i) => {
    const r = tts(n.text, path.join(work, `voice_${i}`)), dur = probe(r.file);
    const end = i + 1 < narr.length ? narr[i + 1].start : meta.duration - 0.3;
    const avail = end - n.start - 0.15, tempo = dur > avail ? Math.min(1.5, dur / avail) : 1;
    const warn = tempo > 1.25 ? '  ⚠ too long, consider shortening this line' : '';
    console.log(`      #${i} [${r.engine}] ${dur.toFixed(2)}s / window ${avail.toFixed(2)}s${tempo > 1 ? ` → sped up x${tempo.toFixed(2)}` : ''}${warn}  ${n.text}`);
    return { ...n, ...r, tempo };
  });

  console.log('[4/4] mixing (music ducks under the narration) and encoding MP4');
  const args = ['-y', '-framerate', String(meta.fps), '-i', path.join(frames, 'f_%05d.' + EXT), '-i', music];
  lines.forEach(l => args.push('-i', l.file));
  // Older ffmpeg cannot infer the channel layout for amix/sidechaincompress, so every branch is explicit.
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
  console.log(`done: ${out} (target ${meta.duration}s, measured ${probe(out).toFixed(2)}s)`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
