// ============================================================================
// Drift & Bloom — ALIEN WORLD
// A saucer beamed you aboard its mothership. You steal a fighter, break out of
// the hangar, survive the alien fleet in open space and finally destroy the
// mothership itself. Portrait vertical shooter, ~2 minutes.
//
// Controls: stick = fly · Fire (hold, limited ammo) · Missile (homing, count)
//           Shield (bubble, count). Keyboard: arrows/WASD, J or Space = fire,
//           K = missile, L = shield.
// Test flags (URL): &god=1 no damage · &skip=space|boss jump ahead ·
//                   &auto=1 autopilot (dodges + shoots) for headless runs.
// ============================================================================
(function () {
  'use strict';

  const Q = new URLSearchParams(location.search);
  const GOD = Q.get('god') === '1', SKIP = Q.get('skip') || '', AUTO = Q.get('auto') === '1';
  const A = 'assets/worlds/alien/';
  const TAU = Math.PI * 2;
  let LIVE = null;                                   // running world state (button counters read it)
  let BASE = null;                                   // generated art, cached across visits

  // ── tiny utils ────────────────────────────────────────────────────────────
  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function hash2(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm2(x, y, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (o || 4); i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

  // greebles: small lit / shadowed panels that make hulls read as real machinery
  function greebles(g, R, n, x0, y0, w, h, light, dark) {
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * w, y = y0 + R() * h, gw = 1.5 + R() * 7, gh = 1 + R() * 4;
      g.fillStyle = R() < 0.5 ? light : dark;
      g.fillRect(x, y, gw, gh);
    }
  }

  // ── ART (built once per world entry, at 2.5x the drawn size) ──────────────
  const K = 2.5;

  function shipArt(rgb) {                           // the stolen fighter, nose up, 76x84
    const w = 76, h = 84, c = mk(w * K, h * K), g = c.getContext('2d');
    g.scale(K, K); g.translate(w / 2, h / 2 + 2);
    const R = rng(7);
    const fus = new Path2D();
    fus.moveTo(0, -40); fus.bezierCurveTo(4, -36, 7, -26, 8, -13); fus.lineTo(9.5, 6);
    fus.bezierCurveTo(9.5, 17, 8.5, 27, 6.5, 33); fus.lineTo(-6.5, 33);
    fus.bezierCurveTo(-8.5, 27, -9.5, 17, -9.5, 6); fus.lineTo(-8, -13); fus.bezierCurveTo(-7, -26, -4, -36, 0, -40); fus.closePath();
    const wing = s => { const p = new Path2D(); p.moveTo(s * 7, -5); p.lineTo(s * 33, 15); p.lineTo(s * 34, 23); p.lineTo(s * 25, 24); p.lineTo(s * 8.5, 21); p.closePath(); return p; };
    const can = s => { const p = new Path2D(); p.moveTo(s * 7, -19); p.lineTo(s * 15, -9); p.lineTo(s * 14, -6); p.lineTo(s * 7.5, -8); p.closePath(); return p; };
    const fin = s => { const p = new Path2D(); p.moveTo(s * 5, 21); p.lineTo(s * 13, 35); p.lineTo(s * 11, 38); p.lineTo(s * 4, 31); p.closePath(); return p; };
    // soft drop shadow to lift it off the background
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
    for (const s of [-1, 1]) { g.fillStyle = '#7c8794'; g.fill(wing(s)); }
    g.restore();
    for (const s of [-1, 1]) {
      const wg = g.createLinearGradient(s * 7, 0, s * 34, 18);
      wg.addColorStop(0, s < 0 ? '#e7ebf1' : '#c3cad4'); wg.addColorStop(1, s < 0 ? '#a7b0bc' : '#7d8794');
      g.fillStyle = wg; g.fill(wing(s));
      g.save(); g.clip(wing(s));
      g.fillStyle = 'rgba(30,38,48,0.35)'; g.fillRect(-40, 19, 80, 6);          // trailing-edge flap band
      g.strokeStyle = 'rgba(40,50,62,0.45)'; g.lineWidth = 0.35;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(s * (10 + k * 5), -1 + k * 4); g.lineTo(s * (12 + k * 5), 21); g.stroke(); }
      g.fillStyle = `rgba(${rgb},0.9)`;                                        // spirit-coloured stripe
      g.beginPath(); g.moveTo(s * 22, 7); g.lineTo(s * 27, 11); g.lineTo(s * 27, 21); g.lineTo(s * 22, 21); g.closePath(); g.fill();
      greebles(g, R, 26, s < 0 ? -34 : 8, -2, 26, 24, 'rgba(255,255,255,0.18)', 'rgba(20,26,34,0.25)');
      g.restore();
      g.fillStyle = '#5b6573'; g.fillRect(s * 33 - 1.2, 9, 2.4, 13);               // wingtip cannon
      g.fillStyle = s < 0 ? '#ff4b4b' : '#3dff8a';                                 // nav lights
      g.beginPath(); g.arc(s * 33.6, 23.5, 1, 0, TAU); g.fill();
      g.fillStyle = '#9aa4b1'; g.fill(can(s)); g.fillStyle = '#b7bfca'; g.fill(fin(s));
    }
    // fuselage: lit from the top-left
    const fg = g.createLinearGradient(-10, 0, 10, 0);
    fg.addColorStop(0, '#c2c9d3'); fg.addColorStop(0.42, '#f7f9fc'); fg.addColorStop(0.55, '#dfe4eb'); fg.addColorStop(1, '#7a8593');
    g.fillStyle = fg; g.fill(fus);
    g.save(); g.clip(fus);
    g.strokeStyle = 'rgba(40,50,62,0.4)'; g.lineWidth = 0.4;
    for (const y of [-24, 0, 14, 24]) { g.beginPath(); g.moveTo(-10, y); g.lineTo(10, y + 1); g.stroke(); }
    g.beginPath(); g.moveTo(0, -2); g.lineTo(0, 33); g.stroke();
    g.fillStyle = `rgba(${rgb},0.85)`; g.fillRect(-1.2, 2, 2.4, 20);              // spine stripe
    greebles(g, R, 30, -9, -8, 18, 40, 'rgba(255,255,255,0.22)', 'rgba(20,26,34,0.22)');
    const sh = g.createLinearGradient(0, -40, 0, 34);                             // nose highlight
    sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.3, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(-10, -40, 20, 74);
    g.restore();
    g.strokeStyle = 'rgba(20,26,34,0.6)'; g.lineWidth = 0.5; g.stroke(fus);
    // engine nozzles
    for (const s of [-1, 1]) {
      g.fillStyle = '#3a414b'; g.beginPath(); g.ellipse(s * 4.4, 34, 3.6, 2.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#12161b'; g.beginPath(); g.ellipse(s * 4.4, 34.4, 2.4, 1.5, 0, 0, TAU); g.fill();
    }
    // canopy well (the spirit is drawn into it live)
    g.fillStyle = '#081420'; g.beginPath(); g.ellipse(0, -15, 4.8, 9.5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#4b5562'; g.lineWidth = 0.8; g.stroke();
    return { img: c, w, h, cy: -15 + 2, crx: 4.3, cry: 9 };
  }

  function canopyGlass() {
    const w = 12, h = 22, c = mk(w * K, h * K), g = c.getContext('2d');
    g.scale(K, K); g.translate(w / 2, h / 2);
    const gg = g.createLinearGradient(-5, -10, 5, 10);
    gg.addColorStop(0, 'rgba(160,220,255,0.55)'); gg.addColorStop(0.35, 'rgba(60,140,200,0.18)'); gg.addColorStop(1, 'rgba(10,40,70,0.35)');
    g.fillStyle = gg; g.beginPath(); g.ellipse(0, 0, 4.8, 9.5, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.ellipse(-1.8, -4.5, 0.9, 3.6, -0.25, 0, TAU); g.fill();
    return c;
  }

  function fighterArt() {                           // organic alien fighter, nose down, 66x60
    const w = 66, h = 60, c = mk(w * K, h * K), g = c.getContext('2d');
    g.scale(K, K); g.translate(w / 2, h / 2);
    const R = rng(21);
    for (const s of [-1, 1]) {
      const p = new Path2D();
      p.moveTo(s * 7, -9); p.bezierCurveTo(s * 18, -16, s * 31, -5, s * 32, 15); p.bezierCurveTo(s * 27, 9, s * 18, 5, s * 8.5, 7); p.closePath();
      const wg = g.createLinearGradient(s * 6, -10, s * 32, 15);
      wg.addColorStop(0, '#26332d'); wg.addColorStop(0.6, '#18211d'); wg.addColorStop(1, '#0b0f0d');
      g.fillStyle = wg; g.fill(p);
      g.save(); g.clip(p); greebles(g, R, 18, s < 0 ? -32 : 6, -14, 26, 28, 'rgba(120,180,150,0.16)', 'rgba(0,0,0,0.3)'); g.restore();
      g.strokeStyle = 'rgba(120,200,160,0.55)'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(s * 7, -9); g.bezierCurveTo(s * 18, -16, s * 31, -5, s * 32, 15); g.stroke();
      const q = new Path2D();                          // inner blade
      q.moveTo(s * 8, 2); q.bezierCurveTo(s * 16, 0, s * 22, 6, s * 24, 20); q.bezierCurveTo(s * 18, 14, s * 13, 11, s * 8, 10); q.closePath();
      g.fillStyle = '#1f2a25'; g.fill(q); g.strokeStyle = 'rgba(110,190,150,0.35)'; g.lineWidth = 0.5; g.stroke(q);
    }
    const body = new Path2D();
    body.moveTo(0, 26); body.bezierCurveTo(7, 22, 10.5, 5, 8.5, -12); body.bezierCurveTo(6.5, -23, -6.5, -23, -8.5, -12); body.bezierCurveTo(-10.5, 5, -7, 22, 0, 26); body.closePath();
    const bg = g.createLinearGradient(-10, 0, 10, 0);
    bg.addColorStop(0, '#516e60'); bg.addColorStop(0.45, '#2f3f37'); bg.addColorStop(1, '#0d1310');
    g.fillStyle = bg; g.fill(body);
    g.save(); g.clip(body);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.6;
    for (let y = -18; y < 24; y += 5) { g.beginPath(); g.moveTo(-10, y); g.quadraticCurveTo(0, y + 3, 10, y); g.stroke(); }  // chitin ribs
    greebles(g, R, 14, -8, -20, 16, 40, 'rgba(150,220,180,0.14)', 'rgba(0,0,0,0.3)');
    g.restore();
    g.globalCompositeOperation = 'lighter';
    for (const y of [-8, -1, 6]) {
      const vg = g.createRadialGradient(0, y, 0, 0, y, 5);
      vg.addColorStop(0, 'rgba(160,255,200,0.95)'); vg.addColorStop(1, 'rgba(60,255,150,0)');
      g.fillStyle = vg; g.fillRect(-6, y - 5, 12, 10);
      g.fillStyle = 'rgba(200,255,220,0.9)'; g.fillRect(-3, y - 0.5, 6, 1);
    }
    const eg = g.createRadialGradient(0, 19, 0, 0, 19, 8);
    eg.addColorStop(0, 'rgba(255,255,230,1)'); eg.addColorStop(0.25, 'rgba(120,255,170,0.9)'); eg.addColorStop(1, 'rgba(40,255,120,0)');
    g.fillStyle = eg; g.fillRect(-8, 11, 16, 16);
    g.globalCompositeOperation = 'source-over';
    return { img: c, w, h };
  }

  function interceptorArt() {                       // crescent interceptor, nose down, 78x52
    const w = 78, h = 52, c = mk(w * K, h * K), g = c.getContext('2d');
    g.scale(K, K); g.translate(w / 2, h / 2);
    const R = rng(33);
    const p = new Path2D();
    p.moveTo(-37, -5); p.bezierCurveTo(-22, -22, 22, -22, 37, -5); p.bezierCurveTo(28, 5, 15, 1, 8.5, 10);
    p.lineTo(0, 23); p.lineTo(-8.5, 10); p.bezierCurveTo(-15, 1, -28, 5, -37, -5); p.closePath();
    const wg = g.createLinearGradient(0, -20, 0, 20);
    wg.addColorStop(0, '#4b2a5a'); wg.addColorStop(0.5, '#25142e'); wg.addColorStop(1, '#0f0714');
    g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 5; g.fillStyle = wg; g.fill(p); g.restore();
    g.save(); g.clip(p);
    const sh = g.createLinearGradient(-37, 0, 37, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = sh; g.fillRect(-40, -25, 80, 50);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 0.5;
    for (let k = -30; k <= 30; k += 7.5) { g.beginPath(); g.moveTo(k, -18); g.lineTo(k * 0.5, 8); g.stroke(); }
    greebles(g, R, 40, -36, -20, 72, 30, 'rgba(230,170,255,0.13)', 'rgba(0,0,0,0.3)');
    g.restore();
    g.strokeStyle = 'rgba(240,140,255,0.45)'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(-37, -5); g.bezierCurveTo(-22, -22, 22, -22, 37, -5); g.stroke();
    // pod
    const pg = g.createRadialGradient(-2, -2, 1, 0, 2, 11);
    pg.addColorStop(0, '#9a6aa8'); pg.addColorStop(0.5, '#3d2346'); pg.addColorStop(1, '#130a18');
    g.fillStyle = pg; g.beginPath(); g.ellipse(0, 2, 8, 12, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const x = s * (14 + k * 7), y = -9 + k * 1.2;
      const lg = g.createRadialGradient(x, y, 0, x, y, 3.2);
      lg.addColorStop(0, 'rgba(255,200,255,1)'); lg.addColorStop(1, 'rgba(255,60,220,0)');
      g.fillStyle = lg; g.fillRect(x - 3.2, y - 3.2, 6.4, 6.4);
    }
    const eg = g.createRadialGradient(0, 13, 0, 0, 13, 7);
    eg.addColorStop(0, 'rgba(255,230,255,1)'); eg.addColorStop(0.3, 'rgba(255,80,220,0.85)'); eg.addColorStop(1, 'rgba(255,40,200,0)');
    g.fillStyle = eg; g.fillRect(-7, 6, 14, 14);
    g.globalCompositeOperation = 'source-over';
    return { img: c, w, h };
  }

  function bossArt() {                              // the mothership, nose down, 372x262
    const w = 372, h = 262, KB = 2, c = mk(w * KB, h * KB), g = c.getContext('2d');
    g.scale(KB, KB); g.translate(w / 2, h / 2);
    const R = rng(91);
    const hull = new Path2D();
    hull.moveTo(0, -122); hull.bezierCurveTo(64, -124, 142, -104, 182, -74); hull.lineTo(176, -30);
    hull.bezierCurveTo(158, 10, 126, 42, 100, 72); hull.bezierCurveTo(72, 102, 40, 122, 0, 128);
    hull.bezierCurveTo(-40, 122, -72, 102, -100, 72); hull.bezierCurveTo(-126, 42, -158, 10, -176, -30);
    hull.lineTo(-182, -74); hull.bezierCurveTo(-142, -104, -64, -124, 0, -122); hull.closePath();
    g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 16; g.fillStyle = '#15191e'; g.fill(hull); g.restore();
    const hg = g.createLinearGradient(-180, -120, 160, 120);
    hg.addColorStop(0, '#4a525d'); hg.addColorStop(0.45, '#262b32'); hg.addColorStop(1, '#0d0f12');
    g.fillStyle = hg; g.fill(hull);
    g.save(); g.clip(hull);
    // armour plates (layered, inset)
    for (let k = 0; k < 3; k++) {
      const s = 0.82 - k * 0.2;
      g.save(); g.translate(0, 6 + k * 6); g.scale(s, s);
      const pg = g.createLinearGradient(-160, -110, 140, 110);
      pg.addColorStop(0, `rgba(${92 - k * 8},${102 - k * 8},${112 - k * 6},0.55)`); pg.addColorStop(1, 'rgba(10,12,15,0.5)');
      g.fillStyle = pg; g.fill(hull);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.6 / s; g.stroke(hull);
      g.strokeStyle = 'rgba(160,175,190,0.18)'; g.lineWidth = 0.6 / s; g.translate(0, -1.5); g.stroke(hull);
      g.restore();
    }
    // radial panel seams + greebles
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.8;
    for (let a = -1.2; a <= 1.21; a += 0.2) { g.beginPath(); g.moveTo(0, 30); g.lineTo(Math.sin(a) * 220, 30 - Math.cos(a) * 200); g.stroke(); }
    greebles(g, R, 520, -180, -122, 360, 250, 'rgba(190,205,220,0.13)', 'rgba(0,0,0,0.32)');
    // trench lights
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const a = -1.25 + R() * 2.5, r = 60 + R() * 110, x = Math.sin(a) * r, y = 30 - Math.cos(a) * r * 0.9;
      const lg = g.createRadialGradient(x, y, 0, x, y, 2.6);
      lg.addColorStop(0, R() < 0.8 ? 'rgba(150,255,200,0.9)' : 'rgba(255,190,120,0.9)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(x - 3, y - 3, 6, 6);
    }
    // engines at the rear (top edge)
    for (const x of [-70, -24, 24, 70]) {
      const eg = g.createRadialGradient(x, -112, 0, x, -112, 20);
      eg.addColorStop(0, 'rgba(220,255,240,0.95)'); eg.addColorStop(0.3, 'rgba(80,255,190,0.6)'); eg.addColorStop(1, 'rgba(0,255,160,0)');
      g.fillStyle = eg; g.fillRect(x - 20, -132, 40, 40);
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
    // green rim light on the hull edge
    g.strokeStyle = 'rgba(90,255,180,0.35)'; g.lineWidth = 1.4; g.stroke(hull);
    // core socket + turret sockets
    const sock = (x, y, r) => {
      const sg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      sg.addColorStop(0, '#3c434d'); sg.addColorStop(1, '#0b0d10');
      g.fillStyle = sg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(180,195,210,0.35)'; g.lineWidth = 1; g.stroke();
    };
    sock(0, 30, 44); sock(-112, 28, 29); sock(112, 28, 29);
    return { img: c, w, h };
  }

  function asteroidArt(seed, size) {                // lit rocky asteroid, pixel-shaded
    const N = size, c = mk(N, N), g = c.getContext('2d');
    const img = g.createImageData(N, N), d = img.data;
    const R = rng(seed), ox = R() * 100, oy = R() * 100;
    const hgt = new Float32Array(N * N);
    const craters = [];
    for (let i = 0; i < 7; i++) craters.push([R() * 1.4 - 0.7, R() * 1.4 - 0.7, 0.08 + R() * 0.18]);
    const rad = th => 0.78 + 0.13 * (fbm2(Math.cos(th) * 1.6 + ox, Math.sin(th) * 1.6 + oy, 3) - 0.5) * 2.2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const nx = (x / N) * 2 - 1, ny = (y / N) * 2 - 1, r = Math.hypot(nx, ny), th = Math.atan2(ny, nx), R0 = rad(th);
      let hv = -1;
      if (r < R0) {
        const k = r / R0;
        hv = Math.sqrt(Math.max(0, 1 - k * k)) * 0.9 + (fbm2(nx * 4 + ox, ny * 4 + oy, 4) - 0.5) * 0.28;
        for (const cr of craters) {
          const cd = Math.hypot(nx - cr[0], ny - cr[1]) / cr[2];
          if (cd < 1.3) hv += cd < 1 ? -0.12 * (1 - cd * cd) : 0.05 * Math.sin((cd - 1) / 0.3 * Math.PI);
        }
      }
      hgt[y * N + x] = hv;
    }
    const L = [-0.55, -0.62, 0.56];
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x, h0 = hgt[i];
      if (h0 < -0.5) continue;
      const dx = (hgt[i + 1] - hgt[i - 1]) * N * 0.06, dy = (hgt[i + N] - hgt[i - N]) * N * 0.06;
      const nl = Math.hypot(dx, dy, 1), lam = Math.max(0, (-dx * L[0] - dy * L[1] + L[2]) / nl);
      const alb = 0.5 + (fbm2(x * 0.09 + ox, y * 0.09 + oy, 3) - 0.5) * 0.5;
      const v = (0.07 + lam * 0.95) * alb;
      const edge = Math.min(1, h0 * 9);
      d[i * 4] = Math.min(255, v * 205); d[i * 4 + 1] = Math.min(255, v * 190); d[i * 4 + 2] = Math.min(255, v * 172);
      d[i * 4 + 3] = 255 * clamp(edge, 0, 1);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function wreckArt() {                             // drifting hull wreckage the turrets sit on, 150x70
    const w = 150, h = 70, c = mk(w * 2, h * 2), g = c.getContext('2d');
    g.scale(2, 2); g.translate(w / 2, h / 2);
    const R = rng(55);
    const p = new Path2D();
    p.moveTo(-72, -8); p.lineTo(-50, -26); p.lineTo(-12, -22); p.lineTo(6, -32); p.lineTo(44, -24); p.lineTo(70, -6);
    p.lineTo(62, 14); p.lineTo(30, 30); p.lineTo(-8, 22); p.lineTo(-40, 30); p.lineTo(-66, 16); p.closePath();
    const wg = g.createLinearGradient(-70, -30, 70, 30);
    wg.addColorStop(0, '#5a616b'); wg.addColorStop(0.5, '#2c3138'); wg.addColorStop(1, '#121417');
    g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 8; g.fillStyle = wg; g.fill(p); g.restore();
    g.save(); g.clip(p);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.8;
    for (let x = -70; x < 70; x += 14) { g.beginPath(); g.moveTo(x, -34); g.lineTo(x + 6, 34); g.stroke(); }
    greebles(g, R, 160, -72, -34, 144, 66, 'rgba(200,210,220,0.15)', 'rgba(0,0,0,0.35)');
    const sc = g.createRadialGradient(40, 10, 2, 40, 10, 30);                  // scorch
    sc.addColorStop(0, 'rgba(0,0,0,0.75)'); sc.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sc; g.fillRect(0, -30, 80, 70);
    g.restore();
    g.strokeStyle = 'rgba(255,150,80,0.55)'; g.lineWidth = 0.8;                 // hot torn edge
    g.beginPath(); g.moveTo(44, -24); g.lineTo(70, -6); g.lineTo(62, 14); g.stroke();
    return { img: c, w, h };
  }

  function mineArt() {
    const w = 34, h = 34, c = mk(w * K, h * K), g = c.getContext('2d');
    g.scale(K, K); g.translate(w / 2, h / 2);
    g.fillStyle = '#4a4f57';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      g.save(); g.rotate(a); g.beginPath(); g.moveTo(-1.6, -9); g.lineTo(0, -16); g.lineTo(1.6, -9); g.closePath(); g.fill(); g.restore();
    }
    const mg = g.createRadialGradient(-3, -3, 1, 0, 0, 10);
    mg.addColorStop(0, '#9aa1aa'); mg.addColorStop(0.5, '#454b53'); mg.addColorStop(1, '#14171a');
    g.fillStyle = mg; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.6; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.stroke();
    return { img: c, w, h };
  }

  function crateArt() {
    const w = 40, h = 26, c = mk(w * K, h * K), g = c.getContext('2d');
    g.scale(K, K); g.translate(w / 2, h / 2);
    const cg = g.createLinearGradient(0, -12, 0, 12);
    cg.addColorStop(0, '#d7dce3'); cg.addColorStop(0.5, '#8d96a2'); cg.addColorStop(1, '#4b525c');
    g.fillStyle = cg; roundRect(g, -18, -11, 36, 22, 5); g.fill();
    g.save(); roundRect(g, -18, -11, 36, 22, 5); g.clip();
    g.fillStyle = '#e5b23a';
    for (let x = -26; x < 26; x += 6) { g.beginPath(); g.moveTo(x, -11); g.lineTo(x + 3, -11); g.lineTo(x - 3, 11); g.lineTo(x - 6, 11); g.closePath(); g.fill(); }
    g.fillStyle = cg; g.fillRect(-12, -11, 24, 22);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.8; roundRect(g, -18, -11, 36, 22, 5); g.stroke();
    g.fillStyle = '#2a3038'; g.fillRect(-7, -4, 14, 8);
    return { img: c, w, h };
  }

  function hangarTile() {                           // hangar deck (repeats vertically), 390x260
    const w = 390, h = 260, c = mk(w * 2, h * 2), g = c.getContext('2d');
    g.scale(2, 2);
    const R = rng(77);
    g.fillStyle = '#181c20'; g.fillRect(0, 0, w, h);
    const P = 65;
    for (let y = 0; y < h; y += P) for (let x = 40; x < w - 40; x += P) {
      const v = 30 + R() * 10 | 0;
      g.fillStyle = `rgb(${v},${v + 4},${v + 8})`; g.fillRect(x + 1, y + 1, P - 2, P - 2);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 1, y + 1, P - 2, 1.4); g.fillRect(x + 1, y + 1, 1.4, P - 2);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 1, y + P - 2.4, P - 2, 1.4); g.fillRect(x + P - 2.4, y + 1, 1.4, P - 2);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (const [rx, ry] of [[5, 5], [P - 7, 5], [5, P - 7], [P - 7, P - 7]]) { g.beginPath(); g.arc(x + rx, y + ry, 1.1, 0, TAU); g.fill(); }
    }
    greebles(g, R, 300, 40, 0, w - 80, h, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.2)');
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.25})`; g.fillRect(40 + R() * (w - 80), R() * h, 1, 1); }  // grime
    // runway hazard edges
    for (const x0 of [96, 286]) {
      g.save(); g.beginPath(); g.rect(x0, 0, 8, h); g.clip();
      for (let y = -10; y < h + 10; y += 12) { g.fillStyle = '#b8902a'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 8, y - 6); g.lineTo(x0 + 8, y); g.lineTo(x0, y + 6); g.closePath(); g.fill(); }
      g.restore();
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 10; y < h; y += 40) g.fillRect(193, y, 4, 20);                     // centre line
    // walls
    for (const s of [0, 1]) {
      const x = s ? w - 40 : 0;
      const wg = g.createLinearGradient(x, 0, x + 40, 0);
      wg.addColorStop(s ? 1 : 0, '#07090b'); wg.addColorStop(s ? 0 : 1, '#2a3036');
      g.fillStyle = wg; g.fillRect(x, 0, 40, h);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(s ? x : x + 37, 0, 3, h);
      for (let y = 0; y < h; y += 52) { g.fillStyle = '#3a4148'; g.fillRect(x + 8, y + 10, 24, 30); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 10, y + 12, 20, 26); }
    }
    return c;
  }

  function puffSprites() {                          // wispy fire / smoke puffs, 3 shapes x 4 tints
    const S = 96, shapes = [];
    for (let v = 0; v < 3; v++) {
      const c = mk(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), d = im.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const nx = x / S * 2 - 1, ny = y / S * 2 - 1, r = Math.hypot(nx, ny);
        const n = fbm2(nx * 2.6 + v * 13, ny * 2.6 + v * 7, 4);
        const a = clamp((1 - r * (1.05 + (0.5 - n) * 0.9)) * 1.6, 0, 1);
        const i = (y * S + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * a * 255 * (0.65 + n * 0.5);
      }
      g.putImageData(im, 0, 0);
      shapes.push(c);
    }
    const tints = ['255,244,205', '255,158,54', '204,58,26', '58,54,52'];
    return tints.map(t => shapes.map(sh => {
      const c = mk(S, S), g = c.getContext('2d');
      g.drawImage(sh, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = `rgb(${t})`; g.fillRect(0, 0, S, S);
      return c;
    }));
  }

  function hexShield() {                            // hex lattice for the shield bubble
    const S = 128, c = mk(S, S), g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1;
    const r = 7, hw = r * Math.sqrt(3);
    for (let row = -1; row < S / (r * 1.5) + 1; row++) for (let col = -1; col < S / hw + 1; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * r * 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.stroke();
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    m.addColorStop(0, 'rgba(0,0,0,0.15)'); m.addColorStop(0.75, 'rgba(0,0,0,0.6)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, S, S);
    return c;
  }

  function pickupArt(kind) {
    const P = PICK[kind], S = 46, c = mk(S * 2, S * 2), g = c.getContext('2d');
    g.scale(2, 2); g.translate(S / 2, S / 2);
    const gl = g.createRadialGradient(0, 0, 4, 0, 0, 22);
    gl.addColorStop(0, `rgba(${P.rgb},0.55)`); gl.addColorStop(1, `rgba(${P.rgb},0)`);
    g.fillStyle = gl; g.fillRect(-23, -23, 46, 46);
    const bg = g.createLinearGradient(0, -12, 0, 12);
    bg.addColorStop(0, '#f2f5f9'); bg.addColorStop(0.5, '#8f99a6'); bg.addColorStop(1, '#3f4651');
    g.fillStyle = bg; g.beginPath(); g.arc(0, 0, 12.5, 0, TAU); g.fill();
    g.fillStyle = `rgb(${P.rgb})`; g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); g.fill();
    const hi = g.createRadialGradient(-3, -4, 0, -3, -4, 8);
    hi.addColorStop(0, 'rgba(255,255,255,0.75)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi; g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); g.fill();
    g.fillStyle = '#0b1420'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(P.label, 0, 0.5);
    return c;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  const PICK = {
    ammo:    { label: 'A', rgb: '255,214,90',  text: '+100 AMMO' },
    missile: { label: 'M', rgb: '255,140,60',  text: '+2 MISSILES' },
    repair:  { label: '+', rgb: '110,240,130', text: '+25 HEALTH' },
    spread:  { label: 'S', rgb: '90,220,255',  text: 'SPREAD SHOT' },
    rapid:   { label: 'R', rgb: '200,140,255', text: 'RAPID FIRE' },
    shield:  { label: '◈', rgb: '120,190,255', text: '+1 SHIELD' }
  };

  // ── STARFIELD + DUST SHADER ───────────────────────────────────────────────
  const STAR_FRAG = `
uniform float u_scroll; uniform float u_warp; uniform vec3 u_tint;
float layer(vec2 uv, float sc, float spd, float th, float sz){
  vec2 p = vec2(uv.x * sc * (u_res.x / u_res.y), uv.y * sc) + vec2(0.0, u_scroll * spd);
  vec2 id = floor(p); vec2 f = fract(p) - 0.5;
  vec3 h = hash3(id);
  if (h.z < th) return 0.0;
  vec2 o = (h.xy - 0.5) * 0.6;
  vec2 d = f - o; d.y /= (1.0 + u_warp * 9.0 * spd);
  float s = smoothstep(sz, 0.0, length(d));
  float tw = 0.75 + 0.25 * sin(u_time * (1.5 + h.x * 5.0) + h.y * 40.0);
  return s * tw * (0.35 + 0.65 * h.y);
}
void main(){
  vec2 uv = v_uv;
  float st = layer(uv, 14.0, 0.06, 0.70, 0.075) * 0.55
           + layer(uv, 9.0, 0.12, 0.82, 0.06) * 0.85
           + layer(uv, 5.0, 0.24, 0.92, 0.05) * 1.3;
  vec2 q = uv * vec2(2.2, 4.0) + vec2(0.0, u_scroll * 0.015);
  float n = fbm(q + fbm(q * 1.7 + u_time * 0.01));
  float dust = smoothstep(0.5, 0.9, n) * 0.14;
  vec3 col = vec3(st) * vec3(0.9, 0.95, 1.0) + u_tint * dust;
  float a = clamp(st + dust, 0.0, 1.0);
  gl_FragColor = vec4(col / max(a, 0.001), a);
}`;

  // ── REGISTER ──────────────────────────────────────────────────────────────
  DABWorlds.register('alien', {
    title: 'Alien World', color: '120,255,190',
    music: 'music_alien',
    sounds: ['laser', 'enemy_laser', 'big_laser', 'missile', 'explode', 'boom', 'metal_hit', 'shield', 'alarm', 'pickup', 'hurt'],
    subtitle: () => 'The saucer beamed you up into its mothership. You stole one of their fighters.',
    hint: 'Break out, survive the fleet, destroy the mothership',
    howto: ['Stick: fly  ·  Fire: hold (ammo is limited)', 'Missile: homing  ·  Shield: protective bubble', 'Grab ammo, missiles and power-ups'],
    controls: {
      dirs: 'stick',
      buttons: [
        { id: 'attack', icon: 'fire' },
        { id: 'special', icon: 'missile', count: () => (LIVE ? LIVE.missiles : 0) },
        { id: 'special2', icon: 'shield', count: () => (LIVE ? LIVE.shields : 0) }
      ]
    },
    assets: {
      backdrop: A + 'space_backdrop.jpg',
      jupiter: A + 'jupiter.png',
      playerImg: A + 'ship_player.png',
      fighterImg: A + 'fighter.png',
      fighter2Img: A + 'fighter2.png',
      interceptorImg: A + 'interceptor.png',
      bossImg: A + 'boss.png'
    },
    create
  });

  function create(env) {
    const W = env.W, H = env.H, fx = env.fx;
    const sfx = (n, x, o) => env.sfxAt(n, x === undefined ? W / 2 : x, o);
    const charRgb = env.charRgb;
    // generated art is built once and reused on every later catch (only the ship takes the spirit's colour)
    if (!BASE) {
      BASE = {
        glass: canopyGlass(), fighter: fighterArt(), interceptor: interceptorArt(),
        boss: bossArt(), wreck: wreckArt(), mine: mineArt(), crate: crateArt(), hangar: hangarTile(),
        puffs: puffSprites(), hex: hexShield(),
        rocks: [asteroidArt(3, 128), asteroidArt(17, 128), asteroidArt(29, 128), asteroidArt(41, 128)],
        pick: {}
      };
      for (const k in PICK) BASE.pick[k] = pickupArt(k);
    }
    const art = Object.assign({}, BASE, { ship: env.assets.playerImg ? null : shipArt(charRgb) });
    // swap in sprite images when they exist (see assets above)
    art.fighter2 = art.fighter;
    const sizes = { fighter: 72, fighter2: 70, interceptor: 84, boss: 300 };
    for (const k of ['fighter', 'fighter2', 'interceptor', 'boss']) {
      const im = env.assets[k + 'Img'];
      if (im) art[k] = { img: im, w: sizes[k], h: sizes[k] * im.height / im.width, ai: true };
    }
    // where the weak points sit on the boss art (offsets from its centre)
    const BOSS = art.boss.ai
      ? { turrets: [[-43.5, 80], [43.5, 80]], tr: 21, core: [0, -22], cr: 26, ty: 165, rx: art.boss.w * 0.47, ry: art.boss.h * 0.47 }
      : { turrets: [[-112, 28], [112, 28]], tr: 25, core: [0, 30], cr: 30, ty: 178, rx: 176, ry: 122 };
    if (env.assets.playerImg) {                     // AI-rendered fighter (nose up, canopy aft)
      const im = env.assets.playerImg;
      art.ship = { img: im, w: 84, h: 84 * im.height / im.width, cy: 15.5, crx: 4.2, cry: 7, nozzles: [[-7, 33], [7, 33]] };
    }
    if (!art.ship.nozzles) art.ship.nozzles = [[-4.4, 36], [4.4, 36]];
    const starProg = env.shader(STAR_FRAG);

    // ── state ──
    const S = {
      t: 0, phase: 'escape', scroll: 0, scrollV: 18, warp: 0,
      ship: { x: W / 2, y: 600, vx: 0, vy: 0, bank: 0, r: 15, hitR: 9, alive: true, flash: 0, thrust: 0 },
      ammo: 360, missiles: 3, shields: 1, shieldT: 0, spreadT: 0, rapidT: 0, fireCd: 0, missileCd: 0,
      pb: [], eb: [], pm: [], em: [], enemies: [], rocks: [], pickups: [], booms: [], beams: [],
      boss: null, sched: [], toasts: [], hangar: null, mother: null, speedLines: [],
      kills: 0, dmgTaken: 0, lowAmmoT: 0, deathBoom: false, winT: -1, planetY: -400
    };
    LIVE = S;
    for (let i = 0; i < 26; i++) S.speedLines.push({ x: rand(0, W), y: rand(0, H), v: rand(0.6, 1.4) });

    // ── schedule ──
    const at = (t, fn) => S.sched.push({ t, fn });
    at(0.2, () => toast('BREAK OUT!', 'Blast your way out of the hangar', '255,120,90'));
    at(9.6, () => toast('YOU\'RE OUT', 'Survive the alien fleet', '120,255,190'));
    at(10.5, () => formationV(5, W / 2));
    at(14.5, () => crate(110));
    at(16.5, () => asteroidField(9, 9));
    at(23, () => formationV(4, 120));
    at(21.5, () => sideArcs(4));
    at(27.5, () => sideArcs(6));
    at(31, () => mines(5));
    at(36, () => turretWreck(W * 0.3));
    at(39, () => crate(290));
    at(41, () => interceptors(3));
    at(48, () => laserGate());
    at(55, () => { formationV(5, 260); interceptors(2); });
    at(61, () => { asteroidField(8, 7); crate(200); formationV(3, 90); });
    at(65, () => formationV(3, 300));
    at(69, () => { sideArcs(8); mines(4); });
    at(76, () => { interceptors(3); turretWreck(W * 0.7); });
    at(84.5, () => { toast('WARNING', 'The mothership is coming for you', '255,90,90', true); preBossSupplies(); });
    at(90.5, () => bossEnter());
    S.sched.sort((a, b) => a.t - b.t);

    if (SKIP === 'space' || SKIP === 'boss' || +SKIP > 0) {
      const t0 = SKIP === 'boss' ? 84 : SKIP === 'space' ? 9.4 : Math.max(9.4, +SKIP);
      S.sched = S.sched.filter(s => s.t >= t0);
      S.t = t0; S.phase = 'space'; S.scroll = t0 * 16;
    } else {
      S.hangar = { len: 1700, pos: 0, door: 0, turrets: [
        { side: -1, y: 760, hp: 4, cd: 1.2, alive: true }, { side: 1, y: 1080, hp: 4, cd: 1.6, alive: true },
        { side: -1, y: 1380, hp: 4, cd: 2.0, alive: true } ], clamp: 0, alarm: 0 };
      S.ship.y = 640;
    }

    // ── helpers ──
    function toast(text, sub, rgb, big) {
      // one message at a time: the current one fades out, the new one follows it
      let delay = 0;
      for (const o of S.toasts) { if (o.t >= 0 && o.t < o.life - 0.35) o.t = o.life - 0.35; delay = Math.max(delay, o.life - o.t); }
      S.toasts.push({ text, sub, rgb: rgb || '255,255,255', t: -delay, life: big ? 3.4 : 2.6, big });
    }
    function shipDamage(n, x, y, what) {
      if (!S.ship.alive) return;
      if (S.shieldT > 0) {                            // the bubble eats it
        sfx('shield', x, { vol: 0.45, gap: 0.25 });
        fx.burst(x, y, { n: 8, speed: 160, rgb: '140,200,255', kind: 'spark', life: 0.35 });
        S.shieldHit = 1;
        return;
      }
      if (GOD) { S.ship.flash = 1; return; }
      if (env.damage(n, { x: S.ship.x, y: S.ship.y - 20, invuln: what === 'laser' ? 0.9 : 0.45 })) {
        S.ship.flash = 1; S.dmgTaken += n; sfx('metal_hit', x); sfx('hurt', x, { vol: 0.7 });
        fx.burst(S.ship.x, S.ship.y, { n: 12, speed: 200, rgb: '255,190,120', kind: 'spark', life: 0.45 });
        env.hitstop(0.05);
      }
    }
    function boom(x, y, r, opt) {
      opt = opt || {};
      S.booms.push({ x, y, r, age: 0, life: opt.life || (0.8 + r / 90), seed: Math.random() * 100, vx: opt.vx || 0, vy: opt.vy || 0, n: Math.round(5 + r / 6) });
      sfx(r > 60 ? 'boom' : 'explode', x, { vol: Math.min(1, 0.45 + r / 70), rate: r > 60 ? 1 : 1.25 - Math.min(0.4, r / 120), gap: 0.05 });
      fx.burst(x, y, { n: Math.round(8 + r / 3), speed: 120 + r * 4, rgb: '255,210,140', kind: 'spark', life: 0.5 + r / 120, drag: 2.2 });
      fx.burst(x, y, { n: Math.round(3 + r / 8), speed: 60 + r * 2.5, rgb: '120,124,130', kind: 'debris', life: 0.9 + r / 80, size: 2 + r / 18, drag: 0.6 });
      fx.spawn({ x, y, kind: 'ring', size: r * 0.4, grow: r * 3.2, life: 0.45, rgb: opt.ring || '255,220,170', alpha: 0.9 });
      if (r > 30) { env.shake(Math.min(1, r / 90)); env.flash('255,230,190', Math.min(0.5, r / 260)); }
    }
    function drop(x, y, chance, force) {
      if (!force && Math.random() > chance) return;
      let kind;
      const low = S.ammo < 80;
      const r = Math.random();
      if (force) kind = force;
      else if (low && r < 0.55) kind = 'ammo';
      else kind = r < 0.36 ? 'ammo' : r < 0.52 ? 'missile' : r < 0.66 ? 'repair' : r < 0.79 ? 'spread' : r < 0.91 ? 'rapid' : 'shield';
      S.pickups.push({ kind, x, y, vy: 55, t: 0, life: 14 });
    }
    function enemy(o) { o.hp = Math.max(1, Math.round(o.hp * env.tough)); o.t = 0; o.flash = 0; o.maxHp = o.hp; o.ang = o.ang || 0; S.enemies.push(o); return o; }

    // ── wave builders ──
    function formationV(n, cx) {
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        enemy({ type: 'fighter', hp: 3, r: 18, x: cx + k * 46, y: -40 - Math.abs(k) * 36, delay: Math.abs(k) * 0.12,
          path: 'swoop', x0: cx + k * 46, amp: 40 + Math.abs(k) * 6, w: 1.4, v: 92, fireCd: rand(1.2, 2.2) });
      }
    }
    function sideArcs(n) {
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? 1 : -1;
        enemy({ type: 'fighter', v2: true, hp: 3, r: 18, x: s < 0 ? -40 : W + 40, y: 80, path: 'arc', side: s, delay: Math.floor(i / 2) * 0.55,
          p0: [s < 0 ? -40 : W + 40, 90 + (i % 3) * 30], p1: [W / 2, 520], p2: [s < 0 ? W + 50 : -50, 160], dur: 4.2, fireCd: rand(0.8, 1.6) });
      }
    }
    function interceptors(n) {
      for (let i = 0; i < n; i++) enemy({ type: 'interceptor', hp: 6, r: 22, x: 60 + (W - 120) * (n === 1 ? 0.5 : i / (n - 1)), y: -50 - i * 70,
        path: 'dive', holdY: 150 + (i % 2) * 60, fireCd: 1.2 + i * 0.4, shots: 3 });
    }
    function asteroidField(n, over) {
      for (let i = 0; i < n; i++) S.sched.push({ t: S.t + (i / n) * over + rand(0, 0.4), fn: () => rock(rand(30, W - 30), -60, Math.random() < 0.45 ? 3 : 2) });
      S.sched.sort((a, b) => a.t - b.t);
    }
    function rock(x, y, size, vx, vy) {
      const r = size === 3 ? 34 : size === 2 ? 21 : 11;
      S.rocks.push({ x, y, size, r, hp: size === 3 ? 9 : size === 2 ? 4 : 1, vx: vx !== undefined ? vx : rand(-30, 30), vy: vy !== undefined ? vy : rand(70, 120),
        ang: rand(0, TAU), spin: rand(-1.2, 1.2), img: art.rocks[Math.floor(Math.random() * 4)], flash: 0 });
    }
    function mines(n) {
      for (let i = 0; i < n; i++) enemy({ type: 'mine', hp: 2, r: 14, x: rand(40, W - 40), y: -30 - i * 60, path: 'drift', vy: 52, armT: -1 });
    }
    function crate(x) { enemy({ type: 'crate', hp: 3, r: 16, x, y: -30, path: 'drift', vy: 60, spin: rand(-0.6, 0.6) }); }
    function turretWreck(x) {
      enemy({ type: 'wreck', hp: 12, r: 20, x, y: -60, path: 'drift', vy: 40, aim: Math.PI / 2, fireCd: 1.5, ringCd: 3.2, burst: 0 });
    }
    function laserGate() {
      const g = { type: 'gate', y: -30, vy: 46, pylons: [], t: 0, cycle: 0 };
      for (const s of [-1, 1]) g.pylons.push(enemy({ type: 'pylon', hp: 7, r: 16, x: s < 0 ? 22 : W - 22, y: -30, path: 'gate', gate: g, side: s }));
      S.beams.push(g);
      toast('LASER GATE', 'Wait for the gap, or blast a pylon', '255,120,140');
    }
    function preBossSupplies() {
      drop(W * 0.3, -20, 1, 'repair'); drop(W * 0.7, -60, 1, 'ammo'); drop(W * 0.5, -110, 1, 'missile'); drop(W * 0.2, -150, 1, 'ammo');
    }

    // ── boss ──
    function bossEnter() {
      S.boss = {
        x: W / 2, y: -190, ty: BOSS.ty, t: 0, phase: 1, enter: 0,
        parts: [{ id: 'lt', ox: BOSS.turrets[0][0], oy: BOSS.turrets[0][1], r: BOSS.tr, hp: Math.round(34 * env.tough), max: Math.round(34 * env.tough), alive: true, aim: Math.PI / 2, cd: 1.4 },
                { id: 'rt', ox: BOSS.turrets[1][0], oy: BOSS.turrets[1][1], r: BOSS.tr, hp: Math.round(34 * env.tough), max: Math.round(34 * env.tough), alive: true, aim: Math.PI / 2, cd: 2.0 }],
        core: { ox: BOSS.core[0], oy: BOSS.core[1], r: BOSS.cr, hp: Math.round(100 * env.tough), max: Math.round(100 * env.tough), shield: true, flash: 0 },
        supplyCd: 9,
        spiralCd: 3.2, droneCd: 6, laserCd: 3.5, missileCd: 4, spreadCd: 2.2, ringCd: 2.4, streamCd: 1.6,
        laser: null, dying: 0, chain: 0, flash: 0
      };
      env.hud.objective = 'Destroy the mothership!';
      toast('MOTHERSHIP', 'Knock out both turrets to expose the core', '255,120,120', true); sfx('alarm', W / 2, { vol: 0.7, jitter: 0 });
    }
    function bossHP() {
      const B = S.boss; if (!B) return 0;
      return (B.parts[0].hp + B.parts[1].hp + B.core.hp) / (B.parts[0].max + B.parts[1].max + B.core.max);
    }
    function bossPoint(p) { const B = S.boss; return { x: B.x + p.ox, y: B.y + p.oy }; }

    // ── projectiles ──
    function fireEnemy(x, y, ang, spd, kind) {
      if (S.eb.length > 240) return;
      sfx('enemy_laser', x, { vol: 0.16, rate: kind === 'orb' ? 0.7 : 1, gap: 0.09 });
      const k = kind || 'bolt';
      S.eb.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, kind: k,
        r: k === 'orb' ? 7 : k === 'ring' ? 5 : 4.5, dmg: k === 'orb' ? 8 : k === 'ring' ? 5 : 6,
        rgb: k === 'orb' ? '255,120,230' : k === 'ring' ? '255,190,90' : '120,255,170', life: 6 });
    }
    function aimAt(x, y) { return Math.atan2(S.ship.y - y, S.ship.x - x); }
    function enemyMissile(x, y) {
      S.em.push({ x, y, vx: 0, vy: 90, ang: Math.PI / 2, spd: 90, life: 4.6, hp: 1, smokeT: 0 }); sfx('missile', x, { vol: 0.4, rate: 0.8 });
    }
    function playerMissile() {
      const sh = S.ship;
      if (S.missiles <= 0) return;
      S.missiles--; sfx('missile', sh.x, { vol: 0.6 });
      const side = S.missiles % 2 ? 1 : -1;
      S.pm.push({ x: sh.x + side * 18, y: sh.y + 4, vx: side * 90, vy: -60, ang: -Math.PI / 2, spd: 120, life: 3.6, target: pickTarget(), smokeT: 0 });
    }
    function pickTarget() {
      if (S.boss && !S.boss.dying && S.boss.enter >= 1) {
        const alive = S.boss.parts.filter(p => p.alive);
        if (alive.length) { alive.sort((a, b) => a.hp - b.hp); return { boss: alive[0] }; }
        if (!S.boss.core.shield) return { boss: S.boss.core };
      }
      let best = null, bs = -1e9;
      for (const e of S.enemies) {
        if (e.dead || e.y < -10 || e.y > S.ship.y || e.type === 'crate') continue;
        const score = e.hp * 10 - dist(e.x, e.y, S.ship.x, S.ship.y) * 0.05;
        if (score > bs) { bs = score; best = e; }
      }
      if (!best) for (const r of S.rocks) if (r.size === 3 && r.y > 0 && r.y < S.ship.y) { best = r; break; }
      return best ? { e: best } : null;
    }
    function targetPos(tg) {
      if (!tg) return null;
      if (tg.boss) { if (!S.boss) return null; const p = bossPoint(tg.boss); return (tg.boss.alive === false || (tg.boss === S.boss.core && S.boss.core.hp <= 0)) ? null : p; }
      if (tg.e) return tg.e.dead || tg.e.gone ? null : { x: tg.e.x, y: tg.e.y };
      return null;
    }

    // ── damage to the world ──
    function hitEnemy(e, dmg) {
      e.hp -= dmg; e.flash = 1;
      if (e.hp > 0) sfx('metal_hit', e.x, { vol: 0.22, rate: 1.3, gap: 0.06 });
      if (e.hp <= 0 && !e.dead) {
        e.dead = true; S.kills++;
        if (e.type === 'mine') { mineBlast(e); return; }
        const r = e.type === 'interceptor' ? 34 : e.type === 'wreck' ? 46 : e.type === 'crate' ? 22 : e.type === 'pylon' ? 26 : 26;
        boom(e.x, e.y, r, { vy: 40 });
        if (e.type === 'crate') { drop(e.x - 12, e.y, 1, S.ammo < 150 ? 'ammo' : null); drop(e.x + 12, e.y, 1); }
        else if (e.type === 'wreck') { drop(e.x, e.y, 1); env.hitstop(0.06); }
        else if (e.type === 'interceptor') drop(e.x, e.y, 0.45);
        else if (e.type === 'pylon') { e.gate.dead = true; }
        else if (e.drone) drop(e.x, e.y, 1, S.ammo < 200 ? 'ammo' : null);
        else drop(e.x, e.y, 0.2);
        if (e.type === 'interceptor' || e.type === 'wreck') env.shake(0.35);
      }
    }
    function mineBlast(e) {
      boom(e.x, e.y, 40, { ring: '255,120,100' });
      if (dist(e.x, e.y, S.ship.x, S.ship.y) < 70) shipDamage(14, e.x, e.y);
      for (const o of S.enemies) if (o !== e && !o.dead && dist(o.x, o.y, e.x, e.y) < 70) hitEnemy(o, 4);
    }
    function hitRock(r, dmg) {
      r.hp -= dmg; r.flash = 1;
      if (r.hp <= 0 && !r.dead) {
        r.dead = true;
        fx.burst(r.x, r.y, { n: 10 + r.size * 5, speed: 90 + r.size * 30, rgb: '150,138,124', kind: 'debris', life: 1.1, size: 2 + r.size, drag: 0.4 });
        fx.burst(r.x, r.y, { n: 5 + r.size * 3, speed: 50, rgb: '120,112,104', kind: 'smoke', life: 1.2, size: 10 + r.size * 6, grow: 22, drag: 1 });
        if (r.size > 1) for (let i = 0; i < (r.size === 3 ? 3 : 2); i++) {
          const a = rand(0, TAU);
          rock(r.x + Math.cos(a) * 8, r.y + Math.sin(a) * 8, r.size - 1, r.vx + Math.cos(a) * 70, r.vy * 0.8 + Math.sin(a) * 50);
        }
        if (r.size === 3) { env.shake(0.25); if (Math.random() < 0.4) drop(r.x, r.y, 1); }
      }
    }
    function hitBoss(part, dmg, x, y) {
      const B = S.boss;
      part.hp = Math.max(0, part.hp - dmg); part.flash = 1; B.flash = 0.6;
      if (part !== B.core && part.hp <= 0 && part.alive) {
        part.alive = false;
        const p = bossPoint(part);
        boom(p.x, p.y, 58); env.hitstop(0.12);
        drop(p.x - 14, p.y + 30, 1, 'ammo'); drop(p.x + 14, p.y + 30, 1, 'missile');
        toast('TURRET DOWN', '', '255,210,140');
        if (B.parts.every(q => !q.alive)) {
          B.core.shield = false; B.phase = 2; B.laserCd = 2.2;
          env.flash('170,255,210', 0.5);
          toast('CORE EXPOSED', 'Hit the glowing core!', '120,255,190', true);
        }
      }
      if (part === B.core && B.phase === 2 && part.hp < part.max * 0.38) { B.phase = 3; toast('IT\'S ENRAGED', 'Hold on!', '255,110,110'); }
      if (part === B.core && part.hp <= 0 && !B.dying) {
        B.dying = 0.001; B.laser = null; env.hitstop(0.2); env.hud.objective = 'You did it!';
        env.invuln(10);                                   // nothing left can hurt you now
        for (const b of S.eb) fx.spawn({ x: b.x, y: b.y, kind: 'glow', rgb: b.rgb, size: 3, life: 0.3 });
        S.eb.length = 0;
        for (const m of S.em) boom(m.x, m.y, 14);
        S.em.length = 0;
        for (const e of S.enemies) if (!e.dead) hitEnemy(e, 99);
      }
    }

    // ── update ──
    function update(dt, I) {
      S.t += dt;
      while (S.sched.length && S.sched[0].t <= S.t) S.sched.shift().fn();
      if (AUTO && S.ship.alive) I = autopilot(I);

      updatePhase(dt);
      updateShip(dt, I);
      updateEnemies(dt);
      updateRocks(dt);
      updateBoss(dt);
      updateBullets(dt);
      updatePickups(dt);
      for (let i = S.booms.length - 1; i >= 0; i--) { const b = S.booms[i]; b.age += dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.age > b.life * 1.8) S.booms.splice(i, 1); }
      for (let i = S.toasts.length - 1; i >= 0; i--) { const t = S.toasts[i]; t.t += dt; if (t.t > t.life) S.toasts.splice(i, 1); }

      // HUD
      const pw = S.spreadT > 0 ? `SPREAD ${Math.ceil(S.spreadT)}s` : S.rapidT > 0 ? `RAPID ${Math.ceil(S.rapidT)}s` : '';
      env.hud.counters = [{ icon: 'AMMO', value: S.ammo > 0 ? S.ammo : 'EMPTY' }];
      if (pw) env.hud.counters.push({ icon: '⚡', value: pw });
      if (S.boss) { env.hud.boss = S.boss.dying ? null : { name: 'ALIEN MOTHERSHIP', hp: bossHP() }; env.hud.progress = null; }
      else env.hud.progress = S.phase === 'escape' ? null : clamp((S.t - 9.5) / (90.5 - 9.5), 0, 1);
      if (!S.boss) env.hud.objective = S.phase === 'escape' ? 'Break out of the hangar!' : S.t > 84 ? 'Get ready...' : 'Survive the alien fleet';

      // player death
      if (env.health <= 0 && S.ship.alive) {
        S.ship.alive = false;
        boom(S.ship.x, S.ship.y, 70); env.shake(1);
      }
      // victory
      if (S.winT >= 0) { S.winT += dt; if (S.winT > 2.6) env.win(); }
    }

    function updatePhase(dt) {
      if (S.phase === 'escape') {
        const Hg = S.hangar;
        Hg.alarm += dt;
        const k = clamp((S.t - 1.2) / 5.2, 0, 1);
        const v = S.t < 1.2 ? 0 : 60 + 380 * k * k;
        Hg.pos += v * dt;
        Hg.clamp = clamp((S.t - 0.6) / 0.5, 0, 1);
        S.warp = k * 0.6;
        S.ship.thrust = S.t < 1.2 ? 0.2 : 0.6 + k * 0.4;
        if (Hg.pos > Hg.len - 640) Hg.door = clamp(Hg.door + dt * 0.95, 0, 1);   // opens in view
        // wall turrets
        for (const tu of Hg.turrets) {
          if (!tu.alive) continue;
          const sy = H - (tu.y - Hg.pos);                  // screen y
          tu.sx = tu.side < 0 ? 46 : W - 46; tu.sy = sy;
          if (sy > 40 && sy < H - 120) {
            tu.cd -= dt;
            if (tu.cd <= 0) { tu.cd = 1.5; const a = aimAt(tu.sx, sy); fireEnemy(tu.sx, sy, a, 210); if (Math.random() < 0.35) fireEnemy(tu.sx, sy, a + 0.14, 210); fx.burst(tu.sx, sy, { n: 4, speed: 80, rgb: '120,255,170', kind: 'glow', life: 0.2, size: 3 }); }
          }
        }
        // the ship punches through the door
        if (Hg.pos >= Hg.len) {
          S.phase = 'space'; S.hangar = null; S.warp = 0.9;
          S.mother = { t: 0 };
          env.flash('230,255,240', 0.9); env.shake(0.6);
          for (let i = 0; i < 26; i++) fx.spawn({ x: rand(0, W), y: rand(0, H * 0.6), vx: rand(-40, 40), vy: rand(300, 700), kind: 'debris', rgb: '140,150,160', life: 1.2, size: rand(2, 6), spin: rand(-8, 8) });
          S.eb.length = 0;
        }
      } else {
        S.warp = Math.max(0, S.warp - dt * 0.35);
        S.scroll += S.scrollV * dt;
        if (S.mother) { S.mother.t += dt; if (S.mother.t > 7) S.mother = null; }
      }
      S.planetY = S.t > 24 && S.t < 70 ? -300 + (S.t - 24) * 26 : S.planetY;
    }

    function updateShip(dt, I) {
      const sh = S.ship;
      if (!sh.alive) return;
      const minY = S.boss && !S.boss.dying ? S.boss.y + art.boss.h / 2 + 12 : 130;
      const ax = I.ax || 0, ay = I.ay || 0;
      const tvx = ax * 285, tvy = ay * 265;
      sh.vx = lerp(sh.vx, tvx, 1 - Math.exp(-dt * 12));
      sh.vy = lerp(sh.vy, tvy, 1 - Math.exp(-dt * 12));
      sh.x = clamp(sh.x + sh.vx * dt, 26, W - 26);
      sh.y = clamp(sh.y + sh.vy * dt, minY, S.phase === 'escape' && S.t < 1.2 ? 640 : 615);
      sh.bank = lerp(sh.bank, clamp(sh.vx / 285, -1, 1), 1 - Math.exp(-dt * 8));
      if (S.phase !== 'escape') sh.thrust = lerp(sh.thrust, 0.55 - ay * 0.45, 1 - Math.exp(-dt * 6));
      sh.flash = Math.max(0, sh.flash - dt * 4);
      S.shieldT = Math.max(0, S.shieldT - dt); S.shieldHit = Math.max(0, (S.shieldHit || 0) - dt * 3);
      S.spreadT = Math.max(0, S.spreadT - dt); S.rapidT = Math.max(0, S.rapidT - dt);

      // guns: hold fire (Space also fires on a keyboard)
      S.fireCd -= dt;
      const firing = I.held.attack || I.held.jump;
      const canFire = !(S.phase === 'escape' && S.t < 1.0);
      if (firing && canFire && S.fireCd <= 0) {
        const empty = S.ammo <= 0;
        const rate = empty ? 3 : S.rapidT > 0 ? 14 : 8;
        S.fireCd = 1 / rate;
        const dmg = empty ? 0.8 : 1;
        const shots = !empty && S.spreadT > 0 ? [-0.2, -0.07, 0.07, 0.2] : [0];
        const alt = (S.altGun = !S.altGun) ? 1 : -1;
        for (const a of shots) {
          const ox = shots.length > 1 ? a * 40 : alt * 5;
          S.pb.push({ x: sh.x + ox, y: sh.y - 34, vx: Math.sin(a) * 900, vy: -Math.cos(a) * 900, dmg, weak: empty, life: 1 });
        }
        if (!empty) S.ammo--;
        sfx('laser', sh.x, { vol: empty ? 0.18 : 0.26, rate: empty ? 1.35 : 1, gap: 0.05 });
        fx.spawn({ x: sh.x + alt * 5, y: sh.y - 36, kind: 'glow', rgb: charRgb, size: 4, life: 0.08 });
      }
      if (S.ammo <= 0 && firing) { S.lowAmmoT += dt; if (S.lowAmmoT > 1.5) { S.lowAmmoT = -4; toast('OUT OF AMMO', 'Backup blaster only. Grab yellow A pickups', '255,214,90'); } }
      // missile
      S.missileCd -= dt;
      if (I.pressed.special && S.missiles > 0 && S.missileCd <= 0) { playerMissile(); S.missileCd = 0.35; }
      // shield
      if (I.pressed.special2 && S.shields > 0 && S.shieldT <= 0) { S.shields--; S.shieldT = 5.5; sfx('shield', sh.x); fx.spawn({ x: sh.x, y: sh.y, kind: 'ring', size: 10, grow: 140, life: 0.4, rgb: '140,200,255' }); }

      // engine trail
      if (Math.random() < 0.9) for (const [nx, ny] of art.ship.nozzles) fx.spawn({ x: sh.x + nx + rand(-1, 1), y: sh.y + ny, vx: rand(-10, 10), vy: rand(160, 260), kind: 'glow', rgb: charRgb, size: rand(1.5, 3) * (0.5 + sh.thrust), life: rand(0.12, 0.25) });
    }

    function updateEnemies(dt) {
      const sh = S.ship;
      for (let i = S.enemies.length - 1; i >= 0; i--) {
        const e = S.enemies[i];
        if (e.dead || e.gone) { S.enemies.splice(i, 1); continue; }
        if (e.delay > 0) { e.delay -= dt; continue; }
        e.t += dt; e.flash = Math.max(0, e.flash - dt * 6);
        const px = e.x, py = e.y;
        switch (e.path) {
          case 'swoop': e.y += e.v * dt; e.x = e.x0 + Math.sin(e.t * e.w) * e.amp; break;
          case 'arc': {
            const k = clamp(e.t / e.dur, 0, 1), u = 1 - k;
            e.x = u * u * e.p0[0] + 2 * u * k * e.p1[0] + k * k * e.p2[0];
            e.y = u * u * e.p0[1] + 2 * u * k * e.p1[1] + k * k * e.p2[1];
            if (k >= 1) e.gone = true;
            break;
          }
          case 'dive':
            if (e.t < 2.2) { e.y = lerp(e.y, e.holdY, 1 - Math.exp(-dt * 1.6)); e.x = lerp(e.x, clamp(sh.x, 40, W - 40), 1 - Math.exp(-dt * 0.9)); }
            else if (e.shots > 0) { e.y = lerp(e.y, e.holdY, 1 - Math.exp(-dt * 2)); }
            else { e.vx = (e.vx || (e.x < W / 2 ? -1 : 1) * 40) * (1 + dt * 1.8); e.x += e.vx * dt; e.y += 30 * dt; if (e.x < -60 || e.x > W + 60) e.gone = true; }
            break;
          case 'drift': e.y += e.vy * dt; e.x += (e.vx || 0) * dt + Math.sin(e.t * 1.3 + e.r) * 6 * dt; if (e.vx && (e.x < -60 || e.x > W + 60)) e.gone = true; break;
          case 'gate': e.y = e.gate.y; break;
        }
        // facing follows motion (sprites point down at angle 0)
        const mvx = e.x - px, mvy = e.y - py;
        if ((e.type === 'fighter' || e.type === 'interceptor') && Math.hypot(mvx, mvy) > 0.05) {
          const ta = Math.atan2(mvy, mvx) - Math.PI / 2;
          e.ang += angDiff(e.ang, e.type === 'interceptor' && e.path === 'dive' && e.shots > 0 ? aimAt(e.x, e.y) - Math.PI / 2 : ta) * Math.min(1, dt * 6);
        }
        if (e.y > H + 80 || e.y < -400) { e.gone = true; continue; }
        const onScreen = e.y > 10 && e.y < H - 160;

        // weapons
        if (e.type === 'fighter' && onScreen && e.y < sh.y - 70) {
          e.fireCd -= dt;
          if (e.fireCd <= 0) {
            e.fireCd = rand(1.0, 1.7);
            const a = aimAt(e.x, e.y);
            if (Math.random() < 0.3) for (const da of [-0.22, 0, 0.22]) fireEnemy(e.x, e.y + 16, a + da, 215);
            else { fireEnemy(e.x, e.y + 16, a, 235); }
          }
        } else if (e.type === 'interceptor' && e.path === 'dive' && e.t > 1.4 && e.shots > 0) {
          e.fireCd -= dt;
          if (e.fireCd <= 0) { e.fireCd = 1.1; e.shots--; enemyMissile(e.x, e.y + 20); fx.burst(e.x, e.y + 20, { n: 6, speed: 90, rgb: '255,120,220', kind: 'glow', life: 0.25, size: 3 }); }
        } else if (e.type === 'wreck' && onScreen) {
          e.aim += angDiff(e.aim, aimAt(e.x, e.y - 8)) * Math.min(1, dt * 3);
          e.fireCd -= dt; e.ringCd -= dt;
          if (e.fireCd <= 0) { e.burst = 3; e.fireCd = 2.1; }
          if (e.burst > 0) { e.burstT = (e.burstT || 0) - dt; if (e.burstT <= 0) { e.burstT = 0.13; e.burst--; fireEnemy(e.x + Math.cos(e.aim) * 18, e.y - 8 + Math.sin(e.aim) * 18, e.aim, 220); } }
          if (e.ringCd <= 0) { e.ringCd = 3.6; for (let k = 0; k < 10; k++) fireEnemy(e.x, e.y - 8, k / 10 * TAU + e.t, 120, 'ring'); }
        } else if (e.type === 'mine') {
          if (e.armT < 0 && dist(e.x, e.y, sh.x, sh.y) < 78 && sh.alive) e.armT = 0.65;
          if (e.armT > 0) { e.armT -= dt; if (e.armT <= 0) { e.dead = true; mineBlast(e); continue; } }
        }
        // body collisions
        if (sh.alive && e.type !== 'pylon' && dist(e.x, e.y, sh.x, sh.y) < e.r + sh.r - 4) {
          if (e.type === 'crate') { hitEnemy(e, 99); continue; }
          if (e.type === 'mine') { e.dead = true; mineBlast(e); continue; }
          shipDamage(e.type === 'wreck' ? 12 : 10, e.x, e.y);
          if (e.type !== 'wreck') hitEnemy(e, 99);
        }
      }
      // laser gates
      for (let i = S.beams.length - 1; i >= 0; i--) {
        const g = S.beams[i];
        g.t += dt; g.y += g.vy * dt;
        g.cycle = (g.t % 3.0);                              // 0-1.4 off, 1.4-2.0 warn, 2.0-3.0 on
        g.on = !g.dead && g.cycle > 2.0; g.warn = !g.dead && g.cycle > 1.4 && g.cycle <= 2.0;
        if (g.on && sh.alive && Math.abs(sh.y - g.y) < 12) shipDamage(18, sh.x, g.y, 'laser');
        if (g.y > H + 60) { S.beams.splice(i, 1); for (const p of g.pylons) p.gone = true; }
      }
    }

    function updateRocks(dt) {
      const sh = S.ship;
      for (let i = S.rocks.length - 1; i >= 0; i--) {
        const r = S.rocks[i];
        if (r.dead || r.y > H + 80 || r.x < -90 || r.x > W + 90) { S.rocks.splice(i, 1); continue; }
        r.x += r.vx * dt; r.y += r.vy * dt; r.ang += r.spin * dt; r.flash = Math.max(0, r.flash - dt * 6);
        if (sh.alive && dist(r.x, r.y, sh.x, sh.y) < r.r * 0.85 + sh.r - 3) {
          shipDamage(r.size === 3 ? 12 : r.size === 2 ? 7 : 3, r.x, r.y);
          hitRock(r, 99);
        }
      }
    }

    function updateBoss(dt) {
      const B = S.boss; if (!B) return;
      B.t += dt; B.flash = Math.max(0, B.flash - dt * 4);
      for (const p of B.parts) p.flash = Math.max(0, (p.flash || 0) - dt * 6);
      B.core.flash = Math.max(0, B.core.flash - dt * 6);
      B.enter = Math.min(1, B.enter + dt / 4.2);
      const sway = B.phase === 3 ? 62 : 42, ss = B.phase === 3 ? 0.62 : 0.38;
      B.y = lerp(-190, B.ty + (B.phase === 3 ? 14 : 0), 1 - Math.pow(1 - B.enter, 3));
      B.x = W / 2 + Math.sin(B.t * ss) * sway * B.enter;
      if (B.dying) {
        B.dying += dt;
        B.chain -= dt;
        if (B.chain <= 0 && B.dying < 2.6) { B.chain = 0.12; boom(B.x + rand(-150, 150), B.y + rand(-90, 100), rand(26, 52), { vy: -20 }); }
        if (B.dying > 2.6 && !B.finalBoom) {
          B.finalBoom = true;
          boom(B.x, B.y + 20, 160, { life: 2.2 }); boom(B.x - 90, B.y, 90); boom(B.x + 90, B.y - 20, 90);
          env.flash('255,255,240', 1); env.shake(1); env.hitstop(0.25);
          for (let i = 0; i < 40; i++) fx.spawn({ x: B.x + rand(-120, 120), y: B.y + rand(-80, 80), vx: rand(-260, 260), vy: rand(-200, 260), kind: 'debris', rgb: '110,118,128', size: rand(3, 9), life: rand(1.4, 2.4), spin: rand(-6, 6), drag: 0.3 });
          S.winT = 0;
        }
        if (B.dying > 3.4) { S.boss = null; env.hud.boss = null; }
        return;
      }
      if (B.enter < 1) return;
      const sh = S.ship;
      // supply pods drift across during the fight
      B.supplyCd -= dt;
      if (B.supplyCd <= 0) { B.supplyCd = 14; const s = Math.random() < 0.5 ? -1 : 1; enemy({ type: 'crate', hp: 2, r: 16, x: s < 0 ? -24 : W + 24, y: rand(400, 480), path: 'drift', vy: 4, vx: -s * 70, spin: rand(-0.6, 0.6) }); }
      // turrets track the ship
      for (const p of B.parts) {
        if (!p.alive) continue;
        const pp = bossPoint(p);
        p.aim += angDiff(p.aim, aimAt(pp.x, pp.y)) * Math.min(1, dt * 3);
        p.cd -= dt;
        if (p.cd <= 0) { p.cd = 1.7; for (const da of [-0.13, 0, 0.13]) fireEnemy(pp.x + Math.cos(p.aim) * 22, pp.y + Math.sin(p.aim) * 22, p.aim + da, 200); }
      }
      const cp = bossPoint(B.core);
      if (B.phase === 1) {
        B.spiralCd -= dt;
        if (B.spiralCd <= 0) { B.spiral = 1.3; B.spiralCd = 4.6; }
        B.droneCd -= dt;
        if (B.droneCd <= 0) {
          B.droneCd = 9;
          for (const s of [-1, 1]) enemy({ type: 'fighter', v2: true, hp: 3, r: 18, x: B.x + s * 150, y: B.y + 40, path: 'swoop', x0: B.x + s * 150, amp: 30, w: 1.6, v: 110, fireCd: 1.2, drone: true });
        }
      } else {
        B.laserCd -= dt;
        if (B.laserCd <= 0 && !B.laser) { const dir = sh.x < B.x ? 1 : -1; B.laser = { t: 0, a0: dir * -0.62, a1: dir * 0.62 }; B.laserCd = B.phase === 3 ? 6.4 : 7.2; sfx('big_laser', B.x, { vol: 0.8 }); }
        B.missileCd -= dt;
        if (B.missileCd <= 0) { B.missileCd = B.phase === 3 ? 4.2 : 5.4; enemyMissile(B.x - 70, B.y + 70); enemyMissile(B.x + 70, B.y + 70); }
        B.spreadCd -= dt;
        if (B.spreadCd <= 0 && !B.laser) { B.spreadCd = B.phase === 3 ? 1.7 : 2.3; const a = aimAt(cp.x, cp.y); for (let k = -2; k <= 2; k++) fireEnemy(cp.x, cp.y + 30, a + k * 0.16, 190, 'orb'); }
        if (B.phase === 3) {
          B.ringCd -= dt;
          if (B.ringCd <= 0) { B.ringCd = 2.6; for (let k = 0; k < 16; k++) fireEnemy(cp.x, cp.y, k / 16 * TAU + B.t * 0.7, 125, 'ring'); }
        }
      }
      if (B.spiral > 0) {                                // two-armed spiral spray from the core
        B.spiral -= dt; B.spiralT = (B.spiralT || 0) - dt;
        if (B.spiralT <= 0) { B.spiralT = 0.09; const a = B.t * 3.1; fireEnemy(cp.x, cp.y, Math.PI / 2 + Math.sin(a) * 1.1, 165, 'ring'); fireEnemy(cp.x, cp.y, Math.PI / 2 - Math.sin(a) * 1.1, 165, 'ring'); }
      }
      if (B.laser) {
        const L = B.laser; L.t += dt;
        L.warmup = 1.1; L.dur = 2.1;
        if (L.t > L.warmup) {
          const k = clamp((L.t - L.warmup) / L.dur, 0, 1);
          L.a = Math.PI / 2 + lerp(L.a0, L.a1, k * k * (3 - 2 * k));
          if (sh.alive) {                                // distance from the ship to the beam ray
            const dx = Math.cos(L.a), dy = Math.sin(L.a), rx = sh.x - cp.x, ry = sh.y - cp.y;
            const along = rx * dx + ry * dy, across = Math.abs(rx * dy - ry * dx);
            if (along > 0 && across < 17) shipDamage(20, sh.x, sh.y, 'laser');
          }
          if (Math.random() < 0.6) fx.spawn({ x: cp.x + Math.cos(L.a) * rand(40, 700), y: cp.y + Math.sin(L.a) * rand(40, 700), vx: rand(-60, 60), vy: rand(-60, 60), kind: 'glow', rgb: '160,255,210', size: rand(2, 4), life: 0.3 });
        } else L.a = Math.PI / 2 + L.a0;
        if (L.t > L.warmup + L.dur) B.laser = null;
      }
    }

    function updateBullets(dt) {
      const sh = S.ship;
      // player bolts
      for (let i = S.pb.length - 1; i >= 0; i--) {
        const b = S.pb[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        let hit = b.y < -20 || b.life <= 0;
        if (!hit) hit = bulletHits(b.x, b.y, b.dmg, 5);
        if (hit) S.pb.splice(i, 1);
      }
      // player missiles
      for (let i = S.pm.length - 1; i >= 0; i--) {
        const m = S.pm[i];
        m.life -= dt; m.spd = Math.min(560, m.spd + 900 * dt);
        let tp = targetPos(m.target);
        if (!tp && m.life < 3.3) { m.target = pickTarget(); tp = targetPos(m.target); }
        const want = tp ? Math.atan2(tp.y - m.y, tp.x - m.x) : -Math.PI / 2;
        m.ang += clamp(angDiff(m.ang, want), -7 * dt, 7 * dt);
        m.vx = lerp(m.vx, Math.cos(m.ang) * m.spd, 1 - Math.exp(-dt * 7)); m.vy = lerp(m.vy, Math.sin(m.ang) * m.spd, 1 - Math.exp(-dt * 7));
        m.x += m.vx * dt; m.y += m.vy * dt;
        m.smokeT -= dt;
        if (m.smokeT <= 0) { m.smokeT = 0.016; fx.spawn({ x: m.x - Math.cos(m.ang) * 9, y: m.y - Math.sin(m.ang) * 9, vx: rand(-12, 12), vy: rand(-12, 12) + 30, kind: 'smoke', rgb: '170,170,175', size: 5, grow: 26, life: 0.9, drag: 1.5 }); }
        let hit = m.life <= 0 || m.y < -60 || m.x < -60 || m.x > W + 60;
        if (!hit && bulletHits(m.x, m.y, S.boss ? 14 : 10, 8, true)) { hit = true; boom(m.x, m.y, 30); }
        if (hit) S.pm.splice(i, 1);
      }
      // enemy bolts
      for (let i = S.eb.length - 1; i >= 0; i--) {
        const b = S.eb[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.y > H + 20 || b.y < -40 || b.x < -30 || b.x > W + 30) { S.eb.splice(i, 1); continue; }
        if (sh.alive && dist(b.x, b.y, sh.x, sh.y) < b.r + (S.shieldT > 0 ? 34 : sh.hitR)) { shipDamage(b.dmg, b.x, b.y); S.eb.splice(i, 1); }
      }
      // enemy homing missiles (shootable)
      for (let i = S.em.length - 1; i >= 0; i--) {
        const m = S.em[i];
        m.life -= dt; m.spd = Math.min(250, m.spd + 120 * dt);
        if (m.life > 1.2 && sh.alive) m.ang += clamp(angDiff(m.ang, aimAt(m.x, m.y)), -2.1 * dt, 2.1 * dt);
        m.x += Math.cos(m.ang) * m.spd * dt; m.y += Math.sin(m.ang) * m.spd * dt;
        m.smokeT -= dt;
        if (m.smokeT <= 0) { m.smokeT = 0.03; fx.spawn({ x: m.x - Math.cos(m.ang) * 8, y: m.y - Math.sin(m.ang) * 8, kind: 'smoke', rgb: '150,120,150', size: 4, grow: 18, life: 0.7, drag: 1.5 }); }
        let gone = m.life <= 0 || m.y > H + 30 || m.hp <= 0;
        if (!gone && sh.alive && dist(m.x, m.y, sh.x, sh.y) < (S.shieldT > 0 ? 36 : 14)) { shipDamage(12, m.x, m.y); gone = true; }
        if (gone) { boom(m.x, m.y, 18, { ring: '255,140,230' }); S.em.splice(i, 1); }
      }
    }

    // a projectile at (x,y) hits the first thing it touches; returns true if consumed
    function bulletHits(x, y, dmg, rad, isMissile) {
      for (const m of S.em) if (dist(x, y, m.x, m.y) < 10 + rad) { m.hp -= 1; return true; }
      for (const e of S.enemies) {
        if (e.dead || e.delay > 0) continue;
        if (dist(x, y, e.x, e.y) < e.r + rad) {
          hitEnemy(e, dmg);
          fx.burst(x, y, { n: 3, speed: 90, rgb: e.type === 'interceptor' ? '255,150,230' : '170,255,200', kind: 'spark', life: 0.2 });
          return true;
        }
      }
      for (const r of S.rocks) {
        if (dist(x, y, r.x, r.y) < r.r * 0.85 + rad) {
          hitRock(r, dmg);
          fx.burst(x, y, { n: 3, speed: 70, rgb: '200,180,150', kind: 'spark', life: 0.2 });
          return true;
        }
      }
      const B = S.boss;
      if (B && !B.dying && B.enter > 0.8) {
        for (const p of B.parts) {
          if (!p.alive) continue;
          const pp = bossPoint(p);
          if (dist(x, y, pp.x, pp.y) < p.r + rad) { hitBoss(p, dmg, x, y); fx.burst(x, y, { n: 4, speed: 110, rgb: '255,200,140', kind: 'spark', life: 0.25 }); return true; }
        }
        const cp = bossPoint(B.core);
        if (dist(x, y, cp.x, cp.y) < B.core.r + rad + (B.core.shield ? 10 : 0)) {
          if (B.core.shield) { fx.burst(x, y, { n: 3, speed: 90, rgb: '120,255,200', kind: 'spark', life: 0.2 }); B.core.flash = 0.6; }
          else { hitBoss(B.core, dmg, x, y); fx.burst(x, y, { n: 5, speed: 130, rgb: '180,255,220', kind: 'spark', life: 0.25 }); }
          return true;
        }
        // shots fly over the front of the hull to the weak points; misses splash on the rear armour
        const dx = (x - B.x) / BOSS.rx, dy = (y - B.y - 4) / BOSS.ry;
        if (y < B.y - 12 && dx * dx + dy * dy < 0.82) { fx.burst(x, y, { n: 2, speed: 70, rgb: '220,220,230', kind: 'spark', life: 0.15 }); return true; }
      }
      return false;
    }

    function updatePickups(dt) {
      const sh = S.ship;
      for (let i = S.pickups.length - 1; i >= 0; i--) {
        const p = S.pickups[i];
        p.t += dt;
        const d = dist(p.x, p.y, sh.x, sh.y);
        if (sh.alive && d < 110) { const k = (1 - d / 110) * 520 * dt; p.x += (sh.x - p.x) / d * k; p.y += (sh.y - p.y) / d * k; }
        else p.y += p.vy * dt;
        if (sh.alive && d < 26) {
          collect(p); S.pickups.splice(i, 1); continue;
        }
        if (p.y > H + 30 || p.t > p.life) S.pickups.splice(i, 1);
      }
    }
    function collect(p) {
      const P = PICK[p.kind];
      sfx('pickup', p.x, { vol: 0.8 });
      if (p.kind === 'ammo') S.ammo += 100;
      else if (p.kind === 'missile') S.missiles += 2;
      else if (p.kind === 'repair') env.heal(25);
      else if (p.kind === 'spread') { S.spreadT = 12; S.rapidT = 0; }
      else if (p.kind === 'rapid') { S.rapidT = 12; S.spreadT = 0; }
      else if (p.kind === 'shield') S.shields = Math.min(3, S.shields + 1);
      S.pickStack = S.t - (S.pickT || -9) < 0.6 ? (S.pickStack || 0) + 1 : 0; S.pickT = S.t;
      env.floatText(p.x, p.y - 18 - S.pickStack * 18, P.text, P.rgb);
      fx.spawn({ x: p.x, y: p.y, kind: 'ring', size: 6, grow: 90, life: 0.35, rgb: P.rgb });
      fx.burst(p.x, p.y, { n: 10, speed: 120, rgb: P.rgb, kind: 'glow', life: 0.4, size: 2.5 });
      S.picked = (S.picked || 0) + 1;
    }

    // test-only autopilot (&auto=1): keep moving, dodge what's coming, shoot
    function autopilot(I) {
      const sh = S.ship;
      let tx = W / 2, ty = 545;
      let tgt = null;
      if (S.boss && S.boss.enter > 0.9 && !S.boss.dying) {
        const p = S.boss.parts.find(q => q.alive) || S.boss.core;
        tgt = bossPoint(p);
      } else {
        let bd = 1e9;
        for (const e of S.enemies) if (!e.dead && e.y > 0 && e.y < sh.y - 60 && e.type !== 'mine') { const d = Math.abs(e.x - sh.x) + (sh.y - e.y) * 0.3; if (d < bd) { bd = d; tgt = e; } }
        for (const p of S.pickups) if (p.y > 200) { tgt = p; ty = clamp(p.y, 300, 600); break; }
      }
      if (tgt) tx = tgt.x;
      let dx = (tx - sh.x) / 60, dy = (ty - sh.y) / 80;
      const threats = S.eb.concat(S.em, S.rocks, S.enemies.filter(e => e.type === 'mine'));
      for (const b of threats) {
        const rx = sh.x - b.x, ry = sh.y - b.y, d = Math.hypot(rx, ry);
        const R = (b.r || 6) + 70;
        if (d < R && ry > -30) { const k = (R - d) / R; dx += rx / d * k * (GOD ? 0.6 : 3); dy += ry / d * k * (GOD ? 0.3 : 1.6); }
      }
      dx += (W / 2 - sh.x) / W * 1.4;                    // don't get pinned against a wall
      if (S.boss && S.boss.laser) { const L = S.boss.laser, cp = bossPoint(S.boss.core); const a = L.a || Math.PI / 2; const side = Math.sign((sh.x - cp.x) * Math.sin(a) - (sh.y - cp.y) * Math.cos(a)) || 1; dx += side * 1.5; }
      for (const g of S.beams) if ((g.on || g.warn) && Math.abs(g.y - sh.y) < 60) dy += g.y < sh.y ? 2 : -2;
      const held = { attack: true };
      const pressed = {};
      if (S.missiles > 0 && ((S.boss && S.boss.enter >= 1 && !S.boss.dying) || S.enemies.some(e => e.type === 'interceptor' || e.type === 'wreck')) && Math.random() < 0.02) pressed.special = true;
      if (S.shields > 0 && env.health < 45 && S.shieldT <= 0 && S.eb.length > 6) pressed.special2 = true;
      return { ax: clamp(dx, -1, 1), ay: clamp(dy, -1, 1), held, pressed, released: {}, left: dx < -0.3, right: dx > 0.3, up: dy < -0.3, down: dy > 0.3 };
    }

    // ── RENDER ──────────────────────────────────────────────────────────────
    function render(c) {
      if (S.phase === 'escape') drawHangar(c);
      else drawSpace(c);

      if (S.mother) drawMotherExterior(c);
      for (const e of S.enemies) if (e.type === 'wreck') drawEnemy(c, e);
      for (const r of S.rocks) drawRock(c, r);
      for (const e of S.enemies) if (e.type !== 'wreck') drawEnemy(c, e);
      if (S.boss) drawBoss(c);
      for (const p of S.pickups) drawPickup(c, p);
      drawEnemyFire(c);
      drawPlayerFire(c);
      if (S.ship.alive) drawShip(c);
      drawBooms(c);
      fx.draw(c);
      for (const g of S.beams) drawGateBeam(c, g);
      if (S.boss && S.boss.laser) drawBossLaser(c);
      drawSpeedLines(c);
      drawToasts(c);
      // hull critical: slow red pulse at the screen edges
      if (S.ship.alive && env.health < 30) {
        const k = (0.5 + 0.5 * Math.sin(S.t * 5)) * (1 - env.health / 30);
        const vg = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.65);
        vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(255,30,30,${(0.15 + 0.3 * k).toFixed(3)})`);
        c.fillStyle = vg; c.fillRect(0, 0, W, H);
        c.fillStyle = `rgba(255,120,110,${(0.5 + 0.5 * k).toFixed(3)})`; c.font = '700 12px system-ui'; c.textAlign = 'left';
        c.fillText('HULL CRITICAL', 196, 47);
      }
    }

    function drawSpace(c) {
      c.fillStyle = '#020307'; c.fillRect(0, 0, W, H);
      const bd = env.assets.backdrop;
      if (bd) {
        const k = W / bd.width, ih = bd.height * k;
        const off = clamp(ih - H - S.scroll * ((ih - H) / 1750), 0, ih - H);   // reaches Orion as the boss arrives
        c.drawImage(bd, 0, -off, W, ih);
      }
      // planet drifting through the middle distance
      const jp = env.assets.jupiter;
      if (jp && S.planetY > -300 && S.planetY < H + 40) {
        const pw = 250, ph = pw * jp.height / jp.width;
        c.drawImage(jp, W - pw * 0.58, S.planetY, pw, ph);
      }
      if (!env.drawShader(c, starProg, 0, 0, W, H, { u_scroll: S.scroll * 0.02 + S.t * 0.05, u_warp: S.warp, u_tint: [0.35, 0.75, 0.65] }, 0.5)) drawStarsFallback(c);
      // gentle vignette keeps the action readable
      const vg = c.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
    }
    let fallbackStars = null;
    function drawStarsFallback(c) {
      if (!fallbackStars) { fallbackStars = []; for (let i = 0; i < 120; i++) fallbackStars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() }); }
      for (const s of fallbackStars) {
        const y = (s.y + S.scroll * (0.4 + s.z * 2) + S.t * 20 * s.z) % H;
        c.fillStyle = `rgba(255,255,255,${0.3 + s.z * 0.6})`; c.fillRect(s.x, y, 1 + s.z, 1 + s.z + S.warp * 12 * s.z);
      }
    }

    function drawHangar(c) {
      const Hg = S.hangar, tile = art.hangar, th = 260;
      const off = Hg.pos % th;
      for (let y = -th + off; y < H; y += th) c.drawImage(tile, 0, y, W, th);
      // running guide lights along the runway
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const y = ((i * 52 + Hg.pos) % (H + 52)) - 26;
        const ph = (Math.floor(Hg.pos / 52) + i) % 6 === 0 ? 1 : 0.35;
        c.globalAlpha = ph;
        for (const x of [88, 302]) c.drawImage(env.glowSprite('90,255,170'), x - 8, y - 8, 16, 16);
        c.globalAlpha = 1;
      }
      // wall light strips
      for (const x of [34, W - 34]) { c.globalAlpha = 0.5; c.drawImage(env.glowSprite('80,255,170'), x - 10, 0, 20, H); c.globalAlpha = 1; }
      // red alarm sweep
      const al = 0.5 + 0.5 * Math.sin(Hg.alarm * 6);
      const ag = c.createRadialGradient(W / 2, -40, 10, W / 2, -40, 420);
      ag.addColorStop(0, `rgba(255,40,30,${(0.35 * al).toFixed(3)})`); ag.addColorStop(1, 'rgba(255,40,30,0)');
      c.fillStyle = ag; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      // wall turrets
      for (const tu of Hg.turrets) {
        if (!tu.alive || tu.sy === undefined || tu.sy < -40 || tu.sy > H + 40) continue;
        c.save(); c.translate(tu.sx, tu.sy);
        c.fillStyle = '#2a3036'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(160,180,190,0.5)'; c.lineWidth = 1.2; c.stroke();
        const a = aimAt(tu.sx, tu.sy); c.rotate(a);
        c.fillStyle = '#4a535c'; c.fillRect(0, -3, 20, 6);
        c.globalCompositeOperation = 'lighter'; c.drawImage(env.glowSprite('120,255,170'), -7, -7, 14, 14); c.globalCompositeOperation = 'source-over';
        c.restore();
        if (tu.flash > 0) tu.flash -= 0.1;
      }
      // the docking clamps release
      if (Hg.clamp < 1) {
        const k = Hg.clamp, sy = S.ship.y;
        for (const s of [-1, 1]) {
          c.save(); c.translate(W / 2 + s * (34 + k * 26), sy); c.rotate(s * k * 0.6);
          c.fillStyle = '#59616a'; c.fillRect(-6, -10, 12, 28); c.fillStyle = '#b8902a'; c.fillRect(-6, -10, 12, 4);
          c.restore();
        }
      }
      // blast door ahead
      const doorY = H - (Hg.len - Hg.pos) - 70;
      if (doorY > -160) {
        const op = ease3(Hg.door) * (W / 2 + 10);
        c.save(); c.beginPath(); c.rect(0, -10, W, doorY + 45); c.clip();   // open space beyond the door
        drawSpace(c);
        c.restore();
        for (const s of [-1, 1]) {
          const x = s < 0 ? -op : W / 2 + op;
          const dg = c.createLinearGradient(0, doorY, 0, doorY + 70);
          dg.addColorStop(0, '#4b535c'); dg.addColorStop(1, '#1b1f24');
          c.fillStyle = dg; c.fillRect(x, doorY, W / 2, 70);
          c.save(); c.beginPath(); c.rect(x, doorY + 52, W / 2, 12); c.clip();
          for (let xx = x - 20; xx < x + W / 2 + 20; xx += 16) { c.fillStyle = '#c99a2c'; c.beginPath(); c.moveTo(xx, doorY + 64); c.lineTo(xx + 8, doorY + 52); c.lineTo(xx + 16, doorY + 52); c.lineTo(xx + 8, doorY + 64); c.closePath(); c.fill(); }
          c.restore();
          c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(s < 0 ? x + W / 2 - 4 : x, doorY, 4, 70);
        }
        if (Hg.door > 0 && Hg.door < 1) for (const s of [-1, 1]) fx.burst(W / 2 + s * op, doorY + rand(0, 70), { n: 1, speed: 160, rgb: '255,200,120', kind: 'spark', life: 0.4, g: 300 });
      }
      // speed rush
      if (S.warp > 0.1) {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = `rgba(200,255,230,${(S.warp * 0.25).toFixed(3)})`; c.lineWidth = 1;
        for (let i = 0; i < 14; i++) { const x = 50 + (i * 23) % (W - 100), y = (i * 131 + Hg.pos * 1.4) % H; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 40 + S.warp * 80); c.stroke(); }
        c.globalCompositeOperation = 'source-over';
      }
    }
    const ease3 = k => 1 - Math.pow(1 - k, 3);

    function drawMotherExterior(c) {
      // the mothership you just left, falling away beneath you
      const k = S.mother.t / 7, a = art.boss;
      const sc = lerp(1.7, 1.0, k);
      const y = H - 40 + k * 520;
      c.save(); c.globalAlpha = clamp(1.4 - k * 1.2, 0, 1);
      c.translate(W / 2, y); c.rotate(Math.PI); c.scale(sc, sc);
      c.drawImage(a.img, -a.w / 2, -a.h / 2, a.w, a.h);
      c.restore();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = clamp(1 - k, 0, 1) * 0.8;
      c.drawImage(env.glowSprite('120,255,200'), W / 2 - 120, y - 300 * (1 - k) - 120, 240, 240);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }

    function drawRock(c, r) {
      const s = r.r * 2.35;
      c.save(); c.translate(r.x, r.y); c.rotate(r.ang);
      c.drawImage(r.img, -s / 2, -s / 2, s, s);
      if (r.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = r.flash * 0.5; c.drawImage(r.img, -s / 2, -s / 2, s, s); }
      c.restore();
    }

    function drawSprite(c, a, x, y, ang, flash, scale) {
      const sc = scale || 1;
      c.save(); c.translate(x, y); if (ang) c.rotate(ang);
      c.drawImage(a.img, -a.w * sc / 2, -a.h * sc / 2, a.w * sc, a.h * sc);
      if (flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, flash) * 0.7; c.drawImage(a.img, -a.w * sc / 2, -a.h * sc / 2, a.w * sc, a.h * sc); }
      c.restore();
    }

    function drawEnemy(c, e) {
      if (e.delay > 0) return;
      const gs = env.glowSprite;
      switch (e.type) {
        case 'fighter': {
          // rear thruster glow (sprite points down, thruster at its top)
          const bx = e.x - Math.sin(-e.ang) * -22, by = e.y - Math.cos(e.ang) * 22;
          c.globalCompositeOperation = 'lighter'; c.drawImage(gs('80,255,170'), bx - 10, by - 10, 20, 20); c.globalCompositeOperation = 'source-over';
          drawSprite(c, e.v2 ? art.fighter2 : art.fighter, e.x, e.y, e.ang, e.flash);
          break;
        }
        case 'interceptor': {
          c.globalCompositeOperation = 'lighter'; c.drawImage(gs('255,80,220'), e.x - 16, e.y - 34, 32, 26); c.globalCompositeOperation = 'source-over';
          drawSprite(c, art.interceptor, e.x, e.y, e.ang, e.flash);
          break;
        }
        case 'mine': {
          drawSprite(c, art.mine, e.x, e.y, e.t * 0.8, e.flash);
          const bl = e.armT > 0 ? (Math.sin(e.t * 40) > 0 ? 1 : 0.2) : 0.4 + 0.4 * Math.sin(e.t * 5);
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = bl; c.drawImage(gs('255,60,40'), e.x - 12, e.y - 12, 24, 24); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          if (e.armT > 0) { c.strokeStyle = `rgba(255,80,60,${0.5 * bl})`; c.lineWidth = 1.5; c.beginPath(); c.arc(e.x, e.y, 70, 0, TAU); c.stroke(); }
          break;
        }
        case 'crate': {
          drawSprite(c, art.crate, e.x, e.y, Math.sin(e.t * (e.spin || 0.5)) * 0.4, e.flash);
          const bl = 0.5 + 0.5 * Math.sin(e.t * 6);
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = bl; c.drawImage(gs('255,214,90'), e.x - 10, e.y - 10, 20, 20); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          break;
        }
        case 'wreck': {
          drawSprite(c, art.wreck, e.x, e.y + 6, 0.08, 0);
          // turret on the wreck
          c.save(); c.translate(e.x, e.y - 8);
          const tg = c.createRadialGradient(-4, -4, 2, 0, 0, 15);
          tg.addColorStop(0, '#8a939d'); tg.addColorStop(1, '#22272d');
          c.fillStyle = tg; c.beginPath(); c.arc(0, 0, 15, 0, TAU); c.fill();
          c.rotate(e.aim); c.fillStyle = '#3d454e'; c.fillRect(4, -3.5, 20, 7); c.fillStyle = '#15191d'; c.fillRect(20, -2.5, 5, 5);
          c.restore();
          if (e.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = e.flash * 0.6; c.drawImage(gs('255,230,200'), e.x - 24, e.y - 32, 48, 48); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
          if (Math.random() < 0.3) fx.spawn({ x: e.x + 40 + rand(-6, 6), y: e.y + 10, vx: rand(-10, 10), vy: rand(-40, -10), kind: 'glow', rgb: '255,150,60', size: rand(1.5, 3), life: 0.5 });
          break;
        }
        case 'pylon': {
          c.save(); c.translate(e.x, e.y);
          const pg = c.createLinearGradient(-14, 0, 14, 0);
          pg.addColorStop(0, '#5d6670'); pg.addColorStop(1, '#1c2025');
          c.fillStyle = pg; c.beginPath(); c.moveTo(-14, -18); c.lineTo(14, -18); c.lineTo(10, 18); c.lineTo(-10, 18); c.closePath(); c.fill();
          c.strokeStyle = 'rgba(255,120,140,0.6)'; c.lineWidth = 1; c.stroke();
          c.globalCompositeOperation = 'lighter'; c.drawImage(gs('255,90,120'), -10, -10, 20, 20); c.globalCompositeOperation = 'source-over';
          if (e.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = e.flash * 0.6; c.drawImage(gs('255,255,255'), -20, -20, 40, 40); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
          c.restore();
          break;
        }
      }
    }

    function drawGateBeam(c, g) {
      if (g.dead) return;
      const [a, b] = g.pylons;
      if (!a || !b) return;
      c.save(); c.globalCompositeOperation = 'lighter';
      if (g.warn) {
        c.strokeStyle = `rgba(255,90,110,${(0.35 + 0.35 * Math.sin(S.t * 30)).toFixed(3)})`; c.lineWidth = 1.5; c.setLineDash([8, 6]);
        c.beginPath(); c.moveTo(a.x + 12, g.y); c.lineTo(b.x - 12, g.y); c.stroke(); c.setLineDash([]);
      }
      if (g.on) {
        const fl = 0.85 + 0.15 * Math.sin(S.t * 60);
        const bg = c.createLinearGradient(0, g.y - 14, 0, g.y + 14);
        bg.addColorStop(0, 'rgba(255,40,90,0)'); bg.addColorStop(0.5, `rgba(255,70,110,${0.8 * fl})`); bg.addColorStop(1, 'rgba(255,40,90,0)');
        c.fillStyle = bg; c.fillRect(a.x, g.y - 14, b.x - a.x, 28);
        c.fillStyle = `rgba(255,235,240,${fl})`; c.fillRect(a.x, g.y - 1.6, b.x - a.x, 3.2);
        if (Math.random() < 0.5) fx.spawn({ x: rand(a.x, b.x), y: g.y, vx: rand(-40, 40), vy: rand(-80, 80), kind: 'spark', rgb: '255,140,170', size: 1.5, life: 0.25 });
      }
      c.restore();
    }

    function drawBoss(c) {
      const B = S.boss, a = art.boss, gs = env.glowSprite;
      c.save();
      if (B.finalBoom) c.globalAlpha = clamp(1 - (B.dying - 2.6) / 0.5, 0, 1);
      // engine plumes behind (the painted hull has its own)
      c.globalCompositeOperation = 'lighter';
      if (!a.ai) for (const x of [-70, -24, 24, 70]) {
        const fl = 0.8 + 0.2 * Math.sin(S.t * 30 + x);
        c.globalAlpha = fl * (B.finalBoom ? 0 : 1);
        c.drawImage(gs('90,255,200'), B.x + x - 18, B.y - 150, 36, 60);
      }
      c.globalAlpha = B.finalBoom ? c.globalAlpha : 1;
      c.globalCompositeOperation = 'source-over';
      c.drawImage(a.img, B.x - a.w / 2, B.y - a.h / 2, a.w, a.h);
      if (B.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = B.flash * 0.18; c.drawImage(a.img, B.x - a.w / 2, B.y - a.h / 2, a.w, a.h); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
      // turrets (weak points)
      for (const p of B.parts) {
        const pp = bossPoint(p);
        c.save(); c.translate(pp.x, pp.y);
        if (p.alive) {
          if (!a.ai) {                                     // painted pods already have a housing
            const tg = c.createRadialGradient(-6, -6, 2, 0, 0, p.r);
            tg.addColorStop(0, '#9aa3ad'); tg.addColorStop(0.6, '#3a4149'); tg.addColorStop(1, '#14171b');
            c.fillStyle = tg; c.beginPath(); c.arc(0, 0, p.r - 3, 0, TAU); c.fill();
          }
          c.save(); c.rotate(p.aim);
          const bl = p.r + 4;
          c.fillStyle = '#2b3138'; c.fillRect(4, -7, bl, 5); c.fillRect(4, 2, bl, 5);
          c.fillStyle = '#0f1215'; c.fillRect(bl + 1, -7, 4, 5); c.fillRect(bl + 1, 2, 4, 5);
          c.strokeStyle = 'rgba(120,255,180,0.35)'; c.lineWidth = 0.8; c.strokeRect(4, -7, bl, 5); c.strokeRect(4, 2, bl, 5);
          c.restore();
          const pulse = 0.6 + 0.4 * Math.sin(S.t * 5 + p.ox);
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = pulse; c.drawImage(gs('255,90,70'), -10, -10, 20, 20);
          if (p.flash > 0) { c.globalAlpha = p.flash; c.drawImage(gs('255,240,220'), -26, -26, 52, 52); }
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          // health ring
          c.strokeStyle = 'rgba(255,120,100,0.75)'; c.lineWidth = 2.5;
          c.beginPath(); c.arc(0, 0, p.r + 2, -Math.PI / 2, -Math.PI / 2 + TAU * p.hp / p.max); c.stroke();
        } else {
          c.fillStyle = '#0b0c0e'; c.beginPath(); c.arc(0, 0, p.r - 4, 0, TAU); c.fill();
          if (Math.random() < 0.4 && !B.dying) fx.spawn({ x: pp.x + rand(-8, 8), y: pp.y + rand(-8, 8), vx: rand(-20, 20), vy: rand(-60, -20), kind: 'smoke', rgb: '60,60,64', size: 6, grow: 20, life: 1 });
          if (Math.random() < 0.3) fx.spawn({ x: pp.x + rand(-8, 8), y: pp.y, vx: rand(-30, 30), vy: rand(-40, 10), kind: 'glow', rgb: '255,150,60', size: 2.5, life: 0.4 });
        }
        c.restore();
      }
      // the core
      const cp = bossPoint(B.core);
      c.save(); c.translate(cp.x, cp.y);
      const pulse = 0.75 + 0.25 * Math.sin(S.t * (B.phase === 3 ? 9 : 4));
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = pulse; c.drawImage(gs(B.phase === 3 ? '255,140,110' : '110,255,190'), -48, -48, 96, 96);
      c.globalAlpha = 1;
      const cg = c.createRadialGradient(0, 0, 2, 0, 0, B.core.r);
      cg.addColorStop(0, 'rgba(255,255,240,1)'); cg.addColorStop(0.35, B.phase === 3 ? 'rgba(255,150,110,0.95)' : 'rgba(130,255,200,0.95)'); cg.addColorStop(1, 'rgba(20,80,60,0.2)');
      c.fillStyle = cg; c.beginPath(); c.arc(0, 0, B.core.r - 4, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.save(); c.rotate(S.t * 1.4);                       // rotating armour ring
      c.strokeStyle = 'rgba(30,36,42,0.95)'; c.lineWidth = 6;
      for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(0, 0, B.core.r + 2, k / 6 * TAU, k / 6 * TAU + 0.6); c.stroke(); }
      c.restore();
      if (B.core.shield) {
        c.globalCompositeOperation = 'lighter';
        const sp = 0.5 + 0.2 * Math.sin(S.t * 7) + B.core.flash * 0.6;
        c.globalAlpha = Math.min(1, sp);
        c.drawImage(art.hex, -B.core.r - 12, -B.core.r - 12, (B.core.r + 12) * 2, (B.core.r + 12) * 2);
        c.strokeStyle = 'rgba(140,255,210,0.7)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, B.core.r + 10, 0, TAU); c.stroke();
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
      if (B.core.flash > 0 && !B.core.shield) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = B.core.flash; c.drawImage(gs('255,255,255'), -40, -40, 80, 80); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
      c.restore();
      c.restore();
    }

    function drawBossLaser(c) {
      const B = S.boss, L = B.laser, cp = bossPoint(B.core);
      const a = L.a !== undefined ? L.a : Math.PI / 2 + L.a0;
      const dx = Math.cos(a), dy = Math.sin(a), len = 1000;
      c.save(); c.globalCompositeOperation = 'lighter';
      if (L.t < L.warmup) {                              // telegraph: thin flickering guide + charging core
        const k = L.t / L.warmup;
        c.strokeStyle = `rgba(160,255,210,${(0.25 + 0.4 * k * (0.5 + 0.5 * Math.sin(L.t * 40))).toFixed(3)})`; c.lineWidth = 1 + k * 2;
        c.beginPath(); c.moveTo(cp.x, cp.y); c.lineTo(cp.x + dx * len, cp.y + dy * len); c.stroke();
        c.globalAlpha = k; c.drawImage(env.glowSprite('200,255,230'), cp.x - 30 - k * 20, cp.y - 30 - k * 20, 60 + k * 40, 60 + k * 40);
      } else {
        c.translate(cp.x, cp.y); c.rotate(a);
        const fl = 0.85 + 0.15 * Math.sin(S.t * 70);
        const g = c.createLinearGradient(0, -22, 0, 22);
        g.addColorStop(0, 'rgba(60,255,170,0)'); g.addColorStop(0.5, `rgba(120,255,200,${0.85 * fl})`); g.addColorStop(1, 'rgba(60,255,170,0)');
        c.fillStyle = g; c.fillRect(0, -22, len, 44);
        c.fillStyle = `rgba(245,255,250,${fl})`; c.fillRect(0, -4, len, 8);
        c.drawImage(env.glowSprite('200,255,230'), -50, -50, 100, 100);
      }
      c.restore();
    }

    function drawPickup(c, p) {
      const bob = Math.sin(p.t * 4) * 2, sc = 1 + 0.06 * Math.sin(p.t * 6);
      const fade = p.life - p.t < 2 ? (Math.sin(p.t * 20) > 0 ? 1 : 0.35) : 1;
      c.globalAlpha = fade;
      c.drawImage(art.pick[p.kind], p.x - 23 * sc, p.y - 23 * sc + bob, 46 * sc, 46 * sc);
      c.globalAlpha = 1;
    }

    function drawEnemyFire(c) {
      const gs = env.glowSprite;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const b of S.eb) {
        const s = b.r * 4.2;
        c.drawImage(gs(b.rgb), b.x - s / 2, b.y - s / 2, s, s);
        c.fillStyle = 'rgba(255,255,245,0.95)'; c.beginPath(); c.arc(b.x, b.y, b.r * 0.45, 0, TAU); c.fill();
      }
      for (const m of S.em) {
        c.save(); c.translate(m.x, m.y); c.rotate(m.ang);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#6d4d70'; c.fillRect(-8, -2.5, 14, 5); c.fillStyle = '#d6c3d9'; c.beginPath(); c.moveTo(6, -2.5); c.lineTo(10, 0); c.lineTo(6, 2.5); c.closePath(); c.fill();
        c.globalCompositeOperation = 'lighter';
        const fl = 0.7 + 0.3 * Math.random();
        c.drawImage(gs('255,120,220'), -22, -8 * fl, 16, 16 * fl);
        c.drawImage(gs('255,230,250'), -14, -3, 6, 6);
        c.restore();
      }
      c.restore();
    }

    function drawPlayerFire(c) {
      const gs = env.glowSprite;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const b of S.pb) {
        const len = b.weak ? 8 : 18, ang = Math.atan2(b.vy, b.vx);
        c.save(); c.translate(b.x, b.y); c.rotate(ang);
        c.globalAlpha = b.weak ? 0.6 : 1;
        c.drawImage(gs(charRgb), -len - 6, -6, len + 12, 12);
        c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(-len, -1.2, len, 2.4);
        c.restore();
      }
      c.globalAlpha = 1;
      for (const m of S.pm) {
        c.save(); c.translate(m.x, m.y); c.rotate(m.ang);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#d9dee4'; c.fillRect(-8, -2.2, 13, 4.4);
        c.fillStyle = '#c0392b'; c.beginPath(); c.moveTo(5, -2.2); c.lineTo(10, 0); c.lineTo(5, 2.2); c.closePath(); c.fill();
        c.fillStyle = '#7f8790'; c.fillRect(-8, -4, 3, 8);
        c.globalCompositeOperation = 'lighter';
        const fl = 0.75 + 0.25 * Math.random();
        c.drawImage(gs('255,170,80'), -28, -9 * fl, 22, 18 * fl);
        c.drawImage(gs('255,250,220'), -14, -3, 7, 6);
        c.restore();
      }
      c.restore();
    }

    function drawShip(c) {
      const sh = S.ship, a = art.ship, gs = env.glowSprite;
      const squash = 1 - Math.abs(sh.bank) * 0.2;
      // engine flames (under the ship)
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const [nx, ny] of a.nozzles) {
        const fl = 0.85 + 0.3 * Math.random(), L = (14 + sh.thrust * 26) * fl;
        const x = sh.x + nx * squash, y = sh.y + ny;
        c.drawImage(gs(charRgb), x - 7, y - 4, 14, L + 10);
        c.drawImage(gs('255,255,255'), x - 3, y - 2, 6, L * 0.55);
      }
      c.restore();
      c.save(); c.translate(sh.x, sh.y); c.rotate(sh.bank * 0.1); c.scale(squash, 1);
      c.drawImage(a.img, -a.w / 2, -a.h / 2, a.w, a.h);
      // the spirit at the controls
      if (window.drawSpirit) {
        c.save();
        c.beginPath(); c.ellipse(0, a.cy, a.crx, a.cry, 0, 0, TAU); c.clip();
        c.fillStyle = '#071828'; c.fill();
        drawSpirit(c, 0, a.cy + 6.5, S.t, 'IDLE', env.charId, { scale: 0.22, land: true });
        c.restore();
      }
      c.drawImage(art.glass, -a.crx - 1.2, a.cy - a.cry - 1.5, (a.crx + 1.2) * 2, (a.cry + 1.5) * 2);
      if (sh.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = sh.flash * 0.6; c.drawImage(a.img, -a.w / 2, -a.h / 2, a.w, a.h); }
      c.restore();
      // shield bubble
      if (S.shieldT > 0) {
        const k = S.shieldT, fade = k < 1 ? (Math.sin(S.t * 30) > 0 ? 0.9 : 0.35) : 1;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = fade;
        const R = 38 + Math.sin(S.t * 6) * 1.5;
        const bg = c.createRadialGradient(sh.x, sh.y, R * 0.55, sh.x, sh.y, R);
        bg.addColorStop(0, 'rgba(120,190,255,0)'); bg.addColorStop(0.85, `rgba(140,200,255,${0.32 + (S.shieldHit || 0) * 0.4})`); bg.addColorStop(1, 'rgba(200,230,255,0)');
        c.fillStyle = bg; c.beginPath(); c.arc(sh.x, sh.y, R, 0, TAU); c.fill();
        c.globalAlpha = fade * (0.35 + (S.shieldHit || 0) * 0.5);
        c.save(); c.translate(sh.x, sh.y); c.rotate(S.t * 0.3); c.drawImage(art.hex, -R, -R, R * 2, R * 2); c.restore();
        c.restore();
      }
    }

    function drawBooms(c) {
      const P = art.puffs;
      for (const b of S.booms) {
        const k = b.age / b.life;
        // flash
        if (k < 0.25) {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k / 0.25;
          const s = b.r * 4.5; c.drawImage(env.glowSprite('255,245,220'), b.x - s / 2, b.y - s / 2, s, s);
          c.globalAlpha = 1;
        }
        // fireball puffs expanding outwards, cooling hot -> orange -> red, then smoke
        for (let i = 0; i < b.n; i++) {
          const h = (Math.sin(b.seed + i * 12.9) + 1) / 2, h2 = (Math.sin(b.seed * 1.7 + i * 7.3) + 1) / 2;
          const a = i / b.n * TAU + h * 1.3;
          const spread = b.r * (0.2 + 0.85 * h2) * (1 - Math.pow(1 - Math.min(1, k * 1.6), 2));
          const x = b.x + Math.cos(a) * spread, y = b.y + Math.sin(a) * spread - k * b.r * 0.15;
          const size = b.r * (0.75 + h * 0.6) * (0.6 + Math.min(1, k * 2) * 0.8);
          const v = i % 3;
          if (k < 1) {
            const stage = k * 3;                              // 0..3: hot, orange, red
            const i0 = Math.min(2, Math.floor(stage)), f = stage - i0;
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = (1 - k) * (1 - f) * 0.9; c.drawImage(P[i0][v], x - size / 2, y - size / 2, size, size);
            c.globalAlpha = (1 - k) * f * 0.9; c.drawImage(P[Math.min(2, i0 + 1)][v], x - size / 2, y - size / 2, size, size);
          }
          if (k > 0.35) {                                     // smoke lingers after the fire
            c.globalCompositeOperation = 'source-over';
            const sk = clamp((k - 0.35) / 1.45, 0, 1);
            c.globalAlpha = Math.sin(sk * Math.PI) * 0.55;
            const ss = size * (1.1 + sk * 0.8);
            c.drawImage(P[3][v], x - ss / 2, y - ss / 2 - sk * 10, ss, ss);
          }
        }
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
    }

    function drawSpeedLines(c) {
      const w = S.warp;
      if (w < 0.05) return;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(200,240,255,${(w * 0.35).toFixed(3)})`; c.lineWidth = 1.2;
      for (const l of S.speedLines) {
        l.y += (900 * l.v * w + 60) * 0.016;
        if (l.y > H) { l.y = -60; l.x = rand(0, W); }
        c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(l.x, l.y + 30 + w * 90 * l.v); c.stroke();
      }
      c.restore();
    }

    function drawToasts(c) {
      for (const t of S.toasts) {
        if (t.t < 0) continue;
        const k = t.t, a = clamp(Math.min(k / 0.25, (t.life - k) / 0.35), 0, 1);
        const y = t.big ? 330 : 300;
        c.save(); c.globalAlpha = a; c.textAlign = 'center';
        const sc = 1 + (1 - clamp(k / 0.3, 0, 1)) * 0.3;
        c.translate(W / 2, y); c.scale(sc, sc);
        if (t.big) {
          const bw = 300;
          c.fillStyle = `rgba(${t.rgb},0.14)`; c.fillRect(-bw / 2, -34, bw, 62);
          c.fillStyle = `rgba(${t.rgb},0.8)`; c.fillRect(-bw / 2, -34, bw, 2); c.fillRect(-bw / 2, 26, bw, 2);
        }
        c.font = `800 ${t.big ? 30 : 26}px system-ui`;
        c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(t.text, 0, 0);
        c.fillStyle = `rgb(${t.rgb})`; c.fillText(t.text, 0, 0);
        if (t.sub) { c.font = '600 14px system-ui'; c.lineWidth = 3; c.strokeText(t.sub, 0, 20); c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillText(t.sub, 0, 20); }
        c.restore();
      }
    }

    return {
      update, render,
      debug() {
        const B = S.boss;
        return {
          phase: S.boss ? 'boss' : S.phase, t: +S.t.toFixed(2), ship: { x: Math.round(S.ship.x), y: Math.round(S.ship.y), alive: S.ship.alive },
          ammo: S.ammo, missiles: S.missiles, shields: S.shields, shieldT: +S.shieldT.toFixed(1), spreadT: +S.spreadT.toFixed(1), rapidT: +S.rapidT.toFixed(1),
          enemies: S.enemies.length, rocks: S.rocks.length, eb: S.eb.length, em: S.em.length, pm: S.pm.length, pickups: S.pickups.length,
          picked: S.picked || 0, kills: S.kills, dmgTaken: S.dmgTaken,
          boss: B ? { hp: +bossHP().toFixed(3), phase: B.phase, lt: B.parts[0].hp, rt: B.parts[1].hp, core: B.core.hp, shield: B.core.shield, dying: +(B.dying || 0).toFixed(2), laser: !!B.laser } : null,
          winT: S.winT
        };
      },
      destroy() { if (LIVE === S) LIVE = null; }
    };
  }
})();
