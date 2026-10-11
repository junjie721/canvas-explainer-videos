# AGENTS.md

This repository is an **Agent Skill** that builds narrated explainer videos purely from code
(single-file HTML + Canvas, synthesized music, TTS narration, ffmpeg export — no image or audio assets).

## Entry point for any AI agent

- The skill lives in `making-canvas-explainer-videos/` and its entry point is `SKILL.md`.
  **Read `SKILL.md` completely before using it** — the workflow, design rules, safe zones and known
  failure modes are all there.
- Three commands are the whole pipeline (Node is required; the browser falls back to system Edge/Chrome):

```bash
node making-canvas-explainer-videos/scripts/doctor.js                     # dependency check: what is missing, how to install it
node making-canvas-explainer-videos/scripts/check.js my-video/page.html   # render every frame + previews (non-zero exit = problem)
node making-canvas-explainer-videos/scripts/make-video.js my-video/page.html
```

- To make a new video: copy `making-canvas-explainer-videos/template.html` into your working directory and
  edit **only the CONTENT section** (`TITLE / INTRO / SEG / NARRATION / scene(t)`). The background, helpers,
  music synthesis, playback and export interface stay untouched.
- A complete worked example is `examples/tcp-handshake/page.html` (40s, Chinese narration; the exported
  video sits next to it).

## Invariants — do not break these

- The picture is a **pure function of the frame number**: no `Math.random()` / `Date.now()` inside
  `renderFrame(n)`; every live value is derived from `t`.
- The `SEG` entries must tile `0 ~ DURATION` without gaps, and every `NARRATION` line must start inside the
  segment it describes (`check.js` verifies both and fails the run otherwise).
- `window.VIDEO_META` (`fps/width/height/scale/duration/frames/narrationLead/narration/segs`) and
  `window.musicWavBase64()` are the contract used by `check.js`, `make-video.js` and the tests.
- Every concrete number, ID, version or price that appears on screen must come from a real tool run,
  or be labelled as illustrative. `check.js` validates timing, layout and reproducibility — never facts.

## Verify any change

```bash
node tests/syntax-check.js && node tests/skill-manifest.js && node tests/smoke-template.js && node tests/install-script.js
```

All four run without a browser or network in a couple of seconds; CI additionally renders the example
with a real Chromium.

Install it somewhere: `node install.mjs --target codex|claude|agents|all|project`, or `--dir <skills-dir>`.
