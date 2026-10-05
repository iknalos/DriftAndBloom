// ============================================================================
// Drift & Bloom — ANIMAL WORLD
// A croc snap or a snake bite drags the spirit into the jungle: a sword
// side-scroller, left → right, to the lotus gate.
//
// Every animal is a real photograph (Wikimedia Commons, licenses in
// assets/worlds/CREDITS.json; rebuilt by tools/assets/animal_build.py), cut out
// and animated in code:
//   croc   — lower jaw on a hinge, tail sways in strips, half under the water
//   python — coiled on a branch, strikes by stretching its lower body (strip warp),
//            flicking tongue
//   eagle / vulture — wings split off the body and flapped around the shoulders;
//            they swoop, grab and carry you up (tap ⚔ to break free, the longer
//            it takes the higher you fall)
//   boar   — gallop from a body bob + sheared leg band, charges after a snort
// Water is a WebGL shader that reflects the (blurred photo) forest behind it.
//
// Test flags: &god=1 (no damage) · &ax=2400 (start at x) · &show=zoo (creature preview)
// ============================================================================
(function () {
  'use strict';

  const A = 'assets/worlds/animal/';
  const Q = new URLSearchParams(location.search);
  const GOD = Q.get('god') === '1';
  const START_X = +(Q.get('ax') || 0);
  const ZOO = Q.get('show') === 'zoo';

  // ── level layout (world px; screen is 390 wide, ground surface at y 600) ──
  const GROUND = 600, WATER = 618, END = 5060, HS = 1.2;
  // every hop is one full running jump (~140 px) onto a wide landing
  const GAPS = [[1180, 1460], [2420, 2860], [3760, 4020]];
  const PLATS = [
    { x: 1320, w: 100, kind: 'stone' },
    { x: 2556, w: 140, kind: 'log', drift: 36 }, { x: 2730, w: 96, kind: 'stone' },
    { x: 3880, w: 96, kind: 'stone' }
  ];
  const TREES = [
    { x: 190, v: 0 }, { x: 830, v: 1, snake: true }, { x: 1080, v: 2 }, { x: 1640, v: 3 },
    { x: 2240, v: 1, snake: true }, { x: 2050, v: 0 }, { x: 3110, v: 2 }, { x: 3330, v: 3, snake: true },
    { x: 3620, v: 0 }, { x: 4200, v: 2 }, { x: 4460, v: 1, snake: true }, { x: 4820, v: 3 }
  ];
  const BOARS = [560, 1760, 1880, 3020, 4620, 4730];
  // beat-'em-up arenas: the camera locks and the way only opens when the pack is down
  const ARENAS = [
    { at: 1640, cam: 1560, extra: [{ side: 1, delay: 2.2 }] },
    { at: 4500, cam: 4445, extra: [{ side: -1, delay: 1.6 }, { side: 1, delay: 4.5 }] }
  ];
  const BIRDS = [{ at: 2100, kind: 'vulture' }, { at: 3420, kind: 'eagle' }, { at: 4300, kind: 'eagle' }];
  const BLOOMS = [1600, 3060, 4130, 4420];
  const BRANCH_Y = 384, BRANCH_LEN = 128;

  // ── creature rigs (coordinates in the shipped image's pixels) ─────────────
  const CROC = {                      // croc.webp 1200 x 157, faces right
    k: 0.24, hinge: [925, 100], snout: [1190, 74],
    jaw: [[900, 107], [925, 92], [965, 95], [1025, 102], [1075, 106], [1125, 111], [1165, 118], [1180, 131], [1150, 145], [1050, 148], [950, 150], [900, 145]],
    mouth: [[930, 96], [1000, 93], [1140, 92], [1162, 112], [1050, 124], [930, 122]],
    wlLurk: 46, wlUp: 150
  };
  const PY = { k: 0.31, anchor: [214, 62], snout: [45, 279], warpFrom: 130 };       // python.webp 420 x 333, head lower-left
  const BOAR = { k: 0.245, legs: 0.62 };                                               // boar.webp 420 x 317, faces left
  const BIRD = {
    eagle: {                             // eagle.webp 700 x 440 (polys in 1376-px space), faces right, diving pose
      k: 0.27, src: 1376, faceRight: true, talon: [950, 790], body: [800, 560],
      far: { pivot: [650, 430], poly: [[0, 0], [760, 0], [760, 330], [700, 420], [600, 500], [470, 560], [260, 470], [0, 330]] },
      near: { pivot: [880, 395], poly: [[760, 0], [1376, 0], [1376, 360], [1010, 420], [900, 430], [810, 380], [760, 330]] }
    },
    vulture: {                           // vulture.webp 760 x 306 (polys in 1400-px space), faces left, gliding
      k: 0.29, src: 1400, faceRight: false, talon: [760, 470], body: [760, 400],
      far: { pivot: [740, 330], poly: [[640, 0], [1400, 0], [1400, 210], [1010, 270], [820, 318], [660, 330]] },
      near: { pivot: [520, 395], poly: [[0, 270], [470, 250], [535, 330], [500, 470], [390, 572], [0, 572]] }
    }
  };

  const WATER_FS = `
uniform sampler2D u_bg; uniform vec4 u_map; uniform vec2 u_rect; uniform float u_wx;
void main(){
  vec2 lp = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  vec2 sp = u_rect + lp;
  float t = u_time, wx = lp.x + u_wx, d = lp.y;
  float n1 = fbm(vec2(wx * 0.010 + t * 0.10, d * 0.035 - t * 0.22));
  float n2 = noise(vec2(wx * 0.045 - t * 0.6, d * 0.16 + t * 0.4));
  vec2 dist = vec2((n1 - 0.5) * 20.0, (n2 - 0.5) * 7.0) * (0.35 + 0.65 * smoothstep(0.0, 50.0, d));
  vec2 rp = vec2(sp.x + dist.x, u_rect.y - d * 0.92 - 4.0 + dist.y);
  vec3 refl = texture2D(u_bg, clamp(vec2((rp.x - u_map.x) / u_map.z, (rp.y - u_map.y) / u_map.w), 0.002, 0.998)).rgb;
  float deep = smoothstep(0.0, 200.0, d);
  vec3 water = mix(vec3(0.15, 0.22, 0.16), vec3(0.015, 0.045, 0.03), deep);
  float fres = 1.0 - smoothstep(0.0, 120.0, d);
  vec3 col = mix(water, refl * vec3(0.70, 0.84, 0.76), fres * 0.66);
  float g = pow(noise(vec2(wx * 0.07 - t * 0.9, d * 0.45 + t * 0.7)), 9.0);
  col += vec3(0.85, 0.95, 0.80) * g * 2.6 * (1.0 - deep);
  col += pow(1.0 - abs(sin(wx * 0.028 + n1 * 4.0 + t * 0.7)), 14.0) * 0.10 * (1.0 - deep);
  col += vec3(0.55, 0.65, 0.55) * smoothstep(3.5, 0.0, d) * 0.55;
  gl_FragColor = vec4(col, mix(0.66, 0.97, smoothstep(0.0, 150.0, d)));
}`;

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
  const smooth = k => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const offRes = () => {
    const app = document.getElementById('app');
    const s = app ? app.getBoundingClientRect().width / 390 : 1;
    return Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * s));
  };
  function canvas(w, h, R) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * R); c.height = Math.ceil(h * R);
    const g = c.getContext('2d'); g.scale(R, R);
    return { cv: c, g, w, h };
  }
  function polyPath(g, pts, s) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] * s, p[1] * s) : g.moveTo(p[0] * s, p[1] * s))); g.closePath(); }

  DABWorlds.register('animal', {
    title: 'Animal World', opaque: true, hero: 'day', color: '150,215,110',
    subtitle: r => /croc/i.test(r || '') ? 'The crocodile dragged you deep into the wild.'
      : /snake/i.test(r || '') ? 'The snake\'s bite pulled you into the wild.' : 'You were dragged into the wild.',
    hint: 'Fight your way to the lotus gate',
    howto: ['◀ ▶ move · ⤒ jump · ⚔ slash (tap again to combo)', '» dash dodges any attack', 'Eagle got you? Tap ⚔ fast to break free'],
    controls: { dirs: 'lr', buttons: [{ id: 'attack', icon: 'sword' }, { id: 'jump', icon: 'jump' }, { id: 'special', icon: 'dash' }] },
    assets: {
      far: A + 'bg_far.webp', mid: A + 'bg_mid.webp', bark: A + 'bark.webp', litter: A + 'litter.webp',
      croc: A + 'croc.webp', boar: A + 'boar.webp', eagle: A + 'eagle.webp', vulture: A + 'vulture.webp',
      python: A + 'python.webp', lotus: A + 'lotus.webp', fern: A + 'fern.webp'
    },
    create(env) { return makeWorld(env); }
  });

  function makeWorld(env) {
    const { W, H, TAU, clamp, lerp, rand } = env;
    const img = env.assets;
    const R = offRes();
    const waterProg = env.shader(WATER_FS);
    const fx = env.fx;
    let T = 0;

    // ── pre-rendered pieces ────────────────────────────────────────────────
    const grass = makeGrass(R);
    // only the variants the level uses, capped at 1.5x (each tall tree canvas is several MB)
    const treeCache = {};
    const treeFor = (v, snake) => treeCache[v + (snake ? 's' : '')] || (treeCache[v + (snake ? 's' : '')] = makeTree(v, snake, Math.min(R, 1.5)));
    TREES.forEach(t => treeFor(t.v, t.snake));
    const bgTreeArt = [0, 1, 2].map(v => fogged(makeTree(v, false, 1), 0.62, [74, 98, 82], 0.58));
    const bgTreeArt2 = [1, 3].map(v => fogged(makeTree(v, false, 1), 0.45, [104, 128, 112], 0.72));
    const leafArt = [0, 1, 2].map(v => makeLeaf(v, R));
    const rays = makeRays();
    const mist = makeMist();
    const vignette = makeVignette();
    const stoneArt = [0, 1, 2].map(v => makeStone(v, R));
    const logArt = makeLog(R);
    const birdParts = { eagle: splitBird(img.eagle, BIRD.eagle), vulture: splitBird(img.vulture, BIRD.vulture) };
    let litterPat = null, litterTried = false;
    function litterFor(c) {
      if (litterTried) return litterPat;
      litterTried = true;
      try {
        litterPat = img.litter ? c.createPattern(img.litter, 'repeat') : null;
        if (litterPat && litterPat.setTransform && window.DOMMatrix) litterPat.setTransform(new DOMMatrix().scale(0.55));
      } catch (e) { litterPat = null; }
      return litterPat;
    }
    const crocTint = tinted(img.croc, [10, 40, 30], 0.55);
    const ferns = [];
    { const r = rng(7); for (let x = 60; x < END + 300; x += 70 + r() * 150) if (!gapAt(x, 30)) ferns.push({ x, s: 0.2 + r() * 0.17, f: r() < 0.5 ? -1 : 1, d: r() < 0.3 }); }
    const rocks = [];
    { const r = rng(11); for (let x = 300; x < END; x += 260 + r() * 420) if (!gapAt(x, 50)) rocks.push({ x, s: 0.5 + r() * 0.6, v: (r() * 3) | 0 }); }
    const bgTrees = [];
    { const r = rng(3); for (let x = -100; x < END * 0.62 + W + 200; x += 120 + r() * 150) bgTrees.push({ x, v: (r() * 3) | 0, s: 0.85 + r() * 0.35, f: r() < 0.5 }); }
    const bgTrees2 = [];
    { const r = rng(5); for (let x = -100; x < END * 0.45 + W + 200; x += 90 + r() * 120) bgTrees2.push({ x, v: (r() * 2) | 0, s: 0.75 + r() * 0.3, f: r() < 0.5 }); }
    const fgLeaves = [];
    { const r = rng(9); for (let x = 200; x < END * 1.25 + W; x += 330 + r() * 420) fgLeaves.push({ x, v: (r() * 3) | 0, top: true, s: 0.75 + r() * 0.45, f: r() < 0.5 }); }
    const motes = Array.from({ length: 34 }, () => ({ x: rand(0, W), y: rand(80, 600), z: rand(0.4, 1.3), ph: rand(0, TAU) }));

    // ── state ──────────────────────────────────────────────────────────────
    const hero = {
      x: START_X || 110, y: GROUND, vx: 0, vy: 0, ground: true, face: 1, phase: 0, run: 0,
      atk: 0, atkT: 0, atkStep: 0, atkQ: false, hitSet: new Set(), air: false,
      dashT: 0, dashCD: 0, hurtT: 0, coyote: 0, jumpBuf: 0, carried: null, lastSafe: START_X || 110,
      fallFrom: null, plungeT: 0, trail: [], landT: 0, plat: null
    };
    let camX = Math.max(0, hero.x - W * 0.34), camY = 0, won = false, winT = 0;
    const enemies = [];
    TREES.forEach(t => { if (t.snake) enemies.push(makeSnake(t.x - BRANCH_LEN + 20, BRANCH_Y)); });
    GAPS.forEach((g, i) => {
      if (i === 1) { enemies.push(makeCroc(g[0] + 40, g[0] + 230)); enemies.push(makeCroc(g[0] + 230, g[1] - 40)); }
      else enemies.push(makeCroc(g[0] + 30, g[1] - 30));
    });
    BOARS.forEach(x => enemies.push(makeBoar(x)));
    BIRDS.forEach(b => enemies.push(makeBird(b.kind, b.at)));
    const blooms = BLOOMS.map(x => ({ x, y: GROUND - 58, got: false, t: Math.random() * 6 }));
    const arenas = ARENAS.map(a => Object.assign({}, a, { st: a.at < hero.x ? 'clear' : 'wait', members: [], t: 0, banner: 0, go: 0, left: 0, extra: a.extra.map(e => Object.assign({}, e)) }));
    let arena = null;
    function updateArenas(dt) {
      for (const a of arenas) {
        if (a.st === 'wait' && hero.x > a.at && !hero.carried && hero.ground) {
          a.st = 'fight'; arena = a; a.t = 0; a.banner = 1.5;
          a.members = enemies.filter(e => e.type === 'boar' && !e.dead && e.x > a.cam - 20 && e.x < a.cam + W + 60);
          a.members.forEach(e => { e.seg = [a.cam + 14, a.cam + W - 14]; e.cd = Math.min(e.cd, 0.6); });
          env.shake(0.3);
        }
        if (a.st !== 'fight') { if (a.go > 0) a.go -= dt; continue; }
        a.t += dt; a.banner = Math.max(0, a.banner - dt);
        for (const ex of a.extra) if (!ex.done && a.t > ex.delay) {
          ex.done = true;
          const b = makeBoar(ex.side > 0 ? a.cam + W + 60 : a.cam - 60);
          b.seg = [a.cam - 80, a.cam + W + 80]; b.face = -ex.side; b.st = 'notice'; b.t = 0.35; b.cd = 0; b.entering = true;
          enemies.push(b); a.members.push(b);
        }
        for (const e of a.members) if (e.entering && e.x > a.cam + 30 && e.x < a.cam + W - 30) { e.entering = false; e.seg = [a.cam + 14, a.cam + W - 14]; }
        a.left = a.members.filter(e => !e.dead && e.st !== 'die').length + a.extra.filter(ex => !ex.done).length;
        if (a.left === 0) {
          a.st = 'clear'; a.go = 3.5; arena = null;
          env.floatText(W / 2, 320, 'Clear!', '200,255,170'); env.flash('220,255,200', 0.15);
        }
      }
    }
    PLATS.forEach(p => { p.x0 = p.x; p.bob = 0; p.v = (p.x * 7) % 3; });

    // ── terrain queries ────────────────────────────────────────────────────
    function gapAt(x, m) { m = m || 0; for (const g of GAPS) if (x > g[0] - m && x < g[1] + m) return g; return null; }
    function platTop(p) { return (p.kind === 'log' ? 610 : 598) + p.bob; }
    // highest walkable surface under x that the feet can reach from prevY
    function support(x, prevY) {
      let best = null;
      if (!gapAt(x)) best = { y: GROUND, p: null };
      for (const p of PLATS) {
        if (Math.abs(x - p.x) < p.w / 2 - 2) {
          const top = platTop(p);
          if (prevY <= top + 3 && (!best || top < best.y)) best = { y: top, p };
        }
      }
      return best;
    }

    // ── hero ───────────────────────────────────────────────────────────────
    const ATK_DUR = [0.27, 0.27, 0.40];
    function hurtHero(n, fromX, kb, text) {
      if (GOD || won) return false;
      const ok = env.damage(n, { x: hero.x - camX, y: hero.y - 92 - camY, text: text || `-${Math.round(n)}`, invuln: 0.85 });
      if (!ok) return false;
      if (kb && !hero.carried) {
        hero.hurtT = 0.32; hero.vx = Math.sign(hero.x - fromX || -1) * kb; hero.vy = -230; hero.ground = false;
        hero.atk = 0; hero.dashT = 0;
      }
      fx.burst(hero.x, hero.y - 50, { n: 10, speed: 160, rgb: '255,120,110', kind: 'spark', life: 0.4, size: 2.4 });
      return true;
    }
    function startAttack(step) {
      hero.atk = 1; hero.atkStep = step; hero.atkT = 0; hero.atkQ = false; hero.hitSet.clear();
      if (hero.ground) hero.vx += hero.face * (step === 3 ? 210 : 110);
    }
    function swordHits() {
      const s3 = hero.atkStep === 3;
      const cx = hero.x + hero.face * 42, cy = hero.y - 56, r = s3 ? 64 : 55;
      for (const e of enemies) {
        if (e.dead || hero.hitSet.has(e)) continue;
        const boxes = e.boxes();
        for (const b of boxes) {
          if (Math.hypot(b.x - cx, b.y - cy) < b.r + r) {
            hero.hitSet.add(e);
            const px = (b.x + cx) / 2, py = (b.y + cy) / 2;
            e.hurt(s3 ? 2 : 1, hero.face);
            env.hitstop(s3 ? 0.11 : 0.06); env.shake(s3 ? 0.32 : 0.18);
            fx.burst(px, py, { n: s3 ? 18 : 11, speed: s3 ? 300 : 220, rgb: '255,240,200', kind: 'spark', life: 0.32, size: 2.6 });
            fx.spawn({ x: px, y: py, kind: 'ring', size: 6, grow: 180, life: 0.25, rgb: '255,250,220' });
            fx.spawn({ x: px, y: py, kind: 'glow', size: s3 ? 13 : 9, life: 0.16, rgb: '255,250,230' });
            break;
          }
        }
      }
    }
    function plunge() {
      hero.plungeT = 0.75; hero.vx = 0; hero.vy = 0; hero.atk = 0; hero.fallFrom = null;
      splash(hero.x, WATER, true);
      hurtHero(10, hero.x, 0, 'Splash! -10');
    }
    function splash(x, y, big) {
      const n = big ? 26 : 10;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = (big ? 380 : 220) * (0.35 + Math.random() * 0.8);
        fx.spawn({ x: x + rand(-14, 14), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1100, kind: 'glow', size: rand(1.6, 3.2), life: rand(0.5, 0.9), rgb: '190,225,215', drag: 0.4 });
      }
      fx.spawn({ x, y: y + 2, kind: 'ring', size: 8, grow: 140, life: 0.6, rgb: '200,235,225' });
      fx.spawn({ x, y: y + 2, kind: 'ring', size: 4, grow: 90, life: 0.8, rgb: '200,235,225' });
    }
    function dust(x, y, n, dir) {
      for (let i = 0; i < n; i++) fx.spawn({ x: x + rand(-8, 8), y: y - rand(0, 6), vx: (dir || 0) * rand(20, 90) + rand(-30, 30), vy: -rand(10, 50), kind: 'smoke', size: rand(6, 11), grow: 26, life: rand(0.4, 0.7), rgb: '120,105,80', alpha: 0.55, drag: 2 });
    }

    function updateHero(dt, I) {
      const h = hero;
      if (h.dashCD > 0) h.dashCD -= dt;
      if (h.landT > 0) h.landT -= dt;
      if (h.carried) { h.trail.length = 0; return; }
      if (h.plungeT > 0) {
        h.plungeT -= dt;
        if (h.plungeT <= 0) {
          h.x = h.lastSafe; h.y = GROUND; h.vy = 0; h.vx = 0; h.ground = true; h.plat = null;
          env.invuln(1.1); fx.burst(h.x, h.y - 40, { n: 14, speed: 120, rgb: env.charRgb, kind: 'glow', life: 0.6, size: 2 });
        }
        return;
      }
      let mv = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      if (h.hurtT > 0) { h.hurtT -= dt; mv = 0; }
      // dash (brief invulnerability)
      if (I.pressed.special && h.dashCD <= 0 && h.hurtT <= 0) {
        h.dashT = 0.22; h.dashCD = 0.7; if (mv) h.face = mv; h.vx = h.face * 440; h.atk = 0;
        env.invuln(0.32); dust(h.x, h.y, 5, -h.face);
      }
      if (h.dashT > 0) {
        h.dashT -= dt;
        if (Math.random() < 0.6) fx.spawn({ x: h.x - h.face * 10, y: h.y - rand(10, 60), vx: -h.face * 60, kind: 'glow', size: 3, life: 0.3, rgb: env.charRgb });
        if (h.dashT <= 0) h.vx *= 0.4;
      } else {
        const maxV = (h.atk && h.ground ? 0.32 : 1) * 188;
        h.vx = approach(h.vx, mv * maxV, (h.ground ? 1500 : 950) * dt);
        if (mv && !h.atk && h.hurtT <= 0) h.face = mv;
      }
      // jump (buffer + coyote + variable height)
      h.jumpBuf = I.pressed.jump ? 0.13 : h.jumpBuf - dt;
      h.coyote = h.ground ? 0.1 : h.coyote - dt;
      if (h.jumpBuf > 0 && h.coyote > 0 && h.hurtT <= 0) {
        h.vy = -650; h.ground = false; h.coyote = 0; h.jumpBuf = 0; h.plat = null; dust(h.x, h.y, 4, 0);
      }
      if (I.released.jump && h.vy < -430) h.vy = -430;   // a quick tap still clears a gap
      // attack chain
      if (I.pressed.attack && h.hurtT <= 0) {
        if (!h.atk) startAttack(1);
        else if (h.atkT > ATK_DUR[h.atkStep - 1] * 0.32) h.atkQ = true;
      }
      if (h.atk) {
        h.atkT += dt;
        const dur = h.ground ? ATK_DUR[h.atkStep - 1] : 0.3;
        const k = h.atkT / dur;
        if (k > 0.28 && k < 0.66) swordHits();
        if (k >= 1) { if (h.atkQ && h.atkStep < 3) startAttack(h.atkStep + 1); else { h.atk = 0; h.atkStep = 0; } }
      }
      // physics
      h.vy += (h.vy > 0 ? 1900 : 1650) * dt;
      const prevY = h.y;
      h.x += h.vx * dt;
      if (h.plat && h.ground && h.plat.kind === 'log') h.x += h.plat.dx || 0;
      h.x = Math.max(h.x, camX + 14, 20);
      if (arena) h.x = clamp(h.x, arena.cam + 14, arena.cam + W - 16);
      if (won) h.x = Math.min(h.x, END + 70);
      let ny = h.y + h.vy * dt;
      const s = support(h.x, prevY);
      if (s && h.vy >= 0 && ny >= s.y - 0.5 && prevY <= s.y + 3) {
        if (!h.ground) land(s);
        h.y = s.y; h.vy = 0; h.ground = true; h.plat = s.p;
        if (!s.p) {
          // respawn spot: here, but never right on a bank's edge
          let safe = clamp(h.x, 40, END);
          for (const g of GAPS) { if (safe > g[0] - 60 && safe <= g[0]) safe = g[0] - 60; if (safe >= g[1] && safe < g[1] + 30) safe = g[1] + 30; }
          h.lastSafe = safe;
        } else if (s.p.kind === 'stone') h.lastSafe = s.p.x;
      } else {
        if (h.ground && h.vy >= 0 && !s) h.coyote = 0.1;
        h.ground = false; h.y = ny; h.plat = null;
      }
      if (!h.ground && h.y > WATER + 8) {
        if (gapAt(h.x)) plunge();
        else { h.y = GROUND; h.vy = 0; h.ground = true; land({ y: GROUND, p: null }); }   // failsafe: never below solid ground
      }
      // run cycle
      const sp = Math.abs(h.vx);
      h.run = lerp(h.run, h.ground ? clamp(sp / 188, 0, 1) : 0, 1 - Math.exp(-dt * 12));
      h.phase += dt * (5 + 7 * h.run) * (h.run > 0.05 ? 1 : 0);
      h.runClock = (h.runClock || 0) + dt * clamp(sp / 188, 0.45, 1.25);   // sprite run cycle keeps pace with the feet
      if (h.ground && h.run > 0.6 && Math.random() < dt * 6) dust(h.x - h.face * 6, h.y, 1, -h.face);
      // afterimages while dashing
      if (h.dashT > 0) { h.trail.push({ x: h.x, y: h.y, a: 0.45 }); }
      for (let i = h.trail.length - 1; i >= 0; i--) { h.trail[i].a -= dt * 2.4; if (h.trail[i].a <= 0) h.trail.splice(i, 1); }
    }
    function land(s) {
      const h = hero;
      h.landT = 0.18;
      dust(h.x, s.y, h.vy > 700 ? 8 : 3, 0);
      if (s.p && s.p.kind === 'log') { s.p.kick = 4; splash(h.x, WATER - 2, false); }
      if (h.fallFrom !== null) {
        const height = s.y - h.fallFrom;
        h.fallFrom = null;
        const dmg = clamp((height - 80) * 0.075, 0, 42);
        env.shake(clamp(height / 600, 0.25, 0.8));
        dust(h.x, s.y, 12, 0);
        fx.spawn({ x: h.x, y: s.y, kind: 'ring', size: 10, grow: 220, life: 0.45, rgb: '230,220,190' });
        if (dmg >= 1) {
          if (!GOD) env.damage(dmg, { x: h.x - camX, y: h.y - 100 - camY, text: `Fall -${Math.round(dmg)}`, invuln: 0.6 });
          h.hurtT = 0.4;
        }
      }
    }

    // ── enemies ────────────────────────────────────────────────────────────
    function makeBoar(x) {
      const seg = GAPS.reduce((acc, g) => (g[1] < x ? [g[1] + 20, acc[1]] : g[0] > x && g[0] < acc[1] ? [acc[0], g[0] - 20] : acc), [0, END + 400]);
      return {
        type: 'boar', x, y: GROUND, face: -1, vx: 0, st: 'idle', t: 0, hp: 3, cd: 0.6 + Math.random(), flash: 0, ph: Math.random() * 6, seg, rot: 0, fade: 1, travel: 0,
        boxes() { return this.dead ? [] : [{ x: this.x, y: this.y - 36, r: 40 }]; },
        hurt(n, dir) {
          if (this.st === 'die') return;
          this.hp -= n; this.flash = 1; this.vx = dir * (n > 1 ? 330 : 200); this.st = 'stagger'; this.t = n > 1 ? 0.5 : 0.32;
          if (this.hp <= 0) { this.st = 'die'; this.t = 0; dust(this.x, this.y, 10, dir); env.floatText(this.x - camX, this.y - 90 - camY, 'Boar down!', '255,230,160'); }
        },
        update(dt) {
          this.t -= dt; this.flash = Math.max(0, this.flash - dt * 5); this.cd -= dt;
          const dx = hero.x - this.x, near = Math.abs(dx) < 300 && Math.abs(hero.y - this.y) < 120 && !hero.carried;
          if (this.st === 'die') {                 // legs buckle, nose drops, it slumps and fades
            this.rot = Math.min(1, this.rot + dt * 4); this.vx *= Math.pow(0.02, dt); this.x += this.vx * dt;
            if (this.rot >= 1) { this.fade -= dt * 0.8; if (this.fade <= 0) this.dead = true; }
            return;
          }
          if (this.st === 'idle') {
            this.vx = approach(this.vx, 0, 600 * dt); this.ph += dt * 1.4;
            if (near) this.face = Math.sign(dx) || this.face;
            if (near && this.cd <= 0) { this.st = 'notice'; this.t = Math.abs(dx) > 70 ? 0.62 : 0.4; }
          } else if (this.st === 'notice') {
            this.ph += dt * 9;
            if (Math.random() < dt * 14) fx.spawn({ x: this.x + this.face * 44, y: this.y - 30, vx: this.face * 40, vy: -20, kind: 'smoke', size: 4, grow: 20, life: 0.5, rgb: '220,220,210', alpha: 0.4 });
            if (Math.random() < dt * 10) dust(this.x - this.face * 20, this.y, 1, -this.face);
            if (this.t <= 0) { this.st = 'charge'; this.travel = 0; }
          } else if (this.st === 'charge') {
            this.vx = approach(this.vx, this.face * 335, 1400 * dt); this.ph += dt * 15; this.travel += Math.abs(this.vx) * dt;
            if (Math.random() < dt * 18) dust(this.x - this.face * 30, this.y, 1, -this.face);
            if (Math.abs(hero.x - this.x) < 46 && hero.y > this.y - 70 && hero.plungeT <= 0) {
              if (hurtHero(9, this.x, 320)) env.shake(0.4);
              this.st = 'skid'; this.t = 0.5;
            }
            if (this.travel > 330 || (this.face > 0 ? this.x > this.seg[1] - 30 : this.x < this.seg[0] + 30)) { this.st = 'skid'; this.t = 0.5; }
          } else if (this.st === 'skid' || this.st === 'stagger') {
            this.vx = approach(this.vx, 0, (this.st === 'skid' ? 900 : 1100) * dt); this.ph += dt * 6;
            if (this.st === 'skid' && Math.random() < dt * 20) dust(this.x + this.face * 20, this.y, 1, this.face);
            if (this.t <= 0) { this.st = 'idle'; this.cd = 0.9 + Math.random() * 0.6; this.face = Math.sign(hero.x - this.x) || this.face; }
          }
          this.x = clamp(this.x + this.vx * dt, this.seg[0], this.seg[1]);
        },
        draw(c) { drawBoar(c, this); }
      };
    }

    function makeSnake(x, by) {
      return {
        type: 'snake', x, y: by, st: 'idle', t: 0, hp: 2, cd: 0.4, flash: 0, ext: 0, rear: 0, aim: { x: 0, y: 0 }, tongue: 0,
        fall: null, fade: 1, sway: Math.random() * 6,
        snout() {
          const k = PY.k, sx = this.x + (PY.snout[0] - PY.anchor[0]) * k, sy = this.y + (PY.snout[1] - PY.anchor[1]) * k;
          return { x: sx + this.aim.x * this.ext - 10 * this.rear, y: sy + this.aim.y * this.ext - 14 * this.rear };
        },
        boxes() {
          if (this.dead || this.fall) return [];
          const s = this.snout();
          return [{ x: s.x + 12, y: s.y - 10, r: 24 }, { x: this.x - 8, y: this.y + 50, r: 28 }];
        },
        hurt(n, dir) {
          if (this.fall) return;
          this.hp -= n; this.flash = 1; this.rear = Math.min(1, this.rear + 0.6);
          if (this.st === 'strike' || this.st === 'coil') { this.st = 'hold'; this.t = 0.4; }
          if (this.hp <= 0) {
            this.fall = { x: this.x, y: this.y, vx: dir * 70, vy: -80, rot: 0, vr: dir * 2.4, ground: false };
            env.floatText(this.x - camX, this.y + 60 - camY, 'Snake down!', '255,230,160');
          }
        },
        update(dt) {
          this.t -= dt; this.cd -= dt; this.flash = Math.max(0, this.flash - dt * 5); this.sway += dt;
          this.tongue = Math.max(0, this.tongue - dt);
          if (this.fall) {
            const f = this.fall;
            this.ext = approach(this.ext, 0, dt * 4); this.rear = approach(this.rear, 0, dt * 4);
            if (!f.ground) {
              f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
              if (f.y > GROUND - 110) { f.ground = true; f.y = GROUND - 110; dust(f.x, GROUND, 8, 0); env.shake(0.15); }
            } else { this.fade -= dt * 0.7; if (this.fade <= 0) this.dead = true; }
            return;
          }
          const s0 = this.snout();
          const tx = hero.x, ty = hero.y - 50, dx = tx - s0.x;
          const inRange = Math.abs(hero.x - (this.x - 30)) < 175 && !hero.carried && hero.plungeT <= 0;
          if (Math.random() < dt * (this.st === 'coil' ? 9 : 0.9)) this.tongue = 0.22;
          if (this.st === 'idle') {
            this.ext = approach(this.ext, 0, dt * 3); this.rear = approach(this.rear, 0, dt * 2);
            if (inRange && this.cd <= 0) { this.st = 'coil'; this.t = 0.55; }
          } else if (this.st === 'coil') {
            this.rear = approach(this.rear, 1, dt * 3.5);
            if (this.t <= 0) {
              const ex = clamp(dx + hero.vx * 0.1, -125, 125), ey = clamp(ty - (s0.y + 14 * this.rear), -40, 95);
              const m = Math.hypot(ex, ey) || 1, L = Math.min(m, 128);
              this.aim = { x: ex / m * L, y: ey / m * L }; this.ext = 0; this.st = 'strike'; this.t = 0.15; this.hitDone = false;
            }
          } else if (this.st === 'strike') {
            this.ext = 1 - Math.max(0, this.t) / 0.15; this.rear = approach(this.rear, 0, dt * 9);
            const s = this.snout();
            if (!this.hitDone && this.ext > 0.7 && Math.hypot(s.x - hero.x, s.y - (hero.y - 48)) < 36) {
              this.hitDone = true; hurtHero(7, this.x, 230, 'Bitten! -7');
            }
            if (this.t <= 0) { this.st = 'hold'; this.t = 0.55; }
          } else if (this.st === 'hold') {
            this.ext = approach(this.ext, 0.75, dt * 2);
            if (this.t <= 0) { this.st = 'back'; this.t = 0.35; }
          } else if (this.st === 'back') {
            this.ext = approach(this.ext, 0, dt * 3.4);
            if (this.ext <= 0) { this.st = 'idle'; this.cd = 1.1; this.aim = { x: 0, y: 0 }; }
          }
        },
        draw(c) { drawSnake(c, this); }
      };
    }

    function makeCroc(x0, x1) {
      return {
        type: 'croc', x: (x0 + x1) / 2, x0, x1, face: -1, st: 'lurk', t: 0, hp: 4, cd: 1.2, flash: 0, rise: 0, jaw: 0.05,
        roll: 0, sinkY: 0, ph: Math.random() * 6, vx: 0,
        pitch() {                                   // head rears out of the water when it strikes
          const lunge = this.st === 'lunge' ? Math.sin(Math.min(1, 1 - this.t / 0.26) * Math.PI) : 0;
          return this.st === 'die' ? 0 : this.rise * 0.13 + lunge * 0.24;
        },
        head() {
          const d = (CROC.snout[0] - 600) * CROC.k * 0.82, p = this.pitch();
          return { x: this.x + this.face * d * Math.cos(p), y: WATER - 12 * this.rise - Math.sin(p) * d };
        },
        boxes() {
          if (this.dead || this.st === 'die' || this.rise < 0.5) return [];
          const hd = this.head();
          return [{ x: hd.x, y: hd.y - 4, r: 30 }, { x: this.x, y: WATER - 6, r: 40 }];
        },
        hurt(n, dir) {
          if (this.st === 'die') return;
          this.hp -= n; this.flash = 1; this.jaw = 0.5;
          splash(this.head().x, WATER, false);
          if (this.st === 'rise' || this.st === 'lunge') { this.st = 'exposed'; this.t = 0.8; }
          if (this.hp <= 0) { this.st = 'die'; this.t = 0; env.floatText(this.x - camX, WATER - 60 - camY, 'Croc down!', '255,230,160'); }
        },
        update(dt) {
          this.t -= dt; this.cd -= dt; this.flash = Math.max(0, this.flash - dt * 5); this.ph += dt;
          const hd = this.head();
          const heroNear = hero.x > this.x0 - 90 && hero.x < this.x1 + 90 && hero.y > GROUND - 70 && !hero.carried && hero.plungeT <= 0;
          if (this.st === 'die') {
            this.roll = Math.min(1, this.roll + dt * 1.2); this.rise = Math.max(0, this.rise - dt * 0.5); this.sinkY += dt * 14;
            if (Math.random() < dt * 14) fx.spawn({ x: this.x + rand(-60, 60), y: WATER + 4, vy: -30, kind: 'glow', size: 2, life: 0.6, rgb: '200,240,230' });
            if (this.sinkY > 40) this.dead = true;
            return;
          }
          if (this.st === 'lurk') {
            this.rise = approach(this.rise, 0, dt * 1.5); this.jaw = approach(this.jaw, 0.05, dt);
            const lo = this.x0 + 60, hi = this.x1 - 60;
            const target = heroNear ? clamp(hero.x - this.face * 125, lo, hi) : lo + (hi - lo) * (0.5 + 0.5 * Math.sin(this.ph * 0.35));
            this.vx = approach(this.vx, clamp((target - this.x) * 1.2, -60, 60), 90 * dt);
            this.x += this.vx * dt;
            if (heroNear) this.face = hero.x > this.x ? 1 : -1;
            else if (Math.abs(this.vx) > 6) this.face = Math.sign(this.vx);
            if (Math.random() < dt * 2.5) fx.spawn({ x: hd.x - this.face * 8, y: WATER, kind: 'ring', size: 3, grow: 26, life: 0.9, rgb: '210,235,225' });
            if (heroNear && this.cd <= 0 && Math.abs(hero.x - hd.x) < 120) { this.st = 'rise'; this.t = 0.62; splash(hd.x, WATER, false); }
          } else if (this.st === 'rise') {
            this.rise = approach(this.rise, 1, dt * 2.4); this.jaw = approach(this.jaw, 0.62, dt * 1.4);
            this.face = hero.x > this.x ? 1 : -1;
            if (Math.random() < dt * 20) fx.spawn({ x: hd.x + rand(-20, 20), y: WATER, vy: -rand(20, 60), kind: 'glow', size: 2, life: 0.4, rgb: '210,240,230' });
            if (this.t <= 0) { this.st = 'lunge'; this.t = 0.26; this.hitDone = false; }
          } else if (this.st === 'lunge') {
            this.x = clamp(this.x + this.face * 290 * dt, this.x0 + 20, this.x1 - 20);
            const k = 1 - Math.max(0, this.t) / 0.26;
            this.jaw = k < 0.65 ? 0.75 : approach(this.jaw, 0, dt * 14);
            if (!this.hitDone && k > 0.65) {
              this.hitDone = true;
              const h2 = this.head();
              env.shake(0.22); splash(h2.x, WATER, false);
              if (Math.abs(hero.x - h2.x) < 52 && hero.y > WATER - 110 && hero.y < WATER + 20) hurtHero(12, this.x, 280, 'Chomp! -12');
            }
            if (this.t <= 0) { this.st = 'exposed'; this.t = 1.35; }
          } else if (this.st === 'exposed') {
            this.jaw = approach(this.jaw, 0.08, dt * 2);
            if (this.t <= 0) { this.st = 'sink'; this.t = 0.6; }
          } else if (this.st === 'sink') {
            this.rise = approach(this.rise, 0, dt * 2);
            if (this.t <= 0) { this.st = 'lurk'; this.cd = 1.5; }
          }
        },
        drawUnder(c) { drawCroc(c, this, 'under'); },
        draw(c) { drawCroc(c, this, 'over'); }
      };
    }

    function makeBird(kind, at) {
      const B = BIRD[kind];
      return {
        type: 'bird', kind, at, B, st: 'wait', t: 0, hp: 2, x: 0, y: 0, vx: 0, vy: 0, dir: -1, flap: Math.random() * 6, flash: 0,
        dives: 0, grip: 5, carryT: 0, tick: 0, rot: 0, cx: 0, cy: 0,
        talonPt() { const s = B.k * 700 / B.src; const fr = (B.faceRight ? 1 : -1) * this.flipDir(); return { x: this.x + (B.talon[0] - B.src / 2) * s * fr * (kind === 'eagle' ? 1 : 1), y: this.y + (B.talon[1] - (B.src * this.aspect()) / 2) * s }; },
        aspect() { return kind === 'eagle' ? 440 / 700 : 306 / 760; },
        flipDir() { return this.dir > 0 ? 1 : -1; },
        boxes() { return this.dead || this.st === 'wait' || this.st === 'falling' || this.st === 'flee' ? [] : [{ x: this.x, y: this.y, r: 34 }]; },
        hurt(n, dir) {
          if (this.st === 'carry') return;
          this.hp -= n; this.flash = 1; feathers(this.x, this.y, 12);
          if (this.hp <= 0) { this.st = 'falling'; this.vx = dir * 120; this.vy = -120; env.floatText(this.x - camX, this.y - 40 - camY, 'Bird down!', '255,230,160'); }
          else { this.st = 'recoil'; this.t = 0.7; this.vx = dir * 260; this.vy = -360; }
        },
        update(dt) {
          this.t -= dt; this.flash = Math.max(0, this.flash - dt * 5);
          const fspd = this.st === 'carry' ? 10 : this.st === 'dive' ? 3 : kind === 'vulture' ? 4 : 6.5;
          this.flap += dt * fspd;
          if (this.st === 'wait') { if (hero.x > this.at) { this.st = 'circle'; this.t = 1.9; this.x = camX + W + 120; this.y = 70; this.dir = -1; this.screech = 1; } return; }
          if (this.screech > 0) this.screech -= dt;
          if (this.st === 'circle') {
            const tx = hero.x + 110 + Math.sin(T * 1.2 + this.at) * 70, ty = 120 + Math.sin(T * 2.1) * 26;
            this.vx = approach(this.vx, clamp((tx - this.x) * 1.6, -260, 260), 420 * dt);
            this.vy = approach(this.vy, clamp((ty - this.y) * 1.6, -200, 200), 380 * dt);
            this.x += this.vx * dt; this.y += this.vy * dt;
            this.dir = this.vx < -20 ? -1 : this.vx > 20 ? 1 : this.dir;
            if (won) { this.st = 'flee'; return; }
            if (hero.x > END - 260) { this.st = 'flee'; return; }
            if (this.t <= 0 && !hero.carried && hero.plungeT <= 0 && !arena) {
              this.st = 'dive'; this.t = 0; this.u = 0;
              const aimX = hero.x + hero.vx * 0.8;
              this.dir = aimX < this.x ? -1 : 1; this.screech = 0.8;
              const tp = this.talonPt();             // aim the talons, not the body, at the hero's shoulders
              this.p0 = { x: this.x, y: this.y };
              this.p2 = { x: aimX - (tp.x - this.x), y: hero.y - 80 - (tp.y - this.y) };
              this.p1 = { x: (this.p0.x + this.p2.x) / 2 + 40, y: this.p2.y - 40 };
            }
          } else if (this.st === 'dive') {
            this.u += dt / 0.95;
            if (this.u < 0.85) {                     // steer: talons keep tracking the hero's shoulders
              const tp0 = this.talonPt();
              const gx = hero.x + hero.vx * (0.95 - this.u * 0.95) * 0.8 - (tp0.x - this.x), gy = hero.y - 80 - (tp0.y - this.y);
              this.p2.x = lerp(this.p2.x, gx, 1 - Math.exp(-dt * 4)); this.p2.y = lerp(this.p2.y, gy, 1 - Math.exp(-dt * 4));
            }
            const u = Math.min(1, this.u), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), cc = u * u;
            const nx = a * this.p0.x + b * this.p1.x + cc * this.p2.x, ny = a * this.p0.y + b * this.p1.y + cc * this.p2.y;
            this.vx = (nx - this.x) / Math.max(dt, 1e-3); this.vy = (ny - this.y) / Math.max(dt, 1e-3);
            this.x = nx; this.y = ny;
            const tp = this.talonPt();
            if (!won && !hero.carried && hero.fallFrom === null && !env.invulnerable && hero.plungeT <= 0 && Math.hypot(tp.x - hero.x, tp.y - (hero.y - 80)) < 42) this.grab();
            else if (this.u >= 1) { this.st = 'climb'; this.t = 0.9; this.dives++; }
          } else if (this.st === 'climb' || this.st === 'recoil') {
            this.vy = approach(this.vy, -240, 700 * dt); this.vx = approach(this.vx, this.dir * 120, 400 * dt);
            this.x += this.vx * dt; this.y += this.vy * dt;
            if (this.t <= 0 || this.y < 60) { this.st = this.dives >= 3 ? 'flee' : 'circle'; this.t = 2.1; }
          } else if (this.st === 'carry') {
            this.carryT += dt; this.tick -= dt;
            this.vx = approach(this.vx, 78, 300 * dt); this.vy = approach(this.vy, this.y > -230 ? -82 : 0, 200 * dt);
            this.x += this.vx * dt; this.y += this.vy * dt; this.dir = 1;
            let tp = this.talonPt();
            if (tp.y + 80 > GROUND - 4) { this.y -= tp.y + 80 - (GROUND - 4); tp = this.talonPt(); }
            hero.x = tp.x - 4; hero.y = tp.y + 80; hero.vx = this.vx; hero.vy = this.vy;
            if (this.tick <= 0) {
              this.tick = 0.3;
              if (!GOD) env.damage(1.5, { invuln: 0 });
              if (((this.carryT * 10) | 0) % 10 < 3) env.floatText(hero.x - camX + 26, hero.y - 90 - camY, '-1.5', '255,140,120');
            }
            if (Math.random() < dt * 3) feathers(this.x, this.y, 1);
            if (this.carryT > 6.5) this.release(true);
          } else if (this.st === 'flee') {
            this.vx = approach(this.vx, 300, 500 * dt); this.vy = approach(this.vy, -200, 400 * dt); this.dir = 1;
            this.x += this.vx * dt; this.y += this.vy * dt;
            if (this.y < -700 || this.x > camX + W + 400) this.dead = true;
          } else if (this.st === 'falling') {
            this.vy += 1200 * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += dt * 5;
            if (Math.random() < dt * 20) feathers(this.x, this.y, 1);
            if (this.y > GROUND - 20) { this.dead = true; dust(this.x, GROUND, 10, 0); feathers(this.x, GROUND - 20, 14); env.shake(0.2); }
          }
        },
        grab() {
          this.st = 'carry'; this.carryT = 0; this.grip = kind === 'eagle' ? 5 : 4; this.tick = 0.3;
          this.vy = -60; this.vx = 30;                // climb straight away (no leftover dive speed)
          hero.carried = this; hero.atk = 0; hero.dashT = 0; hero.ground = false; hero.plat = null;
          env.shake(0.45); env.flash('255,240,220', 0.25); feathers(this.x, this.y, 10);
          env.floatText(hero.x - camX, hero.y - 120 - camY, 'Grabbed!', '255,200,150');
        },
        mash() {
          this.grip--; this.flash = 1; feathers(this.x, this.y + 10, 5);
          env.hitstop(0.04); env.shake(0.2);
          fx.burst(this.x, this.y + 14, { n: 6, speed: 160, rgb: '255,240,200', kind: 'spark', life: 0.25 });
          this.vy += 40; this.y += 4;
          if (this.grip <= 0) this.release(false);
        },
        release(auto) {
          hero.carried = null; hero.vx = auto ? 40 : -30; hero.vy = auto ? 0 : -120; hero.ground = false; hero.fallFrom = hero.y;
          hero.atk = 0; hero.hurtT = 0.2;
          this.hp -= auto ? 0 : 1;
          feathers(this.x, this.y, 16);
          env.floatText(hero.x - camX, hero.y - 110 - camY, auto ? 'Dropped!' : 'Broke free!', auto ? '255,150,130' : '200,255,170');
          if (this.hp <= 0) { this.st = 'falling'; this.vx = 60; this.vy = -60; }
          else { this.st = 'flee'; }
        },
        draw(c) { drawBird(c, this); }
      };
    }
    function feathers(x, y, n) {
      for (let i = 0; i < n; i++) fx.spawn({ x: x + rand(-20, 20), y: y + rand(-14, 14), vx: rand(-90, 90), vy: rand(-90, 20), g: 90, drag: 2.2, kind: 'debris', size: rand(3, 6), life: rand(0.9, 1.6), rgb: Math.random() < 0.5 ? '120,90,60' : '215,205,190', spin: rand(-6, 6) });
    }

    // ── per-frame update ───────────────────────────────────────────────────
    function update(dt, I) {
      T += dt;
      if (ZOO) { zooUpdate(dt); return; }
      // logs drift + bob
      for (const p of PLATS) {
        const ox = p.x;
        if (p.drift) p.x = p.x0 + Math.sin(T * 0.55 + p.v) * p.drift;
        p.dx = p.x - ox;
        p.kick = Math.max(0, (p.kick || 0) - dt * 14);
        p.bob = Math.sin(T * 1.7 + p.v * 2) * (p.kind === 'log' ? 2.2 : 0.6) + (p.kick || 0);
      }
      if (hero.carried && I.pressed.attack) hero.carried.mash();
      updateArenas(dt);
      updateHero(dt, I);
      for (const e of enemies) {
        if (e.dead) continue;
        const sx = e.x - camX;
        if (e.type === 'bird' || (sx > -420 && sx < W + 420)) e.update(dt);
      }
      for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dead) enemies.splice(i, 1);
      for (const b of blooms) {
        b.t += dt;
        if (!b.got && Math.abs(hero.x - b.x) < 30 && Math.abs(hero.y - 40 - b.y) < 50) {
          b.got = true; env.heal(22);
          env.floatText(b.x - camX, b.y - 30 - camY, '+22', '255,225,120');
          fx.burst(b.x, b.y, { n: 22, speed: 170, rgb: '255,215,110', kind: 'glow', life: 0.7, size: 2.4 });
          fx.spawn({ x: b.x, y: b.y, kind: 'ring', size: 8, grow: 150, life: 0.5, rgb: '255,225,140' });
        }
      }
      // camera
      const tx = arena ? arena.cam : clamp(hero.x - W * (hero.face > 0 ? 0.34 : 0.5), 0, END + 160 - W * 0.62);
      camX = lerp(camX, tx, 1 - Math.exp(-dt * 5));
      camX = Math.max(camX, 0);
      const ty = Math.min(0, hero.y - 330);
      camY = lerp(camY, ty, 1 - Math.exp(-dt * 4));
      // ambient motes
      for (const m of motes) { m.ph += dt; m.x += (Math.sin(m.ph * 0.7) * 6 - 4) * dt * m.z; m.y += Math.cos(m.ph * 0.5) * 5 * dt; if (m.x < -10) m.x += W + 20; }
      // destination
      if (!won && hero.x >= END - 6 && hero.ground && !hero.carried) {
        won = true; winT = 0;
        fx.burst(END + 30, GROUND - 120, { n: 40, speed: 260, rgb: '255,200,230', kind: 'glow', life: 1.1, size: 3 });
        env.flash('255,235,245', 0.5);
      }
      if (won) { winT += dt; if (winT > 0.9) env.win(); }
      env.hud.progress = clamp(hero.x / END, 0, 1);
      env.hud.objective = hero.carried ? 'Tap ⚔ fast to break free!' : won ? 'The lotus gate!'
        : arena ? `Fight off the boars! (${arena.left} left)` : 'Reach the lotus gate';
    }

    // ── drawing: backgrounds ───────────────────────────────────────────────
    // The background (sky, far forest, god rays, misty tree rows, mid photo,
    // ground mist) is soft by design, so it renders into a half-resolution buffer
    // that is drawn to the screen once: about a quarter of the pixel work of
    // painting each of those full-screen layers at phone resolution.
    let bgBuf = null, bgCtx = null;
    function drawBack(c) {
      const k = Math.max(0.75, (env.dpr || 2) * 0.5);
      const bw = Math.ceil(W * k), bh = Math.ceil(H * k);
      if (!bgBuf) bgBuf = document.createElement('canvas');
      if (bgBuf.width !== bw || bgBuf.height !== bh || !bgCtx) { bgBuf.width = bw; bgBuf.height = bh; bgCtx = bgBuf.getContext('2d'); }
      bgCtx.setTransform(k, 0, 0, k, 0, 0);
      paintBack(bgCtx);
      c.drawImage(bgBuf, 0, 0, W, H);
    }
    function paintBack(c) {
      // sky above the photo layers (seen when an eagle carries you up)
      const sky = c.createLinearGradient(0, -400, 0, 300);
      sky.addColorStop(0, '#8fb1b6'); sky.addColorStop(1, '#c2d6cb');
      c.fillStyle = sky; c.fillRect(0, 0, W, H);
      // far mountain rainforest
      const far = img.far;
      if (far) {
        const fh = 620, fw = far.width * fh / far.height, pf = (fw - W) / (END + 200);
        c.drawImage(far, -camX * pf, -10 - camY * 0.18, fw, fh);
      }
      // god rays
      c.save(); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.5 + 0.18 * Math.sin(T * 0.6);
      const rx = -((camX * 0.2) % 520);
      c.drawImage(rays, rx, -60 - camY * 0.25); c.drawImage(rays, rx + 520, -60 - camY * 0.25);
      c.restore();
      // far mist trees, then the photo mid layer
      for (const b of bgTrees2) {
        const sx = b.x - camX * 0.45; if (sx < -120 || sx > W + 120) continue;
        const a = bgTreeArt2[b.v]; drawArt(c, a, sx, 548 - camY * 0.42, b.s, b.f);
      }
      const mid = img.mid;
      if (mid) {
        const mh = 640, mw = mid.width * mh / mid.height, pf = (mw - W) / (END + 200);
        midMap = [-camX * pf, 6 - camY * 0.35, mw, mh];
        c.globalAlpha = 0.92;
        c.drawImage(mid, midMap[0], midMap[1], mw, mh);
        c.globalAlpha = 1;
        // the photo's misty floor colour continues below it (seen while carried up high)
        c.fillStyle = 'rgb(62,86,70)'; c.fillRect(0, midMap[1] + mh - 3, W, H);
      }
      for (const b of bgTrees) {
        const sx = b.x - camX * 0.62; if (sx < -140 || sx > W + 140) continue;
        drawArt(c, bgTreeArt[b.v], sx, 590 - camY * 0.6, b.s, b.f);
      }
      // ground mist band
      const mg = c.createLinearGradient(0, 470 - camY * 0.7, 0, 640 - camY);
      mg.addColorStop(0, 'rgba(120,150,130,0)'); mg.addColorStop(0.75, 'rgba(100,130,110,0.32)'); mg.addColorStop(1, 'rgba(80,108,90,0.5)');
      c.fillStyle = mg; c.fillRect(0, 0, W, H);
      const mo = -((camX * 0.7 + T * 8) % 1024);
      c.globalAlpha = 0.32; c.drawImage(mist, mo, 500 - camY * 0.8); c.drawImage(mist, mo + 1024, 500 - camY * 0.8); c.globalAlpha = 1;
    }
    let midMap = [0, 0, 1, 1];
    function drawArt(c, a, x, baseY, s, flip) {
      const w = a.w * s, h = a.h * s;
      c.save(); c.translate(x, baseY); if (flip) c.scale(-1, 1);
      c.drawImage(a.cv, -a.cx * s, -h, w, h); c.restore();
    }

    // ── drawing: world layer ───────────────────────────────────────────────
    function drawTrees(c) {
      for (const t of TREES) {
        const sx = t.x - camX; if (sx < -260 || sx > W + 260) continue;
        const a = treeFor(t.v, t.snake);
        c.drawImage(a.cv, t.x - a.cx, GROUND + 14 - a.h, a.w, a.h);
      }
    }
    // The ground never changes, so it's painted ONCE into 512 px world tiles (path,
    // litter texture, depth gradient, grass lip, rocks) and each frame just blits
    // the visible tiles. Painting it live (clip + pattern + tall gradient per
    // segment) was ~70% of the frame time and the main cause of lag on phones.
    const TILE = 512, TILE_TOP = GROUND - 64, TILE_H = 420;
    const groundTiles = new Map();
    function groundTile(i) {
      let cv = groundTiles.get(i);
      if (cv) return cv;
      const k = Math.min(2, Math.max(1, env.dpr || 2));
      cv = document.createElement('canvas');
      cv.width = Math.ceil(TILE * k); cv.height = Math.ceil(TILE_H * k);
      const tc = cv.getContext('2d');
      tc.setTransform(k, 0, 0, k, -i * TILE * k, -TILE_TOP * k);
      paintGround(tc, i * TILE, (i + 1) * TILE, TILE_TOP + TILE_H);
      groundTiles.set(i, cv);
      return cv;
    }
    function drawGround(c) {
      const camL = ZOO ? 0 : camX;
      const i0 = Math.floor((camL - 2) / TILE), i1 = Math.floor((camL + W + 2) / TILE);
      for (let i = i0; i <= i1; i++) c.drawImage(groundTile(i), i * TILE, TILE_TOP, TILE, TILE_H);
      const bottom = H - camY + 40, tileEnd = TILE_TOP + TILE_H;
      if (bottom > tileEnd) { c.fillStyle = '#050704'; c.fillRect(camL - 4, tileEnd - 1, W + 8, bottom - tileEnd + 1); }
      // ferns sway in the wind, so they stay live
      if (img.fern) for (const f of ferns) {
        if (f.x < camL - 100 || f.x > camL + W + 100 || f.d) continue;
        drawFern(c, f);
      }
    }
    function paintGround(c, L0, R0, bottom) {
      let x0 = -300;
      const segs = [];
      for (const g of GAPS) { segs.push([x0, g[0]]); x0 = g[1]; }
      segs.push([x0, END + 900]);
      for (const [a, b] of segs) {
        if (b < L0 - 40 || a > R0 + 40) continue;
        const L = Math.max(a, L0 - 60), Rr = Math.min(b, R0 + 60);
        c.beginPath();
        const leftBank = a > -300, rightBank = b < END + 900;
        c.moveTo(L, bottom);
        if (leftBank && L <= a + 1) { c.lineTo(a, WATER + 30); c.quadraticCurveTo(a + 4, GROUND + 2, a + 30, GROUND); }
        else c.lineTo(L, GROUND);
        for (let x = Math.ceil(Math.max(L, a + 30) / 24) * 24; x < Math.min(Rr, b - 30); x += 24) c.lineTo(x, GROUND + Math.sin(x * 0.05) * 1.6 + Math.sin(x * 0.013) * 1.2);
        if (rightBank && Rr >= b - 1) { c.lineTo(b - 30, GROUND); c.quadraticCurveTo(b - 4, GROUND + 2, b, WATER + 30); }
        else c.lineTo(Rr, GROUND);
        c.lineTo(Rr, bottom); c.closePath();
        c.fillStyle = '#2a2417'; c.fill();
        if (litterFor(c)) { c.save(); c.clip(); c.fillStyle = litterPat; c.globalAlpha = 0.85; c.fillRect(L, GROUND - 4, Rr - L, bottom - GROUND); c.restore(); }
        c.save(); c.clip();
        const eg = c.createLinearGradient(0, GROUND, 0, GROUND + 230);
        eg.addColorStop(0, 'rgba(26,34,18,0.05)'); eg.addColorStop(0.18, 'rgba(14,18,10,0.35)'); eg.addColorStop(1, 'rgba(4,6,3,0.92)');
        c.fillStyle = eg; c.fillRect(L, GROUND - 6, Rr - L, bottom - GROUND + 6);
        c.restore();
        // grass lip
        const gw = 512;
        const gs = Math.max(a + 6, L), ge = Math.min(b - 6, Rr);
        c.save(); c.beginPath(); c.rect(gs, GROUND - 40, ge - gs, 60); c.clip();
        for (let x = Math.floor(gs / gw) * gw; x < ge; x += gw) c.drawImage(grass.cv, x, GROUND - 30, gw, grass.h);
        c.restore();
      }
      for (const r of rocks) { if (r.x < L0 - 80 || r.x > R0 + 80) continue; const a = stoneArt[r.v]; c.drawImage(a.cv, r.x - a.w * r.s / 2, GROUND - a.h * r.s * 0.72, a.w * r.s, a.h * r.s); }
    }
    function drawFern(c, f) {
      const fe = img.fern, w = fe.width * f.s, h = fe.height * f.s;
      c.save(); c.translate(f.x, GROUND + 6); c.scale(f.f, 1); c.rotate(-0.25 + Math.sin(T * 1.3 + f.x) * 0.03);
      c.drawImage(fe, -w * 0.9, -h, w, h); c.restore();
    }
    function drawWater(c) {
      for (const g of GAPS) {
        if (g[1] < camX - 20 || g[0] > camX + W + 20) continue;
        const x0 = Math.max(g[0] - 2, camX - 2), x1 = Math.min(g[1] + 2, camX + W + 2);
        // submerged bodies first, seen through the water
        for (const e of enemies) if (e.type === 'croc' && !e.dead && e.x > g[0] - 200 && e.x < g[1] + 200) e.drawUnder(c);
        const top = WATER, h = H - camY - WATER + 40;
        const ok = waterProg && env.drawShader(c, waterProg, x0, top, x1 - x0, h,
          { u_bg: img.mid, u_map: [midMap[0] + camX, midMap[1] + camY, midMap[2], midMap[3]], u_rect: [x0, top], u_wx: x0 }, 0.5);
        if (!ok) {                                  // 2D fallback
          const wg = c.createLinearGradient(0, top, 0, top + 200);
          wg.addColorStop(0, 'rgba(60,90,74,0.85)'); wg.addColorStop(1, 'rgba(6,14,10,0.97)');
          c.fillStyle = wg; c.fillRect(x0, top, x1 - x0, h);
        }
        // shoreline foam lines
        c.strokeStyle = 'rgba(220,240,230,0.28)'; c.lineWidth = 1.2;
        c.beginPath();
        for (let x = x0; x <= x1; x += 8) c.lineTo(x, WATER + Math.sin(x * 0.09 + T * 2.2) * 0.9);
        c.stroke();
      }
      for (const p of PLATS) {
        if (p.x < camX - 100 || p.x > camX + W + 100) continue;
        const top = platTop(p);
        if (p.kind === 'stone') {
          const a = stoneArt[(p.v | 0) % 3], s = p.w / a.w * 1.25;
          c.drawImage(a.cv, p.x - a.w * s / 2, top - a.h * s * 0.13, a.w * s, a.h * s * 1.35);
        } else {
          const s = p.w / logArt.w;
          c.drawImage(logArt.cv, p.x - p.w / 2, top - 6, p.w, logArt.h * s);
        }
        c.strokeStyle = 'rgba(220,240,230,0.35)'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(p.x, WATER + 1, p.w * 0.55 + Math.sin(T * 2 + p.x) * 2, 3, 0, 0, TAU); c.stroke();
      }
    }
    function drawGate(c) {
      const gx = END + 40, gy = GROUND;
      if (gx < camX - 300 || gx > camX + W + 300) return;
      const pulse = 0.75 + 0.25 * Math.sin(T * 2.2), near = clamp(1 - (gx - hero.x) / 600, 0, 1);
      c.save(); c.globalCompositeOperation = 'lighter';
      const sh = c.createLinearGradient(gx - 90, 0, gx + 90, 0);
      sh.addColorStop(0, 'rgba(255,190,220,0)'); sh.addColorStop(0.5, `rgba(255,215,235,${(0.28 + near * 0.3) * pulse})`); sh.addColorStop(1, 'rgba(255,190,220,0)');
      c.fillStyle = sh; c.fillRect(gx - 90, gy - 900, 180, 900);
      // portal ring
      for (let i = 0; i < 3; i++) {
        c.strokeStyle = `rgba(255,${200 + i * 20},${225 + i * 10},${(0.5 - i * 0.12) * pulse})`; c.lineWidth = 6 - i * 1.6;
        c.beginPath(); c.ellipse(gx, gy - 118, 62 + i * 6, 104 + i * 8, 0, 0, TAU); c.stroke();
      }
      for (let i = 0; i < 18; i++) {
        const a = T * 1.4 + i * TAU / 18, px = gx + Math.cos(a) * 64, py = gy - 118 + Math.sin(a) * 106;
        c.drawImage(env.glowSprite('255,220,240'), px - 7, py - 7, 14, 14);
      }
      const pool = c.createRadialGradient(gx, gy, 0, gx, gy, 140);
      pool.addColorStop(0, `rgba(255,210,235,${0.5 * pulse})`); pool.addColorStop(1, 'rgba(255,200,230,0)');
      c.save(); c.translate(0, gy); c.scale(1, 0.25); c.fillStyle = pool; c.fillRect(gx - 140, -140, 280, 280); c.restore();
      c.restore();
      if (img.lotus) {
        const lw = 150, lh = img.lotus.height * lw / img.lotus.width;
        c.drawImage(img.lotus, gx - lw / 2, gy - 40 - lh + Math.sin(T * 1.6) * 3, lw, lh);
      }
      if (Math.random() < 0.3) fx.spawn({ x: gx + rand(-60, 60), y: gy - rand(0, 30), vy: -rand(30, 70), kind: 'glow', size: rand(1.2, 2.4), life: rand(1, 2), rgb: '255,220,240', fade: 'in-out' });
    }
    function drawBlooms(c) {
      for (const b of blooms) {
        if (b.got || b.x < camX - 40 || b.x > camX + W + 40) continue;
        const y = b.y + Math.sin(b.t * 2) * 4;
        c.save(); c.globalCompositeOperation = 'lighter';
        c.drawImage(env.glowSprite('255,210,110'), b.x - 26, y - 26, 52, 52);
        c.restore();
        c.save(); c.translate(b.x, y); c.rotate(b.t * 0.6);
        for (let i = 0; i < 6; i++) {
          c.rotate(TAU / 6);
          const g = c.createLinearGradient(0, 0, 0, -12);
          g.addColorStop(0, '#ffcc4d'); g.addColorStop(1, '#fff2b8');
          c.fillStyle = g; c.beginPath(); c.ellipse(0, -6.5, 3.6, 7, 0, 0, TAU); c.fill();
        }
        c.fillStyle = '#ff9a3c'; c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
        c.restore();
      }
    }

    // ── drawing: creatures ─────────────────────────────────────────────────
    function drawBoar(c, b) {
      const im = img.boar; if (!im) return;
      const k = BOAR.k, w = im.width * k, h = im.height * k;
      const run = b.st === 'charge' ? 1 : b.st === 'skid' || b.st === 'stagger' ? 0.4 : b.st === 'notice' ? 0.25 : 0;
      const bob = b.st === 'idle' ? Math.sin(b.ph) * 1.2 : -Math.abs(Math.sin(b.ph)) * 4 * run;
      c.save();
      c.globalAlpha = b.fade;
      c.translate(b.x, b.y);
      // contact shadow
      c.save(); c.scale(1, 0.18); const sg = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
      sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = sg; c.fillRect(-w / 2, -w / 2, w, w); c.restore();
      if (b.rot) { c.rotate(b.face * 0.28 * b.rot); c.scale(1, 1 - 0.3 * b.rot); c.translate(0, 6 * b.rot); }
      c.scale(b.face > 0 ? -1 : 1, 1);               // native art faces left
      const split = BOAR.legs * im.height;
      const head = b.st === 'notice' ? Math.sin(b.ph * 2) * 0.04 : b.st === 'charge' ? 0.06 : 0;
      // legs: front half and hind half shear in opposite phase
      const legH = (im.height - split) * k;
      for (let half = 0; half < 2; half++) {
        const sx = half ? im.width * 0.5 : 0, sw = im.width * 0.5;
        const sh = Math.sin(b.ph + half * Math.PI) * 0.55 * run;
        c.save(); c.translate(-w / 2 + sx * k + sw * k / 2, -legH);
        c.transform(1, 0, sh, 1, 0, 0);
        c.drawImage(im, sx, split, sw, im.height - split, -sw * k / 2, 0, sw * k, legH);
        c.restore();
      }
      c.save(); c.translate(0, bob - legH); c.rotate(head);
      c.drawImage(im, 0, 0, im.width, split + 2, -w / 2, -split * k, w, split * k + 2 * k);
      if (b.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = b.flash * 0.6 * b.fade; c.drawImage(im, 0, 0, im.width, split + 2, -w / 2, -split * k, w, split * k + 2 * k); }
      c.restore();
      c.restore();
    }

    function drawSnake(c, s) {
      const im = img.python; if (!im) return;
      const k = PY.k, ax = PY.anchor[0], ay = PY.anchor[1];
      let ox = s.x, oy = s.y, rot = 0, alpha = 1;
      if (s.fall) { ox = s.fall.x; oy = s.fall.y; rot = s.fall.rot; alpha = s.fade; }
      c.save(); c.globalAlpha = alpha;
      c.translate(ox, oy); c.rotate(rot);
      const sway = Math.sin(s.sway * 1.3) * 3;
      const strips = 30, sh = im.height / strips;
      const ex = s.aim.x * s.ext, ey = s.aim.y * s.ext, shiver = s.st === 'coil' ? Math.sin(T * 40) * 0.8 : 0;
      // piecewise-sheared strips: each strip's top and bottom edges follow the warp,
      // so the body stays continuous while the lower half lunges at the target
      const off = y0 => {
        const wv = smooth((y0 - PY.warpFrom) / (im.height - PY.warpFrom));
        return [(ex - 10 * s.rear + sway + shiver) * wv, (y0 - ay) * k + (ey - 14 * s.rear) * wv];
      };
      let a0 = off(0);
      for (let i = 0; i < strips; i++) {
        const y0 = i * sh, a1 = off(y0 + sh);
        const hgt = a1[1] - a0[1];
        c.save();
        c.translate(-ax * k + a0[0], a0[1]);
        c.transform(1, 0, (a1[0] - a0[0]) / Math.max(0.5, hgt), 1, 0, 0);
        c.drawImage(im, 0, y0, im.width, sh + 0.6, 0, 0, im.width * k, hgt + 0.7);
        c.restore();
        a0 = a1;
      }
      if (s.flash > 0) {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = s.flash * 0.55 * alpha;
        c.drawImage(im, -ax * k, -ay * k, im.width * k, im.height * k);
        c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha;
      }
      // tongue
      if (s.tongue > 0 && !s.fall) {
        const sn = { x: (PY.snout[0] - ax) * k + ex - 10 * s.rear + sway, y: (PY.snout[1] - ay) * k + ey - 14 * s.rear };
        const dir = Math.atan2((hero.y - 50) - (oy + sn.y), hero.x - (ox + sn.x));
        const L = 9 + 7 * Math.sin((s.tongue / 0.22) * Math.PI);
        c.save(); c.translate(sn.x, sn.y + 4); c.rotate(dir);
        c.strokeStyle = '#b3123a'; c.lineWidth = 1.3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(0, 0); c.lineTo(L, 0); c.lineTo(L + 4, -2.6); c.moveTo(L, 0); c.lineTo(L + 4, 2.6); c.stroke();
        c.restore();
      }
      c.restore();
    }

    function crocPath(c, pts, keep) { if (!keep) c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); }
    function drawCrocBody(c, cr, im) {
      // tail strips sway; lower jaw hinged; everything in image px.
      // mouth interior first (behind) — it shows only where the lower jaw swings away
      if (cr.jaw > 0.06) {
        c.save(); crocPath(c, CROC.mouth);
        const mg = c.createLinearGradient(0, 70, 0, 130);
        mg.addColorStop(0, '#5a1e1a'); mg.addColorStop(1, '#2a0b0a');
        c.fillStyle = mg; c.fill(); c.restore();
      }
      const tailEnd = 470, sw = 22;
      c.save();
      c.beginPath(); c.rect(-10, -40, im.width + 20, im.height + 80);
      crocPath(c, CROC.jaw, true);
      c.clip('evenodd');
      for (let x = 0; x < tailEnd; x += sw) {
        const u = 1 - x / tailEnd;
        const dy = Math.sin(cr.ph * 2.6 - x * 0.012) * 9 * u * u * (cr.st === 'lurk' ? 1 : 0.5);
        c.drawImage(im, x, 0, sw + 1, im.height, x, dy, sw + 1, im.height);
      }
      c.drawImage(im, tailEnd, 0, im.width - tailEnd, im.height, tailEnd, 0, im.width - tailEnd, im.height);
      c.restore();
      // lower jaw on its hinge
      c.save();
      c.translate(CROC.hinge[0], CROC.hinge[1]); c.rotate(cr.jaw * 0.55); c.translate(-CROC.hinge[0], -CROC.hinge[1]);
      crocPath(c, CROC.jaw); c.clip();
      c.drawImage(im, 0, 0);
      c.restore();
    }
    function drawCroc(c, cr, part) {
      const im = img.croc; if (!im) return;
      const k = CROC.k;
      const wl = lerp(CROC.wlLurk, CROC.wlUp, cr.rise) - cr.sinkY / k * 0.4;
      c.save();
      c.beginPath();
      if (part === 'under') c.rect(cr.x - 400, WATER, 800, 300); else c.rect(cr.x - 400, -2000, 800, WATER - 0.5 + 2000);
      c.clip();
      // pivot at the body's waterline: the head end tilts up, the tail end dips under
      c.translate(cr.x, WATER);
      c.rotate(-cr.pitch() * (cr.face > 0 ? 1 : -1));
      c.translate(0, -wl * k);
      c.scale(k * (cr.face > 0 ? 1 : -1), k);
      if (cr.roll) { c.translate(600, 80); c.scale(1, 1 - cr.roll * 1.8); c.translate(-600, -80); }
      c.translate(-600, 0);
      if (part === 'under') { c.globalAlpha = 0.5; drawCrocBody(c, cr, crocTint || im); }
      else {
        drawCrocBody(c, cr, im);
        if (cr.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = cr.flash * 0.5; c.drawImage(im, 0, 0); }
      }
      c.restore();
      if (part === 'over' && cr.rise > 0.3) {
        // wet sheen line where the body breaks the surface
        c.strokeStyle = 'rgba(230,245,235,0.4)'; c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(cr.x, WATER + 1, 125, 3.5, 0, 0, TAU); c.stroke();
      }
    }

    function drawBird(c, b) {
      if (b.st === 'wait') return;
      const parts = birdParts[b.kind]; if (!parts) return;
      const B = b.B, s = B.k * 700 / B.src;     // polygon space → screen
      const amp = b.st === 'carry' ? 0.5 : b.st === 'dive' ? 0.12 : b.kind === 'vulture' ? 0.16 : 0.34;
      const base = b.st === 'dive' ? 0.18 : 0;
      const a = base + Math.sin(b.flap) * amp;
      const flip = (B.faceRight ? 1 : -1) * b.flipDir();
      c.save();
      c.translate(b.x, b.y);
      const pitch = b.st === 'falling' ? b.rot : clamp(Math.atan2(b.vy, Math.abs(b.vx) + 60) * 0.35, -0.4, 0.4) * (b.st === 'carry' ? 0.3 : 1);
      c.rotate(pitch * flip);
      c.scale(flip * s, s);
      c.translate(-B.src / 2, -parts.h / 2);
      const wing = (part, ang) => {
        c.save();
        c.translate(part.pivot[0], part.pivot[1]); c.rotate(ang);
        c.scale(1, 1 - Math.max(0, -ang) * 0.25);
        c.translate(-part.pivot[0], -part.pivot[1]);
        c.drawImage(part.cv, 0, 0, B.src, parts.h);
        c.restore();
      };
      wing(parts.far, a * (B.faceRight ? 1 : -1));
      c.drawImage(parts.body, 0, 0, B.src, parts.h);
      wing(parts.near, -a * (B.faceRight ? 1 : -1));
      if (b.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = b.flash * 0.5; c.drawImage(parts.body, 0, 0, B.src, parts.h); }
      c.restore();
      if (b.screech > 0 && b.st !== 'carry') {
        c.save(); c.globalAlpha = Math.min(1, b.screech * 2);
        c.fillStyle = '#ffd86b'; c.font = 'bold 22px Georgia, serif'; c.textAlign = 'center';
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3;
        c.strokeText('!', b.x, b.y - 52); c.fillText('!', b.x, b.y - 52); c.restore();
      }
    }

    // ── the 3D swordsman (pre-rendered sprite sheets, env.hero) ──────────────
    const HERO_H = 116;                     // standing height on screen (app px)
    function heroPose(h) {
      const HA = env.hero;
      if (h.carried) return { anim: 'air', t: 1 / 12, rot: Math.sin(T * 7) * 0.09 * h.face };
      if (h.dashT > 0) return { anim: 'dash', t: HA.dur('dash') * (0.22 + 0.5 * (1 - h.dashT / 0.22)) };
      if (h.atk) {
        const dur = h.ground ? ATK_DUR[h.atkStep - 1] : 0.3, k = clamp(h.atkT / dur, 0, 1);
        const anim = !h.ground ? 'slash3' : h.atkStep === 3 ? 'thrust' : h.atkStep === 2 ? 'slash2' : 'slash1';
        return { anim, t: HA.dur(anim) * k * 0.86 };
      }
      if (!h.ground) return { anim: 'air', t: (h.vy < -260 ? 0 : h.vy < 220 ? 1 : 2) / 12 };
      if (h.run > 0.18) return { anim: 'run', t: h.runClock };
      return { anim: 'idle', t: T };
    }
    function drawHeroSprite(c) {
      const h = hero;
      if (h.plungeT > 0) return;
      for (const tr of h.trail)
        env.hero.draw(c, tr.x, tr.y, { anim: 'dash', t: env.hero.dur('dash') * 0.45, facing: h.face, height: HERO_H, alpha: tr.a * 0.55, shadow: false });
      const blink = env.invulnerable && h.dashT <= 0 && !h.carried && Math.floor(T * 18) % 2 === 0;
      const p = heroPose(h);
      env.hero.draw(c, h.x, h.y + (h.landT > 0 ? h.landT * 10 : 0), {
        anim: p.anim, t: p.t, rot: (p.rot || 0) - (h.hurtT > 0 ? 0.1 * h.face : 0), facing: h.face, height: HERO_H,
        flash: h.hurtT > 0 ? h.hurtT / 0.32 : 0, alpha: blink ? 0.55 : 1, shadow: h.ground && !h.carried
      });
      const dur = h.atkStep ? (h.ground ? ATK_DUR[h.atkStep - 1] : 0.3) : 1;
      if (h.atk && h.atkStep === 3 && h.atkT / dur > 0.45 && h.atkT / dur < 0.6 && h.ground) {
        fx.spawn({ x: h.x + h.face * 70, y: h.y - 46, kind: 'ring', size: 8, grow: 220, life: 0.3, rgb: env.charRgb });
      }
    }

    function drawHeroAll(c) {
      const h = hero;
      if (env.hero.ready) { drawHeroSprite(c); return; }
      if (h.plungeT > 0) return;
      for (const tr of h.trail) {
        c.save(); c.globalAlpha = tr.a * 0.6;
        env.drawHero(c, tr.x, tr.y, { scale: HS, facing: h.face, run: 1, phase: h.phase, weapon: 'sword' });
        c.restore();
      }
      const blink = env.invulnerable && h.dashT <= 0 && !h.carried && Math.floor(T * 18) % 2 === 0;
      if (blink) c.globalAlpha = 0.55;
      const dur = h.atkStep ? (h.ground ? ATK_DUR[h.atkStep - 1] : 0.3) : 1;
      env.drawHero(c, h.x, h.y + (h.landT > 0 ? h.landT * 10 : 0), {
        scale: HS, facing: h.face, run: h.run, phase: h.phase, air: !h.ground && !h.carried, vy: h.vy,
        weapon: 'sword', attack: h.atk ? clamp(h.atkT / dur, 0.001, 1) : 0, hurt: h.hurtT > 0 ? h.hurtT / 0.32 : 0,
        grabbed: !!h.carried
      });
      c.globalAlpha = 1;
      if (h.atk && h.atkStep === 3 && h.atkT / dur > 0.45 && h.atkT / dur < 0.6 && h.ground) {
        fx.spawn({ x: h.x + h.face * 56, y: h.y - 4, kind: 'ring', size: 8, grow: 200, life: 0.3, rgb: env.charRgb });
      }
    }

    function drawFront(c) {
      // drifting motes (pollen, insects) — additive
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        const sx = ((m.x - camX * 0.15 * m.z) % (W + 20) + W + 20) % (W + 20) - 10;
        const a = 0.35 + 0.35 * Math.sin(m.ph * 2.3);
        const s = 5 * m.z;
        c.globalAlpha = a; c.drawImage(env.glowSprite('230,240,190'), sx - s, m.y - camY * 0.5 - s, s * 2, s * 2);
      }
      c.restore();
      // foreground leaves (closest layer)
      for (const l of fgLeaves) {
        const sx = l.x - camX * 1.25; if (sx < -260 || sx > W + 260) continue;
        const a = leafArt[l.v];
        c.save();
        c.translate(sx, l.top ? -30 - camY * 1.2 : H - 220 - camY * 1.2);
        c.rotate(Math.sin(T * 0.8 + l.x) * 0.03);
        c.scale(l.f ? -l.s : l.s, l.top ? l.s : -l.s);
        c.globalAlpha = 0.92;
        c.drawImage(a.cv, -a.w / 2, 0, a.w, a.h);
        c.restore();
      }
      // the vignette is fully transparent across the middle band: draw only its top and bottom
      const vk = vignette.width / W;
      c.drawImage(vignette, 0, 0, vignette.width, 224 * vk, 0, 0, W, 224);
      c.drawImage(vignette, 0, 484 * vk, vignette.width, (H - 484) * vk, 0, 484, W, H - 484);
      // arena banners
      for (const a of arenas) {
        if (a.st === 'fight' && a.banner > 0) {
          const k = a.banner / 1.5, s = 1 + (1 - k) * 0.25;
          c.save(); c.globalAlpha = Math.min(1, k * 2.5); c.translate(W / 2, 300); c.scale(s, s);
          c.textAlign = 'center'; c.font = 'bold 46px Georgia, serif'; c.lineWidth = 6; c.strokeStyle = 'rgba(40,10,0,0.75)';
          c.strokeText('FIGHT!', 0, 0); c.fillStyle = '#ffcf5a'; c.fillText('FIGHT!', 0, 0); c.restore();
        }
        if (a.st === 'clear' && a.go > 0) {
          const bob = Math.sin(T * 7) * 8;
          c.save(); c.globalAlpha = Math.min(1, a.go); c.textAlign = 'right'; c.font = 'bold 30px Georgia, serif';
          c.lineWidth = 5; c.strokeStyle = 'rgba(0,20,0,0.7)'; c.strokeText('GO →', W - 18 + bob, 330);
          c.fillStyle = '#d8ffb0'; c.fillText('GO →', W - 18 + bob, 330); c.restore();
        }
      }
      // carry prompt
      if (hero.carried) {
        const b = hero.carried;
        const px = hero.x - camX, py = hero.y - camY + 30;
        c.save(); c.textAlign = 'center';
        const s = 1 + 0.12 * Math.sin(T * 14);
        c.translate(px, py); c.scale(s, s);
        c.font = 'bold 20px system-ui'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.7)';
        c.strokeText('TAP ⚔ TO BREAK FREE!', 0, 0); c.fillStyle = '#ffe28a'; c.fillText('TAP ⚔ TO BREAK FREE!', 0, 0);
        c.restore();
        // grip pips
        for (let i = 0; i < (b.kind === 'eagle' ? 5 : 4); i++) {
          c.fillStyle = i < b.grip ? 'rgba(255,120,90,0.95)' : 'rgba(255,255,255,0.25)';
          c.beginPath(); c.arc(px - 36 + i * 18, py + 18, 5, 0, TAU); c.fill();
        }
        // height meter
        const hgt = Math.max(0, GROUND - hero.y);
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '12px system-ui'; c.textAlign = 'center';
        c.fillText(`${Math.round(hgt / 60)} m up`, px, py + 40);
      }
    }

    function render(c) {
      if (ZOO) { zooRender(c); return; }
      drawBack(c);
      c.save(); c.translate(-camX, -camY);
      drawTrees(c);
      drawWater(c);
      drawGround(c);
      drawGate(c);
      drawBlooms(c);
      for (const e of enemies) if (e.type === 'snake' || e.type === 'boar') { if (Math.abs(e.x - camX - W / 2) < W) e.draw(c); }
      for (const e of enemies) if (e.type === 'croc' && Math.abs(e.x - camX - W / 2) < W) e.draw(c);
      drawHeroAll(c);
      if (img.fern) for (const f of ferns) if (f.d && f.x > camX - 100 && f.x < camX + W + 100) drawFern(c, f);
      for (const e of enemies) if (e.type === 'bird') e.draw(c);
      fx.draw(c);
      c.restore();
      drawFront(c);
    }

    // ── creature preview (&show=zoo) ───────────────────────────────────────
    let zoo = null;
    function zooUpdate(dt) {
      if (!zoo) {
        camX = 0; camY = 0; hero.x = 70; hero.y = GROUND;
        zoo = { croc: makeCroc(-200, 600), snake: makeSnake(210, 150), boar: makeBoar(290), eagle: makeBird('eagle', 0), vult: makeBird('vulture', 0) };
        zoo.croc.x = 200; zoo.croc.rise = 1; zoo.croc.st = 'zoo';
        zoo.eagle.st = 'zoo'; zoo.eagle.x = 110; zoo.eagle.y = 120; zoo.eagle.dir = 1;
        zoo.vult.st = 'zoo'; zoo.vult.x = 290; zoo.vult.y = 300; zoo.vult.dir = -1;
        zoo.boar.st = 'charge'; zoo.boar.seg = [-9999, 9999];
      }
      zoo.croc.ph += dt; zoo.croc.jaw = 0.4 + 0.4 * Math.sin(T * 2);
      zoo.croc.st = 'lunge'; zoo.croc.t = 0.13; zoo.croc.face = -1; zoo.croc.x = 250;
      zoo.eagle.flap += dt * 6; zoo.vult.flap += dt * 4;
      zoo.boar.ph += dt * 15;
      zoo.snake.update(dt);
      zoo.snake.tongue = 0.2;
      zoo.snake.rear = 0.5 + 0.5 * Math.sin(T * 1.5);
    }
    function zooRender(c) {
      drawBack(c);
      c.save();
      drawGround(c);
      c.fillStyle = '#5a4630'; c.fillRect(150, 145, 140, 12);
      drawSnake(c, zoo.snake);
      c.save(); c.translate(0, -90); drawWater(c); c.restore();
      drawCroc(c, zoo.croc, 'over');
      const b = zoo.boar; b.x = 290; b.vx = 0; drawBoar(c, b);
      drawBird(c, zoo.eagle); drawBird(c, zoo.vult);
      env.drawHero(c, 80, GROUND, { scale: HS, weapon: 'sword', run: 1, phase: T * 10 });
      c.restore();
    }

    // ── pre-render helpers ─────────────────────────────────────────────────
    function makeGrass(Rr) {
      const w = 512, h = 44, o = canvas(w, h, Rr), g = o.g, r = rng(21);
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 260; i++) {
          const x = r() * w, bh = 6 + r() * (pass ? 22 : 14), lean = (r() - 0.5) * 9;
          const shade = pass ? 0.65 + r() * 0.5 : 0.35 + r() * 0.3;
          const col = `rgb(${(48 * shade) | 0},${(92 * shade + 14) | 0},${(38 * shade) | 0})`;
          for (const dx of [0, -w, w]) {
            g.strokeStyle = col; g.lineWidth = 1 + r() * 1.3; g.lineCap = 'round';
            g.beginPath(); g.moveTo(x + dx, 34); g.quadraticCurveTo(x + dx + lean * 0.4, 34 - bh * 0.6, x + dx + lean, 34 - bh); g.stroke();
          }
        }
      }
      const lg = g.createLinearGradient(0, 26, 0, h);
      lg.addColorStop(0, 'rgba(30,44,20,0)'); lg.addColorStop(1, 'rgba(26,30,16,0.9)');
      g.fillStyle = lg; g.fillRect(0, 26, w, h - 26);
      return o;
    }
    function makeTree(v, snake, Rr) {
      const r = rng(100 + v * 17 + (snake ? 5 : 0));
      const tw = 52 + v * 7, H_ = 1150, side = snake ? BRANCH_LEN + 60 : 90;
      const w = tw + side * 2, o = canvas(w, H_, Rr), g = o.g, cx = w / 2;
      // trunk outline: gentle waviness, root flare
      const left = [], right = [];
      for (let y = 0; y <= H_; y += 25) {
        const k = y / H_, flare = Math.pow(Math.max(0, (k - 0.9) / 0.1), 2) * tw * 0.7;
        const wob = Math.sin(y * 0.011 + v) * 3;
        left.push([cx - tw / 2 - flare + wob, y]); right.push([cx + tw / 2 + flare + wob * 0.6, y]);
      }
      g.save();
      g.beginPath(); left.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      right.reverse().forEach(p => g.lineTo(p[0], p[1])); g.closePath();
      g.clip();
      if (img.bark) { const bw = tw * 1.7, bh = img.bark.height * bw / img.bark.width; for (let y = -r() * 200; y < H_; y += bh) g.drawImage(img.bark, cx - bw / 2, y, bw, bh); }
      else { g.fillStyle = '#3d2f22'; g.fillRect(0, 0, w, H_); }
      const sg = g.createLinearGradient(cx - tw, 0, cx + tw, 0);
      sg.addColorStop(0, 'rgba(255,240,200,0.10)'); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(0.75, 'rgba(0,12,4,0.5)'); sg.addColorStop(1, 'rgba(0,10,4,0.82)');
      g.fillStyle = sg; g.fillRect(0, 0, w, H_);
      // moss creeping up from the roots
      for (let i = 0; i < 26; i++) {
        const my = H_ - r() * 380, mx = cx + (r() - 0.5) * tw * 1.4, mr = 6 + r() * 16;
        const mg = g.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, `rgba(${70 + r() * 40},${110 + r() * 40},50,0.45)`); mg.addColorStop(1, 'rgba(60,100,40,0)');
        g.fillStyle = mg; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
      const bot = g.createLinearGradient(0, H_ - 60, 0, H_);
      bot.addColorStop(0, 'rgba(10,14,8,0)'); bot.addColorStop(1, 'rgba(10,14,8,0.85)');
      g.fillStyle = bot; g.fillRect(0, H_ - 60, w, 60);
      g.restore();
      // branch the python hangs from (sticks out to the left)
      if (snake) {
        const by = H_ - (GROUND + 14 - BRANCH_Y);
        g.save();
        g.beginPath();
        g.moveTo(cx - tw * 0.3, by - 13); g.quadraticCurveTo(cx - BRANCH_LEN * 0.6, by - 14, cx - BRANCH_LEN - 40, by - 4);
        g.lineTo(cx - BRANCH_LEN - 42, by + 3); g.quadraticCurveTo(cx - BRANCH_LEN * 0.6, by + 8, cx - tw * 0.3, by + 14); g.closePath();
        g.clip();
        if (img.bark) { const bw = 90, bh = img.bark.height * bw / img.bark.width; g.save(); g.translate(cx, by); g.rotate(Math.PI / 2); g.drawImage(img.bark, -bw / 2, -40, bw, bh * 0.6); g.restore(); }
        const bg = g.createLinearGradient(0, by - 14, 0, by + 14);
        bg.addColorStop(0, 'rgba(255,240,200,0.12)'); bg.addColorStop(1, 'rgba(0,8,2,0.7)');
        g.fillStyle = bg; g.fillRect(0, by - 20, w, 40);
        g.restore();
        // a few leaves on the branch tip
        leafy(g, cx - BRANCH_LEN - 36, by - 2, r, 7);
      }
      // hanging vines
      const vines = 2 + ((r() * 2) | 0);
      for (let i = 0; i < vines; i++) {
        const vx = cx + (r() - 0.5) * tw * 2.4, vy0 = r() * 300, len = 260 + r() * 340;
        g.strokeStyle = `rgba(${40 + r() * 20},${70 + r() * 30},36,0.95)`; g.lineWidth = 1.6 + r() * 1.4;
        g.beginPath(); g.moveTo(vx, vy0);
        g.bezierCurveTo(vx + (r() - 0.5) * 40, vy0 + len * 0.3, vx + (r() - 0.5) * 50, vy0 + len * 0.7, vx + (r() - 0.5) * 20, vy0 + len);
        g.stroke();
        for (let j = 0; j < 9; j++) leafy(g, vx + (r() - 0.5) * 24, vy0 + len * (0.2 + j * 0.09), r, 1);
      }
      return { cv: o.cv, w, h: H_, cx };
    }
    function leafy(g, x, y, r, n) {
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, L = 6 + r() * 9, lx = x + Math.cos(a) * L * 0.6, ly = y + Math.sin(a) * L * 0.6;
        g.save(); g.translate(lx, ly); g.rotate(a);
        const lg = g.createLinearGradient(0, -3, 0, 3);
        lg.addColorStop(0, `rgb(${70 + r() * 30},${120 + r() * 40},${50 + r() * 20})`); lg.addColorStop(1, 'rgb(28,58,26)');
        g.fillStyle = lg; g.beginPath(); g.ellipse(L / 2, 0, L / 2, L * 0.22, 0, 0, TAU); g.fill();
        g.restore();
      }
    }
    function fogged(t, s, col, k) {
      const w = t.w * s, h = t.h * s, o = canvas(w, h, 1), g = o.g;
      g.drawImage(t.cv, 0, 0, w, h);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${k})`; g.fillRect(0, 0, w, h);
      return { cv: o.cv, w, h, cx: t.cx * s };
    }
    function makeLeaf(v, Rr) {
      const w = 300, h = 260, o = canvas(w, h, Rr), g = o.g, r = rng(300 + v);
      const stems = 3 + v;
      for (let i = 0; i < stems; i++) {
        const ang = 1.2 + (i - stems / 2) * 0.32 + (r() - 0.5) * 0.2, L = 150 + r() * 90;
        g.save(); g.translate(w / 2, 0); g.rotate(ang - Math.PI / 2);
        // palm-like frond: a rib with leaflets
        g.strokeStyle = 'rgb(8,16,8)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.4, 12, L, 34); g.stroke();
        for (let j = 1; j < 14; j++) {
          const t2 = j / 14, px = L * t2, py = 34 * t2 * t2;
          const ll = 34 * (1 - t2 * 0.6) * (0.8 + r() * 0.4);
          for (const sd of [-1, 1]) {
            g.fillStyle = `rgba(${6 + r() * 10},${18 + r() * 14},${8 + r() * 8},1)`;
            g.save(); g.translate(px, py); g.rotate(sd * (0.9 + r() * 0.3) + t2 * 0.4);
            g.beginPath(); g.ellipse(ll / 2, 0, ll / 2, 4.2, 0, 0, TAU); g.fill(); g.restore();
          }
        }
        g.restore();
      }
      return o;
    }
    function makeRays() {
      const o = canvas(520, 720, 1), g = o.g;
      for (let i = 0; i < 5; i++) {
        const x = 40 + i * 105 + (i % 2) * 30, wd = 30 + (i % 3) * 22;
        g.save(); g.translate(x, -20); g.rotate(-0.32);
        const rg = g.createLinearGradient(0, 0, 0, 760);
        rg.addColorStop(0, 'rgba(255,248,215,0.28)'); rg.addColorStop(0.6, 'rgba(255,245,210,0.08)'); rg.addColorStop(1, 'rgba(255,245,210,0)');
        g.fillStyle = rg;
        g.beginPath(); g.moveTo(-wd * 0.3, 0); g.lineTo(wd * 0.3, 0); g.lineTo(wd, 760); g.lineTo(-wd, 760); g.closePath(); g.fill();
        g.restore();
      }
      return o.cv;
    }
    function makeMist() {
      const o = canvas(1024, 150, 1), g = o.g, r = rng(41);
      for (let i = 0; i < 70; i++) {
        const x = r() * 1024, y = 40 + r() * 80, rr = 40 + r() * 90;
        for (const dx of [0, -1024, 1024]) {
          const mg = g.createRadialGradient(x + dx, y, 0, x + dx, y, rr);
          mg.addColorStop(0, 'rgba(190,212,198,0.16)'); mg.addColorStop(1, 'rgba(190,212,198,0)');
          g.fillStyle = mg; g.fillRect(x + dx - rr, y - rr, rr * 2, rr * 2);
        }
      }
      return o.cv;
    }
    function makeVignette() {
      const o = canvas(W, H, 1), g = o.g;
      const vg = g.createRadialGradient(W / 2, H * 0.42, H * 0.28, W / 2, H * 0.45, H * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,8,4,0.55)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      return o.cv;
    }
    function makeStone(v, Rr) {
      const w = 80, h = 40, o = canvas(w, h, Rr), g = o.g, r = rng(500 + v);
      g.beginPath();
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI + (i / 20) * Math.PI, rx = 38 * (0.9 + r() * 0.15), ry = 18 * (0.85 + r() * 0.25);
        const x = w / 2 + Math.cos(a) * rx, y = 24 + Math.sin(a) * ry;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.quadraticCurveTo(w / 2, 46, 2, 24); g.closePath();
      const sg = g.createLinearGradient(0, 4, 0, 40);
      sg.addColorStop(0, '#8c8f84'); sg.addColorStop(0.45, '#56594f'); sg.addColorStop(1, '#22241f');
      g.fillStyle = sg; g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 14; i++) {
        const mx = 8 + r() * 64, my = 6 + r() * 10, mr = 5 + r() * 9;
        const mg = g.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, 'rgba(90,130,60,0.55)'); mg.addColorStop(1, 'rgba(90,130,60,0)');
        g.fillStyle = mg; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(32, 11, 18, 3, -0.1, 0, TAU); g.fill();
      g.restore();
      return o;
    }
    function makeLog(Rr) {
      const w = 140, h = 30, o = canvas(w, h, Rr), g = o.g;
      g.save();
      g.beginPath(); g.moveTo(10, 4); g.lineTo(w - 10, 3); g.quadraticCurveTo(w, 14, w - 10, 26); g.lineTo(10, 27); g.quadraticCurveTo(0, 15, 10, 4); g.closePath();
      g.clip();
      if (img.bark) { g.save(); g.translate(w / 2, 15); g.rotate(Math.PI / 2); g.drawImage(img.bark, -16, -w / 2, 32, w); g.restore(); }
      const lg = g.createLinearGradient(0, 3, 0, 27);
      lg.addColorStop(0, 'rgba(255,240,210,0.18)'); lg.addColorStop(0.5, 'rgba(0,0,0,0.1)'); lg.addColorStop(1, 'rgba(0,0,0,0.7)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
      g.restore();
      g.fillStyle = '#8a6a44'; g.beginPath(); g.ellipse(w - 10, 15, 5, 11.5, 0, 0, TAU); g.fill();
      g.strokeStyle = '#5c4228'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.ellipse(w - 10, 15, i * 1.4, i * 3, 0, 0, TAU); g.stroke(); }
      return o;
    }
    function splitBird(im, B) {
      if (!im) return null;
      const s = im.width / B.src, h = im.height / s;           // work in polygon space
      const mk = () => { const c2 = document.createElement('canvas'); c2.width = im.width; c2.height = im.height; return c2; };
      const body = mk(), far = mk(), near = mk();
      const bg = body.getContext('2d'); bg.drawImage(im, 0, 0);
      bg.globalCompositeOperation = 'destination-out';
      polyPath(bg, B.far.poly, s); bg.fill(); polyPath(bg, B.near.poly, s); bg.fill();
      for (const [cv2, part] of [[far, B.far], [near, B.near]]) {
        const g = cv2.getContext('2d');
        polyPath(g, part.poly, s); g.save(); g.clip(); g.drawImage(im, 0, 0); g.restore();
      }
      return { body, h, far: { cv: far, pivot: B.far.pivot }, near: { cv: near, pivot: B.near.pivot } };
    }
    function tinted(im, rgb, k) {
      if (!im) return null;
      const c2 = document.createElement('canvas'); c2.width = im.width; c2.height = im.height;
      const g = c2.getContext('2d'); g.drawImage(im, 0, 0);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${k})`; g.fillRect(0, 0, im.width, im.height);
      return c2;
    }

    return {
      update, render,
      debug() {
        return {
          gaps: GAPS, plats: PLATS.map(p => ({ x: Math.round(p.x), w: p.w })), hurtT: +hero.hurtT.toFixed(2),
          arena: arena ? { cam: arena.cam, left: arena.left } : null, arenas: arenas.map(a => a.st),
          x: Math.round(hero.x), y: Math.round(hero.y), ground: hero.ground, carried: !!hero.carried, grip: hero.carried ? hero.carried.grip : null,
          plunge: hero.plungeT > 0, atk: hero.atkStep, progress: +(hero.x / END).toFixed(3), won, camX: Math.round(camX), camY: Math.round(camY),
          enemies: enemies.map(e => ({ t: e.type, st: e.st, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp }))
        };
      }
    };
  }
})();
