// ============================================================================
// Drift & Bloom — TRAP TEMPLE (Adventure round 7). A trap gauntlet in the spirit of Trap Adventure 2, in its own look:
// a little raccoon thief breaks into a sandstone temple for the Golden Seed. Chunky pixel art, one fixed screen per
// stage, and every stage lies in layers: the trap you learn is never the last one. Spikes grow on the block you
// stop on, the landing lip bites, a stepping stone tears loose and hunts you, the start crushes you if you run back,
// the exit edge sprouts spikes and a plank swings down where careful players stop. Same script every time: learn it.
// A level = a run of 3 stages with 5 lives; out of lives = GAME OVER and the run starts again (the round clock is
// what's really at stake). Stage numbers count up across the temple (1-30), like the original.
// Feel: a tiny hero, a snappy run, a high floaty jump with full air steering (let go early to cut it short).
// Physics runs in fixed 1/120 s ticks, so every scripted trap (and the test autopilot) plays out the same every time.
//
// A stage = an ASCII map (32 x 15 tiles of 26 px) + setup(R), a script of triggers (the R api below).
//   .  air          #  stone          S  start          E  the way out (an opening at the screen edge)
//   ^ v < >  bone spikes (always out)   A-Z (not E/S/D/Q/H)  hidden spikes (a group: R.pop / R.hide / R.fall ...)
//   a-z  stone that moves (a group: R.drop / R.$('a').move ...; not v)   ~  fake stone (you fall through)
//   +  invisible stone   %  stone that crumbles when R.chase() runs   *  spring   1-9  saw blades
//   (and the rest of the Liar's Path engine: aim traps, holes, hunting spikes, fragile ground, rings, ladders ...)
//   R.flyer(id, o): a block that tears loose: .hunt() steers at you, .loop(path) flies round and comes home, .tumble()
//   R.plank(o): a spiked plank on a hinge that swings down (.swing() / .back())   R.spikeDir(id, dir): point a group
//   R.still(s): a condition, you've stood still s seconds   R.spikeUp(id): its spikes are out
// bot: the stage's solution as autopilot steps (tests: window.__templeBot = true), so every stage is proven
// beatable. Test a level: game.html?world=temple&lv=1 (&room=2 to start on a stage).
// ============================================================================
(function () {
  'use strict';
  const T = 26, VIEW_C = 32, VIEW_R = 15, TAU = Math.PI * 2;
  let COLS = 32, ROWS = 15, RW = COLS * T, RH = ROWS * T;      // the current stage (set by grid())
  // feel (from Trap Adventure 2 footage, not its art): a tiny hero at 4.5 tiles/s with almost no wind-up, a high
  // floaty jump (~3.2 tiles held, ~0.95 s in the air) you can steer all the way; letting go early cuts it
  const RUN = 118, ACC = 2400, DEC = 3200, AIR_ACC = 1500, AIR_DEC = 900;
  const G_UP = 740, G_DN = 740, JUMP_V = 350, CUT = 0.45, MAXF = 560, COYOTE = 0.07, BUFFER = 0.1;
  const SPRING_V = 470, SPRING_HI = 560;
  const PW = 10, PH = 20, STEP = 1 / 120, LIVES = 5;
  const E = '.'.repeat(32), G = '#'.repeat(32);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const EASE = { lin: k => k, io: k => k * k * (3 - 2 * k), in: k => k * k, out: k => 1 - (1 - k) * (1 - k), slam: k => k * k * k };
  function hr(x, y, k) {                                  // stable per-tile randomness (art)
    let h = (x * 374761393 + y * 668265263 + (k || 0) * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ── the stages, level by level (3 a level; stage numbers count across the temple) ─────────────────────
  const fill = (n, s) => Array(n).fill(s);
  // route pieces the bait runs share (a bait = the move a player falls for + the death it must cause; tools/trapcheck.js)
  const ST2_TOP = [['go', 4.3], ['hopto', () => ({ x: 7.5 })], ['hopto', () => ({ x: 10.5 })], ['hopto', () => ({ x: 13.5 })]];
  const ST2_LEDGE = [...ST2_TOP, ['hopto', () => ({ x: 17.6 }), 0.5]];
  const ST3_LEDGE = [['go', 3.3], ['hopto', () => ({ x: 7.5 })], ['hopto', () => ({ x: 3.5 })], ['go', 1.2],
    ['until', R => R.flyerState('b') === 'home' && R.isSolid('a')],
    ['go', 3.3], ['hopto', () => ({ x: 7.5 })], ['hopto', () => ({ x: 10.5 })], ['hopto', () => ({ x: 15.2 })]];
  // stage 4: jump the boulder as it comes at you (run at it, jump about 3.8 tiles off its middle)
  const BOULDER_NEAR = d => (R, p) => { const b = R.boulderAt(0); return !!b && b.ground && b.vx < 0 && b.x - p.x <= d; };
  const JUMP_BOULDER = [['go', 5.2], ['go', 8.0], ['until', BOULDER_NEAR(6.2)], ['dir', 1], ['until', BOULDER_NEAR(3.8)], ['jump', 0.5], ['land']];
  const PAST_BUMP = [...JUMP_BOULDER, ['go', 15.3], ['jumpAt', 15.4, 0.3], ['land'], ['go', 19.8], ['jumpAt', 20.2, 0.25], ['land']];
  const ST6_GATE = [['go', 12.45], ['jumpAt', 12.65, 0.12], ['land'], ['go', 29.2]];
  // stage 10: cross a saw's column only while that saw is heading away from mid-height
  const SAW_AWAY = i => R => { const sw = R.sawAt(i); return (sw.y - 8.2) * sw.vy > 0 && Math.abs(sw.y - 8.2) > 1.0; };
  const ST10_FIELD = [['go', 5.6], ['swimto', 6.2, 8.2],
          ['until', SAW_AWAY(0)], ['swimto', 8.75, 8.2],
          ['until', SAW_AWAY(4)], ['swimto', 11.25, 8.2],
          ['until', SAW_AWAY(1)], ['swimto', 13.75, 8.2],
          ['until', SAW_AWAY(5)], ['swimto', 16.25, 8.2],
          ['until', SAW_AWAY(2)], ['swimto', 18.75, 8.2],
          ['until', SAW_AWAY(6)], ['swimto', 21.25, 8.2],
          ['until', R => R.sawAt(3).y < 6.5 && R.sawAt(3).vy < 0], ['swimto', 24.2, 8.2]];
  // stage 7: high over the floor spears, low under the ceiling ones
  const ST7_SWIM = [['go', 7.8], ['swimto', 8, 9.8], ['swimto', 10.6, 9.45], ['swimto', 13.2, 9.45], ['swimto', 14.4, 11.55], ['swimto', 16.2, 11.55],
    ['swimto', 17.2, 9.45], ['swimto', 19.2, 9.45], ['swimto', 20.4, 11.55], ['swimto', 22.4, 11.55]];
  const STAGES = [null,
    // ── Level 1: the sandstone gate
    [
      // 1. nothing happens here. Remember that.
      { name: 'Welcome', t: 40,
        map: [...fill(6, G),
          '##############a#################',
          ...fill(4, '...............................E'),
          '..S............................E',
          ...fill(3, G)],
        setup(R) { R.sign(5, 11, 'KEEP OUT'); R.when(R.at(16.2), () => R.$('a').move(0, 5, 0.32, 'in').call(() => R.slamFx('a'))); },
        bot: [['go', 31.5]] },
      // 2. three stepping stones. Every way across has an answer waiting.
      { name: 'Stepping stones', t: 90,
        map: [G,
          'aaaaa..........................#',
          'aaaaa..........................#',
          '...............................E',
          '.............C.................E',
          '.............c.................E',
          '................L.............FE',
          '..........#.....################',
          '................################',
          '.S.....#........################',
          '#####...........################',
          '#####...........################',
          '#####...........################',
          '#####^^^^^^^^^^^################',
          G],
        setup(R) {
          // stop on the top stone and it grows spikes; go back and it tears loose and hunts you; back at the start, the ceiling
          const b3 = R.flyer('c', { spikes: 'C' });
          R.when(R.stand('c'), () => R.pop('C', 0.22));
          R.when(p => R.spikeUp('C') && p.ground && p.x < 12, () => b3.hunt(2.4, 2.2, 3.0));
          let wentOut = false;
          R.when(p => p.ground && p.x >= 9.6, () => { wentOut = true; });
          R.when(p => wentOut && p.ground && p.x < 5.2, () => R.$('a').move(0, 7, 0.22, 'in').call(() => R.slamFx('a')));
          // the lip of the far ledge bites where a short jump comes down
          R.popOnAim('L');
          // the pillar by the way out topples; then the way out grows a spike whenever you're near (jump it)
          const pillar = R.plank({ x: 30.5, y: 7, len: 4.4, a0: -Math.PI / 2, a1: -Math.PI, warn: 0.35, dur: 0.5, thick: 0.9, shatter: true });
          R.when(R.at(26.3), () => pillar.swing());
          R.spikeDir('F', 'left');
          R.every(R.at(27.6), () => R.pop('F'));
          R.every(R.atL(26), () => R.hide('F'));
        },
        bot: [...ST2_LEDGE, ['go', 26.5], ['go', 23.2], ['wait', 1.1], ['jumpAt', 27.0, 0.45], ['run', 31.5]],
        baits: [
          { cause: 'spike', bot: [...ST2_TOP, ['wait', 1.0]] },                                   // stop on the top stone to look
          { cause: 'spike', bot: [...ST2_TOP, ['hopto', () => ({ x: 16.6 })]] },                   // a short hop onto the far lip
          { cause: 'block', bot: [...ST2_TOP, ['hopto', () => ({ x: 10.5 })], ['wait', 4]] },      // step back to think: it comes for you
          { cause: 'crush', bot: [['go', 4.3], ['hopto', () => ({ x: 7.5 })], ['hopto', () => ({ x: 10.5 })], ['hopto', () => ({ x: 7.5 })], ['hopto', () => ({ x: 3.5 })], ['wait', 1.5]] },   // all the way back to the start
          { cause: 'plank', bot: [...ST2_LEDGE, ['go', 28.0], ['wait', 2]] },                      // walk up to the way out
          { cause: 'spike', bot: [...ST2_LEDGE, ['go', 26.5], ['go', 23.2], ['wait', 1.1], ['go', 31.5]] }   // walk out (don't jump)
        ] },
      // 3. two stones: the second one won't wait for you, the first won't hold you, the way out won't let you stand
      { name: 'Two stones', t: 90,
        map: [G, G,
          '....................vvvvvvvvvvv#',
          '...............................E',
          '...............................E',
          '.S............................FE',
          '####...a..b...######rrrrrrrrrr##',
          '####..........######rrrrrrrrrr##',
          '####..........######rrrrrrrrrr##',
          ...fill(4, '####..........##################'),
          '####^^^^^^^^^^##################',
          G],
        setup(R) {
          const b2 = R.flyer('b');
          R.fragile('a', 0.9, 2.5);
          // land on the first stone and the second goes for a fly round the room (once), over the start ledge's lip
          R.when(R.stand('a'), () => b2.loop([[9.5, 10.5], [5.5, 10.5], [3, 5.5], [6.5, 3], [9.5, 3.5]], 8));
          R.when(R.stand('b'), () => R.drop('a'));
          // the way out: a spike that comes and goes, a floor that lifts you into the ceiling if you stand on it
          R.spikeDir('F', 'left');
          R.when(R.at(26.8), () => { const c = R.$('F'); c.pop(); c.wait(1.4); c.hide(); c.wait(1.0); c.loop(); });
          R.every(p => p.ground && p.on === 'r' && p.still >= 0.3, () => { const c = R.$('r'); if (c.phase) return; c.move(0, -3, 0.35, 'out', 'up').wait(1.0).move(0, 3, 0.5, 'io', 'down'); });
        },
        bot: [...ST3_LEDGE, ['go', 27.0], ['jumpAt', 28.8, 0.12], ['run', 31.5]],
        baits: [
          { cause: 'spike|block', bot: [['go', 3.3], ['hopto', () => ({ x: 7.5 })], ['hopto', () => ({ x: 10.5 })], ['wait', 2]] },   // stone, stone: the second one's gone
          { cause: 'block', bot: [['go', 3.3], ['hopto', () => ({ x: 7.5 })], ['hopto', () => ({ x: 3.5 })], ['wait', 3]] },          // back to the safe ledge, at its lip
          { cause: 'spike', bot: [['go', 3.3], ['hopto', () => ({ x: 7.5 })], ['wait', 3]] },                                          // wait on the first stone
          { cause: 'spike', bot: [...ST3_LEDGE, ['go', 31.5]] },                                                                       // walk out
          { cause: 'spike', bot: [...ST3_LEDGE, ['go', 24.0], ['wait', 2]] },                                                          // stand and think
          { cause: 'spike', bot: [...ST3_LEDGE, ['go', 27.0], ['jumpAt', 28.3, 0.5]] }                                                 // a big jump at the way out
        ] }
    ],
    // ── Level 2: the sandstone gate, deeper in
    [
      // 4. a boulder that patrols the hall; a ditch that looks like shelter; bricks at the door; a door step that isn't
      { name: 'Rolling stone', t: 90,
        map: [G, G,
          ...fill(7, '...............................#'),
          '...............................E',
          '...............................E',
          '.S...................#.........E',
          '################..############~#',
          '################pp############.#',
          '################pp############.#'],
        setup(R) {
          R.when(R.at(5), () => R.boulder({ x: 26, y: 3.5, r: 1.4, vx: -3.6, hop: 2.3 }));
          R.when(p => p.ground && p.x >= 15.9 && p.x <= 18.1 && p.y >= 12.9, () => R.drop('p'));
          R.when(R.at(26.5), () => R.rain([[29, 0.05], [28, 0.2], [27, 0.35], [29, 0.5], [28, 0.65], [27, 0.8]], { y: 2 }));
        },
        bot: [...PAST_BUMP, ['go', 26.7], ['go', 24.6], ['wait', 1.4], ['go', 28.6], ['jumpAt', 28.7, 0.3], ['run', 31.5]],
        baits: [
          { cause: 'boulder', bot: [['go', 20]] },                                                     // just walk
          { cause: 'fall', bot: [...JUMP_BOULDER, ['go', 17], ['wait', 1]] },                          // shelter in the ditch
          { cause: 'drop', bot: [...PAST_BUMP, ['go', 29.4], ['wait', 1]] },                                     // straight for the door
          { cause: 'fall', bot: [...PAST_BUMP, ['go', 26.7], ['go', 24.6], ['wait', 1.4], ['go', 31.5]] }        // walk out
        ] },
      // 5. the temple's toy: ride the paddle while the ball smashes the bars; get down through what it breaks
      { name: 'Stone game', t: 100,
        map: [G, G,
          '.SKKKKKKKKKKKKKKKKKKKKKKKKKKKK##',
          '##pppp........................##',
          '##............................##',
          '##............................##',
          '##$$$$$$$$$$$$$$$$$$$$$$$$..$$##',
          '##$$$$$$$$$$$$$$$$$$$$$$$$..$$##',
          '##$$$$$$$$$$$$$$$$$$$$$$$$..$$##',
          '##$$$$$$$$$$$$$$$$$$$$$$$$..$$##',
          '##.............................E',
          '##.............................E',
          '##........................MM...E',
          '##^^^^^^^^^^^^^^^^^^^^^^########',
          G],
        setup(R) {
          R.sign(1, 1, 'TEMPLE TOY');
          // the ball starts when the stage does; the paddle (and the ceiling's clock) when you step on it
          R.ball({ x: 16, y: 4.5, vx: -3.4, vy: 4.6, delay: 1.2, plow: 4 });
          R.when(p => p.ground && p.on === 'p', () => { R.$('p').move(22, 0, 4.2, 'io').move(-22, 0, 4.2, 'io').loop(); R.after(7, () => R.pop('K')); });
          // the shaft down the right side is the way, but drop straight down it and the floor bites
          R.popOnAim('M');
        },
        bot: [['go', 3.4], ['until', R => R.$('p').ox >= 21.9 * 26], ['go', 28.6], ['land'], ['go', 26.9], ['dir', 1], ['land'], ['go', 31.5]],
        baits: [
          { cause: 'spike|ball', bot: [['go', 26.9], ['dir', 1], ['land'], ['go', 31.5]] },                            // skip the ride: walk the bars
          { cause: 'spike', bot: [['go', 3.4], ['wait', 9]] },                                                          // enjoy the ride
          { cause: 'spike', bot: [['go', 3.4], ['until', R => R.$('p').ox >= 21.9 * 26], ['go', 28.6], ['land'], ['go', 26.9], ['land'], ['wait', 1]] }   // straight down the shaft
        ] },
      // 6. the golden idol. Take it: the gate opens, and something rolls in behind you
      { name: 'The idol', t: 90,
        map: ['hhh#############################',
          'hhh#############################',
          ...fill(6, '...............................#'),
          ...fill(3, '..............................gE'),
          '.S...&..........BB............gE',
          '#############..#################',
          '#############^^#################',
          G],
        setup(R) {
          R.onIdol(() => {
            R.$('g').move(0, -4, 0.45, 'io');
            R.$('h').move(0, -2.2, 0.25, 'out');
            R.boulder({ x: 1.5, y: 2.6, r: 1.4, vx: 3.8, delay: 0.25 });
          });
          // jump the spiked ditch and you come down on hidden spikes (land short, or land long)
          R.popOnAim('B');
          // the gate slams when you get close and lifts again; for a moment after, stepping under it slams it on you
          R.when(p => R.idolTaken && p.x >= 27, () => {
            R.$('g').move(0, 4, 0.12, 'in').call(() => R.slamFx('g')).wait(0.7).move(0, -4, 0.15, 'out')
              .call(() => { R.flag.armed = true; }).wait(0.6).call(() => { if (R.flag.armed) { R.flag.armed = false; R.flag.gate = true; } });
          });
          R.every(p => R.flag.armed && p.x >= 29.75, () => { R.flag.armed = false; R.$('g').stop().move(0, 4, 0.08, 'in').call(() => R.slamFx('g')).wait(0.6).move(0, -4, 0.2, 'out').call(() => { R.flag.gate = true; }); });
        },
        bot: [...ST6_GATE, ['until', R => R.flag.gate], ['go', 31.5]],
        baits: [
          { cause: 'spike', bot: [['go', 11.9], ['jumpAt', 12.0, 0.5], ['land'], ['wait', 1]] },          // a good big jump over the ditch
          { cause: 'boulder', bot: [['go', 6.2], ['wait', 4]] },                                          // admire the idol
          { cause: 'crush', bot: [...ST6_GATE, ['until', R => R.flag.armed], ['go', 31.5]] },            // through the first gap
          { cause: 'crush', bot: [['go', 12.45], ['jumpAt', 12.65, 0.12], ['land'], ['go', 31.5]] }       // never stop
        ] }
    ],
    // ── Level 3: the flooded halls
    [
      // 7. a flooded tunnel: spears come out where you're about to be; the bright shaft up is not the way
      { name: 'Wet feet', t: 100,
        map: [G, G,
          '.........#############zz########',
          '.S.......#############..########',
          ...fill(5, '#######::#############::########'),
          ...fill(3, '#######::::::::::::::::::::::###'),
          '###########################::::E',
          '###########################::::E',
          G],
        setup(R) {
          const s12 = R.spear(12, 12, -1, 2), s15 = R.spear(15, 9, 1, 2), s18 = R.spear(18, 12, -1, 2), s21 = R.spear(21, 9, 1, 2);
          R.when(R.at(10.4), () => s12.pop()); R.when(R.at(13.4), () => s15.pop()); R.when(R.at(16.4), () => s18.pop()); R.when(R.at(19.4), () => s21.pop());
          R.lure(22, 3, 23, 3);
          R.when(p => p.x >= 21.8 && p.x <= 24.2 && p.y < 8.7, () => R.$('z').move(0, 9, 0.5, 'in').call(() => R.slamFx('z')));
        },
        bot: [...ST7_SWIM, ['swimto', 27.8, 11.4], ['swimto', 28.6, 12.8], ['swimto', 31.5, 12.8]],
        baits: [
          { cause: 'spear', bot: [['go', 7.8], ['swimto', 8, 10.4], ['swimto', 27, 10.4]] },                   // straight down the middle
          { cause: 'spear', bot: [['go', 7.8], ['swimto', 8, 9.8], ['swimto', 10.6, 9.45], ['swimto', 27, 9.45]] },   // hug the ceiling all the way
          { cause: 'crush', bot: [...ST7_SWIM, ['swimto', 22.6, 9.5], ['swimto', 22.6, 5.5], ['wait', 2]] }    // up toward the light
        ] },
      // 8. a stone frog that spits where you're going; spikes along the easy way over the top; a slot that bites shut
      { name: 'The sentry', t: 100,
        map: ['#############EE#################',
          ...fill(3, '############l::r################'),
          '##::::::::::::::CCCCCCCCC:......',
          '##::::::::::::::::::::::::......',
          '##::::::::::::::::::::::::......',
          '##::::::::::::::::::::::::...S..',
          '##::::::::::::::::::::::::######',
          ...fill(4, '##::::::::::::::::::::::::######'),
          '################################',
          G],
        setup(R) {
          R.shooter({ x: 4, y: 12, every: 1.5, speed: 4.6, lead: 'intercept', first: 1.0 });
          R.when(p => p.x >= 15.6 && p.x <= 25.4 && p.y - 0.4 < 5.2 && p.y > 3.9, () => R.pop('C'));
          // the slot up to the way out: one stroke won't get you through, and it bites shut on whoever's in it
          R.every(p => p.x >= 12.9 && p.x <= 15.1 && p.y < 4.3, () => {
            if (R.$('l').phase) return;
            R.$('l').wait(0.45).move(1, 0, 0.08, 'in', 'bite').wait(0.8).move(-1, 0, 0.3, 'io');
            R.$('r').wait(0.45).move(-1, 0, 0.08, 'in', 'bite').wait(0.8).move(1, 0, 0.3, 'io');
          });
        },
        bot: [['go', 25.5], ['swimto', 23.5, 6.6], ['wait', 0.6], ['swimto', 17.5, 6.6], ['swimto', 14.0, 5.4], ['swimto', 14.0, 0.4, 'fast']],
        baits: [
          { cause: 'spike', bot: [['go', 25.5], ['swimto', 24, 4.5], ['swimto', 14.0, 4.5]] },                 // along the top
          { cause: 'shot', bot: [['go', 25.5], ['swimto', 24, 7], ['swimto', 6, 7], ['wait', 4]] },             // a steady swim across
          { cause: 'crush', bot: [['go', 25.5], ['swimto', 23.5, 6.6], ['wait', 0.6], ['swimto', 17.5, 6.6], ['swimto', 14.0, 4.9], ['wait', 0.25], ['jump', 0.05], ['wait', 1.5]] }   // one stroke up the slot
        ] },
      // 9. a grid of urchins that wake and follow; the grate over the way out stays shut while any are awake
      { name: 'Urchins', t: 110,
        map: [G, G,
          '................................',
          '.S..............................',
          '#####:::::::::::::::::::::::::##',
          ...fill(8, '##::::::::::::::::::::::::::::##'),
          '##::::::::::::::::::::::::gg::##',
          '##########################EE####'],
        setup(R) {
          R.urchins([[10, 6], [12, 6], [14, 6], [16, 6], [18, 6], [20, 6], [10, 8], [12, 8], [14, 8], [16, 8], [18, 8], [20, 8]], { wake: 2.6, speed: 1.7, life: 7 });
          R.urchins([[24, 11], [29, 11]], { wake: 2.6, speed: 1.6, life: 6 });
          R.grate('g');
          R.every(() => R.urchinsAwake() > 0, () => R.gate('g', false));
          R.every(() => R.urchinsAwake() === 0, () => R.gate('g', true));
        },
        bot: [['go', 5.5], ['swimto', 6, 13.5], ['swimto', 22.8, 13.5], ['swimto', 5, 13.5], ['until', R => R.urchinsAwake() === 0], ['swimto', 26.5, 13.5], ['swimto', 26.5, 14.6]],
        baits: [
          { cause: 'urchin', bot: [['go', 5.5], ['swimto', 7, 4.6], ['swimto', 22, 4.6], ['wait', 4]] },                      // across the top, past the grid
          { cause: 'urchin', bot: [['go', 5.5], ['swimto', 6, 13.5], ['swimto', 26.5, 13.5], ['wait', 4]] }                   // straight to the grate (its guard wakes)
        ] }
    ],
    // ── Level 4: the flooded halls, deeper
    [
      // 10. two rows of saws sweep up and down, in turn. Between their columns you're safe; crossing one, time it.
      // The quiet lane down the right side is not quiet.
      { name: 'Saw tide', t: 110,
        map: [G, G,
          '.....###########################',
          '.S...::::::::::::::::::::::::###',
          ...fill(8, '#####:::::::::::::::::::::w::###'),
          '#####::::::::::::::::::::::::###',
          '##########################::####',
          '##########################EE####'],
        setup(R) {
          // row A (top first) at columns 7.5 12.5 17.5 22.5; row B (bottom first) at 10 15 20 (centres, tiles)
          for (const x of [7.5, 12.5, 17.5, 22.5]) R.saw({ x, y: 4.0 }).go([[x, 12.4], [x, 4.0]], 3.0, true);
          for (const x of [10, 15, 20]) R.saw({ x, y: 12.4 }).go([[x, 4.0], [x, 12.4]], 3.0, true);
          // the lane: stay in it and its wall slides over
          R.every(p => p.x >= 26.95 && p.y > 4.5 && p.y < 12.6, () => { const c = R.$('w'); if (c.phase) return; c.wait(0.7).move(2, 0, 0.18, 'in', 'shut').wait(1.0).move(-2, 0, 0.4, 'io'); });
        },
        bot: [...ST10_FIELD, ['swimto', 26.5, 12.4], ['swimto', 26.5, 14.6]],
        baits: [
          { cause: 'saw', bot: [['go', 5.6], ['swimto', 6.2, 8.2], ['swimto', 24, 8.2], ['wait', 3]] },                       // straight across
          { cause: 'crush', bot: [...ST10_FIELD, ['swimto', 24.2, 3.6], ['swimto', 27.5, 3.6], ['swimto', 27.5, 10], ['wait', 2]] }   // down the quiet lane
        ] },
      // 11. the hall floods and drains, over and over. Cross the pit while it's deep, ride the next flood up to the door.
      // Don't stroke at the surface (the ceiling has teeth), and don't be over the pit when it drains: it pulls.
      { name: 'Flood gate', t: 110,
        map: [G,
          '##vvvvvvvvvvvvvvvvvvvvvvvvvvvv##',
          '##............................##',
          '##.............................E',
          '##.............................E',
          ...fill(7, '##............................##'),
          '##.S......^^^^^^^.............##',
          G, G],
        setup(R) {
          R.flood(15);
          R.floodCycle([[15, 1, 2.6], [3.2, 5.5, 2.2], [15, 5.5, 0]]);
          R.pull(15.5, 55);                                   // (while it drains, the water drags you toward the pit's middle)
        },
        bot: [['go', 8.4], ['until', R => R.floodRow < 6], ['swimto', 9, 4.8], ['swimto', 21, 4.8], ['until', R => R.floodRow > 14.5],
          ['go', 26], ['until', R => R.floodRow < 5.2], ['swimto', 28.6, 4.6], ['swimto', 31.5, 4.6]],
        baits: [
          { cause: 'spike', bot: [['go', 8.4], ['until', R => R.floodRow < 6], ['swimto', 9, 4.8], ['jump', 0.05], ['wait', 0.2], ['jump', 0.05], ['wait', 0.2], ['jump', 0.05], ['wait', 2]] },   // splash at the surface
          { cause: 'spike', bot: [['go', 8.4], ['until', R => R.floodRow < 6], ['swimto', 15, 6], ['wait', 9]] }      // float over the pit
        ] },
      // 12. a big fish rams through the brick walls: follow it, hide in a niche when it turns back. The door at the end
      // is stage 2's door again, except it isn't.
      { name: 'Sunken door', t: 110,
        map: [G, G,
          ...fill(3, '##########################.....E'),
          ...fill(2, '##########################:#####'),
          ...fill(2, '############:#####:#####:#:#####'),
          ...fill(3, '##:::::::$:::::$:::::$:::::#####'),
          '##:S:::::$:::::$:::::$:::::#####',
          G, G],
        setup(R) {
          R.cracked();
          R.fish({ x: 5, y: 11.0, vx: 3.4, w: 1.7, h: 0.95 });
          // the door: this pillar falls away from you. Back off like last time and the ceiling's plank gets you.
          const pillar = R.plank({ x: 29.5, y: 5, len: 3.0, a0: -Math.PI / 2, a1: 0, warn: 0.35, dur: 0.45, thick: 0.9, shatter: true });
          const plank = R.plank({ x: 26, y: 2.2, len: 3.0, a0: 0, a1: Math.PI / 2, dur: 0.22, thick: 0.55, hold: 1.2 });
          R.when(R.at(28.0), () => { pillar.swing(); R.flag.armed = true; });
          R.every(p => R.flag.armed && p.x < 27.4, () => plank.swing());
        },
        bot: [['until', R => R.fishAt(0).x > 14], ['swimto', 12.5, 11.0], ['until', R => R.fishAt(0).x > 20], ['swimto', 18.5, 11.0], ['swimto', 18.5, 8.0],
          ['until', R => R.fishAt(0).vx < 0 && R.fishAt(0).x < 16.5], ['swimto', 18.5, 11.0], ['swimto', 26.5, 11.0], ['swimto', 26.5, 5.6],
          ['dir', 1], ['jump', 0.05], ['until', (R, p) => p.x > 27.4], ['dir', 0], ['land'], ['go', 28.3], ['wait', 1.3], ['go', 31.5]],
        baits: [
          { cause: 'fish', bot: [['swimto', 26, 11.0], ['wait', 12]] },                                                                       // swim on ahead
          { cause: 'plank', bot: [['until', R => R.fishAt(0).x > 14], ['swimto', 12.5, 11.0], ['until', R => R.fishAt(0).x > 20], ['swimto', 18.5, 11.0], ['swimto', 18.5, 8.0],
            ['until', R => R.fishAt(0).vx < 0 && R.fishAt(0).x < 16.5], ['swimto', 18.5, 11.0], ['swimto', 26.5, 11.0], ['swimto', 26.5, 5.6],
            ['dir', 1], ['jump', 0.05], ['until', (R, p) => p.x > 27.4], ['dir', 0], ['land'], ['go', 28.3], ['go', 26.9], ['wait', 1]] }  // back off from the falling pillar, like at stage 2
        ] }
    ]
  ];

  const TAUNT = {
    spike: ['Spikes. Obviously.', 'That was always there. Probably.', 'Sharp, isn’t it?', 'The temple keeps its teeth clean.'],
    fall: ['The floor had other plans.', 'Down you go.', 'Mind the gap. There was a gap.'],
    crush: ['Flat raccoon.', 'Look up next time.', 'The ceiling had plans.', 'Squish.'],
    block: ['It was a stepping stone. Was.', 'Bricks fly here.', 'It came back for you.'],
    plank: ['Thwack.', 'You stopped. It didn’t.', 'Never stop at the door.'],
    saw: ['Whirr.', 'Should’ve run.'],
    boulder: ['Indiana Raccoon.', 'It rolls. You don’t.', 'Round and round.', 'Flat raccoon, round rock.'],
    drop: ['Look up.', 'The ceiling sheds.', 'It rains bricks here.'],
    ball: ['Game over? Not yet. Now it is.', 'You were the brick.', 'Breakout. Broke.'],
    shot: ['It saw where you were going.', 'Seed-bombed.', 'The frog leads its target.'],
    urchin: ['Prickly.', 'They wake up grumpy.', 'Never pet an urchin.'],
    fish: ['Big fish.', 'It rams. You don’t.', 'Swim faster.'],
    spear: ['Skewered.', 'High, then low. Or low, then high.', 'It came up where you were going.'],
    any: ['Again.', 'The temple remembers. Do you?', 'One more time.', 'Same trap. Same you.']
  };

  window.__templeBaits = () => STAGES.slice(1).map(st => st.map(r => (r.baits || []).map(b => b.cause)));   // (tools/trapcheck.js)
  DABWorlds.register('temple', {
    title: 'Trap Temple', color: '214,160,92', opaque: true, hud: 'none',
    landscape: { top: 0, h: RH },
    music: 'music_temple',
    sounds: ['tt_jump', 'tt_land', 'tt_die', 'tt_pop', 'tt_crumble', 'tt_slam', 'tt_door', 'tt_saw', 'tt_exit', 'tt_flip', 'tt_thunder', 'tt_spring', 'tt_clank', 'tt_bounce', 'tt_grind', 'tt_whoosh', 'tt_over'],
    subtitle: () => 'A little raccoon thief, a sandstone temple, and the Golden Seed at the bottom of it. Every stage lies, in layers.',
    hint: 'Reach the way out. The trap you just learned is not the last one.',
    howto: ['◀ ▶ run  ·  jump (hold = higher, steer in the air)', '5 lives a run. Out of lives = back to the run’s first stage.'],
    rooms: () => STAGES.slice(1).map(st => st.map(r => r.name)),   // Test Lab: stage names per level
    controls: { dirs: 'lr', buttons: [{ id: 'jump', icon: 'jump' }], layout: 'platform' },
    create
  });

  // ── map parsing ─────────────────────────────────────────────────────────
  const GROUP = ch => ch >= 'a' && ch <= 'z' && ch !== 'v';            // 'v' is a thorn, not a group
  const SOLIDISH = ch => ch === '#' || ch === '=' || ch === '%' || ch === '~' || GROUP(ch);
  function grid(rows) {
    ROWS = Math.max(VIEW_R, rows.length); COLS = Math.max(VIEW_C, ...rows.map(r => r.length)); RW = COLS * T; RH = ROWS * T;
    const g = [];
    for (let y = 0; y < ROWS; y++) {
      const s = rows[y] || '.'.repeat(COLS);
      if (s.length !== COLS) console.warn('[temple] row', y, 'is', s.length, 'wide:', s);
      g.push(s.padEnd(COLS, '.').slice(0, COLS).split(''));
    }
    return g;
  }
  // tiles -> rects, merged along rows
  function rowRects(tiles) {
    const set = new Set(tiles.map(([x, y]) => x + ',' + y)), out = [];
    const ys = [...new Set(tiles.map(t => t[1]))].sort((a, b) => a - b);
    for (const y of ys) {
      const xs = tiles.filter(t => t[1] === y).map(t => t[0]).sort((a, b) => a - b);
      let s = null, p = null;
      for (const x of xs) { if (s === null) { s = p = x; } else if (x === p + 1) p = x; else { out.push({ x: s * T, y: y * T, w: (p - s + 1) * T, h: T }); s = p = x; } }
      if (s !== null) out.push({ x: s * T, y: y * T, w: (p - s + 1) * T, h: T });
    }
    return out;
  }

  // a scripted thing (ground group, thorn group, door, saw): offsets + a queue of motions
  function mover(o) {
    Object.assign(o, { ox: 0, oy: 0, qx: 0, qy: 0, q: [], cur: null, loopQ: null, dx: 0, dy: 0, phase: null, phaseK: 0, shk: 0 });
    return o;
  }
  function stepMover(o, dt) {
    const px = o.ox, py = o.oy;
    let left = dt;
    o.shk = 0;
    for (let guard = 0; guard < 8; guard++) {
      if (!o.cur) {
        if (!o.q.length) { if (o.loopQ) o.q = o.loopQ.map(e => Object.assign({}, e)); else break; }
        o.cur = o.q.shift(); o.cur.t = 0; o.cur.fx = o.ox; o.cur.fy = o.oy; o.cur.fe = o.ext;
      }
      const e = o.cur;
      if (e.k === 'fn') { o.cur = null; e.fn(); continue; }
      if (e.k === 'fall') {                                   // falls for good
        e.v = (e.v || 0) + 2600 * left; o.oy += e.v * left * (e.dir || 1); o.falling = (o.falling || 0) + left;
        o.phase = 'fall'; left = 0; break;
      }
      const use = Math.min(left, Math.max(0, (e.dur || 0) - e.t));
      e.t += use; left -= use;
      const k = e.dur ? Math.min(1, e.t / e.dur) : 1, kk = EASE[e.ease || 'io'](k);
      if (e.k === 'to') { o.ox = e.fx + (e.x - e.fx) * kk; o.oy = e.fy + (e.y - e.fy) * kk; }
      else if (e.k === 'hop') { o.ox = e.fx + (e.x - e.fx) * kk; o.oy = e.fy + (e.y - e.fy) * kk - Math.sin(Math.PI * k) * e.h; }
      else if (e.k === 'vel') { o.ox += e.vx * use; o.oy += e.vy * use; }
      else if (e.k === 'ext') { o.ext = e.fe + (e.to - e.fe) * kk; }
      else if (e.k === 'shake') { o.shk = e.amp; }
      o.phase = e.name || e.k; o.phaseK = k;
      if (k >= 1 && e.k !== 'vel') o.cur = null;
      else if (k >= 1) o.cur = null;
      else break;
      if (left <= 1e-6) break;
    }
    o.dx = o.ox - px; o.dy = o.oy - py;
  }

  function create(env) {
    const LV = env.level, fx = env.fx;
    const sfx = (n, o) => env.sfx(n, o);
    const rooms = STAGES[Math.max(1, Math.min(STAGES.length - 1, LV))];
    const q = new URLSearchParams(location.search);
    let ri = Math.max(0, Math.min(rooms.length - 1, (env.startRoom || +q.get('room') || 1) - 1));
    // 5 lives a run; out of lives = GAME OVER, back to the run's first stage (the Test Lab's single-stage mode stays put)
    const firstRoom = ri, base = STAGES.slice(1, Math.max(1, Math.min(STAGES.length - 1, LV))).reduce((n, st) => n + st.length, 0);
    const totalTime = Math.round(rooms.reduce((s, r) => s + (r.t || 60), 0) * 2.2) + 10;
    let timeLeft = totalTime, deaths = 0, roomDeaths = 0, t = 0, done = false, lives = LIVES, best = ri, overT = 0;
    let R = null, P = null, introT = 0, taunt = '', tauntT = 0, fade = 1, fadeDir = -1, nextAfterFade = null, deadT = 0, flashT = 0;
    const bake = { bg: null, room: null, K: 0 };
    const bot = { on: false, i: 0, t: 0, dir: 0, hold: 0, press: false, waitT: 0 };
    let musicOn = false, lastCause = '';
    if (window.DABAudio && !musicOn) { DABAudio.music('music_temple', { restart: true, xf: 0.6 }); musicOn = true; }

    // ── build a room from its definition ──────────────────────────────────
    function build(def) {
      const g = grid(def.map);
      const r = {
        def, g, t: 0, gdir: 1, mirror: false, wind: 0, windT: 0, dark: false, darkA: 0, storm: 0, flipJumps: false,
        bodies: {}, blist: [], spikes: {}, slist: [], saws: [], doors: [], runes: [], springs: [], signs: [], leaves: [],
        rules: [], timers: [], echo: null, chaseT: -1, chase: null, start: { x: 1.5 * T, y: 11 * T, flip: false },
        ladders: new Set(), ladderTops: [], swaps: [], swapOn: true, swapAim: -1, holes: [], blinks: [], escs: [], parts: [], fragiles: [], aims: [],
        exits: [], flyers: [], planks: [], boulders: [], drops: [], balls: [], idol: null, barSet: null,
        waterSet: null, flood: null, shooters: [], shots: [], urchins: [], fish: [], spears: [], lures: []
      };
      const at = (x, y) => (y < 0 || y >= ROWS || x < 0 || x >= COLS ? '.' : g[y][x]);
      const ground = [], groups = {}, spk = {}, fake = [], ghost = [], crumble = {}, bars = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const ch = g[y][x];
        if (ch === '#' || ch === '=') ground.push([x, y]);
        else if (GROUP(ch)) (groups[ch] = groups[ch] || []).push([x, y]);
        else if (ch === '~') fake.push([x, y]);
        else if (ch === '+') ghost.push([x, y]);
        else if (ch === '%') (crumble[x] = crumble[x] || []).push([x, y]);
        else if (ch === 'S') {
          r.start = { x: (x + 0.5) * T, y: SOLIDISH(at(x, y + 1)) || !SOLIDISH(at(x, y - 1)) ? (y + 1) * T : y * T, flip: !SOLIDISH(at(x, y + 1)) && SOLIDISH(at(x, y - 1)) };
          if (at(x + 1, y) === ':' || at(x - 1, y) === ':' || at(x, y - 1) === ':') (r.waterSet = r.waterSet || new Set()).add(x + ',' + y);   // (a start in the water is water)
        }
        else if (ch === 'D' || ch === 'Q') {
          const hang = !SOLIDISH(at(x, y + 1)) && SOLIDISH(at(x, y - 1));
          r.doors.push(mover({ id: ch, x: (x + 0.5) * T, y: hang ? y * T : (y + 1) * T, hang, fake: ch === 'Q', alive: true, alpha: 1, ride: null, vx: 0 }));
        }
        else if (ch === '@') r.runes.push({ x: (x + 0.5) * T, y: SOLIDISH(at(x, y + 1)) ? (y + 1) * T : y * T, up: !SOLIDISH(at(x, y + 1)), arm: true });
        else if (ch === '*') r.springs.push({ x: (x + 0.5) * T, y: (y + 1) * T, sq: 0 });
        else if (ch === 'H') r.ladders.add(x + ',' + y);
        else if (ch === 'E') r.exits.push({ x0: x * T, y0: y * T, x1: (x + 1) * T, y1: (y + 1) * T });
        else if (ch === '$') bars.push([x, y]);
        else if (ch === ':') (r.waterSet = r.waterSet || new Set()).add(x + ',' + y);
        else if (ch === '&') r.idol = { x: (x + 0.5) * T, y: (y + 1) * T, taken: false, fn: null, t: 0 };
        else if (ch === '[' || ch === ']') r.swaps.push({ x: x * T, y: y * T, set: ch === '[' ? 0 : 1, pend: false });
        else if (ch >= '1' && ch <= '9') r.saws.push(makeSaw((x + 0.5) * T, (y + 0.5) * T, ch));
        else if ('^v<>'.includes(ch)) (spk._ = spk._ || []).push({ x, y, dir: { '^': 'up', 'v': 'down', '<': 'left', '>': 'right' }[ch] });
        else if (ch >= 'A' && ch <= 'Z') {
          const dir = SOLIDISH(at(x, y + 1)) ? 'up' : SOLIDISH(at(x, y - 1)) ? 'down' : SOLIDISH(at(x - 1, y)) ? 'right' : SOLIDISH(at(x + 1, y)) ? 'left' : 'up';
          (spk[ch] = spk[ch] || []).push({ x, y, dir });
        }
      }
      for (const k of r.ladders) { const [x, y] = k.split(',').map(Number); if (!r.ladders.has(x + ',' + (y - 1))) r.ladderTops.push({ x0: x * T, y0: y * T, x1: (x + 1) * T, y1: y * T + 6, b: LADDER_B }); }
      const body = (id, tiles, kind) => {
        const b = mover({ id, kind, tiles, rects: rowRects(tiles), solid: kind !== 'fake', visible: kind !== 'ghost', alive: true, carry: true, seen: 0, sprite: null });
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of b.rects) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); }
        b.bounds = { x0, y0, x1, y1 };
        r.bodies[id] = b; r.blist.push(b);
        return b;
      };
      body('#', ground, 'ground').static = true;
      const fixed = (x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && (g[y][x] === '#' || g[y][x] === '='));
      for (const k in groups) body(k, groups[k], 'ground');
      // fake ground: each run of tiles is its own lie (it crumbles away when you sink into it)
      rowRects(fake).forEach((q, i) => { const tl = fake.filter(([x, y]) => y * T === q.y && x * T >= q.x && x * T < q.x + q.w); body('~' + i, tl, 'fake'); });
      if (ghost.length) body('+', ghost, 'ghost');
      if (bars.length) { const bb = body('$', bars, 'ground'); bb.live = true; bb.bars = true; r.barSet = new Set(bars.map(([x, y]) => x + ',' + y)); }
      Object.keys(crumble).forEach(x => { body('%' + x, crumble[x], 'crumble').col = +x; });
      // every piece that can move or vanish bleeds a hair into the fixed stone around it (no seam), never into the night
      for (const b of r.blist) {
        if (b.static || b.kind === 'ghost') continue;
        const own = new Set(b.tiles.map(([x, y]) => x + ',' + y)), B = 0.8;
        const solid = (x, y) => fixed(x, y) || own.has(x + ',' + y);
        for (const q of b.rects) {
          const x0 = q.x / T, x1 = (q.x + q.w) / T - 1, y = q.y / T;
          let up = true, dn = true;
          for (let x = x0; x <= x1; x++) { if (!solid(x, y - 1)) up = false; if (!solid(x, y + 1)) dn = false; }
          q.bleed = [fixed(x0 - 1, y) ? B : 0, up ? B : 0, fixed(x1 + 1, y) ? B : 0, dn ? B : 0];
        }
      }
      for (const k in spk) {
        const s = mover({ id: k, tiles: spk[k], ext: k === '_' ? 1 : 0, alive: true, attach: null, fallDist: 0 });
        r.spikes[k] = s; r.slist.push(s);
      }
      // the api a room's setup() and its triggers use (tiles in, px inside)
      const api = makeApi(r);
      r.api = api;
      def.setup && def.setup(api);
      return r;
    }
    // ── escalators ────────────────────────────────────────────────────────
    function makeEsc(r, o) {
      const dir = Math.sign(o.to[0] - o.from[0]) || 1, n = Math.max(1, Math.abs(o.to[0] - o.from[0]) - 2);
      const e = { id: r.escs.length, dir, n, x0: (o.from[0] + 0.5) * T, yb: o.from[1] * T, yt: o.to[1] * T, v: (o.speed === undefined ? 1.4 : o.speed) * T,
        rise: (o.from[1] - o.to[1]) * T / n, steps: [], serial: 0, shakeT: 0, amp: 0, broken: false, railK: 0, spill: null, kinds: 0 };
      for (let u = -T; u <= (n + 1) * T + 1; u += T) addStep(e, u);
      return e;
    }
    function addStep(e, u) { const st = { id: 'e' + e.id + '_' + (e.serial++), kind: 'step', esc: e, u, x: 0, y: 0, dx: 0, dy: 0, h: Math.max(9, e.rise) }; escPos(e, st); st.px = st.x; st.py = st.y; e.steps.push(st); return st; }
    function escPos(e, st) { st.x = e.x0 + e.dir * st.u; st.y = e.yb - e.rise * clamp(st.u / T, 0, e.n); }
    const stepRect = st => ({ x0: st.x - T / 2, y0: st.y, x1: st.x + T / 2, y1: st.y + st.h, b: st });
    function escApi(r, e) {
      return {
        get speed() { return e.v / T; }, get broken() { return e.broken; },
        stop() { e.v = 0; sfx('tt_slam', { vol: 0.5, rate: 1.4 }); return this; },
        go(speed) { e.v = speed * T; return this; },
        reverse(speed) { e.v = -(speed === undefined ? Math.abs(e.v / T) || 1.4 : speed) * T; sfx('tt_grind', { vol: 0.6 }); return this; },
        shake(dur, amp) { e.shakeT = dur || 0.6; e.amp = amp || 1.6; sfx('tt_grind', { vol: 0.7 }); return this; },
        // it comes apart: each listed spot [x, row, opts] gets the nearest step, the rest drop away.
        //   opts: { drop: s } falls s after you land on it, { swing: tiles, period } drifts side to side, { lift: tiles, period } bobs up and down
        break(spots, o) {
          o = o || {}; e.broken = true; e.v = 0; e.railK = 0.0001; sfx('tt_clank', { vol: 0.9 }); sfx('tt_crumble', { vol: 0.6, rate: 0.8 }); env.shake(0.3);
          const free = e.steps.filter(st => st.u > -T * 0.5 && st.u < (e.n + 1.5) * T);
          for (const st of e.steps) if (!free.includes(st)) st.gone = true;
          const mine = P && P.ground && free.find(st => st.id === P.on);
          if (mine) { mine.part = { fx: mine.x, fy: mine.y, tx: mine.x, ty: mine.y, t: 0, dur: 0.01, ph: 0, bob: 0 }; mine.h = 9; }
          (spots || []).forEach(([x, y, so], i) => {
            const tx = (x + 0.5) * T, ty = y * T;
            let best = null, bd = 1e9;
            for (const st of free) if (!st.part) { const d = Math.hypot(st.x - tx, st.y - ty); if (d < bd) { bd = d; best = st; } }
            if (!best) return;
            best.part = Object.assign({ fx: best.x, fy: best.y, tx, ty, t: -(o.delay === undefined ? 0.35 : o.delay) - i * 0.04, dur: o.dur || 0.8, ph: i * 1.7, bob: o.bob === undefined ? 2.5 : o.bob, order: i }, so || {});
            best.h = 9;
          });
          free.forEach((st, i) => { if (!st.part) st.drop = { t: -0.15 - hr(i, e.id, 9) * 0.35, vy: 0 }; });
          return this;
        },
        // spare parts pop out of the top and bounce down the steps: kinds 'w' wheel, 'b' bearing, 'g' gear (cycled)
        spill(o) { o = o || {}; e.spill = { every: o.every || 1.3, kinds: o.kinds || 'wbg', t: o.first === undefined ? 0 : -o.first, count: o.count || 1e9, n: 0 }; return this; },
        stopSpill() { e.spill = null; return this; },
        // a step's top (tiles) by its position from the bottom (0 = the flat bottom step)
        partAt(k) { const st = e.steps.find(q => q.part && q.part.order === k); return st ? { x: st.x / T, y: st.y / T } : null; },
        stepTop(k) { const st = e.steps.filter(q => !q.gone).sort((a, b) => a.u - b.u)[k]; return st ? { x: st.x / T, y: st.y / T } : null; }
      };
    }
    // the bounce path of a spilled part: out of the top, down every step (big wheels take two at a time), then along the floor
    function spillPart(e, kind) {
      const R0 = { w: 0.32 * T, b: 0.18 * T, g: 0.3 * T }[kind], hopT = { w: 0.31, b: 0.25, g: 0.38 }[kind], H = { w: 0.12 * T, b: 0.2 * T, g: 0.15 * T }[kind];   // (they roll down the step edges, bumping)
      const steps = e.steps.filter(st => !st.gone && !st.drop).sort((a, b) => b.u - a.u);
      const pts = [{ x: e.x0 + e.dir * (e.n + 2) * T, y: e.yt }];
      const skip = 1;
      steps.forEach((st, i) => { const pp = st.part; if (i % skip === 0 || i === steps.length - 1) pts.push({ x: pp ? pp.tx : st.x, y: pp ? pp.ty : st.y }); });
      const p = { kind, r: R0, pts, i: 0, k: 0, hopT, H, x: pts[0].x, y: pts[0].y - R0, ang: 0, roll: -e.dir * T / hopT * 1.1 * skip, alive: true, floorY: e.yb };
      p.hops = pts.map((q, i) => (i ? Math.max(hopT * 0.8, hopT * Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) / (T * skip * 1.25)) : 0));
      sfx('tt_clank', { vol: 0.45, rate: kind === 'b' ? 1.6 : kind === 'g' ? 1.2 : 0.9 });
      return p;
    }
    function makeSaw(x, y, id) { return mover({ id, x0: x, y0: y, x, y, r: 0.6 * T, ang: 0, path: null, seg: 0, speed: 0, alive: true, moving: false }); }

    function makeApi(r) {
      const handle = id => {
        const o = r.bodies[id] || r.spikes[id] || r.doors.find(d => d.id === id) || r.saws.find(s => s.id === id);
        if (!o) { console.warn('[temple] no object', id); return null; }
        return o;
      };
      // a chain of motions on one object (tiles)
      function chain(o) {
        const push = e => { o.q.push(e); return C; };
        const C = {
          get phase() { return o.cur ? (o.cur.name || o.cur.k) : null; }, get phaseK() { return o.cur ? (o.cur.dur ? o.cur.t / o.cur.dur : 1) : 1; },
          get oy() { return o.oy; }, get ox() { return o.ox; }, get ext() { return o.ext; },
          move(dx, dy, dur, ease, name) { o.qx += dx * T; o.qy += dy * T; return push({ k: 'to', x: o.qx, y: o.qy, dur, ease, name }); },
          goTo(x, y, speed) { const d = Math.hypot(x * T - o.ox, y * T - o.oy) / T; o.qx = x * T; o.qy = y * T; return push({ k: 'to', x: o.qx, y: o.qy, dur: Math.max(0.01, d / speed), ease: 'lin', name: 'goto' }); },
          wait(dur, name) { return push({ k: 'wait', dur, name }); },
          shake(dur, amp) { return push({ k: 'shake', dur, amp: amp || 1.6, name: 'shake' }); },
          fall(dir) { return push({ k: 'fall', dir: dir || 1 }); },
          pop(dur) { return push({ k: 'ext', to: 1, dur: dur || 0.06, ease: 'out', name: 'pop' }).call(() => { sfx('tt_pop', { vol: 0.7 }); }); },
          hide(dur) { return push({ k: 'ext', to: 0, dur: dur || 0.12, ease: 'in', name: 'hide' }); },
          call(fn) { return push({ k: 'fn', fn }); },
          stop() { o.q = []; o.cur = null; o.loopQ = null; o.qx = o.ox; o.qy = o.oy; return C; },
          loop() { o.loopQ = [o.cur, ...o.q].filter(Boolean).map(e => Object.assign({}, e, { t: 0 })); o.q = []; o.cur = null; return C; },
          // door moves
          hop(x, y, dur) { const tx = (x + 0.5) * T - o.x, ty = (y + 1) * T - o.y; o.qx = tx; o.qy = ty; sfx('tt_door', { vol: 0.6 }); return push({ k: 'hop', x: tx, y: ty, dur, h: 3 * T, ease: 'io', name: 'hop' }); },
          ride(id) { o.ride = r.bodies[id]; return C; },
          appear(x, y) { o.ride = null; o.x = (x + 0.5) * T; o.y = (y + 1) * T; o.ox = o.oy = o.qx = o.qy = 0; o.alive = true; o.alpha = 0; o.q = []; o.cur = null; sfx('tt_door', { vol: 0.6 }); burst(o.x, o.y - 18, 10); return C; },
          charge(vx) { o.vx = vx * T; o.charging = true; sfx('tt_door', { vol: 0.8 }); return C; },
          // saws
          go(path, speed, loop) { o.path = path.map(([x, y]) => ({ x: x * T, y: y * T })); o.seg = 0; o.speed = speed * T; o.moving = true; o.loop = !!loop; sfx('tt_saw', { vol: 0.6 }); return C; },
          fallAway() { return push({ k: 'fall', dir: 1 }); }
        };
        return C;
      }
      const chains = new Map();
      const $ = id => { const o = handle(id); if (!o) return null; if (!chains.has(o)) chains.set(o, chain(o)); return chains.get(o); };
      const api = {
        $, saws: r.saws,
        // conditions (p: the player in tiles: x, y (feet), air, ground, flipped, vx)
        at: x => p => p.x >= x, atL: x => p => p.x <= x,
        zone: (x0, x1, y0, y1) => p => p.x >= x0 && p.x <= x1 && (y0 === undefined || (p.y >= y0 && p.y <= y1)),
        stand: id => p => p.ground && p.on === id,
        // triggers
        when(cond, fn) { r.rules.push({ cond, fn, once: true, was: false }); },
        every(cond, fn) { r.rules.push({ cond, fn, once: false, was: false }); },
        after(sec, fn) { r.timers.push({ t: sec, fn }); },
        // actions
        drop(id, delay, dir) { const c = $(id); if (!c) return; if (delay) c.shake(delay); c.call(() => { sfx('tt_crumble', { vol: 0.7 }); handle(id).carry = false; }).fall(dir || 1); },
        fall(id, delay) { const c = $(id); if (!c) return; const o = handle(id); o.ext = 1; if (delay) c.shake(delay); c.call(() => { o.falling = 0; o.fallDist = fallDistance(r, o); sfx('tt_crumble', { vol: 0.5, rate: 1.4 }); }).fall(1); },
        pop(id, delay) { const c = $(id); if (!c) return; if (delay) c.wait(delay); c.pop(); },
        show(id) { const o = handle(id); if (o) o.ext = 1; },
        attach(sid, bid) { r.spikes[sid].attach = r.bodies[bid]; },
        saw(o) { const s = makeSaw(o.x * T, o.y * T, 's' + r.saws.length); if (o.r) s.r = o.r * T; r.saws.push(s); return chain(s); },
        spawnDoor(x, y, o) { o = o || {}; const d = mover({ id: o.fake ? 'Q' : 'D', x: (x + 0.5) * T, y: o.hang ? y * T : (y + 1) * T, hang: !!o.hang, fake: !!o.fake, alive: true, alpha: 0, ride: null, vx: 0 }); r.doors.push(d); if (!o.quiet) { sfx('tt_door', { vol: 0.6 }); burst(d.x, d.y - 18, 12); } return d; },
        doorX(id) { const d = r.doors.find(q => q.id === (id || 'D') && q.alive); return d ? (d.x + d.ox) / T : null; },
        harmless(id) { if (r.spikes[id]) r.spikes[id].harmless = true; },
        shadow() { return r.echo && r.echo.on ? { x: r.echo.x / T, y: r.echo.y / T } : null; },
        get windNow() { return r.wind; }, get windAge() { return r.windT; },
        sign(x, y, text) { r.signs.push({ x: (x + 0.5) * T, y: (y + 1) * T, text }); },
        leaves() { r.leavesOn = true; },
        say(text) { taunt = text; tauntT = 2.6; },
        slamFx(id) { const b = r.bodies[id]; sfx('tt_slam', { vol: 0.9 }); env.shake(0.3); dust((b.bounds.x0 + b.bounds.x1) / 2 + b.ox, (b.oy < 0 ? b.bounds.y0 : b.bounds.y1) + b.oy, (b.bounds.x1 - b.bounds.x0) / 2, 10); },
        chase(speed, from) { r.chase = { speed: speed * T, x0: (from || 0) * T, t: 0 }; },
        flip() { flipGravity(r); },
        flipJumps(on) { r.flipJumps = on; },
        mirror(on, quiet) { r.mirror = on; if (quiet) return; flashT = 0.35; sfx('tt_flip', { vol: 0.5, rate: on ? 0.8 : 1.2 }); },
        dark(on) { r.dark = on; if (on) { r.storm = 2.0; sfx('tt_thunder', { vol: 0.8 }); } },
        echo(delay) { r.echo = { delay, trail: [], t: 0, x: P.x, y: P.y }; },
        wind(vx) { if (vx !== r.wind) r.windT = 0; r.wind = vx; },
        // a floor trench (x0..x1 tiles, floor top at row y, open in the map) with a w-tile gap that moves:
        //   mode 'patrol' (back and forth), 'hunt' (toward you), 'land' (toward where you'll land while you're in the air)
        hole(o) { const h = { x0: o.x0 * T, x1: (o.x1 + 1) * T, y: o.y * T, yb: o.depth ? (o.y + o.depth) * T : RH + 60, w: (o.w || 2) * T, speed: (o.speed || 3) * T, mode: o.mode || 'patrol', dir: 1, on: o.on !== false };
          h.hx = (o.at !== undefined ? o.at : o.x0 + 1) * T; r.holes.push(h);
          return { start() { h.on = true; }, stop() { h.on = false; }, set(mode, speed) { h.mode = mode; if (speed) h.speed = speed * T; }, get x() { return h.hx / T; } }; },
        blinkOn(id) { const bl = r.blinks.find(q => q.b.id === id); return !!bl && bl.t % (bl.on + bl.off) < bl.on; },
        blinkAge(id) { const bl = r.blinks.find(q => q.b.id === id); return bl ? bl.t % (bl.on + bl.off) : 0; },
        // fire fn the moment a jump (or a fall) is going to land on body id (or a tile box [x0, y0, x1, y1]); once, or every jump
        onAim(id, fn, o) {
          const rects = Array.isArray(id) ? () => [{ x0: id[0] * T, y0: id[1] * T, x1: (id[2] + 1) * T, y1: (id[3] + 1) * T }]
            : () => { const b = r.bodies[id]; return b && b.alive && b.solid && !b.hidden ? b.rects.map(q => ({ x0: q.x + b.ox, y0: q.y + b.oy, x1: q.x + q.w + b.ox, y1: q.y + q.h + b.oy })) : []; };
          r.aims.push({ rects, fn, every: !!(o && o.every), jumpOnly: !!(o && o.jumpOnly), last: -1 });
        },
        // hidden thorns that spring up right where your jump is going to land
        popOnAim(id, o) { const s = r.spikes[id]; if (!s) return; const xs = s.tiles.map(t => t.x), ys = s.tiles.map(t => t.y);
          api.onAim([Math.min(...xs), Math.max(...ys) + 1, Math.max(...xs), Math.max(...ys) + 1], () => api.pop(id), o); },
        // stairs that breathe: the group splits into columns that shrink to thin sticks and grow back, rippling along
        //   o: { period (s), min (narrowest, share of a tile), ripple (phase step per column, rad) }
        breathe(id, o) {
          const b = r.bodies[id]; if (!b) return; o = o || {};
          b.live = true; r.rebake = true; sfx('tt_crumble', { vol: 0.5, rate: 1.2 });
          const cols = {};
          for (const [x, y] of b.tiles) (cols[x] = cols[x] || []).push(y);
          b.cols = Object.keys(cols).map(Number).sort((a, c) => a - c).map((x, i) => ({ x, y0: Math.min(...cols[x]), y1: Math.max(...cols[x]) + 1, i }));
          b.breath = { t: 0, period: o.period || 1.6, min: o.min === undefined ? 0.12 : o.min, ripple: o.ripple === undefined ? 0.7 : o.ripple };
          b.rects = breathRects(b);
        },
        // a thorn group that slides along toward you (within x0..x1 tiles, its left edge) at speed tiles/s, while on is true
        hunt(id, speed, x0, x1) { const sp = r.spikes[id]; if (!sp) return null; sp.ext = Math.max(sp.ext, 1); const lx = Math.min(...sp.tiles.map(t => t.x));
          sp.hunt = { speed: speed * T, min: (x0 - lx) * T, max: (x1 - lx) * T, on: true }; return { stop() { sp.hunt.on = false; }, go() { sp.hunt.on = true; } }; },
        // n saws spinning round a circle (centre cx, cy tiles, radius rr tiles), one turn every period seconds
        ring(cx, cy, rr, n, period, o) {
          const pts = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
          const speed = TAU * rr / period, out = [];
          for (let k = 0; k < n; k++) {
            const a0 = k / n * TAU, s0 = makeSaw((cx + Math.cos(a0) * rr) * T, (cy + Math.sin(a0) * rr) * T, 'ring' + r.saws.length);
            if (o && o.r) s0.r = o.r * T;
            const j = Math.round(k / n * 48), path = pts.slice(j + 1).concat(pts.slice(1, j + 1));
            r.saws.push(s0); chain(s0).go(path, speed, true); out.push(s0);
          }
          return out;
        },
        // ground that drops away the moment your jump is going to land on it
        dropOnAim(id, o) { api.onAim(id, () => api.drop(id, (o && o.delay) || 0), o); },
        // a block that slides away (dx, dy tiles) the moment you jump at it; back: it slides home that long after
        shiftOnAim(id, dx, dy, o) {
          o = o || {};
          api.onAim(id, () => {
            const c = $(id); if (!c) return;
            c.move(dx, dy, o.dur || 0.1, 'out', 'shift');
            if (o.back) c.wait(o.back, 'away').move(-dx, -dy, 0.3, 'io', 'home');
            sfx('tt_flip', { vol: 0.4, rate: 1.8 });
          }, { every: o.every !== false });
        },
        // width (tiles) of a breathing group's column at tile x right now (bots read it)
        breathW(id, x) { const b = r.bodies[id]; if (!b || !b.breath) return 1; const q = b.rects.find(rr => Math.abs(rr.x + rr.w / 2 - (x + 0.5) * T) < 2); return q ? q.w / T : 0; },
        echoOff() { r.echo = null; },
        // conditions and helpers of the temple
        still: sec => p => p.ground && p.still >= sec,
        spikeUp(id) { const sp = r.spikes[id]; return !!sp && sp.alive && sp.ext > 0.4; },
        spikeDir(id, dir) { const sp = r.spikes[id]; if (sp) for (const tl of sp.tiles) tl.dir = dir; },
        hide(id, dur) { const c = $(id); if (c) c.hide(dur); },
        flyer(id, o) { return flyerApi(r, makeFlyer(r, id, o || {})); },
        plank(o) { return plankApi(makePlank(r, o)); },
        // a boulder: { x, y (tiles, its middle), r, vx (tiles/s, - = left), hop (tiles), delay, stop (stops at a wall) }
        boulder(o) { const bd = makeBoulder(r, o); return { get x() { return bd.x / T; }, get y() { return bd.y / T; }, get vx() { return bd.vx / T; }, get alive() { return bd.alive; }, stop() { bd.vx = 0; }, go(vx) { bd.vx = vx * T; } }; },
        boulderAt(i) { const bd = r.boulders[i || 0]; return bd && bd.alive ? { x: bd.x / T, y: bd.y / T, vx: bd.vx / T, ground: bd.ground } : null; },
        // spiked bricks from the ceiling: list of [x (tile column), delay (s)], all from row o.y (default 1)
        rain(list, o) { const y = (o && o.y) || 1; for (const [x, d] of list) makeDrop(r, x, y, d); },
        // the stone game's ball: { x, y (tiles), vx, vy (tiles/s), delay }
        ball(o) { const bl = makeBall(r, o); return { get x() { return bl.x / T; }, get y() { return bl.y / T; }, get alive() { return bl.alive; } }; },
        ballAt(i) { const bl = r.balls[i || 0]; return bl && bl.alive ? { x: bl.x / T, y: bl.y / T, vx: bl.vx / T, vy: bl.vy / T } : null; },
        barsLeft() { return r.barSet ? r.barSet.size : 0; },
        isBar(x, y) { return !!r.barSet && r.barSet.has(x + ',' + y); },
        onIdol(fn) { if (r.idol) r.idol.fn = fn; },
        get idolTaken() { return !!(r.idol && r.idol.taken); },
        flag: {},
        // water that rises and falls: flood(row) puts its surface at that row; floodTo(row, speed, hold); floodCycle([[row, speed, hold], ...])
        flood(row) { r.flood = { y: row * T, target: null, speed: 0, hold: 0, cycle: null, ci: 0, nextHold: 0 }; },
        floodTo(row, speed, hold) { const f = r.flood; if (f) { f.target = row * T; f.speed = (speed || 1) * T; f.nextHold = hold || 0; f.hold = 0; } },
        floodCycle(list) { if (r.flood) { r.flood.cycle = list; r.flood.ci = 0; } },
        get floodRow() { return r.flood ? r.flood.y / T : null; },
        // a statue that spits seed-bombs: { x, y (tile), every, speed, lead, first, range, on }
        shooter(o) { const sh = makeShooter(r, o); return { on() { sh.on = true; }, off() { sh.on = false; } }; },
        urchins(list, o) { for (const [x, y] of list) makeUrchin(r, x, y, o || {}); },
        urchinsAwake() { return r.urchins.filter(u => u.state === 'awake').length; },
        fish(o) { makeFish(r, o); },
        fishAt(i) { const f = r.fish[i || 0]; return f && f.alive ? { x: f.x / T, y: f.y / T, vx: f.vx / T } : null; },
        sawAt(i) { const s2 = r.saws[i || 0]; return s2 ? { x: s2.x / T, y: s2.y / T, vx: (s2.vx || 0) / T, vy: (s2.vy || 0) / T } : null; },
        // while the flood drains, the water drags you toward x (tiles) at speed px/s
        pull(x, speed) { r.pull = { x: x * T, v: speed || 50 }; },
        // '$' walls drawn as cracked brickwork (not the stone game's bars)
        cracked() { r.crackedBars = true; },
        // a ground group drawn as an iron grate; gate(id, open) opens / shuts it
        grate(id) { const b = r.bodies[id]; if (b) { b.grate = true; b.live = true; } },
        gate(id, open) { const b = r.bodies[id]; if (!b || b.hidden === !!open) return; b.hidden = !!open; r.rebake = true; sfx(open ? 'tt_door' : 'tt_slam', { vol: 0.6, rate: open ? 1.2 : 1.5 }); },
        // a light that looks exactly like the way out (tile box x0..x1, y0..y1)
        lure(x0, y0, x1, y1) { r.lures.push({ x0: x0 * T, y0: y0 * T, x1: (x1 + 1) * T, y1: (y1 + 1) * T }); },
        // spear(col, row, dir, len): dir -1 = out of the floor whose top is at that row, up; 1 = out of the ceiling whose bottom is at that row, down
        spear(x, y, dir, len) { const sp = makeSpear(r, { x, y, dir, len }); return { pop() { if (sp.to < 1) { sp.to = 1; sfx('tt_pop', { vol: 0.6, rate: 0.8 }); } return this; }, hide() { sp.to = 0; return this; }, get out() { return sp.ext > 0.5; } }; },                                                // a room's own notes (setup writes, bots read)
        flyerState(id) { const f = r.flyers.find(q => q.id === id); return f ? f.state : null; },
        isSolid(id) { const b = r.bodies[id]; return !!b && b.alive && !b.hidden; },
        spikeX(id) { const sp = r.spikes[id]; return sp ? Math.min(...sp.tiles.map(t => t.x)) + sp.ox / T : null; },
        holeAt(i) { const h = r.holes[i || 0]; return h ? { x: h.hx / T, dir: h.dir, w: h.w / T, mode: h.mode } : null; },
        esc(i) { return r.escs[i || 0] ? escApi(r, r.escs[i || 0]) : null; },
        blink(id, on, off, phase) { const b = r.bodies[id]; if (b) { b.live = true; r.blinks.push({ b, on, off, t: phase || 0 }); } },
        cutLadder(x, y0, y1) { for (let y = y0; y <= y1; y++) r.ladders.delete(x + ',' + y); r.ladderTops = r.ladderTops.filter(q => q.x0 !== x * T || q.y0 < y0 * T || q.y0 > y1 * T); sfx('tt_crumble', { vol: 0.6, rate: 1.5 }); },
        // ground that gives way a moment after you stand on it; back (s) = it returns after that long (0 = gone for good)
        fragile(id, delay, back) { const b = r.bodies[id]; if (!b) return; b.fragile = { delay: delay === undefined ? 0.3 : delay, back: back || 0 }; b.vanT = -1; b.backT = -1; r.fragiles.push(b); },
        // moving stairs. from = [x, row]: the bottom column (its steps rise out of the floor, level with that row's top);
        // to = [x, row]: the first tile of the top landing (steps sink into it). Two flat steps at the top, one at the bottom.
        escalator(o) { const e = makeEsc(r, o); r.escs.push(e); return escApi(r, e); }
      };
      return api;
    }
    // how far a falling thorn group drops before it shatters on the ground below
    function fallDistance(r, s) {
      let best = 1e9;
      for (const tl of s.tiles) {
        for (let y = tl.y + 1; y < ROWS + 4; y++) {
          const ch = y < ROWS ? r.g[y][tl.x] : '.';
          if (SOLIDISH(ch) && ch !== '~') { best = Math.min(best, (y - tl.y - 1) * T + T * 0.2); break; }
          if (y >= ROWS) { best = Math.min(best, RH); break; }
        }
      }
      return best;
    }

    // ── temple traps: flyers (blocks that tear loose) and planks (spiked planks / pillars on a hinge) ────────────
    // A flyer is a ground group (a-z) that can leave its place: the group stops being ground and a drawn copy flies,
    // tumbling; it kills on touch while it flies. spikes: a hidden-spike group it takes along if they're out.
    // Back home (after a loop) it settles square and is ground again (never inside you).
    function makeFlyer(r, id, o) {
      const b = r.bodies[id];
      if (!b) { console.warn('[temple] no body for a flyer', id); return null; }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of b.tiles) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const f = { id, b, spikesId: o.spikes || null, spiked: false,
        cells: b.tiles.map(([x, y]) => ({ dx: (x + 0.5 - cx) * T, dy: (y + 0.5 - cy) * T, tx: x, ty: y })),
        hx: cx * T, hy: cy * T, x: cx * T, y: cy * T, vx: 0, vy: 0, head: 0, ang: 0, spin: 0,
        state: 'home', t: 0, speed: 0, turn: 0, life: 0, path: null, seg: 0 };
      r.flyers.push(f);
      return f;
    }
    function flyerApi(r, f) {
      if (!f) return { hunt() { return this; }, loop() { return this; }, tumble() { return this; }, get state() { return 'none'; } };
      const lift = () => {
        if (f.state !== 'home') return false;
        f.b.hidden = true; f.b.live = true; r.rebake = true;
        const sp = f.spikesId && r.spikes[f.spikesId];
        if (sp && sp.alive && sp.ext > 0.4) { f.spiked = true; sp.alive = false; }
        f.x = f.hx + f.b.ox; f.y = f.hy + f.b.oy; f.t = 0;
        sfx('tt_clank', { vol: 0.7, rate: 1.2 }); env.shake(0.15);
        return true;
      };
      return {
        get state() { return f.state; }, get x() { return f.x / T; }, get y() { return f.y / T; },
        // steer at the player at speed tiles/s, turning at most turn rad/s, for life seconds; then fly on and away
        hunt(speed, turn, life) {
          if (!lift()) return this;
          f.state = 'hunt'; f.speed = (speed || 2.6) * T; f.turn = turn === undefined ? 2.4 : turn; f.life = life || 3.2;
          f.head = Math.atan2((P.y - PH / 2) - f.y, P.x - f.x); f.spin = 7; return this;
        },
        // fly through tile points at speed tiles/s, then come home and be ground again
        loop(path, speed) {
          if (!lift()) return this;
          f.state = 'loop'; f.path = path.map(([x, y]) => ({ x: x * T, y: y * T })).concat([{ x: f.hx, y: f.hy }]); f.seg = 0; f.speed = (speed || 4) * T; f.spin = 5; return this;
        },
        // come loose and drop, tumbling (vx tiles/s sideways)
        tumble(vx) { if (!lift()) return this; f.state = 'fall'; f.vx = (vx || 0) * T; f.vy = -60; f.spin = (vx || 1) > 0 ? 6 : -6; return this; }
      };
    }
    function stepFlyer(f, dt) {
      if (f.state === 'home' || f.state === 'gone') return;
      f.t += dt; f.ang += f.spin * dt;
      if (f.state === 'hunt' || f.state === 'away') {
        if (f.state === 'hunt' && P && !P.dead) {
          const want = Math.atan2((P.y - PH / 2) - f.y, P.x - f.x);
          let d = want - f.head;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          f.head += clamp(d, -f.turn * dt, f.turn * dt);
          if (f.t >= f.life) f.state = 'away';
        }
        if (f.state === 'away') f.speed += 6 * T * dt;
        f.x += Math.cos(f.head) * f.speed * dt; f.y += Math.sin(f.head) * f.speed * dt;
      } else if (f.state === 'loop') {
        let left = f.speed * dt;
        while (left > 0 && f.seg < f.path.length) {
          const tg = f.path[f.seg], dx = tg.x - f.x, dy = tg.y - f.y, d = Math.hypot(dx, dy);
          if (d <= left) { f.x = tg.x; f.y = tg.y; left -= d; f.seg++; } else { f.x += dx / d * left; f.y += dy / d * left; left = 0; }
        }
        if (f.seg >= f.path.length) {
          f.ang = 0; f.spin = 0;
          const pb = P && box(), inside = pb && f.cells.some(c => hit(pb, { x0: f.hx + c.dx - T / 2, y0: f.hy + c.dy - T / 2, x1: f.hx + c.dx + T / 2, y1: f.hy + c.dy + T / 2 }));
          if (!inside) { f.state = 'home'; f.b.hidden = false; f.b.ox = f.b.oy = 0; R.rebake = true; sfx('tt_clank', { vol: 0.5, rate: 1.5 }); }
        }
      } else if (f.state === 'fall') { f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
      if (f.x < -3 * T || f.x > RW + 3 * T || f.y < -3 * T || f.y > RH + 3 * T) f.state = 'gone';
    }
    // a flying block hits like a ball the size of its tile (a bit more with spikes on)
    function flyerHits(f, sb) {
      const ca = Math.cos(f.ang), sa = Math.sin(f.ang), rr = T * (f.spiked ? 0.6 : 0.5);
      for (const c of f.cells) {
        const x = f.x + c.dx * ca - c.dy * sa, y = f.y + c.dx * sa + c.dy * ca;
        if (Math.hypot(clamp(x, sb.x0, sb.x1) - x, clamp(y, sb.y0, sb.y1) - y) < rr) return true;
      }
      return false;
    }

    // A plank on a hinge at (x, y) tiles, len tiles long, resting at angle a0 (radians: 0 = pointing right, PI/2 = down,
    // -PI/2 = up). Told to, it shakes (warn s), then swings to a1 in dur s, speeding up like it fell; its spikes pop out
    // on the way. hold: it swings back that long after (0 = it stays); shatter: it breaks apart where it lands.
    // At rest it looks like stonework; an upright or flat one is solid then. It kills on touch while it moves or lies.
    function makePlank(r, o) {
      const pk = { x: o.x * T, y: o.y * T, len: o.len * T, a0: o.a0, a1: o.a1, ang: o.a0, dur: o.dur || 0.4, warn: o.warn || 0,
        hold: o.hold || 0, back: o.back || 0.6, shatter: !!o.shatter, state: 'rest', t: 0, ext: 0, shk: 0, thick: (o.thick || 0.7) * T };
      r.planks.push(pk);
      return pk;
    }
    function plankApi(pk) {
      return {
        get state() { return pk.state; },
        swing() { if (pk.state === 'rest' || pk.state === 'home') { pk.state = pk.warn ? 'warn' : 'swing'; pk.t = 0; if (!pk.warn) sfx('tt_whoosh', { vol: 0.8 }); else sfx('tt_grind', { vol: 0.6 }); } return this; },
        back() { if (pk.state === 'down') { pk.state = 'return'; pk.t = 0; } return this; }
      };
    }
    function stepPlank(pk, dt) {
      pk.shk = 0;
      if (pk.state === 'warn') { pk.t += dt; pk.shk = 1.6; if (pk.t >= pk.warn) { pk.state = 'swing'; pk.t = 0; sfx('tt_whoosh', { vol: 0.8 }); } }
      else if (pk.state === 'swing') {
        pk.t += dt; const k = Math.min(1, pk.t / pk.dur);
        pk.ang = pk.a0 + (pk.a1 - pk.a0) * k * k; pk.ext = Math.min(1, pk.ext + dt * 8);
        if (k >= 1) {
          pk.state = 'down'; pk.t = 0; sfx('tt_slam', { vol: 0.9 }); env.shake(0.3);
          if (pk.shatter) {
            pk.state = 'gone'; sfx('tt_crumble', { vol: 0.8 });
            const ca = Math.cos(pk.ang), sa = Math.sin(pk.ang);
            for (let d = 0; d < pk.len; d += 6) for (let k2 = 0; k2 < 2; k2++) fx.spawn({ x: pk.x + ca * d, y: pk.y + sa * d, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 120, g: 900, kind: 'debris', rgb: MASS_RGB, size: 4, life: 0.8, spin: 0 });
          }
        }
      } else if (pk.state === 'down') { pk.t += dt; if (pk.hold && pk.t >= pk.hold) { pk.state = 'return'; pk.t = 0; } }
      else if (pk.state === 'return') {
        pk.t += dt; const k = Math.min(1, pk.t / pk.back);
        pk.ang = pk.a1 + (pk.a0 - pk.a1) * EASE.io(k);
        if (k >= 1) { pk.state = 'home'; pk.ext = 0; }
      }
    }
    // the plank as a fat segment: does it touch the box? (not while it rests, looking like stone)
    function plankHits(pk, sb) {
      if (pk.state === 'rest' || pk.state === 'home' || pk.state === 'warn' || pk.state === 'gone') return false;
      const ca = Math.cos(pk.ang), sa = Math.sin(pk.ang), rr = pk.thick / 2 + (pk.ext > 0.4 ? T * 0.25 : 0);
      for (let d = 0; d <= pk.len; d += 5) {
        const x = pk.x + ca * d, y = pk.y + sa * d;
        if (Math.hypot(clamp(x, sb.x0, sb.x1) - x, clamp(y, sb.y0, sb.y1) - y) < rr) return true;
      }
      return false;
    }
    // a resting upright / flat plank is a wall
    function plankRect(pk) {
      if (pk.state !== 'rest' && pk.state !== 'home' && pk.state !== 'warn') return null;
      const ca = Math.cos(pk.ang), sa = Math.sin(pk.ang), h = pk.thick / 2;
      if (Math.abs(ca) > 0.01 && Math.abs(sa) > 0.01) return null;
      const x1 = pk.x + ca * pk.len, y1 = pk.y + sa * pk.len;
      return { x0: Math.min(pk.x, x1) - (Math.abs(sa) > 0.5 ? h : 0), y0: Math.min(pk.y, y1) - (Math.abs(ca) > 0.5 ? h : 0),
        x1: Math.max(pk.x, x1) + (Math.abs(sa) > 0.5 ? h : 0), y1: Math.max(pk.y, y1) + (Math.abs(ca) > 0.5 ? h : 0), b: PLANK_B };
    }
    const PLANK_B = { id: 'plank', kind: 'plank' };

    // ── boulders: a big stone ball. It drops in, rolls at a steady speed, turns round at walls (and at the way out),
    // hops high when it rolls into something lower than its middle (a bump in the floor: run under it then), squashes you
    function makeBoulder(r, o) {
      const bd = { x: o.x * T, y: o.y * T, r: (o.r || 1.4) * T, vx: (o.vx === undefined ? -4 : o.vx) * T, vy: 0, ang: 0, alive: true, ground: false,
        hopV: Math.sqrt(2 * 1500 * (o.hop || 2.3) * T), wait: o.delay || 0, stopAtWall: !!o.stop };
      r.boulders.push(bd);
      sfx('tt_slam', { vol: 0.5, rate: 0.6 });
      return bd;
    }
    const bWall = (tx, ty) => { if (tx < 0 || tx >= COLS) return true; if (ty < 0 || ty >= ROWS) return false; const ch = R.g[ty][tx]; return ch === '#' || ch === '=' || ch === 'E' || (ch === '$' && R.barSet && R.barSet.has(tx + ',' + ty)); };
    function bSolidBody(x, y) {                                  // moving stone (gates, slabs) counts too
      for (const b of R.blist) { if (b.static || !b.alive || !b.solid || b.hidden || b.kind === 'fake' || b.id === '$') continue; for (const q of b.rects) if (x >= q.x + b.ox && x < q.x + q.w + b.ox && y >= q.y + b.oy && y < q.y + q.h + b.oy) return true; }
      return false;
    }
    const bSolid = (x, y) => bWall(Math.floor(x / T), Math.floor(y / T)) || bSolidBody(x, y);
    function stepBoulder(bd, dt) {
      if (!bd.alive) return;
      if (bd.wait > 0) { bd.wait -= dt; return; }
      bd.vy = Math.min(900, bd.vy + 1500 * dt);
      // sideways: the band through its middle meets a wall -> turn round; only its lower part meets it -> hop it
      const nx = bd.x + bd.vx * dt, side = Math.sign(bd.vx) || 1, fx = nx + side * bd.r;
      const mid = bSolid(fx, bd.y - bd.r * 0.15) || bSolid(fx, bd.y - bd.r * 0.6), low = bSolid(fx, bd.y + bd.r * 0.55);
      if (mid) { if (bd.stopAtWall) bd.vx = 0; else bd.vx = -bd.vx; sfx('tt_clank', { vol: 0.35, rate: 0.7 }); env.shake(0.12); }
      else if (low && bd.ground) { bd.vy = -bd.hopV; bd.ground = false; bd.x = nx; sfx('tt_bounce', { vol: 0.5, rate: 0.6 }); }
      else bd.x = nx;
      // up and down
      const ny = bd.y + bd.vy * dt;
      if (bd.vy >= 0 && (bSolid(bd.x, ny + bd.r) || bSolid(bd.x - bd.r * 0.45, ny + bd.r * 0.92) || bSolid(bd.x + bd.r * 0.45, ny + bd.r * 0.92))) {
        const ty = Math.floor((ny + bd.r) / T);
        if (!bd.ground && bd.vy > 300) { sfx('tt_slam', { vol: 0.6, rate: 0.7 }); env.shake(0.25); }
        bd.y = Math.min(ny, ty * T - bd.r); bd.vy = 0; bd.ground = true;
      } else if (bd.vy < 0 && bSolid(bd.x, ny - bd.r)) { bd.vy = 0; }
      else { bd.y = ny; bd.ground = false; }
      bd.ang += bd.vx / bd.r * dt;
      if (bd.y > RH + 3 * T || bd.x < -3 * T || bd.x > RW + 3 * T) bd.alive = false;
    }

    // ── spiked bricks that drop from the ceiling, one after another: they shatter on the floor
    function makeDrop(r, x, y, wait) { r.drops.push({ x: (x + 0.5) * T, y: (y + 0.5) * T, vy: 0, wait, alive: true }); }
    function stepDrop(d, dt) {
      if (!d.alive) return;
      if (d.wait > 0) { d.wait -= dt; if (d.wait <= 0) sfx('tt_crumble', { vol: 0.4, rate: 1.5 }); return; }
      d.vy = Math.min(800, d.vy + 1500 * dt); d.y += d.vy * dt;
      if (bSolid(d.x, d.y + T / 2) || d.y > RH + T) {
        d.alive = false; sfx('tt_crumble', { vol: 0.6, rate: 1.2 });
        for (let i = 0; i < 8; i++) fx.spawn({ x: d.x + (Math.random() - 0.5) * T, y: d.y, vx: (Math.random() - 0.5) * 160, vy: -80 - Math.random() * 120, g: 900, kind: 'debris', rgb: MASS_RGB, size: 4, life: 0.7, spin: 0 });
      }
    }

    // ── the stone game: '$' bars break when the ball hits them; the ball bounces off stone, bars and moving stone
    // (a moving group is the paddle: where it's hit decides the angle), and kills you
    function makeBall(r, o) {
      const b = { x: o.x * T, y: o.y * T, r: (o.r || 0.32) * T, vx: o.vx * T, vy: o.vy * T, speed: Math.hypot(o.vx, o.vy) * T, alive: true, wait: o.delay || 0, hits: 0, plow: o.plow || 0 };
      r.balls.push(b); return b;
    }
    function barAt(x, y) { const tx = Math.floor(x / T), ty = Math.floor(y / T); return R.barSet && R.barSet.has(tx + ',' + ty) ? [tx, ty] : null; }
    function breakBar(tx, ty) {
      R.barSet.delete(tx + ',' + ty);
      const b = R.bodies['$']; if (b) { b.tiles = b.tiles.filter(([x, y]) => x !== tx || y !== ty); b.rects = rowRects(b.tiles); b.ownSet = null; }
      sfx('tt_pop', { vol: 0.5, rate: 0.8 + (ty % 4) * 0.12 });
      for (let i = 0; i < 6; i++) fx.spawn({ x: (tx + 0.5) * T, y: (ty + 0.5) * T, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, g: 900, kind: 'debris', rgb: BAR_RGB[ty % 4], size: 4, life: 0.6, spin: 0 });
    }
    function paddleAt(x, y) {
      for (const b of R.blist) { if (b.static || !b.alive || !b.solid || b.hidden || b.id === '$' || b.kind === 'fake') continue; for (const q of b.rects) { const x0 = q.x + b.ox, y0 = q.y + b.oy; if (x >= x0 && x < x0 + q.w && y >= y0 && y < y0 + q.h) return { x0, x1: x0 + q.w, b }; } }
      return null;
    }
    function stepBall(bl, dt) {
      if (!bl.alive) return;
      if (bl.wait > 0) { bl.wait -= dt; return; }
      const n = Math.max(1, Math.ceil(bl.speed * dt / 4));
      for (let s = 0; s < n; s++) {
        const h = dt / n;
        // x
        let nx = bl.x + bl.vx * h, ex = nx + Math.sign(bl.vx) * bl.r;
        const bx = barAt(ex, bl.y);
        const plowX = bx && bl.plow && (++bl.hits % bl.plow) !== 0;    // (a heavy ball ploughs through bars; every plow-th one turns it)
        if (bx) breakBar(bx[0], bx[1]);
        if (!plowX && (bx || bWall(Math.floor(ex / T), Math.floor(bl.y / T)) || paddleAt(ex, bl.y))) { bl.vx = -bl.vx; sfx('tt_bounce', { vol: 0.25, rate: 1.6 }); }
        else bl.x = nx;
        // y
        let ny = bl.y + bl.vy * h, ey = ny + Math.sign(bl.vy) * bl.r;
        const by = barAt(bl.x, ey), pd = paddleAt(bl.x, ey);
        const plowY = by && bl.plow && (++bl.hits % bl.plow) !== 0;
        if (by) breakBar(by[0], by[1]);
        if (!plowY && (by || bWall(Math.floor(bl.x / T), Math.floor(ey / T)) || pd)) {
          if (pd) {                                              // off the paddle: the angle depends on where it hit
            const k = clamp(((bl.x - pd.x0) / (pd.x1 - pd.x0)) * 2 - 1, -0.85, 0.85), a = k * 1.05;
            bl.vx = Math.sin(a) * bl.speed; bl.vy = (bl.vy > 0 ? -1 : 1) * Math.cos(a) * bl.speed;
          } else bl.vy = -bl.vy;
          sfx('tt_bounce', { vol: 0.25, rate: 1.4 });
        } else bl.y = ny;
      }
      if (bl.y > RH + T) bl.alive = false;
    }

    const BAR_COLS = ['#e8c34a', '#4a8fe8', '#5ec46a', '#e8584a'], BAR_RGB = ['232,195,74', '74,143,232', '94,196,106', '232,88,74'];

    // ── water: ':' tiles (and anything under a flood line) are water. In water you sink slowly and the jump button is
    // a stroke (as many as you like); a stroke at the surface throws you up and out onto a ledge.
    const SWIM_G = 320, SWIM_MAXF = 105, STROKE_V = 175, SWIM_RUN = 82, SURF_V = 330;
    function waterAt(px, py) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (R.waterSet && R.waterSet.has(tx + ',' + ty)) return true;
      if (R.flood && py > R.flood.y) { const ch = ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS ? R.g[ty][tx] : '#'; return ch !== '#' && ch !== '='; }
      return false;
    }
    // the water's surface above (px, py): the y of the first air tile's bottom going up (null if there's none near)
    function surfaceAbove(px, py) {
      for (let k = 0; k < 4; k++) { const y = py - k * T; if (!waterAt(px, y)) return Math.floor(y / T) * T + T; }
      return null;
    }
    function stepFlood(dt) {
      const f = R.flood; if (!f) return;
      if (f.hold > 0) { f.hold -= dt; return; }
      if (f.target === null) { if (f.cycle && f.cycle.length) { const [row, speed, hold] = f.cycle[f.ci % f.cycle.length]; f.ci++; f.target = row * T; f.speed = speed * T; f.nextHold = hold || 0; } return; }
      const d = f.target - f.y;
      if (Math.abs(d) <= f.speed * dt) { f.y = f.target; f.target = null; f.hold = f.nextHold || 0; return; }
      f.y += Math.sign(d) * f.speed * dt;
    }

    // ── shooters: a statue that spits seed-bombs at where you're going (lead s ahead), every s seconds
    function makeShooter(r, o) {
      const sh = { x: (o.x + 0.5) * T, y: (o.y + 0.5) * T, every: o.every || 1.6, t: o.first === undefined ? 0.6 : o.first, speed: (o.speed || 4) * T, lead: o.lead === undefined ? 0.5 : o.lead,
        on: o.on !== false, face: o.face || 1, mouth: 0, range: (o.range || 99) * T };
      r.shooters.push(sh); return sh;
    }
    function stepShooter(sh, dt) {
      sh.mouth = Math.max(0, sh.mouth - dt * 4);
      if (!sh.on || !P || P.dead) return;
      sh.t -= dt;
      // aim where you'll be when the bomb gets there (two passes of the intercept), or a fixed lead
      let tx = P.x, ty = P.y - PH / 2;
      if (sh.lead === 'intercept') { for (let k = 0; k < 2; k++) { const tt = Math.hypot(tx - sh.x, ty - sh.y) / sh.speed; tx = P.x + P.vx * tt; ty = P.y - PH / 2 + clamp(P.vy, -120, 120) * tt * 0.5; } }
      else { tx += P.vx * sh.lead; ty += P.vy * sh.lead * 0.5; }
      sh.face = tx < sh.x ? -1 : 1;
      if (sh.t <= 0 && Math.hypot(P.x - sh.x, P.y - sh.y) < sh.range) {
        sh.t = sh.every; sh.mouth = 1;
        const a = Math.atan2(ty - sh.y, tx - sh.x);
        R.shots.push({ x: sh.x + Math.cos(a) * 14, y: sh.y + Math.sin(a) * 14, vx: Math.cos(a) * sh.speed, vy: Math.sin(a) * sh.speed, alive: true, t: 0 });
        sfx('tt_pop', { vol: 0.5, rate: 0.6 });
      }
    }
    function stepShot(s, dt) {
      if (!s.alive) return;
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
      const tx = Math.floor(s.x / T), ty = Math.floor(s.y / T);
      if (s.x < -T || s.x > RW + T || s.y < -T || s.y > RH + T || bWall(tx, ty) || bSolidBody(s.x, s.y) || s.t > 6) {
        s.alive = false;
        for (let i = 0; i < 6; i++) fx.spawn({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, kind: 'debris', rgb: '120,90,60', size: 3, life: 0.4, spin: 0 });
      }
    }

    // ── urchins: spiky balls at rest that wake up once you're within wake tiles, then drift after you (speed tiles/s)
    // for life seconds and burst. A woken one wakes its neighbours within 2 tiles.
    function makeUrchin(r, x, y, o) { r.urchins.push({ x: (x + 0.5) * T, y: (y + 0.5) * T, r: (o.r || 0.42) * T, wake: (o.wake || 4) * T, speed: (o.speed || 1.7) * T, life: o.life || 7, state: 'rest', t: 0, spin: hr(x, y, 5) * TAU }); }
    function stepUrchin(u, dt) {
      if (u.state === 'gone') return;
      u.spin += dt * (u.state === 'rest' ? 0.6 : 4);
      if (u.state === 'rest') {
        if (P && !P.dead && Math.hypot(P.x - u.x, P.y - PH / 2 - u.y) < u.wake) wakeUrchin(u);
        return;
      }
      u.t += dt;
      if (P && !P.dead) { const dx = P.x - u.x, dy = P.y - PH / 2 - u.y, d = Math.hypot(dx, dy) || 1; u.x += dx / d * u.speed * dt; u.y += dy / d * u.speed * dt; }
      if (u.t >= u.life) { u.state = 'gone'; sfx('tt_pop', { vol: 0.4, rate: 1.5 }); for (let i = 0; i < 8; i++) fx.spawn({ x: u.x, y: u.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, kind: 'debris', rgb: '40,30,50', size: 3, life: 0.5, spin: 0 }); }
    }
    function wakeUrchin(u) {
      if (u.state !== 'rest') return;
      u.state = 'awake'; u.t = 0; sfx('tt_clank', { vol: 0.3, rate: 1.8 });
      for (const o of R.urchins) if (o.state === 'rest' && Math.hypot(o.x - u.x, o.y - u.y) < 2.1 * T) wakeUrchin(o);
    }

    // ── spears: a tall thin spike that shoots out of a floor (dir -1, up) or a ceiling (dir 1, down), len tiles long,
    // from the tile edge at (col x, y px); out in 0.07 s, and it can go back in
    function makeSpear(r, o) { const sp = { x: (o.x + 0.5) * T, y: o.y * T, dir: o.dir, len: (o.len || 2) * T, ext: 0, to: 0 }; r.spears.push(sp); return sp; }
    function spearBox(sp) { const L = sp.len * sp.ext, w = T * 0.2; return sp.dir < 0 ? { x0: sp.x - w, y0: sp.y - L, x1: sp.x + w, y1: sp.y } : { x0: sp.x - w, y0: sp.y, x1: sp.x + w, y1: sp.y + L }; }
    // ── a ramming fish: swims back and forth along its row at speed, turns at stone, smashes '$' walls it rams, bites
    function makeFish(r, o) { r.fish.push({ x: o.x * T, y: o.y * T, vx: (o.vx || 3) * T, w: (o.w || 1.6) * T, h: (o.h || 0.9) * T, alive: true, t: 0 }); }
    function stepFish(f, dt) {
      if (!f.alive) return;
      f.t += dt;
      const nx = f.x + f.vx * dt, front = nx + Math.sign(f.vx) * f.w / 2;
      const bar = barAt(front, f.y) || barAt(front, f.y - f.h * 0.4) || barAt(front, f.y + f.h * 0.4);
      if (bar) { breakBar(bar[0], bar[1]); for (const [ox, oy] of [[0, -1], [0, 1]]) if (R.barSet.has((bar[0] + ox) + ',' + (bar[1] + oy))) breakBar(bar[0] + ox, bar[1] + oy); env.shake(0.2); sfx('tt_slam', { vol: 0.6, rate: 1.2 }); }
      if (bWall(Math.floor(front / T), Math.floor(f.y / T)) || bSolidBody(front, f.y)) f.vx = -f.vx; else f.x = nx;
    }

    // ── the player ────────────────────────────────────────────────────────
    function spawn() {
      P = { x: R.start.x, y: R.start.y, vx: 0, vy: 0, ground: false, on: null, face: 1, coy: 0, buf: 0, cut: false, dead: false, air: 0,
        run: 0, land: 0, born: 0, blink: 2 + Math.random() * 3, entering: 0, door: null, launched: false };
      R.gdir = R.start.flip ? -1 : 1;
      bot.i = 0; bot.t = 0; bot.dir = 0; bot.hold = 0; bot.press = false; bot.init = false;
    }
    function loadRoom(i, keepDeaths) {
      ri = i; R = build(rooms[ri]); spawn(); camera(0, true);
      if (!keepDeaths) { roomDeaths = 0; introT = 0; }
      bakeRoom();
    }
    const box = () => {
      const x0 = P.x - PW / 2;
      return R.gdir > 0 ? { x0, y0: P.y - PH, x1: x0 + PW, y1: P.y } : { x0, y0: P.y, x1: x0 + PW, y1: P.y + PH };
    };
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const deep = (a, b, e) => a.x0 < b.x1 - e && a.x1 > b.x0 + e && a.y0 < b.y1 - e && a.y1 > b.y0 + e;
    function solids(except) {
      const out = [];
      for (const b of R.blist) {
        if (!b.alive || !b.solid || b === except || b.hidden) continue;
        if (b.falling > 0.15) continue;                       // a dropping floor stops holding anything up
        for (const q of b.rects) out.push({ x0: q.x + b.ox, y0: q.y + b.oy, x1: q.x + q.w + b.ox, y1: q.y + q.h + b.oy, b });
      }
      for (const h of R.holes) for (const q of holeRects(h)) out.push(q);
      for (const w of R.swaps) if (swapSolid(w)) out.push({ x0: w.x, y0: w.y, x1: w.x + T, y1: w.y + T, b: SWAP_B });
      for (const pk of R.planks) { const q = plankRect(pk); if (q) out.push(q); }
      for (const e of R.escs) for (const st of e.steps) if (!st.gone && !(st.drop && st.drop.t > 0.12)) out.push(stepRect(st));
      if (R.ladderTops.length && P && R.gdir > 0 && !P.climb) for (const q of R.ladderTops) if (P.y <= q.y0 + 0.5) out.push(q);
      return out;
    }
    const HOLE_B = { id: 'hole', kind: 'hole' }, SWAP_B = { id: 'swap', kind: 'swap' }, LADDER_B = { id: 'ladder', kind: 'ladder' };
    function holeRects(h) {
      const a = clamp(h.hx - h.w / 2, h.x0, h.x1), b = clamp(h.hx + h.w / 2, h.x0, h.x1), out = [];
      if (a > h.x0) out.push({ x0: h.x0, y0: h.y, x1: a, y1: h.yb, b: HOLE_B });       // (a trench floor: down to its depth, or the room's bottom)
      if (b < h.x1) out.push({ x0: b, y0: h.y, x1: h.x1, y1: h.yb, b: HOLE_B });
      return out;
    }
    const swapSolid = w => !w.pend && (w.set === 0) === R.swapOn;
    function onLadder() {
      if (!R.ladders.size || R.gdir < 0) return false;
      const tx = Math.floor(P.x / T);
      return R.ladders.has(tx + ',' + Math.floor((P.y - 1) / T)) || R.ladders.has(tx + ',' + Math.floor((P.y - PH * 0.5) / T));
    }
    // where the feet will come down through height y (px) if nothing changes; null if they never will
    function landX(y) {
      if (P.ground || R.gdir < 0) return null;
      const disc = P.vy * P.vy + 2 * G_DN * (y - P.y);
      if (disc < 0) return null;
      const t = (-P.vy + Math.sqrt(disc)) / G_DN;
      return t < 0 ? null : P.x + P.vx * t;
    }
    // is this jump going to land on that rect (and is it still coming down onto it from above)?
    function aimedAt(q) {
      if (P.y > q.y0 + 2 || P.vy * R.gdir < -60) return false;     // (judged from the top of the jump on: where you're really going)
      const lx = landX(q.y0);
      return lx !== null && lx > q.x0 - PW / 2 + 1 && lx < q.x1 + PW / 2 - 1;
    }
    function aimTraps() {
      if (R.swaps.length && R.swapAim !== P.air) {
        for (const w of R.swaps) if (aimedAt({ x0: w.x, y0: w.y, x1: w.x + T, y1: w.y + T })) { R.swapAim = P.air; swapBlocks(); break; }
      }
      for (let i = 0; i < R.aims.length; i++) {
        const a = R.aims[i];
        if (a.last === P.air) continue;
        if (a.jumpOnly && !P.jumped) continue;
        if (a.rects().some(aimedAt)) { a.last = P.air; a.fn(); if (!a.every) { R.aims.splice(i, 1); i--; } }
      }
    }
    // swap blocks trade the two sets; a block never appears inside you (it waits till you leave)
    function swapBlocks() {
      R.swapOn = !R.swapOn; sfx('tt_flip', { vol: 0.35, rate: 1.6 });
      const pb = box();
      for (const w of R.swaps) w.pend = (w.set === 0) === R.swapOn && hit(pb, { x0: w.x, y0: w.y, x1: w.x + T, y1: w.y + T });
    }
    function flipGravity(r) {
      r.gdir = -r.gdir; P.ground = false; P.vy = 0; P.coy = 0;
      sfx('tt_flip', { vol: 0.7 }); flashT = 0.25;
      // the hitbox hangs the other way from the feet: keep the body where it was
      P.y += r.gdir < 0 ? -PH : PH;
    }
    function die(cause) {
      if (P.dead || done) return;
      P.dead = true; deadT = 0; deaths++; roomDeaths++; lastCause = cause; lives--;
      if (lives <= 0) { overT = 1.9; sfx('tt_over', { vol: 0.8 }); }
      sfx('tt_die', { vol: 0.9 });
      env.shake(0.35);
      const cy = P.y - R.gdir * PH * 0.6;
      for (let i = 0; i < 14; i++) {                          // black pixel bits
        const a = Math.random() * TAU, v = 70 + Math.random() * 200;
        fx.spawn({ x: P.x, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140 * R.gdir, g: 900 * R.gdir, drag: 0.4, kind: 'debris', rgb: i < 3 ? '143,214,122' : '246,241,228', size: 4, life: 0.8 + Math.random() * 0.3, spin: 0 });
      }
      const list = TAUNT[cause] || TAUNT.any;
      taunt = roomDeaths >= 9 && Math.random() < 0.5 ? ['Still here?', 'Breathe. Look again.', 'Every trap is the same each time.'][deaths % 3] : list[deaths % list.length];
      tauntT = 2.2;
    }
    function burst(x, y, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 40 + Math.random() * 90; fx.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: 'debris', rgb: '255,255,255', size: 3, life: 0.5, spin: 0 }); }
    }
    function dust() { /* flat look: no dust */ }

    // ── per-frame simulation ───────────────────────────────────────────────
    // the test autopilot: steps per room (see the header). Directions are meant on screen; the bot
    // presses the mirrored button itself when controls are swapped.
    function botInput(dt) {
      // (trap checks: window.__templeBait = i plays the stage's bait route i instead, the one a player falls for)
      const bi = window.__templeBait, steps = bi !== undefined && bi !== null && rooms[ri].baits && rooms[ri].baits[bi] ? rooms[ri].baits[bi].bot : (rooms[ri].bot || []);
      const s = steps[bot.i];
      const px = P.x / T;
      bot.press = false;
      if (s) {
        const [k, a, b] = s;
        if (!bot.init) {
          bot.init = true; bot.t = 0; bot.air = false; bot.past = false;
          if (k === 'run' || k === 'go' || k === 'jumpAt') {
            const want = Math.sign(a - px) || bot.dir || 1;
            // already just past the mark while moving that way: count it as reached (don't turn back)
            if (k !== 'go' && bot.dir && want !== bot.dir && Math.abs(a - px) < 0.7) bot.past = true; else bot.dir = want;
          }
          if (k === 'wait') bot.dir = 0;
          if ((k === 'sawjump' || k === 'shadowjump') && !bot.dir) bot.dir = 1;
          if (k === 'dodge') bot.dir = bot.dir0 = Math.sign(a - px) || 1;
        }
        bot.t += dt;
        const reached = () => bot.past || (bot.dir > 0 ? px >= a : px <= a);
        let next = false;
        if (k === 'run' || k === 'go') { if (reached()) { if (k === 'go') bot.dir = 0; next = true; } }
        else if (k === 'jumpAt') { if (reached()) { bot.press = true; bot.hold = b || 0.32; next = true; } }
        else if (k === 'jump') { bot.press = true; bot.hold = a || 0.32; next = true; }
        else if (k === 'dir') { bot.dir = a; next = true; }
        else if (k === 'hold') { bot.hold = a; next = true; }
        else if (k === 'holejump') {
          // jump the moving hole a when its near edge comes close (keep running the way you go)
          const h = R.holes[a], d = bot.dir || 1;
          if (!bot.dir) bot.dir = 1;
          const near = d > 0 ? (h.hx - h.w / 2) - (P.x + PW / 2) : (P.x - PW / 2) - (h.hx + h.w / 2);
          if (near < -h.w) next = true;
          else if (P.ground && near < (b === undefined ? 5 : b) && near > -3) { bot.press = true; bot.hold = 0.32; next = true; }
        }
        else if (k === 'swapset') {
          // make sure the '[' set is solid (a = true) or not before hopping onto swap blocks: hop in place if it isn't
          bot.dir = 0;
          if (R.swapOn === a && P.ground && bot.t > 0.12) next = true;
          else if (R.swapOn !== a && P.ground && !bot.hopped) { bot.press = true; bot.hold = 0.32; bot.hopped = true; }
          else if (P.ground && bot.hopped && bot.t > 0.3) bot.hopped = false;
        }
        else if (k === 'sawjump' || k === 'shadowjump') {
          // jump the saw blade (or the shadow) about to meet you, keep running the way you go
          const o = k === 'sawjump' ? R.saws[a] : (R.echo && R.echo.on ? { x: R.echo.x, vx: R.echo.vx || 0 } : null), d = bot.dir || 1;
          if (!o || o.alive === false) next = true;
          else {
            const ahead = (o.x - P.x) * d / T, away = (o.vx || 0) * d > 10;
            bot.pause = away && ahead > 0 && ahead < 3.4;              // let it turn round first
            const rel = (P.vx - (o.vx || 0)) * d / T;
            if (ahead < -0.6) next = true;
            else if (!bot.pause && P.ground && rel > 0.5 && (ahead - (b || 1.25)) / rel < 0.2) { bot.press = true; bot.hold = 0.32; next = true; }
            if (next) bot.pause = false;
          }
        }
        else if (k === 'partjump' || k === 'hopto') {
          // jump onto a spare part (a = its number, b = which escalator) or a target fn(R, P) -> {x}, steering in the air to land on its middle
          const tg = k === 'partjump' ? (R.api.esc(b || 0) || { partAt: () => null }).partAt(a) : a(R.api, pview());
          if (!tg) next = true;
          else {
            const dx = tg.x - px;
            if (!bot.air) { if (P.ground && bot.t > 0.05) { bot.dir = Math.sign(dx) || 1; bot.press = true; bot.hold = k === 'hopto' && b !== undefined ? b : 0.32; bot.air = true; } }
            else if (!P.ground) bot.dir = Math.abs(dx) > 0.12 ? Math.sign(dx) : 0;
            else if (bot.t > 0.12) { bot.dir = 0; next = true; }
          }
        }
        else if (k === 'climb') {
          // hold jump on a ladder until the feet are up at row a (b = drift that way while climbing)
          bot.dir = b || 0; bot.hold = 0.05;
          if (P.y / T <= a + 0.02 && !onLadder()) { bot.hold = 0; next = true; }
        }
        else if (k === 'dodge') {
          // climb toward x = a like a careful player: when a spilled part comes down at you, stop, let it come,
          // hop over it in place, then carry on (hopping up any step in the way)
          if ((bot.dir0 > 0 ? px >= a : px <= a) && P.ground) { bot.dir = 0; next = true; }
          else if (P.ground) {
            let tc = 9, near = 1e9;
            for (const pt of R.parts) {
              const dx = pt.x - P.x, gap = Math.abs(dx) - (pt.r * 0.85 + PW / 2), sp = -Math.sign(dx) * (pt.vx || 0);
              if (gap > 4 && (Math.sign(dx) !== bot.dir0 || sp <= 5)) continue;            // behind us, or not coming
              if (pt.y < P.y - PH - 3 * T) continue;                                      // far above
              near = Math.min(near, gap); tc = Math.min(tc, gap <= 4 ? 0 : gap / sp);
            }
            if (tc < (b === undefined ? 0.13 : b)) { bot.dir = 0; bot.press = true; bot.hold = 0.32; }
            else if (near < (bot.wz || 70)) bot.dir = 0;
            else { bot.dir = bot.dir0; if (Math.abs(P.vx) < 5 && bot.t > 0.05) { bot.press = true; bot.hold = 0.32; } }
          }
        }
        else if (k === 'wait') { if (bot.t >= a) next = true; }
        else if (k === 'swimto') {                               // swim to (a, b) tiles: steer, stroke while below it
          const dx = a - px, dy = (P.y - PH / 2) / T - b;
          bot.dir = Math.abs(dx) > 0.15 ? Math.sign(dx) : 0;
          if (dy > 0.1 && (s[3] === 'fast' || P.vy > -30) && bot.t - (bot.lastStroke || -9) > (s[3] === 'fast' ? 0.15 : 0.12)) { bot.press = true; bot.hold = 0.05; bot.lastStroke = bot.t; }
          if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.15) { bot.dir = 0; bot.lastStroke = -9; bot.hoverY = b; next = true; }
        }
        else if (k === 'pace') {                                 // keep moving between a and b for s[3] seconds (never stand still)
          if (!bot.pdir) bot.pdir = px < (a + b) / 2 ? 1 : -1;
          if (px >= Math.max(a, b)) bot.pdir = -1; else if (px <= Math.min(a, b)) bot.pdir = 1;
          bot.dir = bot.pdir;
          if (typeof s[3] === 'function' ? s[3](R.api, pview()) : bot.t >= s[3]) { bot.pdir = 0; next = true; }
        }
        else if (k === 'land') { if (!P.ground) bot.air = true; if ((P.ground && (bot.air || bot.t > 0.15)) || bot.t > 2.5) next = true; }
        else if (k === 'until') { if (a(R.api, pview())) next = true; }
        if (next) { bot.i++; bot.init = false; }
      }
      // (in the water between swims, tread water at the last swim's height)
      if (P.swim && s && s[0] !== 'swimto' && bot.hoverY !== undefined && !bot.press && (P.y - PH / 2) / T > bot.hoverY + 0.08 && P.vy > -20 && bot.t - (bot.lastTread || -9) > 0.12) { bot.press = true; bot.hold = 0.05; bot.lastTread = bot.t; }
      if (!P.swim) bot.hoverY = undefined;
      if (bot.hold > 0) bot.hold -= dt;
      const d = bot.pause ? 0 : R.mirror ? -bot.dir : bot.dir;
      return { left: d < 0, right: d > 0, jumpP: bot.press, jumpH: bot.press || bot.hold > 0 };
    }
    const pview = () => ({ x: P.x / T, y: P.y / T, air: !P.ground, ground: P.ground, flipped: R.gdir < 0, vx: P.vx, on: P.on, still: P.still || 0 });

    // physics in fixed 1/120 s ticks whatever the frame rate (the jump press is held over to the next tick)
    let acc = 0, jpLatch = false;
    function update(dt, I) {
      if (R && R.rebake) { R.rebake = false; bakeRoom(); }
      if (P) camera(dt);
      t += dt;
      if (done) return;
      introT += dt; tauntT = Math.max(0, tauntT - dt); flashT = Math.max(0, flashT - dt);
      fade = clamp(fade + fadeDir * dt * 3.2, 0, 1);
      if (nextAfterFade && fade >= 1) { const f = nextAfterFade; nextAfterFade = null; f(); fadeDir = -1; }
      timeLeft -= dt * env.clock;
      if (timeLeft <= 0) { timeLeft = 0; done = true; env.lose('Time’s up'); return; }
      if (I.pressed && I.pressed.jump) jpLatch = true;
      acc = Math.min(acc + dt, 0.1);
      while (acc >= STEP - 1e-9 && !done) { acc -= STEP; tick(STEP, I); }
    }
    function tick(dt, I) {
      if (P.dead) {
        deadT += dt; stepWorld(dt);
        if (deadT > 0.62) {
          if (lives <= 0) {                                    // GAME OVER: the card, then the run again from its first stage
            if (deadT < 1.9) { hudSet(); return; }
            lives = LIVES; overT = 0;
            if (!env.onlyRoom && ri !== firstRoom) loadRoom(firstRoom, false); else loadRoom(ri, true);
            taunt = 'From the top.'; tauntT = 2.0;
          }
          else loadRoom(ri, true);
        }
        hudSet(); return;
      }
      if (P.entering > 0) {
        P.entering += dt; stepWorld(dt);
        if (P.entering > 0.55 && !nextAfterFade) {
          fadeDir = 1;
          nextAfterFade = () => {
            if (ri + 1 >= rooms.length || env.onlyRoom) { finish(); return; }
            loadRoom(ri + 1, false); best = Math.max(best, ri);
          };
        }
        hudSet(); return;
      }
      // input (or the test autopilot)
      bot.on = !!window.__templeBot;
      let L = I.left, Rt = I.right, jp = jpLatch, jh = !!(I.held.jump);
      jpLatch = false;
      if (bot.on) { const b = botInput(dt); L = b.left; Rt = b.right; jp = b.jumpP; jh = b.jumpH; }
      let dir = (Rt ? 1 : 0) - (L ? 1 : 0);
      if (R.mirror) dir = -dir;
      R.t += dt;
      for (let i = R.timers.length - 1; i >= 0; i--) { const tm = R.timers[i]; tm.t -= dt; if (tm.t <= 0) { R.timers.splice(i, 1); tm.fn(); } }
      stepWorld(dt);
      if (P.dead) { hudSet(); return; }
      // movers carried the player / pushed into the player
      for (const b of R.blist) {
        if (!b.alive || (!b.dx && !b.dy)) continue;
        if (P.ground && P.on === b.id && b.carry) { P.x += b.dx; P.y += b.dy; }
        if (!b.solid || b.falling > 0.15) continue;
        const pb = box();
        for (const q of b.rects) {
          const r = { x0: q.x + b.ox, y0: q.y + b.oy, x1: q.x + q.w + b.ox, y1: q.y + q.h + b.oy };
          if (!deep(pb, r, 0.5)) continue;                     // (hairline overlaps from riding it are not a push)
          // pushed out along the block's motion, to the side of the block the player is on
          const vert = Math.abs(b.dy) >= Math.abs(b.dx);
          const below = (pb.y0 + pb.y1) / 2 > (r.y0 + r.y1) / 2, right = (pb.x0 + pb.x1) / 2 > (r.x0 + r.x1) / 2;
          if (vert) P.y += below ? r.y1 - pb.y0 + 0.01 : r.y0 - pb.y1 - 0.01;
          else P.x += right ? r.x1 - pb.x0 + 0.01 : r.x0 - pb.x1 - 0.01;
          const nb = box();
          if (solids(b).some(s => deep(nb, s, 0.5))) { die('crush'); hudSet(); return; }
          if (vert && (R.gdir > 0 ? !below : below)) { P.ground = true; P.on = b.id; P.vy = 0; }
          break;
        }
      }
      // escalator steps and spare parts carry you; a step that moves into you lifts you or shoves you aside
      for (const e of R.escs) for (const st of e.steps) {
        if (st.gone || (!st.dx && !st.dy)) continue;
        if (P.ground && P.on === st.id) { P.x += st.dx; P.y += st.dy; continue; }
        if (st.drop && st.drop.t > 0.12) continue;
        const pb = box(), rr = stepRect(st);
        if (!deep(pb, rr, 0.5)) continue;
        if (R.gdir > 0 && pb.y1 - rr.y0 <= 10) { P.y = rr.y0; P.ground = true; P.on = st.id; if (P.vy > 0) P.vy = 0; }
        else P.x += (pb.x0 + pb.x1) / 2 > st.x ? rr.x1 - pb.x0 + 0.01 : rr.x0 - pb.x1 - 0.01;
        const nb = box();
        if (solids().some(q => q.b !== st && deep(nb, q, 0.5))) { die('crush'); hudSet(); return; }
      }
      // run
      const onGround = P.ground;
      const inW = waterAt(P.x, P.y - PH * 0.5); P.swim = inW;
      const drag = inW && R.pull && R.flood && R.flood.target !== null && R.flood.target > R.flood.y ? Math.sign(R.pull.x - P.x) * R.pull.v : 0;
      const target = inW ? dir * SWIM_RUN + drag : dir * RUN + (onGround ? (dir ? R.wind * 0.5 : 0) : R.wind);
      const a = inW ? (dir ? 900 : 700) : onGround ? (dir ? ACC : DEC) : (dir ? AIR_ACC : AIR_DEC);
      if (P.vx < target) P.vx = Math.min(target, P.vx + a * dt); else if (P.vx > target) P.vx = Math.max(target, P.vx - a * dt);
      if (dir) P.face = dir;
      // jump (buffered, with coyote time); in a flip-jump room the button turns gravity over instead
      if (jp) P.buf = BUFFER; else P.buf = Math.max(0, P.buf - dt);
      P.coy = onGround ? COYOTE : Math.max(0, P.coy - dt);
      const ladder = onLadder();
      if (inW && P.buf > 0) {                                     // a stroke (near the surface: up and out)
        P.buf = 0; const sy = surfaceAbove(P.x, P.y - PH * 0.5);
        P.vy = sy !== null && P.y - PH - sy < 8 ? -SURF_V : -STROKE_V; P.ground = false; P.launched = true; sfx('tt_bounce', { vol: 0.25, rate: 0.7 });
      } else if (P.buf > 0 && (onGround || P.coy > 0) && !ladder) {
        P.buf = 0; P.coy = 0;
        if (R.flipJumps) { flipGravity(R); }
        else { P.vy = -JUMP_V * R.gdir; P.ground = false; P.cut = false; P.launched = false; sfx('tt_jump', { vol: 0.45 }); }
      }
      const rising = P.vy * R.gdir < 0;
      if (rising && !jh && !P.cut && !P.launched) { P.vy *= CUT; P.cut = true; }
      const gg = rising && (jh || P.launched) ? G_UP : G_DN;
      if (inW) { P.vy = Math.min(SWIM_MAXF, P.vy + SWIM_G * dt); if (P.vy < -SURF_V) P.vy = -SURF_V; }
      else { P.vy += gg * R.gdir * dt; if (Math.abs(P.vy) > MAXF) P.vy = Math.sign(P.vy) * MAXF; }
      if (ladder) { P.vy = jh ? -112 : Math.min(P.vy, 64); P.vx *= 0.7; P.climb = jh; } else P.climb = false;
      // move with collisions (substeps keep fast falls honest)
      const wasGround = P.ground;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(P.vx), Math.abs(P.vy)) * dt / 7));
      P.ground = false; P.on = null;
      let headHit = false;
      for (let s = 0; s < n; s++) {
        const S = solids();
        P.x += P.vx * dt / n;
        let b = box();
        // (a hair of overlap on the other axis is rounding from riding a mover, not a wall)
        for (const r of S) if (b.x0 < r.x1 && b.x1 > r.x0 && b.y0 < r.y1 - 0.05 && b.y1 > r.y0 + 0.05) { if (P.vx > 0) P.x = r.x0 - PW / 2 - 0.001; else if (P.vx < 0) P.x = r.x1 + PW / 2 + 0.001; P.vx = 0; b = box(); }
        P.x = clamp(P.x, PW / 2, RW - PW / 2);
        const dy = P.vy * dt / n, pre = box();
        P.y += dy;
        b = box();
        for (const r of S) if (b.x0 < r.x1 - 0.05 && b.x1 > r.x0 + 0.05 && b.y0 < r.y1 && b.y1 > r.y0) {
          if (pre.x0 < r.x1 - 0.05 && pre.x1 > r.x0 + 0.05 && pre.y0 < r.y1 - 0.05 && pre.y1 > r.y0 + 0.05) continue;   // (already inside it: a mover pushed in from the side, not a floor or a ceiling)
          if (dy * R.gdir > 0) { P.y = R.gdir > 0 ? r.y0 : r.y1; P.ground = true; P.on = r.b.id; if (r.b.kind === 'ghost') r.b.seen = 1; }
          else { P.y = R.gdir > 0 ? r.y1 + PH : r.y0 - PH; headHit = true; }
          P.vy = 0; b = box();
        }
      }
      if (onGround && !P.ground) { P.air++; P.jumped = P.vy * R.gdir < -1; }   // left the ground: a new airborne spell (jumped, or walked off)
      if (!P.ground && !P.dead) aimTraps();
      if (P.ground && !wasGround) { P.land = 1; if (Math.abs(P.vy) < 1) sfx('tt_land', { vol: 0.3 }); dust(P.x, P.y, 4, 2); P.launched = false; }
      if (headHit) P.cut = true;
      // springs: land on one = launched (hold jump to go higher)
      for (const sp of R.springs) {
        if (P.ground && Math.abs(P.x - sp.x) < T * 0.55 && Math.abs(P.y - sp.y) < 2 && R.gdir > 0) {
          P.vy = -(jh ? SPRING_HI : SPRING_V); P.ground = false; P.launched = true; sp.sq = 1; sfx('tt_spring', { vol: 0.7 });
        }
      }
      // fake ground you sink into crumbles away
      const pb = box();
      for (const b of R.blist) if (b.kind === 'fake' && b.alive && b.rects.some(q => hit(pb, { x0: q.x, y0: q.y - 1, x1: q.x + q.w, y1: q.y + q.h }))) {
        b.alive = false; sfx('tt_crumble', { vol: 0.6, rate: 1.3 });
        for (const q of b.rects) for (let i = 0; i < 10; i++) fx.spawn({ x: q.x + Math.random() * q.w, y: q.y + Math.random() * 8, vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 80, g: 900, kind: 'debris', rgb: MASS_RGB, size: 4, life: 1, spin: 0 });
      }
      // runes turn gravity over (once per touch)
      for (const ru of R.runes) {
        const touching = P.ground && Math.abs(P.x - ru.x) < T * 0.5 && Math.abs(P.y - ru.y) < 3 && ((R.gdir > 0) === !ru.up);
        if (touching && ru.arm) { ru.arm = false; flipGravity(R); }
        else if (!touching && !P.ground) ru.arm = true;
      }
      // the run cycle + idle blink
      P.still = P.ground && Math.abs(P.vx) < 4 ? (P.still || 0) + dt : 0;
      P.run += Math.abs(P.vx) * dt / 15; P.land = Math.max(0, P.land - dt * 7); P.born += dt;
      P.blink -= dt; if (P.blink < -0.12) P.blink = 2 + Math.random() * 3;
      if (P.ground) for (const b of R.fragiles) if (P.on === b.id && b.vanT < 0 && !b.hidden) b.vanT = b.fragile.delay;
      hazards();
      if (!P.dead) doorsCheck();
      if (!P.dead && R.idol && !R.idol.taken && Math.abs(P.x - R.idol.x) < 13 && P.y > R.idol.y - 30 && P.y < R.idol.y + 4) {
        R.idol.taken = true; sfx('tt_spring', { vol: 0.7, rate: 1.4 }); burst(R.idol.x, R.idol.y - 14, 16); taunt = '+1 GOLDEN SEED!'; tauntT = 1.6;
        if (R.idol.fn) R.idol.fn();
      }
      if (!P.dead) rules();
      // the shadow that follows (echo)
      if (R.echo && !P.dead) {
        const e = R.echo; e.t += dt; e.trail.push({ t: e.t, x: P.x, y: P.y, g: R.gdir });
        while (e.trail.length > 2 && e.trail[1].t <= e.t - e.delay) e.trail.shift();
        const s = e.trail[0];
        if (e.t >= e.delay) { e.vx = dt > 0 ? (s.x - e.x) / dt : 0; e.x = s.x; e.y = s.y; e.on = true; const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < 11) die('shadow'); }
      }
      hudSet();
    }
    function rules() {
      const v = pview();
      for (let i = 0; i < R.rules.length; i++) {
        const ru = R.rules[i];
        const c = !!ru.cond(v);
        if (c && !ru.was) { ru.fn(); if (ru.once) { R.rules.splice(i, 1); i--; continue; } }
        ru.was = c;
      }
    }
    function stepWorld(dt) {
      for (const b of R.blist) {
        stepMover(b, dt);
        if (!b.live && !b.static && (b.dx || b.dy || b.shk || !b.alive || (b.cur && b.cur.k !== 'wait'))) { b.live = true; R.rebake = true; }
        if (b.oy > RH + 200 || b.oy < -RH - 200) { b.alive = false; b.q = []; b.cur = null; }
        if (b.seen > 0) b.seen = Math.max(0, b.seen - dt * 0.8);
      }
      for (const s of R.slist) {
        stepMover(s, dt);
        if (s.attach) { s.ox = s.attach.ox; s.oy = s.attach.oy; }
        if (s.hunt && s.hunt.on && P && !P.dead) {
          const lx = Math.min(...s.tiles.map(t => t.x)) * T, w = (Math.max(...s.tiles.map(t => t.x)) + 1) * T - lx;
          // (like a hunting hole: while you're in the air it keeps sliding the way it was, so jumping over it works)
          if (!P.ground) s.ox = clamp(s.ox + (s.hunt.dir || 0) * s.hunt.speed * dt, s.hunt.min, s.hunt.max);
          else { const want = clamp(P.x - w / 2 - lx, s.hunt.min, s.hunt.max), d = want - s.ox; if (d) s.hunt.dir = Math.sign(d); s.ox += Math.sign(d) * Math.min(Math.abs(d), s.hunt.speed * dt); }
        }
        if (s.falling !== undefined && s.cur && s.cur.k === 'fall' && s.fallDist && s.oy >= s.fallDist && s.alive) {
          s.alive = false; sfx('tt_crumble', { vol: 0.5, rate: 1.6 });
          for (const tl of s.tiles) for (let i = 0; i < 5; i++) fx.spawn({ x: (tl.x + 0.5) * T + (Math.random() - 0.5) * 12, y: tl.y * T + s.oy + T * 0.6, vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 100, g: 900, kind: 'debris', rgb: MASS_RGB, size: 4, life: 0.8, spin: 0 });
        }
      }
      for (const d of R.doors) {
        stepMover(d, dt);
        if (d.ride) { d.ox = d.ride.ox; d.oy = d.ride.oy; if (d.ride.oy > RH) d.alive = false; }
        if (d.charging) { d.ox += d.vx * dt; if (d.x + d.ox < -60 || d.x + d.ox > RW + 60) { d.alive = false; d.charging = false; } }
        if (d.alpha < 1) d.alpha = Math.min(1, d.alpha + dt * 2.5);
        if (d.y + d.oy > RH + 90) d.alive = false;
      }
      for (const s of R.saws) {
        s.ang += dt * 14 * (s.vx < 0 ? -1 : 1);
        if (s.moving && s.path) {
          let left = s.speed * dt;
          while (left > 0 && s.seg < s.path.length) {
            const tg = s.path[s.seg], dx = tg.x - s.x, dy = tg.y - s.y, d = Math.hypot(dx, dy);
            if (d <= left) { s.x = tg.x; s.y = tg.y; left -= d; s.seg++; } else { s.x += dx / d * left; s.y += dy / d * left; left = 0; }
          }
          if (s.seg >= s.path.length) { if (s.loop) s.seg = 0; else s.moving = false; }
        }
        s.vx = dt > 0 ? (s.x - (s.px === undefined ? s.x : s.px)) / dt : 0; s.px = s.x;
        s.vy = dt > 0 ? (s.y - (s.py === undefined ? s.y : s.py)) / dt : 0; s.py = s.y;
        if (s.y > RH + 60) s.alive = false;
      }
      for (const sp of R.springs) sp.sq = Math.max(0, sp.sq - dt * 5);
      for (const f of R.flyers) stepFlyer(f, dt);
      for (const bd of R.boulders) stepBoulder(bd, dt);
      for (const d of R.drops) stepDrop(d, dt);
      for (const bl of R.balls) stepBall(bl, dt);
      stepFlood(dt);
      for (const sp of R.spears) sp.ext = sp.to > sp.ext ? Math.min(sp.to, sp.ext + dt / 0.07) : Math.max(sp.to, sp.ext - dt / 0.25);
      for (const sh of R.shooters) stepShooter(sh, dt);
      for (const s2 of R.shots) stepShot(s2, dt);
      for (const u of R.urchins) stepUrchin(u, dt);
      for (const f2 of R.fish) stepFish(f2, dt);
      if (R.idol) R.idol.t += dt;
      for (const pk of R.planks) stepPlank(pk, dt);
      for (const h of R.holes) {
        if (!h.on) continue;
        let target = null;
        if (h.mode === 'patrol') { h.hx += h.dir * h.speed * dt; if (h.hx > h.x1 - h.w / 2) { h.hx = h.x1 - h.w / 2; h.dir = -1; } if (h.hx < h.x0 + h.w / 2) { h.hx = h.x0 + h.w / 2; h.dir = 1; } }
        else if (h.mode === 'hunt' && !P.dead) {
          // it slides toward you while you're on the ground; while you're in the air it keeps going the way it was (so a jump over it works)
          if (P.ground) target = P.x; else h.hx = clamp(h.hx + h.dir * h.speed * dt, h.x0 + h.w / 2, h.x1 - h.w / 2);
        }
        else if (h.mode === 'land' && !P.dead && !P.ground && P.x > h.x0 - 3 * T && P.x < h.x1 + 3 * T) {
          const vy = P.vy, dy = Math.max(0, h.y - P.y), tl = (-vy + Math.sqrt(vy * vy + 2 * G_DN * dy)) / G_DN;   // time until the feet reach the floor
          target = P.x + P.vx * Math.min(0.7, tl);
        }
        if (target !== null) { const d = clamp(target, h.x0 + h.w / 2, h.x1 - h.w / 2) - h.hx; if (d) h.dir = Math.sign(d); h.hx += Math.sign(d) * Math.min(Math.abs(d), h.speed * dt); }
      }
      for (const b of R.blist) if (b.breath) { b.breath.t += dt; b.rects = breathRects(b); }
      for (const e of R.escs) stepEsc(e, dt);
      for (let i = R.parts.length - 1; i >= 0; i--) { const pt = R.parts[i]; stepPart(pt, dt); if (!pt.alive) R.parts.splice(i, 1); }
      for (const b of R.fragiles) {
        if (b.vanT >= 0) { b.vanT -= dt; b.shk = 1.4; if (!b.live) { b.live = true; R.rebake = true; } if (b.vanT < 0) { b.hidden = true; b.backT = b.fragile.back || -1; sfx('tt_crumble', { vol: 0.55, rate: 1.5 }); for (const q of b.rects) for (let k = 0; k < 8; k++) fx.spawn({ x: q.x + Math.random() * q.w, y: q.y + Math.random() * q.h, vx: (Math.random() - 0.5) * 80, vy: Math.random() * 60, g: 900, kind: 'debris', rgb: MASS_RGB, size: 4, life: 0.8, spin: 0 }); } }
        else if (b.hidden && b.backT > 0) { b.backT -= dt; if (b.backT <= 0) { const pb = P && box(); if (pb && b.rects.some(q => hit(pb, { x0: q.x, y0: q.y, x1: q.x + q.w, y1: q.y + q.h }))) b.backT = 0.05; else { b.hidden = false; sfx('tt_pop', { vol: 0.4 }); } } }
      }
      for (const bl of R.blinks) { bl.t += dt; const on = bl.t % (bl.on + bl.off) < bl.on; bl.b.solid = on; bl.b.ghostly = !on; }
      if (R.swaps.length && P) { const pb = box(); for (const w of R.swaps) if (w.pend && !hit(pb, { x0: w.x, y0: w.y, x1: w.x + T, y1: w.y + T })) w.pend = false; }
      if (R.chase) {
        const c = R.chase; c.t += dt; const front = c.x0 + c.speed * c.t;
        for (const b of R.blist) if (b.kind === 'crumble' && b.alive && !b.started && (b.col + 0.5) * T <= front + T * 0.6) {
          b.started = true; b.q.push({ k: 'shake', dur: 0.18, amp: 1.8, name: 'shake' }, { k: 'fn', fn: () => { b.carry = false; if (Math.random() < 0.5) sfx('tt_crumble', { vol: 0.35, rate: 0.9 + Math.random() * 0.4 }); } }, { k: 'fall', dir: 1 });
        }
      }
      if (R.dark) { R.darkA = Math.min(1, R.darkA + dt * 3); R.storm -= dt; if (R.storm <= 0) { R.storm = 2.0 + Math.random() * 0.6; R.light = 0.16; sfx('tt_thunder', { vol: 0.5 }); } }
      else R.darkA = Math.max(0, R.darkA - dt * 3);
      R.light = Math.max(0, (R.light || 0) - dt);
      if (R.wind) { R.windT += dt; if (Math.random() < dt * 30) fx.spawn({ x: R.wind > 0 ? cam.x - 10 : cam.x + fit().vw + 10, y: cam.y + Math.random() * fit().vh * 0.8, vx: R.wind * 4 + (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 30, kind: 'debris', rgb: MASS_RGB, size: 2.5, life: 2.2, spin: 0, drag: 0 }); }
    }
    function breathRects(b) {
      const br = b.breath;
      return b.cols.map(c => {
        const k = 0.5 + 0.5 * Math.cos(br.t * TAU / br.period + c.i * br.ripple), w = T * (br.min + (1 - br.min) * k);
        return { x: c.x * T + (T - w) / 2, y: c.y0 * T, w, h: (c.y1 - c.y0) * T };
      });
    }
    function stepEsc(e, dt) {
      if (e.shakeT > 0) e.shakeT -= dt;
      if (e.warn > 0) e.warn -= dt;
      if (e.railK > 0) e.railK = Math.min(1, e.railK + dt * 1.6);
      for (const st of e.steps) {
        st.px = st.x; st.py = st.y;
        if (st.part) {
          const pp = st.part; pp.t += dt;
          if (pp.t < 0) { st.dx = st.dy = 0; continue; }
          const k = Math.min(1, pp.t / pp.dur), kk = EASE.io(k), tt = Math.max(0, pp.t - pp.dur);
          let x = pp.fx + (pp.tx - pp.fx) * kk, y = pp.fy + (pp.ty - pp.fy) * kk;
          if (k >= 1) {
            y += Math.sin(tt * 2.4 + pp.ph) * pp.bob * Math.min(1, tt * 2) - (pp.lift ? Math.sin(tt * TAU / (pp.period || 2.4)) * pp.lift * T : 0);
            if (pp.swing) x += Math.sin(tt * TAU / (pp.period || 2.4)) * pp.swing * T;
            if (pp.drop !== undefined && pp.dropT === undefined && P && P.ground && P.on === st.id) { pp.dropT = pp.drop; sfx('tt_clank', { vol: 0.4, rate: 1.4 }); }
            if (pp.dropT !== undefined) { pp.dropT -= dt; if (pp.dropT < 0) { st.drop = { t: 0.13, vy: 0 }; st.part = null; } }
          }
          if (st.part) { st.x = x; st.y = y; }
        } else if (st.drop) {
          st.drop.t += dt;
          if (st.drop.t > 0) { st.drop.vy += 1800 * dt; st.y += st.drop.vy * dt; st.rot = (st.rot || 0) + dt * (st.id.length % 2 ? 2 : -2); }
          if (st.y > RH + 80) st.gone = true;
        } else if (!e.broken && e.v) { st.u += e.v * dt; escPos(e, st); }
        st.dx = st.x - st.px; st.dy = st.y - st.py;
      }
      if (!e.broken && e.v) {
        e.steps = e.steps.filter(st => (e.v > 0 ? st.u < (e.n + 2) * T - 0.01 : st.u > -T + 0.01));
        const us = e.steps.map(st => st.u);
        if (e.v > 0) { const lo = Math.min(...us); if (lo > 0) addStep(e, lo - T); }
        else { const hi = Math.max(...us); if (hi < (e.n + 1) * T) addStep(e, hi + T); }
      }
      e.steps = e.steps.filter(st => !st.gone);
      if (e.spill && !P.dead) {
        const sp = e.spill; sp.t += dt;
        if (sp.t >= sp.every - 0.5 && !sp.warned && sp.n < sp.count) { sp.warned = true; e.warn = 0.5; sfx('tt_grind', { vol: 0.3, rate: 1.7 }); }
        if (sp.t >= sp.every && sp.n < sp.count) { sp.t -= sp.every; sp.warned = false; R.parts.push(spillPart(e, sp.kinds[sp.n % sp.kinds.length])); sp.n++; }
      }
    }
    function stepPart(pt, dt) {
      const ox = pt.x, oy = pt.y;
      stepPart1(pt, dt);
      pt.vx = dt > 0 ? (pt.x - ox) / dt : 0; pt.vy = dt > 0 ? (pt.y - oy) / dt : 0;
    }
    function stepPart1(pt, dt) {
      pt.ang += dt * pt.roll / pt.r;
      if (pt.i < pt.pts.length - 1) {
        const A = pt.pts[pt.i], B = pt.pts[pt.i + 1], hop = pt.hops[pt.i + 1];
        pt.k += dt / hop;
        if (pt.k >= 1) { pt.k = 0; pt.i++; sfx('tt_bounce', { vol: 0.28, rate: pt.kind === 'b' ? 1.7 : pt.kind === 'g' ? 1.25 : 0.9 }); }
        const k = Math.min(1, pt.k), H = pt.i === 0 ? T * 0.9 : Math.max(pt.H, (A.y - B.y) + pt.H * 0.6);   // (the hop out of the hatch goes higher)
        const Ai = pt.pts[pt.i], Bi = pt.pts[Math.min(pt.pts.length - 1, pt.i + 1)];
        if (pt.i >= pt.pts.length - 1) { pt.x = Ai.x; pt.y = Ai.y - pt.r; }
        else { pt.x = Ai.x + (Bi.x - Ai.x) * k; pt.y = Ai.y + (Bi.y - Ai.y) * k - H * 4 * k * (1 - k) - pt.r; }
      } else {
        // rolling along the floor at the bottom until it hits a wall or leaves the room
        pt.x += pt.roll * dt; pt.y = pt.floorY - pt.r;
        const tx = Math.floor((pt.x + Math.sign(pt.roll) * pt.r) / T), ty = Math.floor(pt.y / T);
        const ch = ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS ? R.g[ty][tx] : '.';
        if (ch === '#' || ch === '=') { pt.alive = false; sfx('tt_clank', { vol: 0.3, rate: 1.3 }); for (let k = 0; k < 6; k++) fx.spawn({ x: pt.x, y: pt.y, vx: (Math.random() - 0.5) * 140, vy: -80 - Math.random() * 80, g: 900, kind: 'debris', rgb: MASS_RGB, size: 3, life: 0.6, spin: 0 }); }
        const fl = Math.floor((pt.floorY + 2) / T), cx = Math.floor(pt.x / T);
        if (pt.fallV || !(fl < ROWS && cx >= 0 && cx < COLS && SOLIDISH(R.g[fl][cx]))) { pt.fallV = (pt.fallV || 0) + 1800 * dt; pt.floorY += pt.fallV * dt; }   // (off a ledge it drops away)
        if (pt.x < -3 * T || pt.x > RW + 3 * T || pt.y > RH + 60) pt.alive = false;
      }
    }
    function hazards() {
      const b = box(), sb = { x0: b.x0 + 1.5, y0: b.y0 + 1.5, x1: b.x1 - 1.5, y1: b.y1 - 1 };
      for (const s of R.slist) {
        if (!s.alive || s.ext < 0.4 || s.harmless) continue;
        for (const tl of s.tiles) if (hit(sb, spikeBox(s, tl))) { die('spike'); return; }
      }
      for (const s of R.saws) {
        if (!s.alive) continue;
        const cx = clamp(s.x, sb.x0, sb.x1), cy = clamp(s.y, sb.y0, sb.y1);
        if (Math.hypot(cx - s.x, cy - s.y) < s.r * 0.8) { die('saw'); return; }
      }
      for (const s of R.parts) {
        const cx = clamp(s.x, sb.x0, sb.x1), cy = clamp(s.y, sb.y0, sb.y1);
        if (Math.hypot(cx - s.x, cy - s.y) < s.r * 0.85) { die('part'); return; }
      }
      for (const f of R.flyers) if (f.state !== 'home' && f.state !== 'gone' && flyerHits(f, sb)) { die('block'); return; }
      for (const pk of R.planks) if (plankHits(pk, sb)) { die('plank'); return; }
      for (const bd of R.boulders) if (bd.alive && bd.wait <= 0 && Math.hypot(clamp(bd.x, sb.x0, sb.x1) - bd.x, clamp(bd.y, sb.y0, sb.y1) - bd.y) < bd.r * 0.9) { die('boulder'); return; }
      for (const d of R.drops) if (d.alive && d.wait <= 0 && hit(sb, { x0: d.x - T / 2 + 3, y0: d.y - T / 2 + 2, x1: d.x + T / 2 - 3, y1: d.y + T / 2 + 6 })) { die('drop'); return; }
      for (const bl of R.balls) if (bl.alive && bl.wait <= 0 && Math.hypot(clamp(bl.x, sb.x0, sb.x1) - bl.x, clamp(bl.y, sb.y0, sb.y1) - bl.y) < bl.r) { die('ball'); return; }
      for (const sp of R.spears) if (sp.ext > 0.3 && hit(sb, spearBox(sp))) { die('spear'); return; }
      for (const s2 of R.shots) if (s2.alive && Math.hypot(clamp(s2.x, sb.x0, sb.x1) - s2.x, clamp(s2.y, sb.y0, sb.y1) - s2.y) < 5) { die('shot'); return; }
      for (const u of R.urchins) if (u.state !== 'gone' && Math.hypot(clamp(u.x, sb.x0, sb.x1) - u.x, clamp(u.y, sb.y0, sb.y1) - u.y) < u.r) { die('urchin'); return; }
      for (const f2 of R.fish) if (f2.alive && hit(sb, { x0: f2.x - f2.w / 2 + 3, y0: f2.y - f2.h / 2 + 2, x1: f2.x + f2.w / 2 - 3, y1: f2.y + f2.h / 2 - 2 })) { die('fish'); return; }
      if ((R.gdir > 0 && P.y - PH > RH + 30) || (R.gdir < 0 && P.y + PH < -30)) { die('fall'); return; }
    }
    function spikeBox(s, tl) {
      const x = tl.x * T + s.ox, y = tl.y * T + s.oy, h = T * 0.5 * s.ext;
      switch (tl.dir) {
        case 'down': return { x0: x + 4, y0: y, x1: x + T - 4, y1: y + h * 0.9 };
        case 'left': return { x0: x + T - h * 0.9, y0: y + 4, x1: x + T, y1: y + T - 4 };
        case 'right': return { x0: x, y0: y + 4, x1: x + h * 0.9, y1: y + T - 4 };
        default: return { x0: x + 4, y0: y + T - h * 0.9, x1: x + T - 4, y1: y + T };
      }
    }
    function doorsCheck() {
      const pb = box();
      for (const e of R.exits) if (hit(pb, e)) { P.entering = 0.0001; P.vx = 0; sfx('tt_exit', { vol: 0.8 }); return; }
      for (const d of R.doors) {
        if (!d.alive || d.alpha < 0.6) continue;
        const dx = d.x + d.ox, dy = d.y + d.oy;
        const moving = d.cur && d.cur.k === 'hop';
        if (d.fake) {
          const r = d.hang ? { x0: dx - 9, y0: dy, x1: dx + 9, y1: dy + 29 } : { x0: dx - 9, y0: dy - 29, x1: dx + 9, y1: dy };
          if (hit(box(), r)) { d.bit = 0.4; die('door'); return; }
          continue;
        }
        if (moving || d.charging) continue;
        if (P.ground && Math.abs(P.x - dx) < 12 && Math.abs(P.y - dy) < 4 && (d.hang === (R.gdir < 0))) {
          P.entering = 0.0001; P.door = d; P.vx = 0; sfx('tt_exit', { vol: 0.8 });
          burst(dx, dy - 18 * R.gdir, 18);
          return;
        }
      }
    }
    function finish() {
      done = true;
      const n = rooms.length;
      if (env.round) env.setStars(deaths <= 2 ? 3 : deaths <= 6 ? 2 : 1);
      env.win();
    }
    function hudSet() { /* own HUD (def.hud none) */ }

    // ── art: a temple in chunky pixels (a 2 px grid). Stone is brickwork, two courses a tile, lit along the top
    // edge; behind it a near-black void with faint back-wall courses and a carved glyph here and there; bone-white
    // spikes; a little raccoon thief with a red scarf. One palette per pair of levels.
    const THEMES = [null,
      //  stone      stone top  mortar     void       back wall  spikes     glow       water / ice / lava
      ['#c8955a', '#ecc483', '#7a5230', '#120c08', '#24180f', '#f3ead6', '#ffd27a', '#3f8fb0'],   // sandstone gate
      ['#6f9a6a', '#a8d08e', '#38573a', '#0a1719', '#13292c', '#eaf2e4', '#c8ff9a', '#2c86a8'],   // flooded halls
      ['#a39bc6', '#dcd5f5', '#5a5382', '#0d0c1b', '#1a182f', '#f5f6ff', '#bfe9ff', '#9fdcf0'],   // ice crypt
      ['#b5463a', '#e3785e', '#661d17', '#110505', '#210b09', '#f6e6d6', '#ffb04a', '#ff7a2a'],   // lava depths
      ['#3b3652', '#d9b45c', '#1c1829', '#07060c', '#14121e', '#f2e8c8', '#ffd76a', '#ffcf4a']];  // the vault
    const TH = THEMES[clamp(Math.ceil(LV / 2), 1, 5)];
    const STONE = TH[0], STONE_HI = TH[1], MORTAR = TH[2], VOID = TH[3], BACK = TH[4], BONE = TH[5], GLOW = TH[6], XTRA = TH[7];
    const NIGHT = VOID, SPROUT = GLOW;
    const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
    const MASS_RGB = rgbOf(STONE), GLOW_RGB = rgbOf(GLOW);
    // one tile of brickwork at (X, Y) px: two courses with staggered joints; lit top / shaded bottom where it's open
    function brick(g, X, Y, top, bottom, left, right, tx, ty) {
      g.fillStyle = STONE; g.fillRect(X, Y, T, T);
      g.fillStyle = MORTAR;
      g.fillRect(X, Y + 12, T, 2); g.fillRect(X, Y + 24, T, 2);
      g.fillRect(X, Y, 2, 12); g.fillRect(X + 12, Y + 14, 2, 10);
      if (hr(tx, ty, 21) < 0.2) { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(X + 2, Y + 2, 10, 8); }
      if (hr(tx, ty, 22) < 0.14) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(X + 14, Y + 16, 10, 6); }
      if (top) { g.fillStyle = STONE_HI; g.fillRect(X, Y, T, 4); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(X, Y, T, 2); }
      if (bottom) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(X, Y + T - 4, T, 4); }
      if (left) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(X, Y, 2, T); }
      if (right) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(X + T - 2, Y, 2, T); }
    }
    const GLYPHS = [['.XXX.', 'X...X', 'X.X.X', 'X...X', '.XXX.'], ['..X..', '.XXX.', 'XX.XX', '.XXX.', '..X..'], ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X'], ['XXXXX', 'X...X', 'X.XXX', 'X....', 'XXXXX']];
    function glyph(g, x, y, k) {
      const G2 = GLYPHS[k % GLYPHS.length];
      g.fillStyle = BACK;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (G2[r][c] === 'X') g.fillRect(x + c * 4, y + r * 4, 4, 4);
    }
    function bakeRoom() {
      const S = fit().s, K = Math.min(2, 3800 / RW, 3800 / RH, Math.max(1, (env.dpr || 1) * S));
      bake.K = K;
      const cv = document.createElement('canvas'); cv.width = Math.round(RW * K); cv.height = Math.round(RH * K);
      const g = cv.getContext('2d'); g.scale(K, K); g.imageSmoothingEnabled = false;
      g.fillStyle = VOID; g.fillRect(0, 0, RW, RH);
      // the back wall: dim courses and a few carved glyphs
      g.fillStyle = BACK;
      for (let y = 0; y < RH; y += T) { g.fillRect(0, y + 24, RW, 2); for (let x = ((y / T) & 1) * T; x < RW; x += 2 * T) g.fillRect(x, y, 2, 24); }
      for (let i = 0; i < 5; i++) glyph(g, Math.floor(hr(i, 1, 31 + LV) * (COLS - 3)) * T + 6 + T * 1.5, Math.floor(hr(i, 2, 31 + LV) * (ROWS - 4)) * T + 6 + T, i + LV);
      // stone: fixed ground, and trap pieces that are standing still (pixel-identical to the real ground)
      const G0 = R.g, still = new Set();
      for (const b of R.blist) if (!b.static && b.kind !== 'ghost' && !b.live && b.alive && !b.hidden) for (const [x, y] of b.tiles) still.add(x + ',' + y);
      const solidAt = (x, y) => (y < 0 ? false : x < 0 || x >= COLS || y >= ROWS ? true : G0[y][x] === '#' || G0[y][x] === '=' || still.has(x + ',' + y));
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (solidAt(x, y))
        brick(g, x * T, y * T, !solidAt(x, y - 1), !solidAt(x, y + 1), !solidAt(x - 1, y), !solidAt(x + 1, y), x, y);
      for (const s of R.signs) drawSign(g, s);
      bake.room = cv;
    }
    // a little wooden sign on a post
    function drawSign(g, s) {
      g.font = "bold 9px 'Courier New', monospace";
      const w = Math.max(34, Math.ceil(g.measureText(s.text).width / 2) * 2 + 10);
      g.fillStyle = '#6b4a2b'; g.fillRect(s.x - 2, s.y - 24, 4, 24);
      g.fillStyle = '#8a6238'; g.fillRect(s.x - w / 2, s.y - 38, w, 15);
      g.fillStyle = '#5a3c22'; g.fillRect(s.x - w / 2, s.y - 25, w, 2);
      g.fillStyle = '#f3e2c0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.text, s.x, s.y - 30);
    }

    // ── drawing ───────────────────────────────────────────────────────────
    const cam = { x: 0, y: 0 };
    function fit() {
      const W = env.W, v = env.view, s = Math.min(W / (VIEW_C * T), v.h / (VIEW_R * T));
      const vw = Math.min(RW, W / s), vh = Math.min(RH, v.h / s);
      return { s, vw, vh, x: (W - vw * s) / 2, y: v.top + (v.h - vh * s) / 2 };
    }
    function camera(dt, snap) {
      const F = fit(), tx = clamp(P.x - F.vw * 0.42, 0, RW - F.vw), ty = clamp(P.y - F.vh * 0.6, 0, RH - F.vh);
      const k = snap ? 1 : Math.min(1, dt * 7);
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    }
    function render(c) {
      const F = fit(), W = env.W, v = env.view;
      c.fillStyle = VOID; c.fillRect(0, v.top, W, v.h);
      c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s);
      c.beginPath(); c.rect(0, 0, F.vw, F.vh); c.clip();
      c.translate(-Math.round(cam.x * F.s) / F.s, -Math.round(cam.y * F.s) / F.s);
      if (bake.room) c.drawImage(bake.room, 0, 0, RW, RH);
      for (const e of R.exits) drawExit(c, e);
      for (const e of R.lures) drawExit(c, e);
      // stone that moves (or shakes, or is about to go): drawn live, tile by tile
      for (const b of R.blist) {
        if (b.static || !b.alive || b.kind === 'ghost' || !b.live || b.hidden || b.bars) continue;
        if (b.grate) { for (const q of b.rects) { c.fillStyle = '#3a3f48'; c.fillRect(q.x + b.ox, q.y + b.oy, q.w, 4); c.fillRect(q.x + b.ox, q.y + b.oy + q.h - 4, q.w, 4); for (let xx = 3; xx < q.w; xx += 7) c.fillRect(q.x + b.ox + xx, q.y + b.oy, 3, q.h); c.fillStyle = '#6a717c'; c.fillRect(q.x + b.ox, q.y + b.oy, q.w, 1); } continue; }
        if (b.ghostly) { c.strokeStyle = STONE_HI; c.globalAlpha = 0.4; c.lineWidth = 2; c.setLineDash([4, 4]); for (const q of b.rects) c.strokeRect(q.x + b.ox + 1, q.y + b.oy + 1, q.w - 2, q.h - 2); c.setLineDash([]); c.globalAlpha = 1; continue; }
        const jx = b.shk ? (Math.random() - 0.5) * b.shk * 2 : 0;
        if (b.breath) { for (const q of b.rects) { c.fillStyle = STONE; c.fillRect(q.x + b.ox + jx, q.y + b.oy, q.w, q.h); c.fillStyle = STONE_HI; c.fillRect(q.x + b.ox + jx, q.y + b.oy, q.w, 4); } continue; }
        const own = b.ownSet || (b.ownSet = new Set(b.tiles.map(([x, y]) => x + ',' + y)));
        for (const [x, y] of b.tiles) brick(c, x * T + b.ox + jx, y * T + b.oy, !own.has(x + ',' + (y - 1)), !own.has(x + ',' + (y + 1)), !own.has((x - 1) + ',' + y), !own.has((x + 1) + ',' + y), x, y);
      }
      const gb = R.bodies['+'];
      if (gb && gb.seen > 0) { c.globalAlpha = gb.seen * 0.4; c.fillStyle = STONE; for (const q of gb.rects) c.fillRect(q.x, q.y, q.w, q.h); c.globalAlpha = 1; }
      for (const k of R.ladders) { const [x, y] = k.split(',').map(Number); c.fillStyle = '#8a6238'; c.fillRect(x * T + 4, y * T, 4, T); c.fillRect(x * T + T - 8, y * T, 4, T); for (let i = 0; i < 3; i++) c.fillRect(x * T + 4, y * T + 4 + i * 8, T - 8, 2); }
      for (const h of R.holes) for (const q of holeRects(h)) { for (let yy = q.y0; yy < Math.min(RH, q.y1); yy += T) for (let xx = q.x0; xx < q.x1 - 0.5; xx += T) brick(c, xx, yy, yy === q.y0, false, false, false, Math.round(xx / T), Math.round(yy / T)); }
      for (const w of R.swaps) {
        if (swapSolid(w)) brick(c, w.x, w.y, true, true, true, true, w.x / T, w.y / T);
        else { c.strokeStyle = STONE_HI; c.globalAlpha = 0.45; c.lineWidth = 2; c.setLineDash([4, 4]); c.strokeRect(w.x + 1.5, w.y + 1.5, T - 3, T - 3); c.setLineDash([]); c.globalAlpha = 1; }
      }
      for (const e of R.escs) drawEsc(c, e);
      for (const pt of R.parts) drawPart(c, pt);
      for (const sp of R.springs) drawSpring(c, sp);
      for (const ru of R.runes) drawRune(c, ru);
      for (const s of R.slist) if (s.alive && s.ext > 0.01) drawThorns(c, s);
      for (const s of R.saws) if (s.alive) drawSaw(c, s);
      for (const pk of R.planks) drawPlank(c, pk);
      for (const f of R.flyers) if (f.state !== 'home' && f.state !== 'gone') drawFlyer(c, f);
      const barB = R.bodies['$']; if (barB) for (const [x, y] of barB.tiles) drawBar(c, x, y);
      if (R.idol && !R.idol.taken) drawIdol(c, R.idol);
      for (const bd of R.boulders) if (bd.alive && bd.wait <= 0) drawBoulder(c, bd);
      for (const d of R.drops) if (d.alive && d.wait <= 0) drawDrop(c, d);
      for (const bl of R.balls) if (bl.alive && bl.wait <= 0) drawBall(c, bl);
      for (const d of R.doors) if (d.alive) drawDoor(c, d);
      for (const sp of R.spears) if (sp.ext > 0.01) drawSpear(c, sp);
      for (const sh of R.shooters) drawShooter(c, sh);
      for (const s2 of R.shots) if (s2.alive) drawShot(c, s2);
      for (const u of R.urchins) if (u.state !== 'gone') drawUrchin(c, u);
      for (const f2 of R.fish) if (f2.alive) drawFish(c, f2);
      if (!P.dead) drawThief(c, P.x, P.y, P.face);
      drawWater(c);
      fx.draw(c);
      if (R.darkA > 0) {
        const a = R.darkA * (1 - Math.min(1, (R.light || 0) * 7));
        const hx = P.x, hy = P.y - R.gdir * 11;
        const gr = c.createRadialGradient(hx, hy, 22, hx, hy, 86);
        gr.addColorStop(0, 'rgba(4,4,8,0)'); gr.addColorStop(1, `rgba(4,4,8,${(0.97 * a).toFixed(3)})`);
        c.fillStyle = P.dead ? `rgba(4,4,8,${(0.97 * a).toFixed(3)})` : gr; c.fillRect(0, 0, RW, RH);
      }
      if (flashT > 0) { c.fillStyle = `rgba(255,255,255,${(flashT * 0.5).toFixed(3)})`; c.fillRect(0, 0, RW, RH); }
      const fd = Math.max(fade, P.dead && lives > 0 ? Math.max(0, (deadT - 0.4) / 0.22) : 0);
      if (fd > 0) { c.globalAlpha = fd; c.fillStyle = VOID; c.fillRect(0, 0, RW, RH); c.globalAlpha = 1; }
      c.restore();
      drawHud(c, F);
    }
    // the way out: a little warm light breathing at the edge opening
    function drawExit(c, e) {
      const right = e.x0 >= RW - T - 1, left = e.x0 < 1, k = 0.5 + 0.5 * Math.sin(t * 3);   // (edges glow inward; anything else glows from above)
      const gr = right ? c.createLinearGradient(e.x0, 0, e.x1, 0) : left ? c.createLinearGradient(e.x1, 0, e.x0, 0) : c.createLinearGradient(0, e.y1, 0, e.y0);
      gr.addColorStop(0, `rgba(${GLOW_RGB},0)`); gr.addColorStop(1, `rgba(${GLOW_RGB},${(0.16 + 0.1 * k).toFixed(3)})`);
      c.fillStyle = gr; c.fillRect(e.x0, e.y0, e.x1 - e.x0, e.y1 - e.y0);
    }
    // bone spikes: two to a tile, with a stepped (pixel) edge
    function drawThorns(c, s) {
      const jx = s.shk ? (Math.random() - 0.5) * s.shk * 2 : 0;
      for (const tl of s.tiles) {
        if (tl.smeared) continue;
        c.save(); c.translate(tl.x * T + s.ox + jx + T / 2, tl.y * T + s.oy + T / 2);
        c.rotate({ up: 0, down: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[tl.dir]);
        const H = Math.round(T * 0.5 * s.ext / 2) * 2;
        for (const cx of [-6.5, 6.5]) {
          for (let k = 0; k < H; k += 2) { const w = Math.max(2, Math.round((1 - k / Math.max(1, H)) * 6) * 2 - 2); c.fillStyle = k < 2 ? '#bdb3a0' : BONE; c.fillRect(Math.round(cx - w / 2), T / 2 - k - 2, w, 2); }
        }
        c.restore();
      }
    }
    function drawSaw(c, s) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.ang);
      c.fillStyle = BONE; c.beginPath();
      const n = 8;
      for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, rr = i % 2 ? s.r * 0.62 : s.r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill();
      c.fillStyle = MORTAR; c.beginPath(); c.arc(0, 0, s.r * 0.3, 0, TAU); c.fill();
      c.restore();
    }
    // a block that flies: brickwork, tumbling; its spikes ride on top
    function drawFlyer(c, f) {
      c.save(); c.translate(f.x, f.y); c.rotate(f.ang);
      for (const cl of f.cells) {
        brick(c, cl.dx - T / 2, cl.dy - T / 2, true, true, true, true, cl.tx, cl.ty);
        if (f.spiked) {
          c.save(); c.translate(cl.dx, cl.dy - T);
          for (const cx of [-6.5, 6.5]) for (let k = 0; k < 12; k += 2) { const w = Math.max(2, Math.round((1 - k / 12) * 6) * 2 - 2); c.fillStyle = BONE; c.fillRect(Math.round(cx - w / 2), T / 2 - k - 2, w, 2); }
          c.restore();
        }
      }
      c.restore();
    }
    // a plank / pillar on its hinge: brickwork along its length; once it moves its spikes line the leading edge
    function drawPlank(c, pk) {
      if (pk.state === 'gone') return;
      const jx = pk.shk ? (Math.random() - 0.5) * pk.shk * 2 : 0;
      c.save(); c.translate(pk.x + jx, pk.y); c.rotate(pk.ang);
      const h = pk.thick, L = pk.len;
      c.fillStyle = STONE; c.fillRect(0, -h / 2, L, h);
      c.fillStyle = MORTAR; for (let d = 12; d < L; d += 14) c.fillRect(d, -h / 2, 2, h);
      c.fillRect(0, -1, L, 2);
      c.fillStyle = STONE_HI; c.fillRect(0, -h / 2, L, 3);
      if (pk.ext > 0.01) {
        const side = Math.sign(pk.a1 - pk.a0) || 1, H = Math.round(T * 0.45 * pk.ext / 2) * 2;
        for (let d = 4; d < L - 3; d += 13) for (let k = 0; k < H; k += 2) {
          const w = Math.max(2, Math.round((1 - k / Math.max(1, H)) * 5) * 2 - 2);
          c.fillStyle = BONE; c.fillRect(Math.round(d + 4 - w / 2), side > 0 ? h / 2 + k : -h / 2 - k - 2, w, 2);
        }
      }
      c.restore();
    }
    // a bar of the stone game: a bright brick, one colour per row
    function drawBar(c, x, y) {
      if (R.crackedBars) { brick(c, x * T, y * T, true, true, true, true, x, y); c.fillStyle = MORTAR; c.fillRect(x * T + 6, y * T + 4, 2, 8); c.fillRect(x * T + 8, y * T + 11, 6, 2); c.fillRect(x * T + 14, y * T + 13, 2, 8); return; }
      const X = x * T, Y = y * T, col = BAR_COLS[y % 4];
      c.fillStyle = col; c.fillRect(X, Y + 2, T, T - 4);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(X, Y + 2, T, 3);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(X, Y + T - 5, T, 3); c.fillRect(X + T - 2, Y + 2, 2, T - 4);
    }
    // the boulder: a rough stone ball with cracks that turn as it rolls
    function drawBoulder(c, bd) {
      c.save(); c.translate(Math.round(bd.x), Math.round(bd.y));
      c.fillStyle = MORTAR; c.beginPath(); c.arc(0, 0, bd.r, 0, TAU); c.fill();
      c.fillStyle = STONE; c.beginPath(); c.arc(-2, -2, bd.r - 3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(-bd.r * 0.35, -bd.r * 0.4, bd.r * 0.32, 0, TAU); c.fill();
      c.rotate(bd.ang); c.fillStyle = MORTAR;
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; c.save(); c.rotate(a); c.fillRect(bd.r * 0.25, -1, bd.r * 0.55, 3); c.restore(); }
      c.beginPath(); c.arc(0, 0, bd.r * 0.16, 0, TAU); c.fill();
      c.restore();
    }
    // a dropping brick with spikes underneath
    function drawDrop(c, d) {
      brick(c, d.x - T / 2, d.y - T / 2, true, true, true, true, 3, 5);
      for (const cx of [-6.5, 6.5]) for (let k = 0; k < 10; k += 2) { const w = Math.max(2, Math.round((1 - k / 10) * 6) * 2 - 2); c.fillStyle = BONE; c.fillRect(Math.round(d.x + cx - w / 2), d.y + T / 2 + k, w, 2); }
    }
    function drawBall(c, bl) {
      c.fillStyle = '#ff8a3a'; c.beginPath(); c.arc(bl.x, bl.y, bl.r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(Math.round(bl.x - bl.r * 0.5), Math.round(bl.y - bl.r * 0.55), 3, 3);
    }
    // the golden seed on its little pedestal
    function drawIdol(c, id) {
      const x = Math.round(id.x), y = Math.round(id.y), bob = Math.round(Math.sin(id.t * 3) * 1.5);
      c.fillStyle = MORTAR; c.fillRect(x - 9, y - 6, 18, 6); c.fillStyle = STONE_HI; c.fillRect(x - 9, y - 6, 18, 2);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 + 0.2 * Math.sin(id.t * 4); c.drawImage(env.glowSprite('255,220,110'), x - 22, y - 40 + bob, 44, 44); c.restore();
      c.fillStyle = '#f2c23a'; c.beginPath(); c.ellipse(x, y - 15 + bob, 6, 8, 0, 0, TAU); c.fill();
      c.fillStyle = '#c8901e'; c.fillRect(x - 1, y - 24 + bob, 2, 4);
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(x - 3, y - 19 + bob, 2, 4);
    }
    // water: a cool tint over the flooded tiles (it covers you when you're under), a bright moving surface line
    function drawWater(c) {
      const surf = (x, y) => { c.fillStyle = 'rgba(255,255,255,0.45)'; const k = Math.sin(t * 3 + x * 0.9) * 1.5; c.fillRect(x * T, y + k, T, 2); };
      if (R.waterSet) {
        c.fillStyle = `rgba(${rgbOf(XTRA)},0.42)`;
        for (const key of R.waterSet) { const [x, y] = key.split(',').map(Number); c.fillRect(x * T, y * T, T, T); }
        for (const key of R.waterSet) { const [x, y] = key.split(',').map(Number); if (!R.waterSet.has(x + ',' + (y - 1))) surf(x, y * T); }
      }
      if (R.flood && R.flood.y < RH) {
        const fy = R.flood.y;
        c.fillStyle = `rgba(${rgbOf(XTRA)},0.42)`;
        for (let y = Math.floor(fy / T); y < ROWS; y++) for (let x = 0; x < COLS; x++) {
          const ch = R.g[y][x]; if (ch === '#' || ch === '=') continue;
          const top = Math.max(fy, y * T); c.fillRect(x * T, top, T, (y + 1) * T - top);
        }
        for (let x = 0; x < COLS; x++) { const ty = Math.floor(fy / T); if (ty >= 0 && ty < ROWS && R.g[ty][x] !== '#' && R.g[ty][x] !== '=') surf(x, fy); }
      }
    }
    // the frog statue: a squat stone frog; its mouth opens when it spits
    function drawShooter(c, sh) {
      c.save(); c.translate(Math.round(sh.x), Math.round(sh.y)); c.scale(sh.face, 1);
      c.fillStyle = MORTAR; c.fillRect(-12, -6, 24, 18);
      c.fillStyle = STONE; c.fillRect(-11, -8, 22, 16); c.fillStyle = STONE_HI; c.fillRect(-11, -8, 22, 3);
      c.fillStyle = STONE; c.fillRect(-10, -14, 7, 7); c.fillRect(3, -14, 7, 7);
      c.fillStyle = '#e0412f'; c.fillRect(-8, -12, 3, 3); c.fillRect(5, -12, 3, 3);
      c.fillStyle = '#1a1210'; c.fillRect(2, -1 - sh.mouth * 3, 10, 2 + sh.mouth * 6);
      c.restore();
    }
    function drawSpear(c, sp) {
      const q = spearBox(sp), tip = sp.dir < 0 ? q.y0 : q.y1;
      c.fillStyle = BONE; c.fillRect(Math.round(sp.x - 2), Math.round(q.y0), 4, Math.round(q.y1 - q.y0));
      c.beginPath(); c.moveTo(sp.x - 5, tip - sp.dir * 8); c.lineTo(sp.x, tip); c.lineTo(sp.x + 5, tip - sp.dir * 8); c.fill();
    }
    function drawShot(c, s2) {
      c.fillStyle = '#5a3b22'; c.fillRect(Math.round(s2.x - 4), Math.round(s2.y - 3), 8, 6);
      c.fillStyle = '#ffcf5a'; if (Math.floor(t * 12) % 2) c.fillRect(Math.round(s2.x - 1), Math.round(s2.y - 6), 2, 2);
    }
    function drawUrchin(c, u) {
      c.save(); c.translate(u.x, u.y); c.rotate(u.spin);
      c.fillStyle = '#2a1f3a'; c.beginPath(); c.arc(0, 0, u.r * 0.62, 0, TAU); c.fill();
      c.fillStyle = BONE; for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * TAU / 8); c.fillRect(-1, -u.r, 2, u.r * 0.45); c.restore(); }
      c.fillStyle = u.state === 'rest' ? '#6a5a8a' : '#e0412f'; c.fillRect(-2, -2, 4, 4);
      c.restore();
    }
    function drawFish(c, f2) {
      c.save(); c.translate(Math.round(f2.x), Math.round(f2.y)); c.scale(Math.sign(f2.vx) || 1, 1);
      const w = f2.w, h = f2.h;
      c.fillStyle = '#5d7c96'; c.fillRect(-w / 2, -h / 2, w, h);
      c.fillStyle = '#87a6bf'; c.fillRect(-w / 2, -h / 2, w, 4);
      c.fillStyle = '#3e566b'; c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2 - 10, -h / 2 - 2); c.lineTo(-w / 2 - 10, h / 2 + 2); c.fill();
      c.fillStyle = '#fff'; c.fillRect(w / 2 - 10, -h / 2 + 4, 5, 5); c.fillStyle = '#111'; c.fillRect(w / 2 - 8, -h / 2 + 5, 3, 3);
      c.fillStyle = BONE; for (let i = 0; i < 3; i++) c.fillRect(w / 2 - 4, -2 + i * 3, 4, 2);
      c.restore();
    }
    // an escalator, spare parts, springs, runes (the Liar's Path set, in temple colours)
    function drawEsc(c, e) {
      for (const st of e.steps) {
        if (st.gone) continue;
        c.save(); c.translate(st.x, st.y + st.h / 2); if (st.rot) c.rotate(st.rot);
        c.fillStyle = STONE; c.fillRect(-T / 2, -st.h / 2, T, st.h); c.fillStyle = STONE_HI; c.fillRect(-T / 2, -st.h / 2, T, 3);
        c.restore();
      }
    }
    function drawPart(c, pt) {
      c.save(); c.translate(pt.x, pt.y); c.rotate(pt.ang);
      c.fillStyle = BONE; c.beginPath(); c.arc(0, 0, pt.r, 0, TAU); c.fill();
      c.fillStyle = MORTAR; c.beginPath(); c.arc(0, 0, pt.r * 0.35, 0, TAU); c.fill();
      c.restore();
    }
    function drawSpring(c, sp) {
      const h = 8 - sp.sq * 5;
      c.fillStyle = '#c8553d'; c.fillRect(sp.x - 10, sp.y - 4, 20, 4);
      c.fillStyle = BONE; for (let i = 0; i < 3; i++) c.fillRect(sp.x - 6, sp.y - 6 - i * h / 3, 12, 2);
      c.fillStyle = '#c8553d'; c.fillRect(sp.x - 11, sp.y - 8 - h, 22, 4);
    }
    function drawRune(c, ru) {
      const d = ru.up ? -1 : 1, y = ru.y + (ru.up ? 2 : -2);
      c.fillStyle = GLOW; c.globalAlpha = 0.65 + 0.35 * Math.sin(t * 4);
      c.fillRect(ru.x - 8, y - 1, 16, 2); c.fillRect(ru.x - 2, y, 4, d * 8);
      c.globalAlpha = 1;
    }
    function drawDoor(c, d) {
      const x = Math.round(d.x + d.ox), y = Math.round(d.y + d.oy);
      c.save(); c.globalAlpha *= d.alpha; c.translate(x, y); if (d.hang) c.scale(1, -1);
      c.fillStyle = MORTAR; c.fillRect(-14, -40, 28, 40);
      c.fillStyle = d.fake ? '#2a1a12' : '#000'; c.fillRect(-10, -36, 20, 36);
      c.fillStyle = `rgba(${GLOW_RGB},0.35)`; c.fillRect(-10, -36, 20, 36);
      c.restore();
    }
    // the hero: a raccoon thief in 2 px pixels. F fur, D dark fur, K black (mask, nose, eyes' frame), W white,
    // R red scarf, L legs. Facing right; the ringed tail sticks out behind.
    const POSES = {
      stand: ['.D.........', 'DFD..K...K.', 'DFD.KFK.KFK', '.D..FFFFFFF', 'DF.KKWKKWKK', 'FD.WWFFFFWK', '.DF.WWWWW..', '..DFRRRRR..', '...FFWWFF..', '...FFWWFF..', '....L..L...'],
      step: ['.D.........', 'DFD..K...K.', 'DFD.KFK.KFK', '.D..FFFFFFF', 'DF.KKWKKWKK', 'FD.WWFFFFWK', '.DF.WWWWW..', '..DFRRRRR..', '...FFWWFF..', '...FFWWFF..', '...L....L..'],
      step2: ['.D.........', 'DFD..K...K.', 'DFD.KFK.KFK', '.D..FFFFFFF', 'DF.KKWKKWKK', 'FD.WWFFFFWK', '.DF.WWWWW..', '..DFRRRRR..', '...FFWWFF..', '...FFWWFF..', '.....LL....'],
      air: ['...........', 'D....K...K.', 'FD..KFK.KFK', 'DF..FFFFFFF', '.DFKKWKKWKK', '..DWWFFFFWK', '...FWWWWW..', '..FFRRRRRF.', '...FFWWFF..', '..L.FWWF.L.', '...........']
    };
    const PCOL = { F: '#a2a8b2', D: '#575d69', K: '#17191e', W: '#f4f1ea', R: '#d2463a', L: '#3b4049' };
    function drawThief(c, x, y, face) {
      const air = !P.ground, moving = Math.abs(P.vx) > 20;
      const ph = Math.floor(P.run * 1.2) % 4;
      const pose = POSES[air ? 'air' : moving ? (ph === 1 ? 'step' : ph === 3 ? 'step2' : 'stand') : 'stand'];
      const px = 2, w = pose[0].length, h = pose.length;
      c.save();
      c.translate(Math.round(x), Math.round(y)); if (R.gdir < 0) c.scale(1, -1);
      if (P.entering > 0) c.globalAlpha *= Math.max(0, 1 - P.entering * 2.2);
      c.scale(face, 1);
      for (let r = 0; r < h; r++) {
        const row = pose[r];
        for (let k = 0; k < w; k++) { const ch = row[k]; if (ch === '.') continue; c.fillStyle = PCOL[ch]; c.fillRect((k - 7) * px, (r - h) * px, px, px); }   // (the body sits on the hitbox, the tail hangs out behind)
      }
      c.restore();
    }
    // a little raccoon head for the lives row
    const HEAD = ['K...K', 'FFFFF', 'KWKWK', '.FFF.'];
    function headIcon(c, x, y, on) {
      for (let r = 0; r < HEAD.length; r++) for (let k = 0; k < 5; k++) {
        const ch = HEAD[r][k]; if (ch === '.') continue;
        c.fillStyle = on ? PCOL[ch] : (ch === 'K' ? '#2a2a2a' : '#4a4a4a'); c.fillRect(x + (k - 2.5) * 3, y + (r - 2) * 3, 3, 3);
      }
    }
    function drawHud(c, F) {
      const W = env.W, v = env.view, land = env.land;
      const y0 = land ? v.top + 18 : Math.max(v.top + 40, F.y - 46);
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(6, y0 - 11, LIVES * 22 + 10, 22);
      for (let i = 0; i < LIVES; i++) headIcon(c, 20 + i * 22, y0, i < lives);
      c.textBaseline = 'middle'; c.font = "bold 15px 'Courier New', monospace";
      const tl = Math.ceil(timeLeft), mm = Math.floor(tl / 60), ss = String(tl % 60).padStart(2, '0');
      const tag = (s, x, al, col) => { const w = c.measureText(s).width, lx = al === 'left' ? x : al === 'right' ? x - w : x - w / 2; c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(lx - 7, y0 - 11, w + 14, 22); c.textAlign = al; c.fillStyle = col; c.fillText(s, x, y0 + 1); };
      tag(`STAGE ${base + ri + 1}`, W - 66, 'right', GLOW);
      tag(`${mm}:${ss}`, W - 186, 'right', timeLeft < 20 && Math.sin(t * 8) > 0 ? '#ff6a5a' : BONE);
      if (introT < 2.0 && !(P.dead && lives <= 0)) {
        c.globalAlpha = Math.min(1, introT * 3) * Math.min(1, (2.0 - introT) * 2.5);
        c.font = `bold ${land ? 17 : 14}px 'Courier New', monospace`; c.textAlign = 'center';
        const s1 = rooms[ri].name.toUpperCase(), w1 = c.measureText(s1).width;
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(W / 2 - w1 / 2 - 12, y0 + 16, w1 + 24, 26);
        c.fillStyle = BONE; c.fillText(s1, W / 2, y0 + 29);
        c.globalAlpha = 1;
      }
      if (tauntT > 0 && !(P.dead && lives <= 0)) {
        c.globalAlpha = Math.min(1, tauntT * 2);
        c.font = `bold ${land ? 15 : 13}px 'Courier New', monospace`; c.textAlign = 'center';
        const ty = land ? F.y + F.vh * F.s - 26 : F.y + F.vh * F.s + 30, tw = c.measureText(taunt).width;
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(W / 2 - tw / 2 - 12, ty - 13, tw + 24, 26);
        c.fillStyle = BONE; c.fillText(taunt, W / 2, ty);
        c.globalAlpha = 1;
      }
      if (P.dead && lives <= 0) {                                // GAME OVER
        const k = Math.min(1, deadT * 3), cy = F.y + F.vh * F.s / 2;
        c.globalAlpha = k; c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(0, cy - 60, W, 120);
        c.textAlign = 'center'; c.font = `bold ${land ? 40 : 30}px 'Courier New', monospace`; c.fillStyle = '#e0412f'; c.fillText('GAME OVER', W / 2, cy - 12);
        c.font = `bold ${land ? 15 : 13}px 'Courier New', monospace`; c.fillStyle = BONE; c.fillText(`BEST STAGE ${base + best + 1}  ·  back to stage ${base + firstRoom + 1}`, W / 2, cy + 26);
        c.globalAlpha = 1;
      }
      c.restore();
    }

    // (probe for the design tools: boulders, balls)
    window.__templeProbe = () => (R.boulders.map(b => `B(${(b.x / T).toFixed(2)},${(b.y / T).toFixed(2)} vx${(b.vx / T).toFixed(1)}${b.ground ? ' g' : ''})`).join(' ') + ' ' + R.balls.map(b => `o(${(b.x / T).toFixed(1)},${(b.y / T).toFixed(1)})`).join(' ')
      + (R.bodies.w ? ` w(${(R.bodies.w.ox / T).toFixed(2)})` : '') + ' ' + R.urchins.filter(u => u.state === 'awake').map(u => `u(${(u.x / T).toFixed(1)},${(u.y / T).toFixed(1)})`).join(' ') + (R.bodies.g && R.bodies.g.grate ? (R.bodies.g.hidden ? ' GRATE-OPEN' : ' grate-shut') : '')).trim();
    window.__templeGrid = () => { let o = ''; for (let y = 6; y <= 9; y++) { let row = ''; for (let x = 2; x <= 29; x++) row += R.barSet && R.barSet.has(x + ',' + y) ? '$' : '.'; o += '      ' + row + String.fromCharCode(10); } return o; };
    loadRoom(ri, false);
    return {
      update, render,
      destroy() { },
      debug: () => ({ level: LV, room: ri + 1, rooms: rooms.length, deaths, roomDeaths, lives, stage: base + ri + 1, time: +timeLeft.toFixed(1), done,
        x: +(P.x / T).toFixed(2), y: +(P.y / T).toFixed(2), ground: P.ground, dead: P.dead, flipped: R.gdir < 0, bot: bot.i, entering: P.entering > 0, cause: lastCause })
    };
  }
})();
