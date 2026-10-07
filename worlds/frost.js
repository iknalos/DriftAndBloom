// ============================================================================
// Drift & Bloom — FROST GARDEN (Adventure round 3). Kickle Cubicle / Adventures of Lolo, our way.
// Pip the arctic fox crosses a frozen garden of snow islands. Frost-breathe a wandering snow puff
// into an ice cube, kick the cube: it slides until it hits something, squashing any puff in its way;
// slide it into open water and it freezes there into a bridge. Collect every frost bloom and the
// lotus gate opens. Frozen puffs thaw (angry) after a few seconds, so blocks can't be hoarded.
// Later stages: slick glaze (you slide too), cracked ice that sinks once you step off, wider gaps,
// fire beetles that melt bridges back into water.
// Levels are generated per stage so every gap always has a straight kick line (solvable by build).
// ============================================================================
(function () {
  'use strict';
  const GC = 11, GR = 13;                       // generation grid
  let COLS = GC, ROWS = GR, CELL = 32, OX = 19, OY = 146;
  const AREA = { x: 12, y: 132, w: 366, h: 470 };  // where the board may sit (between the HUD and the controls)
  // tiles
  const WATER = 0, FLOOR = 1, WALL = 2, ROCK = 3, GLAZE = 4, CRACK = 5, BRIDGE = 6, DEN = 7;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const TAU = Math.PI * 2;

  DABWorlds.register('frost', {
    title: 'Frost Garden', color: '170,220,255',
    music: 'music_frost',
    sounds: ['frost', 'freeze', 'kick', 'bridge', 'squash', 'bloom', 'gate', 'thaw', 'crack', 'splash', 'hurt', 'pickup'],
    subtitle: () => 'Pip the arctic fox, a frozen garden, and snow puffs that make perfect ice cubes.',
    hint: 'Freeze the puffs, kick the ice into the water, collect every frost bloom',
    howto: ['Stick: walk  ·  ❄: frost-breathe a puff into an ice cube', 'Walk into a cube to kick it — into water it makes a bridge',
            'Cubes thaw! A kicked cube flattens every puff in its path'],
    controls: { dirs: 'stick', buttons: [{ id: 'attack', icon: 'snow' }, { id: 'special', icon: 'restart' }] },
    create
  });

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ── level generation ──────────────────────────────────────────────────────
  // rooms in a 2 x 3 grid of islands (x 1-4 | 6-9, y 9-11 | 5-7 | 1-3) inside a frozen moat
  const SLOT = {
    BL: { x0: 1, x1: 4, y0: 9, y1: 11 }, BR: { x0: 6, x1: 9, y0: 9, y1: 11 },
    ML: { x0: 1, x1: 4, y0: 5, y1: 7 }, MR: { x0: 6, x1: 9, y0: 5, y1: 7 },
    TL: { x0: 1, x1: 4, y0: 1, y1: 3 }, TR: { x0: 6, x1: 9, y0: 1, y1: 3 }
  };
  // the route through the islands per stage (more crossings later)
  const ROUTES = {
    1: ['BL', 'ML'], 2: ['BL', 'BR', 'MR'], 3: ['BL', 'ML', 'MR'], 4: ['BR', 'BL', 'ML', 'MR'],
    5: ['BL', 'ML', 'MR', 'TR'], 6: ['BR', 'MR', 'ML', 'TL'], 7: ['BL', 'BR', 'MR', 'ML', 'TL'],
    8: ['BR', 'BL', 'ML', 'MR', 'TR'], 9: ['BL', 'BR', 'MR', 'ML', 'TL', 'TR'], 10: ['BR', 'BL', 'ML', 'MR', 'TR', 'TL']
  };
  function makeLevel(stage, seed) {
    const r = rng(seed * 7919 + stage * 131);
    const T = [];
    for (let y = 0; y < GR; y++) { T.push([]); for (let x = 0; x < GC; x++) T[y].push(x === 0 || y === 0 || x === GC - 1 || y === GR - 1 ? WALL : WATER); }
    const route = ROUTES[stage].map(k => Object.assign({ key: k }, SLOT[k]));
    // later stages shave a row / column off some islands: the gap to cross becomes two tiles wide
    if (stage >= 6) for (let i = 1; i < route.length; i++) {
      if (r() < 0.25 + stage * 0.04) {
        const R = route[i], P = route[i - 1];
        if (R.y0 !== P.y0) { if (R.y0 < P.y0) R.y1--; else R.y0++; } else { if (R.x0 < P.x0) R.x1--; else R.x0++; }
      }
    }
    for (const R of route) for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) T[y][x] = FLOOR;
    const inRoom = (R, x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1;
    // for each crossing: the kick line (cube start, player spot, water tiles to fill)
    const crossings = [];
    for (let i = 0; i < route.length - 1; i++) {
      const A = route[i], B = route[i + 1];
      let dir, lanes;
      if (A.y0 === B.y0 || (A.y0 <= B.y1 && B.y0 <= A.y1)) {        // side by side: kick left / right
        dir = B.x0 > A.x1 ? 'right' : 'left';
        const ys = []; for (let y = Math.max(A.y0, B.y0); y <= Math.min(A.y1, B.y1); y++) ys.push(y);
        lanes = ys.map(y => ({ y, x: dir === 'right' ? A.x1 : A.x0 }));
      } else {                                                       // stacked: kick up / down
        dir = B.y0 < A.y0 ? 'up' : 'down';
        const xs = []; for (let x = Math.max(A.x0, B.x0); x <= Math.min(A.x1, B.x1); x++) xs.push(x);
        lanes = xs.map(x => ({ x, y: dir === 'up' ? A.y0 : A.y1 }));
      }
      crossings.push({ from: i, to: i + 1, dir, lanes });
    }
    // features inside the rooms, never on a tile a kick line needs
    const keep = new Set();
    for (const c of crossings) {
      const [dx, dy] = DIRS[c.dir];
      for (const L of c.lanes) { keep.add(L.x + ',' + L.y); keep.add((L.x - dx) + ',' + (L.y - dy)); }
    }
    const free = R => { const out = []; for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (T[y][x] === FLOOR && !keep.has(x + ',' + y)) out.push([x, y]); return out; };
    const pick = arr => arr.splice(Math.floor(r() * arr.length), 1)[0];
    const start = route[0];
    const player = (() => { const f = free(start); return f.length ? f[Math.floor(f.length / 2)] : [start.x0, start.y1]; })();
    keep.add(player[0] + ',' + player[1]);
    const dens = [], blooms = [], beetles = [];
    route.forEach((R, i) => {
      const f = free(R);
      if (i < route.length - 1 || stage >= 4) { const d = pick(f); if (d) { T[d[1]][d[0]] = DEN; dens.push({ x: d[0], y: d[1], room: i }); } }
      if (i > 0 && blooms.length < 3 && (i < route.length - 1 || route.length <= 2)) { const b = pick(f); if (b) blooms.push({ x: b[0], y: b[1], got: false }); }
      const rocks = stage >= 2 ? Math.min(2, Math.floor(r() * (1 + stage / 4))) : 0;
      for (let k = 0; k < rocks; k++) { const q = pick(f); if (q) T[q[1]][q[0]] = ROCK; }
      if (stage >= 3) for (let k = 0; k < 1 + Math.floor(stage / 4); k++) { const q = pick(f); if (q) T[q[1]][q[0]] = GLAZE; }
      if (stage >= 4) for (let k = 0; k < Math.floor(stage / 3); k++) { const q = pick(f); if (q) T[q[1]][q[0]] = CRACK; }
      if (stage >= 6 && i > 0 && beetles.length < Math.floor((stage - 4) / 2)) { const q = pick(f); if (q) beetles.push({ x: q[0], y: q[1] }); }
    });
    // the gate: in the last room, as far as possible from where you arrive
    const last = route[route.length - 1];
    const f = free(last);
    const entry = crossings.length ? crossings[crossings.length - 1].lanes[0] : { x: player[0], y: player[1] };
    f.sort((a, b) => (Math.abs(b[0] - entry.x) + Math.abs(b[1] - entry.y)) - (Math.abs(a[0] - entry.x) + Math.abs(a[1] - entry.y)));
    const gate = f[0] || [last.x1, last.y0];
    if (!blooms.length) { const b = f[f.length - 1]; if (b) blooms.push({ x: b[0], y: b[1], got: false }); }
    // rocks must never cut a room in two
    for (const R of route) {
      const cells = []; for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (T[y][x] !== ROCK) cells.push([x, y]);
      const seen = new Set([cells[0] + '']), q = [cells[0]];
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of Object.values(DIRS)) { const k = [x + dx, y + dy] + ''; if (inRoom(R, x + dx, y + dy) && T[y + dy][x + dx] !== ROCK && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); } } }
      if (seen.size < cells.length) for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (T[y][x] === ROCK) T[y][x] = FLOOR;
    }
    // crop to the islands used (+ a ring of moat + the wall ring)
    let x0 = GC, x1 = 0, y0 = GR, y1 = 0;
    for (const R of route) { x0 = Math.min(x0, R.x0); x1 = Math.max(x1, R.x1); y0 = Math.min(y0, R.y0); y1 = Math.max(y1, R.y1); }
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(GC - 1, x1 + 2); y1 = Math.min(GR - 1, y1 + 2);
    const C = [];
    for (let y = y0; y <= y1; y++) { const row = []; for (let x = x0; x <= x1; x++) row.push(x === x0 || x === x1 || y === y0 || y === y1 ? WALL : (T[y][x] === WALL ? WATER : T[y][x])); C.push(row); }
    const sh = q => Object.assign({}, q, { x: q.x - x0, y: q.y - y0 });
    route.forEach(R => { R.x0 -= x0; R.x1 -= x0; R.y0 -= y0; R.y1 -= y0; });
    crossings.forEach(c => { c.lanes = c.lanes.map(sh); });
    return { T: C, cols: x1 - x0 + 1, rows: y1 - y0 + 1, route, crossings, player: [player[0] - x0, player[1] - y0], dens: dens.map(sh),
             blooms: blooms.map(sh), gate: { x: gate[0] - x0, y: gate[1] - y0 }, beetles: beetles.map(sh) };
  }

  // ── art: pre-rendered sprites ──────────────────────────────────────────────
  let ART = null;
  function sprite(w, h, fn) {
    const R = 2, cv = document.createElement('canvas');
    cv.width = w * R; cv.height = h * R;
    const g = cv.getContext('2d'); g.scale(R, R); fn(g);
    return cv;
  }
  function buildArt() {
    const r = rng(42);
    const ice = [0, 1, 2].map(v => sprite(CELL, CELL, g => {
      const gr = g.createLinearGradient(0, 0, CELL, CELL);
      gr.addColorStop(0, '#eaf7ff'); gr.addColorStop(1, '#bfe2f7');
      g.fillStyle = gr; g.fillRect(0, 0, CELL, CELL);
      g.strokeStyle = 'rgba(120,170,215,0.35)'; g.lineWidth = 0.7;
      for (let i = 0; i < 4 + v; i++) {              // frost scratches
        const x = r() * CELL, y = r() * CELL, a = r() * TAU, l = 4 + r() * 9;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 0, CELL, 1.5); g.fillRect(0, 0, 1.5, CELL);
      g.fillStyle = 'rgba(70,120,170,0.18)'; g.fillRect(0, CELL - 1.5, CELL, 1.5); g.fillRect(CELL - 1.5, 0, 1.5, CELL);
    }));
    const glaze = sprite(CELL, CELL, g => {
      const gr = g.createLinearGradient(0, 0, CELL, CELL);
      gr.addColorStop(0, '#d6f4ff'); gr.addColorStop(1, '#8fd3f5');
      g.fillStyle = gr; g.fillRect(0, 0, CELL, CELL);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(k * 12, CELL); g.lineTo(k * 12 + 5, CELL); g.lineTo(k * 12 + 5 + CELL, 0); g.lineTo(k * 12 + CELL, 0); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1; g.strokeRect(1, 1, CELL - 2, CELL - 2);
    });
    const crack = sprite(CELL, CELL, g => {
      g.drawImage(ice[0], 0, 0, CELL, CELL);
      g.strokeStyle = 'rgba(60,110,160,0.75)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(4, 6); g.lineTo(14, 14); g.lineTo(11, 25); g.moveTo(14, 14); g.lineTo(26, 10); g.moveTo(14, 14); g.lineTo(24, 27); g.stroke();
    });
    const drift = [0, 1].map(v => sprite(CELL + 8, CELL + 8, g => {     // snow mound (walls)
      g.translate(4, 4);
      g.fillStyle = 'rgba(40,70,120,0.28)'; g.beginPath(); g.ellipse(CELL / 2 + 3, CELL / 2 + 5, CELL * 0.56, CELL * 0.46, 0, 0, TAU); g.fill();
      const gr = g.createRadialGradient(CELL * 0.35, CELL * 0.3, 2, CELL / 2, CELL / 2, CELL * 0.62);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#e3eefa'); gr.addColorStop(1, '#b9cde6');
      g.fillStyle = gr;
      g.beginPath();
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr = CELL * (0.5 + 0.06 * Math.sin(i * 2.7 + v * 3)); g.lineTo(CELL / 2 + Math.cos(a) * rr, CELL / 2 + Math.sin(a) * rr * 0.92); }
      g.closePath(); g.fill();
    }));
    const rock = sprite(CELL + 8, CELL + 8, g => {
      g.translate(4, 4);
      g.fillStyle = 'rgba(30,50,90,0.3)'; g.beginPath(); g.ellipse(CELL / 2 + 3, CELL / 2 + 6, CELL * 0.48, CELL * 0.36, 0, 0, TAU); g.fill();
      const gr = g.createLinearGradient(0, 0, 0, CELL);
      gr.addColorStop(0, '#8f9bb3'); gr.addColorStop(1, '#4b5672');
      g.fillStyle = gr; g.beginPath(); g.moveTo(4, CELL - 6); g.lineTo(2, 14); g.lineTo(10, 4); g.lineTo(23, 3); g.lineTo(CELL - 3, 13); g.lineTo(CELL - 4, CELL - 5); g.closePath(); g.fill();
      g.fillStyle = '#f4f9ff'; g.beginPath(); g.moveTo(3, 13); g.lineTo(10, 4); g.lineTo(23, 3); g.lineTo(CELL - 3, 12); g.quadraticCurveTo(18, 16, 3, 13); g.fill();
    });
    const den = sprite(CELL, CELL, g => {
      g.drawImage(ice[1], 0, 0, CELL, CELL);
      g.fillStyle = '#f2f8ff'; g.beginPath(); g.ellipse(CELL / 2, CELL / 2 + 2, 14, 11, 0, 0, TAU); g.fill();
      const gr = g.createRadialGradient(CELL / 2, CELL / 2 + 4, 1, CELL / 2, CELL / 2 + 4, 9);
      gr.addColorStop(0, '#1b2a4a'); gr.addColorStop(1, '#3d5684');
      g.fillStyle = gr; g.beginPath(); g.ellipse(CELL / 2, CELL / 2 + 4, 9, 6.5, 0, 0, TAU); g.fill();
    });
    ART = { ice, glaze, crack, drift, rock, den };
  }

  // ── the world ──────────────────────────────────────────────────────────────
  function create(env) {
    if (!ART) buildArt();
    const W = env.W, LV = env.level, fx = env.fx;
    const sfx = (n, x, o) => env.sfxAt(n, x === undefined ? W / 2 : x, o);
    const tx = gx => OX + gx * CELL + CELL / 2, ty = gy => OY + gy * CELL + CELL / 2;
    const THAW = Math.max(3.6, 9.5 - LV * 0.6);                // seconds an ice cube holds
    const PUFF_STEP = Math.max(0.26, 0.62 - LV * 0.035);       // seconds per tile
    const PUFF_CAP = 2 + Math.floor(LV / 3);
    const TIME = 75 + ROUTES[LV].length * 20;
    let L, T, P, puffs, cubes, beetles, blooms, gate, t = 0, timeLeft = TIME, won = false, hits = 0, combo = 0, comboT = 0;
    let spawnT = 1.0, msg = '', msgT = 0, restarts = 0, seed = 1;
    const snow = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * 844, s: 0.6 + Math.random() * 1.6, v: 14 + Math.random() * 26, ph: Math.random() * TAU }));

    function load(keepTime) {
      L = makeLevel(LV, seed);
      T = L.T.map(row => row.slice());
      COLS = L.cols; ROWS = L.rows;
      CELL = Math.floor(Math.min(56, AREA.w / COLS, AREA.h / ROWS));
      OX = Math.round(AREA.x + (AREA.w - COLS * CELL) / 2); OY = Math.round(AREA.y + (AREA.h - ROWS * CELL) / 2);
      P = { x: L.player[0], y: L.player[1], px: tx(L.player[0]), py: ty(L.player[1]), dir: 'up', moving: 0, from: null, to: null, slide: false,
            safe: { x: L.player[0], y: L.player[1] }, breath: 0, frostCd: 0, bob: 0, fallT: 0 };
      puffs = []; cubes = []; beetles = L.beetles.map(b => ({ x: b.x, y: b.y, px: tx(b.x), py: ty(b.y), mv: 0, from: null, to: null, stun: 0, melt: null, meltT: 0, wait: Math.random() }));
      blooms = L.blooms.map(b => Object.assign({ ph: Math.random() * TAU }, b));
      gate = Object.assign({ open: 0 }, L.gate);
      if (!keepTime) timeLeft = TIME;
      spawnT = 0.6;
    }
    load(false);

    const tileAt = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? WALL : T[y][x]);
    const solidTile = v => v === WALL || v === ROCK;
    const ground = v => v === FLOOR || v === GLAZE || v === CRACK || v === BRIDGE || v === DEN;
    const cubeAt = (x, y) => cubes.find(c => c.x === x && c.y === y && !c.gone);
    const puffAt = (x, y) => puffs.find(p => !p.dead && ((p.x === x && p.y === y) || (p.to && p.to.x === x && p.to.y === y)));
    const beetleAt = (x, y) => beetles.find(b => !b.dead && ((b.x === x && b.y === y) || (b.to && b.to.x === x && b.to.y === y)));
    const bloomAt = (x, y) => blooms.find(b => !b.got && b.x === x && b.y === y);
    const isGate = (x, y) => gate.x === x && gate.y === y;
    function say(s) { msg = s; msgT = 2.2; }

    // ── the fox ──
    function tryMove(dir) {
      const [dx, dy] = DIRS[dir];
      P.dir = dir;
      const nx = P.x + dx, ny = P.y + dy, v = tileAt(nx, ny);
      const c = cubeAt(nx, ny);
      if (c) { kick(c, dir); return false; }
      if (isGate(nx, ny)) {
        if (gate.open >= 1) { stepTo(nx, ny, 0.16); P.entering = true; return true; }
        say('The lotus is still closed — find every frost bloom'); return false;
      }
      if (solidTile(v) || v === WATER || v === CRACK + 100) return false;
      if (beetleAt(nx, ny)) return false;
      stepTo(nx, ny, P.slide ? 0.08 : 0.15);
      return true;
    }
    function stepTo(nx, ny, dur) {
      const left = tileAt(P.x, P.y);
      if (left === CRACK) crackAt(P.x, P.y);
      P.from = { x: P.x, y: P.y }; P.to = { x: nx, y: ny }; P.moving = dur; P.dur = dur;
      P.x = nx; P.y = ny;
    }
    function crackAt(x, y) {
      T[y][x] = FLOOR; setTimeout(() => {
        if (T[y][x] !== FLOOR) return;
        T[y][x] = WATER; sfx('crack', tx(x)); burst(tx(x), ty(y), '200,235,255', 10, 1.6);
        if (P.x === x && P.y === y && !P.moving) fall();
      }, 380);
      T[y][x] = CRACK + 100;                                         // breaking (drawn as crumbling)
    }
    function arrive() {
      const v = tileAt(P.x, P.y);
      if (v === WATER) { fall(); return; }
      if (v === CRACK + 100) { /* still holding */ }
      const b = bloomAt(P.x, P.y);
      if (b) {
        b.got = true; sfx('bloom', tx(b.x), { vol: 0.9 });
        burst(tx(b.x), ty(b.y), '255,170,230', 22, 2.4);
        env.floatText(tx(b.x), ty(b.y) - 20, '✿', '255,190,235');
        if (blooms.every(q => q.got)) { sfx('gate', tx(gate.x), { vol: 0.9 }); say('The lotus opens!'); }
      }
      if (P.entering) { won = true; finish(); return; }
      if (v !== GLAZE && v !== DEN) P.safe = { x: P.x, y: P.y };
      P.slide = v === GLAZE;
      if (P.slide && !tryMove(P.dir)) P.slide = false;
    }
    function fall() {
      sfx('splash', tx(P.x), { vol: 0.8 }); burst(tx(P.x), ty(P.y), '160,220,255', 18, 2.2);
      hits++; env.damage(30, { x: tx(P.x), y: ty(P.y) - 20, text: 'splash!' });
      P.fallT = 0.6; P.moving = 0; P.slide = false;
      P.x = P.safe.x; P.y = P.safe.y; P.px = tx(P.x); P.py = ty(P.y);
      if (tileAt(P.x, P.y) === WATER) { P.x = L.player[0]; P.y = L.player[1]; P.px = tx(P.x); P.py = ty(P.y); }
    }
    function breathe() {
      if (P.frostCd > 0) return;
      P.frostCd = 0.38; P.breath = 0.35;
      sfx('frost', tx(P.x), { vol: 0.75 });
      const [dx, dy] = DIRS[P.dir];
      for (let k = 1; k <= 2; k++) {                                  // reaches two tiles, the nearer first
        const x = P.x + dx * k, y = P.y + dy * k;
        if (solidTile(tileAt(x, y)) || cubeAt(x, y)) break;
        const p = puffs.find(q => !q.dead && (q.x === x && q.y === y || (q.to && q.to.x === x && q.to.y === y)));
        if (p) { freeze(p); break; }
        const b = beetleAt(x, y);
        if (b) { b.stun = 3.2; b.melt = null; burst(b.px, b.py, '200,240,255', 10, 1.4); env.floatText(b.px, b.py - 16, 'chilled', '200,240,255'); break; }
      }
      for (let i = 0; i < 16; i++) {                                  // the breath cloud
        const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.7, s = 70 + Math.random() * 110;
        fx.spawn({ x: P.px + dx * 10, y: P.py + dy * 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: 'smoke', size: 3, grow: 14, life: 0.45, rgb: '220,245,255', alpha: 0.6 });
      }
    }
    function freeze(p) {
      p.dead = true;
      const onFox = q => q && q.x === P.x && q.y === P.y;
      const at = p.to && !onFox(p.to) ? p.to : (p.from && !onFox(p.from) ? p.from : p);
      const x = at.x, y = at.y;
      cubes.push({ x, y, px: tx(x), py: ty(y), thaw: THAW, angry: p.angry, slide: null, wob: 0 });
      sfx('freeze', tx(x), { vol: 0.85 });
      burst(tx(x), ty(y), '210,240,255', 14, 1.8);
    }
    function kick(c, dir) {
      const [dx, dy] = DIRS[dir];
      const nx = c.x + dx, ny = c.y + dy;
      if (!canEnter(c, nx, ny)) { c.wob = 0.25; sfx('kick', tx(c.x), { vol: 0.35, rate: 1.4 }); return; }
      c.slide = dir; c.step = 0; combo = 0;
      sfx('kick', tx(c.x), { vol: 0.9 });
    }
    function canEnter(c, x, y) {
      const v = tileAt(x, y);
      if (solidTile(v) || cubeAt(x, y) || isGate(x, y) || bloomAt(x, y) || (P.x === x && P.y === y)) return false;
      if (beetleAt(x, y)) return true;                                // flattened
      return v === WATER || ground(v) || v === CRACK + 100;
    }
    function updateCube(c, dt) {
      if (c.slide) {
        c.step += dt * 13;                                          // tiles per second
        const [dx, dy] = DIRS[c.slide];
        while (c.step >= 1) {
          c.step -= 1;
          const nx = c.x + dx, ny = c.y + dy;
          const p = puffs.find(q => !q.dead && ((q.x === nx && q.y === ny) || (q.to && q.to.x === nx && q.to.y === ny)));
          if (p) squash(p.px, p.py, () => { p.dead = true; });
          const b = beetleAt(nx, ny);
          if (b) squash(b.px, b.py, () => { b.dead = true; });
          if (!canEnter(c, nx, ny)) { c.slide = null; c.step = 0; env.shake(0.12); sfx('kick', tx(c.x), { vol: 0.4, rate: 0.8 }); break; }
          c.x = nx; c.y = ny;
          if (tileAt(nx, ny) === WATER) {                           // plunk: a new bridge
            T[ny][nx] = BRIDGE; c.gone = true; c.slide = null;
            sfx('bridge', tx(nx), { vol: 0.95 }); env.shake(0.18);
            burst(tx(nx), ty(ny), '190,235,255', 24, 2.6);
            fx.spawn({ x: tx(nx), y: ty(ny), kind: 'ring', rgb: '200,240,255', life: 0.5, size: 8, grow: 60 });
            break;
          }
        }
        c.px = tx(c.x) + (c.slide ? DIRS[c.slide][0] * c.step * CELL : 0);
        c.py = ty(c.y) + (c.slide ? DIRS[c.slide][1] * c.step * CELL : 0);
        if (c.slide && Math.random() < 0.6) fx.spawn({ x: c.px, y: c.py + 10, vx: -dx * 40, vy: -dy * 40, kind: 'smoke', size: 2, grow: 8, life: 0.3, rgb: '235,248,255', alpha: 0.5 });
      } else { c.px = tx(c.x); c.py = ty(c.y); }
      c.wob = Math.max(0, c.wob - dt);
      if (!c.gone && !c.slide) {
        c.thaw -= dt;
        if (c.thaw <= 0) {                                          // it thaws: the puff is back, and cross
          c.gone = true;
          puffs.push(newPuff(c.x, c.y, true));
          sfx('thaw', tx(c.x), { vol: 0.7 });
          burst(tx(c.x), ty(c.y), '170,220,255', 16, 2);
        }
      }
    }
    function squash(x, y, kill) {
      kill(); combo++; comboT = 1.2;
      sfx('squash', x, { vol: 0.8, rate: 1 + combo * 0.12 });
      burst(x, y, '255,255,255', 16, 2.2);
      env.floatText(x, y - 18, combo > 1 ? `×${combo} SPLAT!` : 'splat!', '230,245,255');
    }

    // ── snow puffs ──
    function newPuff(x, y, angry) {
      return { x, y, px: tx(x), py: ty(y), to: null, from: null, mv: 0, wait: 0.3 + Math.random() * 0.5, angry: angry ? 4 : 0, ph: Math.random() * TAU, dead: false };
    }
    const walkable = (x, y, self) => {
      const v = tileAt(x, y);
      if (!ground(v) || cubeAt(x, y) || bloomAt(x, y) || isGate(x, y)) return false;
      if (puffs.some(p => p !== self && !p.dead && ((p.x === x && p.y === y) || (p.to && p.to.x === x && p.to.y === y)))) return false;
      return true;
    };
    function updatePuff(p, dt) {
      p.ph += dt * (p.angry > 0 ? 9 : 5);
      p.angry = Math.max(0, p.angry - dt);
      const step = PUFF_STEP * (p.angry > 0 ? 0.6 : 1);
      if (p.mv > 0) {
        p.mv -= dt;
        const k = 1 - Math.max(0, p.mv) / step;
        p.px = tx(p.from.x) + (tx(p.to.x) - tx(p.from.x)) * k; p.py = ty(p.from.y) + (ty(p.to.y) - ty(p.from.y)) * k;
        if (p.mv <= 0) { p.x = p.to.x; p.y = p.to.y; p.to = null; p.wait = Math.random() * 0.35; }
        return;
      }
      p.wait -= dt;
      if (p.wait > 0) return;
      // wander, leaning toward the fox (more when angry / later stages)
      const chase = Math.min(0.85, 0.3 + LV * 0.05 + (p.angry > 0 ? 0.35 : 0));
      const opts = Object.keys(DIRS).filter(d => walkable(p.x + DIRS[d][0], p.y + DIRS[d][1], p));
      if (!opts.length) { p.wait = 0.4; return; }
      let d;
      if (Math.random() < chase) {
        opts.sort((a, b) => (Math.abs(p.x + DIRS[a][0] - P.x) + Math.abs(p.y + DIRS[a][1] - P.y)) - (Math.abs(p.x + DIRS[b][0] - P.x) + Math.abs(p.y + DIRS[b][1] - P.y)));
        d = opts[0];
      } else d = opts[Math.floor(Math.random() * opts.length)];
      p.from = { x: p.x, y: p.y }; p.to = { x: p.x + DIRS[d][0], y: p.y + DIRS[d][1] }; p.mv = step;
    }
    function spawn(dt) {
      spawnT -= dt;
      if (spawnT > 0) return;
      spawnT = Math.max(1.2, 3.2 - LV * 0.18);
      const alive = puffs.filter(p => !p.dead).length + cubes.filter(c => !c.gone).length;
      if (alive >= PUFF_CAP + L.dens.length - 1) return;
      // the den nearest the fox (blocks where they are needed), sometimes another
      const ds = L.dens.slice().sort((a, b) => (Math.abs(a.x - P.x) + Math.abs(a.y - P.y)) - (Math.abs(b.x - P.x) + Math.abs(b.y - P.y)));
      const d = Math.random() < 0.75 ? ds[0] : ds[Math.floor(Math.random() * ds.length)];
      if (!d || cubeAt(d.x, d.y) || puffAt(d.x, d.y) || (P.x === d.x && P.y === d.y)) return;
      puffs.push(newPuff(d.x, d.y, false));
      fx.spawn({ x: tx(d.x), y: ty(d.y), kind: 'ring', rgb: '230,240,255', life: 0.4, size: 4, grow: 26 });
    }

    // ── fire beetles: they melt bridges back to water ──
    function updateBeetle(b, dt) {
      if (b.dead) return;
      if (b.stun > 0) { b.stun -= dt; return; }
      if (b.melt) {
        b.meltT -= dt;
        if (Math.random() < dt * 20) fx.spawn({ x: b.px + (Math.random() - 0.5) * 14, y: b.py, vx: 0, vy: -30, kind: 'smoke', size: 3, grow: 12, life: 0.6, rgb: '230,230,240', alpha: 0.45 });
        if (b.meltT <= 0) {
          const { x, y } = b.melt; b.melt = null;
          if (T[y][x] === BRIDGE) { T[y][x] = WATER; sfx('crack', tx(x)); burst(tx(x), ty(y), '160,220,255', 12, 1.6); if (P.x === x && P.y === y && !P.moving) fall(); }
          // hop back onto dry ground
          const nb = Object.values(DIRS).map(([dx, dy]) => ({ x: x + dx, y: y + dy })).find(q => ground(tileAt(q.x, q.y)) && !cubeAt(q.x, q.y));
          if (nb) { b.x = nb.x; b.y = nb.y; b.px = tx(b.x); b.py = ty(b.y); }
          else { b.dead = true; burst(b.px, b.py, '255,140,60', 10, 1.4); }
        }
        return;
      }
      if (b.mv > 0) {
        b.mv -= dt;
        const k = 1 - Math.max(0, b.mv) / 0.5;
        b.px = tx(b.from.x) + (tx(b.to.x) - tx(b.from.x)) * k; b.py = ty(b.from.y) + (ty(b.to.y) - ty(b.from.y)) * k;
        if (b.mv <= 0) {
          b.x = b.to.x; b.y = b.to.y; b.to = null; b.wait = 0.3;
          if (T[b.y][b.x] === BRIDGE) { b.melt = { x: b.x, y: b.y }; b.meltT = 2.2; }
        }
        return;
      }
      b.wait -= dt;
      if (b.wait > 0) return;
      // head for the nearest bridge if there is one
      let target = null, best = 1e9;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (T[y][x] === BRIDGE) { const d = Math.abs(x - b.x) + Math.abs(y - b.y); if (d < best) { best = d; target = { x, y }; } }
      const opts = Object.keys(DIRS).filter(d => { const x = b.x + DIRS[d][0], y = b.y + DIRS[d][1]; return ground(tileAt(x, y)) && !cubeAt(x, y) && !(P.x === x && P.y === y) && !bloomAt(x, y) && !isGate(x, y); });
      if (!opts.length) { b.wait = 0.5; return; }
      let d = opts[Math.floor(Math.random() * opts.length)];
      if (target && Math.random() < 0.7) opts.sort((a1, a2) => (Math.abs(b.x + DIRS[a1][0] - target.x) + Math.abs(b.y + DIRS[a1][1] - target.y)) - (Math.abs(b.x + DIRS[a2][0] - target.x) + Math.abs(b.y + DIRS[a2][1] - target.y))), d = opts[0];
      b.from = { x: b.x, y: b.y }; b.to = { x: b.x + DIRS[d][0], y: b.y + DIRS[d][1] }; b.mv = 0.5;
    }

    function burst(x, y, rgb, n, sp) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, s = (30 + Math.random() * 80) * sp;
        fx.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 120, kind: 'spark', size: 1.5 + Math.random() * 2, life: 0.35 + Math.random() * 0.4, rgb });
      }
    }
    function finish() {
      if (env.round) {
        const fast = TIME - timeLeft < TIME * 0.55;
        env.setStars(hits === 0 && fast ? 3 : hits <= 1 ? 2 : 1);
      }
      for (let i = 0; i < 40; i++) burst(tx(gate.x), ty(gate.y), i % 2 ? '255,180,235' : '200,240,255', 1, 3);
      env.win();
    }

    // ── per frame ──
    function update(dt, I) {
      t += dt; msgT = Math.max(0, msgT - dt); comboT = Math.max(0, comboT - dt); if (comboT <= 0) combo = 0;
      if (won) return;
      timeLeft -= dt * env.clock;
      if (timeLeft <= 0) { timeLeft = 0; say("Time's up!"); env.lose(); return; }
      if (I.pressed.special) { restarts++; seed += 1; load(true); say('A new garden — same clock'); return; }
      P.frostCd = Math.max(0, P.frostCd - dt); P.breath = Math.max(0, P.breath - dt); P.fallT = Math.max(0, P.fallT - dt);
      if (P.moving > 0) {
        P.moving -= dt;
        const k = 1 - Math.max(0, P.moving) / P.dur;
        P.px = tx(P.from.x) + (tx(P.to.x) - tx(P.from.x)) * k; P.py = ty(P.from.y) + (ty(P.to.y) - ty(P.from.y)) * k;
        P.bob += dt * 22;
        if (P.moving <= 0) { P.px = tx(P.x); P.py = ty(P.y); arrive(); }
      } else if (P.fallT <= 0) {
        const ax = I.ax || 0, ay = I.ay || 0;
        let dir = null;
        if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.35) dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
        if (dir) { if (!tryMove(dir)) P.dir = dir; }
        if (I.pressed.attack || I.pressed.jump) breathe();
      }
      spawn(dt);
      for (const p of puffs) if (!p.dead) {
        updatePuff(p, dt);
        if (Math.hypot(p.px - P.px, p.py - P.py) < CELL * 0.62 && !env.invulnerable && P.fallT <= 0) {
          hits++; env.damage(p.angry > 0 ? 34 : 26, { x: P.px, y: P.py - 20 });
          env.invuln(1.1); env.shake(0.25);
          burst(P.px, P.py, '255,140,160', 10, 1.6);
        }
      }
      puffs = puffs.filter(p => !p.dead);
      for (const c of cubes) updateCube(c, dt);
      cubes = cubes.filter(c => !c.gone);
      for (const b of beetles) updateBeetle(b, dt);
      gate.open = Math.min(1, gate.open + (blooms.every(b => b.got) ? dt * 0.8 : 0));
      // falling snow
      for (const s of snow) { s.y += s.v * dt; s.x += Math.sin(t * 0.7 + s.ph) * 10 * dt; if (s.y > 844) { s.y = -5; s.x = Math.random() * W; } }
      const got = blooms.filter(b => b.got).length;
      env.hud.objective = gate.open >= 1 ? 'The lotus is open — go!' : `Frost blooms ${got}/${blooms.length}`;
      env.hud.progress = blooms.length ? got / blooms.length : 1;
      env.hud.counters = [{ icon: '⏱', value: Math.ceil(timeLeft) }];
    }

    // ── drawing ──
    function drawBack(c) {
      const g = c.createLinearGradient(0, 0, 0, 844);
      g.addColorStop(0, '#1a1f4a'); g.addColorStop(0.35, '#2b4f86'); g.addColorStop(1, '#0f2b44');
      c.fillStyle = g; c.fillRect(0, 0, W, 844);
      c.save(); c.globalCompositeOperation = 'lighter';            // aurora ribbons
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        for (let x = -10; x <= W + 10; x += 12) { const y = 70 + k * 22 + Math.sin(x * 0.012 + t * (0.4 + k * 0.15) + k) * 22 + Math.sin(x * 0.03 - t * 0.6) * 8; x < 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.lineWidth = 26 - k * 6; c.strokeStyle = ['rgba(90,255,190,0.10)', 'rgba(150,140,255,0.10)', 'rgba(255,150,230,0.08)'][k]; c.stroke();
      }
      c.restore();
    }
    function drawBoard(c) {
      // frozen moat
      const bw = COLS * CELL, bh = ROWS * CELL;
      const wg = c.createLinearGradient(0, OY, 0, OY + bh);
      wg.addColorStop(0, '#2a7aa8'); wg.addColorStop(1, '#155a86');
      c.fillStyle = wg; c.fillRect(OX, OY, bw, bh);
      c.save(); c.beginPath(); c.rect(OX, OY, bw, bh); c.clip();
      c.strokeStyle = 'rgba(200,240,255,0.18)'; c.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {                                // drifting glints
        const y = OY + (i * 37.7 + t * 9) % bh, x = OX + (i * 71.3 + Math.sin(t * 0.8 + i) * 18) % bw;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10 + (i % 3) * 5, y); c.stroke();
      }
      c.restore();
      // tiles
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = T[y][x], X = OX + x * CELL, Y = OY + y * CELL;
        if (v === FLOOR || v === DEN || v === CRACK + 100) c.drawImage(ART.ice[(x * 7 + y * 3) % 3], X, Y, CELL, CELL);
        else if (v === GLAZE) c.drawImage(ART.glaze, X, Y, CELL, CELL);
        else if (v === CRACK) c.drawImage(ART.crack, X, Y, CELL, CELL);
        else if (v === BRIDGE) {
          c.drawImage(ART.ice[1], X, Y, CELL, CELL);
          c.fillStyle = 'rgba(120,190,240,0.35)'; c.fillRect(X, Y, CELL, CELL);
          c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(X + CELL / 2, Y + CELL / 2 + 1, 8, 0, TAU); c.fill();   // the puff frozen in it
          c.fillStyle = 'rgba(40,70,110,0.55)'; c.fillRect(X + CELL / 2 - 4, Y + CELL / 2 - 1, 2, 2.5); c.fillRect(X + CELL / 2 + 2, Y + CELL / 2 - 1, 2, 2.5);
          const melting = beetles.some(b => b.melt && b.melt.x === x && b.melt.y === y);
          if (melting) { c.fillStyle = `rgba(40,110,160,${0.4 + 0.3 * Math.sin(t * 12)})`; c.fillRect(X, Y, CELL, CELL); }
        }
        if (v === CRACK + 100) { c.fillStyle = `rgba(40,100,150,${0.4 + 0.4 * Math.sin(t * 30)})`; c.fillRect(X, Y, CELL, CELL); }
        if (v === DEN) c.drawImage(ART.den, X, Y, CELL, CELL);
      }
      // shoreline foam
      c.strokeStyle = 'rgba(240,250,255,0.55)'; c.lineWidth = 1.5;
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
        if (T[y][x] !== WATER) continue;
        const X = OX + x * CELL, Y = OY + y * CELL;
        if (ground(tileAt(x, y - 1))) { c.beginPath(); c.moveTo(X, Y + 1); c.lineTo(X + CELL, Y + 1); c.stroke(); }
      }
      // walls + rocks (with a little overhang so they read as mounds)
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = T[y][x], X = OX + x * CELL, Y = OY + y * CELL;
        if (v === WALL) c.drawImage(ART.drift[(x + y) % 2], X - 4, Y - 6, CELL + 8, CELL + 8);
        else if (v === ROCK) c.drawImage(ART.rock, X - 4, Y - 6, CELL + 8, CELL + 8);
      }
    }
    function drawBloom(c, b) {
      const x = tx(b.x), y = ty(b.y), s = (1 + 0.06 * Math.sin(t * 3 + b.ph)) * CELL / 32;
      c.save(); c.translate(x, y); c.scale(s, s);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.55; c.drawImage(env.glowSprite('255,150,230'), -22, -22, 44, 44);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      for (let i = 0; i < 6; i++) {
        c.save(); c.rotate(i / 6 * TAU + t * 0.4);
        const gr = c.createLinearGradient(0, 0, 0, -12); gr.addColorStop(0, '#ffd1f0'); gr.addColorStop(1, '#c58cff');
        c.fillStyle = gr; c.beginPath(); c.ellipse(0, -7, 4.2, 8, 0, 0, TAU); c.fill(); c.restore();
      }
      c.fillStyle = '#fff6c0'; c.beginPath(); c.arc(0, 0, 3.4, 0, TAU); c.fill();
      c.restore();
    }
    function drawGate(c) {
      const x = tx(gate.x), y = ty(gate.y), k = gate.open;
      c.save(); c.translate(x, y); c.scale(CELL / 32, CELL / 32);
      c.fillStyle = '#3f9a6a'; c.beginPath(); c.arc(0, 2, 15, 0.25, TAU - 0.25); c.lineTo(0, 2); c.closePath(); c.fill();   // its lily pad
      c.strokeStyle = 'rgba(160,240,200,0.6)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 2, 15, 0.25, TAU - 0.25); c.stroke();
      c.strokeStyle = k >= 1 ? 'rgba(255,230,140,0.9)' : `rgba(255,190,235,${0.35 + 0.25 * Math.sin(t * 3)})`; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 19 + 2 * Math.sin(t * 2), 0, TAU); c.stroke();
      if (k > 0) {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * k;
        const beam = c.createLinearGradient(0, -150, 0, 0); beam.addColorStop(0, 'rgba(255,200,240,0)'); beam.addColorStop(1, 'rgba(255,200,240,0.8)');
        c.fillStyle = beam; c.fillRect(-12, -150, 24, 150);
        c.drawImage(env.glowSprite('255,190,240'), -34, -34, 68, 68);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      }
      for (let i = 0; i < 8; i++) {                                  // a closed bud that opens into a lotus
        c.save(); c.rotate(i / 8 * TAU);
        const spread = 0.25 + 0.75 * k;
        c.translate(0, -3 - 6 * spread);
        c.fillStyle = i % 2 ? '#ff9fd8' : '#ffc4ec';
        c.beginPath(); c.ellipse(0, -5 * spread, 4.5 + 2 * k, 9 + 3 * k, 0, 0, TAU); c.fill(); c.restore();
      }
      c.fillStyle = k > 0.5 ? '#fff3a8' : '#f7c9e9'; c.beginPath(); c.arc(0, 0, 4 + 2 * k, 0, TAU); c.fill();
      c.restore();
    }
    function drawPuff(c, x, y, ph, angry, frozen) {
      const sq = frozen ? 1 : 1 + 0.08 * Math.sin(ph * 2);
      c.save(); c.translate(x, y + (frozen ? 0 : -Math.abs(Math.sin(ph)) * 3)); c.scale(CELL / 32, CELL / 32);
      c.fillStyle = 'rgba(30,50,90,0.25)'; c.beginPath(); c.ellipse(0, 10, 9, 3.5, 0, 0, TAU); c.fill();
      c.scale(sq, 1 / sq);
      const gr = c.createRadialGradient(-3, -4, 1, 0, 0, 11);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, angry ? '#ffc6d2' : '#cfd6ff');
      c.fillStyle = gr;
      c.beginPath();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, rr = 10 + (i % 2 ? 1.6 : 0); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill();
      c.fillStyle = '#1f2a4a';                                       // eyes
      c.beginPath(); c.ellipse(-3.5, -1, 1.8, angry ? 1.3 : 2.4, 0, 0, TAU); c.ellipse(3.5, -1, 1.8, angry ? 1.3 : 2.4, 0, 0, TAU); c.fill();
      if (angry) { c.strokeStyle = '#1f2a4a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-6, -5); c.lineTo(-1.5, -3.5); c.moveTo(6, -5); c.lineTo(1.5, -3.5); c.stroke(); }
      c.fillStyle = 'rgba(255,140,170,0.6)'; c.beginPath(); c.arc(-6, 3, 1.8, 0, TAU); c.arc(6, 3, 1.8, 0, TAU); c.fill();
      c.restore();
    }
    function drawCube(c, q) {
      const wob = q.wob > 0 ? Math.sin(q.wob * 60) * 2 : 0, warn = q.thaw < 1.6;
      const x = q.px + wob + (warn ? Math.sin(t * 40) * 0.8 : 0), y = q.py;
      drawPuff(c, x, y, 0, q.angry, true);
      c.save(); c.translate(x, y); c.scale(CELL / 32, CELL / 32);
      c.fillStyle = 'rgba(160,220,255,0.62)'; c.strokeStyle = 'rgba(235,250,255,0.95)'; c.lineWidth = 1.6;
      c.beginPath(); c.roundRect(-14, -14, 28, 28, 6); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.65)'; c.beginPath(); c.moveTo(-11, -11); c.lineTo(-2, -11); c.lineTo(-11, -2); c.closePath(); c.fill();
      const k = 1 - q.thaw / THAW;                                   // thaw cracks + drips
      if (k > 0.35) { c.strokeStyle = `rgba(60,120,180,${k})`; c.lineWidth = 1; c.beginPath(); c.moveTo(-10, 6); c.lineTo(-2, 0); c.lineTo(5, 9); c.moveTo(4, -10); c.lineTo(9, -2); c.stroke(); }
      if (warn) { c.fillStyle = 'rgba(120,200,255,0.8)'; c.beginPath(); c.arc(8, 14 + (t * 30) % 6, 1.6, 0, TAU); c.fill(); }
      c.restore();
    }
    function drawBeetle(c, b) {
      if (b.dead) return;
      c.save(); c.translate(b.px, b.py); c.scale(CELL / 32, CELL / 32);
      if (b.stun > 0) c.globalAlpha = 0.7;
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(env.glowSprite(b.stun > 0 ? '150,210,255' : '255,120,40'), -18, -18, 36, 36);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.fillStyle = b.stun > 0 ? '#9ec9ec' : '#e2452a'; c.beginPath(); c.ellipse(0, 1, 9, 10.5, 0, 0, TAU); c.fill();
      c.strokeStyle = '#2a0d08'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 11); c.stroke();
      c.fillStyle = '#2a0d08'; c.beginPath(); c.arc(0, -9, 4.5, 0, TAU); c.fill();
      for (const [sx, sy] of [[-4, -2], [4, -2], [-4.5, 5], [4.5, 5]]) { c.beginPath(); c.arc(sx, sy, 1.8, 0, TAU); c.fill(); }
      c.restore();
    }
    function drawFox(c) {
      const ang = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[P.dir];
      const hop = P.moving > 0 ? Math.abs(Math.sin(P.bob)) * 3 : 0;
      const blink = env.invulnerable && Math.sin(t * 30) > 0;
      c.save(); c.translate(P.px, P.py - hop); c.scale(CELL / 32, CELL / 32);
      if (P.fallT > 0) c.globalAlpha = 0.5;
      if (blink) c.globalAlpha = 0.5;
      c.fillStyle = 'rgba(20,40,80,0.28)'; c.beginPath(); c.ellipse(0, 10 + hop, 11, 4, 0, 0, TAU); c.fill();
      c.rotate(ang + Math.PI / 2);                                  // art faces up
      const wag = Math.sin(t * 6) * 0.3 + (P.moving > 0 ? Math.sin(P.bob) * 0.25 : 0);
      c.save(); c.translate(0, 8); c.rotate(wag);                   // bushy tail
      const tg = c.createLinearGradient(0, 0, 0, 16); tg.addColorStop(0, '#f4f8ff'); tg.addColorStop(1, '#ffffff');
      c.fillStyle = tg; c.beginPath(); c.ellipse(0, 9, 5.5, 10, 0, 0, TAU); c.fill();
      c.fillStyle = '#cfe0f5'; c.beginPath(); c.ellipse(0, 15, 3.5, 4, 0, 0, TAU); c.fill(); c.restore();
      const bg = c.createRadialGradient(-2, -2, 1, 0, 0, 11); bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#d9e6f7');
      c.fillStyle = bg; c.beginPath(); c.ellipse(0, 2, 8.5, 10, 0, 0, TAU); c.fill();       // body
      c.fillStyle = '#4f9fe8'; c.beginPath(); c.ellipse(0, -5, 8.5, 3.2, 0, 0, TAU); c.fill();  // scarf
      c.fillStyle = '#3a82cc'; c.beginPath(); c.moveTo(5, -5); c.lineTo(11, 1); c.lineTo(7, 2); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, -11, 7.5, 6.5, 0, 0, TAU); c.fill();  // head
      c.beginPath(); c.moveTo(-6.5, -13); c.lineTo(-5, -21); c.lineTo(-1.5, -15); c.closePath(); c.moveTo(6.5, -13); c.lineTo(5, -21); c.lineTo(1.5, -15); c.closePath(); c.fill();
      c.fillStyle = '#ffc7da'; c.beginPath(); c.moveTo(-5.4, -14.5); c.lineTo(-4.8, -19); c.lineTo(-2.8, -15.4); c.closePath(); c.moveTo(5.4, -14.5); c.lineTo(4.8, -19); c.lineTo(2.8, -15.4); c.closePath(); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(0, -16.5, 3.2, 3.6, 0, 0, TAU); c.fill();   // snout
      c.fillStyle = '#1d2540'; c.beginPath(); c.arc(0, -19, 1.4, 0, TAU); c.fill();
      c.beginPath(); c.arc(-3, -12.5, 1.3, 0, TAU); c.arc(3, -12.5, 1.3, 0, TAU); c.fill();
      if (P.breath > 0) {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = P.breath / 0.35;
        c.drawImage(env.glowSprite('200,240,255'), -12, -40, 24, 24); c.globalCompositeOperation = 'source-over';
      }
      c.restore();
    }
    function render(c) {
      drawBack(c);
      drawBoard(c);
      for (const b of blooms) if (!b.got) drawBloom(c, b);
      drawGate(c);
      // everything on the board, back to front
      const ents = [];
      for (const p of puffs) ents.push({ y: p.py, d: () => drawPuff(c, p.px, p.py, p.ph, p.angry > 0, false) });
      for (const q of cubes) ents.push({ y: q.py, d: () => drawCube(c, q) });
      for (const b of beetles) ents.push({ y: b.py, d: () => drawBeetle(c, b) });
      ents.push({ y: P.py, d: () => drawFox(c) });
      ents.sort((a, b) => a.y - b.y).forEach(e => e.d());
      // snowfall
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (const s of snow) { c.beginPath(); c.arc(s.x, s.y, s.s, 0, TAU); c.fill(); }
      // board frame
      c.strokeStyle = 'rgba(220,240,255,0.5)'; c.lineWidth = 2; c.beginPath(); c.roundRect(OX - 3, OY - 3, COLS * CELL + 6, ROWS * CELL + 6, 10); c.stroke();
      if (msgT > 0) {
        c.save(); c.globalAlpha = Math.min(1, msgT * 2); c.textAlign = 'center';
        c.fillStyle = 'rgba(10,25,50,0.7)'; c.beginPath(); c.roundRect(W / 2 - 150, OY + ROWS * CELL + 12, 300, 30, 15); c.fill();
        c.fillStyle = '#eaf6ff'; c.font = 'bold 13.5px system-ui'; c.textBaseline = 'middle'; c.fillText(msg, W / 2, OY + ROWS * CELL + 27); c.restore();
      }
    }
    window.__frost = {                              // test hook (headless playtests)
      teleport(x, y, dir) { P.x = x; P.y = y; P.px = tx(x); P.py = ty(y); P.moving = 0; if (dir) P.dir = dir; },
      puff(x, y) { const p = newPuff(x, y, false); p.wait = 99; puffs.push(p); return p; },
      level: () => L
    };
    return {
      update, render,
      debug: () => ({ level: LV, cell: CELL, px: P.x, py: P.y, dir: P.dir, puffs: puffs.length, cubes: cubes.length, blooms: blooms.filter(b => b.got).length + '/' + blooms.length,
        gate: gate.open, timeLeft: Math.round(timeLeft), hits, route: L.route.map(r => r.key).join('>'), bridges: T.flat().filter(v => v === BRIDGE).length,
        grid: T.map(r => r.join('')).join('/'), gx: gate.x, gy: gate.y, bl: blooms.map(b => [b.x, b.y, b.got ? 1 : 0]), dens: L.dens.map(d => [d.x, d.y]),
        cross: L.crossings.map(c => ({ dir: c.dir, lanes: c.lanes })) })
    };
  }
})();
