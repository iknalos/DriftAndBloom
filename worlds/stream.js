// ============================================================================
// Drift & Bloom — STREAM WEAVER (Adventure round 5). Pipe Dream, our way.
// A dry desert canyon and a spring that is about to open. Tap a sand tile to lay the next carved
// channel from the queue; tap a laid (still dry) channel to swap it for the next one. When the
// countdown ends Rill the little water dragon swims the water front through your channels — every
// tile it passes turns from parched sand into green oasis, every dry bloom it reaches bursts into
// flower — and it must reach the lotus pool. A dead end spills the stream. ⏩ opens the spring early.
// Later stages: shorter countdowns, a faster stream, rocks, fixed ancient channels to route through.
// ============================================================================
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const N = 1, E = 2, S = 4, Wd = 8;                           // channel openings
  const D = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [Wd]: [-1, 0] };
  const OPP = { [N]: S, [S]: N, [E]: Wd, [Wd]: E };
  const PIECES = {
    h: E | Wd, v: N | S, ne: N | E, es: E | S, sw: S | Wd, wn: Wd | N, x: N | E | S | Wd
  };
  const KINDS = ['h', 'v', 'ne', 'es', 'sw', 'wn', 'x'];
  const AREA = { x: 10, y: 132, w: 370, h: 452 };

  DABWorlds.register('stream', {
    title: 'Stream Weaver', color: '90,200,255',
    music: 'music_stream',
    sounds: ['place', 'swap', 'gush', 'spill', 'tick', 'chirp', 'bloom', 'gate'],
    subtitle: () => 'Rill the water dragon waits at a desert spring. Carve him a way to the lotus pool.',
    hint: 'Lay the channels before the spring opens — reach the lotus, water every bloom',
    howto: ['Tap sand: lay the next channel  ·  tap a dry channel: swap it', 'The water follows your channels — a dead end spills it',
            '⏩ opens the spring early for a bonus'],
    controls: { dirs: 'none', buttons: [{ id: 'special', icon: 'dash' }], touch: true },
    create
  });

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ── level: grid, spring, lotus, rocks, blooms, fixed channels; always routable ──
  function makeLevel(LV, seed) {
    const r = rng(seed * 977 + LV * 61);
    const cols = Math.min(9, 6 + Math.floor(LV / 3)), rows = Math.min(11, 7 + Math.floor(LV / 2.5));
    for (let tries = 0; tries < 60; tries++) {
      const G = Array.from({ length: rows }, () => Array(cols).fill(null));
      const sy = 1 + Math.floor(r() * (rows - 2)), ly = 1 + Math.floor(r() * (rows - 2));
      const spring = { x: 0, y: sy, out: E }, lotus = { x: cols - 1, y: ly, inn: Wd };
      if (LV >= 4 && r() < 0.5) { spring.x = 1 + Math.floor(r() * (cols - 2)); spring.y = 0; spring.out = S; lotus.x = 1 + Math.floor(r() * (cols - 2)); lotus.y = rows - 1; lotus.inn = N; }
      const rocks = new Set();
      const nRocks = Math.min(Math.floor(cols * rows * 0.2), LV >= 2 ? 2 + LV : 0);
      for (let i = 0; i < nRocks; i++) {
        const x = Math.floor(r() * cols), y = Math.floor(r() * rows);
        if ((x === spring.x && y === spring.y) || (x === lotus.x && y === lotus.y)) continue;
        rocks.add(x + ',' + y);
      }
      // a route must exist (the tile in front of the spring through to the tile before the lotus)
      const [sdx, sdy] = D[spring.out], [ldx, ldy] = D[lotus.inn];
      const a = { x: spring.x + sdx, y: spring.y + sdy }, b = { x: lotus.x + ldx, y: lotus.y + ldy };
      const ok = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && !rocks.has(x + ',' + y) && !(x === spring.x && y === spring.y) && !(x === lotus.x && y === lotus.y);
      if (!ok(a.x, a.y) || !ok(b.x, b.y)) continue;
      const prev = new Map([[a.x + ',' + a.y, null]]), q = [a];
      while (q.length) {
        const c = q.shift();
        if (c.x === b.x && c.y === b.y) break;
        const dirs = [N, E, S, Wd].sort(() => r() - 0.5);
        for (const d of dirs) { const nx = c.x + D[d][0], ny = c.y + D[d][1], k = nx + ',' + ny; if (ok(nx, ny) && !prev.has(k)) { prev.set(k, c); q.push({ x: nx, y: ny }); } }
      }
      if (!prev.has(b.x + ',' + b.y)) continue;
      const path = []; for (let c = b; c; c = prev.get(c.x + ',' + c.y)) path.unshift(c);
      const minLen = 3 + Math.floor(LV / 2);
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < minLen && tries < 50) continue;
      // blooms: on free tiles near the route (one of them on it), harder ones farther off
      const blooms = [];
      const onPath = path[Math.floor(path.length / 2)];
      blooms.push({ x: onPath.x, y: onPath.y });
      for (let i = 0; i < 40 && blooms.length < 3; i++) {
        const p = path[Math.floor(r() * path.length)], ox = Math.round((r() - 0.5) * (2 + LV * 0.3)), oy = Math.round((r() - 0.5) * (2 + LV * 0.3));
        const x = p.x + ox, y = p.y + oy;
        if (ok(x, y) && !blooms.some(q2 => q2.x === x && q2.y === y)) blooms.push({ x, y });
      }
      // fixed ancient channels on the route (stage 4+): you must build through them
      const fixed = [];
      if (LV >= 4 && path.length > 4) {
        const nFix = Math.min(3, 1 + Math.floor((LV - 4) / 2));
        for (let i = 0; i < nFix; i++) {
          const k = 1 + Math.floor(r() * (path.length - 2));
          const p = path[k], from = path[k - 1], to = path[k + 1];
          const inD = dirTo(p, from), outD = dirTo(p, to);
          const m = inD | outD;
          const kind = Object.keys(PIECES).find(n => PIECES[n] === m) || 'x';
          if (!fixed.some(f => f.x === p.x && f.y === p.y) && !blooms.some(q2 => q2.x === p.x && q2.y === p.y)) fixed.push({ x: p.x, y: p.y, kind });
        }
      }
      return { cols, rows, spring, lotus, rocks, blooms, fixed, path };
    }
    return { cols: 6, rows: 7, spring: { x: 0, y: 3, out: E }, lotus: { x: 5, y: 3, inn: Wd }, rocks: new Set(), blooms: [{ x: 2, y: 3 }], fixed: [], path: [] };
  }
  function dirTo(a, b) { return b.x > a.x ? E : b.x < a.x ? Wd : b.y > a.y ? S : N; }

  // ── art ──
  let ART = null;
  function sprite(w, h, fn) { const R = 2, cv = document.createElement('canvas'); cv.width = w * R; cv.height = h * R; const g = cv.getContext('2d'); g.scale(R, R); fn(g); return cv; }
  function buildArt() {
    const r = rng(9);
    const sand = [0, 1, 2, 3].map(v => sprite(64, 64, g => {
      const gr = g.createLinearGradient(0, 0, 64, 64);
      gr.addColorStop(0, ['#f2d29c', '#eecb92', '#f0d5a3', '#ecc68b'][v]); gr.addColorStop(1, '#dfb06f');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,245,220' : '160,110,60'},${0.12 + r() * 0.18})`; g.fillRect(r() * 64, r() * 64, 1 + r() * 1.5, 1 + r() * 1.5); }
      g.strokeStyle = 'rgba(170,120,70,0.25)'; g.lineWidth = 1;                       // wind ripples
      for (let k = 0; k < 3; k++) { const y = 12 + k * 18 + r() * 6; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(20, y - 4, 40, y + 4, 64, y - 1); g.stroke(); }
      g.fillStyle = 'rgba(120,80,40,0.12)'; g.fillRect(0, 62, 64, 2); g.fillRect(62, 0, 2, 64);
    }));
    const green = [0, 1].map(v => sprite(64, 64, g => {
      const gr = g.createLinearGradient(0, 0, 64, 64); gr.addColorStop(0, '#8fd06a'); gr.addColorStop(1, '#5fae4f');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 90; i++) { const x = r() * 64, y = r() * 64; g.strokeStyle = `rgba(${r() < 0.5 ? '40,120,40' : '170,230,120'},0.6)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke(); }
      for (let i = 0; i < 5; i++) { const x = 6 + r() * 52, y = 6 + r() * 52; g.fillStyle = ['#fff3a0', '#ffb3d1', '#ffffff'][i % 3]; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); }
    }));
    const rock = sprite(64, 64, g => {
      g.fillStyle = 'rgba(90,50,20,0.3)'; g.beginPath(); g.ellipse(36, 44, 26, 14, 0, 0, TAU); g.fill();
      const layers = ['#c98a55', '#b77443', '#d9a06a', '#a7663a'];
      for (let k = 0; k < 4; k++) {
        g.fillStyle = layers[k];
        g.beginPath(); g.moveTo(8 + k * 2, 46 - k * 8); g.lineTo(14 + k * 3, 30 - k * 7); g.lineTo(50 - k * 3, 27 - k * 7); g.lineTo(58 - k * 2, 44 - k * 8); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(255,240,210,0.35)'; g.fillRect(20, 10, 22, 2);
    });
    ART = { sand, green, rock };
  }

  function create(env) {
    if (!ART) buildArt();
    const W = env.W, LV = env.level, fx = env.fx;
    const sfx = (n, o) => env.sfx(n, o);
    const COUNT = Math.max(9, 30 - LV * 2.2);                   // seconds before the spring opens
    const FLOW = 0.32 + LV * 0.055;                               // tiles per second once it flows
    let seed = 1, L, grid, CELL, OX, OY, queue, phase = 'build', countT = COUNT, t = 0, swaps = 0, early = 0;
    let front = null, filled = [], watered = new Set(), bloomed = new Set(), done = false, spillAt = null, rillAngle = 0, msg = '', msgT = 0;
    const r = rng(LV * 33 + 7);
    const drawPiece = () => { const w = [3, 3, 2.2, 2.2, 2.2, 2.2, LV >= 3 ? 1.2 : 0.9]; let s = 0, k = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < KINDS.length; i++) { s += w[i]; if (k <= s) return KINDS[i]; } return 'h'; };

    function load() {
      L = makeLevel(LV, seed);
      grid = Array.from({ length: L.rows }, () => Array(L.cols).fill(null));
      for (const f of L.fixed) grid[f.y][f.x] = { kind: f.kind, fixed: true, wet: 0 };
      CELL = Math.floor(Math.min(64, AREA.w / L.cols, AREA.h / L.rows));
      OX = Math.round(AREA.x + (AREA.w - L.cols * CELL) / 2); OY = Math.round(AREA.y + (AREA.h - L.rows * CELL) / 2);
      queue = Array.from({ length: 5 }, drawPiece);
      phase = 'build'; countT = COUNT; front = null; filled = []; watered = new Set(); bloomed = new Set(); spillAt = null;
    }
    load();
    const cx = x => OX + x * CELL + CELL / 2, cy = y => OY + y * CELL + CELL / 2;
    const isRock = (x, y) => L.rocks.has(x + ',' + y);
    const isSpring = (x, y) => x === L.spring.x && y === L.spring.y;
    const isLotus = (x, y) => x === L.lotus.x && y === L.lotus.y;
    function say(s) { msg = s; msgT = 2; }

    function place(x, y) {
      if (x < 0 || y < 0 || x >= L.cols || y >= L.rows || isRock(x, y) || isSpring(x, y) || isLotus(x, y)) return;
      const cell = grid[y][x];
      if (cell && (cell.fixed || cell.wet > 0 || filled.some(f => f.x === x && f.y === y))) { sfx('tick', { vol: 0.3, rate: 0.7 }); return; }
      const kind = queue.shift(); queue.push(drawPiece());
      if (cell) { swaps++; sfx('swap', { vol: 0.7 }); burst(cx(x), cy(y), '200,160,110', 10); }
      else sfx('place', { vol: 0.75, rate: 0.9 + Math.random() * 0.2 });
      grid[y][x] = { kind, fixed: false, wet: 0, pop: 1 };
    }
    // ── the water front ──
    function startFlow() {
      phase = 'flow';
      const [dx, dy] = D[L.spring.out];
      front = { x: L.spring.x + dx, y: L.spring.y + dy, inn: OPP[L.spring.out], k: 0 };
      sfx('gush', { vol: 0.9 }); env.shake(0.12);
    }
    function exitOf(cell, inn) {
      const m = PIECES[cell.kind];
      if (!(m & inn)) return 0;
      if (cell.kind === 'x') return OPP[inn];                    // straight through a crossing
      return m & ~inn;
    }
    function advance(dt) {
      front.k += dt * FLOW * (early > 0 ? 1 : 1);
      while (front.k >= 1 && !done) {
        front.k -= 1;
        const { x, y, inn } = front;
        // reaching the lotus
        if (isLotus(x, y)) { if (inn === L.lotus.inn) { win(); return; } spill(x, y); return; }
        const cell = x >= 0 && y >= 0 && x < L.cols && y < L.rows ? grid[y][x] : null;
        const out = cell ? exitOf(cell, inn) : 0;
        if (!out) { spill(x, y); return; }
        cell.wet = 1; filled.push({ x, y, inn, out });
        watered.add(x + ',' + y);
        for (const b of L.blooms) if (b.x === x && b.y === y && !bloomed.has(x + ',' + y)) { bloomed.add(x + ',' + y); sfx('bloom', { vol: 0.85 }); burst(cx(x), cy(y), '255,170,220', 26); env.floatText(cx(x), cy(y) - 20, '✿', '255,200,235'); }
        if (Math.random() < 0.3) sfx('chirp', { vol: 0.3, rate: 0.9 + Math.random() * 0.4 });
        const [dx, dy] = D[out];
        front = { x: x + dx, y: y + dy, inn: OPP[out], k: front.k };
      }
      // a dead end ahead? the stream will spill there
      if (!done) {
        const { x, y, inn } = front;
        const cell = !isLotus(x, y) && x >= 0 && y >= 0 && x < L.cols && y < L.rows ? grid[y][x] : null;
        if (!isLotus(x, y) && (!cell || !exitOf(cell, inn)) && front.k > 0.55 && !spillAt) { spillAt = { x, y }; say('Quick — the stream needs a channel!'); }
        if (spillAt && cell && exitOf(cell, inn)) spillAt = null;
      }
    }
    function spill(x, y) {
      done = true; sfx('spill', { vol: 0.9 }); env.shake(0.25);
      const px = Math.max(OX, Math.min(OX + L.cols * CELL, cx(x))), py = Math.max(OY, Math.min(OY + L.rows * CELL, cy(y)));
      for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 120; fx.spawn({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 300, kind: 'spark', size: 2.4, life: 0.6, rgb: '120,200,255' }); }
      say('The stream spilled into the sand…');
      setTimeout(() => env.lose(), 1200);
    }
    function win() {
      done = true; sfx('gate', { vol: 0.9 }); env.flash('180,240,255', 0.4);
      burst(cx(L.lotus.x), cy(L.lotus.y), '255,200,235', 40);
      if (env.round) {
        const all = bloomed.size >= L.blooms.length;
        env.setStars(all ? 3 : bloomed.size >= 1 ? 2 : 1);
      }
      setTimeout(() => env.win(), 900);
    }
    function burst(x, y, rgb, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 30 + Math.random() * 110; fx.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 160, kind: 'spark', size: 1.8, life: 0.45 + Math.random() * 0.3, rgb }); }
    }

    function update(dt, I) {
      t += dt; msgT = Math.max(0, msgT - dt);
      for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) { const c = grid[y][x]; if (c && c.pop) c.pop = Math.max(0, c.pop - dt * 4); }
      for (const tp of I.taps) {
        if (phase === 'done') break;
        const gx = Math.floor((tp.x - OX) / CELL), gy = Math.floor((tp.y - OY) / CELL);
        place(gx, gy);
      }
      if (done) return;
      if (phase === 'build') {
        const before = Math.ceil(countT);
        countT -= dt;
        if (Math.ceil(countT) !== before && countT < 5 && countT > 0) sfx('tick', { vol: 0.5 });
        if (I.pressed.special) { early = countT; countT = 0; env.floatText(W / 2, OY - 6, 'Spring open!', '160,230,255'); }
        if (countT <= 0) startFlow();
      } else advance(dt);
      const got = bloomed.size;
      env.hud.objective = phase === 'build' ? `The spring opens in ${Math.ceil(countT)}s` : spillAt ? 'Lay a channel in front of the water!' : 'Rill is swimming — keep building!';
      env.hud.progress = phase === 'build' ? 1 - countT / COUNT : null;
      env.hud.counters = [{ icon: '✿', value: `${got}/${L.blooms.length}` }];
    }

    // ── drawing ──
    function chan(c, x, y, kind, wet, k, fixed) {          // a carved stone channel piece
      const X = OX + x * CELL, Y = OY + y * CELL, m = PIECES[kind], C = CELL, w = C * 0.34;
      c.save(); c.translate(X + C / 2, Y + C / 2);
      const arms = [N, E, S, Wd].filter(d => m & d);
      c.lineCap = 'butt';
      for (const pass of [0, 1, 2]) {
        c.strokeStyle = pass === 0 ? (fixed ? '#7c6a8a' : '#9c7a52') : pass === 1 ? (fixed ? '#c9b6d6' : '#e6cfa6') : (wet ? '#2fa6e0' : '#8a6a44');
        c.lineWidth = pass === 0 ? w + 8 : pass === 1 ? w + 3 : w - 4;
        c.beginPath();
        if (kind === 'x') { c.moveTo(-C / 2, 0); c.lineTo(C / 2, 0); c.moveTo(0, -C / 2); c.lineTo(0, C / 2); }
        else if (arms.length === 2 && (m === (E | Wd) || m === (N | S))) { const [dx, dy] = D[arms[0]]; c.moveTo(dx * C / 2, dy * C / 2); c.lineTo(-dx * C / 2, -dy * C / 2); }
        else { const [a1, a2] = arms; const p1 = D[a1], p2 = D[a2]; const cx0 = (p1[0] + p2[0]) * C / 2, cy0 = (p1[1] + p2[1]) * C / 2;
               const st = Math.atan2(p1[1] * C / 2 - cy0, p1[0] * C / 2 - cx0), en = Math.atan2(p2[1] * C / 2 - cy0, p2[0] * C / 2 - cx0);
               let d = en - st; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; c.arc(cx0, cy0, C / 2, st, st + d, d < 0); }
        c.stroke();
      }
      if (wet) {                                             // ripples drifting down the water
        c.strokeStyle = 'rgba(220,250,255,0.6)'; c.lineWidth = 1.2; c.setLineDash([4, 8]); c.lineDashOffset = -t * 30;
        c.beginPath();
        if (kind === 'x') { c.moveTo(-C / 2, 0); c.lineTo(C / 2, 0); c.moveTo(0, -C / 2); c.lineTo(0, C / 2); }
        else if (m === (E | Wd) || m === (N | S)) { const [dx, dy] = D[arms[0]]; c.moveTo(dx * C / 2, dy * C / 2); c.lineTo(-dx * C / 2, -dy * C / 2); }
        c.stroke(); c.setLineDash([]);
      }
      if (fixed) { c.fillStyle = 'rgba(80,60,110,0.85)'; c.font = `bold ${Math.round(C * 0.18)}px Georgia`; c.textAlign = 'center'; c.fillText('✦', C * 0.33, -C * 0.28); }
      c.restore();
    }
    function render(c) {
      // warm paper desert sky
      const g = c.createLinearGradient(0, 0, 0, 844);
      g.addColorStop(0, '#f7c98a'); g.addColorStop(0.25, '#f3b077'); g.addColorStop(1, '#c98b55');
      c.fillStyle = g; c.fillRect(0, 0, W, 844);
      c.fillStyle = 'rgba(255,240,200,0.75)'; c.beginPath(); c.arc(W * 0.78, 92, 34, 0, TAU); c.fill();
      for (let k = 0; k < 3; k++) {                              // paper-cut dunes
        c.fillStyle = ['#e9a76a', '#dc955a', '#c9804a'][k];
        c.beginPath(); c.moveTo(0, 130 - k * 6);
        for (let x = 0; x <= W; x += 20) c.lineTo(x, 112 - k * 4 + Math.sin(x * 0.02 + k * 2) * 10 + k * 8);
        c.lineTo(W, 140); c.lineTo(0, 140); c.closePath(); c.fill();
      }
      const hb = c.createLinearGradient(0, 0, 0, 126);              // keep the HUD readable on the bright sky
      hb.addColorStop(0, 'rgba(70,30,10,0.78)'); hb.addColorStop(0.75, 'rgba(70,30,10,0.5)'); hb.addColorStop(1, 'rgba(70,30,10,0)');
      c.fillStyle = hb; c.fillRect(0, 0, W, 126);
      // board shadow + tiles
      c.fillStyle = 'rgba(90,50,20,0.35)'; c.beginPath(); c.roundRect(OX - 4 + 5, OY - 4 + 7, L.cols * CELL + 8, L.rows * CELL + 8, 12); c.fill();
      c.fillStyle = '#b97d47'; c.beginPath(); c.roundRect(OX - 4, OY - 4, L.cols * CELL + 8, L.rows * CELL + 8, 12); c.fill();
      for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
        const X = OX + x * CELL, Y = OY + y * CELL, wet = watered.has(x + ',' + y);
        c.drawImage(wet ? ART.green[(x + y) % 2] : ART.sand[(x * 3 + y * 5) % 4], X, Y, CELL, CELL);
        if (!wet && phase !== 'build') {                          // green spreads to the neighbours of watered tiles
          let n = 0; for (const d of [N, E, S, Wd]) if (watered.has((x + D[d][0]) + ',' + (y + D[d][1]))) n++;
          if (n) { c.globalAlpha = 0.18 * n; c.drawImage(ART.green[0], X, Y, CELL, CELL); c.globalAlpha = 1; }
        }
      }
      // spring + lotus pool
      const sp = L.spring, lo = L.lotus;
      c.save(); c.translate(cx(sp.x), cy(sp.y));
      c.fillStyle = '#7b8fa0'; c.beginPath(); c.arc(0, 0, CELL * 0.42, 0, TAU); c.fill();
      c.fillStyle = phase === 'build' ? '#3c5468' : '#3fb6f0'; c.beginPath(); c.arc(0, 0, CELL * 0.3, 0, TAU); c.fill();
      if (phase !== 'build') { c.strokeStyle = 'rgba(220,250,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, CELL * (0.12 + (t * 0.6) % 0.2), 0, TAU); c.stroke(); }
      const [sdx, sdy] = D[sp.out]; c.fillStyle = '#9c7a52'; c.fillRect(sdx * CELL * 0.3 - (sdy ? CELL * 0.17 : 0), sdy * CELL * 0.3 - (sdx ? CELL * 0.17 : 0), sdx ? CELL * 0.2 : CELL * 0.34, sdy ? CELL * 0.2 : CELL * 0.34);
      c.restore();
      c.save(); c.translate(cx(lo.x), cy(lo.y));
      const lg = c.createRadialGradient(0, 0, 2, 0, 0, CELL * 0.45); lg.addColorStop(0, '#6fd3ff'); lg.addColorStop(1, '#2a7fb3');
      c.fillStyle = lg; c.beginPath(); c.arc(0, 0, CELL * 0.44, 0, TAU); c.fill();
      for (let i = 0; i < 8; i++) { c.save(); c.rotate(i / 8 * TAU + Math.sin(t) * 0.05); c.fillStyle = i % 2 ? '#ff9fd8' : '#ffd0ee'; c.beginPath(); c.ellipse(0, -CELL * 0.15, CELL * 0.07, CELL * 0.16, 0, 0, TAU); c.fill(); c.restore(); }
      c.fillStyle = '#fff1a8'; c.beginPath(); c.arc(0, 0, CELL * 0.07, 0, TAU); c.fill();
      const [ldx, ldy] = D[lo.inn]; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(ldx * CELL * 0.44, ldy * CELL * 0.44, 4, 0, TAU); c.stroke();
      c.restore();
      // rocks, blooms, channels
      for (const k of L.rocks) { const [x, y] = k.split(',').map(Number); c.drawImage(ART.rock, OX + x * CELL - CELL * 0.06, OY + y * CELL - CELL * 0.12, CELL * 1.12, CELL * 1.12); }
      for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) {
        const cell = grid[y][x]; if (!cell) continue;
        const s = 1 + (cell.pop || 0) * 0.15;
        c.save(); c.translate(cx(x), cy(y)); c.scale(s, s); c.translate(-cx(x), -cy(y));
        chan(c, x, y, cell.kind, cell.wet, 1, cell.fixed);
        c.restore();
      }
      for (const b of L.blooms) {
        const on = bloomed.has(b.x + ',' + b.y), x = cx(b.x), y = cy(b.y) - CELL * 0.18;
        if (!on) {                                              // a dry bloom: dashed "needs water" ring
          c.save(); c.strokeStyle = `rgba(255,120,190,${0.55 + 0.25 * Math.sin(t * 3 + b.x)})`; c.lineWidth = 2; c.setLineDash([5, 4]);
          c.beginPath(); c.arc(cx(b.x), cy(b.y), CELL * 0.42, 0, TAU); c.stroke(); c.setLineDash([]); c.restore();
        }
        c.save(); c.translate(x + CELL * 0.26, y - CELL * 0.1); c.scale(CELL / 44, CELL / 44);
        if (on) { for (let i = 0; i < 6; i++) { c.save(); c.rotate(i / 6 * TAU + t * 0.5); c.fillStyle = '#ff8ccc'; c.beginPath(); c.ellipse(0, -5, 3.5, 6, 0, 0, TAU); c.fill(); c.restore(); } c.fillStyle = '#fff1a0'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill(); }
        else { c.strokeStyle = '#8b6b3e'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, 8); c.quadraticCurveTo(-2, 0, 1, -6); c.stroke(); c.fillStyle = '#a07c4a'; c.beginPath(); c.ellipse(1.5, -7, 3.5, 4.5, 0.3, 0, TAU); c.fill(); }
        c.restore();
      }
      // water filling the current tile + Rill at the front
      if (front && !done || (front && done)) drawFront(c);
      // hint of where the stream goes next
      if (spillAt) { c.strokeStyle = `rgba(255,80,80,${0.5 + 0.5 * Math.sin(t * 10)})`; c.lineWidth = 3; c.strokeRect(OX + spillAt.x * CELL + 2, OY + spillAt.y * CELL + 2, CELL - 4, CELL - 4); }
      drawQueue(c);
      if (phase === 'build') {
        c.save(); c.textAlign = 'center'; c.fillStyle = 'rgba(80,40,10,0.75)'; c.font = 'bold 30px Georgia, serif';
        c.fillText(Math.ceil(countT), cx(sp.x), cy(sp.y) - CELL * 0.62); c.restore();
      }
      if (msgT > 0) {
        c.save(); c.globalAlpha = Math.min(1, msgT * 2); c.textAlign = 'center'; c.fillStyle = 'rgba(70,35,10,0.75)'; c.beginPath(); c.roundRect(W / 2 - 150, 594, 300, 28, 14); c.fill();
        c.fillStyle = '#fff2d6'; c.font = 'bold 13px system-ui'; c.textBaseline = 'middle'; c.fillText(msg, W / 2, 608); c.restore();
      }
    }
    function drawFront(c) {
      const { x, y, inn, k } = front;
      if (x < 0 || y < 0 || x >= L.cols || y >= L.rows) return;
      const [ix, iy] = D[inn];
      const px = cx(x) + ix * CELL / 2 * (1 - k * 2), py = cy(y) + iy * CELL / 2 * (1 - k * 2);
      // a short stretch of water poking into the tile
      c.strokeStyle = '#2fa6e0'; c.lineWidth = CELL * 0.26; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx(x) + ix * CELL / 2, cy(y) + iy * CELL / 2); c.lineTo(px, py); c.stroke();
      // Rill the water dragon riding the front
      const a = Math.atan2(-iy, -ix); rillAngle += (a - rillAngle) * 0.2;
      c.save(); c.translate(px, py); c.rotate(a);
      const sw = Math.sin(t * 12) * 0.25, s = CELL / 52;
      c.scale(s, s);
      c.fillStyle = '#3cc8c0';
      for (let i = 4; i >= 1; i--) { c.beginPath(); c.arc(-i * 6, Math.sin(t * 10 - i) * 3, 5 - i * 0.6, 0, TAU); c.fill(); }
      c.fillStyle = '#5fe0d6'; c.beginPath(); c.ellipse(2, 0, 9, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#8ff5ea'; c.beginPath(); c.moveTo(-2, -6); c.lineTo(-6, -13 + sw * 4); c.lineTo(2, -7); c.fill();
      c.fillStyle = '#1b3b4a'; c.beginPath(); c.arc(6, -2.5, 1.8, 0, TAU); c.arc(6, 2.5, 1.8, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(6.6, -3, 0.7, 0, TAU); c.arc(6.6, 2, 0.7, 0, TAU); c.fill();
      c.restore();
    }
    function drawQueue(c) {
      const y = 650, x0 = 26;
      c.save();
      c.fillStyle = 'rgba(90,50,20,0.35)'; c.beginPath(); c.roundRect(14, y - 8, 250, 76, 16); c.fill();
      c.fillStyle = 'rgba(255,235,200,0.9)'; c.font = 'bold 11px system-ui'; c.fillText('NEXT', x0 - 4, y + 4);
      queue.forEach((k, i) => {
        const sz = i === 0 ? 56 : 36, X = i === 0 ? x0 : x0 + 64 + (i - 1) * 44, Y = i === 0 ? y + 6 : y + 16;
        c.fillStyle = i === 0 ? 'rgba(255,240,210,0.95)' : 'rgba(255,240,210,0.6)'; c.beginPath(); c.roundRect(X, Y, sz, sz, 8); c.fill();
        const save = { OX, OY, CELL };
        OX = X - 0; OY = Y; CELL = sz;
        chan(c, 0, 0, k, false, 1, false);
        OX = save.OX; OY = save.OY; CELL = save.CELL;
      });
      c.restore();
    }
    window.__stream = {                                         // test hook: lay the generated route
      solve() { const p = L.path; for (let i = 0; i < p.length; i++) { const prev = i ? p[i - 1] : { x: L.spring.x, y: L.spring.y }, next = i < p.length - 1 ? p[i + 1] : { x: L.lotus.x, y: L.lotus.y }; const m = dirTo(p[i], prev) | dirTo(p[i], next); const kind = Object.keys(PIECES).find(n => PIECES[n] === m); if (!grid[p[i].y][p[i].x]) grid[p[i].y][p[i].x] = { kind, fixed: false, wet: 0 }; } return p.length; },
      level: () => L, open() { countT = 0; }
    };
    return {
      update, render,
      debug: () => ({ level: LV, wphase: phase, countT: +countT.toFixed(1), cols: L.cols, rows: L.rows, path: L.path.length, front: front && { x: front.x, y: front.y }, bloomed: bloomed.size, blooms: L.blooms.length, done, swaps })
    };
  }
})();
