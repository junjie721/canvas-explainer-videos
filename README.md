# 用纯代码做科普动画视频 · Codex Skill

[![CI](https://github.com/junjie721/making-canvas-explainer-videos/actions/workflows/ci.yml/badge.svg)](https://github.com/junjie721/making-canvas-explainer-videos/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**一句话**：写一段 HTML + Canvas 代码，生成带中文解说和背景音乐的科普动画，直接导出 MP4——不需要任何图片/音频素材，也不需要剪辑软件。

![演示：TCP 三次握手](docs/demo.gif)

> 上面是 40 秒成片 [examples/tcp-handshake/tcp-handshake.mp4](examples/tcp-handshake/tcp-handshake.mp4) 的节选，示例源码在 [examples/tcp-handshake/page.html](examples/tcp-handshake/page.html)。

## 它能做什么

- 15~90 秒的概念讲解短片：算法、数学、AI Agent、系统流程、网络协议……任意主题
- 画面和背景音乐全部由代码生成（音乐是纯代码合成，结果可复现，无版权素材）
- 可选语音解说：解说时长自动适配画面节奏，太长会**报错提醒**，不会悄悄加速或截断
- 逐帧导出 → ffmpeg 混音（解说时自动压低音乐）→ MP4；横版/竖版都能改
- 画面是**帧号的纯函数**（`renderFrame(n)`），所以实时预览和逐帧导出完全一致、每次导出结果相同

## 三步上手

### 1. 安装技能

**方式 A：复制到 Codex 技能目录（最直接）**

```bash
git clone https://github.com/junjie721/making-canvas-explainer-videos.git

# macOS / Linux
mkdir -p ~/.codex/skills && cp -r making-canvas-explainer-videos/making-canvas-explainer-videos ~/.codex/skills/
```

```powershell
# Windows PowerShell
git clone https://github.com/junjie721/making-canvas-explainer-videos.git
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Copy-Item "making-canvas-explainer-videos\making-canvas-explainer-videos" "$env:USERPROFILE\.codex\skills\" -Recurse
```

装好后**下一轮对话**里技能就会出现在可用列表中。

**方式 B：让 Codex 自己装**（用自带的 `skill-installer`）

> 用 skill-installer 从这个仓库安装技能：https://github.com/junjie721/making-canvas-explainer-videos/tree/main/making-canvas-explainer-videos

**方式 C：手动**——把 `making-canvas-explainer-videos/` 整个目录放到 `<用户目录>/.codex/skills/` 下即可，目录名要和 `SKILL.md` 里的 `name` 一致。

**一条命令装（适合所有支持 SKILL.md 的工具）**

```bash
node install.mjs                    # 默认 Codex：~/.codex/skills
node install.mjs --target claude    # Claude Code：~/.claude/skills
node install.mjs --target all       # codex + claude + agents 都装
node install.mjs --target project   # 项目级：./.claude/skills、./.codeartsdoer/skills
node install.mjs --dir <技能目录>    # 自定义位置（例如 --dir .github/skills）
```

### 其他 AI agent 能用吗？

能。技能本体不依赖任何一家工具的特有接口：`SKILL.md` 是通用的 Markdown + YAML frontmatter（只有 `name` 和 `description` 是必需的），脚本是普通 Node，模板是普通 HTML。区别只在**各工具从哪里发现技能**：

| 工具 | 技能目录 |
|---|---|
| Codex | `~/.codex/skills/`（Windows：`%USERPROFILE%\.codex\skills\`） |
| Claude Code | `~/.claude/skills/`（个人级）或 `<项目>/.claude/skills/`（项目级） |
| 其他读 `SKILL.md` 的 agent | 按它的文档指定目录 |

- 项目级安装用 `node install.mjs --target project`（默认装当前目录，`--project <路径>` 可指定别的项目）。注意项目级技能会跟着仓库走：想随项目提交就 `git add`，不想提交就写进 `.gitignore`。
- **不支持 skills 机制的 agent**（或你只想让它照着做）：把 `SKILL.md` 内容给它，让它按里面的工作流执行就行——所有命令都是标准 CLI，不依赖任何专有 API。仓库根目录还有 `AGENTS.md`，多数会读 `AGENTS.md` 的工具（Codex、opencode、Cursor、Zed 等）打开这个仓库就能自动看到入口说明。
- **完全不用 agent**：`doctor.js → check.js → make-video.js` 三条命令就是全部流程，自己手写 `scene(t)` 一样能出片。
- `agents/openai.yaml` 只是 Codex 的界面元数据（显示名、默认提示语），其他工具会忽略它，删掉也不影响功能。
- 各家工具的技能目录与支持情况变化较快，上表路径请以你所用工具的最新官方文档为准。

### 2. 装依赖（一次就好）

```bash
node making-canvas-explainer-videos/scripts/doctor.js
```

这条命令会告诉你缺什么、怎么装。需要三个东西：

| 依赖 | 必需 | 用途 | Windows | macOS | Linux |
|---|---|---|---|---|---|
| Playwright | ✅ | 逐帧渲染 | `npm i -g playwright` | 同左 | 同左 |
| ffmpeg / ffprobe | ✅ | 混音与编码 | `winget install Gyan.FFmpeg` | `brew install ffmpeg` | `sudo apt install ffmpeg` |
| edge-tts | 建议 | 神经网络中文语音 | `python -m pip install edge-tts` | 同左 | 同左 |

浏览器不用额外装：脚本会自动回退到系统 Edge / Chrome（`PW_CHANNEL=chrome|msedge` 可强制指定）。

装不上 ffmpeg？`doctor.js` 会在 PATH、WinGet、Chocolatey、Scoop 和常见目录里找。实在不行可以用 npm 上的二进制包兜底（Windows 实测有效）：

```powershell
npm i -g @ffmpeg-installer/win32-x64 @ffprobe-installer/win32-x64
$bin = "$env:LOCALAPPDATA\Programs\ffmpeg\bin"; New-Item -ItemType Directory -Force $bin | Out-Null
$root = (npm root -g).Trim()
Copy-Item "$root\@ffmpeg-installer\win32-x64\ffmpeg.exe" $bin -Force
Copy-Item "$root\@ffprobe-installer\win32-x64\ffprobe.exe" $bin -Force
```

### 3. 让它生成视频

在 Codex 里直接说需求就行：

> 用 making-canvas-explainer-videos 做一条 40 秒的「TCP 三次握手」科普视频，要中文解说。

也可以完全绕开 Codex，直接命令行用：

```bash
cp making-canvas-explainer-videos/template.html my-video/page.html   # 复制模板
# 只改 page.html 里的【本集内容】区块：TITLE / INTRO / SEG / NARRATION / scene(t)

node making-canvas-explainer-videos/scripts/check.js my-video/page.html        # 全帧自检 + 预览图
node making-canvas-explainer-videos/scripts/make-video.js my-video/page.html   # 导出 my-video/page.mp4
```

## 命令行参数

**`check.js <page.html>`** —— 几秒内渲染全部帧、校验时间轴、估算解说时长、导出预览图到 `preview/`。
退出码非 0 就是有问题（运行时错误 / 解说超长 / 时间轴不连续 / 解说与分段错位），改到全绿再导出。

**`make-video.js <page.html>`** —— 导出 MP4。

| 参数 | 说明 |
|---|---|
| `--voice <name>` | edge-tts 音色，默认 `zh-CN-XiaoxiaoNeural`（男声 `zh-CN-YunxiNeural`，英文 `en-US-AriaNeural`） |
| `--rate +5%` | 语速，默认 `+5%` |
| `--out x.mp4` | 输出路径 |
| `--reuse` | 复用上次导出的帧，只重做音频（改了模板会自动失效重导） |
| `--format png` | 无损帧，文字特别多时更清晰（体积更大） |
| `--quality 0.95` | JPEG 质量 |
| `--workers 4` | 并行导帧的页面数 |
| `--keep` | 保留中间帧和音频 |

**`doctor.js [--browser]`** —— 依赖自检，`--browser` 会真启动一次浏览器验证。

## 工作原理

1. `template.html` 是**单文件**：背景、工具函数、音乐合成、播放、导出接口都现成，你只改【本集内容】。
2. 画面写成一个纯函数 `scene(t)`，`t` 是动画时间轴秒数；`SEG` 定义分段字幕，`NARRATION` 定义解说。
3. `renderFrame(n)` 把帧号映射成画面，所以可用 `canvas.toDataURL` 逐帧导出，多页面并行（比元素截图快约 10 倍）。
4. 背景音乐用 Web Audio 的数学函数合成，语音用 edge-tts 生成，最后由 ffmpeg 对齐、混音、编码。
5. 解说的起点都由 `SCALE` 换算到真实时间，`check.js` 会验证每句解说落在它描述的那个分段里。

## 常见问题

**导出时报 `找不到 playwright` / `找不到 ffmpeg`** → 先跑 `doctor.js`，它会打印对应的安装命令。

**成片的声音和浏览器预览里听得不一样** → 说明 `edge-tts` 不可用，回退成了系统离线语音。看导出日志 `[3/4]` 那行是 `edge-tts` 还是 `离线 TTS`，然后 `python -m pip install edge-tts`。

**报 `Cannot connect to host speech.platform.bing.com`** → edge-tts 需要联网，你的环境（沙箱/代理）拦了。放开网络重跑，加 `--reuse` 可以直接复用已经导出的帧。

**ffmpeg 版本很旧怎么办** → 脚本会自动适配老版本 `amix` 没有 `normalize`、以及声道布局推断的差异（日志会提示"已改用 volume 补偿"），功能不受影响。想升级就换成较新的 ffmpeg 放回同一位置。

**某句解说被标成"过长"** → `check.js` 会算每句的窗口和预估时长：缩短文案，或者把对应 `SEG` 拉长，然后重新 `check.js`。

**想改画幅（比如抖音竖版 9:16）** → 改 `canvas` 的 `width/height` 属性，以及代码里的 `W/H`，两处保持一致即可；脚本的 viewport 只影响预览，导出分辨率由 canvas 决定。

**导出被终端超时打断** → 帧已经导好了，加 `--reuse` 重跑即可只重做音频；长任务建议后台运行并把日志重定向到文件。

## 目录结构

```text
.
|-- making-canvas-explainer-videos/     # 技能本体（装进 ~/.codex/skills/ 的就是这个目录）
|   |-- SKILL.md                        # 技能说明（Codex 加载的入口）
|   |-- template.html                   # 单文件模板：改它就够了
|   |-- agents/openai.yaml              # UI 显示名 / 默认提示语
|   `-- scripts/
|       |-- doctor.js                   # 依赖自检
|       |-- check.js                    # 全帧自检 + 预览图
|       |-- make-video.js               # 导出 MP4
|       `-- lib.js                      # 浏览器/ffmpeg/Python 定位与时间轴校验
|-- examples/tcp-handshake/             # 可跑通示例（含 40 秒成片）
|-- docs/demo.gif                       # README 用的演示图
|-- install.mjs                         # 一条命令装进各 agent 的技能目录
|-- AGENTS.md                           # 给任何 AI agent 的仓库入口说明
`-- tests/                              # 无需浏览器/网络的冒烟测试（CI 用）
```

## 参与开发

```bash
node tests/syntax-check.js     # 脚本语法
node tests/skill-manifest.js   # 技能包结构（frontmatter、命名、文档与脚本不漂移）
node tests/smoke-template.js   # 逐帧渲染 + 时间轴 + 解说窗口 + 音乐确定性
node tests/install-script.js   # install.mjs 的安装/跳过/覆盖/自定义目录行为
```

四个测试都不需要浏览器和网络，几秒跑完；CI 还会额外用真实 Chromium 渲染示例的全部帧。

## License

[MIT](LICENSE) © 2026 WANG JUN

---

## English

**Codex skill: build explainer videos purely from code.** A single HTML + Canvas file draws every frame, Web Audio synthesizes the background music, TTS generates the narration, Playwright exports frames, and ffmpeg mixes everything into an MP4. No image or audio assets required.

```bash
git clone https://github.com/junjie721/making-canvas-explainer-videos.git
cp -r making-canvas-explainer-videos/making-canvas-explainer-videos ~/.codex/skills/     # Windows: copy into %USERPROFILE%\.codex\skills\
node making-canvas-explainer-videos/scripts/doctor.js            # check dependencies
node making-canvas-explainer-videos/scripts/check.js page.html   # render every frame + previews
node making-canvas-explainer-videos/scripts/make-video.js page.html
```

Requirements: Playwright (frame export; falls back to system Edge/Chrome), ffmpeg + ffprobe (mixing), and optionally `edge-tts` for neural narration — without it the export falls back to the OS voice.

The skill itself is tool-agnostic: `SKILL.md` uses the shared Markdown + YAML frontmatter format, and every step is a plain CLI command. Install it into whichever skills directory your agent reads (`node install.mjs --target codex|claude|agents|all`, or `--dir <path>`); agents without a skills mechanism can simply read `SKILL.md`.

Design invariant: the picture is a pure function of the frame number, so live preview and frame-by-frame export always match, and renders are reproducible.

MIT licensed © 2026 WANG JUN
