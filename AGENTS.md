# AGENTS.md

本仓库是一个 **Agent Skill**：用纯代码生成带中文解说和背景音乐的科普动画视频（无任何图片/音频素材）。

## 给任何 AI agent 的入口说明

- 技能本体在 `making-canvas-explainer-videos/`，入口是 `SKILL.md`。**要用它就先完整读 `SKILL.md`**：工作流、设计规则、安全区、常见错误都在里面。
- 三条命令就是全部流程（Node 必需，浏览器用系统 Edge/Chrome）：

```bash
node making-canvas-explainer-videos/scripts/doctor.js                     # 依赖自检：缺什么、怎么装
node making-canvas-explainer-videos/scripts/check.js my-video/page.html   # 全帧自检 + 预览图（退出码非 0 = 有问题）
node making-canvas-explainer-videos/scripts/make-video.js my-video/page.html
```

- 做新视频：复制 `making-canvas-explainer-videos/template.html` 到目标目录，**只改【本集内容】区块**（`TITLE / INTRO / SEG / NARRATION / scene(t)`），背景、工具函数、音乐合成、播放与导出接口保持不动。
- 可参考 `examples/tcp-handshake/page.html`（40 秒示例，成片在同目录）。

## 不可破坏的约定（改代码时）

- 画面是**帧号的纯函数**：`renderFrame(n)` 内不得出现 `Math.random()` / `Date.now()`，实时数值一律由 `t` 推导。
- `SEG` 必须首尾相接覆盖 `0 ~ DURATION`；每句 `NARRATION` 的起点必须落在它描述的那个分段内（`check.js` 会逐条校验）。
- `window.VIDEO_META`（含 `fps/width/height/scale/duration/frames/narrationLead/narration/segs`）与 `window.musicWavBase64()` 是对外契约，`check.js`、`make-video.js` 和测试都依赖它。

## 改动后必须验证

```bash
node tests/syntax-check.js && node tests/skill-manifest.js && node tests/smoke-template.js && node tests/install-script.js
```

四个测试都不需要浏览器和网络，几秒跑完；CI 另有真实 Chromium 渲染任务。

装给别人用：`node install.mjs --target codex|claude|agents|all|project`，或 `--dir <任意技能目录>`。
