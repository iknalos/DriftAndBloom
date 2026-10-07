// ============================================================================
// Drift & Bloom — ADVENTURE (the main run): 10 stages x 10 rounds = 100.
// Every stage plays the same ten games in the same order, each one harder than in the stage
// before (the stage number is the game's level 1..10). Lose a round: a life; lose all three:
// the stage starts over. Clear round 10 and the next stage opens. Games not built yet are skipped.
//
// Round games are DABWorlds worlds (worlds/*.js) entered with { level, badge, round: true },
// except round 1, a pond level from the matching Classic stage (game.html, window.__pondRound).
// Between stages: pick 1 of 3 boons; it holds for the whole next stage (worlds read it as env.boon / atk / clock).
// Progress: localStorage 'dab_adv'. Icons are drawn (no emoji: older phones show some as empty boxes).
// ============================================================================
;(function () {
  'use strict';

  const ROUNDS = [
    { id: 'pond',     name: 'Lily Pond',     icon: '🪷', rgb: '93,202,165' },
    { id: 'animal',   name: 'Animal World',  icon: '🐗', rgb: '150,215,110' },
    { id: 'frost',    name: 'Frost Garden',  icon: '❄️', rgb: '170,220,255' },
    { id: 'moonbeat', name: 'Moonbeat Run',  icon: '🌙', rgb: '255,90,220' },
    { id: 'stream',   name: 'Stream Weaver', icon: '💧', rgb: '90,200,255' },
    { id: 'alien',    name: 'Alien Escape',  icon: '🛸', rgb: '140,170,255' },
    { id: 'thief',    name: 'Seed Thief',    icon: '🦝', rgb: '230,170,90' },
    { id: 'bombs',    name: 'Bloom Bombs',   icon: '🌸', rgb: '255,130,170' },
    { id: 'hell',     name: 'Hell',          icon: '🔥', rgb: '255,120,60' },
    { id: 'duel',     name: 'Guardian Duel', icon: '🥊', rgb: '255,215,90' },
  ];
  // round 1 of stage s: this Classic pond level (that stage's hazards, getting late in its stage)
  const POND = [0, 5, 16, 26, 36, 47, 58, 67, 77, 88, 98];
  const STAGE_RGB = ['', '93,202,165', '110,190,230', '120,200,140', '170,150,255', '90,200,200',
    '200,140,255', '255,170,90', '255,110,80', '230,80,120', '255,215,90'];
  // after each stage's Guardian: pick one, it lasts the next stage (game overs included)
  const BOONS = [
    { id: 'heart',  name: 'Extra Heart',   text: 'Four lives this stage instead of three', rgb: '255,110,130' },
    { id: 'second', name: 'Second Chance', text: 'The first round you lose costs no life', rgb: '150,225,255' },
    { id: 'hide',   name: 'Thick Hide',    text: 'Take 30% less damage in every fight', rgb: '215,185,130' },
    { id: 'dew',    name: 'Morning Dew',   text: 'Your health slowly comes back in fights', rgb: '140,240,190' },
    { id: 'edge',   name: 'Keen Edge',     text: 'Your hits land 35% harder', rgb: '255,200,120' },
    { id: 'time',   name: 'Slow Sun',      text: 'Round clocks tick 25% slower', rgb: '255,220,100' },
    { id: 'blast',  name: 'Big Blooms',    text: 'Bloom Bombs burst one tile further', rgb: '255,140,190' },
  ];

  const KEY = 'dab_adv';
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* fresh */ }
    s = s && s.v === 1 ? s : { v: 1, stage: 1, round: 1, lives: 3, maxStage: 1, stars: {} };
    return s;
  }
  let A = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(A)); } catch (e) { /* private mode */ } };
  const boonOf = s => (A.boon && A.boon.stage === s ? BOONS.find(b => b.id === A.boon.id) || null : null);
  const maxLives = s => (boonOf(s) && boonOf(s).id === 'heart' ? 4 : 3);
  function fresh(s) { A.lives = maxLives(s); A.second = !!(boonOf(s) && boonOf(s).id === 'second'); }   // a stage (re)start
  const unlockAll = () => typeof UNLOCK_ALL !== 'undefined' && UNLOCK_ALL;
  const built = r => r.id === 'pond' || !!(window.DABWorlds && DABWorlds.has(r.id));
  const stageName = s => (typeof STAGE_INFO !== 'undefined' && STAGE_INFO[s - 1] ? STAGE_INFO[s - 1][0] : 'Stage ' + s);
  const starKey = (s, r) => s + '-' + r;
  const stageStars = s => { let t = 0; for (let r = 1; r <= 10; r++) t += A.stars[starKey(s, r)] || 0; return t; };

  // ── screen state ──
  const cv = document.getElementById('adv-cv');
  let cx = cv.getContext('2d');
  const W = 390, H = 844, TAU = Math.PI * 2;
  let view = A.stage;             // stage shown on the map
  let mode = A.offer ? 'boon' : 'map';   // map | card | over | clear | boon
  let modeT = 0, t = 0, busy = false, toast = '', toastT = 0, pending = null;

  function nodePos(r) {          // the winding path, top (round 1) to bottom (round 10)
    const y = 186 + (r - 1) * 58;
    const x = W / 2 + Math.sin((r - 1) * 1.15 + 0.4) * 104;
    return { x, y };
  }

  // ── run controller ──
  function playRound(s, r) {
    const R = ROUNDS[r - 1];
    if (!built(R)) {                                            // not made yet: step over it
      A.round = r + 1; save();
      if (A.round > 10) return stageClear(s);
      return playRound(s, A.round);
    }
    A.stage = s; A.round = r; save();
    mode = 'card'; modeT = 0; pending = { s, r };
    if (window.DABAudio) DABAudio.play('select', { jitter: 0 });
  }
  function launch(s, r) {
    const R = ROUNDS[r - 1], badge = `STAGE ${s} · ROUND ${r}`, b = boonOf(s);
    busy = true;
    if (R.id === 'pond') {
      window.__pondRound = { badge, stage: s, clock: b && b.id === 'time' ? 0.75 : 1,
        onEnd: res => { window.__pondRound = null; goTo('s-adventure'); result(s, r, res); } };
      startLevel(POND[s]);
      return;
    }
    DABWorlds.enter(R.id, { charId: selectedChar, reason: '', level: s, badge, round: true, music: 'music_pond',
      boons: b ? { [b.id]: true } : {}, boonName: b ? b.name : '' })
      .then(res => result(s, r, res));
  }
  function result(s, r, res) {
    busy = false; mode = 'map'; view = s;
    if (!res || res.aborted) { flash('Round left — no life lost'); return; }
    if (res.won) {
      const k = starKey(s, r);
      A.stars[k] = Math.max(A.stars[k] || 0, res.stars || 1);
      A.round = r + 1; save();
      if (A.round > 10) { stageClear(s); return; }
      playRound(s, A.round);                                   // NES pace: straight on to the next round
      return;
    }
    if (A.second && boonOf(s) && boonOf(s).id === 'second') { A.second = false; save(); flash('Second Chance: no life lost'); return; }
    A.lives--;
    if (A.lives <= 0) { mode = 'over'; modeT = 0; A.round = 1; fresh(s); save(); if (window.DABAudio) DABAudio.play('lose', { jitter: 0 }); return; }
    save();
    flash(A.lives === 1 ? 'Last life!' : A.lives + ' lives left');
  }
  function stageClear(s) {
    A.maxStage = Math.max(A.maxStage, Math.min(10, s + 1));
    A.stage = Math.min(10, s + 1); A.round = 1;
    if (s < 10) {                                               // three boons for the stage ahead (kept if the app closes)
      const pool = BOONS.map(b => b.id).filter(id => !(A.boon && A.boon.id === id && A.boon.stage === s));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      A.offer = { stage: s + 1, ids: pool.slice(0, 3) };
    }
    fresh(A.stage); save();
    mode = 'clear'; modeT = 0; view = s;
    if (window.DABAudio) DABAudio.play('win', { jitter: 0 });
  }
  function takeBoon(id) {
    const st = A.offer.stage;
    A.boon = { id, stage: st }; A.offer = null;
    if (A.stage === st && A.round === 1) fresh(st);
    save();
    mode = 'map'; view = st;
    flash(BOONS.find(b => b.id === id).name + ' for Stage ' + st);
    if (window.DABAudio) DABAudio.play('select', { jitter: 0 });
  }
  function flash(msg) { toast = msg; toastT = 2.2; }

  // ── drawing ──
  function bg(c, rgb) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04070d'); g.addColorStop(0.6, '#081422'); g.addColorStop(1, `rgba(${rgb},0.35)`);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {                            // drifting motes in the stage colour
      const x = (i * 97.3 + t * (6 + (i % 5) * 3)) % W, y = (i * 211.7 + Math.sin(t * 0.5 + i) * 20) % H;
      c.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.3 + i);
      c.fillStyle = `rgba(${rgb},0.9)`; c.beginPath(); c.arc(x, y, 1.2 + (i % 3) * 0.6, 0, TAU); c.fill();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  function pill(c, x, y, w, h, fill, stroke) {
    c.beginPath(); c.roundRect(x, y, w, h, h / 2); if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
  }
  // ── icons (vector, so every phone draws them) ──
  function petal(c, x, y, a, l, w) { c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.ellipse(0, -l / 2, w, l / 2, 0, 0, TAU); c.fill(); c.restore(); }
  function heartPath(c, x, y, r) {
    c.beginPath(); c.moveTo(x, y + r * 0.9);
    c.bezierCurveTo(x - r * 1.5, y - r * 0.05, x - r * 0.75, y - r * 1.15, x, y - r * 0.42);
    c.bezierCurveTo(x + r * 0.75, y - r * 1.15, x + r * 1.5, y - r * 0.05, x, y + r * 0.9); c.closePath();
  }
  function dropPath(c, x, y, r) {
    c.beginPath(); c.moveTo(x, y - r * 1.05);
    c.bezierCurveTo(x + r * 0.35, y - r * 0.5, x + r * 0.85, y - r * 0.05, x + r * 0.85, y + r * 0.35);
    c.arc(x, y + r * 0.35, r * 0.85, 0, Math.PI);
    c.bezierCurveTo(x - r * 0.85, y - r * 0.05, x - r * 0.35, y - r * 0.5, x, y - r * 1.05); c.closePath();
  }
  function star(c, x, y, r0, r1, n, rot) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r1 : r0; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath();
  }
  function icon(c, id, x, y, r) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    switch (id) {
      case 'pond':                                              // lotus
        c.fillStyle = '#f59ac0'; for (let i = -2; i <= 2; i++) petal(c, x, y + r * 0.45, i * 0.55, r * 1.25, r * 0.3);
        c.fillStyle = '#ffd1e4'; petal(c, x, y + r * 0.45, 0, r * 1.05, r * 0.26);
        c.fillStyle = '#5dcaa5'; c.beginPath(); c.ellipse(x, y + r * 0.62, r * 0.95, r * 0.22, 0, 0, TAU); c.fill(); break;
      case 'animal':                                            // a big cat's paw print
        c.fillStyle = '#f2c27a';
        c.beginPath(); c.ellipse(x, y + r * 0.35, r * 0.52, r * 0.42, 0, 0, TAU); c.fill();
        [[-0.62, -0.18], [-0.24, -0.58], [0.24, -0.58], [0.62, -0.18]].forEach(([dx, dy]) => { c.beginPath(); c.ellipse(x + dx * r, y + dy * r, r * 0.2, r * 0.26, dx * 0.5, 0, TAU); c.fill(); }); break;
      case 'frost':                                             // snowflake
        c.strokeStyle = '#cfeaff'; c.lineWidth = Math.max(1.6, r * 0.14);
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6, cx = Math.cos(a), sy = Math.sin(a);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + cx * r, y + sy * r); c.stroke();
          for (const k of [0.55]) for (const d of [-0.5, 0.5]) {
            const bx = x + cx * r * k, by = y + sy * r * k, b = a + d * 1.6;
            c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.cos(b) * r * 0.32, by + Math.sin(b) * r * 0.32); c.stroke();
          }
        } break;
      case 'moonbeat': {                                        // crescent moon + a note
        c.fillStyle = '#ffb0f0';
        c.save(); c.beginPath(); c.arc(x - r * 0.1, y, r * 0.85, 0, TAU); c.clip();
        c.beginPath(); c.arc(x - r * 0.1, y, r * 0.85, 0, TAU); c.arc(x + r * 0.32, y - r * 0.22, r * 0.72, 0, TAU); c.fill('evenodd'); c.restore();
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x + r * 0.45, y + r * 0.55, r * 0.2, r * 0.15, -0.4, 0, TAU); c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = Math.max(1.2, r * 0.09); c.beginPath(); c.moveTo(x + r * 0.62, y + r * 0.5); c.lineTo(x + r * 0.62, y - r * 0.1); c.lineTo(x + r * 0.85, y + r * 0.05); c.stroke(); break;
      }
      case 'stream':                                            // water drop
        c.fillStyle = '#6cc8ff'; dropPath(c, x, y, r * 0.95); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - r * 0.3, y + r * 0.2, r * 0.13, r * 0.28, 0.3, 0, TAU); c.fill(); break;
      case 'alien':                                             // saucer
        c.fillStyle = 'rgba(170,255,220,0.85)'; c.beginPath(); c.ellipse(x, y - r * 0.12, r * 0.42, r * 0.4, 0, Math.PI, 0); c.fill();
        c.fillStyle = '#a9b8ff'; c.beginPath(); c.ellipse(x, y + r * 0.12, r * 1.0, r * 0.32, 0, 0, TAU); c.fill();
        c.fillStyle = '#fff6a8'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(x + i * r * 0.36, y + r * 0.16, r * 0.07, 0, TAU); c.fill(); } break;
      case 'thief':                                             // acorn
        c.fillStyle = '#d99a52'; c.beginPath(); c.ellipse(x, y + r * 0.2, r * 0.52, r * 0.62, 0, 0, TAU); c.fill();
        c.fillStyle = '#7a4a22'; c.beginPath(); c.ellipse(x, y - r * 0.28, r * 0.68, r * 0.34, 0, Math.PI, 0); c.lineTo(x + r * 0.68, y - r * 0.2); c.lineTo(x - r * 0.68, y - r * 0.2); c.fill();
        c.strokeStyle = '#7a4a22'; c.lineWidth = Math.max(1.4, r * 0.12); c.beginPath(); c.moveTo(x, y - r * 0.6); c.lineTo(x + r * 0.15, y - r * 0.9); c.stroke(); break;
      case 'bombs':                                             // seed pod with a lit fuse
        c.fillStyle = '#e36a9a'; c.beginPath(); c.arc(x - r * 0.08, y + r * 0.15, r * 0.66, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.05, r * 0.16, 0, TAU); c.fill();
        c.strokeStyle = '#8a5a2a'; c.lineWidth = Math.max(1.4, r * 0.12); c.beginPath(); c.moveTo(x + r * 0.3, y - r * 0.38); c.quadraticCurveTo(x + r * 0.5, y - r * 0.75, x + r * 0.72, y - r * 0.7); c.stroke();
        c.fillStyle = '#ffe36a'; star(c, x + r * 0.8, y - r * 0.75, r * 0.3, r * 0.12, 5, 0); c.fill(); break;
      case 'hell':                                              // flame
        c.fillStyle = '#ff7a3a'; c.beginPath(); c.moveTo(x, y - r);
        c.bezierCurveTo(x + r * 0.2, y - r * 0.45, x + r * 0.85, y - r * 0.2, x + r * 0.7, y + r * 0.4);
        c.bezierCurveTo(x + r * 0.55, y + r * 0.95, x - r * 0.55, y + r * 0.95, x - r * 0.7, y + r * 0.4);
        c.bezierCurveTo(x - r * 0.8, y - r * 0.05, x - r * 0.35, y - r * 0.2, x, y - r); c.fill();
        c.fillStyle = '#ffd36a'; c.beginPath(); c.moveTo(x, y - r * 0.2);
        c.bezierCurveTo(x + r * 0.4, y + r * 0.15, x + r * 0.4, y + r * 0.7, x, y + r * 0.72);
        c.bezierCurveTo(x - r * 0.4, y + r * 0.7, x - r * 0.4, y + r * 0.15, x, y - r * 0.2); c.fill(); break;
      case 'duel':                                              // boxing glove
        c.fillStyle = '#ff5a5a'; c.beginPath(); c.roundRect(x - r * 0.62, y - r * 0.72, r * 1.2, r * 1.05, r * 0.45); c.fill();
        c.beginPath(); c.ellipse(x - r * 0.62, y - r * 0.05, r * 0.26, r * 0.34, -0.4, 0, TAU); c.fill();
        c.fillStyle = '#fff1d0'; c.fillRect(x - r * 0.48, y + r * 0.36, r * 0.92, r * 0.42);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x + r * 0.05, y - r * 0.42, r * 0.3, r * 0.14, 0, 0, TAU); c.fill(); break;
      // boons
      case 'heart': c.fillStyle = '#ff6b7a'; heartPath(c, x, y + r * 0.05, r * 0.9); c.fill(); break;
      case 'second':
        c.strokeStyle = '#9fe0ff'; c.lineWidth = Math.max(2, r * 0.16);
        c.beginPath(); c.arc(x, y, r * 0.82, -0.6, Math.PI * 1.45); c.stroke();
        c.fillStyle = '#9fe0ff'; c.beginPath(); const ex = x + Math.cos(-0.6) * r * 0.82, ey = y + Math.sin(-0.6) * r * 0.82;
        c.moveTo(ex + r * 0.3, ey - r * 0.05); c.lineTo(ex - r * 0.12, ey - r * 0.3); c.lineTo(ex - r * 0.05, ey + r * 0.22); c.fill();
        c.fillStyle = '#ff6b7a'; heartPath(c, x, y + r * 0.05, r * 0.42); c.fill(); break;
      case 'hide':
        c.fillStyle = '#d7b982'; c.beginPath(); c.moveTo(x, y - r * 0.95); c.lineTo(x + r * 0.8, y - r * 0.6);
        c.quadraticCurveTo(x + r * 0.78, y + r * 0.45, x, y + r * 0.98); c.quadraticCurveTo(x - r * 0.78, y + r * 0.45, x - r * 0.8, y - r * 0.6); c.closePath(); c.fill();
        c.strokeStyle = '#8a6a3a'; c.lineWidth = Math.max(1.4, r * 0.1); c.beginPath(); c.moveTo(x, y - r * 0.6); c.lineTo(x, y + r * 0.6); c.moveTo(x - r * 0.45, y - r * 0.15); c.lineTo(x + r * 0.45, y - r * 0.15); c.stroke(); break;
      case 'dew':
        c.fillStyle = '#8cf0be'; dropPath(c, x - r * 0.1, y + r * 0.05, r * 0.8); c.fill();
        c.fillStyle = '#fff'; star(c, x + r * 0.55, y - r * 0.55, r * 0.32, r * 0.1, 4, 0); c.fill(); break;
      case 'edge':
        c.strokeStyle = '#e8f4ff'; c.lineWidth = Math.max(2.2, r * 0.2); c.beginPath(); c.moveTo(x - r * 0.55, y + r * 0.55); c.lineTo(x + r * 0.75, y - r * 0.75); c.stroke();
        c.strokeStyle = '#ffc878'; c.lineWidth = Math.max(2, r * 0.16); c.beginPath(); c.moveTo(x - r * 0.62, y + r * 0.05); c.lineTo(x - r * 0.05, y + r * 0.62); c.stroke();
        c.beginPath(); c.moveTo(x - r * 0.5, y + r * 0.5); c.lineTo(x - r * 0.85, y + r * 0.85); c.stroke(); break;
      case 'time':
        c.fillStyle = '#ffdc64'; c.beginPath(); c.arc(x, y, r * 0.45, 0, TAU); c.fill();
        c.strokeStyle = '#ffdc64'; c.lineWidth = Math.max(1.6, r * 0.12);
        for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); c.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); c.stroke(); } break;
      case 'blast':
        c.fillStyle = '#ff8cbe'; star(c, x, y, r * 0.98, r * 0.45, 8, 0.2); c.fill();
        c.fillStyle = '#ffe36a'; star(c, x, y, r * 0.5, r * 0.24, 8, 0.6); c.fill(); break;
    }
    c.restore();
  }
  function hearts(c, s, y) {
    const n = maxLives(s);
    for (let i = 0; i < n; i++) { c.fillStyle = i < A.lives ? '#ff6b7a' : 'rgba(255,255,255,0.15)'; heartPath(c, W / 2 + (i - (n - 1) / 2) * 26, y - 7, 9); c.fill(); }
  }
  function drawBoonPick(c) {
    const o = A.offer, st = o.stage, rgb = STAGE_RGB[st];
    bg(c, rgb);
    c.textAlign = 'center';
    c.fillStyle = `rgb(${rgb})`; c.font = 'bold 15px system-ui'; c.fillText(`BEFORE STAGE ${st}`, W / 2, 140);
    c.fillStyle = '#fff'; c.font = 'bold 34px Georgia, serif'; c.fillText('Choose a boon', W / 2, 184);
    c.fillStyle = 'rgba(255,255,255,0.65)'; c.font = '14px system-ui'; c.fillText('It lasts the whole stage', W / 2, 212);
    o.ids.forEach((id, i) => {
      const b = BOONS.find(q => q.id === id), y = 262 + i * 136, k = Math.min(1, Math.max(0, (modeT - i * 0.12) / 0.35));
      c.globalAlpha = k;
      c.beginPath(); c.roundRect(30, y, W - 60, 116, 18); c.fillStyle = `rgba(${b.rgb},0.12)`; c.fill();
      c.strokeStyle = `rgba(${b.rgb},0.75)`; c.lineWidth = 2; c.stroke();
      c.fillStyle = `rgba(${b.rgb},0.18)`; c.beginPath(); c.arc(88, y + 58, 34, 0, TAU); c.fill();
      icon(c, b.id, 88, y + 58, 24);
      c.textAlign = 'left'; c.fillStyle = `rgb(${b.rgb})`; c.font = 'bold 21px Georgia, serif'; c.fillText(b.name, 138, y + 50);
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '14px system-ui';
      const words = b.text.split(' '); let line = '', ly = y + 76;
      for (const w of words) { if (c.measureText(line + w).width > 200 && line) { c.fillText(line.trim(), 138, ly); line = ''; ly += 19; } line += w + ' '; }
      c.fillText(line.trim(), 138, ly);
      c.textAlign = 'center'; c.globalAlpha = 1;
    });
  }
  function drawMap(c) {
    const s = view, rgb = STAGE_RGB[s], cur = A.stage === s;
    bg(c, rgb);
    c.textAlign = 'center';
    // header
    c.fillStyle = `rgb(${rgb})`; c.font = 'bold 15px system-ui'; c.fillText(`STAGE ${s}`, W / 2, 74);
    c.fillStyle = '#fff'; c.font = 'bold 26px Georgia, serif'; c.fillText(stageName(s), W / 2, 104);
    const bn = boonOf(s);
    c.fillStyle = 'rgba(255,230,160,0.9)'; c.font = '14px system-ui';
    c.fillText(`★ ${stageStars(s)} / 30` + (bn ? `   ·   ${bn.name}` : ''), W / 2, 128);
    const canPrev = s > 1, canNext = s < (unlockAll() ? 10 : A.maxStage);
    c.font = 'bold 34px system-ui';
    c.fillStyle = canPrev ? '#fff' : 'rgba(255,255,255,0.15)'; c.fillText('‹', 40, 106);
    c.fillStyle = canNext ? '#fff' : 'rgba(255,255,255,0.15)'; c.fillText('›', W - 40, 106);
    // path
    c.strokeStyle = `rgba(${rgb},0.25)`; c.lineWidth = 5; c.setLineDash([2, 10]); c.lineCap = 'round';
    c.beginPath();
    for (let r = 1; r <= 10; r++) { const p = nodePos(r); r === 1 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y); }
    c.stroke(); c.setLineDash([]);
    for (let r = 1; r <= 10; r++) {
      const R = ROUNDS[r - 1], p = nodePos(r), st = A.stars[starKey(s, r)] || 0;
      const isCur = cur && A.round === r, done = st > 0, ok = built(R);
      const pulse = isCur ? 1 + 0.08 * Math.sin(t * 5) : 1;
      if (isCur) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.fillStyle = `rgba(${R.rgb},0.5)`; c.beginPath(); c.arc(p.x, p.y, 36 * pulse, 0, TAU); c.fill(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
      c.beginPath(); c.arc(p.x, p.y, 25 * pulse, 0, TAU);
      c.fillStyle = ok ? (done || isCur ? `rgba(${R.rgb},0.35)` : 'rgba(255,255,255,0.07)') : 'rgba(255,255,255,0.03)'; c.fill();
      c.strokeStyle = ok ? `rgba(${R.rgb},${done || isCur ? 0.95 : 0.4})` : 'rgba(255,255,255,0.15)'; c.lineWidth = isCur ? 3 : 2; c.stroke();
      c.globalAlpha = ok ? 1 : 0.35; icon(c, R.id, p.x, p.y, 14 * pulse); c.globalAlpha = 1; c.textBaseline = 'middle';
      const left = p.x > W / 2;                             // label on the roomy side
      c.textAlign = left ? 'right' : 'left';
      const lx = p.x + (left ? -36 : 36);
      c.fillStyle = ok ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.35)'; c.font = 'bold 13.5px system-ui';
      c.fillText(`${r}. ${R.name}`, lx, p.y - 7);
      c.font = '12px system-ui';
      if (!ok) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillText('coming soon', lx, p.y + 11); }
      else { c.fillStyle = '#ffd86b'; c.fillText('★'.repeat(st) + '☆'.repeat(3 - st), lx, p.y + 11); }
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    }
    // lives + play
    const by = 776;
    if (cur) hearts(c, s, by - 22);
    const label = cur ? (A.round === 1 ? `Start Stage ${s}` : `Play Round ${A.round}`) : `Start Stage ${s}`;
    pill(c, W / 2 - 110, by - 6, 220, 52, `rgba(${rgb},0.92)`);
    c.fillStyle = '#071828'; c.font = 'bold 19px system-ui'; c.textBaseline = 'middle'; c.fillText(label + '  ›', W / 2, by + 20); c.textBaseline = 'alphabetic';
    if (unlockAll()) { c.fillStyle = 'rgba(255,255,255,0.4)'; c.font = '11.5px system-ui'; c.fillText('test build: tap any round to play it', W / 2, by + 62); }
    if (toastT > 0) {
      c.globalAlpha = Math.min(1, toastT * 2);
      pill(c, W / 2 - 120, 140, 240, 34, 'rgba(0,0,0,0.65)', `rgba(${rgb},0.6)`);
      c.fillStyle = '#fff'; c.font = 'bold 14px system-ui'; c.textBaseline = 'middle'; c.fillText(toast, W / 2, 157); c.textBaseline = 'alphabetic';
      c.globalAlpha = 1;
    }
  }
  function drawCard(c) {                                       // the NES round card
    const { s, r } = pending, R = ROUNDS[r - 1];
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const k = Math.min(1, modeT / 0.35);
    c.globalAlpha = k; c.textAlign = 'center';
    c.fillStyle = `rgb(${STAGE_RGB[s]})`; c.font = 'bold 22px system-ui'; c.fillText(`STAGE ${s}`, W / 2, H / 2 - 120);
    c.fillStyle = '#fff'; c.font = 'bold 54px Georgia, serif'; c.fillText(`ROUND ${r}`, W / 2, H / 2 - 62);
    icon(c, R.id, W / 2, H / 2 + 6, 40);
    c.fillStyle = `rgb(${R.rgb})`; c.font = 'bold 26px Georgia, serif'; c.fillText(R.name, W / 2, H / 2 + 86);
    hearts(c, s, H / 2 + 132);
    const bn = boonOf(s);
    if (bn) { c.fillStyle = '#ffd86b'; c.font = '15px system-ui'; c.fillText(bn.name, W / 2, H / 2 + 170); }
    c.globalAlpha = 1;
  }
  function drawOver(c) {
    bg(c, '230,80,90');
    c.textAlign = 'center';
    c.fillStyle = '#ff6b6b'; c.font = 'bold 52px Georgia, serif'; c.fillText('GAME OVER', W / 2, 330);
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '16px system-ui'; c.fillText(`Stage ${view} starts again from round 1`, W / 2, 372);
    if (modeT > 0.8) {
      pill(c, W / 2 - 110, 430, 220, 52, 'rgba(93,202,165,0.92)');
      c.fillStyle = '#071828'; c.font = 'bold 19px system-ui'; c.textBaseline = 'middle'; c.fillText('Continue  ›', W / 2, 456);
      pill(c, W / 2 - 70, 500, 140, 40, 'rgba(255,255,255,0.12)');
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.font = '15px system-ui'; c.fillText('Map', W / 2, 520); c.textBaseline = 'alphabetic';
    }
  }
  function drawClear(c) {
    const s = view;
    bg(c, STAGE_RGB[s]);
    c.textAlign = 'center';
    c.fillStyle = '#ffd86b'; c.font = 'bold 22px system-ui'; c.fillText(`STAGE ${s}`, W / 2, 280);
    c.fillStyle = '#fff'; c.font = 'bold 50px Georgia, serif'; c.fillText('CLEAR!', W / 2, 334);
    c.fillStyle = '#ffd86b'; c.font = '20px system-ui'; c.fillText(`★ ${stageStars(s)} / 30`, W / 2, 374);
    for (let i = 0; i < 24; i++) {                             // a burst of light
      const a = i / 24 * TAU + t * 0.4, rr = 90 + 30 * Math.sin(t * 2 + i);
      c.globalAlpha = 0.5; c.fillStyle = `rgba(${STAGE_RGB[s]},1)`;
      c.beginPath(); c.arc(W / 2 + Math.cos(a) * rr * 1.6, 330 + Math.sin(a) * rr, 3, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    if (modeT > 1) {
      const last = s >= 10;
      pill(c, W / 2 - 110, 440, 220, 52, `rgba(${STAGE_RGB[Math.min(10, s + 1)]},0.92)`);
      c.fillStyle = '#071828'; c.font = 'bold 19px system-ui'; c.textBaseline = 'middle';
      c.fillText(last ? 'The Bloom is yours  ›' : `Stage ${s + 1}  ›`, W / 2, 466); c.textBaseline = 'alphabetic';
    }
  }
  let last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (screenHidden('s-adventure')) { last = ts; return; }
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    t += dt; modeT += dt; toastT = Math.max(0, toastT - dt);
    cx = hiDPI(cv, W, H);
    if (mode === 'card') { drawCard(cx); if (modeT > 1.5 && !busy) { mode = 'map'; launch(pending.s, pending.r); } }
    else if (mode === 'over') drawOver(cx);
    else if (mode === 'clear') drawClear(cx);
    else if (mode === 'boon') { if (A.offer) drawBoonPick(cx); else mode = 'map'; }
    else drawMap(cx);
  }
  requestAnimationFrame(frame);

  // ── input ──
  function pos(e) {
    const r = cv.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * W / r.width, y: (p.clientY - r.top) * H / r.height };
  }
  function tap(e) {
    e.preventDefault();
    if (busy || mode === 'card') return;
    const { x, y } = pos(e);
    if (mode === 'over') {
      if (modeT < 0.8) return;
      if (y > 430 && y < 482 && Math.abs(x - W / 2) < 110) { mode = 'map'; playRound(view, 1); }
      else if (y > 500 && y < 540 && Math.abs(x - W / 2) < 70) mode = 'map';
      return;
    }
    if (mode === 'clear') {
      if (modeT < 1) return;
      if (y > 440 && y < 492 && Math.abs(x - W / 2) < 110) {
        if (A.offer) { mode = 'boon'; modeT = 0; } else { mode = 'map'; view = A.stage; }
      }
      return;
    }
    if (mode === 'boon') {
      if (modeT < 0.5 || !A.offer) return;
      A.offer.ids.forEach((id, i) => { const yy = 262 + i * 136; if (y > yy && y < yy + 116 && x > 30 && x < W - 30) takeBoon(id); });
      return;
    }
    if (y > 70 && y < 130) {                                   // stage arrows
      const max = unlockAll() ? 10 : A.maxStage;
      if (x < 80 && view > 1) view--;
      else if (x > W - 80 && view < max) view++;
      return;
    }
    if (y > 768 && y < 824 && Math.abs(x - W / 2) < 110) {     // play
      if (A.stage !== view) { A.stage = view; A.round = 1; fresh(view); save(); }
      playRound(view, A.round);
      return;
    }
    for (let r = 1; r <= 10; r++) {                            // a round node
      const p = nodePos(r);
      if (Math.hypot(x - p.x, y - p.y) < 30) {
        const done = (A.stars[starKey(view, r)] || 0) > 0;
        if (unlockAll() || done || (A.stage === view && A.round === r)) {
          if (A.stage !== view) { A.stage = view; fresh(view); }
          playRound(view, r);
        } else flash('Clear the rounds before it first');
        return;
      }
    }
  }
  cv.addEventListener('mousedown', tap);
  cv.addEventListener('touchstart', tap, { passive: false });

  window.DABAdventure = {
    ROUNDS, POND,
    open() { view = A.stage; mode = A.offer ? 'boon' : 'map'; modeT = 0; goTo('s-adventure'); if (window.DABAudio) DABAudio.music('music_pond'); },
    state: () => JSON.parse(JSON.stringify(A)),
    reset() { A = { v: 1, stage: 1, round: 1, lives: 3, maxStage: 1, stars: {} }; save(); view = 1; },
    play: playRound,                                            // test hook: DABAdventure.play(stage, round)
    clearStage: s => stageClear(s),                             // test hook: as if round 10 of stage s was won
    BOONS, boon: s => boonOf(s), take: id => A.offer && takeBoon(id),
  };
})();
