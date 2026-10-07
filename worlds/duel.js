// ============================================================================
// Drift & Bloom — GUARDIAN DUEL (Adventure round 10, every stage's finale). Punch-Out!!, with a
// Street Fighter super. The Spirit (seen from behind) faces the stage's Guardian. Every attack has
// a tell (a glow on the striking arm + a wind-up pose) and its own answer:
//   jab: anything · hook from the left: dodge right or duck · from the right: dodge left or duck
//   smash (overhead): dodge sideways · sweep (head height): duck
// Dodge it and the Guardian is open — punch, punch, punch (stick up + punch = Spirit Uppercut).
// A last-instant (perfect) dodge earns a star; three stars = BLOOM BURST, the super. Punching a
// Guardian that isn't open just bounces off its guard and invites a quick counter.
// Ten Guardians, one per stage: later ones tell less, feint, and chain combos. 99-second clock.
// ============================================================================
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const DEF = {                                   // which defences beat which attack
    jab: ['L', 'R', 'D'], hookL: ['R', 'D'], hookR: ['L', 'D'], smash: ['L', 'R'], sweep: ['D']
  };
  // the ten Guardians: look + moveset + timing (tell seconds), feints / combos
  const GUARDIANS = [
    { name: 'BRAMBLE', title: 'the Toad', head: 'toad', body: '#5f9b3f', belly: '#d9e3a2', eye: '#ffd54a', arena: '70,140,80',
      moves: { jab: 2, hookL: 2, hookR: 2, smash: 1 }, tell: 0.95, hp: 60, feint: 0, combo: 0 },
    { name: 'KAPPA', title: 'of the River', head: 'kappa', body: '#4aa38f', belly: '#e9d58a', eye: '#ff7a59', arena: '60,140,150',
      moves: { jab: 2, hookL: 2, hookR: 2, sweep: 1 }, tell: 0.85, hp: 68, feint: 0, combo: 0 },
    { name: 'EMBER', title: 'the Fox', head: 'fox', body: '#e2672c', belly: '#ffe4c2', eye: '#ffef7a', arena: '200,90,40',
      moves: { jab: 3, hookL: 2, hookR: 2, sweep: 1 }, tell: 0.72, hp: 74, feint: 0, combo: 0.15 },
    { name: 'GRANITE', title: 'the Golem', head: 'golem', body: '#8a8f9c', belly: '#b9bdc7', eye: '#6ff0ff', arena: '110,120,140',
      moves: { smash: 3, hookL: 2, hookR: 2, sweep: 1 }, tell: 0.9, hp: 92, feint: 0, combo: 0 },
    { name: 'VOLT', title: 'the Thunder Hare', head: 'hare', body: '#c9c4e8', belly: '#ffffff', eye: '#7ad9ff', arena: '120,110,220',
      moves: { jab: 4, hookL: 2, hookR: 2, sweep: 1 }, tell: 0.55, hp: 80, feint: 0.18, combo: 0.2 },
    { name: 'BOREAS', title: 'the Frost Yeti', head: 'yeti', body: '#e8f2fb', belly: '#c3d9ee', eye: '#4fc3ff', arena: '120,170,220',
      moves: { smash: 2, hookL: 2, hookR: 2, sweep: 2 }, tell: 0.7, hp: 96, feint: 0.12, combo: 0.25 },
    { name: 'NOCTUA', title: 'the Shadow Owl', head: 'owl', body: '#3c3552', belly: '#6d6488', eye: '#ffb13b', arena: '70,50,120',
      moves: { jab: 3, hookL: 2, hookR: 2, sweep: 2, smash: 1 }, tell: 0.5, hp: 90, feint: 0.25, combo: 0.3, dim: true },
    { name: 'TETHYS', title: 'the Coral Kraken', head: 'kraken', body: '#d4577e', belly: '#ffb3c8', eye: '#ffe066', arena: '200,70,120',
      moves: { jab: 2, hookL: 3, hookR: 3, sweep: 2 }, tell: 0.55, hp: 104, feint: 0.2, combo: 0.45 },
    { name: 'MAGMOR', title: 'the Lava Ogre', head: 'ogre', body: '#7a3328', belly: '#ff8a3a', eye: '#ffe14a', arena: '220,80,40',
      moves: { smash: 3, hookL: 2, hookR: 2, sweep: 2, jab: 1 }, tell: 0.6, hp: 120, feint: 0.2, combo: 0.45 },
    { name: 'ECLIPSE', title: 'the Moon Dragon', head: 'dragon', body: '#2a2f5a', belly: '#c9a7ff', eye: '#ff4fd8', arena: '170,90,255',
      moves: { jab: 2, hookL: 3, hookR: 3, smash: 2, sweep: 2 }, tell: 0.46, hp: 140, feint: 0.3, combo: 0.6 },
  ];

  DABWorlds.register('duel', {
    title: 'Guardian Duel', color: '255,215,90', opaque: true,
    music: 'music_duel',
    sounds: ['thwack', 'block', 'whoosh', 'swing', 'grunt', 'star', 'super', 'bell', 'cheer', 'hurt'],
    subtitle: () => 'Each stage ends here: the Spirit against the stage\'s Guardian. Read the tell, dodge, strike back.',
    hint: 'Read the glow, dodge the right way, punch when it is open',
    howto: ['Stick ◀ ▶: dodge  ·  ▼: duck  ·  👊 punch  ·  ▲ + 👊 Spirit Uppercut', 'Hooks: dodge away · smash: sideways · sweep: duck',
            'Perfect dodges earn ★ — three ★ = BLOOM BURST'],
    controls: { dirs: 'stick', buttons: [{ id: 'attack', icon: 'fist' }, { id: 'special', icon: 'star', count: () => (LIVE ? LIVE.stars : 0) }] },
    create
  });
  let LIVE = null;

  function create(env) {
    const LV = env.level, fx = env.fx, W = env.W;
    const G = GUARDIANS[LV - 1];
    const sfx = (n, o) => env.sfx(n, o);
    const CX = W / 2, GY = 330;                                  // the Guardian's chest
    const TELL = G.tell * (1.05 - LV * 0.012);
    const MAXHP = Math.round(G.hp * (env.round ? 1 : 0.8));
    const S = LIVE = { stars: 0 };
    let t = 0, clock = 99, hp = MAXHP, done = false, intro = 2.2, slow = 0, flash = 0, banner = '', bannerT = 0, combo = 0, comboT = 0;
    // guardian state machine
    const g = { st: 'idle', t: 1.2, atk: null, side: 0, fist: { L: { x: 0, y: 0, z: 1 }, R: { x: 0, y: 0, z: 1 } }, hurt: 0, sway: 0, ko: 0, queue: [], open: 0, counter: false };
    // the player
    const p = { st: 'stand', t: 0, cd: 0, lastDodge: -9, punch: 0, punchSide: 1, upper: 0, burst: 0 };
    function say(s, d) { banner = s; bannerT = d || 1.1; }
    say(`${G.name}  ${G.title}`, 2.2);
    sfx('bell', { vol: 0.9 });
    function pickMove() {
      const ent = Object.entries(G.moves), tot = ent.reduce((a, [, w]) => a + w, 0);
      let k = Math.random() * tot;
      for (const [m, w] of ent) { k -= w; if (k <= 0) return m; }
      return 'jab';
    }
    function startTell(move, quick) {
      g.st = 'tell'; g.atk = move; g.t = (quick ? 0.5 : 1) * TELL * (move === 'jab' ? 0.75 : move === 'smash' ? 1.15 : 1);
      g.feint = !quick && Math.random() < G.feint;
      g.side = move === 'hookL' ? -1 : move === 'hookR' ? 1 : move === 'jab' ? (Math.random() < 0.5 ? -1 : 1) : 0;
    }
    function strike() {
      g.st = 'strike'; g.t = 0.16;
      sfx('swing', { vol: 0.8, rate: g.atk === 'smash' ? 0.75 : 1.1 });
    }
    function impact() {
      const ok = DEF[g.atk];
      const defence = p.st === 'dodgeL' ? 'L' : p.st === 'dodgeR' ? 'R' : p.st === 'duck' ? 'D' : null;
      if (defence && ok.includes(defence)) {
        const perfect = t - p.lastDodge < 0.2 && defence !== 'D' || (defence === 'D' && p.t < 0.22);
        if (perfect && S.stars < 3) { S.stars++; sfx('star', { vol: 0.9 }); say('PERFECT! ★', 0.8); }
        else say('dodged', 0.5);
        // the Guardian overreaches: open to a counter (shorter later on)
        g.st = 'open'; g.t = Math.max(0.75, 1.35 - LV * 0.05); g.open = g.t;
        sfx('whoosh', { vol: 0.6 });
      } else {
        const dmg = { jab: 14, hookL: 20, hookR: 20, smash: 28, sweep: 22 }[g.atk];
        env.damage(dmg, { x: CX, y: 560, text: defence ? 'wrong way!' : null });
        env.shake(0.45); flash = 0.25; sfx('hurt', { vol: 0.9 }); combo = 0;
        g.st = 'taunt'; g.t = 0.55;
        if (G.combo && Math.random() < G.combo) g.queue.push(pickMove());
      }
    }
    function hitGuardian(dmg, label, big) {
      hp = Math.max(0, hp - dmg * env.atk);
      g.hurt = big ? 0.5 : 0.22;
      combo++; comboT = 1.2;
      sfx('thwack', { vol: big ? 1 : 0.75, rate: big ? 0.8 : 0.95 + Math.min(0.4, combo * 0.05) });
      for (let i = 0; i < (big ? 30 : 10); i++) { const a = Math.random() * TAU, s = 80 + Math.random() * 260; fx.spawn({ x: CX + (Math.random() - 0.5) * 60, y: GY - 40, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: 'spark', size: 2.2, life: 0.4, rgb: big ? '255,220,120' : '255,255,255' }); }
      env.floatText(CX + (Math.random() - 0.5) * 80, GY - 110, label || (combo > 1 ? `${combo} HITS` : 'hit!'), '255,230,150');
      if (hp <= 0) ko();
    }
    function ko() {
      g.st = 'ko'; g.t = 0; done = true; slow = 1.2;
      sfx('grunt', { vol: 1, rate: 0.7 }); sfx('cheer', { vol: 0.9 }); sfx('bell', { vol: 1 });
      say('K.O.!', 3);
      setTimeout(() => env.win(), 2200);
    }
    function superMove() {
      S.stars = 0; p.burst = 1.3; slow = 0.9; flash = 0.6;
      sfx('super', { vol: 1 }); say('BLOOM BURST!', 1.4); env.shake(0.6);
      setTimeout(() => { if (!done) { hitGuardian(Math.round(MAXHP * 0.2), 'BLOOM BURST!', true); g.st = 'open'; g.t = 1.4; g.open = 1.4; } }, 650);
    }

    function update(dt, I) {
      t += dt; bannerT = Math.max(0, bannerT - dt); flash = Math.max(0, flash - dt * 2); comboT = Math.max(0, comboT - dt); if (comboT <= 0) combo = 0;
      if (slow > 0) { slow -= dt; dt *= 0.35; }
      g.sway += dt; g.hurt = Math.max(0, g.hurt - dt); p.burst = Math.max(0, p.burst - dt);
      if (done) { g.t += dt; return; }
      if (intro > 0) { intro -= dt; if (intro <= 0) say('FIGHT!', 0.9); return; }
      clock -= dt * env.clock;
      if (clock <= 0) {                                          // time: decision on the scorecards
        clock = 0; done = true;
        const mine = env.health / env.maxHealth, theirs = hp / MAXHP;
        say(mine > theirs ? 'DECISION: YOU WIN' : 'DECISION: GUARDIAN', 2.5);
        sfx('bell', { vol: 1 });
        setTimeout(() => (mine > theirs ? env.win() : env.lose()), 2000);
        return;
      }
      // ── the player ──
      p.cd = Math.max(0, p.cd - dt); p.t += dt; p.punch = Math.max(0, p.punch - dt); p.upper = Math.max(0, p.upper - dt);
      let ax = I.ax || 0, ay = I.ay || 0;
      if (window.__duelAuto) {                                   // test autopilot: the right dodge at the last moment, counters when open
        const want = g.st === 'tell' && g.t < 0.12 && !g.feint ? DEF[g.atk][0] : null;
        ax = want === 'L' ? -1 : want === 'R' ? 1 : 0; ay = want === 'D' ? 1 : 0;
        if (p.st === 'duck' && g.st !== 'tell' && g.st !== 'strike') ay = 0;
        if (g.st === 'open' && p.st === 'stand' && p.punch <= 0) I.pressed.attack = true;
        if (S.stars >= 3 && g.st === 'idle') I.pressed.special = true;
      }
      if (p.st === 'dodgeL' || p.st === 'dodgeR') { if (p.t > 0.42) { p.st = 'stand'; p.cd = 0.12; } }
      else if (p.st === 'duck') { if (!(ay > 0.5) || p.t > 0.9) { p.st = 'stand'; p.cd = 0.15; } }
      if (p.st === 'stand' && p.cd <= 0 && p.punch <= 0) {
        if (ax < -0.55) { p.st = 'dodgeL'; p.t = 0; p.lastDodge = t; sfx('whoosh', { vol: 0.5, rate: 1.2 }); }
        else if (ax > 0.55) { p.st = 'dodgeR'; p.t = 0; p.lastDodge = t; sfx('whoosh', { vol: 0.5, rate: 1.2 }); }
        else if (ay > 0.6) { p.st = 'duck'; p.t = 0; }
      }
      if (I.pressed.special && S.stars >= 3 && g.st !== 'strike') superMove();
      if (I.pressed.attack && p.st === 'stand' && p.punch <= 0) {
        const upper = ay < -0.55;
        p.punch = upper ? 0.32 : 0.16; p.punchSide = -p.punchSide; p.upper = upper ? 0.32 : 0;
        if (g.st === 'open') {
          if (upper) { hitGuardian(Math.round(6 + LV * 0.4) * 2, 'SPIRIT UPPERCUT!', true); g.st = 'idle'; g.t = 0.9; }
          else { hitGuardian(Math.round(4 + LV * 0.25), null, false); if (combo >= 6) { g.st = 'idle'; g.t = 0.6; say('RUSH!', 0.6); } }
        } else if (g.st !== 'ko') {                                // into the guard: it bounces, and it riles them
          sfx('block', { vol: 0.6 }); env.floatText(CX, GY - 90, 'blocked', '200,210,230');
          if (g.st === 'idle' && Math.random() < 0.45 + LV * 0.03) { startTell('jab', true); }
        }
      }
      // ── the Guardian ──
      g.t -= dt;
      if (g.st === 'idle' && g.t <= 0) startTell(g.queue.length ? g.queue.shift() : pickMove());
      else if (g.st === 'tell' && g.t <= 0) {
        if (g.feint) { g.feint = false; startTell(pickMove(), false); g.t *= 0.7; }           // a fake: switch arms
        else strike();
      } else if (g.st === 'strike' && g.t <= 0) impact();
      else if (g.st === 'open' && g.t <= 0) { g.st = 'idle'; g.t = Math.max(0.35, 1.1 - LV * 0.06) + Math.random() * 0.5; }
      else if (g.st === 'taunt' && g.t <= 0) { g.st = 'idle'; g.t = g.queue.length ? 0.15 : 0.6 + Math.random() * 0.5; }
      env.hud.boss = { name: `${G.name} ${G.title.toUpperCase()}`, hp: hp / MAXHP };
      env.hud.objective = g.st === 'open' ? 'OPEN — punch!' : g.st === 'tell' ? hintFor(g.atk) : 'Watch the tell…';
      env.hud.counters = [{ icon: '⏱', value: Math.ceil(clock) }, { icon: '★', value: S.stars }];
    }
    const hintFor = m => (LV >= 7 ? '…' : { jab: 'jab: dodge or duck', hookL: 'hook ◀: dodge ▶ or duck', hookR: 'hook ▶: dodge ◀ or duck', smash: 'smash: dodge sideways', sweep: 'sweep: DUCK' }[m]);

    // ── drawing ──
    function arena(c) {
      const g0 = c.createRadialGradient(CX, 260, 30, CX, 300, 620);
      g0.addColorStop(0, `rgba(${G.arena},0.55)`); g0.addColorStop(0.5, '#120a1c'); g0.addColorStop(1, '#05030a');
      c.fillStyle = g0; c.fillRect(0, 0, W, 844);
      // crowd: firefly lights in the stands, flaring on hits
      for (let i = 0; i < 70; i++) {
        const x = (i * 53.7) % W, y = 120 + (i * 31.3) % 210, a = 0.25 + 0.25 * Math.sin(t * 2 + i) + (comboT > 0 ? 0.3 : 0);
        c.fillStyle = `rgba(255,${200 + (i % 3) * 20},120,${a})`; c.beginPath(); c.arc(x, y, 1.6 + (i % 3) * 0.5, 0, TAU); c.fill();
      }
      // spotlights
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const sx of [-1, 1]) {
        const gr = c.createLinearGradient(CX + sx * 220, 0, CX, 560);
        gr.addColorStop(0, `rgba(${G.arena},0.35)`); gr.addColorStop(1, `rgba(${G.arena},0)`);
        c.fillStyle = gr; c.beginPath(); c.moveTo(CX + sx * 200, 0); c.lineTo(CX + sx * 250, 0); c.lineTo(CX + sx * 30, 600); c.lineTo(CX - sx * 120, 600); c.fill();
      }
      c.restore();
      // the ring: a stone disc with glowing runes
      c.fillStyle = '#2a2236'; c.beginPath(); c.ellipse(CX, 610, 320, 110, 0, 0, TAU); c.fill();
      c.strokeStyle = `rgba(${G.arena},0.7)`; c.lineWidth = 3; c.beginPath(); c.ellipse(CX, 610, 300, 98, 0, 0, TAU); c.stroke();
      c.fillStyle = `rgba(${G.arena},0.8)`;
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + t * 0.2; c.fillRect(CX + Math.cos(a) * 280 - 3, 610 + Math.sin(a) * 90 - 3, 6, 6); }
    }
    function armPose(side) {
      // returns fist position + scale for this arm in the current state
      const base = { x: CX + side * 92, y: GY + 10, z: 1 };
      const sw = Math.sin(g.sway * 2.4 + side) * 6;
      const guard = { x: CX + side * 58, y: GY - 70 + sw, z: 1.05 };
      if (g.st === 'ko') return { x: CX + side * 140, y: GY + 90, z: 0.8 };
      if (g.st === 'open') return { x: CX + side * 120, y: GY + 60 + sw, z: 0.9 };            // arms flung wide: open
      if (g.st === 'taunt') return { x: CX + side * 70, y: GY - 40 + Math.sin(t * 12) * 6, z: 1 };
      const striking = g.atk && (g.side === side || g.side === 0 || g.atk === 'smash' || g.atk === 'sweep');
      if (g.st === 'tell' && striking) {
        const k = 1 - Math.max(0, g.t) / TELL;
        if (g.atk === 'smash') return { x: CX + side * 40, y: GY - 170 - k * 30, z: 0.9 };    // both fists high overhead
        if (g.atk === 'sweep') return { x: CX + side * (160 + k * 40), y: GY - 60, z: 0.9 }; // arms spread at head height
        return { x: CX + side * (120 + k * 30), y: GY - 40 - k * 20, z: 0.85 };                // the striking arm cocked back
      }
      if (g.st === 'strike' && striking) {
        const k = 1 - Math.max(0, g.t) / 0.16;
        if (g.atk === 'smash') return { x: CX + side * 30, y: GY - 150 + k * 380, z: 1 + k * 1.2 };
        if (g.atk === 'sweep') return { x: CX + side * (180 - k * 200), y: GY + 40 + k * 100, z: 1 + k * 0.8 };
        return { x: CX + side * (100 - k * 140), y: GY - 20 + k * 220, z: 1 + k * 1.6 };       // fist thrown at the camera
      }
      return guard;
    }
    function drawGuardian(c) {
      const k = g.st === 'ko' ? Math.min(1, g.t / 1.4) : 0;
      const shake = g.hurt > 0 ? Math.sin(t * 80) * 6 * g.hurt : 0;
      c.save();
      c.translate(CX + shake, GY + k * 140); c.rotate(k * -0.25); c.scale(1 - k * 0.15, 1 - k * 0.15); c.translate(-CX, -GY);
      const dim = G.dim && g.st !== 'open' ? 0.75 : 1;
      c.globalAlpha = dim;
      // torso
      const body = c.createLinearGradient(CX - 140, GY - 80, CX + 140, GY + 200);
      body.addColorStop(0, G.body); body.addColorStop(1, shadeCol(G.body, -0.35));
      c.fillStyle = body; c.beginPath(); c.moveTo(CX - 120, GY - 60); c.quadraticCurveTo(CX, GY - 110, CX + 120, GY - 60); c.lineTo(CX + 150, GY + 230); c.lineTo(CX - 150, GY + 230); c.closePath(); c.fill();
      c.fillStyle = G.belly; c.beginPath(); c.ellipse(CX, GY + 90, 70, 110, 0, 0, TAU); c.fill();
      if (G.head === 'kappa') { c.fillStyle = '#2f6b4f'; c.beginPath(); c.ellipse(CX, GY + 40, 170, 150, 0, Math.PI * 1.05, Math.PI * 1.95); c.fill(); }   // shell rim behind
      // arms: shoulder -> elbow -> fist (the fist grows as it comes at you)
      for (const side of [-1, 1]) {
        const f = armPose(side), sx = CX + side * 110, sy = GY - 40;
        const ex = (sx + f.x) / 2 + side * 40, ey = (sy + f.y) / 2 + 30;
        const tellNow = g.st === 'tell' && (g.side === side || g.side === 0);
        c.strokeStyle = shadeCol(G.body, -0.1); c.lineCap = 'round';
        c.lineWidth = 44; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
        c.lineWidth = 38 * f.z; c.beginPath(); c.moveTo(ex, ey); c.lineTo(f.x, f.y); c.stroke();
        if (tellNow) {                                            // the tell: the striking arm glows
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (G.dim ? 0.35 : 0.75) * (0.6 + 0.4 * Math.sin(t * 30));
          c.drawImage(env.glowSprite(g.atk === 'sweep' ? '120,220,255' : g.atk === 'smash' ? '255,90,60' : '255,220,90'), f.x - 70, f.y - 70, 140, 140); c.restore();
        }
        drawFist(c, f.x, f.y, f.z, side);
      }
      drawHead(c);
      c.restore();
    }
    function drawFist(c, x, y, z, side) {
      const r = 30 * z;
      const gr = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
      gr.addColorStop(0, shadeCol(G.body, 0.25)); gr.addColorStop(1, shadeCol(G.body, -0.25));
      c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.strokeStyle = shadeCol(G.body, -0.45); c.lineWidth = 2 * z;
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(x + i * r * 0.36, y - r * 0.35, r * 0.18, Math.PI, 0); c.stroke(); }
      if (['fox', 'yeti', 'owl', 'dragon', 'ogre'].includes(G.head)) {   // claws
        c.fillStyle = '#f4ead2'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x + i * r * 0.36 - 4 * z, y - r * 0.5); c.lineTo(x + i * r * 0.36, y - r * 0.95); c.lineTo(x + i * r * 0.36 + 4 * z, y - r * 0.5); c.fill(); }
      }
    }
    function drawHead(c) {
      const hx = CX + Math.sin(g.sway * 1.7) * 6 + (g.hurt > 0 ? Math.sin(t * 50) * 10 * g.hurt : 0), hy = GY - 110 + (g.st === 'open' ? 14 : 0);
      const eye = G.eye, glow = g.st === 'tell' ? 1 : 0.4;
      c.save(); c.translate(hx, hy);
      const col = G.body, dark = shadeCol(col, -0.3);
      const eyes = (dx, dy, r) => {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = glow; c.drawImage(env.glowSprite(hexRgb(eye)), -dx - r * 3, dy - r * 3, r * 6, r * 6); c.drawImage(env.glowSprite(hexRgb(eye)), dx - r * 3, dy - r * 3, r * 6, r * 6); c.restore();
        c.fillStyle = g.st === 'open' ? '#ffffff' : eye; c.beginPath(); c.arc(-dx, dy, r, 0, TAU); c.arc(dx, dy, r, 0, TAU); c.fill();
        c.fillStyle = '#120a10'; if (g.st !== 'open' && g.st !== 'ko') { c.beginPath(); c.ellipse(-dx, dy, r * 0.35, r * 0.8, 0, 0, TAU); c.ellipse(dx, dy, r * 0.35, r * 0.8, 0, 0, TAU); c.fill(); }
        else { c.strokeStyle = '#120a10'; c.lineWidth = 2; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * dx - 5, dy - 5); c.lineTo(s * dx + 5, dy + 5); c.moveTo(s * dx + 5, dy - 5); c.lineTo(s * dx - 5, dy + 5); c.stroke(); } }
      };
      c.fillStyle = col;
      switch (G.head) {
        case 'toad': c.beginPath(); c.ellipse(0, 10, 92, 58, 0, 0, TAU); c.fill(); c.fillStyle = G.belly; c.beginPath(); c.ellipse(0, 34, 70, 26, 0, 0, Math.PI); c.fill();
          c.fillStyle = col; c.beginPath(); c.arc(-46, -34, 24, 0, TAU); c.arc(46, -34, 24, 0, TAU); c.fill(); eyes(46, -36, 13); break;
        case 'kappa': c.beginPath(); c.ellipse(0, 0, 70, 66, 0, 0, TAU); c.fill(); c.fillStyle = '#9fe0ff'; c.beginPath(); c.ellipse(0, -52, 38, 12, 0, 0, TAU); c.fill();
          c.fillStyle = '#e9c35a'; c.beginPath(); c.moveTo(-26, 24); c.quadraticCurveTo(0, 54, 26, 24); c.lineTo(0, 30); c.fill(); eyes(28, -8, 11); break;
        case 'fox': c.beginPath(); c.moveTo(-70, -20); c.lineTo(-58, -100); c.lineTo(-20, -48); c.lineTo(20, -48); c.lineTo(58, -100); c.lineTo(70, -20); c.quadraticCurveTo(40, 60, 0, 66); c.quadraticCurveTo(-40, 60, -70, -20); c.fill();
          c.fillStyle = G.belly; c.beginPath(); c.moveTo(-40, 10); c.quadraticCurveTo(0, 80, 40, 10); c.quadraticCurveTo(0, 30, -40, 10); c.fill(); c.fillStyle = '#1b1210'; c.beginPath(); c.arc(0, 52, 8, 0, TAU); c.fill(); eyes(30, -8, 10); break;
        case 'golem': c.fillStyle = col; c.beginPath(); c.roundRect(-74, -70, 148, 130, 18); c.fill(); c.strokeStyle = dark; c.lineWidth = 3; c.beginPath(); c.moveTo(-40, -70); c.lineTo(-20, -10); c.lineTo(-50, 40); c.moveTo(30, -60); c.lineTo(50, 0); c.stroke();
          c.fillStyle = '#5c616c'; c.fillRect(-60, 30, 120, 16); eyes(32, -10, 12); break;
        case 'hare': c.beginPath(); c.ellipse(-28, -110, 16, 60, -0.15, 0, TAU); c.ellipse(28, -110, 16, 60, 0.15, 0, TAU); c.fill(); c.fillStyle = '#ffc6dc'; c.beginPath(); c.ellipse(-28, -110, 7, 44, -0.15, 0, TAU); c.ellipse(28, -110, 7, 44, 0.15, 0, TAU); c.fill();
          c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 66, 62, 0, 0, TAU); c.fill(); c.fillStyle = '#ffd94a'; c.beginPath(); c.moveTo(-10, -60); c.lineTo(8, -40); c.lineTo(-4, -40); c.lineTo(10, -20); c.lineTo(-12, -44); c.lineTo(0, -44); c.closePath(); c.fill(); eyes(26, -6, 11); break;
        case 'yeti': for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; c.beginPath(); c.arc(Math.cos(a) * 64, Math.sin(a) * 60, 26, 0, TAU); c.fill(); } c.beginPath(); c.arc(0, 0, 66, 0, TAU); c.fill();
          c.fillStyle = '#9fb7cf'; c.beginPath(); c.ellipse(0, 12, 44, 40, 0, 0, TAU); c.fill(); c.fillStyle = '#ffffff'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 16, 30); c.lineTo(s * 20, 46); c.lineTo(s * 24, 30); c.fill(); } eyes(20, 0, 9); break;
        case 'owl': c.beginPath(); c.ellipse(0, 0, 80, 70, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(-70, -40); c.lineTo(-56, -96); c.lineTo(-30, -56); c.moveTo(70, -40); c.lineTo(56, -96); c.lineTo(30, -56); c.fill();
          c.fillStyle = G.belly; c.beginPath(); c.arc(-34, -6, 32, 0, TAU); c.arc(34, -6, 32, 0, TAU); c.fill(); c.fillStyle = '#e8b04a'; c.beginPath(); c.moveTo(-9, 18); c.lineTo(0, 42); c.lineTo(9, 18); c.fill(); eyes(34, -6, 15); break;
        case 'kraken': c.beginPath(); c.ellipse(0, -14, 76, 80, 0, 0, TAU); c.fill(); c.fillStyle = shadeCol(col, -0.2);
          for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 18 - 8, 40); c.quadraticCurveTo(i * 22 + Math.sin(t * 3 + i) * 10, 90, i * 18 + 6, 110); c.lineTo(i * 18 + 8, 40); c.fill(); }
          c.fillStyle = '#ffe0ea'; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(-40 + i * 16, -60 + (i % 2) * 10, 4, 0, TAU); c.fill(); } eyes(30, -10, 13); break;
        case 'ogre': c.beginPath(); c.ellipse(0, 10, 90, 72, 0, 0, TAU); c.fill(); c.fillStyle = dark; c.fillRect(-80, -20, 160, 10);
          c.fillStyle = '#f4ead2'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 36, 46); c.lineTo(s * 30, 8); c.lineTo(s * 46, 40); c.fill(); }
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6; c.strokeStyle = '#ff9a3a'; c.lineWidth = 4; c.beginPath(); c.moveTo(-50, -40); c.lineTo(-30, -10); c.lineTo(-44, 20); c.moveTo(40, -46); c.lineTo(56, -6); c.stroke(); c.restore(); eyes(36, -16, 11); break;
        case 'dragon': c.beginPath(); c.moveTo(-60, 30); c.quadraticCurveTo(-80, -50, -20, -70); c.lineTo(20, -70); c.quadraticCurveTo(80, -50, 60, 30); c.quadraticCurveTo(0, 90, -60, 30); c.fill();
          c.fillStyle = '#e9e1ff'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 30, -64); c.quadraticCurveTo(s * 70, -120, s * 96, -110); c.quadraticCurveTo(s * 60, -96, s * 44, -56); c.fill(); }
          c.fillStyle = G.belly; c.beginPath(); c.ellipse(0, 40, 36, 22, 0, 0, TAU); c.fill(); c.fillStyle = '#ffd6ff'; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 12, 46, 4, 0, TAU); c.fill(); }
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(env.glowSprite('200,140,255'), -110, -130, 220, 220); c.restore(); eyes(30, -18, 11); break;
      }
      c.restore();
    }
    function drawPlayer(c) {
      // the Spirit from behind: a luminous fighter, half see-through (like Little Mac's wireframe)
      const dx = p.st === 'dodgeL' ? -110 * Math.sin(Math.min(1, p.t / 0.42) * Math.PI) : p.st === 'dodgeR' ? 110 * Math.sin(Math.min(1, p.t / 0.42) * Math.PI) : 0;
      const dy = p.st === 'duck' ? 70 : 0;
      const x = CX + dx, y = 650 + dy;
      const rgb = env.charRgb || '93,202,165';
      c.save(); c.globalAlpha = 0.72;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.4 + (p.burst > 0 ? 0.5 : 0) + S.stars * 0.08;
      c.drawImage(env.glowSprite(rgb), x - 120, y - 200, 240, 300); c.restore();
      const tilt = p.st === 'dodgeL' ? -0.25 : p.st === 'dodgeR' ? 0.25 : 0;
      c.translate(x, y); c.rotate(tilt);
      const bg = c.createLinearGradient(0, -170, 0, 120); bg.addColorStop(0, `rgba(${rgb},0.95)`); bg.addColorStop(1, `rgba(${rgb},0.35)`);
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(-70, -60); c.quadraticCurveTo(0, -90, 70, -60); c.lineTo(52, 120); c.lineTo(-52, 120); c.closePath(); c.fill();   // back
      c.beginPath(); c.arc(0, -112, 40, 0, TAU); c.fill();                                                                                      // head
      // arms: the punching one reaches up the screen at the Guardian
      for (const side of [-1, 1]) {
        const punching = p.punch > 0 && p.punchSide === side, upper = p.upper > 0 && punching;
        const k = punching ? Math.sin((1 - p.punch / (upper ? 0.32 : 0.16)) * Math.PI) : 0;
        const fx0 = side * 64 + (punching ? -side * 40 * k : 0), fy0 = -90 - (punching ? (upper ? 240 : 170) * k : 0);
        c.strokeStyle = `rgba(${rgb},0.9)`; c.lineCap = 'round'; c.lineWidth = 26;
        c.beginPath(); c.moveTo(side * 60, -55); c.lineTo(fx0, fy0); c.stroke();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(fx0, fy0, 18 - k * 4, 0, TAU); c.fill();
        if (upper && k > 0.3) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = k; c.drawImage(env.glowSprite('255,220,120'), fx0 - 40, fy0 - 40, 80, 80); c.restore(); }
      }
      c.restore();
      // the super: petals + light stream from the Spirit to the Guardian
      if (p.burst > 0) {
        const k = 1 - p.burst / 1.3;
        c.save(); c.globalCompositeOperation = 'lighter';
        c.globalAlpha = Math.sin(k * Math.PI);
        const beam = c.createLinearGradient(CX, 600, CX, GY - 60); beam.addColorStop(0, `rgba(${rgb},0.9)`); beam.addColorStop(1, 'rgba(255,200,240,0.9)');
        c.fillStyle = beam; c.fillRect(CX - 40 - 30 * k, GY - 60, 80 + 60 * k, 600 - GY + 60);
        for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + t * 3, rr = 60 + 120 * k; c.fillStyle = i % 2 ? 'rgba(255,150,210,0.9)' : 'rgba(255,240,150,0.9)'; c.beginPath(); c.arc(CX + Math.cos(a) * rr, GY + Math.sin(a) * rr * 0.6, 7, 0, TAU); c.fill(); }
        c.restore();
      }
    }
    function render(c) {
      arena(c);
      drawGuardian(c);
      drawPlayer(c);
      if (flash > 0) { c.fillStyle = `rgba(255,${p.burst > 0 ? 240 : 80},${p.burst > 0 ? 240 : 80},${flash * 0.5})`; c.fillRect(0, 0, W, 844); }
      if (bannerT > 0 || intro > 0) {
        c.save(); c.textAlign = 'center'; c.globalAlpha = Math.min(1, (intro > 0 ? 1 : bannerT) * 3);
        const big = /K\.O|FIGHT|BLOOM|DECISION/.test(banner);
        c.font = `bold ${big ? 50 : 26}px Georgia, serif`; c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.fillStyle = /PERFECT|BLOOM|UPPER/.test(banner) ? '#ffd86b' : '#ffffff';
        const y = big ? 250 : 210;
        c.strokeText(banner, CX, y); c.fillText(banner, CX, y);
        if (intro > 0) { c.font = 'bold 16px system-ui'; c.fillStyle = `rgb(${G.arena})`; c.fillText(`STAGE ${LV} GUARDIAN`, CX, 176); }
        c.restore();
      }
    }
    function shadeCol(hex, k) {
      const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
      const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
      return `rgb(${f(r)},${f(gg)},${f(b)})`;
    }
    function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; }
    window.__duel = { state: () => ({ g: g.st, atk: g.atk, hp, p: p.st, stars: S.stars }), dodgeFor: () => (g.atk ? DEF[g.atk][0] : null) };
    return {
      update, render,
      destroy() { LIVE = null; },
      debug: () => ({ level: LV, guardian: G.name, gst: g.st, atk: g.atk, hp: Math.round(hp), pst: p.st, stars: S.stars, clock: Math.ceil(clock), done })
    };
  }
})();
