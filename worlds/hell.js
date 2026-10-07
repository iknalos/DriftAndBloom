// ============================================================================
// Drift & Bloom — HELL   (scorched by dragon fire → the underworld)
// Archer side-scroller: run right across basalt rising out of a lava lake while
// the HORDE — a wall of hellfire that spits out hellhounds — chases from behind.
// Demon bats dive, ghouls guard the ledges, lava serpents leap from the lake,
// geysers erupt in the gaps, slabs crumble, and the Gatekeeper guards the exit.
//
// Art: real photographs (USGS / Wikimedia Commons, credits in
// assets/worlds/CREDITS.json) — a wolf, a hyena, a bat and a bear charred with
// glowing lava cracks by tools/assets/hell_char.py; pahoehoe basalt for the rock;
// an 1885 painting of Kilauea at night for the far sky. Lava, sky and the
// hellfire are WebGL shaders (world_core env.shader / env.drawShader).
//
// Test hooks: window.__hellCheat = { god: true, warp: <world x>, hurt: <hp> }
//             window.__hellAuto = true   (simple autopilot for scripted runs)
// ============================================================================
(function () {
  'use strict';

  const A = 'assets/worlds/hell/';
  const W = 390, H = 844;
  const LAVA_Y = 640;              // lava surface (no vertical scrolling: world y = screen y)
  const PORTAL_X = 6060;
  const ARENA_X = 5240;
  const VOLLEY = { n: 1 };         // flaming volleys left (shown on the 3rd button)
  const TAU = Math.PI * 2;

  // ── level ────────────────────────────────────────────────────────────────
  // [x0, x1, top, kind]  — basalt masses rising from the lava; 'crumble' slabs give way
  const SEGS = [
    [-700, 520, 590, 'rock'],
    [610, 900, 585, 'rock'],
    [980, 1260, 590, 'rock'],
    [1360, 1600, 580, 'rock'],
    [1665, 1748, 560, 'rock'],
    [1812, 1892, 532, 'rock'],
    [1955, 2035, 556, 'rock'],
    [2100, 2420, 590, 'rock'],
    // crumbling bridge: a full running jump from each edge lands on the next slab
    [2462, 2590, 586, 'crumble'], [2632, 2760, 584, 'crumble'], [2800, 2890, 586, 'crumble'],
    [2920, 3380, 590, 'rock'],
    [3460, 3620, 542, 'rock'],
    [3700, 3860, 502, 'rock'],
    [3940, 4160, 560, 'rock'],
    [4250, 4560, 590, 'rock'],
    [4640, 4790, 576, 'crumble'],
    [4880, 5100, 585, 'rock'],
    [5180, 6500, 590, 'rock'],
  ];
  const GEYSERS = [[565, 3.8, 0.0], [1310, 3.4, 1.6], [4205, 3.6, 0.9], [4600, 3.4, 2.2], [5140, 3.9, 0.4]];
  const SERPENT_ZONES = [[1600, 2100], [2420, 2920]];
  const PICKUPS = [
    [1852, 494, 'volley'], [3150, 548, 'heal'], [3780, 462, 'volley'],
    [4420, 548, 'heal'], [5000, 544, 'heal'], [5230, 548, 'volley'],
  ];
  const TRIGGERS = [
    { at: 120, spawn: 'hound', x: 830 },
    { at: 120, msg: 'Hold the bow to draw · stick aims · let go to shoot' },
    { at: 640, spawn: 'bat', x: 1180, y: 370 },
    { at: 1040, wall: true },
    { at: 1280, spawn: 'hound', from: 'wall' },
    { at: 1650, serpents: 0 },
    { at: 1880, spawn: 'ghoul', x: 2330 },
    { at: 1960, spawn: 'bat', x: 2420, y: 330 },
    { at: 2160, spawn: 'hound', from: 'wall' },
    { at: 2440, serpents: 1 },
    { at: 2520, spawn: 'bat', x: 2960, y: 390 }, { at: 2700, spawn: 'imp', x: 3150, y: 320, v: 'garg' },
    { at: 2900, spawn: 'ghoul', x: 3300 },
    { at: 2960, spawn: 'hound', x: 3340 },
    { at: 3150, spawn: 'hound', from: 'wall' },
    { at: 3440, spawn: 'imp', x: 3900, y: 300 }, { at: 3560, spawn: 'bat', x: 4020, y: 380 },
    { at: 3950, spawn: 'ghoul', x: 4480 },
    { at: 4010, spawn: 'hound', from: 'wall' }, { at: 4320, spawn: 'hound', from: 'wall' },
    { at: 4520, spawn: 'imp', x: 4960, y: 340, v: 'garg' }, { at: 4600, spawn: 'bat', x: 5050, y: 400 },
    { at: 4860, spawn: 'hound', x: 5080 },
    { at: ARENA_X, arena: true },
  ];

  // ── shaders ──────────────────────────────────────────────────────────────
  const SKY_FS = `
uniform float u_cam; uniform float u_flash;
void main(){
  vec2 px = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  if (px.y > 500.0) { gl_FragColor = vec4(0.0); return; }
  float h = px.y / 500.0;
  vec2 q = vec2((px.x + u_cam * 0.05) / 210.0, px.y / 115.0);
  q.x += u_time * 0.018;
  vec2 wq = q + vec2(fbm(q * 0.8 + vec2(0.0, u_time * 0.03)), fbm(q * 0.8 + vec2(5.2, -u_time * 0.02))) * 0.9;
  float n = fbm(wq);
  float n2 = fbm(wq * 2.7 + 3.1);
  float under = pow(h, 1.7);
  vec3 col = mix(vec3(0.03, 0.01, 0.009), vec3(0.12, 0.035, 0.028), n);
  col += vec3(0.55, 0.12, 0.03) * under * smoothstep(0.35, 0.9, n) * (0.6 + 0.6 * n2);
  col += vec3(1.0, 0.42, 0.1) * pow(max(0.0, n2 - 0.55), 2.0) * under * 1.6;
  col += u_flash * vec3(0.9, 0.32, 0.22) * smoothstep(0.4, 0.8, n) * (1.0 - h * 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

  const LAVA_FS = `
uniform float u_cam; uniform float u_top; uniform float u_glow; uniform sampler2D u_rock;
// sin-free hashes (Dave Hoskins): stay random far along the level, where sin() loses precision
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float ln(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y); }
float lf(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++) { v += a * ln(p); p = m * p; a *= 0.5; } return v; }
vec2 vor2(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = h22(i + g);
    o = 0.5 + 0.4 * sin(u_time * 0.22 + 6.2831 * o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(d1, d2);
}
vec3 ramp(float h){
  vec3 c = mix(vec3(0.30, 0.03, 0.0), vec3(0.92, 0.18, 0.01), smoothstep(0.1, 0.45, h));
  c = mix(c, vec3(1.0, 0.56, 0.08), smoothstep(0.45, 0.75, h));
  c = mix(c, vec3(1.0, 0.92, 0.6), smoothstep(0.84, 1.0, h));
  return c;
}
void main(){
  vec2 px = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  float d = px.y - u_top;
  if (d < -1.5) { gl_FragColor = vec4(0.0); return; }
  // ground-plane perspective: 1 at the waterline (moves with the rock), larger toward the viewer
  float persp = 1.0 + max(d, 0.0) / 230.0;
  vec2 w = vec2(((px.x - u_res.x * 0.5) / persp + u_cam) / 44.0, (d + 10.0) / (19.0 * persp));
  vec2 flow = vec2(u_time * 0.07, 0.0);
  vec2 warp = vec2(lf(w * 0.6 + flow), lf(w * 0.6 + vec2(4.7, 1.3) - flow)) - 0.5;
  vec2 p = w + warp * 1.5 - flow * 0.6;
  vec2 f = vor2(p);
  float crack = 1.0 - smoothstep(0.0, 0.05 + 0.07 * lf(p * 2.0), f.y - f.x);
  crack *= 0.55 + 0.45 * smoothstep(0.25, 0.65, lf(p * 0.7 + 9.0));
  float molten = smoothstep(0.55, 0.82, lf(p * 0.33 + vec2(u_time * 0.05, -u_time * 0.02)));
  float swirl = lf(p * 2.6 + vec2(u_time * 0.25, u_time * 0.07));
  float heat = max(crack * (0.72 + 0.28 * sin(u_time * 1.7 + p.x * 3.0 + p.y)), molten * (0.55 + 0.5 * swirl));
  vec2 bg = w * vec2(0.8, 1.2);
  vec2 bc = floor(bg);
  float ph = fract(u_time * 0.33 + h12(bc) * 7.0);
  vec2 bp = bc + 0.25 + 0.5 * h22(bc);
  float bd = length(bg - bp);
  float bub = step(0.78, h12(bc + 3.7)) * (1.0 - smoothstep(0.0, 0.035, abs(bd - ph * 0.3))) * (1.0 - ph) * 0.8;
  heat = max(heat, bub);
  float rock = texture2D(u_rock, fract(vec2(w.x * 0.17 + warp.x * 0.35, w.y * 0.17 + warp.y * 0.35))).r;
  vec3 crust = vec3(0.07, 0.022, 0.016) + rock * vec3(0.34, 0.12, 0.075);
  crust *= 0.75 + 0.6 * molten;
  vec3 col = mix(crust, ramp(heat), smoothstep(0.05, 0.42, heat));
  col += vec3(1.0, 0.42, 0.08) * exp(-max(d, 0.0) / 4.5) * 0.85;
  col *= u_glow;
  gl_FragColor = vec4(col, smoothstep(-1.5, 1.5, d));
}`;

  const WALL_FS = `
uniform float u_wx; uniform float u_alpha;
void main(){
  vec2 px = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  float dx = u_wx - px.x;
  if (dx < -110.0) { gl_FragColor = vec4(0.0); return; }
  vec2 q = vec2(px.x / 55.0, px.y / 85.0 + u_time * 1.5);
  float n = fbm(q + vec2(fbm(q * 1.3 - vec2(0.0, u_time * 0.7)) * 1.2, 0.0));
  float tongue = fbm(vec2(px.y / 38.0 + u_time * 2.4, px.x / 28.0));
  // ragged front that leans forward along the ground, tongues licking ahead
  float front = dx + (n - 0.5) * 190.0 + (tongue - 0.5) * 110.0 + (px.y - 420.0) * 0.14;
  float fire = smoothstep(-40.0, 35.0, front);
  float inner = smoothstep(70.0, 280.0, front);
  float bright = fire * (1.0 - inner);
  vec3 hot = mix(vec3(0.85, 0.15, 0.02), vec3(1.0, 0.74, 0.25), clamp(n * 1.5 - 0.25, 0.0, 1.0));
  float embers = smoothstep(0.62, 0.8, fbm(vec2(px.x / 18.0, px.y / 18.0 + u_time * 2.0)));
  vec3 smoke = vec3(0.10, 0.025, 0.012) + vec3(0.5, 0.12, 0.02) * embers * 0.6;
  vec3 col = mix(hot, smoke, inner * 0.9);
  float a = max(bright, inner * 0.94) * u_alpha;
  a *= smoothstep(-40.0, 140.0, px.y + n * 150.0);
  gl_FragColor = vec4(col * (0.75 + 0.7 * bright), a);
}`;

  // ── helpers ──────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // a white silhouette of a sprite (hit flash) and a black one (shadows in the hellfire)
  function tinted(img, color) {
    if (!img) return null;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  DABWorlds.register('hell', {
    title: 'Hell', color: '255,122,52', opaque: true, roster: 'hell',
    landscape: { top: 160, h: 560 },        // landscape camera: world rows 160..720 (lava, rock and the sky over the action)
    music: 'music_hell',
    sounds: ['bow_draw', 'bow_shot', 'arrow_hit', 'volley', 'roll', 'jump', 'land_rock', 'hurt', 'growl', 'hound', 'brute',
      'splash_big', 'fire', 'lava_loop', 'explode'],
    subtitle: r => (r && /dragon|scorch/i.test(r) ? r + ' ' : '') + 'You fell through the burning pond into the underworld.',
    hint: 'Run for the exit gate. The horde is right behind you.',
    howto: ['Stick: run · push up to jump · down = crouch · down + move = crawl', 'Hold ⚔: pull an arrow, draw (kneeling when low) · stick aims · let go',
            '» dodge roll · 🔥 = flaming volley · crouch / crawl ducks under bats and fire'],
    controls: {
      dirs: 'stick',
      stickJump: true,
      buttons: [{ id: 'attack', icon: 'bow' }, { id: 'jump', icon: 'jump' }, { id: 'special', icon: 'dash' }, { id: 'special2', icon: '\uD83D\uDD25', count: () => VOLLEY.n }]
    },
    // skinned photo rigs (tools/assets/rigs): the hounds run, crouch into a stance, leap and land on real joints
    rigs: { hound: A + 'rig/hound', horn: A + 'rig/horn', bat: A + 'rig/bat', imp: A + 'rig/imp', garg: A + 'rig/garg', brute: A + 'rig/brute', ghoul: A + 'rig/ghoul' },
    assets: {
      rock: A + 'rock.jpg', backdrop: A + 'backdrop.jpg', volcano: A + 'volcano.jpg', canyon: A + 'canyon.jpg',
      hound: A + 'hellhound.png', houndGlow: A + 'hellhound_glow.png',
      horn: A + 'hornhound.png', hornGlow: A + 'hornhound_glow.png',
      ghoul: A + 'ghoul.png', ghoulGlow: A + 'ghoul_glow.png',
      bat: A + 'bat.png', batGlow: A + 'bat_glow.png',
      imp: A + 'imp.png', impGlow: A + 'imp_glow.png',
      garg: A + 'gargoyle.png', gargGlow: A + 'gargoyle_glow.png',
      brute: A + 'demon.png', bruteGlow: A + 'demon_glow.png',
    },
    create
  });

  function create(env) {
    const W = env.W;                         // screen width in world px: 390 portrait, ~1200 landscape
    const AS = env.assets;
    VOLLEY.n = 1;
    const cheat = () => window.__hellCheat || {};
    const rigOk = n => !!(env.rigs[n] && env.rigs[n].ready);     // skinned photo rig baked and loaded
    const CROUCH_T = 0.48;                                        // the hound's stance before it pounces

    // creature sprite records: base + glow + white flash + leg split line + eye spots
    const SPR = {
      hound: { img: AS.hound, glow: AS.houndGlow, leg: 0.56, eyes: [], s: 0.36 },        // AI Horde hellhound
      horn: { img: AS.horn, glow: AS.hornGlow, leg: 0.55, eyes: [], s: 0.37 },           // the horde's horned hounds
      ghoul: { img: AS.ghoul, glow: AS.ghoulGlow, leg: 0.56, eyes: [[0.08, 0.25]], s: 0.37, faceLeft: true },  // charred hyena photo
      bat: { img: AS.bat, glow: AS.batGlow, eyes: [[0.455, 0.71], [0.545, 0.71]], s: 0.33 },  // charred bat photo
      imp: { img: AS.imp, glow: AS.impGlow, eyes: [], s: 0.34, wing: 0.56, sh: [0.56, 0.36] },
      garg: { img: AS.garg, glow: AS.gargGlow, eyes: [], s: 0.34, wing: 0.6, sh: [0.6, 0.42] },
      brute: { img: AS.brute, glow: AS.bruteGlow, eyes: [], s: 0.53, hand: [0.1, 0.56] },  // the Gatekeeper
    };
    for (const k in SPR) { SPR[k].white = tinted(SPR[k].img, '#ffb27a'); SPR[k].black = tinted(SPR[k].img, '#000'); }   // warm hit flash

    // ── state ──
    const hero = {
      x: 60, y: 590, vx: 0, vy: 0, face: 1, onGround: true, seg: null, coyote: 0, jumpBuf: 0, jumpCut: false,
      draw: 0, drawing: false, aim: 0.05, shootCd: 0, hurtT: 0, phase: 0, lavaT: 0, hidden: false,
      portalT: 0, safe: { x: 60, seg: null }, target: null, volleyCd: 0,
      atk: 0, atkT: 0, atkStep: 0, atkQ: false, hitSet: new Set(), holdT: 0, charge: 0, castT: 0, runClock: 0,
      crouch: false, crawl: false, crawlClock: 0, quick: false, kneel: false, relKneel: false, relLegs: '', walkClock: 0
    };
    // how tall the archer is right now: crouching / crawling ducks what flies at a standing archer
    const heroTall = () => (hero.crawl ? 22 : hero.crouch ? 40 : 64);
    const segs = SEGS.map(([x0, x1, top, kind], i) => ({ i, x0, x1, top, y: top, kind, st: 'solid', t: 0, vy: 0, alpha: 1 }));
    hero.seg = segs[0]; hero.safe.seg = segs[0];
    const geysers = GEYSERS.map(([x, period, off]) => ({ x, period, off, h: 0, st: 'idle' }));
    const zones = SERPENT_ZONES.map(([x0, x1]) => ({ x0, x1, on: false, st: 'lurk', t: 1.2, s: null }));
    const pickups = PICKUPS.map(([x, y, kind]) => ({ x, y, kind, taken: false, ph: Math.random() * 6 }));
    const triggers = TRIGGERS.map(t => Object.assign({ done: false }, t));
    const enemies = [], arrows = [], shots = [], waves = [], winds = [];
    const wall = { on: false, x: -900, alpha: 0, spawnT: 9 };
    let cam = 0, arena = false, portalOpen = false, portalK = 0, flashT = 7, skyFlash = 0, msgT = 0, msg = '';
    let boss = null, tAll = 0, embAcc = 0, ashAcc = 0, smokeAcc = 0, kills = 0, openT = 0, frameMs = 0;
    env.loop('lava_loop', 0.32);                     // the lava's slow bubbling under everything
    // every particle gets a draw layer ('back' = behind the rock, 'front' = over everything)
    const spawnP = p => { if (!p.layer) p.layer = 'front'; return env.fx.spawn(p); };
    const burstP = (x, y, o) => { env.fx.burst(x, y, o); const L = env.fx.list; for (let i = Math.max(0, L.length - (o.n || 12)); i < L.length; i++) if (!L[i].layer) L[i].layer = o.layer || 'front'; };

    // ── shaders + cached art ──
    const skyProg = env.shader(SKY_FS), lavaProg = env.shader(LAVA_FS), wallProg = env.shader(WALL_FS);
    const CS = 2;                                   // cache resolution (canvas px per app px)
    const rockPattern = (g) => {
      if (!AS.rock) return '#2a1d18';
      const p = g.createPattern(AS.rock, 'repeat');
      try { p.setTransform(new DOMMatrix().scale(0.55).translate(Math.random() * 400, Math.random() * 200)); } catch (e) { /* old browsers */ }
      return p;
    };
    for (const s of segs) bakeSeg(s);
    const backdrop = bakeBackdrop();
    const volcano = feather(AS.volcano, 300, 0.22, 0.3, 0.32);
    const canyon = feather(AS.canyon, 430, 0.2, 0.25, 0.2);
    const cliffs = makeCliffs();
    const spires = makeSpires();
    const fallTex = makeFallTexture();
    const segSprite = makeSerpentSegment();
    let G = null;                                   // gradients cached per render context

    function bakeSeg(s) {
      const w = s.x1 - s.x0, crumble = s.kind === 'crumble';
      const depth = LAVA_Y - s.top + 16;                    // the lava (drawn after) buries the base
      const flare = Math.min(20, 5 + depth * 0.18);
      const pad = Math.ceil(flare + 10);
      const cw = w + pad * 2, ch = depth + 14;
      const cv = document.createElement('canvas'); cv.width = Math.ceil(cw * CS); cv.height = Math.ceil(ch * CS);
      const g = cv.getContext('2d'); g.scale(CS, CS);
      const R = seeded(s.i * 977 + 13);
      const top = 12, rad = Math.min(14, w * 0.18);
      // outline: rounded lumpy top (walkable at y = top), sides flaring and notched down into the lava
      g.beginPath();
      const steps = Math.max(3, Math.round(w / 18));
      g.moveTo(pad, top + rad);
      g.quadraticCurveTo(pad, top, pad + rad, top - 0.5);
      for (let k = 1; k < steps; k++) {
        const x = pad + rad + ((w - 2 * rad) * k) / steps;
        g.lineTo(x, top - 1 + (R() - 0.5) * 3.5);
      }
      g.lineTo(pad + w - rad, top - 0.5);
      g.quadraticCurveTo(pad + w, top, pad + w, top + rad);
      const side = (dir) => {
        const pts = [];
        for (let y = top + rad + 8; y < ch; y += 7 + R() * 6) {
          const f = (y - top) / depth;
          let off = Math.pow(clamp(f, 0, 1), 1.4) * flare + (R() - 0.5) * 5;
          if (R() < 0.18) off -= 4 + R() * 5;                 // notches
          pts.push([dir > 0 ? pad + w + off : pad - off, y]);
        }
        return pts;
      };
      for (const [x, y] of side(1)) g.lineTo(x, y);
      g.lineTo(pad + w + flare, ch); g.lineTo(pad - flare, ch);
      const left = side(-1);
      for (let k = left.length - 1; k >= 0; k--) g.lineTo(left[k][0], left[k][1]);
      g.closePath();
      g.save(); g.clip();
      g.fillStyle = rockPattern(g); g.fillRect(0, 0, cw, ch);
      // form shading: lit top, dark body, lava light at the waterline
      let gr = g.createLinearGradient(0, top, 0, ch);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.18, 'rgba(10,3,2,0.25)');
      gr.addColorStop(0.75, 'rgba(8,2,1,0.62)'); gr.addColorStop(1, 'rgba(8,2,1,0.45)');
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      gr = g.createLinearGradient(0, 0, cw, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.12, 'rgba(0,0,0,0)');
      gr.addColorStop(0.88, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      g.globalCompositeOperation = 'lighter';
      const wl = top + (LAVA_Y - s.top);                  // the waterline in cache space
      gr = g.createLinearGradient(0, wl - 56, 0, wl);
      gr.addColorStop(0, 'rgba(255,70,10,0)'); gr.addColorStop(0.7, 'rgba(255,80,15,0.3)'); gr.addColorStop(1, 'rgba(255,150,50,0.62)');
      g.fillStyle = gr; g.fillRect(0, wl - 56, cw, 60);
      // glowing fissures (more on crumbling slabs — that's the warning)
      const n = crumble ? 4 : Math.max(1, Math.round(w / 140));
      for (let k = 0; k < n; k++) {
        let fx = pad + R() * w, fy = crumble ? top + 2 : top + 20 + R() * (depth * 0.5);
        g.beginPath(); g.moveTo(fx, fy);
        const len = crumble ? 5 : 4 + Math.round(R() * 5);
        for (let j = 0; j < len; j++) { fx += R() * 12 - 6; fy += 5 + R() * 8; g.lineTo(fx, fy); }
        g.strokeStyle = crumble ? 'rgba(255,120,30,0.85)' : 'rgba(255,90,20,0.55)';
        g.lineWidth = crumble ? 1.6 : 1.2; g.shadowColor = 'rgba(255,90,10,0.9)'; g.shadowBlur = 6;
        g.stroke();
      }
      g.shadowBlur = 0;
      g.restore();
      // cool rim light along the top lip
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = 'rgba(230,200,190,0.16)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(pad, top + 1.5); g.lineTo(pad + w, top + 1.5); g.stroke();
      s.cache = cv; s.cw = cw; s.ch = ch; s.ox = -pad; s.oy = -top;
    }

    function bakeBackdrop() {
      const img = AS.backdrop;
      if (!img) return null;
      const h = 470, w = Math.round(img.width * h / img.height);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const gr = g.createLinearGradient(0, 0, 0, 150);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      return c;
    }

    // 1D value noise for ridge lines
    function noise1(seed) {
      const R = seeded(seed), v = [];
      for (let i = 0; i < 512; i++) v.push(R());
      return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(v[i & 511], v[(i + 1) & 511], u); };
    }
    // an image scaled to height h with soft edges (fx = side fade, ft = top, fb = bottom, as fractions)
    function feather(img, h, fx, ft, fb) {
      if (!img) return null;
      const w = Math.round(img.width * h / img.height);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const m = document.createElement('canvas'); m.width = w; m.height = h;
      const mg = m.getContext('2d');
      let gr = mg.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(fx, 'rgba(0,0,0,1)'); gr.addColorStop(1 - fx, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = gr; mg.fillRect(0, 0, w, h);
      mg.globalCompositeOperation = 'destination-in';
      gr = mg.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(ft, 'rgba(0,0,0,1)'); gr.addColorStop(1 - fb, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = gr; mg.fillRect(0, 0, w, h);
      g.drawImage(m, 0, 0);
      return c;
    }

    function makeCliffs() {
      // two ridge silhouettes (parallax 0.25 and 0.42) — fbm-shaped, with lava falls from the far one
      const n1 = noise1(77), n2 = noise1(91), ridges = [];
      for (const [par, base, amp, sc, col0, col1, nz] of [[0.25, 478, 70, 0.006, '#3b1710', '#64230f', n1], [0.42, 530, 46, 0.009, '#2a0f0a', '#4a170b', n2]]) {
        const pts = [];
        for (let x = -100; x <= 3200; x += 12) {
          let y = 0, a = 1, f = sc, norm = 0;
          for (let o = 0; o < 4; o++) { y += (nz(x * f) - 0.5) * a; norm += a; a *= 0.5; f *= 2.1; }
          y = base - (y / norm + 0.5) * amp * 2 + Math.abs(nz(x * sc * 0.3 + 40) - 0.5) * amp;
          pts.push([x, y]);
        }
        ridges.push({ par, pts, col0, col1 });
      }
      const R = seeded(5), falls = [];
      for (let x = 160; x < 3200; x += 420 + Math.floor(R() * 260)) falls.push({ x, w: 8 + R() * 10, sp: 0.8 + R() * 0.5 });
      return { ridges, falls };
    }

    function makeSpires() {
      // tapered basalt stacks rising from the lava (parallax 0.6)
      const R = seeded(31), list = [];
      for (let x = 160; x < 4400; x += 420 + R() * 420) {
        const W0 = 130 + R() * 110, top = 455 + R() * 70;
        const ch = LAVA_Y - top + 12, cw = W0 + 40;
        const c = document.createElement('canvas'); c.width = Math.ceil(cw * CS); c.height = Math.ceil(ch * CS);
        const g = c.getContext('2d'); g.scale(CS, CS);
        const cx = cw / 2, lean = (R() - 0.5) * 16;
        const wAt = f => W0 * (0.22 + 0.78 * Math.pow(f, 0.55)) * (0.9 + 0.2 * R());
        g.beginPath();
        const N = 14;
        for (let k = 0; k <= N; k++) { const f = k / N; g.lineTo(cx - wAt(f) / 2 + lean * (1 - f) + (R() - 0.5) * 5, f * ch); }
        for (let k = N; k >= 0; k--) { const f = k / N; g.lineTo(cx + wAt(f) / 2 + lean * (1 - f) + (R() - 0.5) * 5, f * ch); }
        g.closePath();
        g.save(); g.clip();
        g.fillStyle = rockPattern(g); g.fillRect(0, 0, cw, ch);
        let gr = g.createLinearGradient(0, 0, cw, 0);
        gr.addColorStop(0, 'rgba(30,10,7,0.8)'); gr.addColorStop(0.45, 'rgba(40,14,9,0.4)'); gr.addColorStop(1, 'rgba(30,10,7,0.75)');
        g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
        g.fillStyle = 'rgba(120,40,20,0.22)'; g.fillRect(0, 0, cw, ch);       // aerial haze
        g.globalCompositeOperation = 'lighter';
        gr = g.createLinearGradient(0, ch - 160, 0, ch);
        gr.addColorStop(0, 'rgba(255,60,10,0)'); gr.addColorStop(1, 'rgba(255,90,20,0.5)');
        g.fillStyle = gr; g.fillRect(0, ch - 160, cw, 160);
        g.restore();
        list.push({ x, top, c, w: cw, h: ch });
      }
      return list;
    }

    function makeFallTexture() {
      const c = document.createElement('canvas'); c.width = 48; c.height = 256;
      const g = c.getContext('2d'); const R = seeded(5);
      g.fillStyle = '#7a1604'; g.fillRect(0, 0, 48, 256);
      for (let i = 0; i < 70; i++) {
        const x = R() * 48, w = 1 + R() * 4, y = R() * 256, l = 30 + R() * 140;
        const v = R();
        g.fillStyle = v > 0.7 ? 'rgba(255,230,140,0.8)' : v > 0.35 ? 'rgba(255,140,30,0.7)' : 'rgba(40,8,4,0.55)';
        g.fillRect(x, y, w, l); g.fillRect(x, y - 256, w, l);
      }
      return c;
    }

    // serpent skin: basalt plates split by glowing seams, lit from below by the lava;
    // strip-mapped along the body so it bends smoothly
    function makeSerpentSegment() {
      const c = document.createElement('canvas'); c.width = 96; c.height = 40;
      const g = c.getContext('2d'); const R = seeded(12);
      g.fillStyle = rockPattern(g); g.fillRect(0, 0, 96, 40);
      let gr = g.createLinearGradient(0, 0, 0, 40);
      gr.addColorStop(0, 'rgba(70,40,34,0.35)'); gr.addColorStop(0.35, 'rgba(10,3,2,0.25)'); gr.addColorStop(0.8, 'rgba(8,2,1,0.7)'); gr.addColorStop(1, 'rgba(8,2,1,0.9)');
      g.fillStyle = gr; g.fillRect(0, 0, 96, 40);
      g.globalCompositeOperation = 'lighter';
      gr = g.createLinearGradient(0, 26, 0, 40);
      gr.addColorStop(0, 'rgba(255,80,15,0)'); gr.addColorStop(1, 'rgba(255,120,30,0.6)');
      g.fillStyle = gr; g.fillRect(0, 26, 96, 14);
      g.strokeStyle = 'rgba(255,150,50,0.9)'; g.shadowColor = 'rgba(255,100,20,1)'; g.shadowBlur = 5; g.lineWidth = 1.4;
      for (let x = 6; x < 96; x += 16) {                // plate seams across the body (period 16 → tiles)
        g.beginPath(); g.moveTo(x + R() * 3, 2);
        for (let y = 8; y <= 38; y += 6) g.lineTo(x + (R() - 0.5) * 5, y);
        g.stroke();
      }
      return c;
    }

    // ── geometry queries ──
    const solid = s => s.st === 'solid' || s.st === 'shake';
    function segAt(x, y0) {          // the walkable segment under x (topmost at/below y0)
      let best = null;
      for (const s of segs) {
        if (!solid(s) || x < s.x0 + 2 || x > s.x1 - 2) continue;
        if (y0 !== undefined && s.y < y0 - 4) continue;
        if (!best || s.y < best.y) best = s;
      }
      return best;
    }

    function safeSegNear(x) {        // the closest solid rock at or behind x (never a crumbling slab)
      let best = segs[0];
      for (const s of segs) if (s.kind !== 'crumble' && s.x0 <= x && s.x0 >= best.x0) best = s;
      return best;
    }

    // ── spawning ──
    function spawn(type, o) {
      const e = { type, x: o.x, y: o.y, vx: 0, vy: 0, face: -1, st: 'run', t: 0, cd: 0.6, phase: Math.random() * 6,
        hp: 1, hitT: 0, dying: 0, onGround: false, stuck: [], seed: Math.random() * 10, bit: false };
      if (type === 'hound') { e.hp = 2; e.speed = rand(235, 270); e.st = 'run'; }
      if (type === 'ghoul') { e.hp = 5; e.st = 'stalk'; e.seg = segAt(e.x); }
      if (type === 'bat') { e.hp = 1.5; e.st = 'fly'; e.baseY = o.y; e.cd = rand(0.4, 1.0); }
      if (type === 'imp') { e.hp = 2.5; e.st = 'fly'; e.baseY = o.y; e.cd = rand(0.6, 1.2); e.spitCd = rand(1.5, 2.5); e.var = o.v || 'imp'; }
      if (type === 'brute') { e.hp = e.maxHp = Math.round(44 * env.tough); e.st = 'sleep'; e.face = -1; }
      else e.hp *= env.tough;                                  // Adventure stage toughness
      e.maxHp = e.maxHp || e.hp;
      enemies.push(e);
      return e;
    }
    function spawnFromWall() {
      if (!wall.on) return;
      let x = wall.x + 26, s = segAt(x);
      if (!s) { for (const q of segs) if (solid(q) && q.x1 > x + 30) { s = q; break; } if (!s) return; x = Math.max(x, s.x0 + 24); }
      const e = spawn('hound', { x, y: s.y });
      e.speed += 25; e.fromWall = true; e.onGround = true; e.var = 'horn';
      burstP(x, s.y - 40, { n: 18, speed: 220, rgb: '255,150,60', kind: 'spark', life: 0.6 });
    }
    function fire(t) {
      if (t.spawn === 'hound') {
        if (t.from === 'wall') return spawnFromWall();
        const s = segAt(t.x); if (!s) return;
        const e = spawn('hound', { x: t.x, y: s.y }); e.onGround = true;
      } else if (t.spawn === 'ghoul') {
        const s = segAt(t.x); if (!s) return;
        const e = spawn('ghoul', { x: t.x, y: s.y }); e.onGround = true; e.seg = s;
      } else if (t.spawn === 'bat' || t.spawn === 'imp') {
        spawn(t.spawn, { x: Math.max(t.x, cam + W + 60), y: t.y, v: t.v });
      } else if (t.wall) {
        wall.on = true; wall.x = hero.x - 640; wall.spawnT = 6;
        say('The horde is coming — keep moving!');
        env.shake(0.4);
      } else if (t.serpents !== undefined) zones[t.serpents].on = true;
      else if (t.msg) say(t.msg);
      else if (t.arena) {
        arena = true;
        if (boss && boss.st === 'sleep') { boss.st = 'roar'; boss.t = 1.7; env.shake(0.7); sfx('brute', boss.x, { rate: 0.75, jitter: 0 }); }
        env.hud.objective = 'Defeat the Gatekeeper';
        say('The Gatekeeper wakes!');
      }
    }
    function say(text) { msg = text; msgT = 3.2; }
    boss = spawn('brute', { x: 5880, y: 590 });
    boss.onGround = true;
    env.hud.objective = 'Reach the exit gate';
    env.hud.progress = 0;

    const sfx = (n, x, o) => env.sfxAt(n, (x === undefined ? hero.x : x) - cam, o);
    // a wound: droplets thrown along the blow; they stain the rock they land on (lava just takes them)
    function bleed(x, y, dir, big) {
      const s = segAt(x, y - 2);
      env.fx.blood(x, y, { dir, n: big ? 14 : 8, speed: big ? 250 : 180, size: big ? 2.5 : 2, floor: s ? s.y + 1 : undefined, layer: 'front' });
    }
    // ── hero ──
    function hurtHero(n, srcX, text, kb) {
      if (hero.lavaT > 0 || hero.portalT > 0) return false;
      if (cheat().god) env.heal(100);
      const ok = env.damage(n, { x: hero.x - cam, y: hero.y - 70, text: text || `-${n}` });
      if (ok) {
        const d = Math.sign(hero.x - srcX) || -hero.face;
        hero.vx = d * (kb === undefined ? 230 : kb); hero.vy = Math.min(hero.vy, kb === undefined ? -250 : -160); hero.onGround = false; hero.hurtT = 0.32;
        burstP(hero.x, hero.y - 40, { n: 6, speed: 160, rgb: '255,120,80', kind: 'spark', life: 0.35 });
        bleed(hero.x - d * 8, hero.y - 64, d > 0 ? -0.5 : Math.PI + 0.5, n >= 12); sfx('hurt');
        env.hitstop(0.05);
      }
      return ok;
    }
    function lavaDeath() {
      hero.lavaT = 0.8; hero.hidden = true; hero.drawing = false; hero.draw = 0;
      env.damage(22, { x: hero.x - cam, y: LAVA_Y - 40, text: '-22', invuln: 1.0 });
      if (cheat().god) env.heal(100);
      splash(hero.x, true); sfx('splash_big', hero.x, { rate: 0.6 }); sfx('fire', hero.x, { vol: 0.7 });
      env.shake(0.55); env.flash('255,120,40', 0.35);
    }
    function respawnHero() {
      const s = hero.safe.seg && solid(hero.safe.seg) && hero.safe.seg.kind !== 'crumble' ? hero.safe.seg : safeSegNear(hero.safe.x);
      hero.x = clamp(hero.safe.x, s.x0 + 30, s.x1 - 30); hero.y = s.y; hero.vx = 0; hero.vy = 0;
      hero.onGround = true; hero.seg = s; hero.hidden = false;
      env.invuln(1.4);
      if (wall.on && wall.x > hero.x - 330) wall.x = hero.x - 420;     // a fair restart
      for (const q of segs) if (q.kind === 'crumble' && (q.st === 'gone' || q.st === 'fall')) { q.st = 'rise'; q.t = 0.6; }   // slabs come back for the retry
      burstP(hero.x, hero.y - 36, { n: 20, speed: 140, rgb: env.charRgb, kind: 'glow', life: 0.7, size: 2 });
    }
    function splash(x, big) {
      const n = big ? 26 : 12;
      for (let i = 0; i < n; i++) spawnP({ x: x + rand(-14, 14), y: LAVA_Y, vx: rand(-140, 140), vy: rand(-420, -160) * (big ? 1 : 0.7),
        g: 900, kind: 'glow', rgb: Math.random() < 0.5 ? '255,170,60' : '255,90,20', size: rand(1.6, 3.4), life: rand(0.5, 1.0), drag: 0.3, layer: 'front' });
      for (let i = 0; i < (big ? 5 : 2); i++) spawnP({ x: x + rand(-20, 20), y: LAVA_Y - 10, vx: rand(-20, 20), vy: rand(-60, -30),
        kind: 'smoke', rgb: '70,45,40', size: rand(18, 30), grow: 26, life: rand(1.2, 2), alpha: 0.6, layer: 'front' });
    }

    function pickTarget() {
      let best = null, bs = 1e9;
      for (const e of enemies) {
        if (e.dying || e.st === 'sleep' || e.type === 'serpent') continue;
        const dx = e.x - hero.x;
        if (Math.abs(dx) > 560) continue;
        const behind = Math.sign(dx) !== hero.face;
        const sc = Math.abs(dx) + Math.abs(aimY(e) - hero.y) * 0.5 + (behind ? 160 : 0);
        if (sc < bs) { bs = sc; best = e; }
      }
      for (const z of zones) if (z.s && !z.s.dead && z.st === 'leap') {
        const dx = z.s.hx - hero.x;
        if (Math.abs(dx) < 420 && Math.abs(dx) + 100 < bs) { bs = Math.abs(dx) + 100; best = { serpent: z.s, x: z.s.hx, y: z.s.hy, vx: 0 }; }
      }
      return best;
    }
    function aimY(e) {
      if (e.serpent) return e.y;
      if (e.type === 'bat' || e.type === 'imp') return e.y;
      if (e.type === 'brute') return e.y - 150;
      if (e.type === 'ghoul') return e.y - 45;
      return e.y - 38;
    }
    // The archer sprite has 7 aim poses (hold_<deg>); each frame carries where its nocked arrow is
    // drawn (nock / tip, exported from the 3D render). The arrow is fired from that exact spot, and
    // the pose shown is the one whose drawn arrow is closest to the stick's angle.
    const HERO_H = 132;
    let aimVars = null, arrowLen = 37;
    function aimVariants() {
      if (aimVars) return aimVars;
      const HA = env.hero, out = [];
      if (!HA.ready) return [{ tag: '0', ang: 0 }];
      for (const n of HA.names()) {
        if (!n.startsWith('hold_')) continue;
        const pose = { anim: n, t: 0, facing: 1, height: HERO_H }, a = HA.point(pose, 'nock'), b = HA.point(pose, 'tip');
        const ang = a && b ? Math.atan2(-(b.y - a.y), b.x - a.x) : (+n.slice(5).replace('m', '-') || 0) * Math.PI / 180;
        if (a && b && n === 'hold_0') arrowLen = Math.hypot(b.x - a.x, b.y - a.y);
        out.push({ tag: n.slice(5), ang });
      }
      return (aimVars = out.length ? out : [{ tag: '0', ang: 0 }]);
    }
    function aimTag(rad) {
      let best = null;
      for (const v of aimVariants()) if (!best || Math.abs(v.ang - rad) < Math.abs(best.ang - rad)) best = v;
      return best.tag;
    }
    // the bow pose's legs: 'k' kneeling, 'a' mid-jump, 'w' walking, '' standing (if that set was rendered)
    function bowLegs() {
      const h = hero, HA = env.hero, tag = aimTag(h.aim);
      if (h.kneel && HA.has('khold_' + tag)) return 'k';
      if (!h.onGround && HA.has('ahold_' + tag)) return 'a';
      if (h.onGround && Math.abs(h.vx) > 30 && HA.has('whold_' + tag)) return 'w';
      return '';
    }
    const holdTime = legs => (legs === 'w' ? hero.walkClock : tAll);       // the walking hold steps with the feet
    function bowOrigin() {
      const h = hero, HA = env.hero;
      if (HA.ready) {
        const legs = bowLegs();
        const pose = { anim: legs + 'hold_' + aimTag(h.aim), t: holdTime(legs), facing: h.face, height: HERO_H };
        const tip = HA.point(pose, 'tip');
        // the flying arrow's point sits 10 px behind its drawn head, so it leaves the bow exactly where the nocked one was
        if (tip) return { x: h.x + tip.x - h.face * Math.cos(h.aim) * 10, y: h.y + tip.y + Math.sin(h.aim) * 10 };
      }
      return { x: h.x + h.face * Math.cos(h.aim) * 30, y: h.y - 40 - Math.sin(h.aim) * 19 };
    }
    const ARROW_G = 360, AIM_MIN = -0.45, AIM_MAX = 0.87;     // flat, fast arrows; aim -25..50 deg
    const DRAW_T = 0.55, NOCKED = 0.62;                          // full draw 0.55 s; the arrow is on the string at 0.34 s
    const bowPower = () => Math.max(0.5, (hero.draw - NOCKED) / (1 - NOCKED));     // a quick shot still drops a hound
    const arrowSpeed = draw => 760 + 640 * draw;
    function solveAim(tg, speed) {
      const o = bowOrigin(), g = ARROW_G;
      let tx = tg.x, ty = aimY(tg);
      for (let k = 0; k < 2; k++) {
        const dx = Math.abs(tx - o.x), dy = o.y - ty;
        const v2 = speed * speed, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
        let th = disc < 0 ? Math.atan2(dy, dx) + 0.25 : Math.atan((v2 - Math.sqrt(disc)) / (g * Math.max(dx, 1)));
        th = clamp(th, AIM_MIN, AIM_MAX);
        const tf = dx / Math.max(80, speed * Math.cos(th));
        tx = tg.x + (tg.vx || 0) * tf * 0.8;
        if (k === 1) return th;
      }
      return 0.05;
    }
    function shoot(draw, flaming, angOff) {
      const o = bowOrigin(), sp = arrowSpeed(draw), a = hero.aim + (angOff || 0);
      arrows.push({ x: o.x, y: o.y, px: o.x, py: o.y, vx: Math.cos(a) * sp * hero.face, vy: -Math.sin(a) * sp,
        dmg: flaming ? 1.4 : 1 + 2 * draw, fire: !!flaming, life: 2.6, stuck: null, ground: false });
      if (draw > 0.9 || flaming) burstP(o.x, o.y, { n: 6, speed: 90, rgb: flaming ? '255,150,50' : '255,230,190', kind: 'spark', life: 0.25, angle: hero.face > 0 ? -a : Math.PI + a, spread: 0.8 });
    }

    function updateHero(dt, I) {
      const h = hero;
      if (h.portalT > 0) {
        h.portalT += dt; h.x = lerp(h.x, PORTAL_X, 1 - Math.exp(-dt * 5)); h.y = lerp(h.y, 560, 1 - Math.exp(-dt * 4));
        if (h.portalT > 1.05 && !h.won) { h.won = true; env.flash('180,255,230', 0.9); env.win(); }
        return;
      }
      if (h.lavaT > 0) { h.lavaT -= dt; if (h.lavaT <= 0) respawnHero(); return; }
      h.hurtT = Math.max(0, h.hurtT - dt); h.shootCd = Math.max(0, h.shootCd - dt); h.volleyCd = Math.max(0, h.volleyCd - dt);
      h.coyote = Math.max(0, h.coyote - dt); h.jumpBuf = Math.max(0, h.jumpBuf - dt);
      let mv = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      if (h.hurtT > 0) mv = 0;

      // bow: hold ⚔ to draw, let go to loose. While drawing, the stick aims: push it the way you
      // want to shoot (the hero turns and plants his feet). Stick centred = straight ahead.
      // Nothing aims for you; the dotted line shows where the arrow will fly.
      const sax = I.ax || 0, say = I.ay || 0, stickAim = Math.hypot(sax, say) > 0.4;
      // the draw follows the sprite: 0 .. NOCKED = reach back to the quiver and nock an arrow,
      // NOCKED .. 1 = pull the string to the jaw. Let go early and he still nocks, then looses a quick shot.
      const loose = () => {
        h.relLegs = bowLegs(); shoot(bowPower()); h.relKneel = h.kneel; h.drawing = false; h.kneel = false; h.draw = 0; h.quick = false; h.shootCd = 0.1; h.relT = 0.32; h.relAim = h.aim;
        sfx('bow_shot', h.x, { rate: 0.9 + 0.2 * h.relT });
      };
      if ((I.held.attack || h.quick) && h.shootCd <= 0 && h.hurtT <= 0 && !(h.rollT > 0)) {
        if (!h.drawing) {
          h.drawing = true; h.draw = 0; h.quick = false;
          h.kneel = h.onGround && (h.crouch || h.crawl || say > 0.55);   // from low: shoot kneeling (out of a crawl too)
          h.crawl = false; h.crouch = h.kneel;
          sfx('jump', h.x, { vol: 0.25, rate: 1.4 });
        }
        const was = h.draw;
        h.draw = Math.min(1, h.draw + dt / DRAW_T);
        if (was < NOCKED && h.draw >= NOCKED) sfx('bow_draw', h.x, { vol: 0.7 });
        if (h.quick && h.draw >= NOCKED + 0.05) loose();
      } else if (h.drawing && !I.held.attack) {
        if (h.draw >= NOCKED) loose(); else h.quick = true;
      }
      env.noStickJump = h.drawing;                       // pushing up to aim must not jump
      h.aimMem = Math.max(0, (h.aimMem || 0) - dt);
      let wantAim = 0.04;
      if (I.aimAt != null) {                               // autopilot (scripted tests) only
        if (I.aimFace) h.face = I.aimFace;
        wantAim = I.aimAt;
      } else if (h.drawing && stickAim) {
        if (Math.abs(sax) > 0.15) h.face = Math.sign(sax);
        if (h.kneel) mv = 0;                               // walking while aiming (kneeling stays put)
        wantAim = h.stickAim = clamp(Math.atan2(-say, Math.abs(sax) + 0.001), AIM_MIN, AIM_MAX);
        h.aimMem = 0.18;                                   // letting go of stick + button together keeps the aim
      } else if (h.drawing && h.aimMem > 0) wantAim = h.stickAim;
      else if (mv) h.face = mv;
      h.aim = lerp(h.aim, wantAim, 1 - Math.exp(-dt * 22));
      if (h.relT > 0) h.relT -= dt;
      // » dodge roll (brief invulnerability)
      h.rollCd = Math.max(0, (h.rollCd || 0) - dt);
      if (I.pressed.special && h.rollCd <= 0 && h.onGround && h.hurtT <= 0) { h.kneel = false;
        const dir = Math.abs(sax) > 0.25 ? Math.sign(sax) : h.face;
        h.rollT = 0.5; h.rollCd = 0.65; h.face = dir; h.vx = dir * 330; h.drawing = false; h.draw = 0; env.invuln(0.45); sfx('roll');
        burstP(h.x, h.y, { n: 6, speed: 80, rgb: '120,90,80', kind: 'debris', life: 0.4, angle: -Math.PI / 2, spread: 2.2, g: 300, size: 2 });
      }
      if (h.rollT > 0) { h.rollT -= dt; mv = 0; }
      if (I.pressed.special2 && VOLLEY.n > 0 && h.volleyCd <= 0) {
        VOLLEY.n--; h.volleyCd = 0.6;
        for (const off of [-0.13, -0.06, 0.01, 0.08, 0.15]) shoot(1, true, off);
        sfx('volley');
        env.flash('255,140,40', 0.25); env.shake(0.2);
      }

      // crouch (stick down) / crawl (down + left or right): low under bats, spit and fire
      if (h.drawing && h.kneel) { h.crouch = true; h.crawl = false; }    // kneeling until the arrow is loosed
      else {
        h.crouch = h.onGround && !h.drawing && !(h.rollT > 0) && h.hurtT <= 0 && say > 0.55 && !I.held.attack && !I.pressed.jump;
        h.crawl = h.crouch && Math.abs(sax) > 0.3;
      }
      if (h.crouch && !h.crawl) mv = 0;
      if (h.crawl) h.crawlClock += dt * Math.abs(h.vx) / 60;
      // run + jump
      const top = h.crawl ? 60 : h.drawing && h.onGround ? 85 : 192;     // drawing slows you on foot, never mid-jump
      if ((h.onGround || mv) && !(h.rollT > 0)) h.vx += (mv * top - h.vx) * Math.min(1, dt * (h.onGround ? 14 : 6));
      if (I.pressed.jump) h.jumpBuf = 0.13;
      if (h.jumpBuf > 0 && (h.onGround || h.coyote > 0)) {
        h.vy = -665; h.onGround = false; h.coyote = 0; h.jumpBuf = 0; h.jumpCut = false; sfx('jump', h.x, { vol: 0.6 });
        if (mv) h.vx = mv * Math.max(Math.abs(h.vx), 192);   // a jump always launches at full run speed
        burstP(h.x, h.y, { n: 6, speed: 70, rgb: '120,90,80', kind: 'debris', life: 0.4, angle: -Math.PI / 2, spread: 2.2, g: 300, size: 2 });
      }
      if (!I.held.jump && h.vy < -280 && !h.jumpCut && !h.onGround) { h.vy *= 0.6; h.jumpCut = true; }
      h.vy = Math.min(h.vy + 1700 * dt, 950);
      const py = h.y;
      h.x += h.vx * dt; h.y += h.vy * dt;
      if (arena) h.x = Math.max(h.x, ARENA_X - 16);
      h.x = Math.max(h.x, -300);
      if (wall.on && !arena) h.x = Math.max(h.x, wall.x - 10);

      if (h.onGround) {
        const s = h.seg;
        if (!s || !solid(s) || h.x < s.x0 - 6 || h.x > s.x1 + 6) { h.onGround = false; h.coyote = 0.1; }
        else { h.y = s.y; h.vy = 0; }
      }
      if (!h.onGround && h.vy >= 0) {
        for (const s of segs) {
          if (!solid(s) || h.x < s.x0 - 6 || h.x > s.x1 + 6) continue;
          if (py <= s.y + 1 && h.y >= s.y) {
            h.y = s.y; h.vy = 0; h.onGround = true; h.seg = s; sfx('land_rock', h.x, { vol: 0.7 });
            burstP(h.x, h.y, { n: 4, speed: 60, rgb: '110,85,75', kind: 'debris', life: 0.35, angle: -Math.PI / 2, spread: 2.6, g: 300, size: 2 });
            break;
          }
        }
      }
      if (h.onGround) {
        const s = h.seg;
        if (s.kind === 'crumble' && s.st === 'solid') { s.st = 'shake'; s.t = 0.72; }
        if (s.kind !== 'crumble') h.safe = { x: clamp(h.x, s.x0 + 40, s.x1 - 40), seg: s };
      }
      if (h.y > LAVA_Y + 6) lavaDeath();
      h.phase += dt * Math.abs(h.vx) / 13;
      h.runClock += dt * clamp(Math.abs(h.vx) / 192, 0.45, 1.25);   // sprite run cycle keeps pace with the feet
      h.walkClock += dt * Math.abs(h.vx) / 70;                          // the walking draw's stride
    }

    // ── arrows ──
    function updateArrows(dt) {
      for (let i = arrows.length - 1; i >= 0; i--) {
        const a = arrows[i];
        a.life -= dt;
        if (a.stuck) {
          if (a.stuck.dying || a.life <= 0) { arrows.splice(i, 1); continue; }
          if (a.fire && Math.random() < 0.4) spawnP({ x: a.stuck.x + a.ox, y: a.stuck.y + a.oy, vx: rand(-10, 10), vy: rand(-50, -20), kind: 'glow', rgb: '255,140,40', size: 1.6, life: 0.5, layer: 'front' });
          continue;
        }
        if (a.ground) { if (a.life <= 0) arrows.splice(i, 1); continue; }
        a.px = a.x; a.py = a.y;
        a.vy += ARROW_G * dt;
        let hit = false;
        for (let k = 1; k <= 3 && !hit; k++) {
          const x = a.x + a.vx * dt * k / 3, y = a.y + a.vy * dt * k / 3;
          for (const e of enemies) {
            if (e.dying || e.st === 'sleep' || a.spent) continue;
            if (hitTest(e, x, y, 5)) {
              if (damageEnemy(e, a.dmg, a.vx > 0 ? 1 : -1, a.fire)) stickArrow(a, e, x, y);
              else { a.vx *= -0.25; a.vy = -260; a.x = x - Math.sign(a.vx || 1) * 8; a.fire = false; a.spent = true; }
              hit = true; break;
            }
          }
          if (!hit) for (const z of zones) {
            const s = z.s;
            if (s && !s.dead && z.st === 'leap' && serpentHit(s, x, y, 6)) { hurtSerpent(z, a.dmg, a.fire); hit = true; arrows.splice(i, 1); break; }
          }
        }
        if (hit) continue;
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.fire && Math.random() < 0.7) spawnP({ x: a.x, y: a.y, vx: rand(-20, 20), vy: rand(-40, 0), kind: 'glow', rgb: Math.random() < 0.5 ? '255,170,60' : '255,90,30', size: rand(1.4, 2.6), life: 0.35, layer: 'front' });
        const s = segAt(a.x);
        if (s && a.y >= s.y && a.y < s.y + 40) {
          a.ground = true; a.y = s.y + 4; a.life = 2.4;
          burstP(a.x, s.y, { n: 5, speed: 90, rgb: '255,210,160', kind: 'spark', life: 0.25, angle: -Math.PI / 2, spread: 2 });
        } else if (a.y >= LAVA_Y) {
          splash(a.x, false); arrows.splice(i, 1);
        } else if (a.life <= 0 || a.x < cam - 120 || a.x > cam + W + 260) arrows.splice(i, 1);
      }
    }
    function stickArrow(a, e, x, y) {
      a.stuck = e; a.ox = x - e.x; a.oy = y - e.y; a.ang = Math.atan2(a.vy, a.vx); a.life = 1.4;
      a.side = e.face;
    }

    // ── enemies ──
    function box(e) {
      const s = SPR[e.type];
      if (e.type === 'hound') return [e.x - 46, e.y - 66, e.x + 46, e.y - 6];
      if (e.type === 'ghoul') return [e.x - 50, e.y - 86, e.x + 50, e.y - 8];
      if (e.type === 'bat') return [e.x - 30, e.y - 24, e.x + 30, e.y + 24];
      if (e.type === 'imp') return [e.x - 34, e.y - 40, e.x + 34, e.y + 36];
      if (e.type === 'brute') return [e.x - 52, e.y - 236, e.x + 52, e.y];
      return [e.x - 20, e.y - 20, e.x + 20, e.y + 20, s];
    }
    function hitTest(e, x, y, r) { const b = box(e); return x > b[0] - r && x < b[2] + r && y > b[1] - r && y < b[3] + r; }
    function overlapHero(e, shrink) {
      const b = box(e), k = shrink || 0;
      return hero.x + 12 > b[0] + k && hero.x - 12 < b[2] - k && hero.y > b[1] + k && hero.y - heroTall() < b[3] - k;
    }
    function damageEnemy(e, n, dir, flaming) {
      if (e.type === 'brute' && e.st === 'guard') {         // the ward turns the arrow aside
        burstP(e.x + e.face * 46, e.y - 130, { n: 12, speed: 220, rgb: '255,210,120', kind: 'spark', life: 0.35 });
        spawnP({ x: e.x + e.face * 46, y: e.y - 130, kind: 'ring', rgb: '255,170,80', size: 6, grow: 90, life: 0.25 });
        return false;
      }
      e.hp -= n * env.atk; e.hitT = 1;
      if (e.type !== 'brute') e.vx += dir * (e.type === 'ghoul' ? 40 : 120);
      bleed(e.x - dir * 6, aimY(e), dir > 0 ? -0.25 : Math.PI + 0.25, e.hp <= 0 || e.type === 'brute');
      sfx('arrow_hit', e.x, { vol: 0.8, gap: 0.04 });
      if (e.hp <= 0 || Math.random() < 0.35) sfx(e.type === 'hound' ? 'hound' : e.type === 'brute' ? 'brute' : 'growl', e.x, { vol: 0.55, rate: e.type === 'bat' || e.type === 'imp' ? 1.5 : 1, gap: 0.3 });
      burstP(e.x, aimY(e), { n: flaming ? 16 : 10, speed: 200, rgb: flaming ? '255,150,50' : '255,200,140', kind: 'spark', life: 0.4 });
      burstP(e.x, aimY(e), { n: 6, speed: 60, rgb: '255,110,30', kind: 'glow', life: 0.6, size: 2 });
      if (flaming) e.burn = 2.2;
      if (e.hp <= 0) killEnemy(e);
      else env.hitstop(0.03);
      return true;
    }
    function killEnemy(e) {
      if (e.dying) return;
      e.dying = 0.001; kills++;
      env.hitstop(e.type === 'brute' ? 0.35 : 0.07);
      env.shake(e.type === 'brute' ? 1 : 0.32);
      const cy = aimY(e);
      burstP(e.x, cy, { n: 30, speed: 260, rgb: '255,160,60', kind: 'spark', life: 0.7 });
      burstP(e.x, cy, { n: 16, speed: 120, rgb: '255,100,30', kind: 'glow', life: 1.1, size: 2.6, g: -40 });
      burstP(e.x, cy, { n: 14, speed: 160, rgb: '40,30,28', kind: 'debris', life: 1.2, g: 500, size: 4 });
      spawnP({ x: e.x, y: cy, kind: 'ring', rgb: '255,150,60', size: 10, grow: 220, life: 0.45 });
      for (let i = 0; i < 4; i++) spawnP({ x: e.x + rand(-20, 20), y: cy + rand(-20, 20), vx: rand(-20, 20), vy: rand(-50, -20), kind: 'smoke', rgb: '50,35,32', size: rand(18, 30), grow: 30, life: rand(1.2, 2), alpha: 0.7, layer: 'front' });
      if (e.type === 'brute') bossDeath(e);
    }

    function physics(e, dt, grav) {
      e.vy = Math.min(e.vy + grav * dt, 1000);
      const py = e.y;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.onGround) {
        const s = e.seg;
        if (!s || !solid(s) || e.x < s.x0 || e.x > s.x1) e.onGround = false; else { e.y = s.y; e.vy = 0; }
      }
      if (!e.onGround && e.vy >= 0) {
        for (const s of segs) {
          if (!solid(s) || e.x < s.x0 + 2 || e.x > s.x1 - 2) continue;
          if (py <= s.y + 1 && e.y >= s.y) { e.y = s.y; e.vy = 0; e.onGround = true; e.seg = s; e.landed = true; break; }
        }
      }
      if (e.y > LAVA_Y + 10 && !e.dying) { splash(e.x, true); killEnemy(e); e.inLava = true; }
    }

    function updateHound(e, dt) {
      const dx = hero.x - e.x, dir = Math.sign(dx) || 1, close = Math.abs(dx);
      e.cd -= dt;
      if (e.st === 'run') {
        e.face = dir;
        e.vx += (dir * e.speed - e.vx) * Math.min(1, dt * 5);
        if (e.onGround && !segAt(e.x + dir * 34, e.y)) {             // leap the gap
          e.vy = e.vy0 = -600; e.vx = dir * 330; e.onGround = false; e.st = 'air';
        }
        if (e.onGround && close < 150 && Math.abs(hero.y - e.y) < 80 && e.cd <= 0 && hero.lavaT <= 0) { e.st = 'crouch'; e.t = CROUCH_T; }
        if (overlapHero(e, 10) && e.cd <= 0) { if (hurtHero(7, e.x)) { e.st = 'recover'; e.t = e.t0 = 0.5; e.vx = -dir * 150; e.cd = 1; } }
      } else if (e.st === 'crouch') {
        e.vx *= Math.pow(0.02, dt);
        if ((e.t -= dt) <= 0) { e.st = 'pounce'; e.vx = dir * 440; e.vy = e.vy0 = -470; e.onGround = false; e.cd = 1.3; e.bit = false; sfx('hound', e.x, { vol: 0.7, gap: 0.6 }); }
      } else if (e.st === 'pounce' || e.st === 'air') {
        if (!e.bit && overlapHero(e, 6) && e.st === 'pounce') { e.bit = true; if (hurtHero(9, e.x)) e.vx = -e.vx * 0.3; }
        if (e.onGround) { e.t = e.t0 = e.st === 'air' ? 0.16 : 0.38; e.st = 'recover'; }
      } else if (e.st === 'recover') {
        e.vx *= Math.pow(0.05, dt);
        if ((e.t -= dt) <= 0) e.st = 'run';
      }
      physics(e, dt, 1500);
      e.phase += dt * (5 + Math.abs(e.vx) / 22);
      const kind = e.var === 'horn' ? 'horn' : 'hound';             // the gallop advances with the ground covered
      if (e.st === 'run' && rigOk(kind)) e.gait = ((e.gait || 0) + Math.abs(e.vx) * dt / (env.rigs[kind].stride('run') * SPR[kind].s)) % 1;
      if (e.x < cam - 700 || e.x > cam + W + 900) e.gone = true;
    }

    function updateGhoul(e, dt) {
      const dx = hero.x - e.x, dir = Math.sign(dx) || 1, close = Math.abs(dx);
      e.cd -= dt;
      const s = e.seg;
      if (e.st === 'stalk') {
        e.face = dir;
        const want = close > 85 && close < 520 ? dir * 105 : 0;
        e.vx += (want - e.vx) * Math.min(1, dt * 4);
        if (s) e.x = clamp(e.x, s.x0 + 34, s.x1 - 34);
        if (close < 110 && Math.abs(hero.y - e.y) < 90 && e.cd <= 0 && hero.lavaT <= 0) { e.st = 'rear'; e.t = 0.55; }
      } else if (e.st === 'rear') {
        e.vx *= Math.pow(0.01, dt);
        if ((e.t -= dt) <= 0) { e.st = 'lunge'; e.t = 0.3; e.vx = dir * 430; e.bit = false; }
      } else if (e.st === 'lunge') {
        if (!e.bit && overlapHero(e, 8)) { e.bit = true; hurtHero(12, e.x); }
        if (s) e.x = clamp(e.x, s.x0 + 20, s.x1 - 20);
        if ((e.t -= dt) <= 0) { e.st = 'recover'; e.t = 0.7; e.cd = 1.4; }
      } else if (e.st === 'recover') {
        e.vx *= Math.pow(0.03, dt);
        if ((e.t -= dt) <= 0) e.st = 'stalk';
      }
      physics(e, dt, 1500);
      e.phase += dt * (3 + Math.abs(e.vx) / 24);
      if (rigOk('ghoul')) e.gait = ((e.gait || 0) + Math.abs(e.vx) * dt / (env.rigs.ghoul.stride('walk') * SPR.ghoul.s)) % 1;
      if (e.x < cam - 700) e.gone = true;
    }

    function updateBat(e, dt) {
      e.cd -= dt;
      const hx = hero.x, hy = hero.y - 64;                // dives at head height: crouch or crawl and it skims over
      if (e.st === 'fly') {
        const side = e.x > hx ? 1 : -1;
        const tx = hx + side * 150, ty = e.baseY + Math.sin(tAll * 1.7 + e.seed) * 34;
        e.vx += ((tx - e.x) * 1.6 - e.vx) * Math.min(1, dt * 2.2);
        e.vy += ((ty - e.y) * 2.0 - e.vy) * Math.min(1, dt * 2.5);
        e.face = hx > e.x ? 1 : -1;
        if (e.type === 'imp') {                      // imps also spit fire from range
          e.spitCd -= dt;
          const dd = Math.abs(e.x - hx);
          if (e.spitCd <= 0 && dd > 150 && dd < 380 && hero.lavaT <= 0) { e.st = 'spit'; e.t = 0.55; }
        }
        if (e.st === 'fly' && Math.abs(e.x - hx) < 280 && e.cd <= 0 && hero.lavaT <= 0) { e.st = 'mark'; e.t = 0.5; spawnP({ x: e.x, y: e.y, kind: 'ring', rgb: '255,80,60', size: 8, grow: 110, life: 0.4 }); }
      } else if (e.st === 'spit') {
        e.vx *= Math.pow(0.05, dt); e.vy *= Math.pow(0.05, dt);
        if ((e.t -= dt) <= 0) {
          const T = 0.85, g = 380, ox = e.x + e.face * 28, oy = e.y - 10;
          shots.push({ x: ox, y: oy, vx: (hx - ox) / T, vy: (hy - oy - 0.5 * g * T * T) / T, g, life: 2.5, dmg: 7, small: true });
          e.st = 'fly'; e.spitCd = rand(2.6, 3.6); e.cd = Math.max(e.cd, 0.8);
        }
      } else if (e.st === 'mark') {
        e.vx *= Math.pow(0.05, dt); e.vy *= Math.pow(0.05, dt);
        if ((e.t -= dt) <= 0) {
          const d = Math.hypot(hx - e.x, hy - e.y) || 1;
          e.vx = (hx - e.x) / d * 460; e.vy = (hy - e.y) / d * 460; e.st = 'dive'; e.t = 1.0; e.bit = false; sfx('growl', e.x, { vol: 0.5, rate: 1.6, gap: 0.5 });
        }
      } else if (e.st === 'dive') {
        if (!e.bit && overlapHero(e, 4)) { e.bit = true; hurtHero(7, e.x, undefined, 120); }
        if ((e.t -= dt) <= 0 || e.y > hero.y + 10) { e.st = 'climb'; e.t = 0.9; e.vy = -280; e.vx = Math.sign(e.vx || 1) * 170; }
      } else if (e.st === 'climb') {
        e.vy += 120 * dt;
        if ((e.t -= dt) <= 0) { e.st = 'fly'; e.cd = rand(1.4, 2.2); }
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.y = Math.min(e.y, LAVA_Y - 30);
      e.phase += dt * (e.st === 'dive' ? 6 : 15);
      if (e.x < cam - 500 || e.x > cam + W + 1300) e.gone = true;
    }

    function updateBrute(e, dt) {
      if (e.st === 'sleep') { e.phase += dt; return; }
      const dx = hero.x - e.x, dir = Math.sign(dx) || 1, close = Math.abs(dx);
      const rage = e.hp < e.maxHp * 0.5;
      env.hud.boss = { name: 'THE GATEKEEPER', hp: Math.max(0, e.hp / e.maxHp) };
      e.t -= dt;
      if (rage && !e.raged && e.st === 'walk') {
        e.raged = true; e.st = 'roar'; e.t = 1.0; env.shake(0.6); say('The Gatekeeper is enraged!'); sfx('brute', e.x, { rate: 0.8 });
        pickups.push({ x: clamp(hero.x - 70, ARENA_X + 40, PORTAL_X - 120), y: 548, kind: 'heal', taken: false, ph: 0 });  // a soul flame falls
      }
      switch (e.st) {
        case 'roar':
          e.vx = 0;
          if (Math.random() < 0.5) spawnP({ x: e.x - e.face * 30, y: e.y - 190, kind: 'ring', rgb: '255,120,40', size: 10, grow: 260, life: 0.5 });
          if (e.t <= 0) { e.st = 'walk'; e.t = 1.0; }
          break;
        case 'walk': {
          e.face = dir;
          const want = close > 250 ? dir * (rage ? 95 : 80) : close < 150 ? -dir * 45 : 0;
          e.vx += (want - e.vx) * Math.min(1, dt * 3);
          if (e.t <= 0) {
            const r = Math.random();
            if (Math.random() < 0.28 && e.lastSt !== 'guard') { e.st = 'guard'; e.t = rage ? 1.1 : 1.5; e.lastSt = 'guard'; break; }
            e.lastSt = 'attack';
            if (close < 170) e.st = r < 0.65 ? 'slamT' : 'chargeT';
            else if (close < 340) e.st = r < 0.45 ? 'hurlT' : r < 0.75 ? 'slamT' : 'chargeT';
            else e.st = r < 0.5 ? 'hurlT' : 'chargeT';
            e.t = e.st === 'slamT' ? 0.8 : e.st === 'hurlT' ? 0.7 : 0.6;
            if (rage) e.t *= 0.75;
          }
          break;
        }
        case 'guard': e.vx *= Math.pow(0.02, dt); e.face = dir; if (e.t <= 0) { e.st = 'walk'; e.t = rage ? 0.5 : 0.8; } break;
        case 'slamT': e.vx *= Math.pow(0.02, dt); if (e.t <= 0) { e.st = 'slam'; e.t = 0.35; slam(e); } break;
        case 'slam': if (e.t <= 0) { e.st = 'walk'; e.t = rage ? 0.7 : 1.1; } break;
        case 'hurlT': e.vx = 0; e.face = dir; if (e.t <= 0) { e.st = 'hurl'; e.t = 0.35; hurl(e, 1.05); if (rage) e.hurl2 = 0.26; } break;
        case 'hurl': if (e.t <= 0) { e.st = 'walk'; e.t = rage ? 0.7 : 1.0; } break;
        case 'chargeT': e.vx = 0; e.face = dir; if (e.t <= 0) { e.st = 'charge'; e.t = 1.05; e.bit = false; e.vx = dir * (rage ? 360 : 320); } break;
        case 'charge':
          if (!e.bit && overlapHero(e, 6)) { e.bit = true; hurtHero(13, e.x); }
          if (Math.random() < 0.5) spawnP({ x: e.x - e.face * 30, y: e.y, vx: -e.vx * 0.2, vy: rand(-60, -20), kind: 'debris', rgb: '90,60,50', size: 3, life: 0.6, g: 400 });
          if (e.t <= 0 || e.x < ARENA_X + 40 || e.x > PORTAL_X - 30) { e.st = 'walk'; e.t = 1.2; e.vx = 0; e.x = clamp(e.x, ARENA_X + 40, PORTAL_X - 30); }
          break;
      }
      if (e.hurl2 > 0) { e.hurl2 -= dt; if (e.hurl2 <= 0) hurl(e, 1.45); }
      e.x += e.vx * dt;
      e.x = clamp(e.x, ARENA_X + 30, PORTAL_X - 20);
      e.phase += dt * (1 + Math.abs(e.vx) / 40);
      if (e.st !== 'charge' && overlapHero(e, 14)) hurtHero(8, e.x);
    }
    function slam(e) {
      sfx('explode', e.x, { rate: 0.6, vol: 0.8 });
      env.shake(0.75); env.flash('255,130,50', 0.2);
      for (const d of [-1, 1]) waves.push({ x: e.x + d * 40, dir: d, life: 1.7, hit: false });
      burstP(e.x - e.face * 40, e.y, { n: 26, speed: 260, rgb: '100,70,60', kind: 'debris', life: 0.9, g: 700, angle: -Math.PI / 2, spread: 2.4, size: 4 });
      burstP(e.x - e.face * 40, e.y, { n: 18, speed: 220, rgb: '255,140,50', kind: 'spark', life: 0.5, angle: -Math.PI / 2, spread: 2.4 });
    }
    function hurl(e, T) {
      let ox = e.x + e.face * 62, oy = e.y - 106;                                              // from the demon's hand
      const q = rigOk('brute') && env.rigs.brute.point({ anim: 'hurlT', k: 1, scale: SPR.brute.s, flip: e.face > 0 }, 'hand');
      if (q) { ox = e.x + q.x; oy = e.y + q.y; }
      const tx = hero.x, ty = hero.y - 20, g = 620;
      shots.push({ x: ox, y: oy, vx: (tx - ox) / T, vy: (ty - oy - 0.5 * g * T * T) / T, g, life: 3 });
    }
    function bossDeath(e) {
      env.flash('255,200,120', 0.8);
      e.dying = 0.001;
      openT = 1.5;
    }

    // ── serpents (zones of the lava lake) ──
    function updateZone(z, dt) {
      if (!z.on) return;
      const near = hero.x > z.x0 - 140 && hero.x < z.x1 + 140;
      z.t -= dt;
      if (z.st === 'lurk') {
        if (z.t <= 0 && near && hero.lavaT <= 0 && !arena) {
          // surface beside the hero, in open lava
          const dir = Math.random() < 0.6 ? hero.face : -hero.face;
          let sx = clamp(hero.x - dir * 190, z.x0 + 20, z.x1 - 20), tries = 0;
          while (segAt(sx) && tries++ < 12) sx += dir * 18;
          if (segAt(sx)) { z.t = 0.8; return; }
          z.st = 'tele'; z.t = 0.85; z.sx = sx; z.ex = clamp(hero.x + dir * 50, z.x0 - 60, z.x1 + 60);
          z.dir = Math.sign(z.ex - z.sx) || 1;
        }
      } else if (z.st === 'tele') {
        if (Math.random() < 0.6) spawnP({ x: z.sx + rand(-14, 14), y: LAVA_Y, vx: rand(-40, 40), vy: rand(-200, -80), g: 700, kind: 'glow', rgb: '255,170,60', size: rand(1.4, 2.6), life: 0.5, layer: 'front' });
        if (z.t <= 0) {
          z.st = 'leap'; z.lt = 0; z.dur = 1.3;
          z.s = { hx: z.sx, hy: LAVA_Y + 10, trail: [], hp: 3, dead: false, hitT: 0 };
          splash(z.sx, true); env.shake(0.25); sfx('splash_big', z.sx, { rate: 0.55, vol: 0.8 });
        }
      } else if (z.st === 'leap') {
        const s = z.s;
        z.lt += dt;                                   // its own clock (z.t counts down above)
        const u = z.lt / z.dur;
        if (!s.dead) {
          s.hx = lerp(z.sx, z.ex, Math.min(u, 1.25)); s.hy = LAVA_Y + 10 - Math.sin(Math.PI * clamp(u, 0, 1)) * 200 + Math.max(0, u - 1) * 320;
        } else { s.vy = (s.vy || 0) + 900 * dt; s.hy += s.vy * dt; s.hx += z.dir * 40 * dt; }
        s.trail.unshift([s.hx, s.hy]); if (s.trail.length > 46) s.trail.pop();
        s.hitT = Math.max(0, s.hitT - dt * 4);
        if (!s.dead && serpentHit(s, hero.x, hero.y - heroTall() * 0.53, 22) && hero.lavaT <= 0) hurtHero(12, s.hx, undefined, 70);
        if (Math.random() < 0.5) spawnP({ x: s.hx + rand(-8, 8), y: s.hy + 6, vx: rand(-20, 20), vy: rand(0, 60), g: 600, kind: 'glow', rgb: '255,130,40', size: rand(1.2, 2.2), life: 0.5, layer: 'front' });
        const tail = s.trail[s.trail.length - 1];
        if ((u >= 1 || (s.dead && s.hy > LAVA_Y + 20)) && tail && tail[1] > LAVA_Y) {
          splash(s.hx, true);
          z.st = 'lurk'; z.t = s.dead ? rand(4.5, 6) : rand(2.4, 4); z.s = null;
        }
      }
    }
    function serpentHit(s, x, y, r) {
      for (let i = 0; i < s.trail.length; i += 2) {
        const p = s.trail[i]; if (p[1] > LAVA_Y) continue;
        const rr = (i === 0 ? 17 : 12 - i * 0.25) + r;
        if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < rr * rr) return true;
      }
      return false;
    }
    function hurtSerpent(z, n, flaming) {
      const s = z.s; s.hp -= n * env.atk; s.hitT = 1;
      burstP(s.hx, s.hy, { n: 12, speed: 200, rgb: '255,180,90', kind: 'spark', life: 0.4 });
      if (s.hp <= 0 && !s.dead) {
        s.dead = true; s.vy = -120; env.hitstop(0.06); env.shake(0.3);
        burstP(s.hx, s.hy, { n: 24, speed: 240, rgb: '255,140,50', kind: 'spark', life: 0.7 });
        spawnP({ x: s.hx, y: s.hy, kind: 'ring', rgb: '255,150,60', size: 10, grow: 200, life: 0.4 });
      }
    }

    // ── hazards: geysers, crumbling slabs, the horde ──
    function updateGeysers(dt) {
      for (const g of geysers) {
        const u = (tAll + g.off) % g.period, p = g.period;
        const st = u < p - 2.0 ? 'idle' : u < p - 1.05 ? 'boil' : 'erupt';
        if (st === 'erupt') {
          const k = u - (p - 1.05);
          g.h = 240 * Math.min(1, k / 0.14) * (k > 0.8 ? Math.max(0, 1 - (k - 0.8) / 0.25) : 1);
          if (g.st !== 'erupt' && Math.abs(g.x - hero.x) < 500) env.shake(0.18);
          if (Math.abs(hero.x - g.x) < 22 && hero.y > LAVA_Y - g.h && hero.lavaT <= 0) {
            if (hurtHero(14, g.x - Math.sign(hero.vx || 1) * 30)) { hero.vy = -480; hero.vx = (hero.x < g.x ? -1 : 1) * 160; }
          }
          if (Math.abs(g.x - cam - W / 2) < 400 && Math.random() < 0.9) spawnP({ x: g.x + rand(-10, 10), y: LAVA_Y - g.h * rand(0.6, 1), vx: rand(-110, 110), vy: rand(-260, -60), g: 900, kind: 'glow', rgb: Math.random() < 0.4 ? '255,220,120' : '255,120,30', size: rand(2, 4), life: rand(0.6, 1.1), drag: 0.2, layer: 'front' });
        } else g.h = 0;
        if (st === 'boil' && Math.abs(g.x - cam - W / 2) < 400 && Math.random() < 0.5) spawnP({ x: g.x + rand(-18, 18), y: LAVA_Y, vx: rand(-30, 30), vy: rand(-170, -60), g: 700, kind: 'glow', rgb: '255,160,60', size: rand(1.4, 2.6), life: 0.5, layer: 'front' });
        g.st = st; g.boil = st === 'boil' ? (u - (p - 2.0)) / 0.95 : 0;
      }
    }
    function updateSegs(dt) {
      for (const s of segs) {
        if (s.kind !== 'crumble') continue;
        if (s.st === 'shake') { s.t -= dt; if (s.t <= 0) { s.st = 'fall'; s.vy = 40; burstP((s.x0 + s.x1) / 2, s.y, { n: 10, speed: 90, rgb: '90,60,50', kind: 'debris', life: 0.8, g: 600, size: 4 }); } }
        else if (s.st === 'fall') {
          s.vy += 700 * dt; s.y += s.vy * dt;
          if (s.y > LAVA_Y + 30 && !s.splashed) { s.splashed = true; splash((s.x0 + s.x1) / 2, true); }
          if (s.y > LAVA_Y + 120) { s.st = 'gone'; s.t = 2.4; }
        } else if (s.st === 'gone') { s.t -= dt; if (s.t <= 0) { s.st = 'rise'; s.t = 0.8; } }
        else if (s.st === 'rise') {
          s.t -= dt; s.y = lerp(s.top, LAVA_Y + 120, Math.max(0, s.t / 0.8));
          if (s.t <= 0) { s.st = 'solid'; s.y = s.top; s.splashed = false; }
        }
      }
    }
    function updateWall(dt) {
      if (!wall.on) return;
      if (arena) { wall.x = Math.min(wall.x + 20 * dt, ARENA_X - 120); wall.alpha = Math.max(0.35, wall.alpha - dt * 0.4); return; }
      wall.alpha = Math.min(1, wall.alpha + dt * 0.8);
      const gap = hero.x - wall.x;
      const sp = gap > 680 ? 190 : gap > 430 ? 98 : gap < 230 ? 58 : 82;
      if (hero.lavaT <= 0 && hero.portalT <= 0) wall.x += sp * dt;
      if (hero.x - wall.x < 30 && hero.lavaT <= 0) { if (hurtHero(5, wall.x - 100, '-5')) hero.vx = 260; }
      wall.spawnT -= dt;
      if (wall.spawnT <= 0) {
        const n = enemies.filter(e => e.type === 'hound' && !e.dying).length;
        if (n < 2) spawnFromWall();
        wall.spawnT = rand(9, 13);
      }
    }

    // ── pickups / portal ──
    function updatePickups(dt) {
      for (const p of pickups) {
        if (p.taken) continue;
        p.ph += dt;
        if (Math.abs(hero.x - p.x) < 28 && Math.abs(hero.y - 36 - p.y) < 44 && hero.lavaT <= 0) {
          p.taken = true;
          if (p.kind === 'heal') { env.heal(20); env.floatText(p.x - cam, p.y - 20, '+20', '120,255,170'); }
          else { VOLLEY.n = Math.min(5, VOLLEY.n + 1); env.floatText(p.x - cam, p.y - 20, '+1 flaming storm', '255,190,90'); }
          burstP(p.x, p.y, { n: 22, speed: 160, rgb: p.kind === 'heal' ? '140,255,200' : '255,170,60', kind: 'glow', life: 0.7, size: 2 });
          spawnP({ x: p.x, y: p.y, kind: 'ring', rgb: p.kind === 'heal' ? '140,255,200' : '255,170,60', size: 6, grow: 120, life: 0.4 });
        }
      }
      portalK = lerp(portalK, portalOpen ? 1 : 0, 1 - Math.exp(-dt * 2));
      if (portalOpen && hero.portalT <= 0 && Math.abs(hero.x - PORTAL_X) < 30 && hero.lavaT <= 0) { hero.portalT = 0.001; env.invuln(5); }
    }

    function updateShots(dt) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (Math.random() < 0.9) spawnP({ x: s.x, y: s.y, vx: rand(-20, 20), vy: rand(-30, 10), kind: 'glow', rgb: Math.random() < 0.5 ? '255,180,70' : '255,90,30', size: rand(2, 3.5), life: 0.4, layer: 'front' });
        const g = segAt(s.x);
        const hitHero = Math.abs(s.x - hero.x) < 20 && s.y > hero.y - 70 && s.y < hero.y + 4;
        if (hitHero || (g && s.y >= g.y) || s.y > LAVA_Y || s.life <= 0) {
          const R2 = s.small ? 30 : 50;
          if (Math.abs(s.x - hero.x) < R2 && Math.abs(s.y - (hero.y - heroTall() * 0.47)) < R2 + heroTall() * 0.16) hurtHero(s.dmg || 10, s.x, undefined, s.small ? 120 : undefined);
          burstP(s.x, s.y, { n: s.small ? 12 : 26, speed: s.small ? 160 : 240, rgb: '255,150,50', kind: 'spark', life: 0.55 });
          spawnP({ x: s.x, y: s.y, kind: 'ring', rgb: '255,140,50', size: 8, grow: s.small ? 90 : 160, life: 0.35 });
          env.shake(s.small ? 0.12 : 0.3);
          shots.splice(i, 1);
        }
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.x += w.dir * 340 * dt; w.life -= dt;
        if (Math.random() < 0.8) spawnP({ x: w.x, y: 590, vx: rand(-30, 30), vy: rand(-240, -90), g: 800, kind: Math.random() < 0.5 ? 'glow' : 'debris', rgb: Math.random() < 0.5 ? '255,140,50' : '90,60,50', size: rand(2, 3.5), life: 0.5 });
        if (!w.hit && Math.abs(w.x - hero.x) < 22 && hero.y > 590 - 34 && hero.lavaT <= 0) { w.hit = true; if (hurtHero(14, w.x - w.dir * 20)) hero.vy = -420; }
        if (w.life <= 0 || w.x < ARENA_X - 80 || w.x > PORTAL_X + 120) waves.splice(i, 1);
      }
    }

    // ── autopilot (scripted tests only) ──
    let autoPrev = {}, autoHold = 0;
    function autoInput() {
      const I = { left: false, right: false, up: false, down: false, ax: 0, ay: 0, held: {}, pressed: {}, released: {} };
      const h = hero;
      const tgt = pickTarget();
      const tdx = tgt ? tgt.x - h.x : 1e9;
      const threat = tgt && (tgt.serpent ? Math.abs(tdx) < 150 : Math.abs(tdx) < 430);
      const fighting = arena && boss && !boss.dying;
      if (threat || fighting) {
        if (!(h.drawing && h.draw >= 0.9)) I.held.attack = true;
        const aimT = fighting ? boss : tgt;
        if (aimT) { I.aimFace = Math.sign(aimT.x - h.x) || h.face; I.aimAt = solveAim(aimT, arrowSpeed(bowPower())); }

        const blocker = tgt && (tgt.type === 'ghoul' || tgt.type === 'brute') && tdx > 0 && tdx < 270;
        if (!blocker && !fighting) I.right = true;
      } else I.right = true;
      if (h.onGround && h.seg && h.seg.kind === 'crumble') { delete I.held.attack; I.right = true; I.left = false; }   // never loiter on a crumbling slab
      if (fighting) {
        const d = boss.x - h.x;
        if (d < 210) I.left = true; else if (d > 340) I.right = true;
      }
      if (VOLLEY.n > 0 && tgt && (tgt.type === 'brute' || tgt.type === 'ghoul') && Math.abs(tgt.x - h.x) < 360) I.held.special2 = true;
      if (h.onGround) {
        const ahead = h.x + 26;
        const gap = !segAt(ahead, h.y);
        const step = segs.some(s => solid(s) && s.x0 > h.x && s.x0 < h.x + 40 && s.y < h.y - 8);
        const geyserNear = geysers.some(g => g.x > h.x && g.x - h.x < 110 && g.st !== 'idle');
        const landing = segs.some(s => solid(s) && s.x0 > h.x - 10 && s.x0 - h.x < 150 && s.y > h.y - 60);
        if ((gap || step) && !geyserNear && (landing || !gap)) { I.held.jump = true; delete I.held.attack; }
        else if (gap && !landing) I.right = false;   // wait for the slab to rise
        if (geyserNear && gap) I.right = false;
        for (const w of waves) if (Math.abs(w.x - h.x) < 90 && Math.sign(h.x - w.x) === w.dir) I.held.jump = true;
        if (boss && boss.st === 'charge' && Math.abs(boss.x - h.x) < 150) I.held.jump = true;
        for (const e of enemies) if (e.type === 'hound' && e.st === 'pounce' && Math.abs(e.x - h.x) < 120) I.held.jump = true;
      } else if (h.vy < 0) I.held.jump = true;
      // (releasing a charged attack happens by not holding it this frame)
      if (I.right) { I.ax = 1; } if (I.left) { I.ax = -1; I.right = false; }
      for (const k in I.held) if (!autoPrev[k]) I.pressed[k] = true;
      for (const k in autoPrev) if (!I.held[k]) I.released[k] = true;
      autoPrev = Object.assign({}, I.held);
      return I;
    }

    // ── update ──
    function update(dt, input) {
      tAll += dt;
      const ch = cheat();
      if (ch.god) env.heal(100);
      if (typeof ch.hurt === 'number') { const n = ch.hurt; delete ch.hurt; env.damage(n, { x: hero.x - cam, y: hero.y - 70, invuln: 0 }); }   // test only
      if (typeof ch.warp === 'number') {
        const wx = ch.warp; delete ch.warp;
        const s = segAt(wx) || segs[segs.length - 1];
        hero.x = clamp(wx, s.x0 + 30, s.x1 - 30); hero.y = s.y; hero.onGround = true; hero.seg = s; hero.vx = hero.vy = 0;
        hero.safe = { x: hero.x, seg: s.kind === 'crumble' ? safeSegNear(hero.x) : s };
        for (const t of triggers) if (t.at < hero.x - 200 && !t.wall && !t.arena && t.serpents === undefined) t.done = true;
        if (wall.on || hero.x > 1040) { wall.on = true; wall.x = hero.x - 560; }
        enemies.splice(0, enemies.length, ...enemies.filter(e => e.type === 'brute'));
        cam = clamp(hero.x - 150, -60, PORTAL_X + 100 - W);
      }
      const I = window.__hellAuto && input.held !== undefined && env.health > 0 ? autoInput() : input;
      updateHero(dt, I);
      for (const t of triggers) if (!t.done && hero.x >= t.at) { t.done = true; fire(t); }
      updateWall(dt); updateSegs(dt); updateGeysers(dt);
      for (const z of zones) updateZone(z, dt);
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.hitT = Math.max(0, e.hitT - dt * 4);
        if (e.burn > 0) { e.burn -= dt; e.hp -= 0.6 * dt; if (e.hp <= 0) killEnemy(e); if (Math.random() < 0.5) spawnP({ x: e.x + rand(-20, 20), y: aimY(e) + rand(-20, 20), vx: rand(-10, 10), vy: rand(-80, -30), kind: 'glow', rgb: '255,140,40', size: 1.8, life: 0.5, layer: 'front' }); }
        if (e.dying) {
          e.dying += dt;
          if (e.type === 'bat') { e.vy += 900 * dt; e.y += e.vy * dt; e.x += e.vx * dt * 0.5; }
          if (e.type !== 'brute' && Math.random() < 0.6) spawnP({ x: e.x + rand(-30, 30), y: aimY(e) + rand(-20, 20), vx: rand(-20, 20), vy: rand(-90, -40), kind: 'debris', rgb: '60,45,42', size: rand(2, 4), life: 0.9, g: -30 });
          if (e.type === 'brute') {
            if (Math.random() < 0.9) spawnP({ x: e.x + rand(-40, 40), y: e.y - rand(20, 220), vx: rand(-60, 60), vy: rand(-140, -40), kind: Math.random() < 0.5 ? 'glow' : 'debris', rgb: Math.random() < 0.5 ? '255,150,50' : '60,45,42', size: rand(2, 5), life: 1.2, g: -20 });
            if (e.dying > 2.4) e.gone = true;
          } else if (e.dying > 0.75) e.gone = true;
          if (e.gone) enemies.splice(i, 1);
          continue;
        }
        if (e.type === 'hound') updateHound(e, dt);
        else if (e.type === 'ghoul') updateGhoul(e, dt);
        else if (e.type === 'bat' || e.type === 'imp') updateBat(e, dt);
        else if (e.type === 'brute') updateBrute(e, dt);
        if (e.gone) enemies.splice(i, 1);
      }
      updateArrows(dt); updateShots(dt); updatePickups(dt);

      // camera: hero a third in, a little lead; the arena is framed
      let want = hero.x - (W > 400 ? W * 0.36 : 140) + hero.face * 18;   // a third in, either orientation
      if (arena) {                                  // keep the whole Gatekeeper and the hero in frame
        if (boss && !boss.dying) want = boss.x > hero.x ? clamp(boss.x + 74 - W, hero.x - 330, hero.x - 40) : clamp(boss.x - 74, hero.x - W + 40, hero.x - 60);
        want = clamp(want, ARENA_X - 60, PORTAL_X + 110 - W);
      }
      cam = lerp(cam, clamp(want, W > 400 ? -480 : -60, PORTAL_X + 110 - W), 1 - Math.exp(-dt * 6));   // (the first rock runs from -700)
      env.hud.progress = clamp(hero.x / PORTAL_X, 0, 1);

      // ambience
      flashT -= dt;
      if (flashT <= 0) { skyFlash = 1; flashT = rand(6, 11); }
      skyFlash = Math.max(0, skyFlash - dt * 3);
      embAcc += dt * 30;
      while (embAcc > 1) {
        embAcc--;
        spawnP({ x: cam + rand(-20, W + 20), y: LAVA_Y + rand(-6, 30), vx: rand(-14, 14), vy: rand(-110, -40), g: -12, drag: 0.15,
          kind: 'glow', rgb: Math.random() < 0.3 ? '255,210,120' : '255,120,40', size: rand(0.9, 2.1), life: rand(1.8, 3.6), alpha: rand(0.6, 1), layer: Math.random() < 0.5 ? 'back' : 'front' });
      }
      ashAcc += dt * 7;
      while (ashAcc > 1) { ashAcc--; spawnP({ x: cam + rand(0, W + 80), y: -10, vx: rand(-24, -6), vy: rand(18, 38), kind: 'debris', rgb: '120,110,105', size: rand(1.2, 2.4), life: rand(6, 9), alpha: 0.55, spin: rand(-3, 3), layer: 'front' }); }
      smokeAcc += dt * 1.6;
      while (smokeAcc > 1) { smokeAcc--; spawnP({ x: cam + rand(0, W), y: LAVA_Y + 10, vx: rand(-8, 8), vy: rand(-36, -18), kind: 'smoke', rgb: '45,22,18', size: rand(30, 60), grow: 14, life: rand(3.5, 5.5), alpha: 0.55, layer: 'back' }); }
      if (msgT > 0) msgT -= dt;
      if (openT > 0) {
        openT -= dt;
        if (openT <= 0) {
          portalOpen = true; env.hud.boss = null; env.hud.objective = 'Step into the portal';
          say('The gate is open — go!');
          spawnP({ x: PORTAL_X, y: 520, kind: 'ring', rgb: '160,255,220', size: 20, grow: 400, life: 0.8 });
        }
      }
    }

    // ── drawing ──
    function gradients(c) {
      if (G && G.c === c) return G;
      const glowBand = c.createLinearGradient(0, LAVA_Y - 180, 0, LAVA_Y + 4);
      glowBand.addColorStop(0, 'rgba(255,70,10,0)'); glowBand.addColorStop(0.75, 'rgba(255,80,15,0.07)'); glowBand.addColorStop(1, 'rgba(255,130,40,0.26)');
      const vign = c.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.48, H * 0.75);
      vign.addColorStop(0, 'rgba(20,4,0,0)'); vign.addColorStop(1, 'rgba(26,6,1,0.64)');
      const skyFb = c.createLinearGradient(0, 0, 0, 500);
      skyFb.addColorStop(0, '#080202'); skyFb.addColorStop(1, '#3a0d05');
      const fallGlow = c.createLinearGradient(-22, 0, 22, 0);
      fallGlow.addColorStop(0, 'rgba(255,90,20,0)'); fallGlow.addColorStop(0.5, 'rgba(255,110,30,0.28)'); fallGlow.addColorStop(1, 'rgba(255,90,20,0)');
      return (G = { c, glowBand, vign, skyFb, fallGlow });
    }

    function drawSky(c) {
      const g = gradients(c);
      // the sky shader is transparent below y = 500, so only that strip is rendered
      if (!env.drawShader(c, skyProg, 0, 0, W, 500, { u_cam: cam, u_flash: skyFlash }, 0.4)) { c.fillStyle = g.skyFb; c.fillRect(0, 0, W, 500); }
      c.fillStyle = '#000'; c.fillRect(0, 498, W, LAVA_Y - 494);   // under the ridges (was the core's clear)
      if (backdrop) {
        const pw = backdrop.width, ox = -((cam * 0.07 + 260) % (pw * 2));
        for (let k = 0; k < 3; k++) {
          const x = ox + k * pw;
          if (x > W || x + pw < 0) continue;
          c.save();
          if (k % 2 === 1) { c.translate(x + pw, 112); c.scale(-1, 1); c.drawImage(backdrop, 0, 0); }
          else c.drawImage(backdrop, x, 112);
          c.restore();
        }
      }
    }
    function drawRidge(c, r) {
      const ox = cam * r.par;
      c.beginPath(); c.moveTo(-10, LAVA_Y + 10);
      for (const [x, y] of r.pts) { const sx = x - ox; if (sx < -30 || sx > W + 30) continue; c.lineTo(sx, y); }
      c.lineTo(W + 10, LAVA_Y + 10); c.closePath();
      if (!r.grad || r.gc !== c) {
        r.grad = c.createLinearGradient(0, 380, 0, LAVA_Y); r.gc = c;
        r.grad.addColorStop(0, r.col0); r.grad.addColorStop(0.75, r.col1); r.grad.addColorStop(1, '#8a2a0c');
      }
      c.fillStyle = r.grad; c.fill();
      // the lava-lit rim along the crest
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,90,30,0.12)'; c.lineWidth = 1.5; c.stroke(); c.restore();
    }
    function drawFar(c, t) {
      const [far, near] = cliffs.ridges;
      // the distant erupting volcano drifts across the sky over the whole run
      if (volcano) {
        const x = 300 - cam * 0.085, y = 228;
        if (x + volcano.width > 0 && x < W) {
          c.save(); c.globalAlpha = 0.85; c.drawImage(volcano, x, y); c.restore();
        }
      }
      // the lava-fall canyon looms behind the Gatekeeper's arena
      if (canyon && cam > 4300) {
        const k = clamp((cam - 4300) / 600, 0, 1);
        const x = 5400 * 0.22 + 210 - cam * 0.22, y = 200;
        c.save(); c.globalAlpha = 0.9 * k; c.drawImage(canyon, x, y); c.restore();
      }
      // lava falls pour from the far ridge (drawn behind it, so they spill from its notches)
      for (const f of cliffs.falls) {
        const x = f.x - cam * far.par;
        if (x < -40 || x > W + 40) continue;
        const ty = ridgeY(far, f.x) + 4;
        drawFall(c, x, ty, f.w, LAVA_Y - ty + 10, t * f.sp, 0.8);
      }
      drawRidge(c, far);
      drawRidge(c, near);
      for (const s of spires) {
        const x = s.x - cam * 0.6;
        if (x + s.w < -10 || x > W + 10) continue;
        c.drawImage(s.c, x, s.top, s.w, s.h);
      }
    }
    function ridgeY(r, x) {
      const p = r.pts, i = clamp(Math.floor((x + 100) / 12), 0, p.length - 2);
      return lerp(p[i][1], p[i + 1][1], ((x + 100) % 12) / 12);
    }
    function drawFall(c, x, y, w, h, t, alpha) {
      c.save();
      c.globalAlpha = alpha;
      c.beginPath(); c.rect(x - w / 2, y, w, h); c.clip();
      const off = (t * 260) % 256;
      for (let yy = y - 256 + off; yy < y + h; yy += 256) c.drawImage(fallTex, x - w / 2, yy, w, 256);
      c.restore();
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * 0.9;
      c.translate(x, 0); c.fillStyle = gradients(c).fallGlow; c.scale(1.6 + w / 20, 1); c.fillRect(-22, y, 44, h);
      c.restore();
    }
    function drawLava(c) {
      // lava only exists below LAVA_Y: render just that strip (u_top is relative to the strip)
      const LY0 = LAVA_Y - 4;
      const ok = env.drawShader(c, lavaProg, 0, LY0, W, H - LY0, { u_cam: cam, u_top: LAVA_Y - LY0, u_glow: 1.0, u_rock: AS.rock || undefined }, 0.4);
      if (!ok) {
        const gr = c.createLinearGradient(0, LAVA_Y, 0, H);
        gr.addColorStop(0, '#ffb040'); gr.addColorStop(0.1, '#e0500c'); gr.addColorStop(1, '#5a1003');
        c.fillStyle = gr; c.fillRect(0, LAVA_Y, W, H - LAVA_Y);
      }
    }
    // Heat haze over the lava edge. It used to copy the canvas onto itself in
    // ~26 strips per frame, which forces a GPU readback per strip on phones (a
    // big stutter source). Now: a pre-drawn band of soft rising heat plumes,
    // two layers drifting at different speeds and pulsing — no readback.
    let hazeCv = null;
    function shimmer(c, y0, y1) {
      if (!hazeCv) {
        hazeCv = document.createElement('canvas'); hazeCv.width = 512; hazeCv.height = 72;
        const g = hazeCv.getContext('2d');
        for (let i = 0; i < 64; i++) {
          const x = 30 + Math.random() * 452, w = 10 + Math.random() * 26, h = 24 + Math.random() * 46;
          const gr = g.createRadialGradient(x, 72, 0, x, 72, h);
          gr.addColorStop(0, 'rgba(255,160,70,0.20)'); gr.addColorStop(0.5, 'rgba(255,110,40,0.07)'); gr.addColorStop(1, 'rgba(255,90,30,0)');
          g.fillStyle = gr; g.fillRect(x - w, 72 - h, w * 2, h);
        }
      }
      const h = y1 - y0;
      c.save(); c.globalCompositeOperation = 'lighter';
      const o1 = (tAll * 24 + cam * 0.6) % 512, o2 = (cam * 0.9 - tAll * 15) % 512;
      c.globalAlpha = 0.5 + 0.2 * Math.sin(tAll * 3.1);
      for (let x = -o1; x < W; x += 512) c.drawImage(hazeCv, x, y0, 512, h);
      c.globalAlpha = 0.3 + 0.15 * Math.sin(tAll * 4.3 + 1);
      for (let x = -((o2 % 512) + 512) % 512; x < W; x += 512) c.drawImage(hazeCv, x + 256, y0 + h * 0.15, 512, h * 0.85);
      c.restore();
    }
    function drawSegs(c) {
      for (const s of segs) {
        if (s.st === 'gone') continue;
        const x = s.x0 - cam + s.ox;
        if (x > W + 20 || x + s.cw < -20) continue;
        let dx = 0;
        if (s.st === 'shake') dx = (Math.random() - 0.5) * 3;
        c.drawImage(s.cache, x + dx, s.y + s.oy, s.cw, s.ch);
      }
    }
    function drawGeysers(c) {
      for (const g of geysers) {
        const x = g.x - cam;
        if (x < -60 || x > W + 60) continue;
        if (g.boil > 0) {
          c.save(); c.globalCompositeOperation = 'lighter';
          const r = 26 + g.boil * 16;
          c.globalAlpha = 0.35 + g.boil * 0.5;
          c.drawImage(env.glowSprite('255,190,80'), x - r, LAVA_Y - r * 0.5, r * 2, r);
          c.restore();
        }
        if (g.h > 1) {
          const top = LAVA_Y - g.h, wob = Math.sin(tAll * 30) * 2;
          c.save();
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = 0.5; c.drawImage(env.glowSprite('255,110,30'), x - 90, top - 40, 180, g.h + 80);
          c.globalAlpha = 1;
          const gr = c.createLinearGradient(0, top, 0, LAVA_Y);
          gr.addColorStop(0, 'rgba(255,190,80,0.2)'); gr.addColorStop(0.15, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(255,90,20,0.95)');
          c.fillStyle = gr;
          c.beginPath(); c.moveTo(x - 14, LAVA_Y);
          c.quadraticCurveTo(x - 9 + wob, top + g.h * 0.4, x - 6, top + 6);
          c.quadraticCurveTo(x, top - 10, x + 6, top + 6);
          c.quadraticCurveTo(x + 9 - wob, top + g.h * 0.4, x + 14, LAVA_Y); c.closePath(); c.fill();
          c.fillStyle = 'rgba(255,240,180,0.85)';
          c.beginPath(); c.moveTo(x - 4, LAVA_Y); c.quadraticCurveTo(x - 2 + wob, top + g.h * 0.5, x, top + 10); c.quadraticCurveTo(x + 2 - wob, top + g.h * 0.5, x + 4, LAVA_Y); c.fill();
          c.restore();
        }
      }
    }

    // a photo creature with the legs sheared back and forth for a gallop
    function blitBeast(c, img, w, h, s, legF, phase, run, comp, alpha) {
      if (!img) return;
      c.globalCompositeOperation = comp; c.globalAlpha = alpha;
      const ly = Math.round(h * legF);
      c.drawImage(img, 0, 0, w, ly + 1, 0, 0, w * s, (ly + 1) * s);
      const halves = [[0, Math.round(w * 0.5), 0], [Math.round(w * 0.5), w - Math.round(w * 0.5), Math.PI]];
      for (const [sx0, sw, off] of halves) {
        const k = Math.sin(phase + off) * 0.6 * run;
        c.save();
        c.transform(1, 0, k, 1, -k * ly * s, 0);
        c.drawImage(img, sx0, ly, sw, h - ly, sx0 * s, ly * s, sw * s, (h - ly) * s);
        c.restore();
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    // a hound from its rig: which baked motion, how far into it
    function drawHound(c, e, kind) {
      const spr = SPR[kind], R = env.rigs[kind];
      const fade = e.dying ? Math.max(0, 1 - e.dying / 0.75) : 1;
      const o = { scale: spr.s, flip: e.face < 0, alpha: fade, flash: e.hitT * 0.32 * fade };
      let tele = 0;
      if (e.dying) { o.anim = 'die'; o.k = Math.min(1, e.dying / 0.6); }
      else if (e.st === 'crouch') { o.anim = 'crouch'; o.k = tele = clamp(1 - e.t / CROUCH_T, 0, 1); }
      else if (e.st === 'pounce' || e.st === 'air') { const v0 = Math.abs(e.vy0 || 470); o.anim = 'leap'; o.k = clamp((e.vy + v0) / (2 * v0), 0, 1); }
      else if (e.st === 'recover') { o.anim = 'land'; o.k = clamp(1 - e.t / (e.t0 || 0.38), 0, 1); }
      else { o.anim = 'run'; o.u = e.gait || 0; }
      const pulse = 0.55 + 0.3 * Math.sin(tAll * 3 + e.seed) + e.hitT * 0.6 + (e.burn > 0 ? 0.4 : 0) + tele * 0.6;
      o.glow = clamp(pulse, 0, 1.4) * fade;
      R.draw(c, e.x - cam, e.y + 2 + (e.dying ? e.dying * 10 : 0), o);
      if (!e.dying) {                                  // under-light from the lava
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.22;
        c.drawImage(env.glowSprite('255,100,30'), e.x - cam - 50, e.y - 20, 100, 30);
        c.restore();
      }
    }
    function drawGhoul(c, e) {
      const R = env.rigs.ghoul, spr = SPR.ghoul;
      const fade = e.dying ? Math.max(0, 1 - e.dying / 0.75) : 1;
      const o = { scale: spr.s, flip: e.face > 0, alpha: fade, flash: e.hitT * 0.32 * fade };   // the photo faces left
      let tele = 0;
      if (e.dying) { o.anim = 'die'; o.k = Math.min(1, e.dying / 0.6); }
      else if (e.st === 'rear') { o.anim = 'rear'; o.k = tele = clamp(1 - e.t / 0.55, 0, 1); }
      else if (e.st === 'lunge') { o.anim = 'lunge'; o.k = clamp(1 - e.t / 0.3, 0, 1); }
      else if (e.st === 'recover') { o.anim = 'recover'; o.k = clamp(1 - e.t / 0.7, 0, 1); }
      else { o.anim = 'walk'; o.u = e.gait || 0; }
      const pulse = 0.55 + 0.3 * Math.sin(tAll * 3 + e.seed) + e.hitT * 0.6 + (e.burn > 0 ? 0.4 : 0) + tele * 0.6;
      o.glow = clamp(pulse, 0, 1.4) * fade;
      const x = e.x - cam, y = e.y + 2 + (e.dying ? e.dying * 10 : 0);
      R.draw(c, x, y, o);
      const q = R.point(o, 'eye');
      if (q) {                                         // burning eye
        const r = 7 + tele * 8;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (0.85 + 0.15 * Math.sin(tAll * 9 + e.seed)) * fade;
        c.drawImage(env.glowSprite('255,190,60'), x + q.x - r, y + q.y - r, r * 2, r * 2);
        c.drawImage(env.glowSprite('255,255,200'), x + q.x - 2.5, y + q.y - 2.5, 5, 5);
        c.restore();
      }
      if (!e.dying) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.22;
        c.drawImage(env.glowSprite('255,100,30'), x - 50, e.y - 20, 100, 30);
        c.restore();
      }
    }
    function drawBeast(c, e, spr, opt) {
      const img = spr.img;
      if (!img) return;
      const w = img.width, h = img.height, s = spr.s * (opt.scale || 1);
      const x = e.x - cam, y = e.y;
      const run = opt.run, phase = e.phase;
      const fade = e.dying ? Math.max(0, 1 - e.dying / 0.75) : 1;
      c.save();
      c.translate(x, y + (e.dying ? e.dying * 30 : 0));
      if ((e.face < 0) !== !!spr.faceLeft) c.scale(-1, 1);
      c.rotate(opt.pitch || 0);
      const bob = -Math.abs(Math.sin(phase)) * 5 * run;
      c.scale(opt.sx || 1, opt.sy || 1);
      c.translate(-w * s / 2, -h * s + bob + 4);
      const pulse = 0.55 + 0.3 * Math.sin(tAll * 3 + e.seed) + e.hitT * 0.6 + (e.burn > 0 ? 0.4 : 0) + (opt.tele || 0) * 0.6;
      blitBeast(c, img, w, h, s, spr.leg, phase, run, 'source-over', fade);
      blitBeast(c, spr.glow, w, h, s, spr.leg, phase, run, 'lighter', clamp(pulse, 0, 1.4) * fade);
      if (e.hitT > 0) blitBeast(c, spr.white, w, h, s, spr.leg, phase, run, 'lighter', e.hitT * 0.32 * fade);
      // burning eyes
      c.globalCompositeOperation = 'lighter';
      for (const [fx, fy] of spr.eyes) {
        const r = 7 + (opt.tele || 0) * 8;
        c.globalAlpha = (0.85 + 0.15 * Math.sin(tAll * 9 + e.seed)) * fade;
        c.drawImage(env.glowSprite('255,190,60'), fx * w * s - r, fy * h * s - r, r * 2, r * 2);
        c.drawImage(env.glowSprite('255,255,200'), fx * w * s - 2.5, fy * h * s - 2.5, 5, 5);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.restore();
      // under-light from the lava
      if (!e.dying) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.22;
        c.drawImage(env.glowSprite('255,100,30'), x - 50, y - 20, 100, 30);
        c.restore();
      }
    }
    function drawBat(c, e) {
      if (rigOk('bat')) {
        const R = env.rigs.bat, fade = e.dying ? Math.max(0, 1 - e.dying / 0.75) : 1;
        const pulse = 0.5 + 0.3 * Math.sin(tAll * 4 + e.seed) + e.hitT * 0.6 + (e.st === 'mark' ? 0.5 : 0);
        const o = { scale: SPR.bat.s, rot: clamp(e.vx / 900, -0.4, 0.4) + (e.dying ? e.dying * 4 : 0), alpha: fade,
          glow: clamp(pulse, 0, 1.3) * fade, flash: e.hitT * 0.32 * fade };
        if (e.st === 'dive') { o.anim = 'dive'; o.t = tAll + e.seed; }
        else { o.anim = 'fly'; o.u = ((e.phase / TAU) % 1 + 1) % 1; }
        const x = e.x - cam, y = e.y;
        R.draw(c, x, y, o);
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = fade;     // red eyes
        for (const n of ['eye0', 'eye1']) {
          const q = R.point(o, n); if (!q) continue;
          const r = e.st === 'mark' ? 10 : 5;
          c.drawImage(env.glowSprite('255,70,50'), x + q.x - r, y + q.y - r, r * 2, r * 2);
        }
        c.restore();
        return;
      }
      const spr = SPR.bat, img = spr.img;
      if (!img) return;
      const w = img.width, h = img.height, s = spr.s;
      const x = e.x - cam, y = e.y;
      const fade = e.dying ? Math.max(0, 1 - e.dying / 0.75) : 1;
      const flapAmp = e.st === 'dive' ? 0.15 : e.st === 'mark' ? 0.3 : 0.55;
      const a = Math.sin(e.phase) * flapAmp;
      const px = 0.42, py = 0.42;
      c.save();
      c.translate(x, y);
      c.rotate(clamp(e.vx / 900, -0.4, 0.4) + (e.dying ? e.dying * 4 : 0));
      if (e.st === 'dive') c.scale(0.92, 1.05);
      c.translate(-w * s / 2, -h * s * 0.55);
      const pulse = 0.5 + 0.3 * Math.sin(tAll * 4 + e.seed) + e.hitT * 0.6 + (e.st === 'mark' ? 0.5 : 0);
      for (const [img2, comp, al] of [[img, 'source-over', fade], [spr.glow, 'lighter', clamp(pulse, 0, 1.3) * fade], [e.hitT > 0 ? spr.white : null, 'lighter', e.hitT * 0.32 * fade]]) {
        if (!img2) continue;
        c.globalCompositeOperation = comp; c.globalAlpha = al;
        // left wing
        c.save(); c.translate(w * px * s, h * py * s); c.rotate(-a); c.scale(1, 1 - 0.25 * Math.abs(a));
        c.drawImage(img2, 0, 0, w * 0.43, h, -w * px * s, -h * py * s, w * 0.43 * s, h * s); c.restore();
        // right wing
        c.save(); c.translate(w * (1 - px) * s, h * py * s); c.rotate(a); c.scale(1, 1 - 0.25 * Math.abs(a));
        c.drawImage(img2, w * 0.57, 0, w * 0.43, h, (w * 0.57 - w * (1 - px)) * s, -h * py * s, w * 0.43 * s, h * s); c.restore();
        // body
        c.drawImage(img2, w * 0.38, 0, w * 0.24, h, w * 0.38 * s, 0, w * 0.24 * s, h * s);
      }
      c.globalCompositeOperation = 'lighter';
      for (const [fx, fy] of spr.eyes) {
        const r = e.st === 'mark' ? 10 : 5;
        c.globalAlpha = fade;
        c.drawImage(env.glowSprite('255,70,50'), fx * w * s - r, fy * h * s - r, r * 2, r * 2);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.restore();
    }
    // side-view flyer: the wings (behind the shoulder) beat around the shoulder joint
    function drawImp(c, e) {
      const kind = e.var === 'garg' ? 'garg' : 'imp';
      if (rigOk(kind)) {
        const R = env.rigs[kind], fade = e.dying ? Math.max(0, 1 - e.dying / 0.75) : 1;
        const pulse = 0.55 + 0.3 * Math.sin(tAll * 4 + e.seed) + e.hitT * 0.6 + (e.st === 'mark' || e.st === 'spit' ? 0.6 : 0);
        const lean = clamp(e.vy / 1200, -0.35, 0.5) + (e.dying ? e.dying * 3 : 0) + (e.st === 'spit' ? -0.12 : 0);
        const o = { scale: SPR[kind].s, flip: e.face < 0, rot: lean * (e.face < 0 ? -1 : 1), alpha: fade,
          glow: clamp(pulse, 0, 1.4) * fade, flash: e.hitT * 0.32 * fade };
        const u = ((e.phase * 0.75 / TAU) % 1 + 1) % 1;
        if (e.st === 'dive') { o.anim = 'dive'; o.t = tAll + e.seed; }
        else if (e.st === 'spit') { o.anim = 'spit'; o.u = u; }
        else { o.anim = 'fly'; o.u = u; }
        const x = e.x - cam, y = e.y;
        R.draw(c, x, y, o);
        if (e.st === 'spit') {                         // fire gathering in its jaws
          const q = R.point(o, 'mouth') || { x: 0, y: 0 }, k = 1 - e.t / 0.55, r = 6 + k * 12;
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.9 * fade;
          c.drawImage(env.glowSprite('255,150,40'), x + q.x - r, y + q.y - r, r * 2, r * 2);
          c.restore();
        }
        return;
      }
      const spr = SPR[kind], img = spr.img;
      if (!img) return;
      const w = img.width, h = img.height, s = spr.s;
      const x = e.x - cam, y = e.y;
      const fade = e.dying ? Math.max(0, 1 - e.dying / 0.75) : 1;
      const beat = e.st === 'dive' ? 0.05 : e.st === 'spit' ? 0.12 : 0.26;
      const a = Math.sin(e.phase * 0.75) * beat;
      const sx = spr.sh[0] * w, sy = spr.sh[1] * h, cut = spr.wing * w;
      c.save();
      c.translate(x, y + Math.sin(e.phase * 0.75 + 1) * 3);
      if (e.face < 0) c.scale(-1, 1);
      c.rotate(clamp(e.vy / 1200, -0.35, 0.5) + (e.dying ? e.dying * 3 : 0) + (e.st === 'spit' ? -0.12 : 0));
      c.translate(-w * s / 2, -h * s / 2);
      const pulse = 0.55 + 0.3 * Math.sin(tAll * 4 + e.seed) + e.hitT * 0.6 + (e.st === 'mark' || e.st === 'spit' ? 0.6 : 0);
      for (const [im, comp, al] of [[img, 'source-over', fade], [spr.glow, 'lighter', clamp(pulse, 0, 1.4) * fade], [e.hitT > 0 ? spr.white : null, 'lighter', e.hitT * 0.32 * fade]]) {
        if (!im) continue;
        c.globalCompositeOperation = comp; c.globalAlpha = al;
        c.save(); c.translate(sx * s, sy * s); c.rotate(a); c.scale(1, 1 - Math.abs(a) * 0.6);
        c.drawImage(im, 0, 0, cut, h, -sx * s, -sy * s, cut * s, h * s); c.restore();
        c.drawImage(im, cut, 0, w - cut, h, cut * s, 0, (w - cut) * s, h * s);
      }
      if (e.st === 'spit') {                         // fire gathering in its jaws
        const k = 1 - e.t / 0.55, r = 6 + k * 12;
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.9 * fade;
        c.drawImage(env.glowSprite('255,150,40'), w * s * 0.92 - r, h * s * 0.3 - r, r * 2, r * 2);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.restore();
    }
    // which baked motion the Gatekeeper shows and how far into it
    function brutePose(e) {
      const o = { scale: SPR.brute.s, flip: e.face > 0 };                                      // the photo faces left
      const prog = T0 => clamp(1 - e.t / T0, 0, 1);
      switch (e.st) {
        case 'sleep': o.anim = 'sleep'; o.t = tAll; break;
        case 'roar': o.anim = 'roar'; o.k = prog(e.raged ? 1.0 : 1.7) * 1.6; break;
        case 'guard': o.anim = 'guard'; o.t = tAll; break;
        case 'slamT': o.anim = 'slamT'; o.k = prog(0.8); break;
        case 'slam': o.anim = 'slam'; o.k = prog(0.35) * 1.4; break;
        case 'hurlT': o.anim = 'hurlT'; o.k = prog(0.7); break;
        case 'hurl': o.anim = 'hurl'; o.k = prog(0.35) * 1.3; break;
        case 'chargeT': o.anim = 'charge'; o.u = 0; o.rot = 0.06; break;
        case 'charge': o.anim = 'charge'; o.u = (tAll * 2.4) % 1; o.rot = 0.12; break;
        default: o.anim = 'walk'; o.u = ((e.phase / TAU) % 1 + 1) % 1;
      }
      if (o.k !== undefined) o.k = Math.min(1, o.k);
      if (o.rot) o.rot *= -e.face;                                  // lean into the charge
      return o;
    }
    function drawBrute(c, e) {
      const spr = SPR.brute, img = spr.img;
      if (!img) return;
      const w = img.width, h = img.height, s = spr.s;
      const x = e.x - cam, y = e.y;
      if (rigOk('brute')) {
        const R = env.rigs.brute, dying = e.dying ? Math.min(1, e.dying / 2.2) : 0;
        const tele = e.st === 'slamT' ? 1 - e.t / 0.8 : e.st === 'hurlT' ? 1 - e.t / 0.7 : e.st === 'chargeT' ? 1 : e.st === 'roar' ? 0.8 : e.st === 'guard' ? 0.4 : 0;
        const o = dying ? { anim: 'die', k: dying, scale: spr.s, flip: e.face > 0, rot: -e.face * 0.3 * Math.max(0, dying - 0.5) } : brutePose(e);
        const fade = 1 - Math.max(0, dying - 0.4) / 0.6;
        const pulse = 0.6 + 0.3 * Math.sin(tAll * 2.4) + e.hitT * 0.6 + tele * 0.5 + dying * 1.2 + (e.raged ? 0.25 : 0);
        o.alpha = fade; o.glow = clamp(pulse, 0, 2) * fade; o.flash = e.hitT * 0.28 * fade;
        const jx = e.st === 'roar' ? Math.sin(tAll * 40) * 1.2 : 0;
        R.draw(c, x + jx, y, o);
        if (e.st === 'hurlT') {                     // the fireball forming in its paw
          const q = R.point(o, 'hand') || { x: 0, y: -100 }, r = 10 + tele * 22;
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.9;
          c.drawImage(env.glowSprite('255,150,40'), x + q.x - r, y + q.y - r, r * 2, r * 2);
          c.drawImage(env.glowSprite('255,240,180'), x + q.x - r * 0.4, y + q.y - r * 0.4, r * 0.8, r * 0.8);
          c.restore();
        }
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3 + tele * 0.3;
        c.drawImage(env.glowSprite('255,100,30'), x - 90, y - 30, 180, 50); c.restore();
        if (e.st === 'guard') drawWard(c, e, x, y);
        return;
      }
      let lean = Math.sin(e.phase * 2) * 0.02, sy = 1 + Math.sin(tAll * 1.8) * 0.012, tele = 0;
      if (e.st === 'slamT') { const k = 1 - e.t / 0.8; lean = -0.14 * k; sy = 1 + 0.05 * k; tele = k; }
      if (e.st === 'slam') { lean = 0.16; sy = 0.95; }
      if (e.st === 'hurlT') { tele = 1 - e.t / 0.7; lean = -0.06 * tele; }
      if (e.st === 'chargeT') { tele = 1; lean = 0.1; }
      if (e.st === 'charge') lean = 0.18;
      if (e.st === 'roar') { lean = -0.1 + Math.sin(tAll * 40) * 0.01; tele = 0.8; }
      if (e.st === 'sleep') { sy = 0.97 + Math.sin(tAll * 1.2) * 0.01; }
      if (e.st === 'guard') { lean = -0.08; tele = 0.4; }
      const dying = e.dying ? Math.min(1, e.dying / 2.2) : 0;
      c.save();
      c.translate(x, y);
      if (e.face > 0) c.scale(-1, 1);              // the photo faces left
      c.rotate(-lean - dying * 0.5);
      c.scale(1, sy * (1 - dying * 0.25));
      c.translate(-w * s / 2, -h * s + 3);
      const fade = 1 - Math.max(0, dying - 0.4) / 0.6;
      const pulse = 0.6 + 0.3 * Math.sin(tAll * 2.4) + e.hitT * 0.6 + tele * 0.5 + dying * 1.2 + (e.raged ? 0.25 : 0);
      c.globalAlpha = fade; c.drawImage(img, 0, 0, w * s, h * s);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = clamp(pulse, 0, 1.6) * fade; c.drawImage(spr.glow, 0, 0, w * s, h * s);
      if (pulse > 1) { c.globalAlpha = (pulse - 1) * fade; c.drawImage(spr.glow, 0, 0, w * s, h * s); }
      if (e.hitT > 0 && spr.white) { c.globalAlpha = e.hitT * 0.28 * fade; c.drawImage(spr.white, 0, 0, w * s, h * s); }
      for (const [fx, fy] of spr.eyes) {
        const r = 8 + tele * 10;
        c.globalAlpha = fade; c.drawImage(env.glowSprite('255,170,50'), fx * w * s - r, fy * h * s - r, r * 2, r * 2);
        c.drawImage(env.glowSprite('255,255,210'), fx * w * s - 3, fy * h * s - 3, 6, 6);
      }
      // the fireball forming in its paw
      if (e.st === 'hurlT') {
        const r = 10 + tele * 22;
        const [hx2, hy2] = spr.hand;
        c.globalAlpha = 0.9; c.drawImage(env.glowSprite('255,150,40'), hx2 * w * s - r, hy2 * h * s - r, r * 2, r * 2);
        c.drawImage(env.glowSprite('255,240,180'), hx2 * w * s - r * 0.4, hy2 * h * s - r * 0.4, r * 0.8, r * 0.8);
      }
      c.restore();
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3 + tele * 0.3;
      c.drawImage(env.glowSprite('255,100,30'), x - 90, y - 30, 180, 50); c.restore();
      if (e.st === 'guard') drawWard(c, e, x, y);
    }
    function drawWard(c, e, x, y) {
      {                                            // a burning ward of runes in front of it
        const k = Math.min(1, (1.5 - e.t) / 0.2) * Math.min(1, e.t / 0.2);
        c.save(); c.translate(x + e.face * 52, y - 128); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 18; i++) {
          const a = -1.2 + i / 17 * 2.4, r = 70, px = Math.cos(a) * 18 * e.face, py = Math.sin(a) * r;
          const s2 = 5 + 2 * Math.sin(tAll * 8 + i);
          c.globalAlpha = k * (0.6 + 0.4 * Math.sin(tAll * 6 + i));
          c.drawImage(env.glowSprite(i % 3 ? '255,150,60' : '255,230,160'), px - s2, py - s2, s2 * 2, s2 * 2);
        }
        c.globalAlpha = k * 0.35; c.drawImage(env.glowSprite('255,120,40'), -40, -90, 80, 180);
        c.restore();
      }
    }
    function drawSerpent(c, z) {
      const s = z.s;
      if (!s) return;
      const T = s.trail, n = T.length;
      if (n < 2) return;
      c.save();
      c.beginPath(); c.rect(-20, -20, W + 40, LAVA_Y + 22); c.clip();     // it rises out of / sinks into the lava
      // body: textured strips between successive trail points, tapering to the tail
      let u = 0;
      for (let i = n - 1; i >= 1; i--) {
        const [x0, y0] = T[i], [x1, y1] = T[i - 1];
        if (y0 > LAVA_Y + 10 && y1 > LAVA_Y + 10) continue;
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
        if (len < 0.01) continue;
        const k = i / (n - 1), th = 8 + (1 - k) * 16;
        u = (u + len * 0.9) % 80;
        c.save(); c.translate((x0 + x1) / 2 - cam, (y0 + y1) / 2); c.rotate(Math.atan2(dy, dx));
        c.drawImage(segSprite, u, 0, Math.max(1, len * 0.9 + 0.5), 40, -len / 2 - 0.6, -th / 2, len + 1.2, th);
        c.restore();
      }
      if (s.hitT > 0) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = s.hitT * 0.5;
        for (let i = 0; i < n; i += 4) c.drawImage(env.glowSprite('255,200,140'), T[i][0] - cam - 14, T[i][1] - 14, 28, 28);
        c.restore();
      }
      // head: horned wedge, opening jaws, burning eyes (only once it has broken the surface)
      const [hx, hy] = T[0], nx = T[Math.min(3, n - 1)];
      if (hy > LAVA_Y + 4) { c.restore(); return; }
      const ang = Math.atan2(hy - nx[1], hx - nx[0]);
      c.translate(hx - cam, hy); c.rotate(ang);
      const open = 0.35 + 0.3 * Math.sin(tAll * 10);
      c.save(); c.rotate(open * 0.5);                 // lower jaw
      c.fillStyle = '#1c0a07';
      c.beginPath(); c.moveTo(-6, 4); c.quadraticCurveTo(14, 9, 30, 5); c.lineTo(28, 2); c.quadraticCurveTo(12, 3, -4, 0); c.closePath(); c.fill();
      c.fillStyle = '#e8dcc8';
      for (let tx = 6; tx < 26; tx += 5) { c.beginPath(); c.moveTo(tx, 2.5); c.lineTo(tx + 1.4, -1); c.lineTo(tx + 2.8, 2.5); c.fill(); }
      c.restore();
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.9;   // fire in the throat
      c.drawImage(env.glowSprite('255,140,40'), 0, -8, 34, 16); c.restore();
      c.save(); c.rotate(-open * 0.35);               // skull + upper jaw in the basalt skin
      c.beginPath(); c.moveTo(-10, 6); c.quadraticCurveTo(-8, -12, 8, -11); c.quadraticCurveTo(24, -9, 33, -1); c.lineTo(30, 1); c.quadraticCurveTo(12, 0, -10, 6); c.closePath();
      c.save(); c.clip(); c.drawImage(segSprite, 0, 0, 44, 40, -12, -14, 48, 22); c.restore();
      c.fillStyle = '#e8dcc8';
      for (let tx = 8; tx < 28; tx += 5) { c.beginPath(); c.moveTo(tx, 0); c.lineTo(tx + 1.4, 3.5); c.lineTo(tx + 2.8, 0); c.fill(); }
      c.strokeStyle = '#2a120c'; c.lineWidth = 3; c.lineCap = 'round';      // horn
      c.beginPath(); c.moveTo(-2, -10); c.quadraticCurveTo(-10, -20, -18, -18); c.stroke();
      c.globalCompositeOperation = 'lighter';
      c.drawImage(env.glowSprite('255,220,110'), 8, -10, 9, 7);
      c.drawImage(env.glowSprite('255,255,210'), 10.5, -8.5, 4, 4);
      c.restore();
      c.restore();
    }
    function drawPickups(c) {
      for (const p of pickups) {
        if (p.taken) continue;
        const x = p.x - cam, y = p.y + Math.sin(p.ph * 2.2) * 5;
        if (x < -30 || x > W + 30) continue;
        c.save(); c.globalCompositeOperation = 'lighter';
        if (p.kind === 'heal') {
          c.globalAlpha = 0.8; c.drawImage(env.glowSprite('110,255,190'), x - 26, y - 26, 52, 52);
          c.globalAlpha = 1; c.drawImage(env.glowSprite('230,255,245'), x - 8, y - 11, 16, 20);
          for (let i = 0; i < 3; i++) { const a = p.ph * 3 + i * 2.1; c.drawImage(env.glowSprite('150,255,210'), x + Math.cos(a) * 14 - 3, y + Math.sin(a) * 6 - 3, 6, 6); }
        } else {
          c.globalAlpha = 0.85; c.drawImage(env.glowSprite('255,140,40'), x - 26, y - 26, 52, 52);
          c.globalCompositeOperation = 'source-over';
          c.translate(x, y); c.rotate(-0.5);
          for (let i = -1; i <= 1; i++) {
            c.strokeStyle = '#d8b07a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-12, i * 4); c.lineTo(12, i * 4); c.stroke();
            c.fillStyle = '#ffcf6a'; c.beginPath(); c.moveTo(12, i * 4 - 3); c.lineTo(17, i * 4); c.lineTo(12, i * 4 + 3); c.fill();
          }
          c.globalCompositeOperation = 'lighter';
          c.drawImage(env.glowSprite('255,200,90'), 8, -14, 16, 28);
        }
        c.restore();
      }
    }
    function drawPortal(c) {
      const x = PORTAL_X - cam, y = 520;
      if (x < -120 || x > W + 120) return;
      const k = portalK;
      c.save();
      // the sealed gate: a basalt arch with runes; opens into the light of the pond
      c.translate(x, y);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.25 + 0.75 * k;
      c.drawImage(env.glowSprite('120,255,220'), -110, -130, 220, 260);
      c.globalAlpha = 1;
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * TAU + tAll * (0.6 + k * 1.4);
        const rx = 42, ry = 66;
        const r = 3 + 2 * Math.sin(tAll * 3 + i);
        c.globalAlpha = 0.35 + 0.65 * k;
        c.drawImage(env.glowSprite(k > 0.5 ? '170,255,230' : '255,120,50'), Math.cos(a) * rx - r * 2, Math.sin(a) * ry - r * 2, r * 4, r * 4);
      }
      if (k > 0.05) {
        const g = c.createRadialGradient(0, 0, 4, 0, 0, 60);
        g.addColorStop(0, `rgba(235,255,250,${0.95 * k})`); g.addColorStop(0.5, `rgba(120,240,210,${0.55 * k})`); g.addColorStop(1, 'rgba(60,160,140,0)');
        c.fillStyle = g; c.save(); c.scale(0.68, 1.05); c.beginPath(); c.arc(0, 0, 62, 0, TAU); c.fill(); c.restore();
        for (let i = 0; i < 8; i++) {
          const a = tAll * 2.5 + i * 0.8, r = 48 * ((tAll * 0.7 + i / 8) % 1);
          c.globalAlpha = k * 0.8; c.drawImage(env.glowSprite('200,255,240'), Math.cos(a) * r * 0.68 - 3, Math.sin(a) * r - 3, 6, 6);
        }
      }
      c.restore();
      if (k < 0.5) {
        c.save(); c.fillStyle = 'rgba(255,180,120,0.75)'; c.font = 'bold 11px system-ui'; c.textAlign = 'center';
        if (arena && boss && !boss.dying) c.fillText('SEALED', x, y + 96);
        c.restore();
      }
    }
    function drawArrows(c) {
      for (const a of arrows) {
        let x, y, ang;
        if (a.stuck) { const e = a.stuck; x = e.x + a.ox * (e.face === a.side ? 1 : -1) - cam; y = e.y + a.oy; ang = a.side === e.face ? a.ang : Math.PI - a.ang; }
        else { x = a.x - cam; y = a.y; ang = Math.atan2(a.vy, a.vx); }
        if (a.ground) ang = Math.atan2(a.vy, a.vx);
        if (x < -40 || x > W + 40) continue;
        c.save(); c.translate(x, y); c.rotate(ang);
        c.globalAlpha = a.ground || a.stuck ? clamp(a.life / 0.6, 0, 1) : 1;
        if (a.fire && !a.ground) { c.globalCompositeOperation = 'lighter'; c.drawImage(env.glowSprite('255,140,40'), -26, -9, 40, 18); c.globalCompositeOperation = 'source-over'; }
        const tail = -(Math.max(26, arrowLen) - 10);            // same length as the arrow drawn on the bow
        c.strokeStyle = '#8a5a34'; c.lineWidth = 1.8;
        c.beginPath(); c.moveTo(tail, 0); c.lineTo(a.stuck || a.ground ? 2 : 4, 0); c.stroke();
        if (!a.stuck && !a.ground) { c.fillStyle = '#9aa3ad'; c.beginPath(); c.moveTo(4, -2.6); c.lineTo(10, 0); c.lineTo(4, 2.6); c.closePath(); c.fill(); }
        c.fillStyle = a.fire ? '#ffb347' : '#3f7fd0';                        // blue fletching, like the rendered arrow
        c.beginPath(); c.moveTo(tail + 6, 0); c.lineTo(tail - 1, -3.4); c.lineTo(tail + 1, 0); c.lineTo(tail - 1, 3.4); c.closePath(); c.fill();
        if (!a.stuck && !a.ground) {
          c.globalCompositeOperation = 'lighter'; c.strokeStyle = a.fire ? 'rgba(255,150,50,0.5)' : 'rgba(255,240,220,0.22)'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(tail - 18, 0); c.lineTo(tail, 0); c.stroke();
        }
        c.restore();
      }
    }
    function drawShots(c) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const s of shots) {
        const x = s.x - cam, r = s.small ? 0.6 : 1;
        c.drawImage(env.glowSprite('255,120,30'), x - 26 * r, s.y - 26 * r, 52 * r, 52 * r);
        c.drawImage(env.glowSprite('255,230,150'), x - 9 * r, s.y - 9 * r, 18 * r, 18 * r);
      }
      for (const w of waves) {
        const x = w.x - cam, k = w.life / 1.7;
        c.globalAlpha = k; c.drawImage(env.glowSprite('255,130,40'), x - 26, 590 - 40, 52, 50);
        c.globalAlpha = 1;
      }
      c.restore();
      for (const w of waves) {
        const x = w.x - cam;
        c.fillStyle = 'rgba(40,24,20,0.95)';
        c.beginPath(); c.moveTo(x - 18, 591); c.lineTo(x - 6, 562 + Math.random() * 4); c.lineTo(x + 2, 570); c.lineTo(x + 10, 558 + Math.random() * 4); c.lineTo(x + 18, 591); c.closePath(); c.fill();
      }
    }
    function drawWall(c) {
      if (!wall.on || wall.alpha <= 0.01) return;
      const wx = wall.x - cam;
      if (wx < -140) return;
      // shadows of the horde inside the fire, eyes burning
      const hs = SPR.horn;
      env.drawShader(c, wallProg, 0, 0, W, H, { u_wx: wx, u_alpha: wall.alpha }, 0.4);
      c.save();
      for (let i = 0; i < 5; i++) {
        const sx = wx - 40 - i * 34 + Math.sin(tAll * 1.3 + i) * 10, sy = 590 - (i % 2) * 6;
        if (hs.black && sx > -120) {
          c.globalAlpha = 0.75 * wall.alpha;
          const s = 0.3, w = hs.img.width * s, h = hs.img.height * s;
          c.drawImage(hs.black, sx - w / 2, sy - h + 4, w, h);
        }
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = (0.7 + 0.3 * Math.sin(tAll * 7 + i)) * wall.alpha;
        const ex = sx + 34, ey = sy - 52;
        c.drawImage(env.glowSprite('255,200,60'), ex - 5, ey - 5, 10, 10);
        c.globalCompositeOperation = 'source-over';
      }
      c.restore();
      // the horde's light on everything in front of it
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.45 * wall.alpha;
      c.drawImage(env.glowSprite('255,90,20'), wx - 160, 200, 320, 520); c.restore();
      if (Math.random() < 0.8 && wx > -40) spawnP({ x: wall.x + rand(-30, 10), y: rand(250, 600), vx: rand(20, 110), vy: rand(-90, -30), kind: 'glow', rgb: Math.random() < 0.5 ? '255,180,70' : '255,90,30', size: rand(1.4, 3), life: rand(0.6, 1.4), layer: 'front' });
    }
    function drawHeroLayer(c) {
      const h = hero;
      if (h.hidden) return;
      let x = h.x - cam, y = h.y;
      c.save();
      if (h.portalT > 0) {
        const k = Math.min(1, h.portalT / 1.0);
        c.globalAlpha = 1 - k;
        c.translate(x, y - 36); c.rotate(k * 6); c.scale(1 - k * 0.8, 1 - k * 0.8); c.translate(-x, -(y - 36));
      }
      if (env.invulnerable && Math.floor(tAll * 14) % 2 === 0 && h.portalT <= 0) c.globalAlpha = 0.55;
      // warm lava light pooled under the feet
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= 0.28;
      c.drawImage(env.glowSprite('255,110,40'), x - 40, y - 16, 80, 26); c.restore();
      if (env.hero.ready) {
        const HA = env.hero, has = n => HA.has(n);
        let anim = 'idle', at = tAll;
        if (h.rollT > 0 && has('roll')) { anim = 'roll'; at = HA.dur('roll') * clamp(1 - h.rollT / 0.5, 0, 0.98); }
        else if (h.drawing) {
          const k = bowLegs();
          if (h.draw < 0.97 && has(k + 'draw')) { anim = k + 'draw'; at = HA.dur(k + 'draw') * h.draw; }
          else { anim = k + 'hold_' + aimTag(h.aim); at = holdTime(k); }
        }
        else if (h.relT > 0) {
          const rl = h.relLegs && has(h.relLegs + 'release_' + aimTag(h.relAim || 0)) ? h.relLegs : '';
          anim = rl + 'release_' + aimTag(h.relAim || 0);
          at = HA.dur(anim) * clamp(1 - h.relT / 0.32, 0, 0.98);
        }
        else if (h.hurtT > 0 && has('hit')) { anim = 'hit'; at = HA.dur('hit') * clamp(1 - h.hurtT / 0.32, 0, 0.98); }
        else if (!h.onGround) {
          anim = h.vy < -120 && has('jump') ? 'jump' : 'air';
          at = anim === 'jump' ? HA.dur('jump') * clamp(0.25 + 0.5 * (1 + h.vy / 665), 0.25, 0.85) : tAll;
        }
        else if (h.crawl && has('crawl')) { anim = 'crawl'; at = h.crawlClock; }
        else if (h.crouch && has('crouch')) { anim = 'crouch'; at = tAll; }
        else if (Math.abs(h.vx) > 34) { anim = 'run'; at = h.runClock; }
        if (!has(anim)) anim = 'idle';
        HA.draw(c, x, y, { anim, t: at, facing: h.face, height: HERO_H, flash: h.hurtT > 0 ? h.hurtT / 0.32 : 0, shadow: h.onGround });
        if (h.drawing && h.draw >= NOCKED) aimGuide(c);
      } else env.drawHero(c, x, y, {
        facing: h.face, run: clamp(Math.abs(h.vx) / 192, 0, 1), phase: h.phase, air: !h.onGround, vy: h.vy,
        weapon: 'bow', draw: h.drawing ? h.draw : 0, aim: h.aim, hurt: h.hurtT / 0.32, scale: 1.02
      });
      c.restore();
    }

    // where the arrow will go: dots along its real flight path, brighter as the bow bends
    function aimGuide(c) {
      const h = hero, o = bowOrigin(), sp = arrowSpeed(bowPower());
      const vx = Math.cos(h.aim) * sp * h.face, vy = -Math.sin(h.aim) * sp;
      const a0 = 0.25 + 0.55 * h.draw;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 14; i++) {
        const t = i * 0.026, px = o.x + vx * t - cam, py = o.y + vy * t + 0.5 * ARROW_G * t * t;
        const k = 1 - i / 15, r = 1.4 + 1.6 * k;
        c.globalAlpha = a0 * k;
        c.fillStyle = h.draw >= 0.97 ? '#ffe7a8' : '#ffd0a0';
        c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }

    function render(c) {
      const t = tAll;
      drawSky(c);
      drawFar(c, t);
      env.fx.draw(c, 'back', cam, 0);
      drawSegs(c);
      drawLava(c);                                   // after the rock: the lava buries every base
      if (!window.__noHaze) shimmer(c, LAVA_Y - 80, LAVA_Y - 2);
      // lava light climbing the rock faces
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gradients(c).glowBand; c.fillRect(0, LAVA_Y - 180, W, 184); c.restore();
      drawGeysers(c);
      for (const z of zones) drawSerpent(c, z);
      drawPortal(c);
      drawPickups(c);
      for (const e of enemies) {
        if (e.x - cam < -200 || e.x - cam > W + 200) continue;
        if (e.type === 'hound') {
          const kind = e.var === 'horn' ? 'horn' : 'hound';
          if (rigOk(kind)) { drawHound(c, e, kind); continue; }
          const opt = { run: e.st === 'run' ? 1 : e.st === 'recover' ? 0.3 : 0, pitch: 0 };
          if (e.st === 'crouch') { opt.sy = 0.88; opt.sx = 1.06; opt.pitch = 0.06; opt.tele = 1 - e.t / CROUCH_T; }
          if (e.st === 'pounce' || e.st === 'air') { opt.pitch = clamp(e.vy / 1400, -0.35, 0.4); opt.sx = 1.08; opt.sy = 0.95; }
          drawBeast(c, e, e.var === 'horn' ? SPR.horn : SPR.hound, opt);
        } else if (e.type === 'ghoul') {
          if (rigOk('ghoul')) { drawGhoul(c, e); continue; }
          const opt = { run: Math.min(1, Math.abs(e.vx) / 110), pitch: 0 };
          if (e.st === 'rear') { opt.pitch = -0.2 * (1 - e.t / 0.55); opt.tele = 1 - e.t / 0.55; }
          if (e.st === 'lunge') { opt.pitch = 0.1; opt.sx = 1.08; opt.run = 1; }
          drawBeast(c, e, SPR.ghoul, opt);
        } else if (e.type === 'bat') drawBat(c, e);
        else if (e.type === 'imp') drawImp(c, e);
        else if (e.type === 'brute') drawBrute(c, e);
      }
      drawHeroLayer(c);
      drawArrows(c);
      drawShots(c);
      drawWall(c);
      env.fx.draw(c, 'front', cam, 0);
      // grade: a warm vignette, drawn only where it isn't fully transparent (top + bottom bands).
      // (The full-screen warm multiply pass is gone: two full-screen fills per frame on phones.)
      c.fillStyle = gradients(c).vign; c.fillRect(0, 0, W, 222); c.fillRect(0, 538, W, H - 538);
      if (msgT > 0) {
        c.save(); c.globalAlpha = clamp(msgT / 0.5, 0, 1) * clamp((3.2 - msgT) / 0.3, 0, 1);
        c.textAlign = 'center'; c.font = 'bold 16px system-ui';
        const my = Math.max(168, env.view.top + 70);            // inside the landscape camera's band too
        c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.strokeText(msg, W / 2, my);
        c.fillStyle = '#ffd9a8'; c.fillText(msg, W / 2, my);
        c.restore();
      }
    }

    return {
      update(dt, I) { try { update(dt, I); } catch (e) { console.error('HELL update: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' / ')); throw e; } },
      render(c) { const t0 = performance.now(); try { render(c); frameMs = lerp(frameMs, performance.now() - t0, 0.1); } catch (e) { console.error('HELL render: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' / ')); throw e; } },
      debug() {
        return {
          x: Math.round(hero.x), y: Math.round(hero.y), vy: Math.round(hero.vy), onGround: hero.onGround, lava: hero.lavaT > 0,
          draw: +hero.draw.toFixed(2), aim: +hero.aim.toFixed(2), progress: +(hero.x / PORTAL_X).toFixed(3),
          wall: wall.on ? Math.round(wall.x) : null, arena, portalOpen, volley: VOLLEY.n,
          boss: boss ? { hp: boss.hp, st: boss.st, dying: !!boss.dying } : null,
          enemies: enemies.map(e => `${e.type}:${e.st}${e.dying ? '†' : ''}@${Math.round(e.x)}`),
          arrows: arrows.length, kills, renderMs: +frameMs.toFixed(2), shaders: [!!skyProg, !!lavaProg, !!wallProg].join(','), serpents: zones.map(z => (z.on ? z.st : 'off') + (z.s ? '@' + Math.round(z.s.hx) + ',' + Math.round(z.s.hy) : ''))
        };
      },
      destroy() { window.__hellAuto = false; }
    };
  }
})();
