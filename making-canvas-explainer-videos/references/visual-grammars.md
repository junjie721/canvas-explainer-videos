# Visual grammars

Six scene archetypes for the CONTENT section of `template.html`. Pick **one primary grammar per video** —
videos that always use the pipeline shape start to look alike, and the shape you pick decides what the
audience can actually see.

All snippets assume the template's helpers (`box`, `text`, `arrow`, `packet`, `dot`, `panel`, `withA`,
`prog`, `vis`, `ease`, `typed`, `rgba`) and the safe zones: title/caption `y < 110`, right-top panel
`x > 920, y < 190`, progress bar `y > 675`. Keep the main scene between `y = 190` and `y = 660`.

---

## 1. Pipeline — "data moves through stages"

Use for request flows, build steps, agent loops. Weakness: it shows *order*, not *cause* — pair it with a
comparison or a "why" segment or the video stays shallow.

```js
  function scene(t) {
    const S = [
      { x: 60,  y: 300, w: 260, h: 120, title: 'Input',  sub: 'text',      col: C.user },
      { x: 480, y: 300, w: 260, h: 120, title: 'Process', sub: 'model',    col: C.think },
      { x: 900, y: 300, w: 300, h: 120, title: 'Output', sub: 'next token', col: C.obs }
    ];
    S.forEach((s, i) => {
      const on = t > 2.6 + i * 1.4;                       // light up stage by stage
      box(s.x, s.y, s.w, s.h, on ? s.col : C.slot, 1, { glow: on ? 12 : 3, fill: 'rgba(10, 18, 40, 0.82)' });
      text(s.title, s.x + 20, s.y + 44, on ? s.col : C.dim, `bold 22px ${SANS}`, 'left', 'middle');
      text(s.sub, s.x + 20, s.y + 82, C.dim, `14px ${MONO}`, 'left', 'middle');
    });
    for (let i = 0; i < S.length - 1; i++) {
      const y = S[i].y + S[i].h / 2;
      arrow(S[i].x + S[i].w + 8, y, S[i + 1].x - 8, y, C.text, 0.25, { dash: [6, 6], offset: -t * 26 });
    }
    packet(S[0].x + S[0].w, 360, S[1].x, 360, prog(t, 4.0, 5.0), C.user, 'data');   // one moving packet per step
    panel(930, 26, 320, [
      ['Stage', segAt(t).cap ? segAt(t).cap.slice(0, 1) : 'Intro', segAt(t).c],
      ['Step', t < 4 ? 'input' : t < 6 ? 'process' : 'output', C.think]
    ]);
  }
```

## 2. A/B comparison — "the same thing, two ways" ← most underused, usually the most instructive

Use when the lesson is a *difference*: two models, two algorithms, before/after, cost vs benefit.
Both sides must be on screen at the same time, and the difference has to be **countable**.

```js
  function scene(t) {
    const L = { x: 60, y: 230, w: 560, h: 240 }, R = { x: 660, y: 230, w: 560, h: 240 };
    const CW = 120, CH = 64, GAP = 10;
    const chip = (x, y, col, top, sub, alpha) => withA(alpha, () => {
      box(x, y, CW, CH, col, 1, { r: 10, fill: 'rgba(12, 20, 44, 0.92)', glow: 7 });
      text(top, x + CW / 2, y + 23, C.text, `bold 19px ${MONO}`, 'center', 'middle');
      text(sub, x + CW / 2, y + CH - 15, col, `12px ${MONO}`, 'center', 'middle');
    });
    const A = [['你好', '177519'], ['，', '979'], ['世界', '28428'], ['！', '3393']];
    const B = [['你', '57668'], ['好', '53901'], ['，', '3922'], ['e4 b8', '3574'], ['96', '244'], ['界', '98220'], ['！', '6447']];
    withA(prog(t, 2.6, 3.2), () => {
      [[L, 'Model A', '新词表', C.think, A, C.obs], [R, 'Model B', '旧词表', C.tool, B, C.err]].forEach(([card, title, sub, col, list, countCol]) => {
        box(card.x, card.y, card.w, card.h, col, 1, { fill: 'rgba(10, 18, 40, 0.85)', glow: 10 });
        text(title, card.x + 22, card.y + 34, col, `bold 22px ${SANS}`, 'left', 'middle');
        text(sub, card.x + 132, card.y + 35, C.dim, `14px ${MONO}`, 'left', 'middle');
        text(`${list.length} 块`, card.x + card.w - 22, card.y + 34, countCol, `bold 20px ${MONO}`, 'right', 'middle');
        list.forEach(([piece, id], i) => {
          const row = Math.floor(i / 4), col2 = i % 4;
          chip(card.x + 25 + col2 * (CW + GAP), 300 + row * (CH + 14), col, piece, id, prog(t, 3.2 + i * 0.12, 3.8 + i * 0.12));
        });
      });
      text('写一句结论：差异来自哪里，为什么它重要', W / 2, 520, C.obs, `bold 20px ${SANS}`, 'center', 'middle');
    });
  }
```

**Rules that make comparisons land:** same layout on both sides, same scale, identical labels; highlight
the *specific* cells that differ (a red outline beats a sentence); show the count as a number.

## 3. Scale / quantity — "how big is it really"

Use for costs, memory, context windows, latency budgets. One axis, one unit, numbers on screen.

```js
  function scene(t) {
    const rows = [['方案 A', 0.35, C.user], ['方案 B', 0.62, C.think], ['方案 C', 1.0, C.obs]];
    rows.forEach(([label, ratio, col], i) => {
      const y = 300 + i * 90, p = ease(prog(t, 2.8 + i * 0.5, 4.6 + i * 0.5));
      text(label, 150, y, C.text, `18px ${SANS}`, 'right', 'middle');
      ctx.save();
      ctx.fillStyle = rgba(col, 0.16); ctx.fillRect(170, y - 15, 820, 30);
      ctx.fillStyle = col; ctx.fillRect(170, y - 15, 820 * ratio * p, 30);
      ctx.restore();
      text(`${Math.round(ratio * p * 100)}%`, 1010, y, col, `bold 20px ${MONO}`, 'left', 'middle');
    });
    text('单位写清楚：占多少内存 / 花多少钱 / 慢多少毫秒', W / 2, 600, C.dim, `16px ${SANS}`, 'center', 'middle');
  }
```

## 4. State machine — "what state is it in now"

Use for connection lifecycles, retries, task status. Always show the *trigger* next to each transition.

```js
  function scene(t) {
    const ST = [['CLOSED', 190, 0], ['SYN_SENT', 450, 3], ['ESTABLISHED', 760, 6], ['CLOSING', 1060, 10]];
    const at = v => t >= v;
    ST.forEach(([label, x, when], i) => {
      const on = at(when), col = on ? C.obs : C.slot;
      dot(x, 330, 16, col, on ? 18 : 0);
      text(label, x, 380, on ? C.obs : C.dim, `bold 17px ${MONO}`, 'center', 'middle');
      if (i < ST.length - 1) {
        const nx = ST[i + 1][1];
        arrow(x + 26, 330, nx - 26, 330, on ? C.obs : C.slot, on ? 0.7 : 0.25, { dash: on ? null : [6, 6] });
        text(['发 SYN', '收 SYN+ACK', '发 ACK'][i] || '触发条件', (x + nx) / 2, 300, C.dim, `14px ${SANS}`, 'center', 'middle');
      }
    });
    panel(930, 26, 320, [['阶段', segAt(t).cap ? segAt(t).cap.slice(0, 1) : 'Intro', segAt(t).c], ['当前状态', t < 3 ? 'CLOSED' : t < 6 ? 'SYN_SENT' : t < 10 ? 'ESTABLISHED' : 'CLOSING', C.think]]);
  }
```

## 5. Hierarchy / tree — "who contains whom"

Use for file trees, DNS resolution order, model layers, org structures. Indentation plus connector lines
carry the meaning; never rely on colour alone.

```js
  function scene(t) {
    const NODES = [['/app', 0, 0], ['src', 1, 1.5], ['index.js', 2, 2.0], ['utils', 1, 2.8], ['test', 1, 3.6], ['app.test.js', 2, 4.2]];
    NODES.forEach(([name, depth, when]) => {
      const x = 240 + depth * 90, y = 260 + NODES.indexOf(NODES.find(n => n[0] === name)) * 0;   // compute your own y per node
      const alpha = prog(t, 2.6 + when, 3.2 + when);
      withA(alpha, () => {
        text(name, x, y, depth === 0 ? C.text : C.dim, `${depth === 0 ? 'bold ' : ''}17px ${MONO}`);
        if (depth) { ctx.save(); ctx.strokeStyle = 'rgba(120,150,220,0.35)'; ctx.beginPath(); ctx.moveTo(x - 70, y); ctx.lineTo(x - 14, y); ctx.stroke(); ctx.restore(); }
      });
    });
  }
```

(For a tree, lay the rows out with an explicit `y` per node in the data array — do not compute it with
`indexOf` like the sketch above.)

## 6. Progressive build — "add one layer at a time"

Use when the audience must understand how parts combine (a stack, an architecture, a proof). Each SEG
adds exactly one element and the previous ones stay visible, so the viewer can accumulate.

```js
  function scene(t) {
    const LAYERS = [['Model', C.agent, 2.6], ['Tool calls', C.tool, 6.0], ['Memory', C.think, 9.5], ['Guardrails', C.obs, 13.0]];
    LAYERS.forEach(([label, col, when], i) => {
      const a = prog(t, when, when + 0.6);
      withA(a, () => {
        box(320, 520 - i * 70, 640, 60, col, 1, { fill: 'rgba(12, 20, 44, 0.9)', glow: 8 });
        text(label, 344, 520 - i * 70 + 30, col, `bold 20px ${SANS}`, 'left', 'middle');
        text(`第 ${i + 1} 层`, 936, 520 - i * 70 + 30, C.dim, `14px ${MONO}`, 'right', 'middle');
      });
    });
  }
```

---

## Choosing one

| The lesson is… | Grammar |
|---|---|
| a sequence of steps | 1 pipeline |
| a difference between two things | 2 comparison |
| a magnitude, cost or limit | 3 scale |
| something that changes state over time | 4 state machine |
| containment or resolution order | 5 hierarchy |
| how parts compose into a whole | 6 progressive build |

If two grammars fit, favour the **comparison**: a countable difference is the easiest thing to remember,
and it forces you to name what actually differs.
