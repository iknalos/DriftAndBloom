// ============================================================================
// Drift & Bloom — BLOOM BOMBS (Adventure round 8). Bomberman, our way.
// Bumble the bumblebee gardener plants seed pods in an overgrown planter garden. A pod bursts after
// two seconds into a cross of blooming vines: it clears weed bushes, tangles beetles, and sets off any
// pod it reaches (chain reactions) — and stings Bumble too if he stands in it. Bushes hide power-ups
// (more pods, longer bursts, honey speed, pod kicking) and the lotus gate, which opens once every
// beetle is caught. Ladybugs wander, stag beetles charge in a straight line, fireflies drift through
// bushes (stage 5+), wasps are fast (stage 8+).
// ============================================================================
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const COLS = 11, ROWS = 13;
  const GRASS = 0, WALL = 1, POT = 2, BUSH = 3;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const AREA = { x: 10, y: 132, w: 370, h: 456 };

  DABWorlds.register('bombs', {
    title: 'Bloom Bombs', color: '255,130,170',
    music: 'music_bombs',
    sounds: ['pod', 'burst', 'rustle', 'catch', 'pickup', 'gate', 'hurt', 'kick'],
    subtitle: () => 'Bumble the bumblebee gardener, an overgrown garden, and a pocketful of seed pods.',
    hint: 'Burst the bushes, tangle every beetle, find the lotus gate',
    howto: ['Stick: fly  ·  🌸: plant a seed pod (it bursts in 2 s)', 'Blooms clear bushes, catch beetles, set off other pods',
            'Stay out of your own bloom! Bushes hide power-ups'],
    controls: { dirs: 'stick', buttons: [{ id: 'attack', icon: 'bomb' }] },
    create
  });

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function makeLevel(LV, seed) {
    const r = rng(seed * 811 + LV * 97);
    const T = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) =>
      x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? WALL : (x % 2 === 0 && y % 2 === 0 ? POT : GRASS)));
    const safe = new Set(['1,1', '2,1', '1,2', '3,1', '1,3']);
    const dens = Math.min(0.78, 0.5 + LV * 0.025);
    const bushes = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (T[y][x] === GRASS && !safe.has(x + ',' + y) && r() < dens) { T[y][x] = BUSH; bushes.push([x, y]); }
    // the gate: under a bush far from the start
    bushes.sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]));
    const far = bushes.slice(0, Math.max(3, Math.floor(bushes.length * 0.3)));
    const g = far[Math.floor(r() * far.length)] || [COLS - 2, ROWS - 2];
    if (T[g[1]][g[0]] !== BUSH) T[g[1]][g[0]] = BUSH;
    const gate = { x: g[0], y: g[1] };
    // power-ups under other bushes
    const kinds = ['pods', 'range', 'pods', 'range', 'speed'].concat(LV >= 4 ? ['kick'] : []).concat(LV >= 6 ? ['range', 'pods'] : []);
    const ups = [];
    const pool = bushes.filter(b => !(b[0] === gate.x && b[1] === gate.y));
    for (const k of kinds) { if (!pool.length) break; const b = pool.splice(Math.floor(r() * pool.length), 1)[0]; ups.push({ x: b[0], y: b[1], kind: k, shown: false, got: false }); }
    // beetles on open grass away from the start
    const open = []; for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (T[y][x] === GRASS && x + y > 6) open.push([x, y]);
    const n = Math.min(9, 3 + Math.floor(LV / 1.6));
    const beetles = [];
    for (let i = 0; i < n && open.length; i++) {
      const p = open.splice(Math.floor(r() * open.length), 1)[0];
      const kind = LV >= 8 && i % 4 === 3 ? 'wasp' : LV >= 5 && i % 3 === 2 ? 'firefly' : LV >= 2 && i % 2 === 1 ? 'stag' : 'ladybug';
      beetles.push({ x: p[0], y: p[1], kind });
    }
    return { T, gate, ups, beetles };
  }

  function create(env) {
    const LV = env.level, fx = env.fx, W = env.W;
    const sfx = (n, o) => env.sfx(n, o);
    const TIME = 170 - LV * 5;
    let CELL, OX, OY, L, T, P, pods, bursts, beetles, ups, gate, t = 0, timeLeft = TIME, hits = 0, caught = 0, done = false, msg = '', msgT = 0, chain = 0, chainT = 0;
    function load() {
      L = makeLevel(LV, 1);
      T = L.T.map(r => r.slice());
      CELL = Math.floor(Math.min(AREA.w / COLS, AREA.h / ROWS));
      OX = Math.round(AREA.x + (AREA.w - COLS * CELL) / 2); OY = Math.round(AREA.y + (AREA.h - ROWS * CELL) / 2);
      P = { x: 1, y: 1, px: 0, py: 0, mv: null, k: 0, face: 'down', pods: 1, range: env.boon('blast') ? 3 : 2, speed: 4.6, kick: false, buzz: 0 };
      P.px = tx(1); P.py = ty(1);
      pods = []; bursts = [];
      beetles = L.beetles.map(b => ({ x: b.x, y: b.y, px: tx(b.x), py: ty(b.y), mv: null, k: 0, kind: b.kind, dir: 'left', wait: 0.5 + Math.random(), caught: 0, ph: Math.random() * TAU }));
      ups = L.ups.map(u => Object.assign({}, u));
      gate = Object.assign({ shown: false, open: 0 }, L.gate);
    }
    const tx = x => OX + x * CELL + CELL / 2, ty = y => OY + y * CELL + CELL / 2;
    load();
    const tile = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? WALL : T[y][x]);
    const podAt = (x, y) => pods.find(p => p.x === x && p.y === y && !p.gone);
    const burning = (x, y) => bursts.some(b => b.cells.some(c => c[0] === x && c[1] === y));
    const isGate = (x, y) => gate.shown && gate.x === x && gate.y === y;
    function say(s) { msg = s; msgT = 2.2; }

    // ── movement on the grid (shared by the bee and the beetles) ──
    function free(x, y, who) {
      const v = tile(x, y);
      if (v === WALL || v === POT) return false;
      if (v === BUSH && !(who && who.kind === 'firefly')) return false;
      if (podAt(x, y) && !(who === P && P.x === x && P.y === y)) return false;
      return true;
    }
    function start(e, dir, speed) {
      const [dx, dy] = DIRS[dir], nx = e.x + dx, ny = e.y + dy;
      if (e === P) P.face = dir;
      if (!free(nx, ny, e)) {
        const pd = podAt(nx, ny);
        if (e === P && pd && P.kick && !pd.slide) { pd.slide = dir; sfx('kick', { vol: 0.6 }); }
        return false;
      }
      e.mv = { fx: e.x, fy: e.y, dur: 1 / speed }; e.k = 0; e.x = nx; e.y = ny; e.dir = dir;
      return true;
    }
    function tick(e, dt) {
      if (!e.mv) return true;
      e.k += dt / e.mv.dur;
      const k = Math.min(1, e.k);
      e.px = tx(e.mv.fx) + (tx(e.x) - tx(e.mv.fx)) * k; e.py = ty(e.mv.fy) + (ty(e.y) - ty(e.mv.fy)) * k;
      if (e.k >= 1) { e.mv = null; e.px = tx(e.x); e.py = ty(e.y); return true; }
      return false;
    }

    // ── pods + blooms ──
    function plant() {
      if (pods.filter(p => !p.gone).length >= P.pods || podAt(P.x, P.y)) return;
      pods.push({ x: P.x, y: P.y, t: 2.0, gone: false, slide: null, sk: 0 });
      sfx('pod', { vol: 0.75 });
    }
    function burst(p) {
      if (p.gone) return;
      p.gone = true;
      const cells = [[p.x, p.y]];
      for (const d of Object.values(DIRS)) {
        for (let i = 1; i <= P.range; i++) {
          const x = p.x + d[0] * i, y = p.y + d[1] * i, v = tile(x, y);
          if (v === WALL || v === POT) break;
          cells.push([x, y]);
          if (v === BUSH) { T[y][x] = GRASS; rustle(x, y); break; }
          const other = podAt(x, y); if (other) { other.t = Math.min(other.t, 0.06); break; }
        }
      }
      bursts.push({ cells, t: 0.55, x: p.x, y: p.y });
      chain = chainT > 0 ? chain + 1 : 1; chainT = 0.3;
      sfx('burst', { vol: 0.85, rate: 0.95 + Math.min(0.4, chain * 0.08) });
      env.shake(0.12 + Math.min(0.2, chain * 0.04));
      if (chain >= 2) env.floatText(tx(p.x), ty(p.y) - 20, `chain ×${chain}!`, '255,200,230');
    }
    function rustle(x, y) {
      sfx('rustle', { vol: 0.5, rate: 0.9 + Math.random() * 0.3 });
      for (let i = 0; i < 10; i++) fx.spawn({ x: tx(x), y: ty(y), vx: (Math.random() - 0.5) * 160, vy: -40 - Math.random() * 120, g: 260, kind: 'spark', size: 2.4, life: 0.6, rgb: Math.random() < 0.5 ? '90,170,70' : '150,210,90' });
      const u = ups.find(q => q.x === x && q.y === y); if (u) u.shown = true;
      if (gate.x === x && gate.y === y) { gate.shown = true; say('The lotus gate! Catch every beetle to open it'); }
    }
    function updatePods(dt) {
      for (const p of pods) {
        if (p.gone) continue;
        if (p.slide) {                                            // a kicked pod glides until it hits something
          p.sk += dt * 9;
          while (p.sk >= 1) {
            p.sk -= 1;
            const [dx, dy] = DIRS[p.slide], nx = p.x + dx, ny = p.y + dy;
            const bl = !free(nx, ny, null) || beetles.some(b => !b.caught && b.x === nx && b.y === ny) || (P.x === nx && P.y === ny);
            if (bl) { p.slide = null; p.sk = 0; break; }
            p.x = nx; p.y = ny;
          }
        }
        p.t -= dt;
        if (p.t <= 0) burst(p);
      }
      pods = pods.filter(p => !p.gone);
      for (const b of bursts) b.t -= dt;
      bursts = bursts.filter(b => b.t > 0);
      chainT = Math.max(0, chainT - dt);
    }

    // ── beetles ──
    const SPD = { ladybug: 1.6, stag: 2.0, firefly: 1.4, wasp: 3.0 };
    function updateBeetle(b, dt) {
      b.ph += dt * 8;
      if (b.caught) return;
      if (!tick(b, dt)) return;
      if (burning(b.x, b.y)) {
        b.caught = 1; caught++; sfx('catch', { vol: 0.8 });
        env.floatText(b.px, b.py - 16, 'caught!', '255,210,230');
        if (beetles.every(q => q.caught)) { sfx('gate', { vol: 0.9 }); say(gate.shown ? 'Every beetle caught — the lotus is open!' : 'Every beetle caught — find the lotus gate!'); }
        return;
      }
      b.wait -= dt;
      if (b.wait > 0) return;
      const spd = SPD[b.kind] * (0.85 + LV * 0.035);
      const safe = d => { const [dx, dy] = DIRS[d]; return free(b.x + dx, b.y + dy, b) && !burning(b.x + dx, b.y + dy) && !pods.some(p => !p.gone && p.t < 0.8 && (p.x === b.x + dx || p.y === b.y + dy) && Math.abs(p.x - b.x - dx) + Math.abs(p.y - b.y - dy) <= P.range); };
      let opts = Object.keys(DIRS).filter(safe);
      if (!opts.length) opts = Object.keys(DIRS).filter(d => free(b.x + DIRS[d][0], b.y + DIRS[d][1], b));
      if (!opts.length) { b.wait = 0.3; return; }
      let d = opts.includes(b.dir) && Math.random() < 0.7 ? b.dir : opts[Math.floor(Math.random() * opts.length)];
      // stag beetles and wasps charge when the bee is in line of sight
      if ((b.kind === 'stag' || b.kind === 'wasp') && (b.x === P.x || b.y === P.y)) {
        const dd = b.x === P.x ? (P.y > b.y ? 'down' : 'up') : (P.x > b.x ? 'right' : 'left');
        if (opts.includes(dd) && Math.abs(P.x - b.x) + Math.abs(P.y - b.y) <= 6) d = dd;
      }
      start(b, d, spd * ((b.kind === 'stag' && d === b.dir) ? 1.25 : 1));
    }

    function hurt(why) {
      if (env.invulnerable || done) return;
      hits++; env.damage(34, { x: P.px, y: P.py - 20, text: why });
      env.invuln(1.6); env.shake(0.3);
    }
    function update(dt, I) {
      t += dt; msgT = Math.max(0, msgT - dt);
      if (done) return;
      timeLeft -= dt * env.clock;
      if (timeLeft <= 0) { timeLeft = 0; say("The garden's day is over"); env.lose(); return; }
      P.buzz += dt * 40;
      if (I.pressed.attack || I.pressed.jump) plant();
      if (tick(P, dt)) {
        const u = ups.find(q => q.shown && !q.got && q.x === P.x && q.y === P.y);
        if (u) {
          u.got = true; sfx('pickup', { vol: 0.8 });
          if (u.kind === 'pods') P.pods++; else if (u.kind === 'range') P.range++; else if (u.kind === 'speed') P.speed += 0.8; else if (u.kind === 'kick') P.kick = true;
          env.floatText(P.px, P.py - 22, { pods: '+1 pod', range: 'bigger bloom', speed: 'honey rush!', kick: 'pod kick!' }[u.kind], '255,240,150');
        }
        if (isGate(P.x, P.y) && beetles.every(b => b.caught)) { win(); return; }
        const ax = I.ax || 0, ay = I.ay || 0;
        if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.35) {
          const dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
          if (!start(P, dir, P.speed)) P.face = dir;
        }
      }
      updatePods(dt);
      for (const b of beetles) {
        updateBeetle(b, dt);
        if (!b.caught && Math.hypot(b.px - P.px, b.py - P.py) < CELL * 0.62) hurt('Pinched!');
      }
      if (burning(P.x, P.y)) hurt('Stung by your own bloom!');
      gate.open = Math.min(1, gate.open + (gate.shown && beetles.every(b => b.caught) ? dt : 0));
      const left = beetles.filter(b => !b.caught).length;
      env.hud.objective = left ? `Beetles left: ${left}` : gate.shown ? 'Fly into the lotus gate!' : 'Find the lotus gate under a bush';
      env.hud.progress = caught / beetles.length;
      env.hud.counters = [{ icon: '⏱', value: Math.ceil(timeLeft) }, { icon: '🌰', value: P.pods }, { icon: '✿', value: P.range }];
    }
    function win() {
      done = true; sfx('gate', { vol: 1 }); env.flash('255,220,240', 0.4);
      if (env.round) env.setStars(hits === 0 && timeLeft > TIME * 0.45 ? 3 : hits <= 1 ? 2 : 1);
      setTimeout(() => env.win(), 600);
    }

    // ── drawing ──
    function render(c) {
      const g = c.createLinearGradient(0, 0, 0, 844);
      g.addColorStop(0, '#ffe3f1'); g.addColorStop(0.5, '#ffd0e4'); g.addColorStop(1, '#f6b6d2');
      c.fillStyle = g; c.fillRect(0, 0, W, 844);
      const hb = c.createLinearGradient(0, 0, 0, 128);              // a soft dark band so the HUD reads on pink
      hb.addColorStop(0, 'rgba(90,20,55,0.82)'); hb.addColorStop(0.75, 'rgba(90,20,55,0.55)'); hb.addColorStop(1, 'rgba(90,20,55,0)');
      c.fillStyle = hb; c.fillRect(0, 0, W, 128);
      // fence + board
      c.fillStyle = '#c47a4c'; c.beginPath(); c.roundRect(OX - 8, OY - 8, COLS * CELL + 16, ROWS * CELL + 16, 14); c.fill();
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = T[y][x], X = OX + x * CELL, Y = OY + y * CELL;
        if (v === WALL) { c.fillStyle = (x + y) % 2 ? '#3e8f4a' : '#367f42'; c.fillRect(X, Y, CELL, CELL); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(X + 3, Y + 3, CELL - 6, 4); continue; }
        c.fillStyle = (x + y) % 2 ? '#8fd46a' : '#84cc60'; c.fillRect(X, Y, CELL, CELL);
      }
      // the lotus gate (once uncovered)
      if (gate.shown) {
        const x = tx(gate.x), y = ty(gate.y), k = gate.open;
        c.save(); c.translate(x, y);
        c.fillStyle = '#4aa0d8'; c.beginPath(); c.arc(0, 0, CELL * 0.45, 0, TAU); c.fill();
        for (let i = 0; i < 8; i++) { c.save(); c.rotate(i / 8 * TAU); c.fillStyle = i % 2 ? '#ff8fc8' : '#ffc6e6'; c.beginPath(); c.ellipse(0, -CELL * (0.12 + 0.12 * k), CELL * 0.08, CELL * 0.18, 0, 0, TAU); c.fill(); c.restore(); }
        c.fillStyle = k >= 1 ? '#fff3a0' : '#f3a7cf'; c.beginPath(); c.arc(0, 0, CELL * 0.08, 0, TAU); c.fill();
        if (k < 1) { c.strokeStyle = 'rgba(120,40,80,0.6)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, CELL * 0.4, 0, TAU); c.stroke(); }
        c.restore();
      }
      // power-ups
      for (const u of ups) {
        if (!u.shown || u.got) continue;
        const x = tx(u.x), y = ty(u.y) + Math.sin(t * 4 + u.x) * 2;
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(x, y, CELL * 0.36, 0, TAU); c.fill();
        c.font = `${Math.round(CELL * 0.48)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText({ pods: '🌰', range: '🌼', speed: '🍯', kick: '👟' }[u.kind], x, y + 1); c.textBaseline = 'alphabetic';
      }
      // pots (pillars) + bushes, back to front
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = T[y][x], X = OX + x * CELL, Y = OY + y * CELL;
        if (v === POT) {
          c.fillStyle = 'rgba(80,40,20,0.3)'; c.beginPath(); c.ellipse(X + CELL / 2 + 2, Y + CELL - 3, CELL * 0.42, CELL * 0.14, 0, 0, TAU); c.fill();
          c.fillStyle = '#d9784a'; c.beginPath(); c.moveTo(X + 4, Y + 6); c.lineTo(X + CELL - 4, Y + 6); c.lineTo(X + CELL - 8, Y + CELL - 3); c.lineTo(X + 8, Y + CELL - 3); c.closePath(); c.fill();
          c.fillStyle = '#ef9466'; c.fillRect(X + 2, Y + 3, CELL - 4, 6);
          c.fillStyle = '#5aa84c'; c.beginPath(); c.arc(X + CELL / 2, Y + 3, CELL * 0.22, Math.PI, 0); c.fill();
        } else if (v === BUSH) {
          c.fillStyle = 'rgba(30,70,20,0.3)'; c.beginPath(); c.ellipse(X + CELL / 2 + 2, Y + CELL - 3, CELL * 0.46, CELL * 0.14, 0, 0, TAU); c.fill();
          for (const [ox, oy, rr, col] of [[0.3, 0.55, 0.3, '#3f9a3f'], [0.7, 0.55, 0.3, '#3f9a3f'], [0.5, 0.35, 0.34, '#4fb24b'], [0.5, 0.6, 0.32, '#47a845']]) {
            c.fillStyle = col; c.beginPath(); c.arc(X + CELL * ox, Y + CELL * oy, CELL * rr, 0, TAU); c.fill();
          }
          c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(X + CELL * 0.42, Y + CELL * 0.28, CELL * 0.1, 0, TAU); c.fill();
          if ((x * 7 + y * 3) % 4 === 0) { c.fillStyle = '#ffe36b'; c.beginPath(); c.arc(X + CELL * 0.65, Y + CELL * 0.4, 2.2, 0, TAU); c.fill(); }
        }
      }
      // seed pods (blinking faster before they burst)
      for (const p of pods) {
        const x = OX + (p.x + (p.slide ? DIRS[p.slide][0] * p.sk : 0)) * CELL + CELL / 2, y = OY + (p.y + (p.slide ? DIRS[p.slide][1] * p.sk : 0)) * CELL + CELL / 2;
        const sw = 1 + Math.sin(t * (p.t < 0.6 ? 40 : 12)) * 0.06;
        c.save(); c.translate(x, y + 2); c.scale(sw, 1 / sw);
        c.fillStyle = '#8b5a2b'; c.beginPath(); c.ellipse(0, 2, CELL * 0.3, CELL * 0.32, 0, 0, TAU); c.fill();
        c.fillStyle = '#6c4320'; c.beginPath(); c.ellipse(0, -CELL * 0.18, CELL * 0.26, CELL * 0.1, 0, 0, TAU); c.fill();
        c.strokeStyle = '#4fa040'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -CELL * 0.24); c.quadraticCurveTo(4, -CELL * 0.4, 1, -CELL * 0.48); c.stroke();
        c.fillStyle = p.t < 0.6 && Math.sin(t * 40) > 0 ? '#ff5a8c' : '#ffd2e4'; c.beginPath(); c.arc(1, -CELL * 0.48, 3, 0, TAU); c.fill();
        c.restore();
      }
      // blooming vine bursts
      for (const b of bursts) {
        const k = b.t / 0.55;
        for (const [x, y] of b.cells) {
          const X = tx(x), Y = ty(y);
          c.globalAlpha = Math.min(1, k * 1.6);
          c.fillStyle = 'rgba(110,200,90,0.75)'; c.beginPath(); c.arc(X, Y, CELL * 0.42, 0, TAU); c.fill();
          for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + x + y + t * 2, rr = CELL * 0.26; c.fillStyle = i % 2 ? '#ff7fbf' : '#ffe066'; c.beginPath(); c.arc(X + Math.cos(a) * rr, Y + Math.sin(a) * rr, CELL * 0.12, 0, TAU); c.fill(); }
          c.fillStyle = '#ffffff'; c.beginPath(); c.arc(X, Y, CELL * 0.1, 0, TAU); c.fill();
          c.globalAlpha = 1;
        }
      }
      for (const b of beetles) drawBeetle(c, b);
      drawBee(c);
      if (msgT > 0) {
        c.save(); c.globalAlpha = Math.min(1, msgT * 2); c.textAlign = 'center';
        c.fillStyle = 'rgba(120,30,70,0.75)'; c.beginPath(); c.roundRect(W / 2 - 160, OY + ROWS * CELL + 14, 320, 28, 14); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 13px system-ui'; c.textBaseline = 'middle'; c.fillText(msg, W / 2, OY + ROWS * CELL + 28); c.restore();
      }
    }
    function drawBeetle(c, b) {
      const s = CELL / 34;
      c.save(); c.translate(b.px, b.py); c.scale(s, s);
      if (b.caught) {                                             // tangled in a flower vine, a happy little prisoner
        c.globalAlpha = Math.max(0, 1 - (b.caught - 1) / 2);
        b.caught += 0.016;
        c.strokeStyle = '#4fa040'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 11, 0, TAU); c.stroke();
      }
      const rot = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[b.dir] || 0;
      c.rotate(rot);
      const col = { ladybug: '#e8392f', stag: '#7a4a2a', firefly: '#3a3a52', wasp: '#f2c12e' }[b.kind];
      if (b.kind === 'firefly') { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6 + 0.3 * Math.sin(b.ph); c.drawImage(env.glowSprite('220,255,120'), -16, -4, 32, 32); c.restore(); }
      c.fillStyle = col; c.beginPath(); c.ellipse(0, 2, 10, 11, 0, 0, TAU); c.fill();
      c.fillStyle = '#1b1b22'; c.beginPath(); c.arc(0, -9, 5.5, 0, TAU); c.fill();
      if (b.kind === 'ladybug') { c.fillStyle = '#1b1b22'; for (const [sx, sy] of [[-4, -1], [4, -1], [-5, 6], [5, 6]]) { c.beginPath(); c.arc(sx, sy, 2, 0, TAU); c.fill(); } }
      if (b.kind === 'stag') { c.strokeStyle = '#3a2412'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-3, -13); c.quadraticCurveTo(-7, -19, -3, -21); c.moveTo(3, -13); c.quadraticCurveTo(7, -19, 3, -21); c.stroke(); }
      if (b.kind === 'wasp') { c.fillStyle = '#1b1b22'; c.fillRect(-10, 0, 20, 3); c.fillRect(-9, 6, 18, 3); c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-9, -2, 6, 3 + Math.sin(b.ph * 3), -0.5, 0, TAU); c.ellipse(9, -2, 6, 3 + Math.sin(b.ph * 3), 0.5, 0, TAU); c.fill(); }
      c.strokeStyle = '#1b1b22'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 12); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-2.2, -10, 1.3, 0, TAU); c.arc(2.2, -10, 1.3, 0, TAU); c.fill();
      c.restore();
    }
    function drawBee(c) {
      const s = CELL / 34, blink = env.invulnerable && Math.sin(t * 30) > 0;
      const bob = Math.sin(t * 6) * 2;
      c.save(); c.translate(P.px, P.py - 3 + bob); c.scale(s, s); if (blink) c.globalAlpha = 0.45;
      c.fillStyle = 'rgba(60,30,20,0.25)'; c.beginPath(); c.ellipse(0, 14 - bob, 10, 3.5, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)';                          // wing blur
      const wb = Math.sin(P.buzz) * 3;
      c.beginPath(); c.ellipse(-9, -10, 7, 5 + wb, -0.6, 0, TAU); c.ellipse(9, -10, 7, 5 - wb, 0.6, 0, TAU); c.fill();
      const gr = c.createRadialGradient(-3, -4, 2, 0, 0, 13); gr.addColorStop(0, '#ffe56b'); gr.addColorStop(1, '#f2b81b');
      c.fillStyle = gr; c.beginPath(); c.arc(0, 0, 12, 0, TAU); c.fill();
      c.fillStyle = '#2a2018'; c.fillRect(-11, -2, 22, 3.5); c.fillRect(-9, 5, 18, 3);
      const fx0 = { left: -4, right: 4, up: 0, down: 0 }[P.face], fy0 = { up: -3, down: 1, left: 0, right: 0 }[P.face];
      c.fillStyle = '#2a2018'; c.beginPath(); c.arc(-4 + fx0, -6 + fy0, 1.8, 0, TAU); c.arc(4 + fx0, -6 + fy0, 1.8, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,120,140,0.6)'; c.beginPath(); c.arc(-7, -2, 2, 0, TAU); c.arc(7, -2, 2, 0, TAU); c.fill();
      c.fillStyle = '#f1d38a'; c.beginPath(); c.ellipse(0, -11, 14, 4, 0, 0, TAU); c.fill();          // straw hat
      c.fillStyle = '#e6c06a'; c.beginPath(); c.ellipse(0, -14, 7, 5, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#ff7fb5'; c.fillRect(-7, -14, 14, 2);
      c.restore();
    }
    window.__bombs = { level: () => L, teleport(x, y) { P.x = x; P.y = y; P.mv = null; P.px = tx(x); P.py = ty(y); }, catchAll() { for (const b of beetles) { b.caught = 1; caught++; } }, reveal() { gate.shown = true; T[gate.y][gate.x] = GRASS; } };
    return {
      update, render,
      debug: () => ({ level: LV, x: P.x, y: P.y, pods: pods.length, bursts: bursts.length, beetles: beetles.filter(b => !b.caught).length, gate: gate.shown, gx: gate.x, gy: gate.y, hits, timeLeft: Math.round(timeLeft), bushes: T.flat().filter(v => v === BUSH).length, done })
    };
  }
})();
