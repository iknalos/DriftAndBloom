// ============================================================================
// Drift & Bloom — LIAR'S PATH (Adventure round 3). A troll platformer in the spirit of Level Devil.
// A shadow child walks a foggy forest to a lit doorway, one screen per room, and the path lies:
// floors drop away, thorns spring up, stalactites fall, ceilings slam, saws roll in, the door runs
// off, gravity turns over, the lights go out. Every trap is scripted and always the same, so each
// death teaches the room; respawn is instant, only the round clock is at stake. Stage n = harder rooms.
//
// A room = an ASCII map (32 x 15 tiles of 26 px) + setup(R), a script of triggers (the R api below).
//   .  air          #  ground        S  start            D  door        Q  a door that lies (it bites)
//   ^ v < >  thorns (always out)    A-Z  hidden thorns (a group; R.pop / R.fall / R.show ...)
//   a-z  ground that moves (a group: R.drop / R.$('a').move ...; not v)   ~  fake ground (you fall through)
//   +  invisible ground              %  ground that crumbles when R.chase() runs   *  spring
//   @  a rune that turns gravity over                                1-9  saw blades
// bot: the room's solution as autopilot steps (tests: window.__liarBot = true), so every room is
// proven beatable. Test a stage: game.html?world=liar&lv=6 (&room=2 to start on a room).
// ============================================================================
(function () {
  'use strict';
  const T = 26, COLS = 32, ROWS = 15, RW = COLS * T, RH = ROWS * T, TAU = Math.PI * 2;
  // feel: run 6.6 tiles/s; a held jump rises 2.6 tiles and carries 3.3; release early = a hop
  const RUN = 172, ACC = 2300, DEC = 3000, AIR_ACC = 1700, AIR_DEC = 260;
  const G_UP = 1750, G_DN = 2700, JUMP_V = 485, CUT = 0.42, MAXF = 780, COYOTE = 0.08, BUFFER = 0.12;
  const SPRING_V = 640, SPRING_HI = 800;
  const PW = 12, PH = 22;
  const INK = '#0b0c0a';
  const E = '.'.repeat(32), G = '#'.repeat(32);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const EASE = { lin: k => k, io: k => k * k * (3 - 2 * k), in: k => k * k, out: k => 1 - (1 - k) * (1 - k), slam: k => k * k * k };
  function hr(x, y, k) {                                  // stable per-tile randomness (art)
    let h = (x * 374761393 + y * 668265263 + (k || 0) * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ── the rooms, stage by stage ───────────────────────────────────────────
  const fill = (n, s) => Array(n).fill(s);
  const STAGES = [null,
    // ── Stage 1: the lie begins
    [
      { name: 'Trust the path', t: 50,
        map: [...fill(10, E),
          '.S......................B...D...',
          ...fill(4, '##################aaa###########')],
        setup(R) { R.sign(3, 10, 'SAFE  →'); R.when(R.at(15.6), () => R.drop('a')); R.when(R.at(21.2), () => R.pop('B')); },
        bot: [['jumpAt', 17.8], ['land'], ['jumpAt', 22.6], ['land'], ['go', 28.5]] },
      { name: 'Mind your head', t: 55,
        map: [G, G,
          '#######AAA#######BBBBBB#########',
          ...fill(7, E),
          '.S............................D.',
          ...fill(4, G)],
        setup(R) {
          R.show('A'); R.show('B');
          R.when(R.at(6.0), () => R.fall('A'));
          R.when(R.at(17.3), () => R.fall('B', 0.3));
          R.when(R.at(27.5), () => { R.$('D').hop(3, 10, 0.9); R.say('The door is shy.'); });
        },
        bot: [['go', 6.1], ['wait', 1.0], ['go', 17.5], ['go', 16.0], ['wait', 1.4], ['run', 28], ['wait', 1.1], ['go', 3.5], ['wait', 1]] },
      { name: "Don't believe your eyes", t: 55,
        map: [...fill(10, E),
          '.S..............CC.........D....',
          '######aa#####bbb######~~~#######',
          ...fill(3, '######aa#####bbb######...#######')],
        setup(R) {
          R.when(p => p.ground && p.x >= 6 && p.x < 8, () => R.drop('a', 0.05));
          R.when(p => p.air && p.x >= 12.5 && p.x < 16, () => R.pop('C'));
        },
        bot: [['jumpAt', 5.4], ['land'], ['run', 21.8], ['jump'], ['land'], ['go', 27.5]] }
    ],
    // ── Stage 2: it learns
    [
      { name: 'Heavy ceiling', t: 55,
        map: [G, G, G,
          ...fill(4, '###########aaaa#####bbbb########'),
          E, E, E,
          '.S............................D.',
          ...fill(4, G)],
        setup(R) {
          R.when(R.at(9.3), () => R.$('a').move(0, 4, 0.11, 'in', 'slam').call(() => R.slamFx('a')).wait(0.45, 'hold').move(0, -4, 0.9, 'io', 'rise').wait(0.5, 'top').loop());
          R.when(R.at(17.6), () => R.$('b').move(0, 4, 0.1, 'in', 'slam').call(() => R.slamFx('b')).wait(0.25, 'hold').move(0, -4, 0.45, 'io', 'rise')
            .move(0, 4, 0.1, 'in', 'slam2').call(() => R.slamFx('b')).wait(0.25, 'hold2').move(0, -4, 0.9, 'io', 'rise2').wait(0.9, 'top').loop());
        },
        bot: [['go', 9.4], ['until', R => R.$('a').phase === 'rise' && R.$('a').phaseK > 0.22], ['go', 16.6], ['go', 17.8],
          ['until', R => R.$('b').phase === 'rise2' && R.$('b').phaseK > 0.22], ['go', 30.5]] },
      { name: 'The bridge you cannot see', t: 60,
        map: [...fill(10, E),
          '.S...................D..........',
          '#########++.++#########...######',
          ...fill(3, '#########.....#########...######')],
        setup(R) { R.leaves(); R.sign(6, 10, 'TURN BACK'); R.when(R.at(18.0), () => R.$('D').hop(29, 10, 0.7)); },
        bot: [['jumpAt', 10.6], ['land'], ['run', 18.2], ['jumpAt', 22.8], ['land'], ['run', 29.5], ['wait', 0.6]] },
      { name: 'Déjà vu', t: 65,
        map: [...fill(10, E),
          '.S......................B.FF..D.',
          ...fill(4, '##################aaaccc#####ddd')],
        setup(R) {
          R.sign(3, 10, 'SAFE  →');
          R.when(p => p.air && p.x >= 16.5 && p.x <= 21.2, () => R.drop('c'));
          R.when(R.at(21.2), () => R.$('B').pop().wait(1.0).hide(0.15));
          R.when(p => p.air && p.x >= 22.8 && p.x <= 26.5, () => R.pop('F'));
          R.when(R.at(27.6), () => { R.drop('d', 0.2); R.$('D').ride('d'); R.after(1.3, () => { R.$('D').appear(1, 10); R.say('It went down with the floor.'); }); });
        },
        bot: [['run', 20.9], ['go', 22.5], ['wait', 1.3], ['go', 27.7], ['wait', 1.6], ['go', 1.5], ['wait', 1]] }
    ],
    // ── Stage 3: saws & shortcuts
    [
      { name: 'Roll', t: 50,
        map: [...fill(10, E),
          '.S...................^.......D..',
          ...fill(4, '##############...###############')],
        setup(R) {
          const s1 = R.saw({ x: -1, y: 10.15 }), s2 = R.saw({ x: 33.5, y: 10.15 });
          R.when(R.at(4.5), () => s1.go([[13.6, 10.15], [13.6, 18]], 5.2));
          R.when(R.at(21.0), () => s2.go([[-3, 10.15]], 4.6));
        },
        bot: [['jumpAt', 13.8], ['land'], ['jumpAt', 19.9], ['land'], ['until', (R, P) => R.saws[1].x / T - P.x < 3.0], ['jump'], ['land'], ['go', 29.5]] },
      { name: 'Gatekeeper', t: 55,
        map: [...fill(4, '.............#######............'),
          '...............AAA..............',
          ...fill(5, E),
          '.S......................B.....D.',
          ...fill(3, '########################g#######'),
          G],
        setup(R) {
          R.show('A'); R.show('B'); R.attach('B', 'g');
          R.when(R.at(14.3), () => R.fall('A', 0.25));
          R.every(R.at(21.0), () => R.$('g').stop().goTo(0, -2.5, 1.39));
          R.every(R.atL(18.5), () => R.$('g').stop().goTo(0, 0, 5));
        },
        bot: [['go', 14.4], ['go', 13.4], ['wait', 1.0], ['go', 17.0], ['jumpAt', 22.7], ['land'], ['go', 30.5]] },
      { name: 'Leap of faith', t: 60,
        map: [...fill(9, E),
          '.............++++...............',
          '.S..................++.......D..',
          '########+++++....+++....##~~####',
          ...fill(3, '########................##..####')],
        setup(R) { R.leaves(); R.sign(6, 10, 'JUMP!'); },
        bot: [['run', 12.2], ['jump', 0.35], ['run', 16.9], ['run', 19.3], ['jump', 0.2], ['land'], ['jumpAt', 21.4], ['land'], ['jumpAt', 25.3], ['land'], ['go', 29.5]] },
      { name: 'Run', t: 45,
        map: [...fill(9, E),
          '..........%.....................',
          '.S........%.................B.D.',
          ...fill(4, '%%%%%%%%%%%%%%...%%%%%%%%%%#####')],
        setup(R) { R.when(R.at(2.2), () => { R.chase(5.6, 0); R.say('Run.'); }); R.when(R.at(26.6), () => R.pop('B')); },
        bot: [['jumpAt', 8.6], ['land'], ['jumpAt', 13.7], ['land'], ['jumpAt', 26.9], ['land'], ['go', 30.5]] }
    ],
    // ── Stage 4: door problems
    [
      { name: 'Two doors', t: 55,
        map: [...fill(6, E),
          '................Q...............',
          '..............=====.............',
          E,
          '..........===...................',
          '.S........................C..D..',
          ...fill(4, '####################aaa#########')],
        setup(R) {
          R.sign(7, 10, '↑ EXIT');
          R.when(p => p.x >= 17.8 && p.y > 10.5, () => R.drop('a'));
          R.when(R.at(24.6), () => R.pop('C'));
        },
        bot: [['jumpAt', 19.8], ['land'], ['jumpAt', 25.0], ['land'], ['go', 29.5]] },
      { name: 'Going up', t: 55,
        map: [G,
          '##################vvvv..........',
          E, E, E,
          '.......................BB...D...',
          ...fill(2, '.......................#########'),
          E, E,
          '.S..............................',
          ...fill(4, '##################aaaa##########')],
        setup(R) {
          R.when(R.stand('a'), () => R.$('a').wait(0.25).move(0, -4, 2.2, 'lin', 'slow').move(0, -4.6, 1.4, 'in', 'fast'));
          R.when(p => p.air && p.x >= 21.5 && p.x <= 24.6 && p.y < 8, () => R.pop('B'));
        },
        bot: [['go', 19.8], ['until', R => R.$('a').oy <= -4.9 * T], ['jumpAt', 21.9], ['land'], ['go', 28.5]] },
      { name: 'Same room. New lies.', t: 65,
        map: [...fill(10, E),
          '.S......................B.FF..Q.',
          ...fill(4, '##################aacccc#####ddd')],
        setup(R) {
          R.sign(3, 10, 'SAFE  →');
          R.when(p => p.ground && p.x >= 18 && p.x < 20, () => R.drop('a', 0.05));
          R.$('B').pop().wait(0.9, 'up').hide(0.1).wait(0.9, 'down').loop();
          R.when(p => p.air && p.x >= 22.8 && p.x <= 26.5, () => R.pop('F'));
          R.when(R.at(26.8), () => { R.$('Q').charge(-8.5); R.after(1.6, () => R.spawnDoor(30, 10)); });
        },
        bot: [['jumpAt', 17.4], ['land'], ['go', 22.6], ['until', R => R.$('B').phase === 'down' && R.$('B').phaseK < 0.25], ['run', 26.85], ['jump'], ['land'], ['go', 30.5], ['wait', 2.2]] },
      { name: 'Moving lies', t: 65,
        map: [...fill(10, E),
          '.S...........qq...rr.......C.D..',
          '#####pp...............~#########',
          ...fill(3, '#####..................#########')],
        setup(R) {
          R.$('p').wait(1.2, 'start').move(5, 0, 1.7, 'io', 'right').wait(0.5, 'rwait').move(-5, 0, 1.7, 'io', 'left').wait(0.5, 'lwait').loop();
          R.$('q').move(0, -2, 1.1, 'io', 'up').wait(0.3).move(0, 2, 1.1, 'io', 'down').wait(0.9, 'low').loop();
          R.when(R.stand('r'), () => R.drop('r', 0.35));
          R.when(R.at(25.6), () => R.pop('C'));
        },
        bot: [['go', 5.9], ['until', R => R.$('p').phase === 'rwait' && ((R.$('q').phase === 'low' && R.$('q').phaseK < 0.5) || (R.$('q').phase === 'down' && R.$('q').phaseK > 0.6))],
          ['dir', 1], ['jump'], ['land'], ['go', 14.3], ['until', R => R.$('q').phase === 'low'], ['jumpAt', 14.9], ['land'], ['jumpAt', 19.9], ['land'], ['jumpAt', 26.0], ['land'], ['go', 29.5]] }
    ],
    // ── Stage 5: upside down
    [
      { name: 'Head over heels', t: 55,
        map: [G,
          '##########aaa###################',
          '.................BB.....D.......',
          ...fill(7, E),
          '.S....@.........................',
          ...fill(4, G)],
        setup(R) {
          R.sign(4, 10, '↑ ?');
          R.when(p => p.flipped && p.x >= 8.6, () => R.drop('a', 0, -1));
          R.when(p => p.flipped && p.x >= 15.3, () => R.pop('B'));
        },
        bot: [['go', 6.5], ['until', (R, P) => P.flipped && P.ground], ['jumpAt', 9.8], ['land'], ['jumpAt', 16.3], ['land'], ['go', 24.5]] },
      { name: 'Flip flop', t: 55,
        map: [G, G,
          '..............vvv.......vv......',
          ...fill(7, E),
          '.S......^^^.......^^^^.......D..',
          ...fill(4, G)],
        setup(R) { R.sign(3, 10, 'JUMP?'); R.when(R.at(4), () => { R.flipJumps(true); R.say('Jumping works differently here.'); }); },
        bot: [['run', 5.6], ['jump', 0.05], ['run', 12.6], ['jump', 0.05], ['run', 16.6], ['jump', 0.05], ['run', 22.6], ['jump', 0.05], ['go', 29.5]] },
      { name: 'The sky is the floor', t: 60,
        map: ['#####bbb########...#############',
          '#####bbb########~~~#############',
          '.S.........CC..........@...@....',
          ...fill(7, E),
          '.......................^^^^.D...',
          ...fill(4, G)],
        setup(R) { R.when(R.at(3.6), () => R.drop('b', 0, -1)); R.when(R.at(9.6), () => R.pop('C')); },
        bot: [['jumpAt', 4.8], ['land'], ['jumpAt', 10.2], ['land'], ['jumpAt', 15.8], ['land'], ['jumpAt', 22.6, 0.12], ['land'], ['go', 27.5], ['until', (R, P) => !P.flipped && P.ground], ['go', 28.5], ['wait', 1]] }
    ],
    // ── Stage 6: no help
    [
      { name: 'Wrong way', t: 60,
        map: [...fill(10, E),
          '.S................^..^^.......D.',
          ...fill(4, '############...##########...####')],
        setup(R) {
          R.when(R.at(6), () => R.mirror(true));
          R.when(R.at(13.4), () => R.mirror(false));
          R.when(R.at(23.5), () => R.mirror(true));
        },
        bot: [['jumpAt', 11.8], ['land'], ['jumpAt', 17.0], ['land'], ['jump'], ['land'], ['jumpAt', 24.8], ['land'], ['go', 30.5]] },
      { name: 'Lights out', t: 60,
        map: [...fill(10, E),
          '.S..........^........^^......D..',
          ...fill(4, '#######...#####aa#######...#####')],
        setup(R) {
          R.when(R.at(4.5), () => { R.dark(true); R.say('Remember it.'); });
          R.when(R.at(13.4), () => R.drop('a', 0.35));
        },
        bot: [['jumpAt', 6.8], ['land'], ['jumpAt', 11.0], ['land'], ['jumpAt', 14.4], ['land'], ['jumpAt', 20.2], ['land'], ['jumpAt', 23.7], ['land'], ['go', 29.5]] },
      { name: 'Something follows', t: 60,
        map: [...fill(3, '............#######.............'),
          ...fill(4, '............##aaa##.............'),
          E,
          E,
          '.......=====....................',
          '.S.......................C....D.',
          ...fill(4, '####################...#########')],
        setup(R) {
          R.when(R.at(3), () => { R.echo(1.4); R.say('Don’t stop.'); });
          R.$('a').wait(1.2).move(0, 4, 0.12, 'in', 'slam').call(() => R.slamFx('a')).wait(0.6, 'hold').move(0, -4, 0.9, 'io', 'rise').wait(0.9, 'top').loop();
          R.when(R.at(23.6), () => R.pop('C'));
        },
        bot: [['go', 13.0], ['until', R => R.$('a').phase === 'rise' && R.$('a').phaseK > 0.22], ['jumpAt', 19.8], ['land'], ['jumpAt', 24.3], ['land'], ['go', 30.5]] },
      { name: 'Headwind', t: 55,
        map: [...fill(10, E),
          '.S......................^^....D.',
          ...fill(4, '########..###..####..###########')],
        setup(R) {
          R.when(R.at(3), () => R.wind(-50));
          R.when(R.at(17.2), () => R.wind(115));
          R.when(R.at(26), () => R.wind(0));
        },
        bot: [['jumpAt', 7.8], ['land'], ['jumpAt', 12.8], ['land'], ['jumpAt', 19.0, 0.06], ['land'], ['jumpAt', 22.4], ['land'], ['go', 30.5]] }
    ],
    // ── Stage 7: it plays dirty
    [
      { name: 'Springs', t: 60,
        map: [...fill(3, '##############..................'),
          '....vvvvvvvvv...................',
          E,
          ...fill(3, '....................##..........'),
          ...fill(2, '.........##.........##..........'),
          '.S....*..##...C..*..##.EEE....D.',
          ...fill(4, G)],
        setup(R) {
          R.sign(3, 10, 'HOLD JUMP'); R.sign(15, 10, 'HOLD JUMP');
          R.when(R.at(12.5), () => R.pop('C'));
          R.when(p => p.air && p.x >= 21.5 && p.x <= 23.6 && p.y > 5.2, () => R.pop('E'));
        },
        bot: [['run', 6.6], ['land'], ['run', 11.6], ['land'], ['jumpAt', 13.0], ['land'], ['hold', 1.2], ['run', 17.6], ['land'], ['jumpAt', 21.7], ['land'], ['go', 30.5]] },
      { name: 'Patrol', t: 65,
        map: [...fill(10, E),
          '.S..........................D...',
          ...fill(4, '##################aaa###########')],
        setup(R) {
          R.saw({ x: 7, y: 10.15 }).go([[12, 10.15], [7, 10.15]], 3.6, true);
          R.saw({ x: 16.5, y: 10.15 }).go([[13.5, 10.15], [16.5, 10.15]], 3.0, true);
          R.when(R.at(16.6), () => R.drop('a'));
          R.when(R.at(25.6), () => { R.$('D').hop(2, 10, 1.1); R.say('Forgot something?'); });
        },
        bot: [['sawjump', 0], ['land'], ['sawjump', 1], ['land'], ['jumpAt', 17.8], ['land'], ['go', 25.8], ['wait', 1.2], ['jumpAt', 21.2], ['land'], ['sawjump', 1], ['land'], ['sawjump', 0], ['land'], ['go', 2.5]] },
      { name: 'Keep running', t: 50,
        map: [G, G,
          '#####AAA#####BBBB######CCC######',
          ...fill(7, E),
          '.S........^...................D.',
          ...fill(4, '%%%%%%%%%%%%%%%%%%..%%%%%%%%####')],
        setup(R) {
          R.show('A'); R.show('B'); R.show('C');
          R.when(R.at(2.2), () => { R.chase(5.9, 0); R.say('Don’t stop.'); });
          R.when(R.at(4.6), () => R.fall('A', 0.3));
          R.when(R.at(12.4), () => R.fall('B', 0.45));
          R.when(R.at(22.4), () => R.fall('C', 0.3));
        },
        bot: [['jumpAt', 9.2], ['land'], ['jumpAt', 17.6], ['land'], ['go', 30.5]] },
      { name: 'Head first', t: 60,
        map: [...fill(2, '#########ccc####################'),
          '.........................@...D..',
          ...fill(7, E),
          '.S..@.............^^^^^^^^^^^^..',
          ...fill(4, '#############aa#bb##############')],
        setup(R) {
          R.when(p => p.flipped && p.x >= 7.6, () => R.drop('c', 0, -1));
          const up = id => R.$(id).move(0, -8.5, 0.22, 'in', 'up').call(() => R.slamFx(id)).wait(0.4, 'hold').move(0, 8.5, 0.9, 'io', 'down').wait(0.7, 'low').loop();
          R.when(p => p.flipped && p.x >= 11.4, () => { up('a'); R.$('b').wait(0.3, 'w0').call(() => up('b')); });
        },
        bot: [['go', 4.5], ['until', (R, P) => P.flipped && P.ground], ['jumpAt', 8.8], ['land'], ['go', 12.4], ['until', R => R.$('a').phase === 'down' && R.$('a').phaseK < 0.25],
          ['run', 24.3], ['jumpAt', 24.4, 0.15], ['land'], ['go', 29.5]] }
    ],
    // ── Stage 8: nothing works
    [
      { name: 'Mirror, mirror', t: 60,
        map: [...fill(10, E),
          '.D.........^........B.........S.',
          ...fill(4, '####...#######aa################')],
        setup(R) {
          R.mirror(true, true);
          R.when(R.atL(22.5), () => R.pop('B'));
          R.when(R.atL(17.0), () => R.drop('a'));
          R.when(p => p.air && p.x <= 15.2, () => { R.mirror(false); R.say('...or not.'); });
          R.when(R.atL(9.0), () => R.mirror(true));
        },
        bot: [['jumpAt', 22.0], ['land'], ['jumpAt', 16.6], ['land'], ['jumpAt', 13.0], ['land'], ['jumpAt', 7.2], ['land'], ['go', 1.5]] },
      { name: 'Storm', t: 60,
        map: [...fill(10, E),
          '.S...........^.........B......D.',
          ...fill(4, '#######...#########...####aa####')],
        setup(R) {
          R.when(R.at(3), () => { R.dark(true); R.say('Listen.'); });
          R.when(R.at(21.4), () => R.pop('B'));
          R.when(R.at(24.6), () => R.drop('a'));
        },
        bot: [['jumpAt', 6.8], ['land'], ['jumpAt', 12.0], ['land'], ['jumpAt', 19.0], ['land'], ['jumpAt', 22.4], ['land'], ['jumpAt', 25.6], ['land'], ['go', 30.5]] },
      { name: 'Shadow and stone', t: 75,
        map: [...fill(3, '........#####...#####...........'),
          ...fill(4, '........#aaa#...#bbb#...........'),
          E, E, E,
          '.S...........................D..',
          ...fill(4, G)],
        setup(R) {
          R.when(R.at(2.5), () => { R.echo(1.2); R.say('Something follows. Never stop.'); });
          const cyc = id => R.$(id).move(0, 4, 0.12, 'in', 'slam').call(() => R.slamFx(id)).wait(0.5, 'hold').move(0, -4, 0.8, 'io', 'rise').wait(1.0, 'top').loop();
          R.$('a').wait(0.5, 'w0').call(() => cyc('a'));
          R.$('b').wait(1.65, 'w0').call(() => cyc('b'));
          R.when(R.at(27.2), () => { R.$('D').hop(4, 10, 1.0); R.say('Turn around.'); });
        },
        bot: [['go', 2.2], ['until', R => R.$('a').phase === 'slam' || R.$('a').phase === 'hold'], ['go', 27.4], ['dir', -1], ['shadowjump', 0, 0.45], ['land'], ['go', 21.0],
          ['until', R => (R.$('b').phase === 'rise' && R.$('b').phaseK > 0.25) || (R.$('b').phase === 'top' && R.$('b').phaseK < 0.4)], ['go', 14.0],
          ['until', R => (R.$('a').phase === 'rise' && R.$('a').phaseK > 0.25) || (R.$('a').phase === 'top' && R.$('a').phaseK < 0.4)], ['go', 4.5]] },
      { name: 'The door is the liar', t: 75,
        map: [G, G,
          '........CC....................@.',
          ...fill(7, E),
          '.S...@......................D...',
          ...fill(4, '##############...###############')],
        setup(R) {
          let hops = 0;
          R.every(p => !p.flipped && hops < 3 && R.doorX('D') !== null && R.$('D').phase !== 'hop' && Math.abs(p.x - R.doorX('D')) < 3.2, () => {
            hops++;
            if (hops === 1) { R.$('D').hop(20, 10, 0.9); R.say('Nope.'); }
            else if (hops === 2) { R.$('D').hop(9, 10, 0.9); R.say('Too slow.'); }
            else { R.$('D').hop(15, 12, 0.8).call(() => R.$('D').fallAway()); R.after(1.6, () => { R.spawnDoor(25, 2, { hang: true }); R.say('Look up.'); }); }
          });
          R.when(p => p.flipped && p.x >= 6.4, () => R.pop('C'));
        },
        bot: [['jumpAt', 4.4, 0.15], ['land'], ['jumpAt', 13.8], ['land'], ['run', 25.6], ['go', 23.0], ['wait', 1.0], ['jumpAt', 17.2], ['land'], ['go', 12.3], ['wait', 1.9], ['go', 5.6], ['until', (R, P) => P.flipped && P.ground],
          ['jumpAt', 7.4], ['land'], ['go', 25.5]] }
    ],
    // ── Stage 9: precision
    [
      { name: 'Rolling thunder', t: 70,
        map: [G, G, G,
          ...fill(4, '########aa#bb#cc#dd#############'),
          E, E, E,
          '.S.....^..^..^..^..^......D.....',
          ...fill(4, G)],
        setup(R) {
          const cyc = id => R.$(id).move(0, 4, 0.1, 'in', 'slam').call(() => R.slamFx(id)).wait(0.35, 'hold').move(0, -4, 0.6, 'io', 'rise').wait(1.15, 'top').loop();
          [['a', 0.8], ['b', 1.35], ['c', 1.9], ['d', 2.45]].forEach(([id, w]) => R.$(id).wait(w, 'w0').call(() => cyc(id)));
        },
        bot: [['go', 6.3], ['until', R => R.$('a').phase === 'top' && R.$('a').phaseK < 0.25], ['dir', 1], ['jump', 0.2], ['land'], ['go', 9.3],
          ['until', R => R.$('b').phase === 'top' && R.$('b').phaseK < 0.3], ['dir', 1], ['jump', 0.18], ['land'], ['go', 12.3],
          ['until', R => R.$('c').phase === 'top' && R.$('c').phaseK < 0.3], ['dir', 1], ['jump', 0.18], ['land'], ['go', 15.3],
          ['until', R => R.$('d').phase === 'top' && R.$('d').phaseK < 0.3], ['dir', 1], ['jump', 0.18], ['land'], ['go', 18.3],
          ['dir', 1], ['jump', 0.3], ['land'], ['go', 26.5]] },
      { name: 'Flip maze', t: 65,
        map: ['#########aaa#####...############',
          '#########aaa#####~~~############',
          '..............BB..........@.@...',
          E, E, E,
          ...fill(4, '......................##........'),
          '.S..@.................##^^^^.D..',
          ...fill(4, G)],
        setup(R) {
          R.when(p => p.flipped && p.x >= 7.6, () => R.drop('a', 0, -1));
          R.when(p => p.flipped && p.x >= 12.4, () => R.pop('B'));
        },
        bot: [['go', 4.5], ['until', (R, P) => P.flipped && P.ground], ['jumpAt', 8.8], ['land'], ['jumpAt', 13.2], ['land'], ['jumpAt', 16.6], ['land'], ['jumpAt', 25.0, 0.15], ['land'],
          ['go', 28.4], ['until', (R, P) => !P.flipped && P.ground], ['go', 29.5]] },
      { name: 'Gale', t: 60,
        map: [...fill(10, E),
          '.S........................^...D.',
          ...fill(4, '#######...####..####...#########')],
        setup(R) {
          const gust = () => { R.wind(-70); R.after(2.0, () => { R.wind(90); R.after(1.4, gust); }); };
          R.when(R.at(2.0), gust);
        },
        bot: [['go', 6.0], ['until', R => R.windNow > 0 && R.windAge < 0.35], ['jumpAt', 6.9], ['land'], ['go', 13.0], ['until', R => R.windNow > 0 && R.windAge < 0.5], ['jumpAt', 13.6], ['land'],
          ['go', 19.0], ['until', R => R.windNow > 0 && R.windAge < 0.35], ['jumpAt', 19.8], ['land'], ['go', 24.6], ['until', R => R.windNow > 0 && R.windAge < 0.6], ['jumpAt', 25.0], ['land'], ['go', 30.5]] },
      { name: 'Nothing is real', t: 60,
        map: [...fill(7, E),
          ...fill(2, '......................######....'),
          E,
          '.S..........Q..B......KKKKKK..D.',
          '#####~~~###########...##########',
          ...fill(3, '#####...###########...##########')],
        setup(R) {
          R.show('K'); R.harmless('K');
          R.sign(3, 10, 'EXIT  →'); R.sign(17, 10, 'IT’S FINE');
          R.when(R.at(13.8), () => R.pop('B'));
        },
        bot: [['jumpAt', 4.6], ['land'], ['jumpAt', 10.8], ['land'], ['jumpAt', 14.1], ['land'], ['jumpAt', 18.6], ['land'], ['go', 30.5]] }
    ],
    // ── Stage 10: the devil's mile
    [
      { name: 'Everything at once', t: 50,
        map: [G, G,
          '###############AAA#####CCC######',
          ...fill(7, E),
          '.S..........^.......B.........D.',
          ...fill(4, '%%%%%%%..%%%%%%%%%%%%%%%%%%%####')],
        setup(R) {
          R.show('A'); R.show('C');
          R.when(R.at(2.0), () => { R.chase(6.0, 0); R.say('Everything at once.'); });
          R.when(R.at(14.4), () => R.fall('A', 0.35));
          R.when(R.at(19.4), () => R.pop('B'));
          R.when(R.at(22.4), () => R.fall('C', 0.3));
        },
        bot: [['jumpAt', 6.6], ['land'], ['jumpAt', 11.3], ['land'], ['jumpAt', 19.7], ['land'], ['go', 30.5]] },
      { name: 'Upside down and backwards', t: 65,
        map: ['######aaa#######...#############',
          '######aaa#######~~~#############',
          '.S.........CC................D..',
          ...fill(8, E),
          ...fill(4, '######################bb########')],
        setup(R) {
          R.mirror(true, true);
          R.when(R.at(4.4), () => R.drop('a', 0, -1));
          R.when(R.at(9.6), () => R.pop('C'));
          R.when(R.at(19.0), () => R.$('b').move(0, -8.6, 0.22, 'in', 'up').call(() => R.slamFx('b')).wait(0.4, 'hold').move(0, 8.6, 0.9, 'io', 'down').wait(0.8, 'low').loop());
        },
        bot: [['jumpAt', 5.8], ['land'], ['jumpAt', 10.3], ['land'], ['jumpAt', 15.8], ['land'], ['go', 19.6], ['until', R => R.$('b').phase === 'down' && R.$('b').phaseK < 0.3], ['go', 29.5]] },
      { name: 'The long night', t: 60,
        map: [...fill(10, E),
          '.S....................^.....^.D.',
          ...fill(4, '#######...#######...####...#####')],
        setup(R) {
          R.when(R.at(2), () => R.echo(1.3));
          R.when(R.at(4), () => { R.dark(true); R.say('Don’t stop. Don’t forget.'); });
          R.saw({ x: 10.6, y: 10.15 }).go([[15.4, 10.15], [10.6, 10.15]], 3.4, true);
        },
        bot: [['go', 1.8], ['until', R => R.saws[0].vx > 0 && R.saws[0].x / T < 11.2], ['jumpAt', 6.8], ['land'], ['sawjump', 0], ['land'], ['jumpAt', 16.6], ['land'], ['jumpAt', 20.0], ['land'],
          ['jumpAt', 23.6], ['land'], ['jumpAt', 27.0], ['land'], ['go', 30.5]] },
      { name: 'The last lie', t: 95,
        map: [G, G,
          '##########AAAee#################',
          ...fill(4, '.............ee.................'),
          E, E, E,
          '.SD.............B...............',
          '####aa+cc#############~~~#######',
          ...fill(3, '####aa.cc#############...#######')],
        setup(R) {
          R.leaves(); R.show('A');
          let gone = false;
          const flee = () => { if (gone) return; gone = true; R.$('D').hop(30, 10, 1.1); R.say('Catch me.'); };
          R.when(R.at(1.56), flee); R.after(0.8, flee);
          R.when(p => p.ground && p.x >= 4 && p.x < 6, () => R.drop('a', 0.05));
          R.when(R.at(9.2), () => R.fall('A', 0.25));
          R.when(R.at(14.6), () => R.pop('B'));
          const s = R.saw({ x: 33.5, y: 10.15 });
          R.when(R.at(17.6), () => s.go([[-3, 10.15]], 5));
          R.when(R.at(26.5), () => {
            R.$('D').hop(2, 10, 1.3); R.say('Almost.');
            R.spawnDoor(30, 10, { fake: true, quiet: true });
            R.$('e').wait(0.4, 'w0').call(() => R.$('e').move(0, 4, 0.12, 'in', 'slam').call(() => R.slamFx('e')).wait(0.45, 'hold').move(0, -4, 0.8, 'io', 'rise').wait(1.0, 'top').loop());
            R.when(R.atL(10.6), () => R.drop('c', 0.1));
          });
        },
        bot: [['jumpAt', 3.3], ['land'], ['go', 9.3], ['wait', 1.0], ['run', 14.0], ['jumpAt', 15.0], ['land'], ['jumpAt', 21.6], ['land'], ['sawjump', 0], ['land'], ['go', 26.7], ['wait', 0.3],
          ['jumpAt', 25.2], ['land'], ['go', 18.3], ['until', R => R.$('e').phase === 'top' && R.$('e').phaseK < 0.2], ['jumpAt', 18.0], ['land'], ['go', 9.4], ['wait', 0.4],
          ['dir', -1], ['jump', 0.32], ['land'], ['dir', 0], ['wait', 0.15], ['dir', -1], ['jump', 0.32], ['land'], ['go', 2.5]] }
    ]
  ];

  const TAUNT = {
    spike: ['Thorns. Obviously.', 'That was always there. Probably.', 'Sharp, isn’t it?', 'The thorns were waiting.'],
    fall: ['The floor lied.', 'Gravity is honest. The floor isn’t.', 'You trusted the ground.', 'Down you go.'],
    crush: ['Flat.', 'Look up next time.', 'The ceiling had plans.'],
    saw: ['Should’ve run.', 'It was rolling for a while.', 'Whirr.'],
    door: ['Not that door.', 'Doors lie too.', 'It bit.'],
    shadow: ['It caught up.', 'You stopped.', 'Never stop.'],
    any: ['Again.', 'The path remembers. Do you?', 'One more time.']
  };

  DABWorlds.register('liar', {
    title: 'Liar’s Path', color: '226,214,188', opaque: true, hud: 'none',
    landscape: { top: 0, h: RH },
    music: 'music_liar',
    sounds: ['lp_jump', 'lp_land', 'lp_die', 'lp_pop', 'lp_crumble', 'lp_slam', 'lp_door', 'lp_saw', 'lp_exit', 'lp_flip', 'lp_thunder', 'lp_spring'],
    subtitle: () => 'A forest path that lies. The floor, the thorns, even the door.',
    hint: 'Reach the lit door. Trust nothing.',
    howto: ['◀ ▶ run  ·  jump (hold for higher)', 'Every room has a trick: die, learn, try again', 'Deaths are free. The clock is not.'],
    controls: { dirs: 'lr', buttons: [{ id: 'jump', icon: 'jump' }], layout: 'platform' },
    create
  });

  // ── map parsing ─────────────────────────────────────────────────────────
  const GROUP = ch => ch >= 'a' && ch <= 'z' && ch !== 'v';            // 'v' is a thorn, not a group
  const SOLIDISH = ch => ch === '#' || ch === '=' || ch === '%' || ch === '~' || GROUP(ch);
  function grid(rows) {
    const g = [];
    for (let y = 0; y < ROWS; y++) {
      const s = rows[y] || E;
      if (s.length !== COLS) console.warn('[liar] row', y, 'is', s.length, 'wide:', s);
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
    let ri = Math.max(0, Math.min(rooms.length - 1, (+q.get('room') || 1) - 1));
    const totalTime = rooms.reduce((s, r) => s + (r.t || 50), 0) + 10;
    let timeLeft = totalTime, deaths = 0, roomDeaths = 0, t = 0, done = false;
    let R = null, P = null, introT = 0, taunt = '', tauntT = 0, fade = 1, fadeDir = -1, nextAfterFade = null, deadT = 0, flashT = 0;
    const bake = { bg: null, room: null, K: 0 };
    const bot = { on: false, i: 0, t: 0, dir: 0, hold: 0, press: false, waitT: 0 };
    let musicOn = false;
    if (window.DABAudio && !musicOn) { DABAudio.music('music_liar', { restart: true, xf: 0.6 }); musicOn = true; }

    // ── build a room from its definition ──────────────────────────────────
    function build(def) {
      const g = grid(def.map);
      const r = {
        def, g, t: 0, gdir: 1, mirror: false, wind: 0, windT: 0, dark: false, darkA: 0, storm: 0, flipJumps: false,
        bodies: {}, blist: [], spikes: {}, slist: [], saws: [], doors: [], runes: [], springs: [], signs: [], leaves: [],
        rules: [], timers: [], echo: null, chaseT: -1, chase: null, start: { x: 1.5 * T, y: 11 * T, flip: false }
      };
      const at = (x, y) => (y < 0 || y >= ROWS || x < 0 || x >= COLS ? '.' : g[y][x]);
      const ground = [], groups = {}, spk = {}, fake = [], ghost = [], crumble = {};
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const ch = g[y][x];
        if (ch === '#' || ch === '=') ground.push([x, y]);
        else if (GROUP(ch)) (groups[ch] = groups[ch] || []).push([x, y]);
        else if (ch === '~') fake.push([x, y]);
        else if (ch === '+') ghost.push([x, y]);
        else if (ch === '%') (crumble[x] = crumble[x] || []).push([x, y]);
        else if (ch === 'S') r.start = { x: (x + 0.5) * T, y: SOLIDISH(at(x, y + 1)) || !SOLIDISH(at(x, y - 1)) ? (y + 1) * T : y * T, flip: !SOLIDISH(at(x, y + 1)) && SOLIDISH(at(x, y - 1)) };
        else if (ch === 'D' || ch === 'Q') {
          const hang = !SOLIDISH(at(x, y + 1)) && SOLIDISH(at(x, y - 1));
          r.doors.push(mover({ id: ch, x: (x + 0.5) * T, y: hang ? y * T : (y + 1) * T, hang, fake: ch === 'Q', alive: true, alpha: 1, ride: null, vx: 0 }));
        }
        else if (ch === '@') r.runes.push({ x: (x + 0.5) * T, y: SOLIDISH(at(x, y + 1)) ? (y + 1) * T : y * T, up: !SOLIDISH(at(x, y + 1)), arm: true });
        else if (ch === '*') r.springs.push({ x: (x + 0.5) * T, y: (y + 1) * T, sq: 0 });
        else if (ch >= '1' && ch <= '9') r.saws.push(makeSaw((x + 0.5) * T, (y + 0.5) * T, ch));
        else if ('^v<>'.includes(ch)) (spk._ = spk._ || []).push({ x, y, dir: { '^': 'up', 'v': 'down', '<': 'left', '>': 'right' }[ch] });
        else if (ch >= 'A' && ch <= 'Z') {
          const dir = SOLIDISH(at(x, y + 1)) ? 'up' : SOLIDISH(at(x, y - 1)) ? 'down' : SOLIDISH(at(x - 1, y)) ? 'right' : SOLIDISH(at(x + 1, y)) ? 'left' : 'up';
          (spk[ch] = spk[ch] || []).push({ x, y, dir });
        }
      }
      const body = (id, tiles, kind) => {
        const b = mover({ id, kind, tiles, rects: rowRects(tiles), solid: kind !== 'fake', visible: kind !== 'ghost', alive: true, carry: true, seen: 0, sprite: null });
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of b.rects) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); }
        b.bounds = { x0, y0, x1, y1 };
        r.bodies[id] = b; r.blist.push(b);
        return b;
      };
      body('#', ground, 'ground').static = true;
      for (const k in groups) body(k, groups[k], 'ground');
      // fake ground: each run of tiles is its own lie (it crumbles away when you sink into it)
      rowRects(fake).forEach((q, i) => { const tl = fake.filter(([x, y]) => y * T === q.y && x * T >= q.x && x * T < q.x + q.w); body('~' + i, tl, 'fake'); });
      if (ghost.length) body('+', ghost, 'ghost');
      Object.keys(crumble).forEach(x => { body('%' + x, crumble[x], 'crumble').col = +x; });
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
    function makeSaw(x, y, id) { return mover({ id, x0: x, y0: y, x, y, r: 0.85 * T, ang: 0, path: null, seg: 0, speed: 0, alive: true, moving: false }); }

    function makeApi(r) {
      const handle = id => {
        const o = r.bodies[id] || r.spikes[id] || r.doors.find(d => d.id === id) || r.saws.find(s => s.id === id);
        if (!o) { console.warn('[liar] no object', id); return null; }
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
          pop(dur) { return push({ k: 'ext', to: 1, dur: dur || 0.06, ease: 'out', name: 'pop' }).call(() => { sfx('lp_pop', { vol: 0.7 }); }); },
          hide(dur) { return push({ k: 'ext', to: 0, dur: dur || 0.12, ease: 'in', name: 'hide' }); },
          call(fn) { return push({ k: 'fn', fn }); },
          stop() { o.q = []; o.cur = null; o.loopQ = null; o.qx = o.ox; o.qy = o.oy; return C; },
          loop() { o.loopQ = [o.cur, ...o.q].filter(Boolean).map(e => Object.assign({}, e, { t: 0 })); o.q = []; o.cur = null; return C; },
          // door moves
          hop(x, y, dur) { const tx = (x + 0.5) * T - o.x, ty = (y + 1) * T - o.y; o.qx = tx; o.qy = ty; sfx('lp_door', { vol: 0.6 }); return push({ k: 'hop', x: tx, y: ty, dur, h: 3 * T, ease: 'io', name: 'hop' }); },
          ride(id) { o.ride = r.bodies[id]; return C; },
          appear(x, y) { o.ride = null; o.x = (x + 0.5) * T; o.y = (y + 1) * T; o.ox = o.oy = o.qx = o.qy = 0; o.alive = true; o.alpha = 0; o.q = []; o.cur = null; sfx('lp_door', { vol: 0.6 }); burst(o.x, o.y - 18, 10); return C; },
          charge(vx) { o.vx = vx * T; o.charging = true; sfx('lp_door', { vol: 0.8 }); return C; },
          // saws
          go(path, speed, loop) { o.path = path.map(([x, y]) => ({ x: x * T, y: y * T })); o.seg = 0; o.speed = speed * T; o.moving = true; o.loop = !!loop; sfx('lp_saw', { vol: 0.6 }); return C; },
          fallAway() { return push({ k: 'fall', dir: 1 }); }
        };
        return C;
      }
      const chains = new Map();
      const $ = id => { const o = handle(id); if (!o) return null; if (!chains.has(o)) chains.set(o, chain(o)); return chains.get(o); };
      return {
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
        drop(id, delay, dir) { const c = $(id); if (!c) return; if (delay) c.shake(delay); c.call(() => { sfx('lp_crumble', { vol: 0.7 }); handle(id).carry = false; }).fall(dir || 1); },
        fall(id, delay) { const c = $(id); if (!c) return; const o = handle(id); o.ext = 1; if (delay) c.shake(delay); c.call(() => { o.falling = 0; o.fallDist = fallDistance(r, o); sfx('lp_crumble', { vol: 0.5, rate: 1.4 }); }).fall(1); },
        pop(id, delay) { const c = $(id); if (!c) return; if (delay) c.wait(delay); c.pop(); },
        show(id) { const o = handle(id); if (o) o.ext = 1; },
        attach(sid, bid) { r.spikes[sid].attach = r.bodies[bid]; },
        saw(o) { const s = makeSaw(o.x * T, o.y * T, 's' + r.saws.length); if (o.r) s.r = o.r * T; r.saws.push(s); return chain(s); },
        spawnDoor(x, y, o) { o = o || {}; const d = mover({ id: o.fake ? 'Q' : 'D', x: (x + 0.5) * T, y: o.hang ? y * T : (y + 1) * T, hang: !!o.hang, fake: !!o.fake, alive: true, alpha: 0, ride: null, vx: 0 }); r.doors.push(d); if (!o.quiet) { sfx('lp_door', { vol: 0.6 }); burst(d.x, d.y - 18, 12); } return d; },
        doorX(id) { const d = r.doors.find(q => q.id === (id || 'D') && q.alive); return d ? (d.x + d.ox) / T : null; },
        harmless(id) { if (r.spikes[id]) r.spikes[id].harmless = true; },
        shadow() { return r.echo && r.echo.on ? { x: r.echo.x / T, y: r.echo.y / T } : null; },
        get windNow() { return r.wind; }, get windAge() { return r.windT; },
        sign(x, y, text) { r.signs.push({ x: (x + 0.5) * T, y: (y + 1) * T, text }); },
        leaves() { r.leavesOn = true; },
        say(text) { taunt = text; tauntT = 2.6; },
        slamFx(id) { const b = r.bodies[id]; sfx('lp_slam', { vol: 0.9 }); env.shake(0.3); dust((b.bounds.x0 + b.bounds.x1) / 2 + b.ox, (b.oy < 0 ? b.bounds.y0 : b.bounds.y1) + b.oy, (b.bounds.x1 - b.bounds.x0) / 2, 10); },
        chase(speed, from) { r.chase = { speed: speed * T, x0: (from || 0) * T, t: 0 }; },
        flip() { flipGravity(r); },
        flipJumps(on) { r.flipJumps = on; },
        mirror(on, quiet) { r.mirror = on; if (quiet) return; flashT = 0.35; sfx('lp_flip', { vol: 0.5, rate: on ? 0.8 : 1.2 }); },
        dark(on) { r.dark = on; if (on) { r.storm = 2.0; sfx('lp_thunder', { vol: 0.8 }); } },
        echo(delay) { r.echo = { delay, trail: [], t: 0, x: P.x, y: P.y }; },
        wind(vx) { if (vx !== r.wind) r.windT = 0; r.wind = vx; }
      };
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

    // ── the player ────────────────────────────────────────────────────────
    function spawn() {
      P = { x: R.start.x, y: R.start.y, vx: 0, vy: 0, ground: false, on: null, face: 1, coy: 0, buf: 0, cut: false, dead: false,
        run: 0, land: 0, born: 0, blink: 2 + Math.random() * 3, entering: 0, door: null, launched: false };
      R.gdir = R.start.flip ? -1 : 1;
      bot.i = 0; bot.t = 0; bot.dir = 0; bot.hold = 0; bot.press = false; bot.init = false;
    }
    function loadRoom(i, keepDeaths) {
      ri = i; R = build(rooms[ri]); spawn();
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
        if (!b.alive || !b.solid || b === except) continue;
        if (b.falling > 0.15) continue;                       // a dropping floor stops holding anything up
        for (const q of b.rects) out.push({ x0: q.x + b.ox, y0: q.y + b.oy, x1: q.x + q.w + b.ox, y1: q.y + q.h + b.oy, b });
      }
      return out;
    }
    function flipGravity(r) {
      r.gdir = -r.gdir; P.ground = false; P.vy = 0; P.coy = 0;
      sfx('lp_flip', { vol: 0.7 }); flashT = 0.25;
      // the hitbox hangs the other way from the feet: keep the body where it was
      P.y += r.gdir < 0 ? -PH : PH;
    }
    function die(cause) {
      if (P.dead || done) return;
      P.dead = true; deadT = 0; deaths++; roomDeaths++;
      sfx('lp_die', { vol: 0.9 });
      env.shake(0.35);
      const cy = P.y - R.gdir * PH * 0.6;
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * TAU, v = 80 + Math.random() * 260;
        fx.spawn({ x: P.x, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * R.gdir, g: 1100 * R.gdir, drag: 0.6, kind: 'debris', rgb: '11,12,10', size: 2.5 + Math.random() * 3.5, life: 0.9 + Math.random() * 0.5, spin: (Math.random() - 0.5) * 20 });
      }
      for (let i = 0; i < 2; i++) fx.spawn({ x: P.x + P.face * (2 + i * 2.4), y: cy - 6 * R.gdir, vx: (Math.random() - 0.5) * 40, vy: -60 * R.gdir, kind: 'glow', rgb: '255,255,255', size: 1.6, life: 0.8 });
      dust(P.x, cy, 10, 8);
      const list = TAUNT[cause] || TAUNT.any;
      taunt = roomDeaths >= 9 && Math.random() < 0.5 ? ['Still here?', 'Breathe. Look again.', 'Every trap is the same each time.'][deaths % 3] : list[deaths % list.length];
      tauntT = 2.2;
    }
    function burst(x, y, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 30 + Math.random() * 90; fx.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: 'glow', rgb: '255,226,170', size: 1.4 + Math.random(), life: 0.6 }); }
    }
    function dust(x, y, w, n) {
      for (let i = 0; i < n; i++) fx.spawn({ x: x + (Math.random() - 0.5) * w * 2, y, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, kind: 'smoke', rgb: '170,172,164', size: 6 + Math.random() * 8, grow: 18, life: 0.7, alpha: 0.7, drag: 2 });
    }

    // ── per-frame simulation ───────────────────────────────────────────────
    // the test autopilot: steps per room (see the header). Directions are meant on screen; the bot
    // presses the mirrored button itself when controls are swapped.
    function botInput(dt) {
      const steps = rooms[ri].bot || [];
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
        }
        bot.t += dt;
        const reached = () => bot.past || (bot.dir > 0 ? px >= a : px <= a);
        let next = false;
        if (k === 'run' || k === 'go') { if (reached()) { if (k === 'go') bot.dir = 0; next = true; } }
        else if (k === 'jumpAt') { if (reached()) { bot.press = true; bot.hold = b || 0.32; next = true; } }
        else if (k === 'jump') { bot.press = true; bot.hold = a || 0.32; next = true; }
        else if (k === 'dir') { bot.dir = a; next = true; }
        else if (k === 'hold') { bot.hold = a; next = true; }
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
        else if (k === 'wait') { if (bot.t >= a) next = true; }
        else if (k === 'land') { if (!P.ground) bot.air = true; if ((P.ground && (bot.air || bot.t > 0.15)) || bot.t > 2.5) next = true; }
        else if (k === 'until') { if (a(R.api, pview())) next = true; }
        if (next) { bot.i++; bot.init = false; }
      }
      if (bot.hold > 0) bot.hold -= dt;
      const d = bot.pause ? 0 : R.mirror ? -bot.dir : bot.dir;
      return { left: d < 0, right: d > 0, jumpP: bot.press, jumpH: bot.press || bot.hold > 0 };
    }
    const pview = () => ({ x: P.x / T, y: P.y / T, air: !P.ground, ground: P.ground, flipped: R.gdir < 0, vx: P.vx, on: P.on });

    function update(dt, I) {
      t += dt;
      if (done) return;
      introT += dt; tauntT = Math.max(0, tauntT - dt); flashT = Math.max(0, flashT - dt);
      fade = clamp(fade + fadeDir * dt * 3.2, 0, 1);
      if (nextAfterFade && fade >= 1) { const f = nextAfterFade; nextAfterFade = null; f(); fadeDir = -1; }
      timeLeft -= dt * env.clock;
      if (timeLeft <= 0) { timeLeft = 0; done = true; env.lose('Time’s up'); return; }
      if (P.dead) {
        deadT += dt; stepWorld(dt);
        if (deadT > 0.62) { loadRoom(ri, true); }
        hudSet(); return;
      }
      if (P.entering > 0) {
        P.entering += dt; stepWorld(dt);
        if (P.entering > 0.55 && !nextAfterFade) {
          fadeDir = 1;
          nextAfterFade = () => {
            if (ri + 1 >= rooms.length) { finish(); return; }
            loadRoom(ri + 1, false);
          };
        }
        hudSet(); return;
      }
      // input (or the test autopilot)
      bot.on = !!window.__liarBot;
      let L = I.left, Rt = I.right, jp = !!(I.pressed.jump), jh = !!(I.held.jump);
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
      // run
      const onGround = P.ground;
      const target = dir * RUN + (onGround ? (dir ? R.wind * 0.5 : 0) : R.wind);
      const a = onGround ? (dir ? ACC : DEC) : (dir ? AIR_ACC : AIR_DEC);
      if (P.vx < target) P.vx = Math.min(target, P.vx + a * dt); else if (P.vx > target) P.vx = Math.max(target, P.vx - a * dt);
      if (dir) P.face = dir;
      // jump (buffered, with coyote time); in a flip-jump room the button turns gravity over instead
      if (jp) P.buf = BUFFER; else P.buf = Math.max(0, P.buf - dt);
      P.coy = onGround ? COYOTE : Math.max(0, P.coy - dt);
      if (P.buf > 0 && (onGround || P.coy > 0)) {
        P.buf = 0; P.coy = 0;
        if (R.flipJumps) { flipGravity(R); }
        else { P.vy = -JUMP_V * R.gdir; P.ground = false; P.cut = false; P.launched = false; sfx('lp_jump', { vol: 0.45 }); }
      }
      const rising = P.vy * R.gdir < 0;
      if (rising && !jh && !P.cut && !P.launched) { P.vy *= CUT; P.cut = true; }
      const gg = rising && (jh || P.launched) ? G_UP : G_DN;
      P.vy += gg * R.gdir * dt;
      if (Math.abs(P.vy) > MAXF) P.vy = Math.sign(P.vy) * MAXF;
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
        const dy = P.vy * dt / n;
        P.y += dy;
        b = box();
        for (const r of S) if (b.x0 < r.x1 - 0.05 && b.x1 > r.x0 + 0.05 && b.y0 < r.y1 && b.y1 > r.y0) {
          if (dy * R.gdir > 0) { P.y = R.gdir > 0 ? r.y0 : r.y1; P.ground = true; P.on = r.b.id; if (r.b.kind === 'ghost') r.b.seen = 1; }
          else { P.y = R.gdir > 0 ? r.y1 + PH : r.y0 - PH; headHit = true; }
          P.vy = 0; b = box();
        }
      }
      if (P.ground && !wasGround) { P.land = 1; if (Math.abs(P.vy) < 1) sfx('lp_land', { vol: 0.3 }); dust(P.x, P.y, 4, 2); P.launched = false; }
      if (headHit) P.cut = true;
      // springs: land on one = launched (hold jump to go higher)
      for (const sp of R.springs) {
        if (P.ground && Math.abs(P.x - sp.x) < T * 0.55 && Math.abs(P.y - sp.y) < 2 && R.gdir > 0) {
          P.vy = -(jh ? SPRING_HI : SPRING_V); P.ground = false; P.launched = true; sp.sq = 1; sfx('lp_spring', { vol: 0.7 });
        }
      }
      // fake ground you sink into crumbles away
      const pb = box();
      for (const b of R.blist) if (b.kind === 'fake' && b.alive && b.rects.some(q => hit(pb, { x0: q.x, y0: q.y - 1, x1: q.x + q.w, y1: q.y + q.h }))) {
        b.alive = false; sfx('lp_crumble', { vol: 0.6, rate: 1.3 });
        for (const q of b.rects) for (let i = 0; i < 10; i++) fx.spawn({ x: q.x + Math.random() * q.w, y: q.y + Math.random() * 8, vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 80, g: 900, kind: 'debris', rgb: '11,12,10', size: 2 + Math.random() * 4, life: 1, spin: 6 });
      }
      // runes turn gravity over (once per touch)
      for (const ru of R.runes) {
        const touching = P.ground && Math.abs(P.x - ru.x) < T * 0.5 && Math.abs(P.y - ru.y) < 3 && ((R.gdir > 0) === !ru.up);
        if (touching && ru.arm) { ru.arm = false; flipGravity(R); }
        else if (!touching && !P.ground) ru.arm = true;
      }
      // the run cycle + idle blink
      P.run += Math.abs(P.vx) * dt / 15; P.land = Math.max(0, P.land - dt * 7); P.born += dt;
      P.blink -= dt; if (P.blink < -0.12) P.blink = 2 + Math.random() * 3;
      hazards();
      if (!P.dead) doorsCheck();
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
        if (b.oy > RH + 200 || b.oy < -RH - 200) { b.alive = false; b.q = []; b.cur = null; }
        if (b.seen > 0) b.seen = Math.max(0, b.seen - dt * 0.8);
      }
      for (const s of R.slist) {
        stepMover(s, dt);
        if (s.attach) { s.ox = s.attach.ox; s.oy = s.attach.oy; }
        if (s.falling !== undefined && s.cur && s.cur.k === 'fall' && s.fallDist && s.oy >= s.fallDist && s.alive) {
          s.alive = false; sfx('lp_crumble', { vol: 0.5, rate: 1.6 });
          for (const tl of s.tiles) for (let i = 0; i < 5; i++) fx.spawn({ x: (tl.x + 0.5) * T + (Math.random() - 0.5) * 12, y: tl.y * T + s.oy + T * 0.6, vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 100, g: 900, kind: 'debris', rgb: '11,12,10', size: 2 + Math.random() * 3, life: 0.8, spin: 10 });
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
        if (s.y > RH + 60) s.alive = false;
      }
      for (const sp of R.springs) sp.sq = Math.max(0, sp.sq - dt * 5);
      if (R.chase) {
        const c = R.chase; c.t += dt; const front = c.x0 + c.speed * c.t;
        for (const b of R.blist) if (b.kind === 'crumble' && b.alive && !b.started && (b.col + 0.5) * T <= front + T * 0.6) {
          b.started = true; b.q.push({ k: 'shake', dur: 0.18, amp: 1.8, name: 'shake' }, { k: 'fn', fn: () => { b.carry = false; if (Math.random() < 0.5) sfx('lp_crumble', { vol: 0.35, rate: 0.9 + Math.random() * 0.4 }); } }, { k: 'fall', dir: 1 });
        }
      }
      if (R.dark) { R.darkA = Math.min(1, R.darkA + dt * 3); R.storm -= dt; if (R.storm <= 0) { R.storm = 2.0 + Math.random() * 0.6; R.light = 0.16; sfx('lp_thunder', { vol: 0.5 }); } }
      else R.darkA = Math.max(0, R.darkA - dt * 3);
      R.light = Math.max(0, (R.light || 0) - dt);
      if (R.wind) { R.windT += dt; if (Math.random() < dt * 30) fx.spawn({ x: R.wind > 0 ? -10 : RW + 10, y: Math.random() * RH * 0.8, vx: R.wind * 4 + (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 30, kind: 'debris', rgb: '20,22,18', size: 2 + Math.random() * 2, life: 2.2, spin: 8, drag: 0 }); }
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
      if ((R.gdir > 0 && P.y - PH > RH + 30) || (R.gdir < 0 && P.y + PH < -30)) { die('fall'); return; }
    }
    function spikeBox(s, tl) {
      const x = tl.x * T + s.ox, y = tl.y * T + s.oy, h = T * 0.82 * s.ext;
      switch (tl.dir) {
        case 'down': return { x0: x + 4, y0: y, x1: x + T - 4, y1: y + h * 0.9 };
        case 'left': return { x0: x + T - h * 0.9, y0: y + 4, x1: x + T, y1: y + T - 4 };
        case 'right': return { x0: x, y0: y + 4, x1: x + h * 0.9, y1: y + T - 4 };
        default: return { x0: x + 4, y0: y + T - h * 0.9, x1: x + T - 4, y1: y + T };
      }
    }
    function doorsCheck() {
      for (const d of R.doors) {
        if (!d.alive || d.alpha < 0.6) continue;
        const dx = d.x + d.ox, dy = d.y + d.oy;
        const moving = d.cur && d.cur.k === 'hop';
        if (d.fake) {
          const r = d.hang ? { x0: dx - 9, y0: dy, x1: dx + 9, y1: dy + 38 } : { x0: dx - 9, y0: dy - 38, x1: dx + 9, y1: dy };
          if (hit(box(), r)) { d.bit = 0.4; die('door'); return; }
          continue;
        }
        if (moving || d.charging) continue;
        if (P.ground && Math.abs(P.x - dx) < 12 && Math.abs(P.y - dy) < 4 && (d.hang === (R.gdir < 0))) {
          P.entering = 0.0001; P.door = d; P.vx = 0; sfx('lp_exit', { vol: 0.8 });
          burst(dx, dy - 18 * R.gdir, 18);
          return;
        }
      }
    }
    function finish() {
      done = true;
      const n = rooms.length;
      if (env.round) env.setStars(deaths <= n ? 3 : deaths <= n * 3 ? 2 : 1);
      env.win();
    }
    function hudSet() { /* own HUD (def.hud none) */ }

    // ── art: the backdrop (baked once per round) and each room's static ground ─
    function backdrop(K) {
      const cv = document.createElement('canvas'); cv.width = Math.round(RW * K); cv.height = Math.round(RH * K);
      const g = cv.getContext('2d'); g.scale(K, K);
      const rnd = rng(9001 + LV * 77);
      const sky = g.createLinearGradient(0, 0, 0, RH);
      sky.addColorStop(0, '#c6c8bf'); sky.addColorStop(0.45, '#a5a89f'); sky.addColorStop(1, '#5d615a');
      g.fillStyle = sky; g.fillRect(0, 0, RW, RH);
      const sun = g.createRadialGradient(RW * 0.22, -30, 10, RW * 0.22, -30, RW * 0.7);
      sun.addColorStop(0, 'rgba(255,253,240,0.75)'); sun.addColorStop(0.4, 'rgba(255,250,235,0.18)'); sun.addColorStop(1, 'rgba(255,250,235,0)');
      g.fillStyle = sun; g.fillRect(0, 0, RW, RH);
      const layer = (n, col, wMin, wMax, lean, base) => {
        for (let i = 0; i < n; i++) {
          const x = (i + rnd()) / n * (RW + 80) - 40, w = wMin + rnd() * (wMax - wMin);
          tree(g, x, base + rnd() * 20, w, col, rnd, (rnd() - 0.5) * lean);
        }
      };
      layer(16, 'rgba(120,124,116,0.55)', 4, 9, 0.12, RH * 0.82);
      fog(g, RH * 0.55, 0.22);
      layer(9, 'rgba(78,82,76,0.8)', 8, 15, 0.16, RH * 0.9);
      fog(g, RH * 0.7, 0.18);
      layer(4, 'rgba(36,39,34,0.92)', 14, 26, 0.1, RH);
      // light shafts from the top-left
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = 40 + rnd() * RW * 0.6, w = 18 + rnd() * 50, a = 0.04 + rnd() * 0.05;
        const gr = g.createLinearGradient(0, 0, 0, RH); gr.addColorStop(0, `rgba(255,252,236,${a})`); gr.addColorStop(1, 'rgba(255,252,236,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x, -10); g.lineTo(x + w, -10); g.lineTo(x + w + RH * 0.55, RH); g.lineTo(x + RH * 0.55, RH); g.closePath(); g.fill();
      }
      g.restore();
      fog(g, RH * 0.92, 0.25);
      return cv;
    }
    function fog(g, y, a) {
      const gr = g.createLinearGradient(0, y - 90, 0, y + 30);
      gr.addColorStop(0, 'rgba(220,222,214,0)'); gr.addColorStop(0.7, `rgba(220,222,214,${a})`); gr.addColorStop(1, `rgba(220,222,214,${a * 0.6})`);
      g.fillStyle = gr; g.fillRect(0, y - 90, RW, 120);
    }
    function tree(g, x, base, w, col, rnd, lean) {
      g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
      const top = -40, h = base - top;
      g.beginPath();
      g.moveTo(x - w * 0.9, base + 4);
      g.quadraticCurveTo(x - w * 0.55 + lean * h * 0.3, base - h * 0.5, x - w * 0.42 + lean * h, top);
      g.lineTo(x + w * 0.42 + lean * h, top);
      g.quadraticCurveTo(x + w * 0.55 + lean * h * 0.3, base - h * 0.5, x + w * 0.9, base + 4);
      g.closePath(); g.fill();
      // roots flaring into the ground
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * w * 0.4, base - 10); g.quadraticCurveTo(x + s * w * 1.3, base - 2, x + s * w * 2.2, base + 4); g.lineTo(x + s * w * 0.5, base + 4); g.fill(); }
      const nb = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < nb; i++) {
        const yy = base - h * (0.25 + rnd() * 0.55), s = rnd() < 0.5 ? -1 : 1;
        const xx = x + lean * (base - yy);
        branch(g, xx, yy, s > 0 ? -0.5 - rnd() * 0.5 : Math.PI + 0.5 + rnd() * 0.5, w * (3 + rnd() * 3), w * 0.35, 2, rnd);
      }
    }
    function branch(g, x, y, a, len, wid, d, rnd) {
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
      g.lineWidth = Math.max(0.6, wid);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x1) / 2, (y + y1) / 2 + len * 0.12, x1, y1); g.stroke();
      if (d > 0) {
        const n = 2 + (rnd() < 0.35 ? 1 : 0);
        for (let i = 0; i < n; i++) branch(g, x1, y1, a + (rnd() - 0.5) * 1.3, len * 0.62, wid * 0.6, d - 1, rnd);
      } else if (rnd() < 0.6) {                                // hanging moss
        g.lineWidth = 0.7; g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(x1 + 2, y1 + 8, x1 - 1, y1 + 8 + rnd() * 16); g.stroke();
      }
    }
    // the silhouette ground look: black mass, grass blades on top, roots under, nicks on the sides
    function earth(g, tiles, solidAt, seedK) {
      g.fillStyle = INK;
      for (const [x, y] of tiles) g.fillRect(x * T - 0.4, y * T - 0.4, T + 0.8, T + 0.8);
      g.strokeStyle = INK;
      for (const [x, y] of tiles) {
        const r0 = hr(x, y, seedK);
        if (!solidAt(x, y - 1)) {                             // grass on top
          for (let i = 0; i < 7; i++) {
            const bx = x * T + (i + hr(x, y, i + 10)) * T / 7, hh = 2.5 + hr(x, y, i + 20) * 6 + (hr(x, y, i + 30) < 0.12 ? 6 : 0);
            const lean = (hr(x, y, i + 40) - 0.5) * 4;
            g.beginPath(); g.moveTo(bx - 1.3, y * T + 1); g.quadraticCurveTo(bx + lean * 0.3, y * T - hh * 0.6, bx + lean, y * T - hh); g.lineTo(bx + 1.3, y * T + 1); g.closePath(); g.fill();
          }
          if (r0 < 0.12) { g.beginPath(); g.ellipse(x * T + T * 0.5, y * T, 5, 3.5, 0, Math.PI, 0); g.fill(); }   // a stone
        }
        if (!solidAt(x, y + 1)) {                             // roots hanging under a ledge
          const n = hr(x, y, 50) < 0.5 ? 1 : 2;
          for (let i = 0; i < n; i++) {
            const bx = x * T + (0.2 + 0.6 * hr(x, y, 60 + i)) * T, len = 4 + hr(x, y, 70 + i) * 13;
            g.lineWidth = 1 + hr(x, y, 80 + i); g.beginPath(); g.moveTo(bx, (y + 1) * T - 1); g.quadraticCurveTo(bx + 3, (y + 1) * T + len * 0.5, bx - 1, (y + 1) * T + len); g.stroke();
          }
        }
        for (const s of [-1, 1]) if (!solidAt(x + s, y)) {        // nicks on open sides
          const ex = s < 0 ? x * T : (x + 1) * T;
          for (let i = 0; i < 2; i++) { const yy = y * T + (0.2 + 0.6 * hr(x, y, 90 + i + s)) * T; g.beginPath(); g.arc(ex, yy, 1.4 + hr(x, y, 95 + i) * 1.6, 0, TAU); g.fill(); }
        }
      }
    }
    function bakeRoom() {
      const S = fit().s, K = Math.min(2, Math.max(1, (env.dpr || 1) * S));
      if (!bake.bg || Math.abs(bake.K - K) > 0.3) { bake.bg = backdrop(K); bake.K = K; bake.rooms = {}; }
      const cv = document.createElement('canvas'); cv.width = bake.bg.width; cv.height = bake.bg.height;
      const g = cv.getContext('2d'); g.drawImage(bake.bg, 0, 0); g.scale(K, K);
      const G0 = R.g;
      const renderSolid = (x, y) => { if (x < 0 || x >= COLS) return renderSolid(clamp(x, 0, COLS - 1), y); if (y < 0 || y >= ROWS) return y >= ROWS ? renderSolid(x, ROWS - 1) : false; const ch = G0[y][x]; return SOLIDISH(ch); };
      earth(g, R.bodies['#'].rects.length ? tilesOf(R.bodies['#']) : [], renderSolid, 1);
      for (const sg of R.signs) drawSign(g, sg);
      bake.room = cv;
      // every moving/fake/crumbling piece gets its own sprite (it looks exactly like the ground)
      for (const b of R.blist) {
        if (b.static || b.kind === 'ghost') continue;
        const pad = 16, w = b.bounds.x1 - b.bounds.x0 + pad * 2, h = b.bounds.y1 - b.bounds.y0 + pad * 2;
        const sc = document.createElement('canvas'); sc.width = Math.ceil(w * K); sc.height = Math.ceil(h * K);
        const sg = sc.getContext('2d'); sg.scale(K, K); sg.translate(pad - b.bounds.x0, pad - b.bounds.y0);
        earth(sg, b.tiles, renderSolid, 2);
        b.sprite = sc; b.pad = pad;
      }
    }
    function tilesOf(b) { return b.tiles; }
    function drawSign(g, s) {
      g.fillStyle = INK; g.fillRect(s.x - 1.6, s.y - 30, 3.2, 30);
      g.save(); g.translate(s.x, s.y - 34); g.rotate(-0.04);
      g.font = 'bold 11px Georgia, serif';
      const w = Math.max(40, g.measureText(s.text).width + 14);
      g.fillStyle = INK; g.beginPath(); g.roundRect(-w / 2, -10, w, 20, 2); g.fill();
      g.fillStyle = 'rgba(214,206,186,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.text, 0, 1);
      g.restore();
    }

    // ── drawing ───────────────────────────────────────────────────────────
    function fit() {
      const W = env.W, v = env.view, s = Math.min(W / RW, v.h / RH);
      return { s, x: (W - RW * s) / 2, y: v.top + (v.h - RH * s) / 2 };
    }
    let fogT = Math.random() * 100;
    function render(c) {
      const F = fit(), W = env.W, v = env.view;
      // around the room (portrait letterbox / landscape edges): sky above, earth below
      c.fillStyle = '#a3a69d'; c.fillRect(0, v.top, W, F.y - v.top + 1);
      c.fillStyle = INK; c.fillRect(0, F.y + RH * F.s - 1, W, v.top + v.h - (F.y + RH * F.s) + 2);
      const below = v.top + v.h - (F.y + RH * F.s);
      if (below > 4 && bake.room) {                           // pits run on down into the dark (portrait)
        const h = Math.min(below, 120), y0 = F.y + RH * F.s - 1;
        c.drawImage(bake.room, 0, bake.room.height - 2, bake.room.width, 1, F.x, y0, RW * F.s, h);
        const gr = c.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, 'rgba(11,12,10,0.2)'); gr.addColorStop(1, INK);
        c.fillStyle = gr; c.fillRect(F.x, y0, RW * F.s, h + 1);
      }
      if (F.x > 0) { c.fillStyle = '#7f827a'; c.fillRect(0, F.y, F.x + 1, RH * F.s); c.fillRect(F.x + RW * F.s - 1, F.y, F.x + 2, RH * F.s); }
      c.save(); c.translate(F.x, F.y); c.scale(F.s, F.s);
      c.beginPath(); c.rect(0, 0, RW, RH); c.clip();
      if (bake.room) c.drawImage(bake.room, 0, 0, RW, RH);
      fogT += 1 / 60;
      // ghost ground just stood on shows faintly
      const gb = R.bodies['+'];
      if (gb && gb.seen > 0) { c.fillStyle = `rgba(11,12,10,${(gb.seen * 0.4).toFixed(3)})`; for (const q of gb.rects) c.fillRect(q.x, q.y, q.w, q.h); }
      if (R.leavesOn && gb) drawLeaves(c, gb);
      for (const b of R.blist) {
        if (!b.sprite || !b.alive) continue;
        const jx = b.shk ? (Math.random() - 0.5) * b.shk * 2 : 0, jy = b.shk ? (Math.random() - 0.5) * b.shk : 0;
        c.drawImage(b.sprite, b.bounds.x0 - b.pad + b.ox + jx, b.bounds.y0 - b.pad + b.oy + jy, b.sprite.width / bake.K, b.sprite.height / bake.K);
      }
      for (const sp of R.springs) drawSpring(c, sp);
      for (const ru of R.runes) drawRune(c, ru);
      for (const s of R.slist) if (s.alive && s.ext > 0.01) drawThorns(c, s);
      for (const s of R.saws) if (s.alive) drawSaw(c, s);
      for (const d of R.doors) if (d.alive) drawDoor(c, d);
      if (R.echo && R.echo.on) drawKid(c, R.echo.x, R.echo.y, 1, 0.45, true);
      if (!P.dead) drawKid(c, P.x, P.y, P.face, 1, false);
      fx.draw(c);
      // drifting fog over everything alike (drawn under the moving pieces it would give them away)
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const x = ((fogT * (8 + i * 5) + i * 300) % (RW + 500)) - 250, y = RH * (0.45 + i * 0.16); c.globalAlpha = 0.08; c.drawImage(env.glowSprite('236,238,230'), x - 220, y - 70, 440, 140); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      // darkness: only the door and the eyes show, lightning shows the rest for a blink
      if (R.darkA > 0) {
        const a = R.darkA * (1 - Math.min(1, (R.light || 0) * 7));
        c.fillStyle = `rgba(4,5,4,${(0.96 * a).toFixed(3)})`; c.fillRect(0, 0, RW, RH);
        c.globalCompositeOperation = 'lighter';
        for (const d of R.doors) if (d.alive && !d.fake) { c.globalAlpha = 0.5 * a; c.drawImage(env.glowSprite('255,214,150'), d.x + d.ox - 60, d.y + d.oy - 80, 120, 120); }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        if (!P.dead) eyes(c, P.x, P.y, P.face, a);
        for (const s of R.saws) if (s.alive) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 * a; c.drawImage(env.glowSprite('255,170,110'), s.x - s.r * 1.4, s.y - s.r * 1.4, s.r * 2.8, s.r * 2.8); c.restore(); c.strokeStyle = `rgba(255,190,140,${(0.55 * a).toFixed(3)})`; c.lineWidth = 1.2; c.beginPath(); c.arc(s.x, s.y, s.r * 0.95, s.ang, s.ang + 1.2); c.stroke(); c.beginPath(); c.arc(s.x, s.y, s.r * 0.95, s.ang + Math.PI, s.ang + Math.PI + 1.2); c.stroke(); }
        for (const d of R.doors) if (d.alive && !d.fake) { c.globalAlpha = a; drawDoorLight(c, d.x + d.ox, d.y + d.oy, d.hang); c.globalAlpha = 1; }
      }
      if (flashT > 0) { c.fillStyle = `rgba(255,255,255,${(flashT * 0.6).toFixed(3)})`; c.fillRect(0, 0, RW, RH); }
      // fade between rooms / respawns
      const fd = Math.max(fade, P.dead ? Math.max(0, (deadT - 0.35) / 0.27) : 0);
      if (fd > 0) { c.fillStyle = `rgba(6,7,6,${fd.toFixed(3)})`; c.fillRect(0, 0, RW, RH); }
      c.restore();
      drawHud(c, F);
    }
    function drawLeaves(c, gb) {
      for (const [x, y] of gb.tiles) {
        if (y > 0 && R.g[y - 1][x] === '+') continue;
        if (hr(x, y, 7) < 0.25) continue;
        const bx = x * T + T * (0.2 + 0.6 * hr(x, y, 8)), by = y * T - 2 + Math.sin(t * 2 + x) * 0.8;
        c.save(); c.translate(bx, by); c.rotate((hr(x, y, 9) - 0.5) * 1.2 + Math.sin(t * 1.5 + x) * 0.05);
        c.fillStyle = INK; c.beginPath(); c.ellipse(0, 0, 4.5, 1.8, 0, 0, TAU); c.fill();
        c.strokeStyle = INK; c.lineWidth = 0.8; c.beginPath(); c.moveTo(4, 0); c.lineTo(7, -1); c.stroke();
        c.restore();
      }
    }
    function drawThorns(c, s) {
      c.fillStyle = INK;
      const jx = s.shk ? (Math.random() - 0.5) * s.shk * 2 : 0;
      for (const tl of s.tiles) {
        const x = tl.x * T + s.ox + jx, y = tl.y * T + s.oy;
        c.save();
        c.translate(x + T / 2, y + T / 2);
        c.rotate({ up: 0, down: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[tl.dir]);
        const H = T * 0.85 * s.ext;
        for (let i = 0; i < 3; i++) {
          const bx = -T / 2 + 3 + i * (T - 6) / 2.4 + hr(tl.x, tl.y, i) * 2, hh = H * (0.7 + 0.3 * hr(tl.x, tl.y, i + 5)), bw = 4.5 + hr(tl.x, tl.y, i + 9) * 2;
          const tip = (hr(tl.x, tl.y, i + 13) - 0.5) * 3;
          c.beginPath(); c.moveTo(bx - bw / 2, T / 2 + 1); c.quadraticCurveTo(bx - bw * 0.2, T / 2 - hh * 0.5, bx + tip, T / 2 - hh); c.quadraticCurveTo(bx + bw * 0.25, T / 2 - hh * 0.45, bx + bw / 2, T / 2 + 1); c.closePath(); c.fill();
        }
        c.restore();
      }
    }
    function drawSaw(c, s) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.ang);
      c.fillStyle = INK; c.beginPath();
      const n = 14;
      for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, rr = i % 2 ? s.r * 0.82 : s.r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(160,162,155,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, s.r * 0.5, 0.3, 2.2); c.stroke(); c.beginPath(); c.arc(0, 0, s.r * 0.5, 3.4, 5.3); c.stroke();
      c.fillStyle = 'rgba(160,162,155,0.6)'; c.beginPath(); c.arc(0, 0, 2.2, 0, TAU); c.fill();
      c.restore();
    }
    function drawSpring(c, sp) {
      const k = sp.sq, h = 9 - k * 5;
      c.fillStyle = INK; c.strokeStyle = INK; c.lineWidth = 1.6;
      c.fillRect(sp.x - 11, sp.y - 3, 22, 3);
      c.beginPath(); for (let i = 0; i <= 4; i++) { c.lineTo(sp.x + (i % 2 ? 7 : -7), sp.y - 3 - i * h / 4); } c.stroke();
      c.fillRect(sp.x - 12, sp.y - 6 - h, 24, 3.5);
    }
    function drawRune(c, ru) {
      const y = ru.y + (ru.up ? 3 : -3), a = 0.55 + 0.25 * Math.sin(t * 3);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.6;
      c.drawImage(env.glowSprite('230,236,255'), ru.x - 22, y - 22, 44, 44); c.restore();
      c.strokeStyle = `rgba(240,244,255,${a.toFixed(3)})`; c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(ru.x, y, 10, 3.5, 0, 0, TAU); c.stroke();
      const d = ru.up ? -1 : 1;
      c.beginPath(); c.moveTo(ru.x, y); c.lineTo(ru.x, y + d * 12); c.moveTo(ru.x - 4, y + d * 8); c.lineTo(ru.x, y + d * 12); c.lineTo(ru.x + 4, y + d * 8); c.stroke();
    }
    function drawDoorLight(c, x, y, hang) {
      c.save(); c.translate(x, y); if (hang) c.scale(1, -1);
      const g = c.createLinearGradient(0, -36, 0, 0); g.addColorStop(0, '#ffe9b8'); g.addColorStop(1, '#f2b766');
      c.fillStyle = g; c.beginPath(); c.moveTo(-8, 0); c.lineTo(-8, -26); c.arc(0, -26, 8, Math.PI, 0); c.lineTo(8, 0); c.closePath(); c.fill();
      c.restore();
    }
    function drawDoor(c, d) {
      const x = d.x + d.ox, y = d.y + d.oy;
      c.save(); c.globalAlpha = d.alpha;
      const fl = 0.85 + 0.15 * Math.sin(t * 7 + x) * Math.sin(t * 3.1);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = d.alpha * 0.55 * fl;
      c.drawImage(env.glowSprite('255,214,150'), x - 58, y - (d.hang ? -40 : 76), 116, 112);
      c.globalAlpha = d.alpha * 0.25; c.drawImage(env.glowSprite('255,200,120'), x - 40, y - 8, 80, 16);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = d.alpha;
      c.translate(x, y); if (d.hang) c.scale(1, -1);
      // stone frame
      c.fillStyle = INK; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-14, -28); c.arc(0, -28, 14, Math.PI, 0); c.lineTo(14, 0); c.closePath(); c.fill();
      c.fillRect(-17, -3, 34, 3);
      c.restore();
      drawDoorLight(c, x, y, d.hang);
      if (d.fake && d.bit > 0) {                              // the lying door bites shut
        d.bit = Math.max(0, d.bit - 1 / 60);
        c.save(); c.translate(x, y); if (d.hang) c.scale(1, -1); c.fillStyle = INK;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-8 + i * 4, -36); c.lineTo(-6 + i * 4, -20); c.lineTo(-4 + i * 4, -36); c.fill(); c.beginPath(); c.moveTo(-8 + i * 4, 0); c.lineTo(-6 + i * 4, -16); c.lineTo(-4 + i * 4, 0); c.fill(); }
        c.restore();
      }
    }
    function eyes(c, x, y, face, a) {
      const hy = y - R.gdir * 24, ex = x + face * 2.2;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6 * a;
      c.drawImage(env.glowSprite('255,255,255'), ex - 8, hy - 8, 16, 16); c.restore();
      c.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      c.beginPath(); c.arc(ex - face * 1.6, hy, 1.15, 0, TAU); c.arc(ex + face * 1.4, hy, 1.15, 0, TAU); c.fill();
    }
    // the shadow child: big head, thin limbs, two white eyes
    function drawKid(c, x, y, face, alpha, ghostly) {
      const g = R.gdir, air = !P.ground && !ghostly, sp = Math.min(1, Math.abs(P.vx) / RUN);
      const ph = P.run;
      c.save(); c.translate(x, y); if (g < 0) c.scale(1, -1); c.scale(face, 1);
      if (P.land > 0 && !ghostly) c.scale(1 + P.land * 0.12, 1 - P.land * 0.14);
      if (P.entering > 0 && !ghostly) c.globalAlpha = Math.max(0, 1 - P.entering * 2);
      else c.globalAlpha = alpha;
      const ink = ghostly ? '#1d1f1b' : INK;
      c.strokeStyle = ink; c.fillStyle = ink; c.lineCap = 'round'; c.lineJoin = 'round';
      const lean = ghostly ? 0 : sp * 0.12 + (air ? 0.05 : 0);
      const hipX = 0, hipY = -9, neckX = Math.sin(lean) * 9, neckY = -18;
      // legs
      c.lineWidth = 2.6;
      const leg = (k) => {
        let a1, a2;
        if (air) { a1 = k ? 0.5 : -0.35; a2 = k ? -0.9 : -0.3; if (P.vy * g > 0) { a1 = k ? 0.3 : -0.2; a2 = -0.25; } }
        else if (sp > 0.05) { const s = Math.sin(ph + (k ? Math.PI : 0)); a1 = s * 0.75 * sp; a2 = -Math.max(0, -Math.cos(ph + (k ? Math.PI : 0))) * 1.1 * sp; }
        else { a1 = k ? 0.08 : -0.08; a2 = 0; }
        const kx = hipX + Math.sin(a1) * 5, ky = hipY + Math.cos(a1) * 5;
        const fx2 = kx + Math.sin(a1 + a2) * 4.6, fy2 = ky + Math.cos(a1 + a2) * 4.6;
        c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(kx, ky); c.lineTo(fx2, Math.min(0, fy2)); c.stroke();
      };
      leg(0); leg(1);
      // body
      c.lineWidth = 5; c.beginPath(); c.moveTo(hipX, hipY + 1); c.lineTo(neckX, neckY); c.stroke();
      // arms
      c.lineWidth = 2;
      for (const k of [0, 1]) {
        let a = air ? (k ? -2.4 : -2.0) + Math.sin(t * 18 + k) * 0.15 : sp > 0.05 ? Math.sin(ph + (k ? 0 : Math.PI)) * 0.8 * sp : (k ? 0.15 : -0.1);
        const sx = neckX, sy = neckY + 2, ex = sx + Math.sin(a) * 5, ey = sy + Math.cos(a) * 5, hx = ex + Math.sin(a + (air ? 0.3 : -0.4)) * 4.4, hy = ey + Math.cos(a + (air ? 0.3 : -0.4)) * 4.4;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
      }
      // head + hair
      const hx = neckX + 0.8, hy = neckY - 5.6;
      c.beginPath(); c.arc(hx, hy, 6, 0, TAU); c.fill();
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = -2.6 + i * 0.5, r0 = 5.5, r1 = 8 + (i % 2) * 1.6; c.moveTo(hx + Math.cos(a - 0.18) * r0, hy + Math.sin(a - 0.18) * r0); c.lineTo(hx + Math.cos(a) * r1, hy + Math.sin(a) * r1); c.lineTo(hx + Math.cos(a + 0.18) * r0, hy + Math.sin(a + 0.18) * r0); }
      c.fill();
      // eyes
      if (!ghostly && P.blink > 0) {
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(hx + 1.3, hy - 0.4, 1.15, 0, TAU); c.arc(hx + 4.0, hy - 0.4, 1.0, 0, TAU); c.fill();
      } else if (ghostly) { c.fillStyle = 'rgba(255,90,80,0.9)'; c.beginPath(); c.arc(hx + 1.3, hy - 0.4, 1.1, 0, TAU); c.arc(hx + 4.0, hy - 0.4, 1.0, 0, TAU); c.fill(); }
      c.restore();
    }
    function drawHud(c, F) {
      const W = env.W, v = env.view, top = v.top;
      const land = env.land;
      const y0 = land ? top + 22 : Math.max(top + 46, F.y - 58);
      c.save(); c.textBaseline = 'middle';
      const light = 'rgba(236,232,220,0.96)';
      // text on a soft dark pill: readable over the pale sky and the black ceilings alike
      const txt = (s, x, y, font, al, col, padX) => {
        c.font = font; c.textAlign = al;
        const w = c.measureText(s).width, px = padX === undefined ? 10 : padX, h = parseInt(font.match(/(\d+)px/)[1], 10) + 10;
        const x0 = al === 'center' ? x - w / 2 - px : al === 'right' ? x - w - px : x - px;
        c.fillStyle = 'rgba(8,9,7,0.5)'; c.beginPath(); c.roundRect(x0, y - h / 2, w + px * 2, h, h / 2); c.fill();
        c.fillStyle = col || light; c.fillText(s, x, y + 0.5);
      };
      const tl = Math.ceil(timeLeft), mm = Math.floor(tl / 60), ss = String(tl % 60).padStart(2, '0');
      const low = timeLeft < 20 && Math.sin(t * 8) > 0;
      txt(`${mm}:${ss}`, W / 2, y0, 'bold 20px Georgia, serif', 'center', low ? '#ff8a7a' : light, 14);
      txt(`room ${ri + 1} of ${rooms.length}`, W / 2, y0 + 25, 'italic 11px Georgia, serif', 'center', 'rgba(236,232,220,0.8)');
      txt(`deaths  ${deaths}`, 22, y0, 'bold 13px Georgia, serif', 'left');
      if (R.mirror) txt('◀ ▶  swapped', 22, y0 + 26, 'italic 12px Georgia, serif', 'left', '#ffb0a0');
      // the room's name as it opens
      if (introT < 2.4) {
        const a = Math.min(1, introT * 2.5) * Math.min(1, (2.4 - introT) * 2);
        c.globalAlpha = a;
        txt(rooms[ri].name, W / 2, F.y + RH * F.s * 0.24, `italic ${land ? 24 : 18}px Georgia, serif`, 'center', light, 18);
        c.globalAlpha = 1;
      }
      if (tauntT > 0) {
        const a = Math.min(1, tauntT * 2);
        c.globalAlpha = a;
        c.font = `italic ${land ? 17 : 15}px Georgia, serif`; c.textAlign = 'center';
        c.fillStyle = 'rgba(232,226,210,0.95)';
        const ty = land ? F.y + RH * F.s - 30 : F.y + RH * F.s + 34;
        c.fillText(taunt, W / 2, ty);
        c.globalAlpha = 1;
      }
      c.restore();
    }

    loadRoom(ri, false);
    return {
      update, render,
      destroy() { },
      debug: () => ({ level: LV, room: ri + 1, rooms: rooms.length, deaths, roomDeaths, time: +timeLeft.toFixed(1), done,
        x: +(P.x / T).toFixed(2), y: +(P.y / T).toFixed(2), ground: P.ground, dead: P.dead, flipped: R.gdir < 0, bot: bot.i, entering: P.entering > 0 })
    };
  }
})();
