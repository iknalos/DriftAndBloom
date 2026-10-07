// ============================================================================
// Drift & Bloom — ADVENTURE (the main run): 10 stages x 10 rounds = 100.
// Every stage plays the same ten games in the same order, each one harder than in the stage
// before (the stage number is the game's level 1..10). Lose a round: a life; lose all three:
// the stage starts over. Clear round 10 and the next stage opens. Games not built yet are skipped.
//
// Round games are DABWorlds worlds (worlds/*.js) entered with { level, badge, round: true },
// except round 1, a pond level from the matching Classic stage (game.html, window.__pondRound).
// Progress: localStorage 'dab_adv'.
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

  const KEY = 'dab_adv';
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* fresh */ }
    s = s && s.v === 1 ? s : { v: 1, stage: 1, round: 1, lives: 3, maxStage: 1, stars: {} };
    return s;
  }
  let A = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(A)); } catch (e) { /* private mode */ } };
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
  let mode = 'map';               // map | card | over | clear
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
    const R = ROUNDS[r - 1], badge = `STAGE ${s} · ROUND ${r}`;
    busy = true;
    if (R.id === 'pond') {
      window.__pondRound = { badge, stage: s, onEnd: res => { window.__pondRound = null; goTo('s-adventure'); result(s, r, res); } };
      startLevel(POND[s]);
      return;
    }
    DABWorlds.enter(R.id, { charId: selectedChar, reason: '', level: s, badge, round: true, music: 'music_pond' })
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
    A.lives--;
    if (A.lives <= 0) { mode = 'over'; modeT = 0; A.round = 1; A.lives = 3; save(); if (window.DABAudio) DABAudio.play('lose', { jitter: 0 }); return; }
    save();
    flash(A.lives === 1 ? 'Last life!' : A.lives + ' lives left');
  }
  function stageClear(s) {
    A.maxStage = Math.max(A.maxStage, Math.min(10, s + 1));
    A.stage = Math.min(10, s + 1); A.round = 1; A.lives = 3; save();
    mode = 'clear'; modeT = 0; view = s;
    if (window.DABAudio) DABAudio.play('win', { jitter: 0 });
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
  function drawMap(c) {
    const s = view, rgb = STAGE_RGB[s], cur = A.stage === s;
    bg(c, rgb);
    c.textAlign = 'center';
    // header
    c.fillStyle = `rgb(${rgb})`; c.font = 'bold 15px system-ui'; c.fillText(`STAGE ${s}`, W / 2, 74);
    c.fillStyle = '#fff'; c.font = 'bold 26px Georgia, serif'; c.fillText(stageName(s), W / 2, 104);
    c.fillStyle = 'rgba(255,230,160,0.9)'; c.font = '14px system-ui'; c.fillText(`★ ${stageStars(s)} / 30`, W / 2, 128);
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
      c.globalAlpha = ok ? 1 : 0.35; c.font = '22px system-ui'; c.textBaseline = 'middle'; c.fillText(R.icon, p.x, p.y + 1); c.globalAlpha = 1;
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
    if (cur) {
      c.font = '20px system-ui';
      for (let i = 0; i < 3; i++) { c.fillStyle = i < A.lives ? '#ff6b7a' : 'rgba(255,255,255,0.15)'; c.fillText('♥', W / 2 - 24 + i * 24, by - 22); }
    }
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
    c.font = '64px system-ui'; c.fillText(R.icon, W / 2, H / 2 + 26);
    c.fillStyle = `rgb(${R.rgb})`; c.font = 'bold 26px Georgia, serif'; c.fillText(R.name, W / 2, H / 2 + 86);
    c.font = '20px system-ui';
    for (let i = 0; i < 3; i++) { c.fillStyle = i < A.lives ? '#ff6b7a' : 'rgba(255,255,255,0.15)'; c.fillText('♥', W / 2 - 24 + i * 24, H / 2 + 132); }
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
      if (y > 440 && y < 492 && Math.abs(x - W / 2) < 110) { mode = 'map'; view = A.stage; }
      return;
    }
    if (y > 70 && y < 130) {                                   // stage arrows
      const max = unlockAll() ? 10 : A.maxStage;
      if (x < 80 && view > 1) view--;
      else if (x > W - 80 && view < max) view++;
      return;
    }
    if (y > 768 && y < 824 && Math.abs(x - W / 2) < 110) {     // play
      if (A.stage !== view) { A.stage = view; A.round = 1; A.lives = 3; save(); }
      playRound(view, A.round);
      return;
    }
    for (let r = 1; r <= 10; r++) {                            // a round node
      const p = nodePos(r);
      if (Math.hypot(x - p.x, y - p.y) < 30) {
        const done = (A.stars[starKey(view, r)] || 0) > 0;
        if (unlockAll() || done || (A.stage === view && A.round === r)) {
          if (A.stage !== view) { A.stage = view; A.lives = 3; }
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
    open() { view = A.stage; mode = 'map'; goTo('s-adventure'); if (window.DABAudio) DABAudio.music('music_pond'); },
    state: () => JSON.parse(JSON.stringify(A)),
    reset() { A = { v: 1, stage: 1, round: 1, lives: 3, maxStage: 1, stars: {} }; save(); view = 1; },
    play: playRound,                                            // test hook: DABAdventure.play(stage, round)
  };
})();
