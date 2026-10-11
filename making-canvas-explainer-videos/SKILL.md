---
name: making-canvas-explainer-videos
description: Use when the user wants a short explainer animation or video (math, algorithms, AI agents, system flows, any concept) generated purely from code with no external image or audio assets, optionally with synthesized background music and TTS narration (配音/解说/背景音乐), or exported to MP4. Not for live-action footage, real image/audio assets, or editing long-form video.
metadata:
  short-description: Build narrated explainer videos from pure code and export MP4
---

# Make explainer videos with pure code

## Overview
A single self-contained HTML file draws every frame on a Canvas, Web Audio synthesizes the background music, TTS produces the narration, Playwright exports the frames, and ffmpeg mixes everything into an MP4.
**Core principle: the picture is a pure function of the frame number** (`renderFrame(n)`), so the live preview and the frame-by-frame export match exactly and every render is reproducible.

## When to use / not to use
- Use for: concept explainers (15–90s), process or architecture animations, math visualizations, narrated teaching clips, "no assets at all" animations
- Don't use for: live-action footage, real photo/video assets, long-form video editing (use a video editor)

## Design the content before the picture

The scripts validate mechanics; nothing validates whether the video actually teaches. Spend five minutes
here first — it is the difference between a nice animation and a lesson.

**1. Write the learning objective.** One sentence: "After these seconds the viewer can answer: ___".
Every segment serves that sentence; if a segment doesn't, cut it rather than filling time.

**2. Follow a beat sheet.** An explainer that teaches usually has these beats — scale the seconds to your
total length.

| Beat | 30s | 60s | What it does |
|---|---|---|---|
| Hook: a counter-intuitive fact or question | 0–4 | 0–8 | buys attention; make it concrete and numerical |
| Tension: why the naive answer fails | 4–9 | 8–16 | creates the need for the explanation |
| Mechanism: how it actually works | 9–20 | 16–38 | the "why", not just the "what" — this is the learning |
| Boundary: where the rule breaks | 20–25 | 38–48 | stops the audience from over-generalising |
| Payoff: what to do with it | 25–30 | 48–60 | makes it useful; end on a rule of thumb, not a slogan |

**3. One claim per segment.** Write the sentence first, then design a picture that *proves* it. If a
segment needs two sentences, it is two segments. `check.js` cannot see this — it is on you.

**4. Pick a visual grammar** from [references/visual-grammars.md](references/visual-grammars.md) before
writing `scene(t)`. Reusing the pipeline shape for every topic is the most common way these videos end up
looking alike, and a countable comparison usually teaches more than another flow chart.

**5. Write narration for the ear.** One idea per line; spoken register; concrete numbers instead of
adjectives ("3 tokens fewer", not "more efficient"); spell numbers the way you want them read ("20 万",
not "200000"); a comfortable pace is ~3.5–4 CJK characters/s (4.6 is the ceiling) or ~2–2.4 English
words/s (2.6 is the ceiling) — writing at the ceiling sounds rushed; drop filler like "我们可以看到".

**6. Ground every fact.** Anything concrete on screen — a number, an ID, a version, a price — comes from a
real tool run, or is labelled as illustrative:

| Claim type | Where the real number comes from |
|---|---|
| token counts or split points | `pip install tiktoken`, encode the exact string (see `examples/token-explained/`) |
| API latency, status codes | `curl -w` against the real endpoint |
| library or tool versions | the tool's own `--version` output |
| memory, cost, limits | run the measurement, or cite the vendor's documented figure |

When an example ships in this repo it should include the raw tool output next to it, so a reader can
reproduce the claim (`examples/token-explained/tokenization.json` is the pattern).

## Workflow
0. `node <skill>/scripts/doctor.js` — dependency check. It prints what is missing and how to install it (`--browser` also verifies that a browser can actually launch). Run it first, otherwise you only find out at export time.
1. Design first — learning objective, beat sheet, one claim per segment, chosen grammar (see above) — then copy `template.html` into the target directory and edit **only the CONTENT section**: `TITLE / INTRO / SEG / NARRATION / scene(t)`. The template ships with a runnable example (the journey of an HTTP request) — get that running before rewriting it.
2. `node <skill>/scripts/check.js page.html` — renders every frame to catch runtime errors, validates the timeline (SEG continuity + narration/segment alignment), estimates whether each narration line fits its time window, and writes preview images to `preview/`. By default it now writes **one preview per segment**; add `--sheet` to also get a storyboard contact sheet (every segment's frame + its caption + its narration line) that makes the whole arc reviewable at a glance. **A non-zero exit code means something is wrong — fix it until every line is ✓**, and look at the previews for overlapping layout. Note what this check does *not* cover: it never verifies **facts or narration/picture alignment**. Any concrete number, ID, version, price or statistic shown on screen must come from a real tool run (or be labelled as illustrative), and you should re-read each SEG's narration against what its scene actually draws.
3. `node <skill>/scripts/make-video.js page.html` — writes `page.mp4` (`--help` lists the options: `--voice` to change the voice, `--reuse` to keep the frames and redo only the audio, `--format png`, `--quality`).
4. Verify duration and audio tracks with ffprobe, then give the user the **absolute path** of the result.

Dependencies (install only what is missing; `doctor.js` tells you which):
- `npm i -g playwright` — required for export and self-check; the browser falls back to the system Edge/Chrome, so `playwright install` is not needed
- ffmpeg + ffprobe — required; Windows `winget install Gyan.FFmpeg`, macOS `brew install ffmpeg`, Linux via your package manager. The scripts search PATH, WinGet, Chocolatey, Scoop and common install directories
- `python -m pip install edge-tts` — neural TTS (needs network). Without it the export still works, but it falls back to the OS voice, so the audio will not match the browser preview

## Design rules
| Rule | Why |
|---|---|
| The picture depends only on `t`; no `Math.random()`/`Date.now()` (use the seeded `rnd`) | frame-by-frame export must be reproducible |
| Choreograph with `prog/vis/ease`; one visual focus per SEG | clear pacing, no jumping fades |
| Compute live values (angles, counters, token counts) inside `scene(t)` on every frame | they must never be hardcoded |
| With narration use `SCALE = 2.0`; each line must fit window seconds × 4.6 (CJK characters) or × 2.6 (English words) | the raw animation is too fast to fit narration |
| 15–90s total (with narration keep `DURATION` ≤ 45); above 60s use 6–8 SEGs of ≤15s each; split longer content into episodes | a single-file `scene(t)` becomes unmaintainable, and viewer attention is finite |
| Safe zones: title/caption y<110, progress bar y>675, right-top panel x>920 | no overlap with shared elements |
| Output resolution = the canvas `width`/`height` attributes (= `W`/`H` in the code); for 9:16 vertical change both | the scripts' viewport only affects the preview, not the exported resolution |
| Every concrete number, ID, string or price on screen comes from a real tool run — otherwise label it 示意/illustrative | `check.js` validates timing, layout and reproducibility, never facts; a plausible-looking invented value is the fastest way to lose a technical audience |

## Common problems
| Symptom | Fix |
|---|---|
| Frame export is very slow (element `screenshot`) | use `canvas.toDataURL` + JPEG + parallel pages, as the scripts do (~10× faster) |
| No audio when opening the page in a browser | autoplay is blocked; the template starts audio from a click overlay |
| A narration line is audibly sped up (> ×1.25) | shorten the line or lengthen its SEG, then re-run `check.js` |
| Non-ASCII text turns into mojibake inside PowerShell commands | write the text to a file and let Node read it; don't inline non-ASCII in PS command lines |
| `ffmpeg`/`ffprobe ENOENT` | the scripts search the common install locations; add it to PATH if that search fails |
| A long run is killed by a ~300s terminal timeout | run it in the background with the log redirected, then poll the log and the output file |
| `Executable doesn't exist ... chromium` | the scripts fall back to the system Edge/Chrome; set `PW_CHANNEL=msedge` (or `chrome`) only if that fallback also fails |
| Narration voice differs from the browser preview | `edge-tts` is missing or offline (check whether the `[3/4]` line says `edge-tts` or `offline TTS`): `python -m pip install edge-tts` |
| `Cannot connect to host speech.platform.bing.com` | the network is sandboxed or proxied — edge-tts needs internet. Re-run with network access, and add `--reuse` to reuse already-exported frames |
| The exported picture is stretched | change the canvas `width`/`height` attributes plus `W`/`H` in the code; don't touch the `body.capture` CSS rule (it follows the canvas size) |
| The video still shows the old content after editing the page | `--reuse` reused old frames; the script fingerprints the page and normally re-exports, otherwise delete `%TEMP%\canvas-video-<name>` |
| You "remembered" a number for the script (token IDs, split points, benchmark scores, prices) | run the real tool first — e.g. `pip install tiktoken` then encode the exact strings — and cite that output; if the value is only illustrative, say so on screen |
| The narration says one thing while the picture shows another | `check.js` cannot catch this: read each SEG's line against its scene, keep one claim per segment, and put comparisons inside the segment that actually draws both sides |
