---
name: making-canvas-explainer-videos
description: Use when the user wants a short explainer/科普 animation or video (math, algorithms, AI agents, system flows, any concept) generated purely from code with no external images or audio assets, optionally with background music and voice narration (配音/解说/背景音乐), or exported to MP4. Not for live-action footage, real image/audio assets, or editing long-form video.
metadata:
  short-description: 用纯代码 Canvas 做带解说的科普动画并导出 MP4
---

# 用纯代码制作科普动画视频

## 概述
单文件 HTML + Canvas 绘制每一帧，Web Audio 合成背景音乐，TTS 生成解说，再由 Playwright 逐帧导出、ffmpeg 混音封装成 MP4。
**核心原则：画面是帧号的纯函数**（`renderFrame(n)`），这样实时播放与逐帧导出完全一致、可复现。

## 何时使用 / 不使用
- 用：概念讲解短片（15~90s）、流程/架构动画、数学可视化、带解说的教学视频、“不用任何素材”的动画
- 不用：需要真人出镜/实拍；需要真实图片素材；长视频剪辑（用剪辑软件）

## 工作流
0. `node <skill>/scripts/doctor.js` —— 依赖自检。缺什么、怎么装会一次打印出来（加 `--browser` 可真启动一次浏览器验证）。**首次用这个技能时先跑它**，否则要到导出阶段才报错。
1. 复制 `template.html` 到目标目录，**只改【本集内容】区块**：`TITLE / INTRO / SEG / NARRATION / scene(t)`。模板自带可运行示例（HTTP 请求旅程），先跑通再改。
2. `node <skill>/scripts/check.js page.html` —— 渲染全部帧查运行时错误、校验时间轴（SEG 连续性 + 解说与分段对齐）、估算每句解说是否放得下、导出预览图（`preview/`）。**退出码非 0 就是有问题，修到全部 `✓` 再往下走**；同时看预览图确认没有布局重叠。
3. `node <skill>/scripts/make-video.js page.html` —— 输出 `page.mp4`（`--help` 查参数：`--voice` 换声音、`--reuse` 复用帧只重做音频、`--format png` 无损帧、`--quality`）。
4. 用 ffprobe 验证时长/音轨，然后把产物的**绝对路径**告诉用户。

依赖（首次，缺哪条装哪条；`doctor.js` 会替你判断）：
- `npm i -g playwright` —— 导出与自检必需；浏览器自动回退到系统 Edge/Chrome，无需 `playwright install`
- ffmpeg + ffprobe —— 必需；Windows `winget install Gyan.FFmpeg`，macOS `brew install ffmpeg`，Linux 用包管理器。脚本会自行搜索 PATH / WinGet / choco / scoop / 常见目录
- `python -m pip install edge-tts` —— 神经网络中文语音（需联网）。没有它不会失败，但会退回系统离线语音，**音色与浏览器预览不同**

## 设计规则
| 规则 | 原因 |
|---|---|
| 画面只依赖 `t`；禁止 `Math.random()`/`Date.now()`（用固定种子 `rnd`） | 逐帧导出可复现 |
| 用 `prog/vis/ease` 编排时间轴；每个 SEG 段一个视觉焦点 | 节奏清晰，淡入淡出不跳变 |
| `SEG` 必须首尾相接覆盖 `0 ~ DURATION`，且每句解说的起点落在它描述的那段里 | 有空档或错位时字幕/配色/右上阶段面板会静默错位（视频照常导出）；`check.js` 会逐条校验 |
| 实时数值（角度、计数、token 等）在 `scene(t)` 中每帧计算 | 不能写死 |
| 有解说时 `SCALE = 2.0`；每句字数 ≤ 窗口秒数 × 4.6（中文） | 原动画节奏太快，放不下解说 |
| 时长 15~90s（有解说时 `DURATION` ≤ 45）；超过 60s 时 SEG 控制在 6~8 段，每段 ≤ 15s；更长的内容拆成多集 | 单文件 `scene(t)` 过长难维护，观众注意力也有限 |
| 安全区：标题/字幕 y<110，进度条 y>675，右上面板 x>920 | 避免与公共元素重叠 |
| 输出分辨率 = canvas 的 `width/height` 属性（与代码里的 `W/H` 一致）；要竖版 9:16 就同时改这两处 | 脚本的 viewport 只影响预览与截图布局，不影响导出分辨率 |

## 常见错误
| 现象 | 修复 |
|---|---|
| 逐帧截图极慢（元素 `screenshot`） | 用脚本里的 canvas `toDataURL` + JPEG + 多页并行（快约 10 倍） |
| 浏览器打开没声音 | 浏览器禁止自动播放，模板用“点击播放”遮罩启动音频 |
| 某句解说被加速得很明显（> x1.25） | 缩短该句或拉长对应 SEG，重新 `check.js` |
| PowerShell 命令里写中文后变成乱码 | 中文写进文件，再由 Node 读取/拼接；不要在 PS 命令行里内嵌中文 |
| `ffmpeg`/`ffprobe ENOENT` | winget 安装后不在 PATH，脚本会自动搜索；仍失败则手动加 PATH |
| 长任务被终端约 300s 超时打断 | 后台运行并重定向日志到文件，轮询日志/输出文件 |
| `Executable doesn't exist ... chromium` | 脚本已自动回退到系统 Edge/Chrome；仅当日志显示回退也失败时，才设 `PW_CHANNEL=msedge` 指定 |
| 解说音色和浏览器预览里听的不一样 | 说明 `edge-tts` 不可用（看导出日志 `[3/4]` 那行是 `edge-tts` 还是 `离线 TTS`）：`python -m pip install edge-tts` |
| edge-tts 报 `Cannot connect to host speech.platform.bing.com` | 网络被沙箱/代理拦了（edge-tts 必须联网）。放开网络重跑；已导出的帧加 `--reuse` 可直接复用 |
| 导出画面被拉伸变形 | 画幅改在 canvas 的 `width/height` 属性 + 代码里的 `W/H`，不要改 `<style>` 里的 `body.capture` 规则（那里已按 canvas 尺寸自适应） |
| 改完模板后画面还是旧的 | `--reuse` 复用了旧帧；脚本用文件指纹判断，正常情况下会自动重导，仍不对就删掉 `%TEMP%\canvas-video-<名字>` 目录 |

