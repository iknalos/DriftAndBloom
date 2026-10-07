// ============================================================================
// Drift & Bloom — SEED THIEF (Adventure round 7). Lode Runner + Boulder Dash + "steal it and run home".
// Nib the raccoon bandit raids the Mole King's burrows for the golden seeds the moles hoarded.
// Grab seeds and carry them home to the burrow on the surface — every seed in the sack slows Nib
// down, so bank them on the way. Dig holes in the soil beside you: mole guards fall in and get stuck,
// and a hole that closes on a mole sends it back to its den. Dig under a boulder to drop it (it
// flattens whatever is below). The moles are near-blind: they patrol with lanterns, and stepping
// into a lantern's beam gets you spotted — then they charge.
// ============================================================================
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const COLS = 22, ROWS = 14;
  let CELL = 36, OY = 186;                                     // landscape: sized to fill the view (create)
  const AIR = 0, SOIL = 1, STONE = 2, LADDER = 3, BAR = 4, HOLE = 5;
  const FLOORS = [2, 5, 8, 11];                                 // floor brick rows; you walk on the row above each

  DABWorlds.register('thief', {
    title: 'Seed Thief', color: '230,170,90', opaque: true,
    landscape: { top: 168, h: 540 },
    music: 'music_thief',
    sounds: ['dig', 'seed', 'bank', 'spotted', 'trap', 'boulder', 'squash', 'refill', 'hurt'],
    subtitle: () => 'Nib the raccoon bandit raids the Mole King\'s burrows for the golden seeds.',
    hint: 'Steal every golden seed and carry them home — stay out of the lantern light',
    howto: ['Stick: run · climb roots · drop  ·  ⛏: dig a hole beside you', 'Moles fall into holes — a closing hole sends them home',
            'Seeds weigh you down: bank them at the burrow'],
    controls: { dirs: 'stick', buttons: [{ id: 'attack', icon: 'dig' }, { id: 'special', icon: 'restart' }] },
    create
  });

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ── level ────────────────────────────────────────────────────────────────
  function makeLevel(LV, seed) {
    const r = rng(seed * 4241 + LV * 37);
    const T = Array.from({ length: ROWS }, () => Array(COLS).fill(AIR));
    for (let x = 0; x < COLS; x++) T[ROWS - 1][x] = STONE;
    for (const f of FLOORS) for (let x = 0; x < COLS; x++) T[f][x] = r() < 0.06 + LV * 0.015 && f > 2 ? STONE : SOIL;
    for (let y = 0; y < ROWS; y++) { T[y][0] = y >= 2 ? STONE : AIR; T[y][COLS - 1] = y >= 2 ? STONE : AIR; }
    // ladders between consecutive levels (the surface walk row is 1)
    const walk = [1].concat(FLOORS.slice(1).map(f => f - 1)).concat([ROWS - 2]);
    const ladders = [];
    for (let k = 0; k < walk.length - 1; k++) {
      const n = 2 + (r() < 0.5 ? 1 : 0);
      const used = [];
      for (let i = 0; i < n; i++) {
        let c, tries = 0;
        do { c = 2 + Math.floor(r() * (COLS - 4)); tries++; } while (tries < 30 && used.some(u => Math.abs(u - c) < 4));
        used.push(c);
        for (let y = walk[k]; y <= walk[k + 1]; y++) T[y][c] = LADDER;
        ladders.push({ x: c, y0: walk[k], y1: walk[k + 1] });
      }
      // a gap or two to drop through (not next to a ladder)
      if (k < walk.length - 2 || true) for (let g = 0; g < 1 + (r() < 0.4 ? 1 : 0); g++) {
        const f = FLOORS[k + 1 > FLOORS.length - 1 ? FLOORS.length - 1 : k + 1];
        const c = 2 + Math.floor(r() * (COLS - 4));
        if (f && T[f][c] !== LADDER && !used.some(u => Math.abs(u - c) < 2) && k + 1 < FLOORS.length) T[f][c] = AIR;
      }
    }
    // hanging roots (bars) across some tunnels
    if (LV >= 2) for (let k = 1; k < walk.length; k++) {
      if (r() < 0.55) {
        const y = walk[k] - 1, x0 = 2 + Math.floor(r() * (COLS - 10)), len = 4 + Math.floor(r() * 5);
        for (let x = x0; x < x0 + len && x < COLS - 1; x++) if (T[y][x] === AIR) T[y][x] = BAR;
      }
    }
    const isWalkCell = (x, y) => T[y][x] === AIR || T[y][x] === LADDER;
    const supported = (x, y) => { const b = T[y + 1] && T[y + 1][x]; return b === SOIL || b === STONE || b === LADDER; };
    // seeds on the walk rows (not on ladders), spread over the levels
    const nSeeds = Math.min(12, 4 + Math.floor(LV * 0.8));
    const seeds = [], boulders = [], guards = [];
    const freeOn = y => { const out = []; for (let x = 2; x < COLS - 2; x++) if (T[y][x] === AIR && supported(x, y)) out.push(x); return out; };
    for (let i = 0; i < nSeeds; i++) {
      const y = walk[1 + (i % (walk.length - 1))];
      const xs = freeOn(y).filter(x => !seeds.some(s => s.x === x && s.y === y) && T[y][x] === AIR);
      if (xs.length) seeds.push({ x: xs[Math.floor(r() * xs.length)], y, got: false });
    }
    // boulders block tunnels: dig under them to drop them (stage 3+); never next to a ladder, always on soil
    if (LV >= 3) for (let i = 0; i < Math.min(4, Math.floor(LV / 2)); i++) {
      const y = walk[1 + Math.floor(r() * (walk.length - 2))];
      const xs = freeOn(y).filter(x => T[y + 1][x] === SOIL && T[y][x - 1] !== LADDER && T[y][x + 1] !== LADDER && !seeds.some(s => s.x === x && s.y === y) && !boulders.some(b => b.x === x && b.y === y));
      if (xs.length) boulders.push({ x: xs[Math.floor(r() * xs.length)], y, fall: 0 });
    }
    const nGuards = Math.min(5, 1 + Math.floor(LV / 2.4));
    for (let i = 0; i < nGuards; i++) {
      const y = walk[1 + Math.floor(r() * (walk.length - 1))];
      const xs = freeOn(y).filter(x => x > 6 && !boulders.some(b => b.x === x && b.y === y));
      if (xs.length) guards.push({ x: xs[Math.floor(r() * xs.length)], y });
    }
    return { T, seeds, boulders, guards, walk, home: { x: 2, y: 1 }, start: { x: 3, y: 1 } };
  }

  function create(env) {
    const LV = env.level, fx = env.fx;
    const W = () => env.W;
    if (env.land) {
      CELL = Math.max(30, Math.floor(Math.min(env.W / COLS, (env.view.h - 30) / ROWS)));
      OY = env.view.top + Math.round((env.view.h - ROWS * CELL) / 2) + 8;
    } else { CELL = 36; OY = 186; }
    const sfx = (n, o) => env.sfx(n, o);
    const HOLE_T = Math.max(3.4, 6.5 - LV * 0.3);               // seconds a dug hole stays open
    const GSPD = 2.2 + LV * 0.13, NSPD = 4.4;                      // cells per second
    const SIGHT = 4 + Math.floor(LV / 2);                          // how far a lantern reaches (cells)
    let seedN = 1, L, T, P, guards, boulders, seeds, holes, t = 0, banked = 0, hits = 0, spotted = 0, msg = '', msgT = 0, done = false;
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * COLS * CELL, y: Math.random() * 70, s: Math.random() * 1.5 + 0.3, ph: Math.random() * TAU }));
    function load() {
      L = makeLevel(LV, seedN);
      T = L.T.map(r => r.slice());
      P = ent(L.start.x, L.start.y); P.sack = 0; P.face = 1; P.digT = 0;
      guards = L.guards.map(g => Object.assign(ent(g.x, g.y), { home: { x: g.x, y: g.y }, face: -1, stuck: 0, dead: 0, alert: 0, patrol: Math.random() < 0.5 ? -1 : 1, think: 0 }));
      boulders = L.boulders.map(b => ({ x: b.x, y: b.y, py: b.y * CELL, falling: false }));
      seeds = L.seeds.map(s => Object.assign({ ph: Math.random() * TAU }, s));
      holes = [];
    }
    function ent(x, y) { return { x, y, px: x * CELL, py: y * CELL, mv: null, k: 0, face: 1, anim: 0 }; }
    load();
    const tile = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? STONE : T[y][x]);
    const solid = v => v === SOIL || v === STONE;
    const boulderAt = (x, y) => boulders.find(b => b.x === x && b.y === y && !b.gone);
    const guardAt = (x, y, self) => guards.find(g => g !== self && !g.dead && g.x === x && g.y === y);
    const holeAt = (x, y) => holes.find(h => h.x === x && h.y === y);
    // standing support: a solid brick, a ladder below, a stuck mole in a hole below, a boulder below
    function supported(x, y, who) {
      if (tile(x, y) === LADDER || tile(x, y) === BAR) return true;
      const b = tile(x, y + 1);
      if (solid(b) || b === LADDER) return true;
      if (boulderAt(x, y + 1)) return true;
      const g = guardAt(x, y + 1, who); if (g && g.stuck > 0) return true;
      return false;
    }
    const blocked = (x, y) => solid(tile(x, y)) || !!boulderAt(x, y);
    function say(s) { msg = s; msgT = 2.2; }

    // ── movement for any entity: try to step (dx, dy); returns true if a move started ──
    function stepFrom(e, dx, dy, speed) {
      const nx = e.x + dx, ny = e.y + dy;
      if (dy < 0 && tile(e.x, e.y) !== LADDER) return false;                         // climb only on a ladder
      if (dy > 0 && !(tile(e.x, e.y) === LADDER || tile(e.x, ny) === LADDER || tile(e.x, e.y) === BAR || !supported(e.x, e.y, e))) {
        if (tile(e.x, ny) !== AIR && tile(e.x, ny) !== HOLE) return false;
      }
      if (blocked(nx, ny)) return false;
      if (e !== P && guardAt(nx, ny, e)) return false;
      e.mv = { fx: e.x, fy: e.y, tx: nx, ty: ny, dur: 1 / speed }; e.k = 0; e.x = nx; e.y = ny;
      if (dx) e.face = dx;
      return true;
    }
    function fallCheck(e) {                                       // nothing holding you: drop a cell
      if (e.mv) return false;
      if (supported(e.x, e.y, e)) return false;
      if (blocked(e.x, e.y + 1)) return false;
      e.mv = { fx: e.x, fy: e.y, tx: e.x, ty: e.y + 1, dur: 0.12, fall: true }; e.k = 0; e.y += 1;
      return true;
    }
    function moveTick(e, dt) {
      if (!e.mv) { e.px = e.x * CELL; e.py = e.y * CELL; return true; }
      e.k += dt / e.mv.dur; e.anim += dt * 10;
      const k = Math.min(1, e.k);
      e.px = (e.mv.fx + (e.mv.tx - e.mv.fx) * k) * CELL; e.py = (e.mv.fy + (e.mv.ty - e.mv.fy) * k) * CELL;
      if (e.k >= 1) { e.mv = null; return true; }
      return false;
    }

    // ── digging ──
    function dig() {
      if (P.digT > 0 || P.mv) return;
      const x = P.x + P.face, y = P.y + 1;
      if (tile(x, y) !== SOIL || (tile(x, P.y) !== AIR && !boulderAt(x, P.y)) || guardAt(x, P.y)) { sfx('dig', { vol: 0.25, rate: 0.6 }); return; }
      T[y][x] = HOLE; holes.push({ x, y, t: HOLE_T, fill: 0 });
      P.digT = 0.32; sfx('dig', { vol: 0.85 });
      for (let i = 0; i < 12; i++) fx.spawn({ x: x * CELL + CELL / 2 + ox(), y: y * CELL + 8 + OY, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 120, g: 500, kind: 'spark', size: 2.4, life: 0.5, rgb: '140,95,55' });
    }
    function updateHoles(dt) {
      for (const h of holes) {
        h.t -= dt;
        if (h.t <= 0.5 && h.t + dt > 0.5) sfx('refill', { vol: 0.4 });
        if (h.t <= 0) {
          T[h.y][h.x] = SOIL; h.gone = true;
          if (P.x === h.x && P.y === h.y) { hurt('Buried!'); }
          const g = guardAt(h.x, h.y);
          if (g) { g.dead = 2.2; g.stuck = 0; sfx('trap', { vol: 0.8 }); env.floatText(h.x * CELL + ox() + CELL / 2, h.y * CELL + OY, 'back to the den!', '255,220,150'); }
        }
      }
      holes = holes.filter(h => !h.gone);
    }
    // ── boulders: unsupported ones fall, flattening moles (and raccoons) ──
    function updateBoulders(dt) {
      for (const b of boulders) {
        if (b.gone) continue;
        if (!b.falling) {
          const below = tile(b.x, b.y + 1);
          if (below === AIR || below === HOLE || below === BAR) { b.falling = true; b.v = 0; sfx('boulder', { vol: 0.7 }); }
          else { b.py = b.y * CELL; continue; }
        }
        b.v = Math.min(14, (b.v || 0) + dt * 30);
        b.py += b.v * CELL * dt;
        while (b.py >= (b.y + 1) * CELL) {
          const ny = b.y + 1, nb = tile(b.x, ny);
          const g = guards.find(q => !q.dead && q.x === b.x && q.y === ny);
          if (g) { g.dead = 2.6; sfx('squash', { vol: 0.9 }); env.shake(0.25); env.floatText(b.x * CELL + ox() + CELL / 2, ny * CELL + OY, 'BONK!', '255,230,170'); }
          if (P.x === b.x && P.y === ny) hurt('Flattened!');
          if (nb === HOLE) { const h = holeAt(b.x, ny); if (h) h.t = 0.01; }
          if (solid(nb) || nb === LADDER || ny >= ROWS - 1) { b.falling = false; b.py = b.y * CELL; env.shake(0.15); break; }
          b.y = ny;
        }
      }
    }

    // ── moles: patrol with lanterns; spot Nib in the beam and chase (shortest path on the grid) ──
    function sees(g) {
      if (g.stuck > 0 || g.dead) return false;
      if (P.y !== g.y) return Math.abs(P.y - g.y) === 1 && Math.abs(P.x - g.x) <= 1;
      const dx = P.x - g.x;
      if (Math.sign(dx) !== g.face && dx !== 0) return false;
      if (Math.abs(dx) > SIGHT) return false;
      for (let x = Math.min(P.x, g.x) + 1; x < Math.max(P.x, g.x); x++) if (blocked(x, g.y)) return false;
      return true;
    }
    function pathStep(g) {                                        // BFS towards Nib over walk / climb / fall moves
      const key = (x, y) => y * COLS + x, start = key(g.x, g.y), goal = key(P.x, P.y);
      const prev = new Map([[start, -1]]), q = [start];
      while (q.length) {
        const k = q.shift(); if (k === goal) break;
        const x = k % COLS, y = (k / COLS) | 0;
        const moves = [];
        const sup = supported(x, y, g);
        if (!sup && !blocked(x, y + 1)) moves.push([0, 1]);
        else {
          for (const dx of [-1, 1]) if (!blocked(x + dx, y)) moves.push([dx, 0]);
          if (tile(x, y) === LADDER && !blocked(x, y - 1)) moves.push([0, -1]);
          if ((tile(x, y + 1) === LADDER || tile(x, y + 1) === AIR || tile(x, y + 1) === HOLE || tile(x, y) === BAR) && !blocked(x, y + 1)) moves.push([0, 1]);
        }
        for (const [dx, dy] of moves) { const n = key(x + dx, y + dy); if (!prev.has(n)) { prev.set(n, k); q.push(n); } }
      }
      if (!prev.has(goal)) return null;
      let k = goal; while (prev.get(k) !== start && prev.get(k) !== -1) k = prev.get(k);
      return [k % COLS - g.x, ((k / COLS) | 0) - g.y];
    }
    function updateGuard(g, dt) {
      if (g.dead > 0) {
        g.dead -= dt;
        if (g.dead <= 0) { g.x = g.home.x; g.y = g.home.y; g.px = g.x * CELL; g.py = g.y * CELL; g.mv = null; g.stuck = 0; g.alert = 0; }
        return;
      }
      if (!moveTick(g, dt)) return;
      // fell into a hole: stuck, then climb out toward the raccoon
      if (tile(g.x, g.y) === HOLE && g.stuck <= 0 && !g.climbed) { g.stuck = 2.4; g.climbed = true; sfx('trap', { vol: 0.5, rate: 1.3 }); return; }
      if (g.stuck > 0) {
        g.stuck -= dt;
        if (g.stuck <= 0) {
          const dir = Math.sign(P.x - g.x) || 1;
          if (!blocked(g.x + dir, g.y - 1) && !guardAt(g.x + dir, g.y - 1, g)) { g.mv = { fx: g.x, fy: g.y, tx: g.x + dir, ty: g.y - 1, dur: 0.35 }; g.k = 0; g.x += dir; g.y -= 1; }
          else if (!blocked(g.x, g.y - 1)) { g.mv = { fx: g.x, fy: g.y, tx: g.x, ty: g.y - 1, dur: 0.35 }; g.k = 0; g.y -= 1; }
        }
        return;
      }
      if (tile(g.x, g.y) !== HOLE) g.climbed = false;
      if (fallCheck(g)) return;
      if (sees(g)) { if (g.alert <= 0) { sfx('spotted', { vol: 0.7 }); spotted++; env.floatText(g.px + ox() + CELL / 2, g.py + OY - 6, '!', '255,220,90'); } g.alert = 3.2; }
      g.alert -= dt;
      const spd = GSPD * (g.alert > 0 ? 1.45 : 0.8);
      g.think -= dt;
      if (g.alert > 0) {
        const s = pathStep(g);
        if (s) { stepFrom(g, s[0], s[1], spd); return; }
      }
      // patrol: walk the tunnel, turn at walls / edges; sometimes take a ladder
      if (tile(g.x, g.y) === LADDER && g.think <= 0 && Math.random() < 0.3) {
        g.think = 2;
        if (stepFrom(g, 0, Math.random() < 0.5 ? -1 : 1, spd)) return;
      }
      const nx = g.x + g.patrol;
      const edge = !blocked(nx, g.y) && !solid(tile(nx, g.y + 1)) && tile(nx, g.y + 1) !== LADDER && tile(nx, g.y) !== LADDER && tile(nx, g.y) !== BAR;
      if (blocked(nx, g.y) || guardAt(nx, g.y, g) || (edge && Math.random() < 0.75)) { g.patrol *= -1; g.face = g.patrol; return; }
      stepFrom(g, g.patrol, 0, spd);
    }

    function hurt(why) {
      if (env.invulnerable || done) return;
      hits++; env.damage(34, { x: P.px + ox() + CELL / 2, y: P.py + OY, text: why });
      env.invuln(1.6); env.shake(0.3);
      // drop the sack where you were caught: the seeds scatter back onto the floor
      if (P.sack > 0) {
        let n = P.sack; P.sack = 0;
        for (let dx = 0; n > 0 && dx < 8; dx++) for (const s of [dx, -dx]) { const x = P.x + s; if (n > 0 && tile(x, P.y) === AIR && supported(x, P.y, P) && !seeds.some(q => !q.got && q.x === x && q.y === P.y)) { seeds.push({ x, y: P.y, got: false, ph: 0 }); n--; } }
        say('You dropped your seeds!');
      }
      P.x = L.start.x; P.y = L.start.y; P.mv = null; P.px = P.x * CELL; P.py = P.y * CELL;
    }

    const ox = () => { const w = W(), bw = COLS * CELL; return bw <= w ? (w - bw) / 2 : -Math.max(0, Math.min(bw - w, P.px + CELL / 2 - w / 2)); };
    function update(dt, I) {
      t += dt; msgT = Math.max(0, msgT - dt);
      if (done) return;
      if (I.pressed.special) { seedN++; load(); banked = 0; say('A fresh burrow — same seeds to steal'); return; }
      P.digT = Math.max(0, P.digT - dt);
      if (I.pressed.attack) dig();
      if (moveTick(P, dt)) {
        // pick up / bank
        const s = seeds.find(q => !q.got && q.x === P.x && q.y === P.y);
        if (s) { s.got = true; P.sack++; sfx('seed', { vol: 0.7, rate: 1 + P.sack * 0.04 }); env.floatText(P.px + ox() + CELL / 2, P.py + OY - 4, '+1 seed', '255,220,100'); }
        if (P.x === L.home.x && P.y === L.home.y && P.sack > 0) {
          banked += P.sack; sfx('bank', { vol: 0.9 }); env.floatText(P.px + ox() + CELL / 2, P.py + OY - 10, `${P.sack} banked!`, '160,255,170');
          for (let i = 0; i < 18; i++) fx.spawn({ x: P.px + ox() + CELL / 2, y: P.py + OY, vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 160, g: 300, kind: 'spark', size: 2, life: 0.6, rgb: '255,220,90' });
          P.sack = 0;
          if (seeds.every(q => q.got)) { win(); return; }
        }
        if (!fallCheck(P)) {
          const ax = I.ax || 0, ay = I.ay || 0;
          const spd = NSPD * Math.max(0.62, 1 - P.sack * 0.055);
          if (Math.abs(ay) > 0.55 && Math.abs(ay) >= Math.abs(ax)) stepFrom(P, 0, ay > 0 ? 1 : -1, spd * 0.85);
          else if (Math.abs(ax) > 0.3) { if (!stepFrom(P, ax > 0 ? 1 : -1, 0, spd)) P.face = ax > 0 ? 1 : -1; }
        }
      }
      for (const g of guards) {
        updateGuard(g, dt);
        if (!g.dead && g.stuck <= 0 && Math.abs(g.px - P.px) < CELL * 0.6 && Math.abs(g.py - P.py) < CELL * 0.6) hurt('Caught by a mole!');
      }
      updateHoles(dt);
      updateBoulders(dt);
      const left = seeds.filter(q => !q.got).length;
      env.hud.objective = left ? `Seeds left: ${left}  ·  in the sack: ${P.sack}` : P.sack ? 'Run home to the burrow!' : 'Run home!';
      env.hud.progress = Math.min(1, banked / Math.max(1, L.seeds.length));
      env.hud.counters = [{ icon: '🌰', value: `${banked}` }];
    }
    function win() {
      done = true; sfx('bank', { vol: 1, rate: 1.2 }); env.flash('255,230,150', 0.4);
      if (env.round) env.setStars(hits === 0 && spotted <= 2 ? 3 : hits <= 1 ? 2 : 1);
      setTimeout(() => env.win(), 700);
    }

    // ── drawing ──
    function render(c) {
      const Wv = W(), X = ox();
      // night sky over the meadow, then the dark earth
      const sky = c.createLinearGradient(0, 0, 0, OY + 2 * CELL);
      sky.addColorStop(0, '#0b1230'); sky.addColorStop(1, '#2c3a6a');
      c.fillStyle = sky; c.fillRect(0, 0, Wv, OY + 2 * CELL + 10);
      for (const s of stars) { c.fillStyle = `rgba(255,250,220,${0.4 + 0.4 * Math.sin(t * 2 + s.ph)})`; c.fillRect(((s.x + X * 0.3) % Wv + Wv) % Wv, OY - 80 + s.y, s.s, s.s); }
      c.fillStyle = 'rgba(255,248,215,0.9)'; c.beginPath(); c.arc(Wv * 0.82, OY - 50, 18, 0, TAU); c.fill();
      const earth = c.createLinearGradient(0, OY + 2 * CELL, 0, OY + ROWS * CELL);
      earth.addColorStop(0, '#3b2717'); earth.addColorStop(1, '#1d120a');
      c.fillStyle = earth; c.fillRect(0, OY + 2 * CELL, Wv, 844);
      c.save(); c.translate(X, OY);
      // tunnels: dug-out, a little lighter
      for (let y = 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = T[y][x];
        if (v === AIR || v === LADDER || v === BAR || v === HOLE) { c.fillStyle = '#4a321e'; c.fillRect(x * CELL, y * CELL, CELL, CELL); }
      }
      // glowing mushrooms + roots decorating the tunnel walls
      for (let i = 0; i < 26; i++) {
        const x = (i * 157) % (COLS * CELL), y = CELL * (2.5 + (i * 3.7) % (ROWS - 3));
        c.fillStyle = `rgba(140,255,200,${0.25 + 0.15 * Math.sin(t * 2 + i)})`; c.beginPath(); c.arc(x, y, 3, Math.PI, 0); c.fill();
      }
      // bricks
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = T[y][x], px = x * CELL, py = y * CELL;
        if (v === SOIL) {
          c.fillStyle = y === 2 ? '#5f3d22' : '#6b4527'; c.beginPath(); c.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 7); c.fill();
          c.fillStyle = 'rgba(255,220,170,0.12)'; c.beginPath(); c.roundRect(px + 3, py + 3, CELL - 10, 6, 3); c.fill();
          c.fillStyle = 'rgba(30,15,5,0.35)'; c.fillRect(px + 6, py + CELL - 9, 4, 3); c.fillRect(px + 20, py + CELL - 14, 3, 3);
          if (y === 2) { c.fillStyle = '#4c8a3a'; c.fillRect(px, py, CELL, 6); for (let k = 0; k < 5; k++) { c.fillStyle = '#6fb54d'; c.fillRect(px + k * 7 + 2, py - 4, 2, 6); } }
        } else if (v === STONE) {
          c.fillStyle = '#6f727c'; c.beginPath(); c.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 4); c.fill();
          c.strokeStyle = 'rgba(30,30,40,0.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 4, py + CELL / 2); c.lineTo(px + CELL - 6, py + CELL / 2 + 3); c.stroke();
        } else if (v === HOLE) {
          const h = holeAt(x, y), k = h ? Math.max(0, 1 - h.t / 0.5) : 0;
          c.fillStyle = '#1a0f07'; c.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
          if (k > 0) { c.fillStyle = '#6b4527'; c.fillRect(px + 1, py + CELL - (CELL - 2) * k - 1, CELL - 2, (CELL - 2) * k); }
        } else if (v === LADDER) {                                   // twisted root ladder
          c.strokeStyle = '#8a5a2e'; c.lineWidth = 3.5;
          c.beginPath(); c.moveTo(px + 9, py); c.lineTo(px + 9, py + CELL); c.moveTo(px + CELL - 9, py); c.lineTo(px + CELL - 9, py + CELL); c.stroke();
          c.lineWidth = 3; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(px + 9, py + 7 + k * 11); c.lineTo(px + CELL - 9, py + 7 + k * 11 + 2); c.stroke(); }
        } else if (v === BAR) {
          c.strokeStyle = '#7d5a34'; c.lineWidth = 3; c.beginPath(); c.moveTo(px, py + 6); c.quadraticCurveTo(px + CELL / 2, py + 9, px + CELL, py + 6); c.stroke();
        }
      }
      // home burrow on the surface
      const hx = L.home.x * CELL, hy = L.home.y * CELL;
      c.fillStyle = '#2a1a0d'; c.beginPath(); c.ellipse(hx + CELL / 2, hy + CELL - 2, CELL * 0.62, CELL * 0.5, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#4c8a3a'; c.beginPath(); c.ellipse(hx + CELL / 2, hy + CELL - 2, CELL * 0.75, CELL * 0.62, 0, Math.PI, 0); c.lineWidth = 4; c.strokeStyle = '#4c8a3a'; c.stroke();
      c.fillStyle = 'rgba(255,220,120,0.9)'; c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.fillText(`🏠 ${banked}`, hx + CELL / 2, hy - 4);
      // seeds
      for (const s of seeds) {
        if (s.got) continue;
        const px = s.x * CELL + CELL / 2, py = s.y * CELL + CELL - 10 + Math.sin(t * 3 + s.ph) * 2;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(env.glowSprite('255,210,80'), px - 16, py - 16, 32, 32); c.restore();
        c.fillStyle = '#f6c548'; c.beginPath(); c.ellipse(px, py, 6, 8, 0.3, 0, TAU); c.fill();
        c.fillStyle = '#fff2b0'; c.beginPath(); c.ellipse(px - 2, py - 3, 2, 3, 0.3, 0, TAU); c.fill();
      }
      // boulders
      for (const b of boulders) {
        if (b.gone) continue;
        const px = b.x * CELL + CELL / 2, py = b.py + CELL / 2 + 1;
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(px + 3, py + CELL / 2 - 3, CELL * 0.4, 5, 0, 0, TAU); c.fill();
        const gr = c.createRadialGradient(px - 6, py - 7, 2, px, py, CELL * 0.5); gr.addColorStop(0, '#b3a89a'); gr.addColorStop(1, '#5c554c');
        c.fillStyle = gr; c.beginPath(); c.arc(px, py, CELL * 0.46, 0, TAU); c.fill();
      }
      // lantern beams (additive warm light)
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const g of guards) {
        if (g.dead || g.stuck > 0) continue;
        let reach = 0; while (reach < SIGHT && !blocked(g.x + g.face * (reach + 1), g.y)) reach++;   // the beam stops at walls
        const lx = g.px + CELL / 2 + g.face * 10, ly = g.py + CELL / 2 - 2, len = Math.max(CELL * 0.6, reach * CELL + CELL * 0.4);
        const gr = c.createLinearGradient(lx, ly, lx + g.face * len, ly);
        gr.addColorStop(0, g.alert > 0 ? 'rgba(255,120,60,0.45)' : 'rgba(255,220,120,0.35)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
        c.fillStyle = gr; c.beginPath(); c.moveTo(lx, ly - 4); c.lineTo(lx + g.face * len, ly - CELL * 0.7); c.lineTo(lx + g.face * len, ly + CELL * 0.55); c.lineTo(lx, ly + 4); c.closePath(); c.fill();
      }
      c.restore();
      for (const g of guards) if (!g.dead) drawMole(c, g);
      drawRaccoon(c);
      c.restore();
      if (msgT > 0) {
        c.save(); c.globalAlpha = Math.min(1, msgT * 2); c.textAlign = 'center';
        c.fillStyle = 'rgba(30,15,5,0.8)'; c.beginPath(); c.roundRect(Wv / 2 - 140, OY + ROWS * CELL + 10, 280, 28, 14); c.fill();
        c.fillStyle = '#ffe9c2'; c.font = 'bold 13px system-ui'; c.textBaseline = 'middle'; c.fillText(msg, Wv / 2, OY + ROWS * CELL + 24); c.restore();
      }
    }
    function drawMole(c, g) {
      const x = g.px + CELL / 2, y = g.py + CELL, walk = g.mv ? Math.sin(g.anim) : 0;
      c.save(); c.translate(x, y); c.scale(g.face * CELL / 36, CELL / 36);
      if (g.stuck > 0) { c.translate(0, 4); c.rotate(Math.sin(t * 20) * 0.08); }
      c.fillStyle = '#5a3b2a'; c.beginPath(); c.ellipse(0, -13, 12, 12, 0, 0, TAU); c.fill();            // body
      c.fillStyle = '#7a5640'; c.beginPath(); c.ellipse(2, -10, 7, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#ff9ab0'; c.beginPath(); c.ellipse(12, -15, 4, 3, 0, 0, TAU); c.fill();              // pink nose
      c.fillStyle = '#ffd34d'; c.beginPath(); c.ellipse(-1, -24, 10, 5, 0, Math.PI, 0); c.fill();         // hard hat
      c.fillStyle = '#e8b52c'; c.fillRect(-11, -25, 22, 2.5);
      c.fillStyle = '#1b1310'; c.fillRect(4, -19, 6, 2);                                                   // squinty eyes
      c.fillStyle = '#ffd6e0'; c.beginPath(); c.ellipse(-6 + walk * 3, -1, 4, 2.5, 0, 0, TAU); c.ellipse(6 - walk * 3, -1, 4, 2.5, 0, 0, TAU); c.fill();   // paws
      c.strokeStyle = '#3b2a1f'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(10, -9); c.lineTo(15, -3); c.stroke();     // lantern on a stick
      c.fillStyle = g.alert > 0 ? '#ff8a4a' : '#ffe08a'; c.beginPath(); c.arc(16, -2, 3.5, 0, TAU); c.fill();
      if (g.stuck > 0) { c.fillStyle = '#ffffff'; c.font = 'bold 12px system-ui'; c.fillText('?!', -6, -32); }
      c.restore();
    }
    function drawRaccoon(c) {
      const x = P.px + CELL / 2, y = P.py + CELL, walk = P.mv ? Math.sin(P.anim) : 0, climb = tile(P.x, P.y) === LADDER && P.mv && P.mv.fx === P.mv.tx;
      const blink = env.invulnerable && Math.sin(t * 30) > 0;
      c.save(); c.translate(x, y); c.scale(P.face * CELL / 36, CELL / 36); if (blink) c.globalAlpha = 0.45;
      // striped tail
      c.save(); c.translate(-9, -12); c.rotate(-0.6 + Math.sin(t * 6) * 0.2);
      for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#2b2b33' : '#9a9aa6'; c.beginPath(); c.ellipse(-i * 5, 0, 4.5, 4, 0, 0, TAU); c.fill(); }
      c.restore();
      // the sack (bigger with every seed)
      if (P.sack > 0) { const s = 6 + Math.min(8, P.sack * 1.2); c.fillStyle = '#c9a36b'; c.beginPath(); c.arc(-8, -20, s, 0, TAU); c.fill(); c.fillStyle = '#f6c548'; c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.fillText(P.sack, -8, -17); }
      c.fillStyle = '#8f8f9b'; c.beginPath(); c.ellipse(0, -11, 9, 10, 0, 0, TAU); c.fill();                 // body
      c.fillStyle = '#b5b5c0'; c.beginPath(); c.ellipse(2, -24, 8, 7, 0, 0, TAU); c.fill();                  // head
      c.fillStyle = '#26262e'; c.beginPath(); c.moveTo(-4, -26); c.lineTo(10, -27); c.lineTo(10, -22); c.lineTo(-4, -22); c.closePath(); c.fill();   // the bandit mask
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(6, -24.5, 1.6, 0, TAU); c.fill();
      c.fillStyle = '#26262e'; c.beginPath(); c.moveTo(-3, -30); c.lineTo(-1, -35); c.lineTo(2, -30); c.closePath(); c.moveTo(4, -30); c.lineTo(7, -35); c.lineTo(9, -30); c.closePath(); c.fill();
      c.fillStyle = '#1b1b22'; c.beginPath(); c.arc(11, -22, 1.6, 0, TAU); c.fill();
      c.fillStyle = '#4b4b56'; c.fillRect(-5 + (climb ? 0 : walk * 3), -3, 4, 3); c.fillRect(2 - (climb ? 0 : walk * 3), -3, 4, 3);
      if (P.digT > 0) { c.strokeStyle = '#d9c39a'; c.lineWidth = 2; c.beginPath(); c.moveTo(8, -12); c.lineTo(18, 0); c.stroke(); }
      c.restore();
    }
    window.__thief = {
      level: () => L, teleport(x, y) { P.x = x; P.y = y; P.mv = null; P.px = x * CELL; P.py = y * CELL; },
      grab() { for (const s of seeds) s.got = true; P.sack = seeds.length; }, home() { return L.home; }
    };
    return {
      update, render,
      debug: () => ({ level: LV, x: P.x, y: P.y, sack: P.sack, banked, seedsLeft: seeds.filter(q => !q.got).length, guards: guards.map(g => `${g.x},${g.y}${g.stuck > 0 ? 's' : ''}${g.dead > 0 ? 'd' : ''}${g.alert > 0 ? '!' : ''}`).join(' '), holes: holes.length, hits, done })
    };
  }
})();
