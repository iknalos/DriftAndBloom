// ============================================================================
// Drift & Bloom — THE INK DOOR (Adventure round 5). Trick rooms in the spirit of That Level Again.
// A small ink ronin with a red scarf, one red door per room, ink-wash paper. The door never opens the
// same way twice: find the key, knock, wait, walk out the way you came, drag the door down, fail on
// purpose, count, blow the lamp out, draw a bridge, rub out a wall, turn the world over, make it night,
// pause the game, stamp the seal, make it rain, let your last attempt hold the plate... Every death
// leaves an ink splat that stays on the page. The room's name is a clue, not an answer. Later pages stack
// tricks, punish overshooting (exact counts), hide what you need (under ink, under a crate) and plant decoys
// (a key that bites, a door that's painted on). Notes appear late on early pages and never from page set 8 on.
//
// A room = an ASCII map (32 x 15 tiles of 26 px) + setup(R) (the R api below) + a hint + a bot route.
//   .  paper        #  ink ground     S  start     D  the red door (locked until the trick)
//   ^ v < >  ink thorns   A-Z (not S/D) hidden thorns   a-z (not v) ground that moves   ~ fake
//   +  invisible ground   %  an ink wall you can rub out   $  key   &  crate   !  lantern   _  plate
// Test: game.html?world=ink&lv=4 (&room=2); window.__inkBot = true runs each room's bot route.
// ============================================================================
(function () {
  'use strict';
  const T = 26, COLS = 32, ROWS = 15, RW = COLS * T, RH = ROWS * T, TAU = Math.PI * 2;
  const RUN = 172, ACC = 2300, DEC = 3000, AIR_ACC = 1700, AIR_DEC = 260;
  const G_UP = 1750, G_DN = 2700, JUMP_V = 485, CUT = 0.42, MAXF = 780, COYOTE = 0.08, BUFFER = 0.12;
  const PW = 12, PH = 22;
  const INK = '#15120f', PAPER = '#ece3cf', RED = '#b8322a';
  const E = '.'.repeat(32), G = '#'.repeat(32);
  const fill = (n, s) => Array(n).fill(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const EASE = { lin: k => k, io: k => k * k * (3 - 2 * k), in: k => k * k, out: k => 1 - (1 - k) * (1 - k) };
  function hr(x, y, k) { let h = (x * 374761393 + y * 668265263 + (k || 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ── the rooms ───────────────────────────────────────────────────────────
  const STAGES = [null,
    // ── Stage 1
    [
      { name: 'The red door', t: 70, hint: 'Take the key. Then mind where you walk.',
        map: [...fill(7, E),
          '..............$.................',
          '............=====...............',
          E,
          '.S......##..............BB...D..',
          '############~~##################',
          ...fill(3, '############..##################')],
        setup(R) { R.when(() => R.hasKey, () => R.pop('B')); },
        bot: [['jumpAt', 7.2, 0.2], ['land'], ['go', 10.1], ['dir', 1], ['jump'], ['land'], ['go', 14.6], ['run', 17.4], ['land'], ['jumpAt', 23.2], ['land'], ['go', 29.5]] },
      { name: 'Knock knock', t: 70, hint: 'Say the title out loud. Exactly.',
        map: [...fill(10, E),
          '.S.........^^...............D...',
          ...fill(4, G)],
        setup(R) { R.sign(25, 10, 'WHO’S THERE?'); R.onKnock(2, () => R.unlock(), { exact: true }); },
        bot: [['jumpAt', 10.3], ['land'], ['go', 26.0], ['tap', 28.5, 9.6], ['wait', 0.25], ['tap', 28.5, 9.6], ['wait', 1.4], ['go', 28.5]] },
      { name: 'Patience', t: 70, hint: 'Be still. Not under those.',
        map: [...fill(4, E),
          '....................##########..',
          '....................AAAAAAAAAA..',
          ...fill(4, E),
          '.S..........................D...',
          ...fill(4, G)],
        setup(R) {
          R.show('A'); R.cat(26, 10);
          R.onStill(4, () => { R.wakeCat(); R.unlock(); }, { far: 9 });
          R.stillTrap('A', 1.2, 19.6, 30);
        },
        bot: [['go', 12], ['wait', 4.6], ['go', 28.5]] }
    ],
    // ── Stage 2
    [
      { name: 'Heavy lifting', t: 85, hint: 'Not every key is a key. What was the box sitting on?',
        map: [...fill(7, E),
          '......................$.........',
          ...fill(2, '...................####.........'),
          '.S.....&...........####.....D...',
          ...fill(4, G)],
        setup(R) { R.fakeKey(0); R.keyUnder(0); },
        bot: [['go', 7.6], ['go', 17.6], ['dir', 1], ['jump'], ['land'], ['dir', 1], ['jump'], ['land'], ['jumpAt', 21.5], ['land'], ['go', 28.5]] },
      { name: 'The way you came', t: 70, hint: 'Not every way out is ahead of you.',
        map: [...fill(10, E),
          '.BB.S...........^^.........D....',
          ...fill(4, G)],
        setup(R) { R.painted(); R.edgeExit('left'); R.sign(7, 10, 'EXIT  →'); R.when(R.at(7.0), () => R.pop('B')); },
        bot: [['go', 7.5], ['jumpAt', 3.5], ['land']] },
      { name: 'Bring it down', t: 75, hint: 'Your finger is part of the game. Drag the door.',
        map: [...fill(3, E),
          '..........................D.....',
          '........................######..',
          ...fill(5, E),
          '.S..............................',
          ...fill(4, '############...#################')],
        setup(R) { R.dragDoor(); },
        bot: [['jumpAt', 11.8], ['land'], ['drag', 26.5, 3.4, 20.5, 9.2, 0.5], ['wait', 1.0], ['go', 20.5]] }
    ],
    // ── Stage 3
    [
      { name: 'Third time lucky', t: 80, hint: 'Some doors want you to fail. More than once.',
        map: [...fill(10, E),
          '.S......^^....................D.',
          ...fill(4, G)],
        setup(R) { R.sign(5, 10, 'DON’T DIE'); if (R.roomDeaths >= 2) R.unlock(); else if (R.roomDeaths === 1) R.say('Still locked. Again?'); },
        bot: R => (R.roomDeaths < 2 ? [['go', 8.6], ['wait', 2]] : [['jumpAt', 7.1], ['land'], ['go', 30.5]]) },
      { name: 'Jump for it', t: 80, hint: 'Count the marks. Then count your jumps. Exactly.',
        map: [...fill(6, E),
          '................################',
          '................vvvvvvvvvvvvvvvv',
          E, E,
          '.S............................D.',
          ...fill(4, G)],
        setup(R) { R.tally(10, { exact: true }); },
        bot: [['go', 5], ...Array.from({ length: 10 }, () => [['jump', 0.1], ['land'], ['wait', 0.05]]).flat(), ['go', 30.5]] },
      { name: 'Lights out', t: 80, hint: 'Some things only show in the dark. The dark doesn’t last.',
        map: [...fill(3, E),
          '..........!.....................',
          ...fill(6, E),
          '.S..........................D...',
          ...fill(4, '##################...###########')],
        setup(R) { R.darkDoor(); R.lampTimer(3, { once: true }); },
        bot: [['jumpAt', 17.8], ['land'], ['go', 26.0], ['tap', 10.5, 3.5], ['wait', 0.4], ['go', 28.5]] }
    ],
    // ── Stage 4
    [
      { name: 'Mind the gap', t: 85, hint: 'You hold the brush. Ink dries fast.',
        map: [...fill(10, E),
          '.S.................B........D...',
          ...fill(4, '#########.........##############')],
        setup(R) { R.ink(11, 2.4); R.free(); R.when(R.at(17.2), () => R.pop('B')); },
        bot: [['go', 8.4], ['draw', [[8.5, 11.05], [18.5, 11.05]], 0.5], ['go', 17.6], ['jumpAt', 17.9], ['land'], ['go', 28.5]] },
      { name: 'In the way', t: 80, hint: 'Ink can be wiped away. Hurry.',
        map: [...fill(5, E),
          ...fill(5, '..................%%............'),
          '.S................%%...B....D...',
          ...fill(4, G)],
        setup(R) { R.free(); R.crumble(0, 17, 3.0, 1.5); R.when(R.at(20.6), () => R.pop('B')); },
        bot: [['go', 16.6], ['rub', 18, 5, 2, 6, 1.4], ['wait', 0.3], ['go', 21.0], ['jumpAt', 21.6], ['land'], ['go', 28.5]] },
      { name: 'Upside down', t: 85, hint: 'Swipe up. Mind the holes in the sky.',
        map: [...fill(2, '###############..###############'),
          '..........vv..............D.....',
          ...fill(7, E),
          '.S..............................',
          ...fill(4, G)],
        setup(R) { R.free(); R.swipeGravity(); },
        bot: [['swipe', 'up'], ['until', (R, P) => P.flipped && P.ground], ['jumpAt', 9.3], ['land'], ['jumpAt', 14.0], ['land'], ['go', 26.5]] }
    ],
    // ── Stage 5
    [
      { name: 'In order', t: 85, hint: 'The scroll reads the other way.',
        map: [...fill(3, E),
          '........!......!......!.........',
          ...fill(6, E),
          '.S..........................D...',
          ...fill(4, G)],
        setup(R) { R.lampOrder(['star', 'moon', 'sun'], ['moon', 'sun', 'star'], { reverse: true }); },
        bot: [['tap', 15.5, 3.5], ['wait', 0.3], ['tap', 22.5, 3.5], ['wait', 0.3], ['tap', 8.5, 3.5], ['wait', 0.5], ['go', 28.5]] },
      { name: 'Shy', t: 85, hint: 'It runs when you look at it. Let something else carry you.',
        map: [...fill(10, E),
          '.S....................D.........',
          ...fill(4, G)],
        setup(R) { R.belt(6, 27, 11, 2.6); R.shyDoor(); },
        bot: [['go', 6.6], ['dir', -1], ['wait', 0.06], ['dir', 0], ['wait', 9]] },
      { name: 'Night', t: 85, hint: 'Night changes more than the door.',
        map: [...fill(10, E),
          '.S..........................D...',
          '###########dddddd###############',
          ...fill(3, '###########......###############')],
        setup(R) { R.sunNight(27.5, 2.0); R.dayOnly('d'); },
        bot: [['go', 20], ['drag', 27.5, 2.0, 27.5, 12.6, 0.6], ['wait', 1.4], ['go', 28.5]] }
    ],
    // ── Stage 6
    [
      { name: 'Steps of the fallen', t: 100, hint: 'Your mistakes stay on the page. Stand on them. Twice.',
        map: [...fill(7, E),
          ...fill(2, '..................##............'),
          '.................<##............',
          '.S...............^##........D...',
          ...fill(4, G)],
        setup(R) { R.splatsSolid(); R.free(); },
        bot: R => (R.splats.length === 0 ? [['go', 17.6], ['wait', 2]]
          : R.splats.length === 1 ? [['go', 16.0], ['dir', 1], ['jump', 0.13], ['wait', 2]]
            : [['go', 15.6], ['dir', 1], ['jump', 0.2], ['land'], ['go', 17.5], ['dir', 1], ['jump'], ['land'], ['go', 28.5]]) },
      { name: 'Read the title', t: 85, hint: 'Words can hide things. Catch what falls.',
        map: [...fill(10, E),
          '.S..........................D...',
          ...fill(4, '###############...##############')],
        setup(R) { R.titleKey(16, 3.4); R.ink(5, 3.0); },
        bot: [['go', 14.4], ['draw', [[14.4, 10.95], [18.6, 10.95]], 0.4], ['drag', 16, 3.3, 26, 1.4, 0.5], ['wait', 0.5], ['go', 17.6], ['go', 28.5]] },
      { name: 'Count', t: 90, hint: 'Count every crane. Knock that many times.',
        map: [...fill(10, E),
          '.S........................CCD...',
          ...fill(4, G)],
        setup(R) { R.cranes(7, { seq: true }); R.onKnock(7, () => R.unlock(), { exact: true, punish: () => { R.pop('C'); R.after(1.2, () => R.hide('C')); } }); },
        bot: [['go', 22], ['wait', 1.0], ...Array.from({ length: 7 }, () => [['tap', 28.5, 9.6], ['wait', 0.2]]).flat(), ['wait', 1.4], ['go', 28.5]] }
    ],
    // ── Stage 7
    [
      { name: 'When nobody is looking', t: 85, hint: 'Pause it. Then look again.',
        map: [...fill(10, E),
          '.S..............AA......BB..D...',
          ...fill(4, G)],
        setup(R) { R.show('A'); R.onPause(() => { R.unlock(); R.hide('A'); R.pop('B'); }); },
        bot: [['pause', 0.6], ['wait', 0.3], ['jumpAt', 23.5], ['land'], ['go', 28.5]] },
      { name: 'Seal it', t: 85, hint: 'Every page needs its seal. Look under the ink.',
        map: [E,
          ...fill(2, '.%%.............................'),
          ...fill(7, E),
          '.S.........^^..........^^...D...',
          ...fill(4, G)],
        setup(R) { R.seal(1.6, 1.6); },
        bot: [['rub', 1, 1, 2, 2, 1.0], ['wait', 0.3], ['drag', 1.6, 1.6, 28.5, 9.4, 0.6], ['wait', 0.5], ['jumpAt', 10.2], ['land'], ['jumpAt', 22.2], ['land'], ['go', 28.5]] },
      { name: 'Rain', t: 100, hint: 'Plants need water. More than once.',
        map: [...fill(4, E),
          '....................$...........',
          '....................####........',
          ...fill(4, E),
          '.S..........................D...',
          ...fill(4, G)],
        setup(R) { R.rainPlant(15, 11, { times: 2 }); },
        bot: [['until', R => R.cloudOver()], ['tap', -1, -1, 'cloud'], ['wait', 2.4], ['until', R => R.cloudOver()], ['tap', -1, -1, 'cloud'], ['wait', 3.4],
          ['go', 11.8], ['dir', 1], ['jump', 0.25], ['land'], ['go', 14.7], ['dir', 1], ['jump'], ['land'], ['go', 17.7], ['dir', 1], ['jump'], ['land'],
          ['go', 20.6], ['run', 24.5], ['land'], ['go', 28.5]] }
    ],
    // ── Stage 8 (no more notes from here on)
    [
      { name: 'Echo', t: 100, hint: 'Your last try remembers. Restart while standing on the plate.',
        map: [...fill(10, E),
          '.S....._.................BB.D...',
          ...fill(4, G)],
        setup(R) { R.echoGhost(); R.plateDoor(); R.when(() => R.unlocked, () => R.pop('B')); },
        bot: R => (!R.ghostHolds ? [['go', 7.5], ['wait', 4.5], ['restart']] : [['go', 23.0], ['jumpAt', 24.4], ['land'], ['go', 28.5]]) },
      { name: 'Wet ink', t: 85, hint: 'Only wet ink smears. Look for the shine.',
        map: [...fill(8, '.............########...........'),
          E, E,
          '.S............^WWWW^........D...',
          ...fill(4, G)],
        setup(R) { R.wet('W'); R.free(); },
        bot: [['go', 12.0], ['drag', 15.4, 10.6, 18.6, 10.6, 0.6], ['wait', 0.4], ['go', 13.0], ['jumpAt', 13.4], ['land'], ['jumpAt', 18.4], ['land'], ['go', 28.5]] },
      { name: 'Shake it', t: 85, hint: 'Give the page a shake. Then watch your step.',
        map: [...fill(10, E),
          '.S........................B.D...',
          ...fill(4, '#############..#################')],
        setup(R) { R.treeKey(24, 4); R.onShake(4, () => R.dropKey()); R.when(() => R.hasKey, () => R.pop('B')); },
        bot: [['swipe', 'left'], ['wait', 0.12], ['swipe', 'right'], ['wait', 0.12], ['swipe', 'left'], ['wait', 0.12], ['swipe', 'right'], ['wait', 1.2], ['jumpAt', 12.4], ['land'], ['go', 24.5], ['jumpAt', 25.2], ['land'], ['go', 28.5]] }
    ],
    // ── Stage 9
    [
      { name: 'Hold the door', t: 90, hint: 'It slams when you come close. Hold it open with a finger.',
        map: [...fill(10, E),
          '.S..........^^...........BB.D...',
          ...fill(4, G)],
        setup(R) { R.holdDoor(); R.when(R.at(23.0), () => R.pop('B')); },
        bot: [['jumpAt', 11.3], ['land'], ['go', 23.4], ['press', 28.5, 9.6, 3.5], ['jumpAt', 24.4], ['land'], ['go', 28.5], ['wait', 1]] },
      { name: 'Light and dark', t: 90, hint: 'The key likes the light. The door likes the dark.',
        map: [...fill(3, E),
          '.........!......................',
          E, E,
          E,
          '............$...................',
          '...........====.................',
          E,
          '.S.....##...................D...',
          ...fill(4, '###################...##########')],
        setup(R) { R.darkDoor(); R.lightKey(); },
        bot: [['jumpAt', 6.2, 0.2], ['land'], ['go', 9.0], ['dir', 1], ['jump'], ['land'], ['go', 12.6], ['tap', 9.5, 3.5], ['wait', 0.4], ['run', 15.6], ['land'], ['jumpAt', 18.7], ['land'], ['go', 28.5]] },
      { name: 'Everything you learned', t: 110, hint: 'Bridge, wipe, knock. Exactly.',
        map: [...fill(5, E),
          ...fill(5, '....................%%..........'),
          '.S..................%%......D...',
          ...fill(4, '#######........#################')],
        setup(R) { R.ink(10, 2.6); R.onKnock(2, () => R.unlock(), { exact: true }); },
        bot: [['go', 6.4], ['draw', [[6.5, 11.05], [15.5, 11.05]], 0.5], ['go', 17], ['rub', 20, 5, 2, 6, 1.4], ['wait', 0.3], ['go', 26], ['tap', 28.5, 9.6], ['wait', 0.25], ['tap', 28.5, 9.6], ['wait', 1.4], ['go', 28.5]] }
    ],
    // ── Stage 10
    [
      { name: 'Ink runs dry', t: 110, hint: 'There is only so much ink. Draw short, draw twice.',
        map: [...fill(10, E),
          '.S...........B..............D...',
          ...fill(4, '######......###.......##########')],
        setup(R) { R.ink(15.5, 4.5); R.free(); R.when(R.at(12.0), () => R.pop('B')); },
        bot: [['go', 5.4], ['draw', [[5.5, 11.05], [12.4, 11.05]], 0.45], ['go', 12.2], ['draw', [[14.4, 11.05], [22.5, 11.05]], 0.45], ['dir', 1], ['jump'], ['land'], ['go', 28.5]] },
      { name: 'The fallen and the echo', t: 130, hint: 'Fall where it helps. Then let your last try hold the plate.',
        map: [...fill(8, E),
          ...fill(2, '..................##............'),
          '.S.._............^##........D...',
          ...fill(4, G)],
        setup(R) { R.splatsSolid(); R.echoGhost(); R.plateDoor(); },
        bot: R => (!R.splats.length ? [['go', 17.6], ['wait', 2]] : !R.ghostHolds ? [['go', 4.5], ['wait', 5.5], ['restart']]
          : [['go', 15.9], ['dir', 1], ['jump', 0.13], ['land'], ['go', 17.5], ['dir', 1], ['jump'], ['land'], ['go', 28.5]]) },
      { name: 'The last door', t: 140, hint: 'Knock. Be still, far off. Find the seal. And remember the way you came.',
        map: [E,
          ...fill(2, '.............................%%.'),
          ...fill(7, E),
          '.BB.S.......................D...',
          ...fill(4, G)],
        setup(R) {
          R.locks(3); R.seal(30.2, 1.6, true);
          R.onKnock(3, () => R.openLock('knock'), { exact: true });
          R.onStill(3, () => R.openLock('still'), { far: 8 });
          R.onSeal(() => R.openLock('seal'));
          R.onAllLocks(() => { R.painted(); R.edgeExit('left'); R.pop('B'); R.say('Nice try.'); });
        },
        bot: [['go', 26], ['tap', 28.5, 9.6], ['wait', 0.25], ['tap', 28.5, 9.6], ['wait', 0.25], ['tap', 28.5, 9.6], ['wait', 1.4], ['go', 18.0], ['wait', 3.6],
          ['rub', 29, 1, 2, 2, 1.0], ['wait', 0.3], ['drag', 30.2, 1.6, 28.5, 9.4, 0.6], ['wait', 1.0], ['go', 4.2], ['jumpAt', 3.6], ['land']] }
    ]
  ];

  DABWorlds.register('ink', {
    title: 'The Ink Door', color: '200,70,58', opaque: true, hud: 'none',
    landscape: { top: 0, h: RH },
    music: 'music_ink',
    sounds: ['ink_jump', 'ink_land', 'ink_die', 'ink_knock', 'ink_unlock', 'ink_slide', 'ink_key', 'ink_brush', 'ink_erase', 'ink_lamp', 'ink_flip', 'ink_push', 'ink_rain', 'ink_grow', 'ink_stamp', 'ink_wrong', 'ink_exit', 'ink_slam'],
    subtitle: () => 'One red door per page. It never opens the same way twice, and the page lies. Early pages leave a note if you’re stuck; later ones don’t.',
    hint: 'The room’s name is the clue.',
    howto: ['◀ ▶ walk  ·  jump  ·  ↻ restart the page', 'Touch the page too: tap, drag, draw, rub, swipe'],
    rooms: () => STAGES.slice(1).map(st => st.map(r => r.name)),   // Test Lab: room names per level
    controls: { dirs: 'lr', buttons: [{ id: 'jump', icon: 'jump' }, { id: 'special', icon: 'restart' }], layout: 'platform', touch: true },
    create
  });

  // ── parsing ─────────────────────────────────────────────────────────────
  const GROUP = ch => ch >= 'a' && ch <= 'z' && ch !== 'v';
  const SOLIDISH = ch => ch === '#' || ch === '=' || ch === '~' || ch === '%' || GROUP(ch);
  function grid(rows) {
    const g = [];
    for (let y = 0; y < ROWS; y++) { const s = rows[y] || E; if (s.length !== COLS) console.warn('[ink] row', y, 'is', s.length, 'wide:', s); g.push(s.padEnd(COLS, '.').slice(0, COLS).split('')); }
    return g;
  }
  function rowRects(tiles) {
    const out = [], ys = [...new Set(tiles.map(t => t[1]))].sort((a, b) => a - b);
    for (const y of ys) {
      const xs = tiles.filter(t => t[1] === y).map(t => t[0]).sort((a, b) => a - b);
      let s = null, p = null;
      for (const x of xs) { if (s === null) { s = p = x; } else if (x === p + 1) p = x; else { out.push({ x: s * T, y: y * T, w: (p - s + 1) * T, h: T }); s = p = x; } }
      if (s !== null) out.push({ x: s * T, y: y * T, w: (p - s + 1) * T, h: T });
    }
    return out;
  }
  function mover(o) { return Object.assign(o, { ox: 0, oy: 0, q: [], cur: null }); }
  function stepMover(o, dt) {
    for (let guard = 0; guard < 6; guard++) {
      if (!o.cur) { if (!o.q.length) break; o.cur = o.q.shift(); o.cur.t = 0; o.cur.fx = o.ox; o.cur.fy = o.oy; o.cur.fe = o.ext; }
      const e = o.cur;
      if (e.k === 'fn') { o.cur = null; e.fn(); continue; }
      e.t += dt; const k = e.dur ? Math.min(1, e.t / e.dur) : 1, kk = EASE[e.ease || 'io'](k);
      if (e.k === 'to') { o.ox = e.fx + (e.x - e.fx) * kk; o.oy = e.fy + (e.y - e.fy) * kk; }
      else if (e.k === 'ext') o.ext = e.fe + (e.to - e.fe) * kk;
      if (k >= 1) o.cur = null; else break;
    }
  }

  function create(env) {
    const LV = env.level, fx = env.fx;
    const sfx = (n, o) => env.sfx(n, o);
    const rooms = STAGES[Math.max(1, Math.min(STAGES.length - 1, LV))];
    const q = new URLSearchParams(location.search);
    let ri = Math.max(0, Math.min(rooms.length - 1, (env.startRoom || +q.get('room') || 1) - 1));
    let timeLeft = rooms.reduce((s, r) => s + (r.t || 70), 0) + 10, deaths = 0, hints = 0, t = 0, done = false;
    let R = null, P = null, introT = 0, msg = '', msgT = 0, fade = 1, fadeDir = -1, nextAfterFade = null, deadT = 0;
    let persist = null;                                    // survives deaths / restarts inside one room
    const bake = { bg: null, room: null, K: 0 };
    const bot = { i: 0, t: 0, dir: 0, hold: 0, press: false, init: false, steps: [], finger: null, ptap: [], pswipe: [], pressT: 0, pauseT: 0 };
    let finger = null;                                     // the live touch on the page (room px), its mode
    let pauseStart = 0, pausedFor = 0;
    if (window.DABAudio) DABAudio.music('music_ink', { restart: true, xf: 0.6 });

    // ── a room ────────────────────────────────────────────────────────────
    function build(def) {
      const g = grid(def.map);
      const r = {
        def, g, t: 0, gdir: 1, dark: false, darkA: 0, night: false, nightA: 0, rules: [], timers: [], ticks: [],
        bodies: {}, blist: [], spikes: {}, slist: [], door: null, keys: [], crates: [], lamps: [], plates: [], belts: [], signs: [],
        erasers: [], strokes: [], inkMax: 0, inkLeft: 0, inkLife: 5, title: null, sun: null, seal: null, cloud: null, plant: null, cat: null, cranes: 0,
        knock: null, still: null, pauseFn: null, shake: null, swipeUp: true, tally: 0, jumpsLeft: 0, edge: null, holdDoor: false, shy: false,
        lockSet: null, sealFn: null, allLocksFn: null, order: null, plateDoor: false, echo: false, splatSolid: false, wetId: null,
        start: { x: 1.5 * T, y: 11 * T }
      };
      const at = (x, y) => (y < 0 || y >= ROWS || x < 0 || x >= COLS ? '.' : g[y][x]);
      const ground = [], groups = {}, spk = {}, fake = [], ghost = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const ch = g[y][x], cx = (x + 0.5) * T;
        if (ch === '#' || ch === '=') ground.push([x, y]);
        else if (GROUP(ch)) (groups[ch] = groups[ch] || []).push([x, y]);
        else if (ch === '~') fake.push([x, y]);
        else if (ch === '+') ghost.push([x, y]);
        else if (ch === '%') r.erasers.push({ x: x * T, y: y * T, rub: 0, alive: true, tx: x, ty: y });
        else if (ch === 'S') r.start = { x: cx, y: (y + 1) * T };
        else if (ch === 'D') {
          const hang = !SOLIDISH(at(x, y + 1)) && SOLIDISH(at(x, y - 1));
          r.door = { x: cx, y: hang ? y * T : (y + 1) * T, hang, locked: true, alpha: 1, ox: 0, oy: 0, vy: 0, knockFx: 0, open: 0, slam: 0, held: false, painted: false, darkOnly: false, nightOnly: false, drag: false, shyT: 0 };
        }
        else if (ch === '$') r.keys.push({ x: cx, y: (y + 0.5) * T, carried: false, alive: true, vy: 0, hidden: false, falls: false, bob: Math.random() * 6 });
        else if (ch === '&') r.crates.push({ x: x * T, y: y * T, vy: 0 });
        else if (ch === '!') r.lamps.push({ x: cx, y: (y + 0.5) * T, on: true, sym: null, lit: 0 });
        else if (ch === '_') r.plates.push({ x: cx, y: (y + 1) * T, down: false });
        else if ('^v<>'.includes(ch)) (spk._ = spk._ || []).push({ x, y, dir: { '^': 'up', 'v': 'down', '<': 'left', '>': 'right' }[ch] });
        else if (ch >= 'A' && ch <= 'Z') {
          const dir = SOLIDISH(at(x, y + 1)) ? 'up' : SOLIDISH(at(x, y - 1)) ? 'down' : SOLIDISH(at(x - 1, y)) ? 'right' : SOLIDISH(at(x + 1, y)) ? 'left' : 'up';
          (spk[ch] = spk[ch] || []).push({ x, y, dir });
        }
      }
      const body = (id, tiles, kind) => {
        const b = mover({ id, kind, tiles, rects: rowRects(tiles), solid: kind !== 'fake', visible: kind !== 'ghost', alive: true });
        r.bodies[id] = b; r.blist.push(b); return b;
      };
      body('#', ground, 'ground').static = true;
      for (const k in groups) body(k, groups[k], 'ground');
      if (fake.length) body('~', fake, 'fake');
      if (ghost.length) body('+', ghost, 'ghost');
      for (const k in spk) { const s = mover({ id: k, tiles: spk[k], ext: k === '_' ? 1 : 0, alive: true, harmless: false, wet: false }); r.spikes[k] = s; r.slist.push(s); }
      // the splats of earlier tries stay; as ground if this page says so
      r.api = makeApi(r);
      def.setup && def.setup(r.api);
      if (r.splatSolid) for (const sp of persist.splats) if (sp.tile) {
        body('splat' + sp.tile.x + '_' + sp.tile.y, [[sp.tile.x, sp.tile.y]], 'splat');
        for (const s of r.slist) s.tiles = s.tiles.filter(tl => !(tl.x === sp.tile.x && tl.y === sp.tile.y));
      }
      return r;
    }

    function makeApi(r) {
      const door = () => r.door;
      const api = {
        get roomDeaths() { return persist.deaths; }, get splats() { return persist.splats; }, get hasGhost() { return !!(persist.ghost && persist.ghost.length); },
        at: x => p => p.x >= x, atL: x => p => p.x <= x,
        when(cond, fn) { r.rules.push({ cond, fn, once: true, was: false }); },
        after(sec, fn) { r.timers.push({ t: sec, fn }); },
        tick(fn) { r.ticks.push(fn); },
        pop(id) { const s = r.spikes[id]; if (s) { s.q.push({ k: 'ext', to: 1, dur: 0.06, ease: 'out' }); sfx('ink_slam', { vol: 0.4, rate: 1.6 }); } },
        say(text) { msg = text; msgT = 2.6; },
        sign(x, y, text) { r.signs.push({ x: (x + 0.5) * T, y: (y + 1) * T, text }); },
        unlock() { const d = door(); if (d && d.locked) { d.locked = false; d.unlockFx = 1; sfx('ink_unlock', { vol: 0.8 }); burst(d.x + d.ox, d.y + d.oy - 30, 12, '200,70,58'); } },
        lock() { const d = door(); if (d && !d.locked) { d.locked = true; } },
        painted() { const d = door(); if (d) { d.painted = true; d.locked = true; } },
        edgeExit(side) { r.edge = side; },
        dragDoor() { door().drag = true; door().locked = false; },
        darkDoor() { door().darkOnly = true; if (!r.keys.length) door().locked = false; },
        lightKey() { for (const k of r.keys) k.lightOnly = true; },
        onKnock(n, fn, o) { r.knock = { n, fn, exact: !!(o && o.exact), punish: o && o.punish, count: 0, lastT: -9, done: false }; },
        onStill(sec, fn, o) { r.still = { sec, fn, t: 0, done: false, near: o && o.near, far: o && o.far }; },
        onPause(fn) { r.pauseFn = fn; },
        onShake(n, fn) { r.shake = { n, fn, count: 0, last: null, t: 0, done: false }; },
        onSeal(fn) { r.sealFn = fn; },
        onAllLocks(fn) { r.allLocksFn = fn; },
        locks(n) { r.lockSet = { need: n, open: {} }; },
        openLock(id) { if (!r.lockSet || r.lockSet.open[id]) return; r.lockSet.open[id] = true; sfx('ink_unlock', { vol: 0.6, rate: 1.2 }); const d = door(); burst(d.x, d.y - 26, 8, '200,70,58'); if (Object.keys(r.lockSet.open).length >= r.lockSet.need) { r.lockSet.done = true; if (r.allLocksFn) r.allLocksFn(); else api.unlock(); } },
        tally(n, o) { r.tally = n; r.jumpsLeft = n; r.tallyExact = !!(o && o.exact); },
        get hasKey() { return !!(P && P.carry); },
        get unlocked() { return !!r.door && !r.door.locked; },
        get idleT() { return r.idleT || 0; },
        show(id) { const s = r.spikes[id]; if (s) s.ext = 1; },
        hide(id) { const s = r.spikes[id]; if (s) s.q.push({ k: 'ext', to: 0, dur: 0.12, ease: 'in' }); },
        // a hanging thorn group lets go and falls to the ground below it
        fallSpikes(id) {
          const s = r.spikes[id]; if (!s || s.falling) return;
          s.falling = true; s.ext = 1;
          let d = 1e9;
          for (const tl of s.tiles) for (let y = tl.y + 1; y <= ROWS; y++) if (y === ROWS || SOLIDISH(r.g[y][tl.x])) { d = Math.min(d, (y - tl.y - 1) * T + T * 0.3); break; }
          sfx('ink_slide', { vol: 0.5, rate: 1.6 });
          s.q.push({ k: 'to', x: 0, y: d, dur: 0.3, ease: 'in' }, { k: 'fn', fn: () => sfx('ink_slam', { vol: 0.5, rate: 1.4 }) }, { k: 'to', x: 0, y: d, dur: 0.6 }, { k: 'fn', fn: () => { s.alive = false; } });
        },
        // stand still under them that long and they fall on you
        stillTrap(id, sec, x0, x1) { r.ticks.push(() => { const s = r.spikes[id]; if (s && !s.falling && P.ground && (r.idleT || 0) > sec && P.x >= x0 * T && P.x <= x1 * T) api.fallSpikes(id); }); },
        fakeKey(i) { if (r.keys[i]) r.keys[i].fake = true; },
        // a key hidden under a crate (shows once the crate has been pushed off it)
        keyUnder(ci) { const c = r.crates[ci]; if (c) r.keys.push({ x: c.x + T / 2, y: c.y + T / 2 + 4, carried: false, alive: true, vy: 0, hidden: true, falls: false, bob: 0, under: c, ux: c.x }); },
        // the lamp goes out for sec, then lights itself again (once: and won't go out a second time)
        lampTimer(sec, o) { r.lampTimer = { sec, once: !!(o && o.once), used: false, t: 0 }; },
        dayOnly(id) { const b = r.bodies[id]; if (b) b.dayOnly = true; },
        // the ground from column x0 toward x1 gives way, one column after another
        crumble(x0, x1, speed, delay) {
          const gb = r.bodies['#'], dir = Math.sign(x1 - x0) || 1;
          for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += dir) {
            const tiles = gb.tiles.filter(tl => tl[0] === x);
            if (!tiles.length) continue;
            gb.tiles = gb.tiles.filter(tl => tl[0] !== x);
            const bd = mover({ id: 'crumble' + x, kind: 'ground', tiles, rects: rowRects(tiles), solid: true, visible: true, alive: true });
            r.bodies[bd.id] = bd; r.blist.push(bd);
            r.timers.push({ t: delay + Math.abs(x - x0) / speed, fn: () => { bd.q.push({ k: 'to', x: 1.5, y: 2, dur: 0.16 }, { k: 'fn', fn: () => { bd.solid = false; sfx('ink_slide', { vol: 0.25, rate: 1.5 }); } }, { k: 'to', x: 0, y: RH, dur: 0.9, ease: 'in' }); } });
          }
          gb.rects = rowRects(gb.tiles);
        },
        ink(tiles, life) { r.inkMax = r.inkLeft = tiles * T; r.inkLife = life || 5; },
        cat(x, y) { r.cat = { x: (x + 0.5) * T, y: (y + 1) * T, awake: 0 }; },
        wakeCat() { if (r.cat) r.cat.awake = 0.001; },
        lampOrder(syms, order, o) { r.lamps.forEach((l, i) => { l.sym = syms[i]; l.on = false; }); r.order = { want: order, got: [], reverse: !!(o && o.reverse), lock: 0 }; },
        belt(x0, x1, y, speed) { r.belts.push({ x0: x0 * T, x1: (x1 + 1) * T, y: y * T, v: speed * T }); },
        shyDoor() { r.shy = true; door().locked = false; },
        sunNight(x, y) { r.sun = { x: x * T, y: y * T, x0: x * T, y0: y * T, drag: false }; door().nightOnly = true; door().locked = false; },
        splatsSolid() { r.splatSolid = true; },
        titleKey(x, y) { r.title = { x: x * T, y: y * T, x0: x * T, y0: y * T, text: r.def.name, moved: false }; r.keys.push({ x: x * T, y: y * T, carried: false, alive: true, vy: 0, hidden: true, falls: true, bob: 0 }); },
        cranes(n, o) { r.cranes = n; r.craneSeq = !!(o && o.seq); },
        seal(x, y, small) { r.seal = { x: x * T, y: y * T, x0: x * T, y0: y * T, used: false, small: !!small }; if (!r.sealFn) r.sealFn = () => api.unlock(); },
        rainPlant(x, y, o) { r.cloud = { x: 4 * T, y: 1.6 * T, dir: 1, rain: 0, speed: 1.6 }; r.plant = { x: (x + 0.5) * T, y: y * T, grow: 0, tx: x, ty: y, need: (o && o.times) || 1, rains: 0, target: 0 }; },
        cloudOver() { return r.cloud && Math.abs(r.cloud.x - r.plant.x) < T * 1.2 && r.cloud.rain <= 0; },
        echoGhost() { r.echo = true; },
        plateDoor() { r.plateDoor = true; },
        wet(id) { r.wetId = id; const s = r.spikes[id]; if (s) { s.ext = 1; s.wet = true; } },
        treeKey(x, y) { r.tree = { x: (x + 0.5) * T, y: (y + 0.5) * T }; r.keys.push({ x: (x + 0.5) * T, y: (y + 0.5) * T, carried: false, alive: true, vy: 0, hidden: false, falls: false, hang: true, bob: 0 }); },
        dropKey() { for (const k of r.keys) if (k.hang) { k.hang = false; k.falls = true; sfx('ink_key', { vol: 0.6, rate: 0.8 }); } },
        holdDoor() { r.holdDoor = true; door().locked = false; },
        free() { const d = door(); if (d) d.locked = false; },
        swipeGravity() { r.swipeGrav = true; },                     // swipe up / down turns this page's gravity
        get ghostHolds() { const gq = persist.ghost; if (!gq || !gq.length) return false; const f = gq[gq.length - 1]; return r.plates.some(p => Math.abs(f.x - p.x) < T * 0.6 && Math.abs(f.y - p.y) < 3); }
      };
      return api;
    }

    // ── player ────────────────────────────────────────────────────────────
    function spawn() {
      P = { x: R.start.x, y: R.start.y, vx: 0, vy: 0, ground: false, on: null, face: 1, coy: 0, buf: 0, cut: false, dead: false, run: 0, land: 0, entering: 0, carry: null, born: 0,
        scarf: Array.from({ length: 7 }, (_, i) => ({ x: R.start.x - i * 3, y: R.start.y - 18, px: R.start.x - i * 3, py: R.start.y - 18 })) };
      R.gdir = 1;
      const st = rooms[ri].bot;
      bot.steps = typeof st === 'function' ? st(R.api) : (st || []);
      bot.i = 0; bot.t = 0; bot.dir = 0; bot.hold = 0; bot.press = false; bot.init = false; bot.finger = null; bot.pressT = 0; bot.pause = false;
      persist.rec = [];
      persist.gi = 0;
    }
    function loadRoom(i, keep) {
      if (!keep || !persist || persist.room !== i) persist = { room: i, deaths: 0, splats: [], ghost: null, rec: [], time: 0, hinted: false };
      ri = i; R = build(rooms[ri]); spawn();
      if (!keep) introT = 0;
      finger = null;
      bakeRoom();
    }
    const box = () => { const x0 = P.x - PW / 2; return R.gdir > 0 ? { x0, y0: P.y - PH, x1: x0 + PW, y1: P.y } : { x0, y0: P.y, x1: x0 + PW, y1: P.y + PH }; };
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    function solids() {
      const out = [];
      for (const b of R.blist) { if (!b.alive || !b.solid) continue; for (const q of b.rects) out.push({ x0: q.x + b.ox, y0: q.y + b.oy, x1: q.x + q.w + b.ox, y1: q.y + q.h + b.oy, b }); }
      for (const e of R.erasers) if (e.alive) out.push({ x0: e.x, y0: e.y, x1: e.x + T, y1: e.y + T, b: { id: 'ink', kind: 'ink' } });
      for (const c of R.crates) out.push({ x0: c.x, y0: c.y, x1: c.x + T, y1: c.y + T, b: { id: 'crate', kind: 'crate' }, crate: c });
      for (const s of R.strokes) if (s.life > 0) for (const rc of s.rects) out.push(rc);
      return out;
    }
    function die(cause) {
      if (P.dead || done) return;
      P.dead = true; deadT = 0; deaths++; persist.deaths++;
      sfx('ink_die', { vol: 0.9 });
      env.shake(0.25);
      const cy = P.y - R.gdir * PH * 0.5;
      // an ink splat that stays on the page
      const sp = { x: P.x, y: cy, r: 9 + Math.random() * 4, seed: Math.random() * 1000, tile: null };
      if (R.splatSolid) {
        // the splat sets on the thorn that killed you (else on the tile you died in)
        const pb = box();
        for (const s of R.slist) for (const tl of s.tiles) if (!tl.smeared && s.ext > 0.4 && hit(pb, spikeBox(s, tl))) sp.tile = { x: tl.x, y: tl.y };
        const tx = Math.floor(P.x / T), ty = Math.floor((P.y - 2) / T);
        if (!sp.tile && tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && !SOLIDISH(R.g[ty][tx])) sp.tile = { x: tx, y: ty };
      }
      persist.splats.push(sp);
      for (let i = 0; i < 14; i++) { const a = Math.random() * TAU, v = 60 + Math.random() * 200; fx.spawn({ x: P.x, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: 900, drag: 0.8, kind: 'debris', rgb: '21,18,15', size: 2 + Math.random() * 3, life: 0.7 }); }
      if (R.echo) persist.ghost = persist.rec.slice();
      msg = ['Ink everywhere.', 'Again.', 'The page remembers.', 'That left a mark.'][deaths % 4]; msgT = 1.8;
    }
    function burst(x, y, n, rgb) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 30 + Math.random() * 90; fx.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: 'glow', rgb: rgb || '255,210,150', size: 1.4 + Math.random(), life: 0.6 }); } }
    function restart() { if (P.dead || P.entering) return; if (R.echo) persist.ghost = persist.rec.slice(); sfx('ink_slide', { vol: 0.4, rate: 1.4 }); R = build(rooms[ri]); spawn(); bakeRoom(); }

    // ── the page under your finger: taps, drags, ink, rubbing ──────────────
    function toRoom(p) { const F = fit(); return { x: (p.x - F.x) / F.s, y: (p.y - F.y) / F.s }; }
    function doorRect() { const d = R.door; if (!d) return null; const x = d.x + d.ox, y = d.y + d.oy; return d.hang ? { x0: x - 14, y0: y - 2, x1: x + 14, y1: y + 44 } : { x0: x - 14, y0: y - 44, x1: x + 14, y1: y + 2 }; }
    const inR = (p, r, pad) => r && p.x >= r.x0 - (pad || 0) && p.x <= r.x1 + (pad || 0) && p.y >= r.y0 - (pad || 0) && p.y <= r.y1 + (pad || 0);
    const sealHidden = () => R.seal && R.erasers.some(e => e.alive && R.seal.x0 > e.x - 4 && R.seal.x0 < e.x + T + 4 && R.seal.y0 > e.y - 4 && R.seal.y0 < e.y + T + 4);
    function draggableAt(p) {
      if (R.seal && !R.seal.used && !sealHidden() && Math.hypot(p.x - R.seal.x, p.y - R.seal.y) < 22) return 'seal';
      if (R.sun && Math.hypot(p.x - R.sun.x, p.y - R.sun.y) < 30) return 'sun';
      if (R.title && !R.title.moved && Math.abs(p.x - R.title.x) < 120 && Math.abs(p.y - R.title.y) < 22) return 'title';
      if (R.door && R.door.drag && inR(p, doorRect(), 8)) return 'door';
      return null;
    }
    function gestures(I, dt) {
      const taps = [], swipes = [];
      let live = null;
      if (bot.on) {
        for (const tp of bot.ptap.splice(0)) taps.push(tp);
        for (const s of bot.pswipe.splice(0)) swipes.push(s);
        live = bot.finger;
      } else {
        for (const tp of I.taps) taps.push(toRoom(tp));
        for (const s of I.swipes) swipes.push({ dir: s.dir });
        if (I.touch.down) { const p = toRoom(I.touch), p0 = toRoom({ x: I.touch.x0, y: I.touch.y0 }); live = { x: p.x, y: p.y, x0: p0.x, y0: p0.y, t: I.touch.t }; }
      }
      // finger down / moving / up
      if (live && !finger) {
        const what = draggableAt({ x: live.x0, y: live.y0 });
        const onWall = R.erasers.some(e => e.alive && live.x0 > e.x - 8 && live.x0 < e.x + T + 8 && live.y0 > e.y - 8 && live.y0 < e.y + T + 8) || (R.wetId && R.spikes[R.wetId] && R.spikes[R.wetId].tiles.some(tl => live.x0 > tl.x * T - 8 && live.x0 < (tl.x + 1) * T + 8 && live.y0 > tl.y * T - 14 && live.y0 < (tl.y + 1) * T + 8));
        finger = { mode: what ? 'drag:' + what : onWall || !R.inkMax ? 'rub' : 'ink', x: live.x, y: live.y, pts: [{ x: live.x, y: live.y }], press: inR({ x: live.x0, y: live.y0 }, doorRect(), 10) };
        if (finger.mode === 'ink') { finger.stroke = { pts: [{ x: live.x, y: live.y }], life: R.inkLife, rects: [], len: 0 }; R.strokes.push(finger.stroke); sfx('ink_brush', { vol: 0.4 }); }
      }
      if (live && finger) {
        const lx = finger.x, ly = finger.y, dx = live.x - lx, dy = live.y - ly, d = Math.hypot(dx, dy);
        finger.x = live.x; finger.y = live.y; finger.t = live.t;
        if (finger.mode.startsWith('drag:')) {
          const w = finger.mode.slice(5), o = w === 'door' ? null : R[w];
          if (w === 'door') { R.door.ox += dx; R.door.oy += dy; R.door.vy = 0; R.door.held2 = true; }
          else if (o) { o.x += dx; o.y += dy; if (w === 'title') o.moved = Math.hypot(o.x - o.x0, o.y - o.y0) > 60; }
        } else if (finger.mode === 'ink' && d > 0) {
          const s = finger.stroke;
          // ink runs out
          const use = Math.min(d, R.inkLeft);
          if (use > 0.5) {
            const k = use / d, nx = lx + dx * k, ny = ly + dy * k;
            const steps = Math.ceil(use / 4);
            for (let i = 1; i <= steps; i++) { const px = lx + (nx - lx) * i / steps, py = ly + (ny - ly) * i / steps; s.rects.push({ x0: px - 3.5, y0: py - 2.5, x1: px + 3.5, y1: py + 3.5, b: { id: 'stroke', kind: 'stroke' } }); }
            s.pts.push({ x: nx, y: ny }); s.len += use; R.inkLeft -= use;
          }
        } else if (d > 0) {
          // rub: the ink walls under the finger wear away; wet thorns smear flat
          for (const e of R.erasers) if (e.alive && live.x > e.x - 6 && live.x < e.x + T + 6 && live.y > e.y - 6 && live.y < e.y + T + 6) {
            e.rub += d / 48; if (Math.random() < 0.3) sfx('ink_erase', { vol: 0.35 });
            if (e.rub >= 1) { e.alive = false; for (let i = 0; i < 6; i++) fx.spawn({ x: e.x + Math.random() * T, y: e.y + Math.random() * T, vx: (Math.random() - 0.5) * 50, vy: 20 + Math.random() * 40, g: 300, kind: 'debris', rgb: '21,18,15', size: 2, life: 0.7 }); }
          }
          if (R.wetId) { const s = R.spikes[R.wetId]; if (s && s.alive) for (const tl of s.tiles) if (!tl.smeared && live.x > tl.x * T - 4 && live.x < (tl.x + 1) * T + 4 && live.y > tl.y * T - 14 && live.y < (tl.y + 1) * T + 6) { tl.smeared = true; sfx('ink_erase', { vol: 0.5, rate: 0.8 }); } }
        }
        if (finger.press && R.holdDoor) R.door.held = inR(live, doorRect(), 16) && live.t > 0.15;
      }
      if (!live && finger) {
        const w = finger.mode.startsWith('drag:') ? finger.mode.slice(5) : null;
        if (w === 'door') R.door.held2 = false;
        if (w === 'seal' && R.seal) {
          if (inR(R.seal, doorRect(), 18) && !R.seal.used) { R.seal.used = true; sfx('ink_stamp', { vol: 0.9 }); env.shake(0.12); burst(R.door.x, R.door.y - 26, 14, '200,70,58'); if (R.sealFn) R.sealFn(); }
          else { R.seal.back = 1; }
        }
        if (w === 'sun' && R.sun && R.sun.y > 11 * T && !R.night) { R.night = true; sfx('ink_lamp', { vol: 0.6, rate: 0.7 }); }
        if (finger.mode === 'ink' && finger.stroke && finger.stroke.len < 8) { R.strokes.splice(R.strokes.indexOf(finger.stroke), 1); }
        if (R.holdDoor) R.door.held = false;
        finger = null;
      }
      // taps on things
      for (const tp of taps) {
        if (tp.what === 'cloud' || (R.cloud && Math.hypot(tp.x - R.cloud.x, tp.y - R.cloud.y) < 46)) { if (R.cloud && R.cloud.rain <= 0) { R.cloud.rain = 2.2; sfx('ink_rain', { vol: 0.7 }); } continue; }
        let used = false;
        for (const l of R.lamps) if (Math.hypot(tp.x - l.x, tp.y - l.y) < 26) { tapLamp(l); used = true; }
        if (used) continue;
        if (R.door && inR(tp, doorRect(), 10)) knock();
      }
      // swipes: up / down turn the page's gravity (where the room allows it), left-right shakes
      for (const s of swipes) {
        if (R.shake) {
          const sh = R.shake;
          if ((s.dir === 'left' || s.dir === 'right') && s.dir !== sh.last) { sh.count++; sh.last = s.dir; sh.t = 1.6; env.shake(0.15); sfx('ink_push', { vol: 0.4, rate: 1.4 }); if (sh.count >= sh.n && !sh.done) { sh.done = true; sh.fn(); } }
        }
        if (R.swipeGrav) {
          if ((s.dir === 'up' && R.gdir > 0) || (s.dir === 'down' && R.gdir < 0)) flipGravity();
        }
      }
      if (R.shake && R.shake.t > 0) { R.shake.t -= dt; if (R.shake.t <= 0 && !R.shake.done) { R.shake.count = 0; R.shake.last = null; } }
    }
    function tapLamp(l) {
      if (R.lampTimer) {
        const lt = R.lampTimer;
        if (lt.t > 0 || !l.on) return;
        if (lt.used && lt.once) { msg = 'The wick won’t go out twice.'; msgT = 1.6; return; }
        l.on = false; l.lit = 1; lt.used = true; lt.t = lt.sec; R.dark = !R.lamps.some(q => q.on); sfx('ink_lamp', { vol: 0.7 });
        return;
      }
      if (R.order) {
        if (l.on || R.order.lock > 0) return;
        l.on = true; l.lit = 1; sfx('ink_lamp', { vol: 0.7 });
        R.order.got.push(l.sym);
        const n = R.order.got.length, ok = R.order.got.every((s, i) => s === R.order.want[i]);
        if (!ok) { sfx('ink_wrong', { vol: 0.8 }); msg = 'Wrong order.'; msgT = 1.6; R.order.lock = 3; R.api.after(0.5, () => { R.lamps.forEach(q => { q.on = false; }); R.order.got = []; }); }
        else if (n === R.order.want.length) R.api.unlock();
        return;
      }
      l.on = !l.on; l.lit = 1; R.dark = !R.lamps.some(q => q.on); sfx('ink_lamp', { vol: 0.7 });
    }
    function knock() {
      const d = R.door;
      d.knockFx = 1; sfx('ink_knock', { vol: 0.8 });
      if (d.painted) { msg = 'It’s painted on the page.'; msgT = 1.8; return; }
      const k = R.knock;
      if (!k || k.done) return;
      if (R.t - k.lastT > 2.2) k.count = 0;
      k.count++; k.lastT = R.t;
      if (!k.exact && k.count >= k.n) { k.done = true; R.api.after(0.25, k.fn); }
      if (k.exact && k.count > k.n) { k.count = 0; sfx('ink_wrong', { vol: 0.8 }); msg = 'Too many.'; msgT = 1.4; if (k.punish) k.punish(); }
    }
    function flipGravity() {
      R.gdir = -R.gdir; P.ground = false; P.vy = 0;
      P.y += R.gdir < 0 ? -PH : PH;
      sfx('ink_flip', { vol: 0.7 });
    }

    // ── the bot (tests) ────────────────────────────────────────────────────
    function botInput(dt) {
      const s = bot.steps[bot.i];
      const px = P.x / T;
      bot.press = false;
      if (bot.pressT > 0) { bot.pressT -= dt; bot.finger.t += dt; if (bot.pressT <= 0) bot.finger = null; }
      if (s) {
        const [k, a, b, c, d, e] = s;
        if (!bot.init) {
          bot.init = true; bot.t = 0; bot.air = false; bot.past = false;
          if (k === 'run' || k === 'go' || k === 'jumpAt') { const want = Math.sign(a - px) || bot.dir || 1; if (k !== 'go' && bot.dir && want !== bot.dir && Math.abs(a - px) < 0.7) bot.past = true; else bot.dir = want; }
          if (k === 'wait') bot.dir = 0;
        }
        bot.t += dt;
        const reached = () => bot.past || (bot.dir > 0 ? px >= a : px <= a);
        let next = false;
        if (k === 'run' || k === 'go') { if (reached()) { if (k === 'go') bot.dir = 0; next = true; } }
        else if (k === 'jumpAt') { if (reached()) { bot.press = true; bot.hold = b || 0.32; next = true; } }
        else if (k === 'jump') { bot.press = true; bot.hold = a || 0.32; next = true; }
        else if (k === 'dir') { bot.dir = a; next = true; }
        else if (k === 'wait') { if (bot.t >= a) next = true; }
        else if (k === 'land') { if (!P.ground) bot.air = true; if ((P.ground && (bot.air || bot.t > 0.15)) || bot.t > 2.5) next = true; }
        else if (k === 'until') { if (a(R.api, { x: px, y: P.y / T, ground: P.ground, flipped: R.gdir < 0 })) next = true; }
        else if (k === 'tap') { bot.ptap.push(c === 'cloud' ? { x: -999, y: -999, what: 'cloud' } : { x: a * T, y: b * T }); next = true; }
        else if (k === 'swipe') { bot.pswipe.push({ dir: a }); next = true; }
        else if (k === 'restart') { next = true; bot.i++; bot.init = false; restart(); return { left: false, right: false, jumpP: false, jumpH: false }; }
        else if (k === 'pause') { bot.pause = true; if (bot.t >= a) { bot.pause = false; next = true; } }
        else if (k === 'press') { bot.finger = { x: a * T, y: b * T, x0: a * T, y0: b * T, t: 0 }; bot.pressT = c; next = true; }
        else if (k === 'drag' || k === 'draw' || k === 'rub') {
          // a finger path over time: drag (x0,y0)->(x1,y1), draw along points, rub zigzags over a box
          let pts, dur;
          if (k === 'drag') { pts = [[a, b], [c, d]]; dur = e; } else if (k === 'draw') { pts = a; dur = b; } else { dur = e; pts = []; for (let i = 0; i <= 12; i++) pts.push([a + (i % 2 ? c : 0), b + d * i / 12]); }
          const kk = Math.min(1, bot.t / dur), seg = (pts.length - 1) * kk, i0 = Math.min(pts.length - 2, Math.floor(seg)), f = seg - i0;
          const x = (pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * f) * T, y = (pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * f) * T;
          if (!bot.finger || bot.pressT > 0) bot.finger = { x, y, x0: pts[0][0] * T, y0: pts[0][1] * T, t: 0 };
          bot.finger.x = x; bot.finger.y = y; bot.finger.t = bot.t;
          if (bot.t >= dur + 0.05) { bot.finger = null; next = true; }
        }
        if (next) { bot.i++; bot.init = false; }
      }
      if (bot.hold > 0) bot.hold -= dt;
      return { left: bot.dir < 0, right: bot.dir > 0, jumpP: bot.press, jumpH: bot.press || bot.hold > 0 };
    }

    // ── simulation ─────────────────────────────────────────────────────────
    let lastFrameDt = 1 / 60;
    function update(dt, I) {
      bot.on = !!window.__inkBot;
      // the pause trick: the world sees dt = 0 while the game is paused
      if (dt === 0) { if (!pauseStart) pauseStart = performance.now(); return; }
      if (pauseStart) { pausedFor = (performance.now() - pauseStart) / 1000; pauseStart = 0; if (pausedFor >= 0.35 && R.pauseFn && !P.dead) { const f = R.pauseFn; R.pauseFn = null; f(); msg = 'Something changed while you were away.'; msgT = 2.4; } }
      if (bot.on && bot.pause) { botInput(dt); if (!bot.pause && R.pauseFn) { const f = R.pauseFn; R.pauseFn = null; f(); } return; }
      lastFrameDt = dt; t += dt;
      if (done) return;
      introT += dt; msgT = Math.max(0, msgT - dt);
      fade = clamp(fade + fadeDir * dt * 3.2, 0, 1);
      if (nextAfterFade && fade >= 1) { const f = nextAfterFade; nextAfterFade = null; f(); fadeDir = -1; }
      timeLeft -= dt * env.clock;
      if (timeLeft <= 0) { timeLeft = 0; done = true; env.lose('Time’s up'); return; }
      persist.time += dt;
      const HINT = LV <= 3 ? [60, 6] : LV <= 7 ? [120, 10] : null;     // (seconds, deaths) before a note; none from stage 8
      if (HINT && !persist.hinted && (persist.time > HINT[0] || persist.deaths >= HINT[1])) { persist.hinted = true; hints++; sfx('ink_brush', { vol: 0.5, rate: 0.7 }); }
      if (P.dead) { deadT += dt; stepWorld(dt); if (deadT > 0.7) { R = build(rooms[ri]); spawn(); bakeRoom(); } return; }
      if (P.entering > 0) {
        P.entering += dt; stepWorld(dt);
        if (P.entering > 0.6 && !nextAfterFade) { fadeDir = 1; nextAfterFade = () => { if (ri + 1 >= rooms.length || env.onlyRoom) finish(); else loadRoom(ri + 1, false); }; }
        return;
      }
      let L = I.left, Rt = I.right, jp = !!I.pressed.jump, jh = !!I.held.jump, rs = !!I.pressed.special;
      if (bot.on) { const b = botInput(dt); L = b.left; Rt = b.right; jp = b.jumpP; jh = b.jumpH; rs = false; if (!R || P.dead) return; }
      if (rs) { restart(); return; }
      gestures(I, dt);
      const dir = (Rt ? 1 : 0) - (L ? 1 : 0);
      R.t += dt;
      for (let i = R.timers.length - 1; i >= 0; i--) { const tm = R.timers[i]; tm.t -= dt; if (tm.t <= 0) { R.timers.splice(i, 1); tm.fn(); } }
      for (const fn of R.ticks) fn(dt);
      if (R.knock && R.knock.exact && !R.knock.done && R.knock.count === R.knock.n && R.t - R.knock.lastT > 1.0) { R.knock.done = true; R.knock.fn(); }
      stepWorld(dt);
      // stand still (no input at all) for a while
      const idle = !dir && !jp && !jh && !finger && P.ground;
      R.idleT = idle ? (R.idleT || 0) + dt : 0;
      if (R.still && !R.still.done) {
        const near = !R.still.near || Math.abs(P.x - R.door.x) < R.still.near * T, far = !R.still.far || Math.abs(P.x - R.door.x) >= R.still.far * T;
        R.still.t = idle && near && far ? R.still.t + dt : 0;
        if (R.still.t >= R.still.sec) { R.still.done = true; R.still.fn(); }
      }
      // run + belts
      const onGround = P.ground;
      const target = dir * RUN;
      const a = onGround ? (dir ? ACC : DEC) : (dir ? AIR_ACC : AIR_DEC);
      if (P.vx < target) P.vx = Math.min(target, P.vx + a * dt); else if (P.vx > target) P.vx = Math.max(target, P.vx - a * dt);
      if (dir) P.face = dir;
      let beltV = 0;
      for (const bl of R.belts) if (onGround && R.gdir > 0 && Math.abs(P.y - bl.y) < 2 && P.x > bl.x0 && P.x < bl.x1) beltV = bl.v;
      if (jp) P.buf = BUFFER; else P.buf = Math.max(0, P.buf - dt);
      P.coy = onGround ? COYOTE : Math.max(0, P.coy - dt);
      if (P.buf > 0 && (onGround || P.coy > 0)) {
        P.buf = 0; P.coy = 0; P.vy = -JUMP_V * R.gdir; P.ground = false; P.cut = false; sfx('ink_jump', { vol: 0.4 });
        if (R.tally && R.jumpsLeft > 0) { R.jumpsLeft--; sfx('ink_erase', { vol: 0.5 }); if (R.jumpsLeft === 0) R.api.unlock(); }
        else if (R.tally && R.tallyExact) { R.jumpsLeft = R.tally; R.api.lock(); sfx('ink_wrong', { vol: 0.8 }); msg = 'Too many.'; msgT = 1.6; }
      }
      const rising = P.vy * R.gdir < 0;
      if (rising && !jh && !P.cut) { P.vy *= CUT; P.cut = true; }
      P.vy += (rising && jh ? G_UP : G_DN) * R.gdir * dt;
      if (Math.abs(P.vy) > MAXF) P.vy = Math.sign(P.vy) * MAXF;
      const wasGround = P.ground;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(P.vx) + Math.abs(beltV), Math.abs(P.vy)) * dt / 7));
      P.ground = false; P.on = null;
      for (let s = 0; s < n; s++) {
        const S = solids();
        const mx = (P.vx + beltV) * dt / n;
        P.x += mx;
        let b = box();
        for (const r of S) if (b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 - 0.05 && b.y1 > r.y0 + 0.05) {
          if (r.crate && mx !== 0 && onGround) {           // lean on a crate: it slides (if nothing is behind it)
            const c = r.crate, step = mx > 0 ? b.x1 - c.x : b.x0 - (c.x + T);
            const nc = { x0: c.x + step, y0: c.y + 0.5, x1: c.x + T + step, y1: c.y + T - 0.5 };
            if (!solids().some(o => o.crate !== c && hit(nc, o)) && nc.x0 >= 0 && nc.x1 <= RW) { c.x += step; r.x0 += step; r.x1 += step; if (Math.random() < 0.08) sfx('ink_push', { vol: 0.3 }); P.vx *= 0.92; continue; }
          }
          if (R.gdir > 0 && onGround && P.y - r.y0 > 0 && P.y - r.y0 <= 8) {   // a low lip (an ink stroke): step up onto it
            const up = { x0: b.x0, y0: r.y0 - PH - 0.02, x1: b.x1, y1: r.y0 - 0.02 };
            if (!S.some(o => hit(up, o))) { P.y = r.y0 - 0.01; b = box(); continue; }
          }
          if (mx > 0) P.x = r.x0 - PW / 2 - 0.001; else if (mx < 0) P.x = r.x1 + PW / 2 + 0.001;
          P.vx = 0; b = box();
        }
        if (R.edge !== 'left' || P.x > T) P.x = Math.max(P.x, PW / 2);
        P.x = Math.min(P.x, RW - PW / 2);
        const dy = P.vy * dt / n;
        P.y += dy;
        b = box();
        for (const r of S) if (b.x0 < r.x1 - 0.05 && b.x1 > r.x0 + 0.05 && b.y0 < r.y1 && b.y1 > r.y0) {
          if (dy * R.gdir > 0) { P.y = R.gdir > 0 ? r.y0 : r.y1; P.ground = true; P.on = r.b.id; }
          else { P.y = R.gdir > 0 ? r.y1 + PH : r.y0 - PH; P.cut = true; }
          P.vy = 0; b = box();
        }
      }
      if (P.ground && !wasGround) { P.land = 1; sfx('ink_land', { vol: 0.25 }); }
      // fake ground
      const pb = box();
      for (const bd of R.blist) if (bd.kind === 'fake' && bd.alive && bd.rects.some(qq => hit(pb, { x0: qq.x, y0: qq.y - 1, x1: qq.x + qq.w, y1: qq.y + qq.h }))) bd.alive = false;
      P.run += Math.abs(P.vx + beltV) * dt / 15; P.land = Math.max(0, P.land - dt * 7); P.born += dt;
      scarf(dt);
      // keys: pick up (if you can see it)
      for (const k of R.keys) {
        if (!k.alive || k.carried || k.hidden || k.hang || (k.lightOnly && R.dark)) continue;
        if (Math.abs(k.x - P.x) < 14 && Math.abs(k.y - (P.y - R.gdir * 12)) < 20) {
          if (k.fake) { k.alive = false; burst(k.x, k.y, 10, '21,18,15'); die('trap'); msg = 'It bit.'; msgT = 1.8; break; }
          k.carried = true; P.carry = k; sfx('ink_key', { vol: 0.8 });
        }
      }
      // the record of this try (an echo page replays it next time)
      if (R.echo) persist.rec.push({ x: P.x, y: P.y, f: P.face, g: R.gdir });
      hazards();
      if (!P.dead) doorCheck();
      if (!P.dead) rules();
    }
    function rules() {
      const v = { x: P.x / T, y: P.y / T, air: !P.ground, ground: P.ground, flipped: R.gdir < 0 };
      for (let i = 0; i < R.rules.length; i++) { const ru = R.rules[i], c = !!ru.cond(v); if (c && !ru.was) { ru.fn(); if (ru.once) { R.rules.splice(i, 1); i--; continue; } } ru.was = c; }
    }
    function scarf(dt) {
      const s = P.scarf, ax = P.x - P.face * 2, ay = P.y - R.gdir * 17;
      s[0].x = ax; s[0].y = ay;
      for (let i = 1; i < s.length; i++) {
        const p = s[i], vx = (p.x - p.px) * 0.86, vy = (p.y - p.py) * 0.86;
        p.px = p.x; p.py = p.y; p.x += vx - P.face * 0.25 + Math.sin(t * 6 + i) * 0.12; p.y += vy + 0.18 * R.gdir;
      }
      for (let k = 0; k < 2; k++) for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, L = 3.2;
        b.x = a.x + dx / d * L; b.y = a.y + dy / d * L;
      }
    }
    function stepWorld(dt) {
      for (const b of R.blist) stepMover(b, dt);
      for (const s of R.slist) stepMover(s, dt);
      // strokes dry out
      for (let i = R.strokes.length - 1; i >= 0; i--) { const s = R.strokes[i]; if (finger && finger.stroke === s) continue; s.life -= dt; if (s.life <= -0.6) R.strokes.splice(i, 1); }
      // crates fall
      for (const c of R.crates) {
        c.vy = Math.min(MAXF, c.vy + G_DN * dt); const ny = c.y + c.vy * dt;
        const rc = { x0: c.x + 0.5, y0: ny, x1: c.x + T - 0.5, y1: ny + T };
        const S = solids().filter(o => o.crate !== c);
        const hitS = S.find(o => hit(rc, o));
        if (hitS) { c.y = hitS.y0 - T; c.vy = 0; } else c.y = ny;
        if (c.y > RH + 50) c.y = RH + 50;
      }
      // keys that fall (title key, tree key) land on the ground
      for (const k of R.keys) {
        if (k.hidden && R.title && R.title.moved && !k.under) { k.hidden = false; k.falls = true; }
        if (k.hidden && k.under && Math.abs(k.under.x - k.ux) > T * 0.8) { k.hidden = false; sfx('ink_key', { vol: 0.5, rate: 1.2 }); }
        if (k.falls && !k.carried && !k.hidden) {
          k.vy = Math.min(600, k.vy + 1500 * dt); const ny = k.y + k.vy * dt;
          const S = solids(); const fl = S.find(o => k.x > o.x0 && k.x < o.x1 && ny + 8 > o.y0 && k.y + 8 <= o.y0 + 1);
          if (fl) { k.y = fl.y0 - 8; k.vy = 0; k.falls = false; sfx('ink_key', { vol: 0.4, rate: 1.4 }); } else k.y = ny;
        }
        if (k.carried) { k.x += (P.x - k.x) * 0.4; k.y += (P.y - R.gdir * 34 - k.y) * 0.4; }
      }
      // the door: dragged, falling, shy, slamming, fading in at night / in the dark
      const d = R.door;
      if (d) {
        d.knockFx = Math.max(0, d.knockFx - dt * 4); d.unlockFx = Math.max(0, (d.unlockFx || 0) - dt * 1.5);
        if (d.drag && !d.held2) {
          d.vy = Math.min(700, d.vy + 1800 * dt); const ny = d.y + d.oy + d.vy * dt;
          const S = solids(); const fl = S.find(o => d.x + d.ox > o.x0 && d.x + d.ox < o.x1 && ny > o.y0 - 0.5 && d.y + d.oy <= o.y0 + 0.5);
          if (fl) { if (d.vy > 200) sfx('ink_slam', { vol: 0.6 }); d.oy = fl.y0 - d.y; d.vy = 0; } else d.oy = ny - d.y;
          if (d.y + d.oy > RH + 80) { d.ox = 0; d.oy = 0; d.vy = 0; }
        }
        if (R.shy && !P.entering) {
          const dx = (d.x + d.ox) - P.x, faces = Math.sign(dx) === P.face, near = Math.abs(dx) < 9 * T;
          if (d.shyT > 0) d.shyT -= dt;
          else if (faces && near) {
            d.ox += Math.sign(dx) * 4 * T * dt;
            if (d.x + d.ox > RW - T || d.x + d.ox < T) { d.ox = (d.x + d.ox > RW / 2 ? 3.5 * T : RW - 3.5 * T) - d.x; d.shyT = 0.6; sfx('ink_slide', { vol: 0.5 }); burst(d.x + d.ox, d.y - 20, 8); }
          }
        }
        if (R.holdDoor) { const near = Math.abs(P.x - (d.x + d.ox)) < 2.6 * T; d.slam = near && !d.held ? Math.min(1, d.slam + dt * 9) : Math.max(0, d.slam - dt * 4); if (d.slam > 0.9 && !d.slamSnd) { d.slamSnd = true; sfx('ink_slam', { vol: 0.7 }); } if (d.slam < 0.2) d.slamSnd = false; }
        const shown = (!d.darkOnly || R.dark) && (!d.nightOnly || R.night);
        d.alpha += ((shown ? 1 : 0) - d.alpha) * Math.min(1, dt * 4);
        if (R.plateDoor) { const on = R.plates.some(p => p.down); if (on && d.locked) { d.locked = false; sfx('ink_unlock', { vol: 0.5, rate: 1.3 }); } else if (!on && !d.locked) { d.locked = true; sfx('ink_slam', { vol: 0.4, rate: 1.3 }); } }
      }
      // plates: pressed by you, a crate or your echo
      const gh = ghostNow();
      for (const p of R.plates) {
        const on = (q, y) => Math.abs(q - p.x) < T * 0.6 && Math.abs(y - p.y) < 3;
        p.down = (P && !P.dead && R.gdir > 0 && P.ground && on(P.x, P.y)) || (gh && on(gh.x, gh.y)) || R.crates.some(c => on(c.x + T / 2, c.y + T));
      }
      if (R.echo && persist.ghost && persist.ghost.length) persist.gi = Math.min(persist.ghost.length - 1, persist.gi + 1);
      // lamps, darkness, night
      for (const l of R.lamps) l.lit = Math.max(0, l.lit - dt * 2);
      if (R.lampTimer && R.lampTimer.t > 0) { R.lampTimer.t -= dt; if (R.lampTimer.t <= 0) { for (const l of R.lamps) { l.on = true; l.lit = 1; } R.dark = false; sfx('ink_lamp', { vol: 0.6, rate: 1.2 }); } }
      if (R.order && R.order.lock > 0) R.order.lock -= dt;
      for (const b of R.blist) if (b.dayOnly) b.solid = !R.night;
      R.darkA += ((R.dark ? 1 : 0) - R.darkA) * Math.min(1, dt * 5);
      R.nightA += ((R.night ? 1 : 0) - R.nightA) * Math.min(1, dt * 2);
      if (R.sun && !(finger && finger.mode === 'drag:sun') && !R.night) { R.sun.x += (R.sun.x0 - R.sun.x) * Math.min(1, dt * 3); R.sun.y += (R.sun.y0 - R.sun.y) * Math.min(1, dt * 3); }
      if (R.seal && R.seal.back && !(finger && finger.mode === 'drag:seal')) { R.seal.x += (R.seal.x0 - R.seal.x) * Math.min(1, dt * 6); R.seal.y += (R.seal.y0 - R.seal.y) * Math.min(1, dt * 6); if (Math.hypot(R.seal.x - R.seal.x0, R.seal.y - R.seal.y0) < 1) R.seal.back = 0; }
      if (R.cat && R.cat.awake > 0) R.cat.awake += dt;
      // cloud, rain, the bamboo that grows from it
      if (R.cloud) {
        const c = R.cloud;
        if (c.rain <= 0) { c.hit = false; c.x += c.dir * (c.speed || 1.6) * T * dt; if (c.x > RW - 3 * T) c.dir = -1; if (c.x < 3 * T) c.dir = 1; }
        else {
          c.rain -= dt;
          for (let i = 0; i < 3; i++) fx.spawn({ x: c.x + (Math.random() - 0.5) * 60, y: c.y + 14, vx: -10, vy: 420, kind: 'spark', rgb: '70,80,95', size: 1.2, life: 0.8 });
          const pl = R.plant;
          if (Math.abs(c.x - pl.x) < T * 1.6 && !c.hit && pl.rains < pl.need) {
            c.hit = true; pl.rains++; pl.target = Math.min(1, pl.rains / pl.need); if (pl.grow === 0) pl.grow = 0.0001; sfx('ink_grow', { vol: 0.8 });
            if (pl.rains < pl.need) { c.speed = (c.speed || 1.6) * 1.6; msg = 'Not enough.'; msgT = 1.6; }
          }
        }
      }
      if (R.plant && R.plant.grow > 0 && R.plant.grow < (R.plant.target || 1)) {
        R.plant.grow = Math.min(R.plant.target || 1, R.plant.grow + dt / 2.2);
        if (R.plant.grow >= 1 && !R.bodies.bamboo) {
          const px = R.plant.tx;
          const tiles = [[px - 2, 9], [px - 1, 9], [px + 1, 7], [px + 2, 7]];
          const b = mover({ id: 'bamboo', kind: 'leaf', tiles, rects: rowRects(tiles), solid: true, visible: false, alive: true }); R.bodies.bamboo = b; R.blist.push(b);
        }
      }
    }
    function ghostNow() {
      if (!R.echo || !persist.ghost || !persist.ghost.length) return null;
      return persist.ghost[Math.min(persist.ghost.length - 1, persist.gi)];
    }
    function hazards() {
      const b = box(), sb = { x0: b.x0 + 1.5, y0: b.y0 + 1.5, x1: b.x1 - 1.5, y1: b.y1 - 1 };
      for (const s of R.slist) {
        if (!s.alive || s.ext < 0.4 || s.harmless) continue;
        for (const tl of s.tiles) if (!tl.smeared && hit(sb, spikeBox(s, tl))) { die('spike'); return; }
      }
      if ((R.gdir > 0 && P.y - PH > RH + 30) || (R.gdir < 0 && P.y + PH < -30)) { die('fall'); return; }
    }
    function spikeBox(s, tl) {
      const x = tl.x * T + s.ox, y = tl.y * T + s.oy, h = T * 0.8 * s.ext;
      switch (tl.dir) {
        case 'down': return { x0: x + 4, y0: y, x1: x + T - 4, y1: y + h * 0.9 };
        case 'left': return { x0: x + T - h * 0.9, y0: y + 4, x1: x + T, y1: y + T - 4 };
        case 'right': return { x0: x, y0: y + 4, x1: x + h * 0.9, y1: y + T - 4 };
        default: return { x0: x + 4, y0: y + T - h * 0.9, x1: x + T - 4, y1: y + T };
      }
    }
    function doorCheck() {
      if (R.edge === 'left' && P.x < -4) { P.entering = 0.0001; sfx('ink_exit', { vol: 0.8 }); return; }
      const d = R.door;
      if (!d || d.painted || d.alpha < 0.7 || d.held2) return;
      const dx = d.x + d.ox, dy = d.y + d.oy;
      if (!(P.ground && Math.abs(P.x - dx) < 12 && Math.abs(P.y - dy) < 5 && d.hang === (R.gdir < 0))) return;
      if (R.holdDoor && !d.held) return;
      if (d.locked && P.carry) { P.carry.alive = false; P.carry = null; R.api.unlock(); }
      if (d.locked) { if (!d.toldLocked) { d.toldLocked = true; msg = 'Locked.'; msgT = 1.2; sfx('ink_knock', { vol: 0.4, rate: 0.7 }); } return; }
      P.entering = 0.0001; P.vx = 0; sfx('ink_exit', { vol: 0.8 }); burst(dx, dy - 20 * R.gdir, 16, '200,70,58');
    }
    function finish() {
      done = true;
      const n = rooms.length;
      if (env.round) env.setStars(3 - (hints > 0 ? 1 : 0) - (deaths > n * 3 ? 1 : 0));
      env.win();
    }

    // ── art: paper, ink wash, brush ground ────────────────────────────────
    function fit() { const W = env.W, v = env.view, s = Math.min(W / RW, v.h / RH); return { s, x: (W - RW * s) / 2, y: v.top + (v.h - RH * s) / 2 }; }
    function paper(K, def) {
      const cv = document.createElement('canvas'); cv.width = Math.round(RW * K); cv.height = Math.round(RH * K);
      const g = cv.getContext('2d'); g.scale(K, K);
      const rnd = rng(4242 + LV * 31);
      g.fillStyle = PAPER; g.fillRect(0, 0, RW, RH);
      // fibres and tea stains
      for (let i = 0; i < 900; i++) { const x = rnd() * RW, y = rnd() * RH, l = 3 + rnd() * 10, a = rnd() * TAU; g.strokeStyle = rnd() < 0.5 ? 'rgba(120,100,70,0.06)' : 'rgba(255,255,255,0.18)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      for (let i = 0; i < 5; i++) { const x = rnd() * RW, y = rnd() * RH, r = 40 + rnd() * 90, gr = g.createRadialGradient(x, y, r * 0.2, x, y, r); gr.addColorStop(0, 'rgba(170,130,80,0.05)'); gr.addColorStop(0.85, 'rgba(160,120,70,0.07)'); gr.addColorStop(1, 'rgba(160,120,70,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      // ink-wash mountains, three washes, soft at the foot
      [[0.5, 0.07, 150], [0.62, 0.11, 110], [0.74, 0.16, 70]].forEach(([base, a, amp], li) => {
        g.beginPath(); g.moveTo(0, RH);
        let y = RH * base;
        for (let x = 0; x <= RW + 20; x += 16) { y = RH * base - amp * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.006 + li * 2.1 + Math.sin(x * 0.017 + li)))) * (0.6 + 0.4 * rnd()); g.lineTo(x, y); }
        g.lineTo(RW, RH); g.closePath();
        const gr = g.createLinearGradient(0, RH * base - amp, 0, RH * base + 40); gr.addColorStop(0, `rgba(40,38,36,${a})`); gr.addColorStop(1, 'rgba(40,38,36,0)');
        g.fillStyle = gr; g.fill();
      });
      // the red sun (a seal of light), unless the page has its own sun
      if (!def.noSun) { g.fillStyle = 'rgba(190,60,45,0.75)'; g.beginPath(); g.arc(RW * 0.78, RH * 0.2, 30, 0, TAU); g.fill(); }
      // bamboo at the edges
      for (const side of [0, 1]) for (let i = 0; i < 3; i++) {
        const x = side ? RW - 12 - i * 16 - rnd() * 6 : 12 + i * 16 + rnd() * 6, a = 0.1 + i * 0.05;
        g.strokeStyle = `rgba(30,32,28,${a})`; g.lineWidth = 4 - i;
        g.beginPath(); g.moveTo(x, RH); g.lineTo(x + (side ? -6 : 6), -10); g.stroke();
        for (let y = RH - 30 - rnd() * 20; y > 0; y -= 34 + rnd() * 10) { g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y + 1); g.stroke(); if (rnd() < 0.5) { g.fillStyle = `rgba(30,32,28,${a})`; leaf(g, x, y, side ? Math.PI + 0.6 : -0.6, 14); } }
      }
      // two cranes far off
      if (!def.cranes) for (let i = 0; i < 2; i++) crane(g, RW * (0.25 + i * 0.12), RH * (0.16 + i * 0.05), 0.6, 0.25);
      // edges of the sheet
      const vg = g.createRadialGradient(RW / 2, RH / 2, RH * 0.45, RW / 2, RH / 2, RW * 0.62); vg.addColorStop(0, 'rgba(120,90,50,0)'); vg.addColorStop(1, 'rgba(120,90,50,0.22)');
      g.fillStyle = vg; g.fillRect(0, 0, RW, RH);
      return cv;
    }
    function leaf(g, x, y, a, l) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -l * 0.18, l, 0); g.quadraticCurveTo(l * 0.5, l * 0.12, 0, 0); g.fill(); g.restore(); }
    function crane(g, x, y, s, a, flap) {
      g.save(); g.translate(x, y); g.scale(s, s); g.strokeStyle = `rgba(30,28,26,${a})`; g.fillStyle = `rgba(30,28,26,${a})`; g.lineWidth = 2.2; g.lineCap = 'round';
      const w = flap === undefined ? 0 : Math.sin(flap) * 8;
      g.beginPath(); g.moveTo(-22, -6 + w); g.quadraticCurveTo(-10, -12 + w, 0, 0); g.quadraticCurveTo(10, -12 + w, 22, -6 + w); g.stroke();
      g.beginPath(); g.moveTo(-8, 1); g.lineTo(14, 0); g.stroke();
      g.fillStyle = 'rgba(190,60,45,0.8)'; g.beginPath(); g.arc(14, -1, 1.6, 0, TAU); g.fill();
      g.restore();
    }
    // brush ground: black ink, dry-brush streaks on top, drips under, ragged sides
    function inkEarth(g, tiles, solidAt) {
      g.fillStyle = INK;
      for (const [x, y] of tiles) g.fillRect(x * T - 0.4, y * T - 0.4, T + 0.8, T + 0.8);
      for (const [x, y] of tiles) {
        if (!solidAt(x, y - 1)) {
          for (let i = 0; i < 4; i++) {                           // bristle streaks along the top
            const y0 = y * T - 1.2 - hr(x, y, i) * 2.4, x0 = x * T + hr(x, y, i + 4) * 6 - 3, l = T * (0.5 + hr(x, y, i + 8) * 0.7);
            g.strokeStyle = INK; g.lineWidth = 0.9 + hr(x, y, i + 12) * 1.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + l, y0 + (hr(x, y, i + 16) - 0.5) * 1.2); g.stroke();
          }
          g.strokeStyle = 'rgba(236,227,207,0.55)';                  // paper showing through the dry brush
          for (let i = 0; i < 2; i++) { const yy = y * T + 3 + hr(x, y, i + 20) * 6, xx = x * T + hr(x, y, i + 24) * T; g.lineWidth = 0.7; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 5 + hr(x, y, i + 28) * 8, yy); g.stroke(); }
        }
        if (!solidAt(x, y + 1) && hr(x, y, 40) < 0.45) {             // a drip
          const xx = x * T + T * (0.2 + 0.6 * hr(x, y, 41)), l = 3 + hr(x, y, 42) * 9;
          g.fillStyle = INK; g.beginPath(); g.moveTo(xx - 1.6, (y + 1) * T - 1); g.lineTo(xx + 1.6, (y + 1) * T - 1); g.lineTo(xx + 0.6, (y + 1) * T + l); g.arc(xx, (y + 1) * T + l, 1.6, 0, Math.PI); g.lineTo(xx - 1.6, (y + 1) * T - 1); g.fill();
        }
        for (const s of [-1, 1]) if (!solidAt(x + s, y)) {
          const ex = s < 0 ? x * T : (x + 1) * T;
          g.fillStyle = INK;
          for (let i = 0; i < 3; i++) { const yy = y * T + hr(x, y, 50 + i + s * 3) * T; g.beginPath(); g.arc(ex + s * 0.6, yy, 1 + hr(x, y, 60 + i) * 1.8, 0, TAU); g.fill(); }
        }
      }
    }
    function bakeRoom() {
      const S = fit().s, K = Math.min(2, Math.max(1, (env.dpr || 1) * S)), def = rooms[ri];
      const key = (def.noSun || R.sun ? 'n' : 's') + (R.cranes ? 'c' : '');
      if (!bake.bg || Math.abs(bake.K - K) > 0.3 || bake.key !== key) { bake.bg = paper(K, { noSun: !!R.sun, cranes: !!R.cranes }); bake.K = K; bake.key = key; }
      const cv = document.createElement('canvas'); cv.width = bake.bg.width; cv.height = bake.bg.height;
      const g = cv.getContext('2d'); g.drawImage(bake.bg, 0, 0); g.scale(K, K);
      const G0 = R.g;
      const solidAt = (x, y) => { x = clamp(x, 0, COLS - 1); if (y < 0) return false; if (y >= ROWS) y = ROWS - 1; return SOLIDISH(G0[y][x]); };
      inkEarth(g, R.bodies['#'].tiles, solidAt);
      for (const s of R.signs) drawSign(g, s);
      bake.room = cv;
      for (const b of R.blist) {
        if (b.static || b.kind === 'ghost' || b.kind === 'leaf') continue;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const qq of b.rects) { x0 = Math.min(x0, qq.x); y0 = Math.min(y0, qq.y); x1 = Math.max(x1, qq.x + qq.w); y1 = Math.max(y1, qq.y + qq.h); }
        const pad = 14, sc = document.createElement('canvas'); sc.width = Math.ceil((x1 - x0 + pad * 2) * K); sc.height = Math.ceil((y1 - y0 + pad * 2) * K);
        const sg = sc.getContext('2d'); sg.scale(K, K); sg.translate(pad - x0, pad - y0);
        if (b.kind === 'splat') { splatShape(sg, (b.tiles[0][0] + 0.5) * T, (b.tiles[0][1] + 0.55) * T, 15, b.tiles[0][0] * 7 + b.tiles[0][1]); }
        else inkEarth(sg, b.tiles, solidAt);
        b.sprite = sc; b.sx = x0 - pad; b.sy = y0 - pad;
      }
    }
    function drawSign(g, s) {
      g.fillStyle = INK; g.fillRect(s.x - 1.5, s.y - 28, 3, 28);
      g.font = 'italic bold 11px Georgia, serif';
      const w = Math.max(40, g.measureText(s.text).width + 14);
      g.save(); g.translate(s.x, s.y - 32); g.rotate(0.03);
      g.fillStyle = 'rgba(245,238,222,0.95)'; g.strokeStyle = INK; g.lineWidth = 1.6; g.beginPath(); g.roundRect(-w / 2, -10, w, 20, 3); g.fill(); g.stroke();
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.text, 0, 1);
      g.restore();
    }
    function splatShape(c, x, y, r, seed) {
      c.fillStyle = INK; c.beginPath();
      for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, rr = r * (0.7 + 0.45 * hr(seed, i, 3)); i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
      c.closePath(); c.fill();
      for (let i = 0; i < 7; i++) { const a = hr(seed, i, 9) * TAU, d = r * (1.1 + hr(seed, i, 11) * 0.9); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, 1 + hr(seed, i, 13) * 2.4, 0, TAU); c.fill(); }
    }

    // ── drawing ───────────────────────────────────────────────────────────
    function render(c) {
      const F = fit(), W = env.W, v = env.view;
      c.fillStyle = '#e2d7bf'; c.fillRect(0, v.top, W, v.h);
      c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s);
      c.beginPath(); c.rect(0, 0, RW, RH); c.clip();
      if (bake.room) c.drawImage(bake.room, 0, 0, RW, RH);
      if (R.nightA > 0.01) { c.fillStyle = `rgba(20,26,48,${(0.5 * R.nightA).toFixed(3)})`; c.fillRect(0, 0, RW, RH); drawMoon(c); }
      if (R.cranes && R.craneSeq) {
        const gap = 1.3, cross = 4.2, cyc = R.cranes * gap + cross + 2, ct = R.t % cyc;
        for (let i = 0; i < R.cranes; i++) { const k = (ct - i * gap) / cross; if (k >= 0 && k <= 1) crane(c, k * (RW + 120) - 60, 46 + (i % 3) * 22 + Math.sin(t + i) * 5, 0.75, 0.6, t * 5 + i); }
      } else if (R.cranes) for (let i = 0; i < R.cranes; i++) crane(c, ((t * (14 + i * 3) + i * 170) % (RW + 120)) - 60, 46 + (i % 3) * 22 + Math.sin(t + i) * 5, 0.75, 0.6, t * 5 + i);
      for (const sp of persist.splats) if (!sp.tile || !R.splatSolid) { c.globalAlpha = 0.92; splatShape(c, sp.x, sp.y, sp.r, sp.seed); c.globalAlpha = 1; }
      for (const b of R.blist) if (b.sprite && b.alive) { if (b.dayOnly) c.globalAlpha = 1 - R.nightA * 0.92; c.drawImage(b.sprite, b.sx + b.ox, b.sy + b.oy, b.sprite.width / bake.K, b.sprite.height / bake.K); c.globalAlpha = 1; }
      for (const e of R.erasers) if (e.alive || e.rub < 1.3) drawInkWall(c, e);
      for (const bl of R.belts) drawBelt(c, bl);
      for (const p of R.plates) drawPlate(c, p);
      if (R.plant) drawPlant(c);
      for (const s of R.slist) if (s.alive && s.ext > 0.01) drawThorns(c, s);
      for (const cr of R.crates) drawCrate(c, cr);
      for (const s of R.strokes) drawStroke(c, s);
      if (R.tree) drawTree(c);
      for (const l of R.lamps) drawLamp(c, l);
      if (R.cat) drawCat(c);
      if (R.door) drawDoor(c, R.door);
      for (const k of R.keys) if (k.alive && !k.hidden) drawKey(c, k);
      const gh = ghostNow();
      if (gh) drawRonin(c, gh.x, gh.y, gh.f, 0.32, gh.g, true);
      if (!P.dead) drawRonin(c, P.x, P.y, P.face, P.entering ? Math.max(0, 1 - P.entering * 2) : 1, R.gdir, false);
      fx.draw(c);
      if (R.cloud) drawCloud(c);
      if (R.sun) drawSun(c);
      if (R.title) drawTitle(c);
      if (R.seal && !R.seal.used && !sealHidden()) drawSeal(c, R.seal);
      if (R.order) drawScroll(c);
      if (R.darkA > 0.01) {
        const a = R.darkA;
        c.fillStyle = `rgba(14,12,18,${(0.9 * a).toFixed(3)})`; c.fillRect(0, 0, RW, RH);
        c.globalCompositeOperation = 'lighter';
        for (const l of R.lamps) { c.globalAlpha = 0.25 * a; c.drawImage(env.glowSprite('255,200,140'), l.x - 18, l.y - 18, 36, 36); }
        if (R.door && R.door.alpha > 0.1) { c.globalAlpha = 0.6 * a * R.door.alpha; c.drawImage(env.glowSprite('230,90,70'), R.door.x + R.door.ox - 50, R.door.y + R.door.oy - 70, 100, 100); }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        if (R.door) { c.globalAlpha = a; drawDoor(c, R.door, true); c.globalAlpha = 1; }
        if (!P.dead) { c.globalAlpha = a; drawRonin(c, P.x, P.y, P.face, 1, R.gdir, false, true); c.globalAlpha = 1; }
      }
      const fd = Math.max(fade, P.dead ? Math.max(0, (deadT - 0.4) / 0.3) : 0);
      if (fd > 0) { c.fillStyle = `rgba(236,227,207,${fd.toFixed(3)})`; c.fillRect(0, 0, RW, RH); }
      c.restore();
      drawHud(c, F);
    }
    function drawThorns(c, s) {
      for (const tl of s.tiles) {
        const x = tl.x * T + s.ox, y = tl.y * T + s.oy;
        c.save(); c.translate(x + T / 2, y + T / 2); c.rotate({ up: 0, down: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[tl.dir]);
        if (tl.smeared) { c.fillStyle = 'rgba(21,18,15,0.7)'; c.beginPath(); c.ellipse(0, T / 2 - 2, T * 0.6, 3, 0, 0, TAU); c.fill(); c.restore(); continue; }
        const H = T * 0.82 * s.ext;
        c.fillStyle = INK;
        for (let i = 0; i < 2; i++) {
          const bx = -T / 4 + i * T / 2, hh = H * (0.75 + 0.25 * hr(tl.x, tl.y, i)), bw = 9;
          c.beginPath(); c.moveTo(bx - bw / 2, T / 2 + 1); c.quadraticCurveTo(bx - 1, T / 2 - hh * 0.4, bx + 1.5, T / 2 - hh); c.quadraticCurveTo(bx + 1, T / 2 - hh * 0.4, bx + bw / 2, T / 2 + 1); c.fill();
        }
        if (s.wet) { c.fillStyle = 'rgba(40,46,70,0.55)'; c.beginPath(); c.ellipse(0, T / 2 + 1, T * 0.62, 2.6, 0, 0, TAU); c.fill(); c.fillStyle = `rgba(255,255,255,${(0.6 + 0.3 * Math.sin(t * 3 + tl.x)).toFixed(3)})`; for (let i = 0; i < 2; i++) { c.beginPath(); c.ellipse(-T / 4 + i * T / 2 + 1.2, T / 2 - H * 0.5, 1.2, 4, 0.15, 0, TAU); c.fill(); } }
        c.restore();
      }
    }
    function drawInkWall(c, e) {
      // wet ink: a little lighter than the ground, glossy, still dripping (it can be wiped)
      const a = e.alive ? 1 - e.rub * 0.75 : Math.max(0, 1.3 - e.rub) * 0.3;
      c.fillStyle = `rgba(30,26,32,${(a * 0.92).toFixed(3)})`; c.fillRect(e.x, e.y, T, T);
      c.strokeStyle = `rgba(255,255,255,${(a * 0.28).toFixed(3)})`; c.lineWidth = 1.4;
      const sh = (t * 0.6 + e.ty * 0.37) % 1;
      c.beginPath(); c.moveTo(e.x + 5 + sh * 6, e.y + 2); c.lineTo(e.x + 3 + sh * 6, e.y + T - 3); c.stroke();
      if (e.alive && !R.g[e.ty + 1] || (e.alive && R.g[e.ty + 1] && R.g[e.ty + 1][e.tx] !== '%')) {
        const d = 3 + ((t * 3 + e.tx) % 6);
        c.fillStyle = `rgba(30,26,32,${(a * 0.9).toFixed(3)})`; c.beginPath(); c.arc(e.x + T * 0.6, e.y + T + d * 0.3, 1.6, 0, TAU); c.fill();
      }
    }
    function drawStroke(c, s) {
      if (s.pts.length < 2) return;
      const a = clamp(s.life + 0.6, 0, 1) * (s.life < 1 ? 0.55 + 0.45 * s.life : 1);
      c.strokeStyle = `rgba(21,18,15,${a.toFixed(3)})`; c.lineCap = 'round'; c.lineJoin = 'round';
      c.lineWidth = 6; c.beginPath(); s.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
      c.lineWidth = 1.2; c.strokeStyle = `rgba(21,18,15,${(a * 0.5).toFixed(3)})`; c.beginPath(); s.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y - 4) : c.moveTo(p.x, p.y - 4))); c.stroke();
    }
    function drawCrate(c, cr) {
      c.fillStyle = 'rgba(245,238,222,0.9)'; c.fillRect(cr.x + 1, cr.y + 1, T - 2, T - 2);
      c.strokeStyle = INK; c.lineWidth = 2.4; c.strokeRect(cr.x + 1.5, cr.y + 1.5, T - 3, T - 3);
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(cr.x + 3, cr.y + 3); c.lineTo(cr.x + T - 3, cr.y + T - 3); c.moveTo(cr.x + T - 3, cr.y + 3); c.lineTo(cr.x + 3, cr.y + T - 3); c.stroke();
    }
    function drawBelt(c, bl) {
      c.strokeStyle = 'rgba(236,227,207,0.7)'; c.lineWidth = 1.6;
      const off = (t * bl.v) % 18;
      for (let x = bl.x0 + off; x < bl.x1 - 6; x += 18) { c.beginPath(); c.moveTo(x, bl.y + 5); c.lineTo(x + 5, bl.y + 9); c.lineTo(x, bl.y + 13); c.stroke(); }
    }
    function drawPlate(c, p) {
      c.fillStyle = p.down ? RED : 'rgba(184,50,42,0.75)';
      c.fillRect(p.x - 11, p.y - (p.down ? 2 : 5), 22, p.down ? 2 : 5);
      c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(p.x - 11, p.y - (p.down ? 2 : 5), 22, p.down ? 2 : 5);
    }
    function drawKey(c, k) {
      const bob = k.carried || k.falls ? 0 : Math.sin(t * 3 + k.bob) * 2;
      const lit = k.lightOnly && R.dark ? 0.15 : 1;
      c.save(); c.translate(k.x, k.y + bob); c.globalAlpha = lit;
      if (k.hang) { c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -10); c.lineTo(0, -4); c.stroke(); }
      c.strokeStyle = '#a07a2a'; c.fillStyle = '#c9a046'; c.lineWidth = 2.2;
      c.beginPath(); c.arc(-4, 0, 3.6, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(8, 0); c.moveTo(6, 0); c.lineTo(6, 3); c.moveTo(8, 0); c.lineTo(8, 3); c.stroke();
      c.restore();
    }
    function drawLamp(c, l) {
      c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.moveTo(l.x, 0); c.lineTo(l.x, l.y - 12); c.stroke();
      const on = l.on;
      if (on) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + l.lit * 0.3; c.drawImage(env.glowSprite('255,190,120'), l.x - 34, l.y - 34, 68, 68); c.restore(); }
      c.fillStyle = on ? '#f4c27a' : 'rgba(245,238,222,0.95)'; c.strokeStyle = INK; c.lineWidth = 1.8;
      c.beginPath(); c.ellipse(l.x, l.y, 9, 12, 0, 0, TAU); c.fill(); c.stroke();
      c.lineWidth = 1; for (const dy of [-6, 0, 6]) { c.beginPath(); c.moveTo(l.x - 8, l.y + dy); c.lineTo(l.x + 8, l.y + dy); c.stroke(); }
      c.fillStyle = INK; c.fillRect(l.x - 5, l.y - 14, 10, 3); c.fillRect(l.x - 5, l.y + 11, 10, 3);
      if (l.sym) symbol(c, l.sym, l.x, l.y + 24, 6, RED);
    }
    function symbol(c, s, x, y, r, col) {
      c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 1.6;
      if (s === 'sun') { c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.fill(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); c.lineTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15); c.stroke(); } }
      else if (s === 'moon') { c.beginPath(); c.arc(x, y, r, 0, TAU); c.arc(x + r * 0.5, y - r * 0.2, r * 0.85, 0, TAU, true); c.fill('evenodd'); }
      else { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }
    }
    function drawScroll(c) {
      const x = RW / 2, y = 158, w = 120, h = 40;
      c.fillStyle = 'rgba(248,242,228,0.97)'; c.strokeStyle = INK; c.lineWidth = 1.6;
      c.fillRect(x - w / 2, y - h / 2, w, h); c.strokeRect(x - w / 2, y - h / 2, w, h);
      c.fillStyle = INK; c.fillRect(x - w / 2 - 6, y - h / 2 - 3, w + 12, 4); c.fillRect(x - w / 2 - 6, y + h / 2 - 1, w + 12, 4);
      (R.order.reverse ? R.order.want.slice().reverse() : R.order.want).forEach((s, i) => symbol(c, s, x - 36 + i * 36, y - (R.order.reverse ? 4 : 0), 9, INK));
      if (R.order.reverse) { c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x + 30, y + 13); c.lineTo(x - 30, y + 13); c.moveTo(x - 25, y + 9); c.lineTo(x - 30, y + 13); c.lineTo(x - 25, y + 17); c.stroke(); }
    }
    function drawTree(c) {
      const x = R.tree.x, y = R.tree.y;
      c.strokeStyle = INK; c.lineCap = 'round';
      c.lineWidth = 9; c.beginPath(); c.moveTo(x + 40, 11 * T); c.quadraticCurveTo(x + 30, y + 60, x + 28, y + 10); c.stroke();
      c.lineWidth = 4; c.beginPath(); c.moveTo(x + 28, y + 14); c.quadraticCurveTo(x + 10, y - 6, x - 14, y - 10); c.stroke();
      c.fillStyle = 'rgba(21,18,15,0.85)';
      for (let i = 0; i < 9; i++) leaf(c, x - 20 + i * 7, y - 12 + Math.sin(i * 1.7) * 6 + Math.sin(t * 2 + i) * 0.8, -0.4 + i * 0.12, 12);
    }
    function drawPlant(c) {
      const p = R.plant, gg = p.grow;
      c.strokeStyle = '#2e4a2a'; c.fillStyle = '#2e4a2a'; c.lineCap = 'round';
      if (gg <= 0) { c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y); c.quadraticCurveTo(p.x + 3, p.y - 6, p.x + 1, p.y - 10); c.stroke(); leaf(c, p.x + 1, p.y - 9, -0.6, 7); return; }
      const top = p.y - gg * 6.2 * T;
      c.lineWidth = 5; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 4, top); c.stroke();
      for (let y = p.y - 22; y > top; y -= 22) { c.lineWidth = 1.4; c.strokeStyle = INK; c.beginPath(); c.moveTo(p.x - 3, y); c.lineTo(p.x + 7, y); c.stroke(); c.strokeStyle = '#2e4a2a'; }
      if (gg >= 1) {                                               // leaf platforms (solid)
        c.fillStyle = 'rgba(30,58,34,0.95)';
        for (const [tx, ty, w] of [[p.tx - 2, 9, 2], [p.tx + 1, 7, 2]]) { c.beginPath(); c.ellipse((tx + w / 2) * T, ty * T + 4, w * T * 0.55, 6, 0, 0, TAU); c.fill(); }
      }
    }
    function drawCloud(c) {
      const cl = R.cloud;
      c.fillStyle = 'rgba(70,72,78,0.55)';
      for (const [dx, dy, r] of [[-26, 4, 16], [-8, -6, 20], [14, -2, 18], [30, 6, 13], [0, 8, 18]]) { c.beginPath(); c.arc(cl.x + dx, cl.y + dy, r, 0, TAU); c.fill(); }
    }
    function drawSun(c) {
      const s = R.sun;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25; c.drawImage(env.glowSprite('255,140,90'), s.x - 50, s.y - 50, 100, 100); c.restore();
      c.fillStyle = 'rgba(196,58,42,0.9)'; c.beginPath(); c.arc(s.x, s.y, 22, 0, TAU); c.fill();
    }
    function drawMoon(c) {
      const a = R.nightA, y = 70 - 30 * a;
      c.fillStyle = `rgba(245,240,225,${(0.9 * a).toFixed(3)})`; c.beginPath(); c.arc(110, y, 18, 0, TAU); c.fill();
      c.fillStyle = `rgba(20,26,48,${(0.5 * a).toFixed(3)})`; c.beginPath(); c.arc(118, y - 5, 16, 0, TAU); c.fill();
    }
    function drawTitle(c) {
      const ti = R.title;
      c.font = 'italic bold 26px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const w = c.measureText(ti.text).width + 24;
      c.fillStyle = 'rgba(244,237,220,0.98)'; c.fillRect(ti.x - w / 2, ti.y - 18, w, 36);
      c.fillStyle = INK; c.fillText(ti.text, ti.x, ti.y + 1);
      c.strokeStyle = 'rgba(21,18,15,0.4)'; c.lineWidth = 1; c.strokeRect(ti.x - w / 2, ti.y - 18, w, 36);
    }
    function drawSeal(c, s) {
      c.save(); c.translate(s.x, s.y); c.rotate(-0.08);
      const r = s.small ? 9 : 13;
      c.fillStyle = RED; c.beginPath(); c.roundRect(-r, -r, r * 2, r * 2, 3); c.fill();
      c.strokeStyle = 'rgba(245,238,222,0.95)'; c.lineWidth = 1.6; c.strokeRect(-r + 3, -r + 3, r * 2 - 6, r * 2 - 6);
      c.beginPath(); c.moveTo(-r + 6, -2); c.lineTo(r - 6, -2); c.moveTo(0, -r + 6); c.lineTo(0, r - 6); c.moveTo(-r + 6, 4); c.lineTo(r - 6, 4); c.stroke();
      c.restore();
    }
    function drawCat(c) {
      const k = R.cat, aw = k.awake > 0;
      c.fillStyle = INK; c.save(); c.translate(k.x, k.y);
      if (!aw) {
        c.beginPath(); c.ellipse(0, -6, 12, 6.5, 0, 0, TAU); c.fill();
        c.beginPath(); c.arc(9, -8, 5, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(6, -12); c.lineTo(7.5, -16); c.lineTo(9.5, -12); c.moveTo(10, -12); c.lineTo(12, -16); c.lineTo(13, -11); c.fill();
        c.lineWidth = 2.4; c.strokeStyle = INK; c.beginPath(); c.moveTo(-11, -5); c.quadraticCurveTo(-18, -2, -12, 0); c.stroke();
        c.font = 'italic 11px Georgia'; c.fillStyle = 'rgba(21,18,15,0.7)'; c.fillText('z', 14 + Math.sin(t * 2) * 2, -20 - (t * 8 % 10)); c.fillText('z', 20, -28 - (t * 6 % 10));
      } else {
        c.beginPath(); c.ellipse(0, -9, 9, 7, 0, 0, TAU); c.fill();
        c.beginPath(); c.arc(7, -17, 5, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(4, -21); c.lineTo(5, -26); c.lineTo(7.5, -21); c.moveTo(8, -21); c.lineTo(10.5, -26); c.lineTo(11, -20); c.fill();
        c.fillStyle = '#e6c25a'; c.fillRect(8, -18, 1.6, 1.6); c.fillRect(10.5, -18, 1.6, 1.6);
        c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-8, -8); c.quadraticCurveTo(-16, -18 + Math.sin(t * 4) * 3, -10, -24); c.stroke();
      }
      c.restore();
    }
    // the red door: lacquer panel in an ink frame; padlock while locked; painted doors have no depth
    function drawDoor(c, d, glowOnly) {
      if (d.alpha < 0.02) return;
      const x = d.x + d.ox, y = d.y + d.oy;
      c.save(); c.globalAlpha *= d.alpha; c.translate(x, y); if (d.hang) c.scale(1, -1);
      const kn = d.knockFx * Math.sin(t * 60) * 1.2;
      c.translate(kn, 0);
      const open = !d.locked && !d.painted ? 1 : 0;
      // frame
      c.fillStyle = INK; c.fillRect(-15, -44, 30, 44);
      c.fillRect(-19, -47, 38, 4);
      // the panel (slides open a crack when unlocked)
      const slam = d.slam || 0;
      const gap = open ? (R.holdDoor ? 7 * (1 - slam) : 5 + Math.sin(t * 2) * 0.5) : 0;
      if (gap > 0.5) { c.fillStyle = '#ffe3b0'; c.fillRect(-11, -40, 22, 40); }
      c.fillStyle = d.painted ? 'rgba(184,50,42,0.85)' : RED;
      c.fillRect(-11 + gap, -40, 22 - gap, 40);
      if (!d.painted) { c.strokeStyle = 'rgba(21,18,15,0.6)'; c.lineWidth = 1; c.strokeRect(-11 + gap + 2, -37, 18 - gap, 16); c.strokeRect(-11 + gap + 2, -18, 18 - gap, 15); }
      else { c.strokeStyle = 'rgba(21,18,15,0.45)'; c.lineWidth = 0.8; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-11, -38 + i * 8); c.lineTo(11, -36 + i * 8); c.stroke(); } }
      c.fillStyle = '#c9a046'; c.beginPath(); c.arc(6 + gap * 0.5, -20, 1.8, 0, TAU); c.fill();
      // padlock
      if (d.locked && !d.painted && !(R.lockSet && R.lockSet.done)) {
        c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(0, -24, 4, Math.PI, 0); c.stroke();
        c.fillStyle = '#c9a046'; c.fillRect(-5.5, -24, 11, 9); c.fillStyle = INK; c.fillRect(-1, -21, 2, 4);
      }
      if (R.lockSet) { const ids = ['knock', 'still', 'seal']; ids.forEach((id, i) => { c.fillStyle = R.lockSet.open[id] ? 'rgba(201,160,70,0.35)' : '#c9a046'; c.fillRect(-14 + i * 10, -52, 7, 5); }); }
      if (R.tally && R.jumpsLeft > 0) { c.strokeStyle = 'rgba(245,238,222,0.9)'; c.lineWidth = 1.4; for (let i = 0; i < R.jumpsLeft; i++) { const gx = -8 + (i % 5) * 3.6 + (i >= 5 ? 0 : 0), gy = i < 5 ? -36 : -16; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + 0.6, gy + 9); c.stroke(); } }
      if (d.unlockFx > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = d.unlockFx * 0.5; c.drawImage(env.glowSprite('255,200,140'), -40, -60, 80, 80); c.restore(); }
      c.restore();
    }
    // the ronin: straw hat, robe, red scarf
    function drawRonin(c, x, y, face, alpha, gdir, ghostly, inDark) {
      const air = !P.ground && !ghostly, sp = ghostly ? 0 : Math.min(1, Math.abs(P.vx) / RUN), ph = P.run;
      c.save(); c.globalAlpha *= alpha;
      if (!ghostly && !inDark) {
        // scarf (world space)
        c.strokeStyle = ghostly ? 'rgba(184,50,42,0.4)' : RED; c.lineWidth = 3; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); P.scarf.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
      }
      c.translate(x, y); if (gdir < 0) c.scale(1, -1); c.scale(face, 1);
      if (P.land > 0 && !ghostly) c.scale(1 + P.land * 0.12, 1 - P.land * 0.12);
      const ink = ghostly ? 'rgba(21,18,15,0.9)' : INK;
      c.strokeStyle = ink; c.fillStyle = ink; c.lineCap = 'round';
      if (inDark) { c.fillStyle = 'rgba(184,50,42,0.9)'; c.beginPath(); c.arc(1, -18, 2.4, 0, TAU); c.fill(); c.restore(); return; }
      c.lineWidth = 2.6;
      for (const k of [0, 1]) {
        let a1, a2;
        if (air) { a1 = k ? 0.45 : -0.3; a2 = k ? -0.8 : -0.2; }
        else if (sp > 0.05) { const s = Math.sin(ph + (k ? Math.PI : 0)); a1 = s * 0.7 * sp; a2 = -Math.max(0, -Math.cos(ph + (k ? Math.PI : 0))) * sp; }
        else { a1 = k ? 0.1 : -0.1; a2 = 0; }
        const kx = Math.sin(a1) * 5, ky = -8 + Math.cos(a1) * 4.5, fx2 = kx + Math.sin(a1 + a2) * 4.4, fy2 = Math.min(0, ky + Math.cos(a1 + a2) * 4.4);
        c.beginPath(); c.moveTo(0, -8); c.lineTo(kx, ky); c.lineTo(fx2, fy2); c.stroke();
      }
      // robe
      const lean = sp * 0.15;
      c.beginPath(); c.moveTo(-5, -7); c.lineTo(5, -7); c.lineTo(2.5 + lean * 10, -19); c.lineTo(-2.5 + lean * 10, -19); c.closePath(); c.fill();
      c.lineWidth = 2; c.beginPath(); c.moveTo(lean * 10, -17); c.lineTo(lean * 10 + 5 + Math.sin(ph) * 2 * sp, -12); c.stroke();
      // head + straw hat
      c.beginPath(); c.arc(1 + lean * 10, -21.5, 3.6, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-9 + lean * 10, -22); c.quadraticCurveTo(1 + lean * 10, -31, 11 + lean * 10, -22); c.quadraticCurveTo(1 + lean * 10, -24, -9 + lean * 10, -22); c.fill();
      c.fillStyle = 'rgba(236,227,207,0.9)'; c.fillRect(2.4 + lean * 10, -21.8, 1.6, 1.2);
      c.restore();
    }
    function drawHud(c, F) {
      const W = env.W, v = env.view, land = env.land;
      const y0 = land ? v.top + 22 : Math.max(v.top + 46, F.y - 58);
      c.save(); c.textBaseline = 'middle';
      const light = 'rgba(245,238,222,0.97)';
      const txt = (s, x, y, font, al, col, padX) => {
        c.font = font; c.textAlign = al;
        const w = c.measureText(s).width, px = padX === undefined ? 10 : padX, h = parseInt(font.match(/(\d+)px/)[1], 10) + 10;
        const x0 = al === 'center' ? x - w / 2 - px : al === 'right' ? x - w - px : x - px;
        c.fillStyle = 'rgba(21,18,15,0.62)'; c.beginPath(); c.roundRect(x0, y - h / 2, w + px * 2, h, h / 2); c.fill();
        c.fillStyle = col || light; c.fillText(s, x, y + 0.5);
      };
      const tl = Math.ceil(timeLeft), mm = Math.floor(tl / 60), ss = String(tl % 60).padStart(2, '0');
      txt(`${mm}:${ss}`, W / 2, y0, 'bold 20px Georgia, serif', 'center', timeLeft < 20 && Math.sin(t * 8) > 0 ? '#ff9a8a' : light, 14);
      txt(`page ${ri + 1} of ${rooms.length}`, W / 2, y0 + 25, 'italic 11px Georgia, serif', 'center', 'rgba(245,238,222,0.85)');
      txt(`deaths  ${deaths}`, 22, y0, 'bold 13px Georgia, serif', 'left');
      if (R.inkMax) {
        const k = R.inkLeft / R.inkMax, x = 22, y = y0 + 26;
        c.fillStyle = 'rgba(21,18,15,0.62)'; c.beginPath(); c.roundRect(x - 8, y - 9, 104, 18, 9); c.fill();
        c.fillStyle = 'rgba(245,238,222,0.3)'; c.fillRect(x, y - 3, 80, 6); c.fillStyle = light; c.fillRect(x, y - 3, 80 * k, 6);
        c.font = 'italic 10px Georgia'; c.fillStyle = light; c.textAlign = 'left'; c.fillText('ink', x + 84, y + 1);
      }
      if (introT < 2.4 && !R.title) {
        const a = Math.min(1, introT * 2.5) * Math.min(1, (2.4 - introT) * 2);
        c.globalAlpha = a; txt(rooms[ri].name, W / 2, F.y + RH * F.s * 0.24, `italic ${land ? 24 : 18}px Georgia, serif`, 'center', light, 18); c.globalAlpha = 1;
      }
      if (persist.hinted) {
        const hy = land ? F.y + RH * F.s - 30 : F.y + RH * F.s + 30;
        txt('✎ ' + rooms[ri].hint, W / 2, hy - (msgT > 0 ? 28 : 0), `italic ${land ? 14 : 12}px Georgia, serif`, 'center', '#ffd9a0', 14);
      }
      if (msgT > 0) {
        c.globalAlpha = Math.min(1, msgT * 2);
        txt(msg, W / 2, land ? F.y + RH * F.s - 30 : F.y + RH * F.s + 30, `italic ${land ? 16 : 14}px Georgia, serif`, 'center', light, 14);
        c.globalAlpha = 1;
      }
      c.restore();
    }

    loadRoom(ri, false);
    return {
      update, render,
      debug: () => ({ level: LV, room: ri + 1, rooms: rooms.length, deaths, roomDeaths: persist.deaths, hints, time: +timeLeft.toFixed(1), done,
        x: +(P.x / T).toFixed(2), y: +(P.y / T).toFixed(2), ground: P.ground, dead: P.dead, flipped: R.gdir < 0, bot: bot.i,
        locked: R.door ? R.door.locked : null, entering: P.entering > 0,
        keys: R.keys.map(k => [+(k.x / T).toFixed(2), +(k.y / T).toFixed(2), k.hidden ? 'h' : '', k.falls ? 'f' : '', k.carried ? 'c' : '', k.alive ? '' : 'x'].join(' ')), strokes: R.strokes.map(st => +st.life.toFixed(2)) })
    };
  }
})();
