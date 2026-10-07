// ============================================================================
// Drift & Bloom — MOONBEAT RUN (Adventure round 4). A one-touch rhythm runner, Geometry Dash-style,
// built to its own song ("Neon Moth", tools/assets/songs.py -> assets/worlds/moonbeat/beatmap.json).
// Lumi, a moth made of moonlight, races a neon night city to the moon. Tap = flap (a jump that lasts
// one beat), hold = glide. Spikes land on the kick, neon beams on the clap ("jump - stay - jump - stay"),
// the lead melody hangs in the sky as light orbs at the height of each note, the snare-roll build is a
// gauntlet, the break is a flapping flight through gates, and from stage 6 the second drop flips
// gravity onto the ceiling. The game clock leads; the music is kept on it.
// ============================================================================
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const GROUND = 610, CEIL = 332, SCREEN_X = 120;
  let MAP = null, mapP = null;
  const loadMap = () => mapP || (mapP = fetch('assets/worlds/moonbeat/beatmap.json').then(r => r.json()).then(m => (MAP = m)).catch(() => null));
  loadMap();

  DABWorlds.register('moonbeat', {
    title: 'Moonbeat Run', color: '255,90,220', opaque: true,
    landscape: { top: 262, h: 470 },
    music: 'music_moonbeat',
    sounds: ['orb', 'crash', 'ring', 'flip', 'pickup'],
    subtitle: () => 'Lumi, a moth made of moonlight, races the beat across a neon city to the moon.',
    hint: 'Jump on the beat — the whole level is the song',
    howto: ['Tap anywhere: flap  ·  hold: glide', 'Spikes come on the kick, beams on the clap: jump · stay · jump · stay',
            'Catch the light orbs: they are the melody'],
    controls: { dirs: 'none', buttons: [], touch: true },
    create
  });

  // if the beat map didn't load: a plain course on the beat (kicks from bar 4, a break at bars 24-27)
  function fallbackMap() {
    const B = 60 / 128, ev = [];
    for (let b = 16; b < 128; b++) { if (b >= 48 && b < 64) continue; if (b >= 96 && b < 112) continue; ev.push({ t: b * B, beat: b, tag: 'kick' }); }
    [['intro', 0], ['verse', 16], ['build', 48], ['drop', 64], ['break', 96], ['drop2', 112]].forEach(([n, b]) => ev.push({ t: b * B, beat: b, tag: 'section', p: n }));
    return { bpm: 128, length: 60, beats: [], events: ev };
  }
  function create(env) {
    const LV = env.level, fx = env.fx;
    const W = () => env.W;
    const SPEED = 330 + LV * 14;
    const G = 3980, V0 = 935, AIR = 2 * V0 / G;                     // a jump lasts ~ one beat at 128 bpm
    const sfx = (n, o) => env.sfx(n, o);
    const map = MAP || fallbackMap();
    const BEAT = 60 / map.bpm, END = map.length;
    const sec = {};
    map.events.filter(e => e.tag === 'section').forEach(e => { sec[e.p] = e.t; });
    const at = (name) => sec[name] !== undefined ? sec[name] : 0;
    const inSec = (t, a, b) => t >= at(a) - 1e-3 && t < (b ? at(b) : END) - 1e-3;
    // ── build the course from the beat map ──
    const obs = [];        // { kind: spike|beam|block|ring|gate|flip, x, w, h, top, ... }
    const orbs = [];
    const lead = AIR * 0.5 * SPEED;                                // on the beat = over it at the apex
    const X = t => t * SPEED + lead;
    const FLIP_LEN = 8 * BEAT;                                     // the second drop's first two bars run on the ceiling
    const flipped = t => LV >= 6 && t >= at('drop2') && t < at('drop2') + FLIP_LEN;
    const kicks = map.events.filter(e => e.tag === 'kick');
    let kn = 0;
    for (const e of kicks) {
      const t = e.t, beatInBar = Math.round(e.beat) % 4;
      const verse = inSec(t, 'verse', 'build'), drop = inSec(t, 'drop', 'break') || inSec(t, 'drop2');
      const every = verse ? (LV <= 2 ? 4 : LV <= 4 ? 2 : 1) : (LV <= 3 ? 2 : 1);
      kn++;
      if (drop && LV >= 3 && (beatInBar === 1 || beatInBar === 3)) {                 // the clap: a beam, stay low
        obs.push({ kind: 'beam', x: X(t) - 10, w: 46, top: true, t, flip: flipped(t) });
        continue;
      }
      if (kn % every) continue;
      const tall = LV >= 7 && drop && (kn % 4 === 0);
      obs.push({ kind: tall ? 'block' : 'spike', x: X(t) - 15, w: tall ? 40 : 30, h: tall ? 56 : 34, t, flip: flipped(t) });
      if (LV >= 8 && verse && kn % 2 === 0) obs.push({ kind: 'spike', x: X(t) + 18, w: 30, h: 34, t, flip: false });
    }
    // the build (under the snare roll): a gauntlet on the beat grid in later stages, bounce rings in early ones
    for (let b = 0; b < 16; b++) {
      const t = at('build') + b * BEAT;
      if (LV >= 4 && (LV >= 7 || b % 2 === 0) && b >= 2) obs.push({ kind: 'spike', x: X(t) - 13, w: 26, h: 30, t, small: true });
      if (LV >= 9 && b >= 12) obs.push({ kind: 'spike', x: X(t) + 14, w: 26, h: 30, t, small: true });
    }
    if (LV >= 3) for (let b = 0; b < 4; b++) { const t = at('build') + b * 4 * BEAT + 2 * BEAT; orbs.push({ x: X(t), y: GROUND - 120, got: false, ring: true }); }
    // the melody as light orbs (drop + drop2), height by pitch
    map.events.filter(e => e.tag === 'lead').forEach(e => {
      const h = 34 + Math.max(0, Math.min(1, (e.p - 72) / 16)) * 76;
      const f = flipped(e.t);
      orbs.push({ x: e.t * SPEED + lead * 0.5, y: f ? CEIL + h : GROUND - h, got: false, t: e.t });
    });
    // the intro: practice orbs on the beat
    for (let b = 4; b < 16; b += 2) orbs.push({ x: X(b * BEAT), y: GROUND - 80, got: false });
    // the break: a flapping flight through gates, one per bar
    const breakT0 = at('break'), breakT1 = at('drop2');
    for (let b = 0; b < 4; b++) {
      const t = breakT0 + (b + 0.5) * 4 * BEAT;
      const gap = Math.max(150, 240 - LV * 8), cy = GROUND - 150 - Math.sin(b * 1.7 + LV) * 70;
      obs.push({ kind: 'gate', x: X(t) - 22, w: 44, gapTop: cy - gap / 2, gapBot: cy + gap / 2, t });
      orbs.push({ x: X(t), y: cy, got: false });
    }
    if (LV >= 6) {
      obs.push({ kind: 'flip', x: X(at('drop2')) - 40, w: 30, t: at('drop2') });
      obs.push({ kind: 'flip', x: X(at('drop2') + FLIP_LEN) - 40, w: 30, t: at('drop2') + FLIP_LEN, back: true });
    }
    // breathing room: nothing in the beat before the flight starts, or the beat before the flip
    const clear = (t0, t1) => { for (let i = obs.length - 1; i >= 0; i--) if (obs[i].kind !== 'gate' && obs[i].kind !== 'flip' && obs[i].t >= t0 && obs[i].t < t1) obs.splice(i, 1); };
    clear(breakT0 - 1.5 * BEAT, breakT0 + 0.01);
    clear(breakT1 - 0.01, breakT1 + BEAT);
    if (LV >= 6) clear(at('drop2') + FLIP_LEN - BEAT, at('drop2') + FLIP_LEN + BEAT);
    obs.sort((a, b) => a.x - b.x);
    const orbTotal = orbs.length;

    // ── state ──
    const M = { x: 0, y: GROUND, vy: 0, ground: true, flip: false, wing: 0, glide: false, trail: [] };
    let songT = 0, t = 0, hits = 0, orbsGot = 0, pulse = 0, lastBeat = -1, done = false, glitch = 0, resyncCd = 0, combo = 0, buffered = 0, coyote = 0;
    const fly = () => songT >= breakT0 && songT < breakT1 - BEAT;
    if (window.DABAudio) DABAudio.music('music_moonbeat', { restart: true, xf: 0.01 });
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random() * 2000, y: Math.random() * 520, s: Math.random() * 1.6 + 0.3, ph: Math.random() * TAU }));
    const skyline = [0, 1, 2].map(k => { const r = []; let x = 0; while (x < 3000) { const w = 30 + Math.random() * (60 + k * 30), h = 60 + Math.random() * (110 + k * 70); r.push({ x, w, h, win: Math.random() }); x += w + 4 + Math.random() * 20; } return r; });

    function crash(why) {
      if (env.invulnerable || done) return;
      hits++; combo = 0;
      env.damage(34, { x: SCREEN_X, y: M.y - 40, text: why || 'crash!' });
      env.invuln(1.1); env.shake(0.35); glitch = 0.4;
      sfx('crash', { vol: 0.8 });
      for (let i = 0; i < 18; i++) { const a = Math.random() * TAU; fx.spawn({ x: M.x, y: M.y - 14, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, kind: 'spark', size: 2, life: 0.4, rgb: '255,90,220' }); }
    }
    function update(dt, I) {
      t += dt; resyncCd -= dt;
      if (done) return;
      // the clock: our own, nudged onto the music (or the music moved back onto us after a pause)
      songT += dt;
      const mt = window.DABAudio ? DABAudio.musicTime() : null;
      if (mt !== null && mt < END - 0.2) {
        const d = mt - songT;
        if (Math.abs(d) < 0.12) songT += d * 0.15;
        else if (resyncCd <= 0) { DABAudio.music('music_moonbeat', { restart: true, xf: 0.03, offset: songT }); resyncCd = 1; }
      }
      const beatN = Math.floor(songT / BEAT);
      if (beatN !== lastBeat) { lastBeat = beatN; pulse = 1; }
      pulse = Math.max(0, pulse - dt * 4);
      glitch = Math.max(0, glitch - dt);
      if (songT >= END - 0.05) { finish(); return; }
      // input: any tap / Space flaps; holding glides
      let tap = I.taps.length > 0 || I.pressed.jump || I.pressed.attack;
      if (window.__moonAuto) tap = autoTap();                          // test autopilot: perfect timing
      if (tap) buffered = 0.13; else buffered = Math.max(0, buffered - dt);
      coyote = M.ground ? 0.07 : Math.max(0, coyote - dt);
      if (!tap && buffered > 0 && M.ground) tap = true;                // a tap just before landing still counts
      const hold = I.touch.down || I.held.jump || I.held.attack;
      const flyMode = fly();
      const gdir = M.flip ? -1 : 1;
      if (tap) {
        if (flyMode) { M.vy = -470; M.wing = 1; }
        else if (M.ground || coyote > 0) { M.vy = -V0 * gdir; M.ground = false; coyote = 0; buffered = 0; M.wing = 1; }
        // a bounce ring under the moth: a second flap in the air
        else for (const o of orbs) if (o.ring && !o.got && Math.abs(o.x - M.x) < 40 && Math.abs(o.y - (M.y - 14)) < 46) { o.got = true; M.vy = -V0 * 0.9 * gdir; sfx('ring', { vol: 0.8 }); M.wing = 1; burst(o.x, o.y, '255,230,120', 14); }
      }
      M.glide = hold && !M.ground && !flyMode && M.vy * gdir > 0;
      M.vy += G * (flyMode ? 0.42 : 1) * gdir * dt;
      if (M.glide) M.vy = gdir > 0 ? Math.min(M.vy, 170) : Math.max(M.vy, -170);
      M.y += M.vy * dt;
      M.x = songT * SPEED;
      // floor / ceiling (the break has no floor: fall too far and you crash back up)
      const floorY = M.flip ? CEIL : GROUND;
      if (!flyMode) {
        if (!M.flip && M.y >= GROUND) { M.y = GROUND; M.vy = 0; M.ground = true; }
        else if (M.flip && M.y <= CEIL) { M.y = CEIL; M.vy = 0; M.ground = true; }
        else M.ground = false;
      } else {
        M.ground = false;
        if (M.y > GROUND + 20) { crash('fell!'); M.y = GROUND - 60; M.vy = -420; }
        if (M.y < CEIL - 60) { M.y = CEIL - 60; M.vy = 0; }
      }
      M.wing = Math.max(0, M.wing - dt * 3);
      // collisions
      const mx = M.x, my = M.y - (M.flip ? -14 : 14);
      for (const o of obs) {
        if (o.x > mx + 40) break;
        if (o.x + o.w < mx - 40 || o.hit) continue;
        if (o.kind === 'flip') { if (mx > o.x) { o.hit = true; M.flip = !o.back; M.ground = false; M.vy = (M.flip ? -1 : 1) * 300; sfx('flip', { vol: 0.8 }); env.flash('255,90,220', 0.3); } continue; }
        const inX = mx + 10 > o.x && mx - 10 < o.x + o.w;
        if (!inX) continue;
        if (o.kind === 'spike' || o.kind === 'block') {
          const fl = o.flip;
          const top = fl ? CEIL : GROUND - o.h, bot = fl ? CEIL + o.h : GROUND;
          const myTop = my - 12, myBot = my + 12;
          if (o.kind === 'block' && !fl && M.vy >= 0 && my + 14 <= top + 14 && myBot > top) { M.y = top; M.vy = 0; M.ground = true; continue; }   // land on a block
          if (myBot > top + 6 && myTop < bot - 4) { o.hit = true; crash(o.kind === 'spike' ? 'spiked!' : 'smack!'); }
        } else if (o.kind === 'beam') {
          const fl = o.flip, y0 = fl ? CEIL + 46 : GROUND - 150, y1 = fl ? CEIL + 150 : GROUND - 46;
          if (my + 10 > y0 && my - 10 < y1) { o.hit = true; crash('zapped!'); }
        } else if (o.kind === 'gate') {
          if (my - 10 < o.gapTop || my + 10 > o.gapBot) { o.hit = true; crash('bonk!'); }
        }
      }
      for (const o of orbs) {
        if (o.got || o.ring || Math.abs(o.x - mx) > 26) continue;
        if (Math.abs(o.y - my) < 30) { o.got = true; orbsGot++; combo++; sfx('orb', { vol: 0.55, rate: 0.9 + Math.min(0.6, combo * 0.03) }); burst(o.x, o.y, '255,240,150', 8); }
      }
      // moth trail
      M.trail.push({ x: M.x, y: my, life: 0.5 });
      for (const p of M.trail) p.life -= dt;
      while (M.trail.length && M.trail[0].life <= 0) M.trail.shift();
      env.hud.objective = flyMode ? 'Tap to flap through the gates' : 'Jump on the beat';
      env.hud.progress = Math.min(1, songT / END);
      env.hud.counters = [{ icon: '✦', value: `${orbsGot}/${orbTotal}` }];
    }
    function autoTap() {
      if (fly()) {
        const g = obs.find(o => o.kind === 'gate' && o.x + o.w > M.x - 10);
        const ty = g && g.x - M.x < 260 ? (g.gapTop + g.gapBot) / 2 : GROUND - 150;
        return M.y - 14 > ty + 8 && M.vy > -120;
      }
      if (!M.ground) return false;
      for (const o of obs) {
        if (o.kind !== 'spike' && o.kind !== 'block') continue;
        if (!!o.flip !== M.flip) continue;
        const dx = o.x + o.w / 2 - M.x;
        if (dx < -20) continue;
        return dx <= lead + 6 && dx >= lead - 22;
      }
      return false;
    }
    function burst(x, y, rgb, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = 60 + Math.random() * 140; fx.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: 'spark', size: 1.6, life: 0.35, rgb }); }
    }
    function finish() {
      done = true;
      const share = orbsGot / Math.max(1, orbTotal);
      if (env.round) env.setStars(hits === 0 && share >= 0.7 ? 3 : (hits <= 1 || share >= 0.5) ? 2 : 1);
      env.flash('255,230,255', 0.6);
      env.win();
    }

    // ── drawing ──
    function render(c) {
      const camX = M.x - (env.land ? 260 : SCREEN_X), Wv = W();
      const p = pulse;
      // sky
      const g = c.createLinearGradient(0, 0, 0, GROUND);
      g.addColorStop(0, '#05010f'); g.addColorStop(0.55, '#1c0636'); g.addColorStop(1, `rgb(${110 + p * 40},${20 + p * 20},${120 + p * 30})`);
      c.fillStyle = g; c.fillRect(0, 0, Wv, 844);
      for (const s of stars) { const x = ((s.x - camX * 0.05) % 2000 + 2000) % 2000; if (x > Wv) continue; c.fillStyle = `rgba(255,220,255,${0.4 + 0.4 * Math.sin(t * 2 + s.ph)})`; c.fillRect(x, s.y, s.s, s.s); }
      // the moon: a striped retro disc that swells on the beat
      const mx0 = Wv * 0.62, my0 = 300, mr = 120 + p * 6 + (songT / END) * 40;
      const mg = c.createLinearGradient(0, my0 - mr, 0, my0 + mr);
      mg.addColorStop(0, '#fff2ff'); mg.addColorStop(0.5, '#ff9de6'); mg.addColorStop(1, '#ff4fb3');
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35; c.drawImage(env.glowSprite('255,120,220'), mx0 - mr * 2, my0 - mr * 2, mr * 4, mr * 4); c.restore();
      c.save(); c.beginPath(); c.arc(mx0, my0, mr, 0, TAU); c.clip();
      c.fillStyle = mg; c.fillRect(mx0 - mr, my0 - mr, mr * 2, mr * 2);
      c.fillStyle = '#1c0636';
      for (let i = 0; i < 7; i++) { const y = my0 + mr * 0.15 + i * (mr * 0.13), h = 2 + i * 1.6; c.fillRect(mx0 - mr, y, mr * 2, h); }
      c.restore();
      // skyline, three depths, windows blink with the music
      skyline.forEach((row, k) => {
        const par = [0.12, 0.25, 0.45][k], base = GROUND - [10, 6, 0][k];
        c.fillStyle = ['#2a0b4a', '#1b0733', '#10031f'][k];
        for (const b of row) {
          const x = ((b.x - camX * par) % 3000 + 3000) % 3000 - 100;
          if (x > Wv || x + b.w < 0) continue;
          const h = b.h * (0.7 + k * 0.15);
          c.fillRect(x, base - h, b.w, h);
          if (k === 2 && b.win > 0.4) {
            c.fillStyle = `rgba(${b.win > 0.7 ? '90,230,255' : '255,100,220'},${0.35 + p * 0.5})`;
            for (let wy = base - h + 8; wy < base - 8; wy += 14) for (let wx = x + 6; wx < x + b.w - 6; wx += 10) if ((wx * 7 + wy * 3) % 5 < 2) c.fillRect(wx, wy, 3, 5);
            c.fillStyle = '#10031f';
          }
        }
      });
      // floor: neon line + perspective grid below
      const fy = GROUND;
      c.fillStyle = '#0a0118'; c.fillRect(0, fy, Wv, 844 - fy);
      c.strokeStyle = `rgba(80,230,255,${0.25 + p * 0.35})`; c.lineWidth = 1;
      const vpX = Wv / 2;
      for (let i = -14; i <= 14; i++) { const x = vpX + i * 60 - ((camX * 0.9) % 60); c.beginPath(); c.moveTo(vpX + (x - vpX) * 0.05, fy); c.lineTo(x * 3 - vpX * 2, 844); c.stroke(); }
      for (let k = 0; k < 9; k++) { const y = fy + Math.pow((k + ((t * 1.4) % 1)) / 9, 2) * (844 - fy); c.beginPath(); c.moveTo(0, y); c.lineTo(Wv, y); c.stroke(); }
      const flyNow = fly();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = flyNow ? 'rgba(80,230,255,0.25)' : `rgba(80,240,255,${0.8 + p * 0.2})`; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, fy); c.lineTo(Wv, fy); c.stroke();
      if (LV >= 6 && songT > at('drop2') - 3) { c.strokeStyle = 'rgba(255,90,220,0.7)'; c.beginPath(); c.moveTo(0, CEIL); c.lineTo(Wv, CEIL); c.stroke(); }
      // obstacles
      for (const o of obs) {
        const x = o.x - camX;
        if (x > Wv + 60) break;
        if (x + o.w < -60) continue;
        if (o.kind === 'spike') {
          const n = o.small ? 1 : 1, fl = o.flip, base = fl ? CEIL : GROUND, dir = fl ? 1 : -1;
          c.strokeStyle = o.hit ? 'rgba(255,255,255,0.3)' : `rgba(255,70,200,${0.85 + p * 0.15})`; c.fillStyle = 'rgba(255,40,180,0.18)'; c.lineWidth = 2.5;
          for (let k = 0; k < n; k++) { c.beginPath(); c.moveTo(x, base); c.lineTo(x + o.w / 2, base + dir * o.h); c.lineTo(x + o.w, base); c.closePath(); c.fill(); c.stroke(); }
        } else if (o.kind === 'block') {
          const fl = o.flip, y = fl ? CEIL : GROUND - o.h;
          c.strokeStyle = `rgba(90,230,255,${0.9})`; c.fillStyle = 'rgba(40,150,255,0.15)'; c.lineWidth = 2.5;
          c.fillRect(x, y, o.w, o.h); c.strokeRect(x, y, o.w, o.h);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + o.w, y + o.h); c.moveTo(x + o.w, y); c.lineTo(x, y + o.h); c.stroke();
        } else if (o.kind === 'beam') {
          const fl = o.flip, y0 = fl ? CEIL + 46 : GROUND - 150, y1 = fl ? CEIL + 150 : GROUND - 46;
          c.fillStyle = 'rgba(255,60,120,0.2)'; c.fillRect(x, y0, o.w, y1 - y0);
          c.strokeStyle = o.hit ? 'rgba(255,255,255,0.3)' : `rgba(255,${80 + p * 120},140,1)`; c.lineWidth = 3;
          for (let k = 0; k < 3; k++) { const yy = y0 + (y1 - y0) * (k + 0.5) / 3 + Math.sin(t * 30 + k) * 2; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + o.w, yy); c.stroke(); }
          c.fillStyle = '#ff5aa0'; c.fillRect(x - 3, y0 - 6, o.w + 6, 6); c.fillRect(x - 3, y1, o.w + 6, 6);
        } else if (o.kind === 'gate') {
          c.fillStyle = 'rgba(80,40,160,0.55)'; c.strokeStyle = 'rgba(160,120,255,0.9)'; c.lineWidth = 2.5;
          c.fillRect(x, CEIL - 120, o.w, o.gapTop - (CEIL - 120)); c.strokeRect(x, CEIL - 120, o.w, o.gapTop - (CEIL - 120));
          c.fillRect(x, o.gapBot, o.w, 844 - o.gapBot); c.strokeRect(x, o.gapBot, o.w, 844 - o.gapBot);
        } else if (o.kind === 'flip') {
          const ph = t * 6;
          c.strokeStyle = 'rgba(255,90,220,0.9)'; c.lineWidth = 3;
          c.beginPath(); c.ellipse(x + 15, (GROUND + CEIL) / 2, 16, (GROUND - CEIL) / 2 - 8, 0, 0, TAU); c.stroke();
          c.fillStyle = 'rgba(255,90,220,0.15)'; c.fill();
          c.fillStyle = '#fff'; c.font = 'bold 22px system-ui'; c.textAlign = 'center'; c.fillText(o.back ? '⇩' : '⇧', x + 15, (GROUND + CEIL) / 2 + 8 + Math.sin(ph) * 4);
        }
      }
      // orbs (the melody)
      for (const o of orbs) {
        if (o.got) continue;
        const x = o.x - camX; if (x < -30 || x > Wv + 30) continue;
        if (o.ring) { c.strokeStyle = `rgba(255,230,120,${0.7 + p * 0.3})`; c.lineWidth = 3; c.beginPath(); c.arc(x, o.y, 22 + p * 3, 0, TAU); c.stroke(); continue; }
        c.globalAlpha = 0.8; c.drawImage(env.glowSprite('255,230,140'), x - 14, o.y - 14, 28, 28); c.globalAlpha = 1;
        c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(x, o.y, 4 + p * 1.5, 0, TAU); c.fill();
      }
      c.restore();
      drawMoth(c, camX);
      // finish: the moon gate as the song ends
      const left = END - songT;
      if (left < 3) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (3 - left) / 3 * 0.6; c.fillStyle = '#ffd6ff'; c.fillRect(0, 0, Wv, 844); c.restore(); }
      if (glitch > 0) {                                           // crash: an RGB glitch smear
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) { const y = Math.random() * 844; c.fillStyle = i % 2 ? 'rgba(255,0,120,0.25)' : 'rgba(0,240,255,0.25)'; c.fillRect(0, y, Wv, 4 + Math.random() * 18); }
        c.restore();
      }
    }
    function drawMoth(c, camX) {
      const x = M.x - camX, y = M.y - (M.flip ? -16 : 16);
      // dust trail
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const q of M.trail) { const k = q.life / 0.5; c.globalAlpha = k * 0.5; c.drawImage(env.glowSprite('200,170,255'), q.x - camX - 6 * k, q.y - 6 * k, 12 * k, 12 * k); }
      c.globalAlpha = 0.5 + pulse * 0.4; c.drawImage(env.glowSprite('220,200,255'), x - 34, y - 34, 68, 68);
      c.restore();
      const blink = env.invulnerable && Math.sin(t * 30) > 0;
      c.save(); c.translate(x, y); if (M.flip) c.scale(1, -1); if (blink) c.globalAlpha = 0.45;
      c.rotate(Math.max(-0.5, Math.min(0.5, M.vy / 1800)));
      const flap = fly() ? Math.sin(t * 26) : M.glide ? 0.15 : M.wing > 0 ? Math.sin(M.wing * 14) : Math.sin(t * 9) * 0.3;
      for (const side of [-1, 1]) {                                 // four wings: big upper, small lower
        c.save(); c.scale(1, 1);
        const up = c.createLinearGradient(0, 0, 0, -30); up.addColorStop(0, 'rgba(120,230,255,0.85)'); up.addColorStop(1, 'rgba(255,120,230,0.55)');
        c.fillStyle = up;
        c.save(); c.rotate(side * 0.35 - 0.2 + flap * 0.5 * side); c.beginPath(); c.ellipse(side * 4 - 6, -14, 9, 18, side * 0.5, 0, TAU); c.fill(); c.restore();
        c.fillStyle = 'rgba(200,160,255,0.6)';
        c.save(); c.rotate(side * 0.2 + 0.4 - flap * 0.3 * side); c.beginPath(); c.ellipse(side * 3 - 8, 6, 6, 10, side * 0.3, 0, TAU); c.fill(); c.restore();
        c.restore();
      }
      const bg = c.createLinearGradient(-12, 0, 12, 0); bg.addColorStop(0, '#d9cfff'); bg.addColorStop(1, '#ffffff');
      c.fillStyle = bg; c.beginPath(); c.ellipse(0, 0, 13, 6.5, 0, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(11, -2, 5, 0, TAU); c.fill();
      c.fillStyle = '#2b1050'; c.beginPath(); c.arc(13, -3, 1.6, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(13, -6); c.quadraticCurveTo(18, -16, 24, -15); c.moveTo(11, -6); c.quadraticCurveTo(13, -18, 18, -20); c.stroke();
      c.restore();
    }
    return {
      update, render,
      debug: () => ({ level: LV, songT: +songT.toFixed(2), musicT: window.DABAudio && DABAudio.musicTime() !== null ? +DABAudio.musicTime().toFixed(2) : null,
        y: Math.round(M.y), ground: M.ground, flip: M.flip, hits, orbs: `${orbsGot}/${orbTotal}`, obstacles: obs.length, fly: fly(), mapLoaded: !!MAP })
    };
  }
})();
