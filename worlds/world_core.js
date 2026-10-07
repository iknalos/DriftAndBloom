// ============================================================================
// Drift & Bloom — WORLD CORE
// Shared engine for the three side worlds a catch sends you into:
//   'animal' (bitten by a croc / snake)  · 'alien' (beamed up by a saucer)
//   'hell'   (scorched by the dragon)
//
// A world module registers itself:
//   DABWorlds.register('animal', {
//     title: 'Animal World', color: '120,200,90',
//     opaque: true,          // optional: the world paints every pixel each frame (skips the clear)
//     subtitle: reason => 'The croc dragged you into the wild...',
//     hint: 'Fight your way to the lotus gate',
//     controls: { dirs: 'lr' | 'stick' | 'none', buttons: [{ id, icon, label?, count?() }],
//                 touch: true },  // touch: taps / swipes / drags on the play field reach the world
//     assets: { key: 'assets/worlds/animal/croc.png', ... },   // preloaded
//     create(env) { return { update(dt, input), render(ctx), debug?(), destroy?() }; }
//   });
// and game.html enters it with   DABWorlds.enter('animal', { charId, reason, level, badge, round })
// which resolves { won: true|false, aborted?, stars 1..3 } once the world is over.
// Adventure mode (10 stages x 10 rounds) passes level 1..10 (the stage: difficulty), a badge
// ('STAGE 3 · ROUND 4') for the intro card and round: true (round-style result card).
//
// The env handed to create():
//   W, H (390×844 app px), t (seconds), charId, charRgb ('r,g,b'), assets{key: img}
//   health / maxHealth (100) · damage(n, {x, y, text}) · heal(n) · invuln(sec)
//   boon(id) · atk · clock — the Adventure boon picked after the last stage (adventure.js): atk multiplies the
//   player's hits, clock is how fast round clocks run; 'hide' and 'dew' are handled here (less damage, slow healing)
//   win() · lose()      — end the world (core plays the result card)
//   shake(amount 0..1) · flash('r,g,b', alpha) · hitstop(sec)
//   fx — particle system: fx.spawn({...}) / fx.burst(x, y, opts) / fx.update / fx.draw
//   floatText(x, y, text, rgb) — rising damage / pickup numbers (core draws them)
//   hud: { objective, progress (0..1 | null), boss: {name, hp (0..1)} | null,
//          counters: [{icon, value}] }   — set fields, core draws them
//   shader(fragSrc) → program | null (WebGL unavailable)
//   drawShader(ctx, program, x, y, w, h, uniforms, resScale=0.5)
//       uniforms: { u_name: number | [x,y] | [x,y,z] | [x,y,z,w] | HTMLImageElement }
//       u_time and u_res are always set. GLSL helpers (noise, fbm) are prepended.
//   drawHero(ctx, x, y, pose) — the chosen spirit with arms + legs (see HERO RIG)
//   glowSprite('r,g,b') → cached soft radial sprite for additive glows
//   rand(a, b), clamp, lerp, TAU
//
//   level (1..10, the Adventure stage = difficulty) · round (true in Adventure)
//   setStars(1..3) — the world's own rating (default: from health left)
// input (per frame): input.left/right/up/down (held booleans),
//   input.ax / input.ay (analog -1..1, stick or keys), input.held[id],
//   input.pressed[id] (went down this frame), input.released[id]
// with controls.touch: input.touch {down, x, y, x0, y0, t} (world px, the live finger),
//   input.taps [{x, y}], input.swipes [{dir: 'left'|'right'|'up'|'down', x, y, dx, dy}],
//   input.releases [{x, y, x0, y0, dt}] — this frame only
// Keyboard: arrows / WASD move, Space or W/↑ = 'jump', J or X = 'attack',
//   K or C = 'special', L or V = 'special2', Esc / P = pause.
//
// Test hooks: window.__dabWorld() → world.debug() + core state;
//   game.html?world=animal (or alien / hell) jumps straight into a world.
// ============================================================================
(function () {
  'use strict';

  const W = 390, H = 844, TAU = Math.PI * 2;
  // screen space (HUD, controls, overlays): portrait 390 x 844, landscape (390 * aspect) x 390
  let SW = W, SH = H;
  const LAND_H = 390;
  const native = () => window.DABNative || null;               // Android app bridge (orientation)
  const wantLandscape = () => { try { return localStorage.getItem('dab_landscape') !== '0'; } catch (e) { return true; } };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = k => k * k * (3 - 2 * k);

  const registry = {};
  const imageCache = {};
  let active = null;           // the running session

  // ── DOM: one overlay layer above every screen inside #app ────────────────
  let layer, cv, ctx;
  function ensureLayer() {
    if (layer) return;
    const app = document.getElementById('app') || document.body;
    layer = document.createElement('div');
    layer.id = 'world-layer';
    layer.style.cssText = 'position:absolute;inset:0;z-index:60;display:none;background:#000;' +
      'touch-action:none;-webkit-user-select:none;user-select:none;';
    cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;';
    layer.appendChild(cv);
    app.appendChild(layer);
    bindPointer();
  }
  function placeLayer(land) {
    const app = document.getElementById('app') || document.body, host = land ? document.body : app;
    if (layer.parentNode !== host) host.appendChild(layer);
    layer.style.position = land ? 'fixed' : 'absolute';
  }
  function dpr() {
    let s = 1;
    if (SW !== W) s = (window.innerHeight || LAND_H) / SH;      // landscape: the canvas fills the window
    else { const app = document.getElementById('app'); s = app ? app.getBoundingClientRect().width / W : 1; }
    return clamp((window.devicePixelRatio || 1) * s, 1, 3);
  }
  function sizeCanvas() {
    const d = Math.min(dpr(), active ? active.dprCap : 3), bw = Math.round(SW * d), bh = Math.round(SH * d);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    ctx = cv.getContext('2d');
    ctx.setTransform(bw / SW, 0, 0, bh / SH, 0, 0);
    return d;
  }
  function appPoint(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * SW / r.width, y: (e.clientY - r.top) * SH / r.height };
  }
  const windowIsLandscape = () => (window.innerWidth || 0) > (window.innerHeight || 1) * 1.15;

  // ── Assets ────────────────────────────────────────────────────────────────
  function loadImage(src) {
    if (imageCache[src]) return imageCache[src].p;
    const img = new Image();
    const p = new Promise(res => {
      img.onload = () => res(img);
      img.onerror = () => { console.warn('[worlds] missing asset', src); res(null); };
    });
    img.decoding = 'async';
    img.src = src;
    imageCache[src] = { img, p };
    return p;
  }
  function loadAll(map, onProgress) {
    const keys = Object.keys(map || {});
    const out = {};
    let done = 0;
    if (!keys.length) { onProgress && onProgress(1); return Promise.resolve(out); }
    return Promise.all(keys.map(k => loadImage(map[k]).then(img => {
      out[k] = img; done++; onProgress && onProgress(done / keys.length);
    }))).then(() => out);
  }

  // ── Glow sprites (additive particles) ────────────────────────────────────
  const glowCache = {};
  function glowSprite(rgb) {
    if (glowCache[rgb]) return glowCache[rgb];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`);
    gr.addColorStop(0.25, `rgba(${rgb},0.55)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (glowCache[rgb] = c);
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  // kinds: 'glow' (additive dot), 'spark' (additive streak along velocity),
  //        'smoke' (soft dark puff that grows), 'debris' (spinning chip, gravity),
  //        'ring' (expanding shockwave ring), 'blood' (droplet: flies, falls, and where it
  //        has a floor it lands as a 'stain' that fades), 'mist' (soft red puff)
  function makeFx() {
    const list = [];
    const fx = {
      list,
      spawn(p) {
        if (list.length > 900) list.shift();
        p.life = p.life || 1; p.age = 0;
        p.vx = p.vx || 0; p.vy = p.vy || 0; p.g = p.g || 0; p.drag = p.drag === undefined ? 0 : p.drag;
        p.size = p.size || 4; p.grow = p.grow || 0; p.rgb = p.rgb || '255,255,255';
        p.alpha = p.alpha === undefined ? 1 : p.alpha; p.rot = p.rot || 0; p.spin = p.spin || 0;
        p.kind = p.kind || 'glow';
        list.push(p);
        return p;
      },
      // burst(x, y, {n, speed, rgb, kind, life, size, g, spread, angle, drag, grow})
      burst(x, y, o) {
        o = o || {};
        const n = o.n || 12;
        for (let i = 0; i < n; i++) {
          const a = (o.angle !== undefined ? o.angle : 0) + (o.spread !== undefined ? (Math.random() - 0.5) * o.spread : Math.random() * TAU);
          const v = (o.speed || 120) * (0.35 + Math.random() * 0.75);
          fx.spawn({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: o.kind || 'spark', rgb: o.rgb || '255,220,150',
            life: (o.life || 0.6) * (0.6 + Math.random() * 0.6), size: (o.size || 3) * (0.6 + Math.random() * 0.8),
            g: o.g || 0, drag: o.drag === undefined ? 1.5 : o.drag, grow: o.grow || 0, alpha: o.alpha,
            spin: (Math.random() - 0.5) * 12, rot: Math.random() * TAU
          });
        }
      },
      // blood(x, y, {dir, spread, n, speed, size, floor, layer}) — a short spurt of droplets
      // thrown along dir (radians), a little red mist, and stains where drops land on floor
      blood(x, y, o) {
        o = o || {};
        const n = o.n || 10, dir = o.dir === undefined ? -Math.PI / 2 : o.dir, spread = o.spread === undefined ? 1.3 : o.spread;
        for (let i = 0; i < n; i++) {
          const a = dir + (Math.random() - 0.5) * spread, v = (o.speed || 210) * (0.3 + Math.random() * 0.9);
          fx.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 900, drag: 0.6, kind: 'blood',
            rgb: Math.random() < 0.5 ? '128,6,10' : '160,16,20', size: (o.size || 2.2) * (0.5 + Math.random() * 0.9),
            life: 0.9 + Math.random() * 0.5, floor: o.floor, layer: o.layer });
        }
        for (let i = 0; i < 2; i++) fx.spawn({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8,
          vx: Math.cos(dir) * 40, vy: Math.sin(dir) * 40, kind: 'mist', rgb: '150,10,14', size: 5 + Math.random() * 4,
          grow: 22, life: 0.35, alpha: 0.5, drag: 3, layer: o.layer });
      },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.age += dt;
          if (p.age >= p.life) { list.splice(i, 1); continue; }
          const d = Math.max(0, 1 - p.drag * dt);
          p.vx *= d; p.vy = p.vy * d + p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.size += p.grow * dt; p.rot += p.spin * dt;
          if (p.kind === 'blood' && p.floor !== undefined && p.vy > 0 && p.y >= p.floor) {
            p.kind = 'stain'; p.y = p.floor; p.vx = p.vy = p.g = 0; p.age = 0; p.life = 2.2 + Math.random();
            p.size *= 1.5 + Math.random(); p.rot = Math.random() * 0.5;
          }
        }
      },
      // layer: draw only particles with p.layer === layer (default undefined = all)
      draw(c, layer, ox, oy) {
        ox = ox || 0; oy = oy || 0;
        for (const p of list) {
          if (layer !== undefined && p.layer !== layer) continue;
          const k = 1 - p.age / p.life, a = p.alpha * (p.fade === 'in-out' ? Math.sin(k * Math.PI) : k);
          const x = p.x - ox, y = p.y - oy;
          if (p.kind === 'smoke') {
            c.globalCompositeOperation = 'source-over';
            const r = p.size;
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${p.rgb},${(a * 0.5).toFixed(3)})`);
            g.addColorStop(1, `rgba(${p.rgb},0)`);
            c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
          } else if (p.kind === 'debris') {
            c.globalCompositeOperation = 'source-over';
            c.save(); c.translate(x, y); c.rotate(p.rot);
            c.fillStyle = `rgba(${p.rgb},${Math.min(1, a * 1.5).toFixed(3)})`;
            c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
            c.restore();
          } else if (p.kind === 'blood') {
            c.globalCompositeOperation = 'source-over';
            const sp = Math.hypot(p.vx, p.vy) || 1, len = clamp(sp * 0.012, 1, 5);
            c.fillStyle = `rgba(${p.rgb},${Math.min(1, a * 1.6).toFixed(3)})`;
            c.save(); c.translate(x, y); c.rotate(Math.atan2(p.vy, p.vx));
            c.beginPath(); c.ellipse(-len / 2, 0, p.size * 0.5 + len, p.size * 0.5, 0, 0, TAU); c.fill();
            c.restore();
          } else if (p.kind === 'stain') {
            c.globalCompositeOperation = 'source-over';
            c.fillStyle = `rgba(90,4,8,${Math.min(0.85, k * 1.4).toFixed(3)})`;
            c.beginPath(); c.ellipse(x, y, p.size, p.size * 0.32, p.rot * 0.2, 0, TAU); c.fill();
          } else if (p.kind === 'mist') {
            c.globalCompositeOperation = 'source-over';
            const r = p.size, g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${p.rgb},${(a * 0.55).toFixed(3)})`); g.addColorStop(1, `rgba(${p.rgb},0)`);
            c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
          } else if (p.kind === 'ring') {
            c.globalCompositeOperation = 'lighter';
            c.beginPath(); c.arc(x, y, p.size, 0, TAU);
            c.strokeStyle = `rgba(${p.rgb},${(a * 0.8).toFixed(3)})`;
            c.lineWidth = 1 + 5 * k; c.stroke();
          } else if (p.kind === 'spark') {
            c.globalCompositeOperation = 'lighter';
            const sp = Math.hypot(p.vx, p.vy) || 1, len = clamp(sp * 0.04, 2, 26) * (0.5 + k * 0.5);
            c.strokeStyle = `rgba(${p.rgb},${a.toFixed(3)})`;
            c.lineWidth = p.size * (0.4 + k * 0.6); c.lineCap = 'round';
            c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx / sp * len, y - p.vy / sp * len); c.stroke();
          } else {
            c.globalCompositeOperation = 'lighter';
            const s = p.size * 4;
            c.globalAlpha = clamp(a, 0, 1);
            c.drawImage(glowSprite(p.rgb), x - s / 2, y - s / 2, s, s);
            c.globalAlpha = 1;
          }
        }
        c.globalCompositeOperation = 'source-over';
      }
    };
    return fx;
  }

  // ── WebGL shader layer (one shared offscreen context) ───────────────────
  const GLSL_LIB = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time; uniform vec2 u_res;
varying vec2 v_uv;
// sin-free hashes (Dave Hoskins): stay random at large world coordinates, unlike fract(sin())
vec3 hash3(vec2 p){ vec3 q=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); q+=dot(q,q.yxz+33.33); return fract((q.xxy+q.yzz)*q.zyx); }
float hash(vec2 p){ vec3 q=fract(vec3(p.xyx)*0.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=0.5; } return v; }
float voronoi(vec2 p){ vec2 i=floor(p), f=fract(p); float d=1.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)); vec2 o=hash3(i+g).xy; d=min(d,length(g+o-f)); } return d; }
`;
  let gl = null, glCanvas = null, glQuad = null, glFailed = false;
  const texCache = new Map();
  function initGL() {
    if (gl || glFailed) return gl;
    try {
      glCanvas = document.createElement('canvas');
      glCanvas.width = 4; glCanvas.height = 4;
      gl = glCanvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false }) ||
           glCanvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }
    if (!gl) { glFailed = true; return null; }
    glQuad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glQuad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return gl;
  }
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[worlds] shader error:\n' + gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  function makeShader(frag) {
    if (!initGL()) return null;
    const vs = compile(gl.VERTEX_SHADER,
      'attribute vec2 a_pos; varying vec2 v_uv; void main(){ v_uv=a_pos*0.5+0.5; gl_Position=vec4(a_pos,0.0,1.0); }');
    const fs = compile(gl.FRAGMENT_SHADER, GLSL_LIB + frag);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('[worlds] link error', gl.getProgramInfoLog(p)); return null; }
    return { p, loc: {}, a: gl.getAttribLocation(p, 'a_pos') };
  }
  function texFor(img) {
    let t = texCache.get(img);
    if (t) return t;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    texCache.set(img, t);
    return t;
  }
  function drawShader(c, prog, x, y, w, h, uniforms, resScale) {
    if (!prog || !gl) return false;
    const s = (resScale || 0.5) * (active ? active.dpr : 1);
    const pw = Math.max(2, Math.round(w * s)), ph = Math.max(2, Math.round(h * s));
    if (glCanvas.width !== pw || glCanvas.height !== ph) { glCanvas.width = pw; glCanvas.height = ph; }
    gl.viewport(0, 0, pw, ph);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, glQuad);
    gl.enableVertexAttribArray(prog.a);
    gl.vertexAttribPointer(prog.a, 2, gl.FLOAT, false, 0, 0);
    const all = Object.assign({ u_time: active ? active.t : 0, u_res: [w, h] }, uniforms || {});
    let unit = 0;
    for (const k in all) {
      let loc = prog.loc[k];
      if (loc === undefined) loc = prog.loc[k] = gl.getUniformLocation(prog.p, k);
      if (loc === null) continue;
      const v = all[k];
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v && v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v && v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else if (v && v.length === 4) gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
      else if (v && (v instanceof HTMLImageElement || v instanceof HTMLCanvasElement)) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texFor(v));
        gl.uniform1i(loc, unit++);
      }
    }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    c.drawImage(glCanvas, x, y, w, h);
    return true;
  }

  // ── HERO RIG: the chosen spirit with arms and legs ──────────────────────
  // drawHero(ctx, x, y, pose)   (x, y) = point between the feet on the ground
  //   pose.scale     1 = ~70 px tall hero (spirit body ~44 px + legs)
  //   pose.facing    1 right / -1 left
  //   pose.run       0..1 run speed (drives the stride), pose.phase = stride phase (radians)
  //   pose.air       true while airborne · pose.vy (px/s) for tuck / fall pose
  //   pose.weapon    'sword' | 'bow' | null
  //   pose.attack    0..1 progress of a sword slash (0 = none)
  //   pose.draw      0..1 bow draw (0 = relaxed) · pose.aim (radians, + = up)
  //   pose.hurt      0..1 knock-back flinch · pose.grabbed true = dangling (eagle)
  //   pose.block     true = guard pose · pose.t (seconds) for idle motion
  //   pose.charId    which spirit (defaults to the session's)
  //   hero metrics for hit boxes: DABWorlds.HERO = { height, swordReach }
  const HERO = { height: 70, swordReach: 58, bodyY: -42 };

  // two-bone IK: shoulder (sx,sy) reaching (tx,ty); bend = +1 elbow down/back, -1 up
  function ik(sx, sy, tx, ty, L1, L2, bend) {
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
    const maxD = L1 + L2 - 0.01;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    const a = Math.atan2(dy, dx);
    const cosE = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d || 1), -1, 1);
    const e = a + bend * Math.acos(cosE);
    return { ex: sx + Math.cos(e) * L1, ey: sy + Math.sin(e) * L1, hx: sx + dx, hy: sy + dy };
  }

  function limb(c, x0, y0, x1, y1, x2, y2, w0, w1, colA, colB, hl) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = colA; c.lineWidth = w0;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = colB; c.lineWidth = w1;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    if (hl) {                                   // soft rim light along the limb
      c.strokeStyle = hl; c.lineWidth = Math.max(1, w1 * 0.28);
      c.beginPath(); c.moveTo(x0 + 1.2, y0 - 1); c.lineTo(x1 + 1.2, y1 - 1); c.lineTo(x2 + 1, y2 - 1); c.stroke();
    }
  }

  function drawHero(c, x, y, pose) {
    pose = pose || {};
    const s = pose.scale || 1, f = pose.facing || 1, t = pose.t !== undefined ? pose.t : (active ? active.t : 0);
    const charId = pose.charId || (active ? active.charId : (window.DABWorlds && DABWorlds.__charOverride) || 'spirit');
    const chE = window.SPIRIT_CHARS && SPIRIT_CHARS[charId];
    const col = chE && chE.col ? chE.col : [93, 202, 165];
    const rgb = col.join(',');
    const shade = k => `rgb(${col.map(v => Math.round(v * k)).join(',')})`;
    const legA = shade(0.42), legB = shade(0.34), armA = shade(0.62), armB = shade(0.55);
    const hl = `rgba(${col.map(v => Math.min(255, v + 70)).join(',')},0.45)`;
    const run = clamp(pose.run || 0, 0, 1), ph = pose.phase || 0;
    const air = !!pose.air, grabbed = !!pose.grabbed, hurt = clamp(pose.hurt || 0, 0, 1);
    const atk = pose.attack || 0, weapon = pose.weapon || null;

    c.save();
    c.translate(x, y);
    c.scale(s * f, s);

    if (!air && !grabbed) {                      // contact shadow
      c.save(); c.scale(1, 0.22);
      const sg = c.createRadialGradient(0, 0, 0, 0, 0, 24);
      sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg; c.fillRect(-24, -24, 48, 48); c.restore();
    }

    const bob = air || grabbed ? 0 : run > 0.05 ? -Math.abs(Math.cos(ph)) * 2.6 * run : Math.sin(t * 2.2) * 0.8;
    const hipY = -27 + bob;
    c.rotate(run * 0.1 - hurt * 0.28);

    // ── legs ──
    const L = 13;
    const legTarget = side => {                   // foot target relative to the hip
      const sw = side ? 0 : Math.PI, hx = side ? 4.5 : -4.5;
      if (grabbed) return { hx, fx: hx + Math.sin(t * 7 + sw) * 5, fy: hipY + 22 + Math.cos(t * 7 + sw) * 3 };
      if (air) {
        const up = (pose.vy || 0) < 0;
        return side ? { hx, fx: hx + (up ? 7 : 4), fy: hipY + (up ? 15 : 22) }
                    : { hx, fx: hx - (up ? 6 : 3), fy: hipY + (up ? 20 : 24) };
      }
      if (run > 0.05) {
        const p = ph + sw, stride = 14 * run;
        const lift = Math.max(0, Math.sin(p)) * 10 * run;
        return { hx, fx: hx + Math.cos(p) * stride, fy: -bob - lift + hipY + 27 - 0.5 };
      }
      return { hx, fx: hx + (side ? 2 : -2), fy: hipY + 26.5 - bob };
    };
    const drawLeg = side => {
      const g = legTarget(side);
      const k = ik(g.hx, hipY + 2, g.fx, g.fy, L, L, -1);   // knees bend forward
      limb(c, g.hx, hipY + 2, k.ex, k.ey, k.hx, k.hy, 7.5, 6.2, side ? legA : legB, side ? legA : legB, side ? hl : null);
      // boot
      c.save(); c.translate(k.hx, k.hy);
      const bg = c.createLinearGradient(0, -4, 0, 4);
      bg.addColorStop(0, '#5a4130'); bg.addColorStop(1, '#1f150d');
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(-3.5, -3.5); c.lineTo(3.5, -3.5); c.quadraticCurveTo(9.5, -1.5, 9, 2.6); c.lineTo(-4.2, 2.8); c.closePath(); c.fill();
      c.restore();
    };

    // ── arm targets (hand positions) + sword angle ──
    const bodyY = hipY - 15;                      // spirit body centre
    const shF = { x: 11, y: bodyY + 2 }, shB = { x: -10, y: bodyY + 1 };
    const AL = 10.5;
    let hF, hB, blade = 1.15, slashA0 = null, slashA1 = null;
    const swing = Math.sin(ph) * run;
    if (grabbed) {
      hF = { x: 6 + Math.sin(t * 9) * 4, y: bodyY - 22 }; hB = { x: -5, y: bodyY - 21 };
      blade = -1.2 + Math.sin(t * 9) * 0.6;
    } else if (weapon === 'sword' && atk > 0) {
      // wind-up (0-.25) → overhead-to-forward arc (.25-.7) → follow through
      const w = clamp(atk / 0.25, 0, 1), sk = ease(clamp((atk - 0.25) / 0.45, 0, 1)), back = clamp((atk - 0.7) / 0.3, 0, 1);
      const angOf = k => lerp(-2.35, 0.95, k);
      const a = atk < 0.25 ? lerp(1.15, -2.35, ease(w)) : atk < 0.7 ? angOf(sk) : lerp(0.95, 1.15, back);
      blade = a;
      const r = 17;
      hF = { x: shF.x + Math.cos(a) * r * 0.8, y: shF.y + Math.sin(a) * r * 0.85 };
      if (atk >= 0.25 && atk < 0.85) { slashA1 = angOf(sk); slashA0 = angOf(Math.max(0, sk - 0.55)); }
      hB = { x: -9, y: bodyY + 12 };
    } else if (weapon === 'sword' && pose.block) {
      hF = { x: 15, y: bodyY - 4 }; blade = -1.45; hB = { x: -8, y: bodyY + 10 };
    } else if (weapon === 'bow') {
      const aim = pose.aim || 0, dr = pose.draw || 0;
      const ax = Math.cos(-aim), ay = Math.sin(-aim);
      hF = { x: shF.x + ax * 19, y: shF.y + ay * 19 };
      const pull = 4 + dr * 15;
      hB = { x: hF.x - ax * pull, y: hF.y - ay * pull };
    } else if (air) {
      hF = { x: 15, y: bodyY - 9 }; hB = { x: -15, y: bodyY - 6 }; blade = -0.5;
    } else {
      hF = { x: 13 + swing * -6, y: bodyY + 14 - Math.abs(swing) * 2 };
      hB = { x: -11 + swing * 6, y: bodyY + 14 };
      blade = 1.1 + swing * 0.15 + Math.sin(t * 2) * 0.03;
    }
    if (hurt > 0) { hF.x -= hurt * 10; hF.y -= hurt * 10; hB.x -= hurt * 6; hB.y -= hurt * 12; }

    // back arm, back leg, body, front leg, front arm, weapon
    const kb = ik(shB.x, shB.y, hB.x, hB.y, AL, AL, weapon === 'bow' ? -1 : 1);
    limb(c, shB.x, shB.y, kb.ex, kb.ey, kb.hx, kb.hy, 5.8, 5, armB, armB, null);
    c.fillStyle = armA; c.beginPath(); c.arc(kb.hx, kb.hy, 3.4, 0, TAU); c.fill();
    drawLeg(false);

    if (window.drawSpirit) {
      const st = run > 0.3 && !air ? 'MOVING' : 'IDLE';
      c.save();
      c.scale(f, 1);                               // keep the face unmirrored
      // drawSpirit's (x, y) is its contact point; the body centre sits 16·scale above it
      drawSpirit(c, 0, bodyY + 11.8, t, st, charId,
        { scale: 0.74, land: true, vx: run * 2.2 * f, vy: air ? clamp((pose.vy || 0) / 260, -2, 2) : 0 });
      c.restore();
    }

    drawLeg(true);

    if (slashA0 !== null) drawSlash(c, shF.x, shF.y, slashA0, slashA1, rgb, atk);
    const kf = ik(shF.x, shF.y, hF.x, hF.y, AL, AL, weapon === 'bow' ? 1 : 1);
    limb(c, shF.x, shF.y, kf.ex, kf.ey, kf.hx, kf.hy, 6.2, 5.4, armA, armA, hl);
    if (weapon === 'sword') drawSword(c, kf.hx, kf.hy, blade);
    if (weapon === 'bow') drawBow(c, kf.hx, kf.hy, kb.hx, kb.hy, pose.aim || 0, pose.draw || 0);
    c.fillStyle = `rgb(${rgb})`; c.beginPath(); c.arc(kf.hx, kf.hy, 3.7, 0, TAU); c.fill();

    c.restore();
  }

  // glowing crescent swept by the blade between angles a0 → a1 around the shoulder
  function drawSlash(c, sx, sy, a0, a1, rgb, atk) {
    if (a1 - a0 < 0.05) return;
    const r0 = 18, r1 = 60, fade = 1 - clamp((atk - 0.55) / 0.3, 0, 1);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(sx, sy, r0, sx, sy, r1);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.55, `rgba(${rgb},${(0.35 * fade).toFixed(3)})`);
    g.addColorStop(0.92, `rgba(255,255,255,${(0.75 * fade).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(sx, sy, r1, a0, a1);
    c.arc(sx, sy, r0 + (r1 - r0) * 0.45, a1, a0 + (a1 - a0) * 0.35, true);
    c.closePath(); c.fill();
    c.restore();
  }

  function drawSword(c, hx, hy, a) {
    c.save(); c.translate(hx, hy); c.rotate(a);
    // pommel + grip behind the hand
    c.fillStyle = '#3b2a1c'; c.fillRect(-7, -1.7, 8, 3.4);
    c.fillStyle = '#d9b35c'; c.beginPath(); c.arc(-7.5, 0, 2.2, 0, TAU); c.fill();
    // cross-guard
    const gg = c.createLinearGradient(0, -6, 0, 6);
    gg.addColorStop(0, '#f8dc8a'); gg.addColorStop(1, '#8a6420');
    c.fillStyle = gg; c.fillRect(1.5, -6, 2.8, 12);
    // blade
    const bl = c.createLinearGradient(0, -2.6, 0, 2.6);
    bl.addColorStop(0, '#f7faff'); bl.addColorStop(0.45, '#c3ccd8'); bl.addColorStop(0.55, '#7f8999'); bl.addColorStop(1, '#e3e9f2');
    c.fillStyle = bl;
    c.beginPath(); c.moveTo(4.3, -2.5); c.lineTo(39, -1.9); c.lineTo(45, 0); c.lineTo(39, 1.9); c.lineTo(4.3, 2.5); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(6, -0.3); c.lineTo(40, -0.3); c.stroke();
    const gx = 6 + ((active ? active.t : 0) * 55 % 60);
    if (gx < 43) { c.globalCompositeOperation = 'lighter'; c.drawImage(glowSprite('255,255,255'), gx - 5, -5, 10, 10); c.globalCompositeOperation = 'source-over'; }
    c.restore();
  }

  // bow held at (bx,by), string pulled to (px,py)
  function drawBow(c, bx, by, px, py, aim, draw) {
    const ax = Math.cos(-aim), ay = Math.sin(-aim), nx = -ay, ny = ax;   // aim dir + its normal
    const bend = 6 + draw * 3;
    const tip1 = { x: bx + nx * 22 - ax * (4 + draw * 3), y: by + ny * 22 - ay * (4 + draw * 3) };
    const tip2 = { x: bx - nx * 22 - ax * (4 + draw * 3), y: by - ny * 22 - ay * (4 + draw * 3) };
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = '#5a3a1e'; c.lineWidth = 3.2;
    c.beginPath(); c.moveTo(tip1.x, tip1.y);
    c.quadraticCurveTo(bx + nx * 12 + ax * bend, by + ny * 12 + ay * bend, bx, by);
    c.quadraticCurveTo(bx - nx * 12 + ax * bend, by - ny * 12 + ay * bend, tip2.x, tip2.y); c.stroke();
    c.strokeStyle = 'rgba(255,220,170,0.4)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(tip1.x, tip1.y); c.quadraticCurveTo(bx + nx * 12 + ax * bend, by + ny * 12 + ay * bend, bx, by); c.stroke();
    // string to the pulling hand
    c.strokeStyle = 'rgba(235,235,225,0.9)'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(tip1.x, tip1.y); c.lineTo(px, py); c.lineTo(tip2.x, tip2.y); c.stroke();
    if (draw > 0.05) {                             // nocked arrow
      const ex = bx + ax * 18, ey = by + ay * 18;
      c.strokeStyle = '#c9a26a'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(px, py); c.lineTo(ex, ey); c.stroke();
      c.fillStyle = '#d8dde4';
      c.beginPath(); c.moveTo(ex + nx * 2.6, ey + ny * 2.6); c.lineTo(ex + ax * 6, ey + ay * 6); c.lineTo(ex - nx * 2.6, ey - ny * 2.6); c.closePath(); c.fill();
      c.fillStyle = '#c0392b';
      c.beginPath(); c.moveTo(px, py); c.lineTo(px - ax * 5 + nx * 3, py - ay * 5 + ny * 3); c.lineTo(px + ax * 1, py + ay * 1); c.lineTo(px - ax * 5 - nx * 3, py - ay * 5 - ny * 3); c.closePath(); c.fill();
      if (draw > 0.95) {
        c.globalCompositeOperation = 'lighter';
        c.drawImage(glowSprite('255,200,120'), ex - 8, ey - 8, 16, 16);
        c.globalCompositeOperation = 'source-over';
      }
    }
    c.restore();
  }

  // ── SPRITE HERO: a pre-rendered 3D swordsman (tools/hero/*) ─────────────
  // assets/hero/<set>/hero.json + WebP sheets, rendered from a rigged model with
  // tools/hero/make_sheets.js + pack_sheets.py. A world opts in with def.hero =
  // 'day' | 'hell' (lighting variant) and draws it with env.hero.draw(). When a
  // set is missing (or fetch fails, e.g. file://), env.hero.ready stays false and
  // the world keeps using env.drawHero (the drawn rig).
  const heroSets = {};
  let rosterP = null;
  function loadRoster() {
    if (!rosterP) rosterP = fetch('assets/hero/roster.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    return rosterP;
  }
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  function loadHeroSet(set) {
    if (heroSets[set]) return heroSets[set].p;
    const H = { set, ready: false, meta: null, sheets: [] };
    const base = `assets/hero/${set}/`;
    H.p = fetch(base + 'hero.json').then(r => (r.ok ? r.json() : null)).then(meta => {
      if (!meta) return H;
      return Promise.all(meta.sheets.map(n => loadImage(base + n).then(img => (img && img.decode ? img.decode().then(() => img, () => img) : img))))
        .then(imgs => { if (imgs.every(Boolean)) { H.meta = meta; H.sheets = imgs; H.ready = true; } return H; });
    }).catch(() => H);
    heroSets[set] = H;
    return H.p;
  }
  function heroFrameIndex(an, t) {
    const n = an.f.length, f = Math.floor(Math.max(0, t) * an.fps);
    if (an.loop) return f % n;
    if (an.pingpong && n > 1) { const p = f % (2 * n - 2); return p < n ? p : 2 * n - 2 - p; }
    return Math.min(n - 1, f);
  }
  function heroFrame(H, name, t) {
    const an = H.meta.anims[name] || H.meta.anims.idle;
    return an.f[heroFrameIndex(an, t)];
  }
  function makeHeroApi(H) {
    return {
      get ready() { return !!(H && H.ready); },
      has(name) { return !!(H && H.ready && H.meta.anims[name]); },
      // seconds a non-looping animation takes
      dur(name) { const an = H && H.ready && H.meta.anims[name]; return an ? an.f.length / an.fps : 0; },
      // draw at the feet point (x, y). o: { anim, t (s into the anim), facing (1 right / -1 left),
      //   height (app px of the standing hero, default 110), flash 0..1 (hit flash),
      //   alpha, rot (radians, around the feet), shadow (default true) }
      draw(c, x, y, o) {
        if (!H || !H.ready) return false;
        o = o || {};
        const rec = heroFrame(H, o.anim || 'idle', o.t || 0);
        const k = (o.height || 110) / H.meta.charPx, f = o.facing || 1;
        const [s, sx, sy, w, h, ax, ay] = rec;
        const sheet = H.sheets[s];
        c.save();
        if (o.shadow !== false) {
          c.globalAlpha = 0.5 * (o.alpha === undefined ? 1 : o.alpha);
          const sw = (o.height || 110) * 0.62;
          c.drawImage(shadowSprite(), x - sw / 2, y - sw * 0.09, sw, sw * 0.18);
          c.globalAlpha = 1;
        }
        c.translate(x, y);
        if (o.rot) c.rotate(o.rot);
        c.scale(f * k, k);
        if (o.alpha !== undefined) c.globalAlpha = o.alpha;
        c.drawImage(sheet, sx, sy, w, h, -ax, -ay, w, h);
        if (o.flash > 0) {                          // hit flash: the same frame added on top
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = Math.min(1, o.flash) * 0.85;
          c.drawImage(sheet, sx, sy, w, h, -ax, -ay, w, h);
        }
        c.restore();
        return true;
      },
      // a named point of the frame drawn for o (e.g. the archer's 'tip' / 'nock' / 'grip'), as an
      // offset from the feet in app px, mirrored with o.facing — null if the frame has none
      point(o, name) {
        const an = H && H.ready && H.meta.anims[o.anim || 'idle'];
        if (!an || !an.p) return null;
        const q = an.p[heroFrameIndex(an, o.t || 0)], v = q && q[name];
        if (!v) return null;
        const k = (o.height || 110) / H.meta.charPx;
        return { x: v[0] * k * (o.facing || 1), y: v[1] * k };
      },
      // anim names (to find e.g. every hold_<aim> variant)
      names() { return H && H.ready ? Object.keys(H.meta.anims) : []; },
      // touch every sheet once so the first attack doesn't stall on a texture upload
      warm(c) { if (H && H.ready) for (const sh of H.sheets) c.drawImage(sh, 0, 0, 1, 1, -10, -10, 1, 1); }
    };
  }
  // ── PHOTO RIGS: creatures baked from one photo with a skinned skeleton (tools/assets/rigs) ──
  // <base>.json + <base>_N.webp (+ <base>_glow_N.webp), frames in the hero-sheet layout
  // [sheet, sx, sy, w, h, ax, ay] with (ax, ay) = the rig's anchor (ground under it / a flyer's centre).
  // A world lists them in def.rigs { name: 'assets/worlds/<w>/rig/<name>' } and draws with env.rigs[name];
  // a missing rig gives ready === false and the world keeps its old drawing.
  const rigCache = {};
  function loadRig(base) {
    if (rigCache[base]) return rigCache[base];
    const dir = base.slice(0, base.lastIndexOf('/') + 1);
    const R = { ready: false, meta: null, sheets: [], glow: [] };
    rigCache[base] = fetch(base + '.json').then(r => (r.ok ? r.json() : null)).then(meta => {
      if (!meta) return makeRigApi(R);
      const names = meta.sheets.concat(meta.glow || []);
      return Promise.all(names.map(n => loadImage(dir + n).then(img => (img && img.decode ? img.decode().then(() => img, () => img) : img))))
        .then(imgs => {
          if (imgs.every(Boolean)) { R.meta = meta; R.sheets = imgs.slice(0, meta.sheets.length); R.glow = imgs.slice(meta.sheets.length); R.ready = true; }
          return makeRigApi(R);
        });
    }).catch(() => makeRigApi(R));
    return rigCache[base];
  }
  function rigFrameIndex(an, o) {
    const n = an.f.length;
    if (o.u !== undefined) return ((Math.floor(o.u * n) % n) + n) % n;                      // loop position 0..1
    if (o.k !== undefined) return Math.max(0, Math.min(n - 1, Math.round(o.k * (n - 1))));  // progress 0..1
    const f = Math.floor(Math.max(0, o.t || 0) * an.fps);
    return an.loop ? f % n : Math.min(n - 1, f);
  }
  function makeRigApi(R) {
    const anim = name => (R.ready ? R.meta.anims[name] || R.meta.anims[Object.keys(R.meta.anims)[0]] : null);
    return {
      get ready() { return R.ready; },
      has(name) { return !!(R.ready && R.meta.anims[name]); },
      dur(name) { const an = R.ready && R.meta.anims[name]; return an ? an.f.length / an.fps : 0; },
      stride(name) { const an = R.ready && R.meta.anims[name]; return (an && an.stride) || 0; },   // photo px per loop
      // draw at the anchor (x, y). o: { anim, u (loop 0..1) | k (progress 0..1) | t (s), scale (app px per
      //   photo px), flip (mirror the photo), alpha, rot (radians about the anchor), glow (additive glow
      //   layer strength, >1 stacks), flash (0..1 additive hit flash) }
      draw(c, x, y, o) {
        const an = anim(o.anim);
        if (!an) return false;
        const [s, sx, sy, w, h, ax, ay] = an.f[rigFrameIndex(an, o)];
        const k = (o.scale || 1) / R.meta.S, a0 = o.alpha === undefined ? 1 : o.alpha;
        c.save();
        c.translate(x, y);
        if (o.rot) c.rotate(o.rot);
        c.scale(o.flip ? -k : k, k);
        c.globalAlpha = a0;
        c.drawImage(R.sheets[s], sx, sy, w, h, -ax, -ay, w, h);
        c.globalCompositeOperation = 'lighter';
        if (o.glow > 0 && R.glow[s]) {
          for (let g = o.glow; g > 0.01; g -= 1) { c.globalAlpha = Math.min(1, g) * a0; c.drawImage(R.glow[s], sx, sy, w, h, -ax, -ay, w, h); }
        }
        if (o.flash > 0) { c.globalAlpha = Math.min(1, o.flash) * a0; c.drawImage(R.sheets[s], sx, sy, w, h, -ax, -ay, w, h); }
        c.restore();
        return true;
      },
      // a named point of that frame (eyes, talons...) as an offset from the anchor in app px
      point(o, name) {
        const an = anim(o.anim);
        if (!an || !an.p) return null;
        const v = an.p[rigFrameIndex(an, o)][name];
        if (!v) return null;
        const sc = o.scale || 1;
        let px = v[0] * sc * (o.flip ? -1 : 1), py = v[1] * sc;
        if (o.rot) { const cr = Math.cos(o.rot), sr = Math.sin(o.rot); [px, py] = [px * cr - py * sr, px * sr + py * cr]; }
        return { x: px, y: py };
      },
      warm(c) { if (R.ready) for (const sh of R.sheets.concat(R.glow)) c.drawImage(sh, 0, 0, 1, 1, -10, -10, 1, 1); },
      // the same rig drawn from re-coloured sheets (fn(img) -> canvas), e.g. an underwater tint
      variant(fn) { return makeRigApi(R.ready ? Object.assign({}, R, { sheets: R.sheets.map(fn) }) : R); }
    };
  }

  let shadowCv = null;
  function shadowSprite() {
    if (shadowCv) return shadowCv;
    shadowCv = document.createElement('canvas'); shadowCv.width = 128; shadowCv.height = 32;
    const g = shadowCv.getContext('2d');
    const gr = g.createRadialGradient(64, 16, 0, 64, 16, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(1, 0, 0, 0.25, 0, 12); g.fillStyle = gr; g.fillRect(0, -64, 128, 128);
    return shadowCv;
  }

  // ── Controller (canvas-drawn, multi-touch) ───────────────────────────────
  const BTN_POS = [
    { x: 322, y: 744, r: 40 },     // primary (e.g. attack / fire)
    { x: 240, y: 790, r: 33 },     // secondary (e.g. jump)
    { x: 300, y: 658, r: 28 },     // tertiary (e.g. missile)
    { x: 222, y: 700, r: 26 }
  ];
  const DPAD = { lr: [{ id: 'left', x: 50, y: 770, r: 36 }, { id: 'right', x: 132, y: 770, r: 36 }] };
  const STICK = { x: 92, y: 752, r: 62 };
  // landscape: stick bottom-left, attack cluster bottom-right (thumbs on the corners)
  const L_BTN = () => [
    { x: SW - 92, y: SH - 96, r: 42 }, { x: SW - 196, y: SH - 58, r: 34 }, { x: SW - 82, y: SH - 206, r: 30 }, { x: SW - 186, y: SH - 160, r: 27 }];
  const L_STICK = () => ({ x: 118, y: SH - 104, r: 62 });
  const btnPos = () => (SW !== W ? L_BTN() : BTN_POS);
  const stickPos = () => (SW !== W ? L_STICK() : STICK);
  const pausePos = () => (SW !== W ? { x: SW - 34, y: 34 } : { x: 362, y: 46 });

  function makeInput() {
    return {
      left: false, right: false, up: false, down: false, ax: 0, ay: 0,
      held: {}, pressed: {}, released: {},
      touch: { down: false }, taps: [], swipes: [], releases: []
    };
  }

  function bindPointer() {
    const down = e => {
      if (!active) return;
      e.preventDefault();
      const p = appPoint(e);
      if (active.phase === 'intro') {
        const pid = active.portraitAt(p);
        if (pid) { active.pickHero(pid); return; }
        if (active.def.landscape && p.y > 650 && p.y < 700 && Math.abs(p.x - W / 2) < 120) { active.toggleLand(); return; }
        if (active.ready && !active.heroLoading && (!active.roster.length || p.y > 704)) active.startPlay();
        return;
      }
      if (active.phase === 'rotate') { if (p.y > SH * 0.62) active.beginWorld(false); return; }   // "play in portrait instead"
      if (active.phase === 'result') { if (active.resultT > 0.9) active.finish(); return; }
      if (active.paused) { active.pauseTap(p); return; }
      const pp = pausePos();
      if (Math.hypot(p.x - pp.x, p.y - pp.y) < 26) { active.paused = true; if (window.DABAudio) DABAudio.duck(true); return; }
      let hit = active.hitControl(p);
      if (!hit && active.controls.touch) {                       // the play field itself
        const q = active.toWorld(p);
        hit = { kind: 'field', x: q.x, y: q.y, x0: q.x, y0: q.y, t0: performance.now() };
      }
      if (hit) {
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
        active.pointers.set(e.pointerId, hit);
        if (hit.kind === 'stick') active.stickMove(hit, p);
        active.updateTouchInput();
      }
    };
    const move = e => {
      if (!active) return;
      const hit = active.pointers.get(e.pointerId);
      if (!hit) return;
      const p = appPoint(e);
      if (hit.kind === 'stick') active.stickMove(hit, p);
      else if (hit.kind === 'field') { const q = active.toWorld(p); hit.x = q.x; hit.y = q.y; }
      else if (hit.kind === 'dir') {                 // slide between ◀ and ▶
        const nh = active.hitControl(p, true);
        if (nh && nh.kind === 'dir') active.pointers.set(e.pointerId, nh);
      }
      active.updateTouchInput();
    };
    const up = e => {
      if (!active) return;
      const hit = active.pointers.get(e.pointerId);
      if (hit && hit.kind === 'field') active.fieldUp(hit);
      if (active.pointers.delete(e.pointerId)) active.updateTouchInput();
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }

  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
    ' ': 'jump', j: 'attack', J: 'attack', x: 'attack', X: 'attack',
    k: 'special', K: 'special', c: 'special', C: 'special', l: 'special2', L: 'special2', v: 'special2', V: 'special2'
  };
  const keysDown = new Set();
  addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (active.phase === 'play') { active.paused = !active.paused; if (window.DABAudio) DABAudio.duck(active.paused); } return; }
    if (active.phase === 'intro' && active.roster.length && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const i = active.roster.findIndex(h => h.id === active.heroId), n = active.roster.length;
      active.pickHero(active.roster[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n].id); e.preventDefault(); return;
    }
    if (active.phase === 'intro' && active.ready && (e.key === ' ' || e.key === 'Enter')) { active.startPlay(); e.preventDefault(); return; }
    if (active.phase === 'rotate' && (e.key === ' ' || e.key === 'Enter')) { active.beginWorld(false); e.preventDefault(); return; }
    if (active.phase === 'result' && active.resultT > 0.9 && (e.key === ' ' || e.key === 'Enter')) { active.finish(); e.preventDefault(); return; }
    const k = KEYMAP[e.key];
    if (k) { keysDown.add(k); e.preventDefault(); }
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) keysDown.delete(k); });

  // ── Icons for the buttons ─────────────────────────────────────────────────
  function icon(c, name, x, y, r) {
    c.save(); c.translate(x, y);
    c.strokeStyle = 'rgba(255,255,255,0.92)'; c.fillStyle = 'rgba(255,255,255,0.92)';
    c.lineWidth = r * 0.12; c.lineCap = 'round'; c.lineJoin = 'round';
    const u = r * 0.5;
    switch (name) {
      case 'left': case 'right': case 'up': case 'down': {
        const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[name];
        c.rotate(rot); c.beginPath(); c.moveTo(-u * 0.45, -u * 0.75); c.lineTo(u * 0.55, 0); c.lineTo(-u * 0.45, u * 0.75); c.closePath(); c.fill(); break;
      }
      case 'jump':
        c.beginPath(); c.moveTo(-u * 0.8, u * 0.3); c.lineTo(0, -u * 0.6); c.lineTo(u * 0.8, u * 0.3); c.stroke();
        c.beginPath(); c.moveTo(-u * 0.6, u * 0.85); c.lineTo(u * 0.6, u * 0.85); c.stroke(); break;
      case 'sword':
        c.rotate(-Math.PI / 4);
        c.beginPath(); c.moveTo(0, -u * 1.05); c.lineTo(u * 0.18, -u * 0.8); c.lineTo(u * 0.18, u * 0.35); c.lineTo(-u * 0.18, u * 0.35); c.lineTo(-u * 0.18, -u * 0.8); c.closePath(); c.fill();
        c.fillRect(-u * 0.5, u * 0.35, u, u * 0.14); c.fillRect(-u * 0.09, u * 0.45, u * 0.18, u * 0.5); break;
      case 'bow':
        c.beginPath(); c.arc(-u * 0.5, 0, u * 0.95, -1.1, 1.1); c.stroke();
        c.lineWidth = r * 0.05; c.beginPath(); c.moveTo(-u * 0.5 + Math.cos(-1.1) * u * 0.95, Math.sin(-1.1) * u * 0.95); c.lineTo(-u * 0.5 + Math.cos(1.1) * u * 0.95, Math.sin(1.1) * u * 0.95); c.stroke();
        c.lineWidth = r * 0.08; c.beginPath(); c.moveTo(-u * 0.3, 0); c.lineTo(u * 0.95, 0); c.stroke();
        c.beginPath(); c.moveTo(u * 0.95, 0); c.lineTo(u * 0.6, -u * 0.25); c.moveTo(u * 0.95, 0); c.lineTo(u * 0.6, u * 0.25); c.stroke(); break;
      case 'fire':
        for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * u * 0.45, u * 0.6); c.lineTo(i * u * 0.45, -u * 0.7); c.stroke(); }
        break;
      case 'missile':
        c.rotate(-Math.PI / 2);
        c.beginPath(); c.moveTo(u, 0); c.quadraticCurveTo(u * 0.6, -u * 0.32, -u * 0.5, -u * 0.25); c.lineTo(-u * 0.5, u * 0.25); c.quadraticCurveTo(u * 0.6, u * 0.32, u, 0); c.fill();
        c.beginPath(); c.moveTo(-u * 0.3, -u * 0.25); c.lineTo(-u * 0.75, -u * 0.6); c.lineTo(-u * 0.6, 0); c.lineTo(-u * 0.75, u * 0.6); c.lineTo(-u * 0.3, u * 0.25); c.fill(); break;
      case 'shield':
        c.beginPath(); c.moveTo(0, -u * 0.9); c.lineTo(u * 0.75, -u * 0.55); c.quadraticCurveTo(u * 0.7, u * 0.5, 0, u * 0.95); c.quadraticCurveTo(-u * 0.7, u * 0.5, -u * 0.75, -u * 0.55); c.closePath(); c.stroke(); break;
      case 'snow':                                              // snowflake (frost breath)
        for (let i = 0; i < 3; i++) {
          c.save(); c.rotate(i * Math.PI / 3);
          c.beginPath(); c.moveTo(0, -u * 0.95); c.lineTo(0, u * 0.95);
          for (const s of [-1, 1]) { c.moveTo(0, s * u * 0.55); c.lineTo(u * 0.28, s * u * 0.8); c.moveTo(0, s * u * 0.55); c.lineTo(-u * 0.28, s * u * 0.8); }
          c.stroke(); c.restore();
        }
        break;
      case 'restart':                                           // circular arrow
        c.beginPath(); c.arc(0, 0, u * 0.7, -0.4, Math.PI * 1.55); c.stroke();
        c.beginPath(); c.moveTo(u * 0.7 * Math.cos(-0.4) + u * 0.3, u * 0.7 * Math.sin(-0.4) - u * 0.05); c.lineTo(u * 0.7 * Math.cos(-0.4), u * 0.7 * Math.sin(-0.4)); c.lineTo(u * 0.7 * Math.cos(-0.4) - u * 0.12, u * 0.7 * Math.sin(-0.4) - u * 0.4); c.stroke();
        break;
      case 'fist':
        c.beginPath(); c.roundRect(-u * 0.62, -u * 0.5, u * 1.2, u * 0.95, u * 0.3); c.fill();
        c.fillRect(-u * 0.75, -u * 0.05, u * 0.32, u * 0.55);
        c.strokeStyle = 'rgba(10,14,22,0.6)'; c.lineWidth = r * 0.05;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-u * 0.3 + i * u * 0.3, -u * 0.5); c.lineTo(-u * 0.3 + i * u * 0.3, -u * 0.12); c.stroke(); }
        break;
      case 'star':
        c.beginPath();
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? u * 0.42 : u * 0.95; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fill(); break;
      case 'bomb':
        c.beginPath(); c.arc(0, u * 0.15, u * 0.62, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(u * 0.35, -u * 0.35); c.quadraticCurveTo(u * 0.6, -u * 0.95, u * 0.95, -u * 0.7); c.stroke(); break;
      case 'dig':
        c.rotate(Math.PI / 4); c.fillRect(-u * 0.08, -u * 0.95, u * 0.16, u * 1.2);
        c.beginPath(); c.moveTo(-u * 0.45, u * 0.25); c.lineTo(u * 0.45, u * 0.25); c.lineTo(0, u * 0.95); c.closePath(); c.fill(); break;
      case 'dash':
        c.beginPath(); c.moveTo(-u * 0.9, -u * 0.4); c.lineTo(u * 0.2, -u * 0.4); c.moveTo(-u * 0.6, 0); c.lineTo(u * 0.5, 0); c.moveTo(-u * 0.9, u * 0.4); c.lineTo(u * 0.2, u * 0.4); c.stroke();
        c.beginPath(); c.moveTo(u * 0.4, -u * 0.7); c.lineTo(u * 0.95, 0); c.lineTo(u * 0.4, u * 0.7); c.stroke(); break;
      default:
        c.font = `bold ${Math.round(r * 0.5)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, 0, 1);
    }
    c.restore();
  }

  function drawButton(c, x, y, r, pressed, name, rgb, count) {
    c.save();
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, pressed ? `rgba(${rgb},0.75)` : 'rgba(255,255,255,0.22)');
    g.addColorStop(1, pressed ? `rgba(${rgb},0.35)` : 'rgba(255,255,255,0.06)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r * (pressed ? 0.94 : 1), 0, TAU); c.fill();
    c.strokeStyle = pressed ? `rgba(${rgb},0.95)` : 'rgba(255,255,255,0.38)';
    c.lineWidth = 2; c.stroke();
    icon(c, name, x, y, r);
    if (count !== undefined && count !== null) {
      c.fillStyle = 'rgba(10,14,22,0.85)';
      c.beginPath(); c.arc(x + r * 0.72, y - r * 0.72, 11, 0, TAU); c.fill();
      c.strokeStyle = `rgba(${rgb},0.9)`; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(count), x + r * 0.72, y - r * 0.72 + 0.5);
    }
    c.restore();
  }

  // ── Session ───────────────────────────────────────────────────────────────
  function enter(id, opts) {
    const def = registry[id];
    if (!def) return Promise.resolve({ won: false, missing: true });
    if (active) active.end(false, true);
    ensureLayer();
    opts = opts || {};
    return new Promise(resolve => { active = new Session(id, def, opts, resolve); });
  }

  function Session(id, def, opts, resolve) {
    const S = this;
    S.id = id; S.def = def; S.resolve = resolve; S.opts = opts || {};
    S.charId = opts.charId || 'spirit';
    const chEntry = window.SPIRIT_CHARS && SPIRIT_CHARS[S.charId];
    S.charRgb = chEntry && chEntry.col ? chEntry.col.join(',') : '93,202,165';
    S.rgb = def.color || '255,255,255';
    S.t = 0; S.phase = 'intro'; S.introT = 0; S.ready = false; S.loadK = 0;
    S.paused = false; S.resultT = 0; S.won = false;
    S.input = makeInput(); S.prevHeld = {};
    S.pointers = new Map(); S.touch = { dirs: {}, held: {}, ax: 0, ay: 0 }; S.stick = null;
    S.fieldQ = { taps: [], swipes: [], releases: [] };
    S.level = Math.max(1, Math.min(10, +opts.level || 1)); S.badge = opts.badge || ''; S.round = !!opts.round; S.stars = 0;
    S.boons = opts.boons || {}; S.boonName = opts.boonName || '';
    S.shakeA = 0; S.flashA = 0; S.flashRgb = '255,255,255'; S.stop = 0;
    S.health = 100; S.maxHealth = 100; S.ghost = 100; S.invulnT = 0; S.dmgFlash = 0;
    S.floaters = [];
    S.fx = makeFx();
    S.hud = { objective: def.hint || '', progress: null, boss: null, counters: [] };
    S.controls = def.controls || { dirs: 'lr', buttons: [{ id: 'jump', icon: 'jump' }, { id: 'attack', icon: 'sword' }] };
    S.reason = opts.reason || '';
    // sound: the world's music + its effects decoded ahead (DABAudio, worlds/audio.js)
    const AU = window.DABAudio;
    S.loops = [];
    if (AU) { AU.music(def.music || null); AU.preload(['start', 'select', 'win', 'lose', 'hurt'].concat(def.sounds || [])); }
    S.dprMax = dpr(); S.dprCap = S.dprMax;          // adaptive: drops when frames run slow
    S.ftAvg = 16; S.ftSlowT = 0; S.ftFastT = 0;
    S.dpr = sizeCanvas();
    layer.style.display = 'block';
    layer.style.opacity = '0';
    requestAnimationFrame(() => { layer.style.transition = 'opacity .35s ease'; layer.style.opacity = '1'; });

    S.land = false; S.view = { top: 0, h: H }; S.ws = 1;
    S.env = {
      W, H, TAU, clamp, lerp, rand, ease,
      get land() { return S.land; },
      get view() { return S.view; },              // world rows on screen: top .. top + h
      get heroInfo() { return (S.roster || []).find(h => h.id === S.heroId) || null; },   // roster entry (name, saber colour…)
      get t() { return S.t; },
      get dpr() { return S.dpr; },               // current canvas pixels per app px (adaptive)
      charId: S.charId, charRgb: S.charRgb,
      assets: {},
      get health() { return S.health; }, get maxHealth() { return S.maxHealth; },
      get level() { return S.level; }, get round() { return S.round; },
      // Adventure toughness: enemy / boss health x tough (stage 1 0.82 .. stage 10 1.45); 1 outside Adventure
      get tough() { return S.round ? 0.75 + 0.07 * S.level : 1; },
      setStars(n) { S.stars = Math.max(1, Math.min(3, n | 0)); },
      boon(id) { return !!S.boons[id]; },
      get atk() { return S.boons.edge ? 1.35 : 1; },          // Keen Edge
      get clock() { return S.boons.time ? 0.75 : 1; },        // Slow Sun
      fx: S.fx, hud: S.hud,
      damage(n, o) {
        if (S.phase !== 'play' || S.invulnT > 0 || n <= 0) return false;
        o = o || {};
        if (S.round) n *= 0.62 + 0.07 * S.level;             // Adventure: hits sting more each stage
        if (S.boons.hide) n *= 0.7;                           // Thick Hide
        S.health = Math.max(0, S.health - n);
        S.dmgFlash = 1; S.invulnT = o.invuln !== undefined ? o.invuln : 0.35;
        S.shakeA = Math.max(S.shakeA, Math.min(1, 0.25 + n / 30));
        if (o.x !== undefined) S.floaters.push({ x: o.x, y: o.y - 10, txt: o.text || `-${Math.round(n)}`, rgb: '255,110,100', life: 1 });
        if (S.health <= 0) S.env.lose();
        return true;
      },
      heal(n) { S.health = Math.min(S.maxHealth, S.health + n); },
      invuln(sec) { S.invulnT = Math.max(S.invulnT, sec); },
      get invulnerable() { return S.invulnT > 0; },
      win() { if (S.phase === 'play') { S.phase = 'result'; S.won = true; S.resultT = 0; if (AU) AU.play('win', { jitter: 0 }); } },
      lose() { if (S.phase === 'play') { S.phase = 'result'; S.won = false; S.resultT = 0; if (AU) AU.play('lose', { jitter: 0 }); } },
      // sound effects: sfx(name, {vol, rate, pan}); x (world px on screen) pans it a little
      sfx(name, o) { if (AU) AU.play(name, o); },
      sfxAt(name, sx, o) { if (AU) AU.play(name, Object.assign({ pan: clamp((sx - W / 2) / W, -0.6, 0.6) }, o)); },
      loop(name, vol) { const h = AU ? AU.loop(name, vol) : { stop() { } }; S.loops.push(h); return h; },
      shake(a) { S.shakeA = Math.max(S.shakeA, a); },
      flash(rgb, a) { S.flashRgb = rgb || '255,255,255'; S.flashA = Math.max(S.flashA, a === undefined ? 0.6 : a); },
      hitstop(sec) { S.stop = Math.max(S.stop, sec); },
      floatText(x, y, txt, rgb) { S.floaters.push({ x, y, txt, rgb: rgb || '255,255,255', life: 1 }); },
      shader: makeShader, drawShader, drawHero, glowSprite, loadImage,
      hero: makeHeroApi(null),                  // sprite hero (def.hero), see SPRITE HERO
      rigs: {},                                 // photo-rig creatures (def.rigs), see PHOTO RIGS
      setControls(cfg) { S.controls = cfg; }
    };

    // def.roster = 'animal' | 'hell' -> the player picks one of that world's heroes on the intro card
    S.roster = []; S.heroId = null; S.portraits = {};
    const heroP = def.roster ? loadRoster().then(R => {
      S.roster = R[def.roster] || [];
      const saved = lsGet('dab_hero_' + def.roster);
      S.heroId = (S.roster.find(h => h.id === saved) || S.roster[0] || {}).id || null;
      S.roster.forEach(h => loadImage(`assets/hero/${h.id}/portrait.webp`).then(im => { S.portraits[h.id] = im; }));
      return S.heroId ? loadHeroSet(S.heroId) : null;
    }) : def.hero ? loadHeroSet(def.hero) : Promise.resolve(null);
    const rigP = Promise.all(Object.keys(def.rigs || {}).map(k => loadRig(def.rigs[k]).then(api => { S.env.rigs[k] = api; })));
    loadAll(def.assets, k => { S.loadK = k * (def.hero || def.roster ? 0.85 : 1); }).then(a => Promise.all([heroP, rigP]).then(([H]) => {
      S.env.hero = makeHeroApi(H);
      Object.assign(S.env.assets, a);
      S.ready = true;                              // the world itself is built on Start (orientation first)
      // def.lazyRigs: rigs only needed later in the level (a boss) load behind play; until they arrive the
      // world sees env.rigs[k] missing and draws its fallback
      const envNow = S.env;
      Object.keys(def.lazyRigs || {}).forEach(k => loadRig(def.lazyRigs[k]).then(api => { envNow.rigs[k] = api; }));
    }));

    S.last = performance.now();
    S.raf = requestAnimationFrame(S.loop.bind(S));
  }

  // Start: side-scrollers turn the phone to landscape first (if the player wants it), then the
  // world is built for that screen and play begins
  Session.prototype.startPlay = function () {
    if (this.phase !== 'intro' || !this.ready) return;
    if (window.DABAudio) DABAudio.play('start', { vol: 0.7, jitter: 0 });
    if (this.def.landscape && wantLandscape()) {
      this.phase = 'rotate'; this.rotT = 0;
      placeLayer(true);
      const N = native();
      if (N && N.setOrientation) { try { N.setOrientation('landscape'); } catch (e) { } }
      else if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { });
      SW = W; SH = H;                                  // the prompt is drawn upright until the phone turns
      if (windowIsLandscape()) this.beginWorld(true);
      return;
    }
    this.beginWorld(false);
  };
  Session.prototype.beginWorld = function (land) {
    if (this.world || (this.phase !== 'rotate' && this.phase !== 'intro')) return;
    this.applyLayout(land);
    try { this.world = this.def.create(this.env); } catch (e) { console.error('[worlds] create failed', e && e.stack ? e.stack : e); this.world = null; }
    this.phase = 'play'; this.playT = 0;
  };
  Session.prototype.applyLayout = function (land) {
    this.land = !!land;
    if (land) {
      SH = LAND_H; SW = Math.max(W, Math.round(LAND_H * (window.innerWidth || 844) / (window.innerHeight || 390)));
      const v = this.def.landscape;
      this.view = { top: v.top || 0, h: v.h || 560 };
      this.ws = SH / this.view.h;
      this.env.W = Math.round(SW / this.ws);
    } else {
      SW = W; SH = H; this.view = { top: 0, h: H }; this.ws = 1; this.env.W = W;
      placeLayer(false);
      const N = native();
      if (N && N.setOrientation && this.phase === 'rotate') { try { N.setOrientation('portrait'); } catch (e) { } }
    }
  };
  Session.prototype.toggleLand = function () {
    try { localStorage.setItem('dab_landscape', wantLandscape() ? '0' : '1'); } catch (e) { }
    if (window.DABAudio) DABAudio.play('select', { jitter: 0 });
  };
  // choose a hero on the intro card (re-loads that hero's sprite sheets)
  Session.prototype.pickHero = function (id) {
    if (!id || id === this.heroId) return;
    this.heroId = id; this.heroLoading = true;
    if (window.DABAudio) DABAudio.play('select', { jitter: 0 });
    lsSet('dab_hero_' + this.def.roster, id);
    loadHeroSet(id).then(H => { if (this.heroId === id) { this.env.hero = makeHeroApi(H); this.warmed = false; this.heroLoading = false; } });
  };
  const PICK = { y: 330, w: 66, h: 96, gap: 8 };
  Session.prototype.portraitAt = function (p) {
    const n = this.roster.length; if (!n) return null;
    const x0 = W / 2 - (n * PICK.w + (n - 1) * PICK.gap) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (PICK.w + PICK.gap);
      if (p.x > x && p.x < x + PICK.w && p.y > PICK.y && p.y < PICK.y + PICK.h) return this.roster[i].id;
    }
    return null;
  };

  // Keep it smooth on slower phones: if frames keep taking > 21 ms, render the
  // world at a lower canvas resolution (down to 1.25 px per app px); creep back up
  // when there is headroom. Only during play, never while paused.
  Session.prototype.adaptResolution = function (ms) {
    if (this.phase !== 'play' || this.paused || ms <= 0 || ms > 250) return;
    this.ftAvg = this.ftAvg * 0.92 + ms * 0.08;
    const s = ms / 1000;
    if (this.ftAvg > 21) { this.ftSlowT += s; this.ftFastT = 0; } else if (this.ftAvg < 13.5) { this.ftFastT += s; this.ftSlowT = 0; } else { this.ftSlowT = 0; this.ftFastT = 0; }
    if (this.ftSlowT > 0.8 && this.dprCap > 1.25) { this.dprCap = Math.max(1.25, Math.min(this.dprCap, this.dpr) - 0.35); this.ftSlowT = 0; this.ftAvg = 16; }
    else if (this.ftFastT > 5 && this.dprCap < this.dprMax) { this.dprCap = Math.min(this.dprMax, this.dprCap + 0.25); this.ftFastT = 0; }
  };

  Session.prototype.hitControl = function (p, dirsOnly) {
    const c = this.controls;
    if (c.dirs === 'lr') {
      for (const d of DPAD.lr) if (Math.hypot(p.x - d.x, p.y - d.y) < d.r + 14) return { kind: 'dir', id: d.id };
      if (dirsOnly) return null;
    } else if (c.dirs === 'stick') {
      if (!dirsOnly && p.x < SW * 0.42 && p.y > SH * (SW !== W ? 0.4 : 0.66)) return { kind: 'stick', ox: p.x, oy: p.y };
    }
    if (dirsOnly) return null;
    const bs = c.buttons || [], BP = btnPos();
    for (let i = 0; i < bs.length; i++) {
      const b = BP[i];
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 12) return { kind: 'btn', id: bs[i].id };
    }
    return null;
  };
  // screen (app) px -> world px (landscape camera: scale ws, rows from view.top)
  Session.prototype.toWorld = function (p) { return { x: p.x / this.ws, y: p.y / this.ws + this.view.top }; };
  // a finger left the play field: a tap (short + still), a swipe (a flick), and always a release
  Session.prototype.fieldUp = function (h) {
    const dx = h.x - h.x0, dy = h.y - h.y0, d = Math.hypot(dx, dy), dt = (performance.now() - h.t0) / 1000;
    const Q = this.fieldQ;
    Q.releases.push({ x: h.x, y: h.y, x0: h.x0, y0: h.y0, dt });
    if (d < 14 && dt < 0.45) Q.taps.push({ x: h.x0, y: h.y0 });
    else if (d >= 28 && dt < 0.6) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      Q.swipes.push({ dir, x: h.x0, y: h.y0, dx, dy });
    }
  };
  Session.prototype.stickMove = function (hit, p) {
    const dx = p.x - hit.ox, dy = p.y - hit.oy, m = Math.hypot(dx, dy), R = 46;
    const k = m > R ? R / m : 1;
    hit.dx = dx * k; hit.dy = dy * k;
  };
  Session.prototype.updateTouchInput = function () {
    const T = { dirs: {}, held: {}, ax: 0, ay: 0, field: null };
    let stick = null;
    for (const hit of this.pointers.values()) {
      if (hit.kind === 'dir') T.dirs[hit.id] = true;
      else if (hit.kind === 'btn') T.held[hit.id] = true;
      else if (hit.kind === 'stick') { stick = hit; T.ax = (hit.dx || 0) / 46; T.ay = (hit.dy || 0) / 46; }
      else if (hit.kind === 'field') T.field = hit;
    }
    this.touch = T; this.stick = stick;
  };

  Session.prototype.buildInput = function () {
    const I = this.input, T = this.touch, K = keysDown;
    const kx = (K.has('right') ? 1 : 0) - (K.has('left') ? 1 : 0);
    const ky = (K.has('down') ? 1 : 0) - (K.has('up') ? 1 : 0);
    I.ax = clamp(T.ax + kx + (T.dirs.right ? 1 : 0) - (T.dirs.left ? 1 : 0), -1, 1);
    I.ay = clamp(T.ay + ky, -1, 1);
    I.left = I.ax < -0.3; I.right = I.ax > 0.3; I.up = I.ay < -0.3; I.down = I.ay > 0.3;
    const held = {};
    for (const id in T.held) held[id] = true;
    for (const k of K) if (k !== 'left' && k !== 'right' && k !== 'down') held[k] = true;
    // in a side-scroller ↑ / W also jumps
    if (this.controls.dirs === 'lr' && K.has('up')) held.jump = true;
    if (this.controls.stickJump && I.ay < -0.6 && !this.env.noStickJump) held.jump = true;   // (a world can pause it, e.g. while aiming)
    if (window.__dabWorldKeys) for (const k in window.__dabWorldKeys) if (window.__dabWorldKeys[k]) held[k] = true;
    I.pressed = {}; I.released = {};
    for (const id in held) if (!this.prevHeld[id]) I.pressed[id] = true;
    for (const id in this.prevHeld) if (!held[id]) I.released[id] = true;
    I.held = held; this.prevHeld = held;
    // play-field touch (controls.touch): the live finger + this frame's taps / swipes / releases
    const F = T.field;
    I.touch = F ? { down: true, x: F.x, y: F.y, x0: F.x0, y0: F.y0, t: (performance.now() - F.t0) / 1000 } : { down: false };
    I.taps = this.fieldQ.taps; I.swipes = this.fieldQ.swipes; I.releases = this.fieldQ.releases;
    this.fieldQ = { taps: [], swipes: [], releases: [] };
    if (window.__dabWorldTaps && window.__dabWorldTaps.length) { I.taps = I.taps.concat(window.__dabWorldTaps.splice(0)); }   // test hook
    if (window.__dabWorldSwipes && window.__dabWorldSwipes.length) { I.swipes = I.swipes.concat(window.__dabWorldSwipes.splice(0)); }
    if (window.__dabWorldKeys) {
      const w = window.__dabWorldKeys;
      if (w.left) { I.left = true; I.ax = -1; } if (w.right) { I.right = true; I.ax = 1; }
      if (w.up) { I.up = true; I.ay = -1; } if (w.down) { I.down = true; I.ay = 1; }
    }
    return I;
  };

  const pauseRows = () => (SW !== W ? { title: 70, rows: [104, 166, 228] } : { title: 360, rows: [403, 473, 543] });
  Session.prototype.pauseTap = function (p) {
    const AU = window.DABAudio, R = pauseRows().rows, on = y => p.y > y - 3 && p.y < y + 53 && Math.abs(p.x - SW / 2) < 110;
    if (on(R[0])) { this.paused = false; if (AU) AU.duck(false); }            // Resume
    else if (on(R[1])) { this.paused = false; if (AU) AU.duck(false); this.env.lose(); this.gaveUp = true; }
    else if (on(R[2]) && AU) { AU.toggle(); AU.play('select', { jitter: 0 }); }   // Sound on / off
  };

  Session.prototype.loop = function (now) {
    if (active !== this) return;
    const rawMs = now - this.last;
    let dt = Math.min(rawMs / 1000, 0.05);
    this.last = now;
    this.adaptResolution(rawMs);
    this.dpr = sizeCanvas();
    const c = ctx;
    if (this.paused) dt = 0;
    if (this.stop > 0) { this.stop -= dt; dt *= 0.08; }
    this.t += dt;

    if (this.phase === 'intro') {
      this.introT += dt;
      if (this.ready && !this.warmed) { this.warmed = true; this.env.hero.warm(c); }
      if (this.ready && !this.heroLoading && this.introT > (this.roster.length ? 12 : 3.2)) this.startPlay();
    }
    if (this.phase === 'rotate') {                 // waiting for the phone to turn (the app turns itself)
      this.rotT += rawMs / 1000;
      if (windowIsLandscape()) this.beginWorld(true);
    } else if (this.land && windowIsLandscape()) {
      // the window can still settle after the turn (system bars): zoom so the world fills it
      const sw = Math.max(W, Math.round(LAND_H * window.innerWidth / window.innerHeight));
      if (Math.abs(sw - SW) > 2) { SW = sw; this.ws = SW / this.env.W; this.view.h = SH / this.ws; }
    }
    const input = this.buildInput();
    if (this.phase === 'play' || this.phase === 'result') {
      if (this.phase === 'play') this.playT += dt;
      if (this.invulnT > 0) this.invulnT -= dt;
      if (this.boons.dew && this.phase === 'play' && this.health > 0) this.health = Math.min(this.maxHealth, this.health + 1.5 * dt);   // Morning Dew
      try { if (this.world) this.world.update(dt, this.phase === 'play' ? input : makeInput()); }
      catch (e) { console.error('[worlds] update failed', e); this.world = null; this.env.win(); }
      this.fx.update(dt);
    }
    if (this.phase === 'result') this.resultT += dt;
    this.ghost = this.ghost > this.health ? Math.max(this.health, this.ghost - dt * 40) : this.health;
    this.shakeA = Math.max(0, this.shakeA - dt * 2.2);
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2.2);
    for (let i = this.floaters.length - 1; i >= 0; i--) { const f = this.floaters[i]; f.life -= dt * 0.9; f.y -= dt * 34; if (f.life <= 0) this.floaters.splice(i, 1); }

    // ── draw ──
    c.save();
    // worlds that paint their whole background (def.opaque) skip this full-screen clear —
    // one less screen of fill per frame — except while shaking, when the edges show
    if (!this.def.opaque || this.shakeA > 0 || this.phase === 'intro' || this.phase === 'rotate') { c.fillStyle = '#000'; c.fillRect(0, 0, SW, SH); }
    if (this.shakeA > 0) { const m = this.shakeA * this.shakeA * 14; c.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m); }
    if (this.ws !== 1 || this.view.top) { c.scale(this.ws, this.ws); c.translate(0, -this.view.top); }   // landscape camera
    if (this.world && this.phase !== 'intro' && this.phase !== 'rotate') {
      try { this.world.render(c); } catch (e) { console.error('[worlds] render failed', e); this.world = null; this.env.win(); }
    }
    for (const f of this.floaters) {
      c.globalAlpha = clamp(f.life * 1.4, 0, 1);
      c.font = 'bold 17px system-ui'; c.textAlign = 'center';
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(f.txt, f.x, f.y);
      c.fillStyle = `rgb(${f.rgb})`; c.fillText(f.txt, f.x, f.y);
      c.globalAlpha = 1;
    }
    c.restore();
    if (this.flashA > 0) { c.fillStyle = `rgba(${this.flashRgb},${this.flashA.toFixed(3)})`; c.fillRect(0, 0, SW, SH); }
    if (this.dmgFlash > 0) {
      const R = Math.max(SW, SH);
      const vg = c.createRadialGradient(SW / 2, SH / 2, R * 0.28, SW / 2, SH / 2, R * 0.62);
      vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(220,20,20,${(this.dmgFlash * 0.5).toFixed(3)})`);
      c.fillStyle = vg; c.fillRect(0, 0, SW, SH);
    }
    if (this.phase === 'rotate') this.drawRotate(c);
    if (this.phase === 'play' || (this.phase === 'result' && this.resultT < 0.6)) { this.drawHUD(c); this.drawControls(c); }
    if (this.phase === 'intro') this.drawIntro(c);
    if (this.phase === 'result') this.drawResult(c);
    if (this.paused) this.drawPause(c);
    this.raf = requestAnimationFrame(this.loop.bind(this));
  };

  Session.prototype.drawHUD = function (c) {
    // health bar
    const x = 16, y = 30, w = 168, h = 14, k = this.health / this.maxHealth, gk = this.ghost / this.maxHealth;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(c, x - 3, y - 3, w + 6, h + 6, 9); c.fill();
    c.fillStyle = 'rgba(255,240,200,0.5)'; roundRect(c, x, y, w * gk, h, 7); c.fill();
    const hg = c.createLinearGradient(x, 0, x + w, 0);
    hg.addColorStop(0, k < 0.3 ? '#ff3b30' : '#ff6b4a'); hg.addColorStop(1, k < 0.3 ? '#ff8a65' : '#7be07b');
    c.fillStyle = hg; roundRect(c, x, y, Math.max(0, w * k), h, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(c, x + 2, y + 2, Math.max(0, w * k - 4), 4, 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 11px system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`♥ ${Math.ceil(this.health)}`, x + 6, y + h / 2 + 0.5);
    // world chip + objective
    c.font = 'bold 12px system-ui'; c.fillStyle = `rgba(${this.rgb},0.95)`;
    c.fillText(this.def.title.toUpperCase(), x, y + 30);
    if (this.hud.objective) { c.font = '12px system-ui'; c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillText(this.hud.objective, x, y + 46); }
    // progress to the destination
    if (this.hud.progress !== null && this.hud.progress !== undefined) {
      const pw = SW !== W ? 220 : 140, px = SW !== W ? SW / 2 - pw / 2 : 196, py = y + 3;
      c.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(c, px, py, pw, 8, 4); c.fill();
      c.fillStyle = `rgba(${this.rgb},0.9)`; roundRect(c, px, py, pw * clamp(this.hud.progress, 0, 1), 8, 4); c.fill();
      c.fillStyle = '#ffd86b'; c.beginPath(); c.arc(px + pw, py + 4, 5, 0, TAU); c.fill();
    }
    // boss bar
    if (this.hud.boss) {
      const bx = SW !== W ? SW / 2 - 220 : 40, bw = SW !== W ? 440 : W - 80, by = SW !== W ? 62 : 112;
      c.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(c, bx - 3, by - 3, bw + 6, 16, 8); c.fill();
      const bg = c.createLinearGradient(bx, 0, bx + bw, 0); bg.addColorStop(0, '#b0173a'); bg.addColorStop(1, '#ff5468');
      c.fillStyle = bg; roundRect(c, bx, by, bw * clamp(this.hud.boss.hp, 0, 1), 10, 5); c.fill();
      c.fillStyle = '#fff'; c.font = 'bold 11px system-ui'; c.textAlign = 'center';
      c.fillText(this.hud.boss.name || 'BOSS', bx + bw / 2, by - 10);
    }
    // counters (ammo etc.)
    let cy = y + 66;
    for (const ct of this.hud.counters || []) {
      c.textAlign = 'left'; c.font = 'bold 12px system-ui'; c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillText(`${ct.icon || ''} ${ct.value}`, x, cy); cy += 18;
    }
    // pause button
    const pp = pausePos();
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(pp.x, pp.y, 17, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(pp.x - 6, pp.y - 7, 4, 14); c.fillRect(pp.x + 2, pp.y - 7, 4, 14);
    c.restore();
  };

  Session.prototype.drawControls = function (c) {
    const cfg = this.controls, held = this.input.held;
    if (cfg.dirs === 'lr') {
      for (const d of DPAD.lr) drawButton(c, d.x, d.y, d.r, !!this.touch.dirs[d.id] || this.input[d.id], d.id, this.rgb);
    } else if (cfg.dirs === 'stick') {
      const ST = stickPos(), st = this.stick, ox = st ? st.ox : ST.x, oy = st ? st.oy : ST.y;
      c.save();
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 2;
      c.beginPath(); c.arc(ox, oy, STICK.r, 0, TAU); c.fill(); c.stroke();
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        c.save(); c.translate(ox + Math.cos(a) * (STICK.r - 14), oy + Math.sin(a) * (STICK.r - 14)); c.rotate(a);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(5, 0); c.lineTo(-3, -5); c.lineTo(-3, 5); c.closePath(); c.fill(); c.restore();
      }
      const kx = ox + (st ? st.dx || 0 : 0), ky = oy + (st ? st.dy || 0 : 0);
      const g = c.createRadialGradient(kx - 8, ky - 8, 4, kx, ky, 28);
      g.addColorStop(0, st ? `rgba(${this.rgb},0.8)` : 'rgba(255,255,255,0.4)'); g.addColorStop(1, st ? `rgba(${this.rgb},0.3)` : 'rgba(255,255,255,0.12)');
      c.fillStyle = g; c.beginPath(); c.arc(kx, ky, 27, 0, TAU); c.fill();
      c.restore();
    }
    const bs = cfg.buttons || [], BP = btnPos();
    for (let i = 0; i < bs.length && i < BP.length; i++) {
      const b = BP[i], spec = bs[i];
      const count = spec.count ? spec.count() : undefined;
      drawButton(c, b.x, b.y, b.r, !!held[spec.id], spec.icon || spec.id, this.rgb, count);
    }
  };

  Session.prototype.drawIntro = function (c) {
    const k = clamp(this.introT / 0.5, 0, 1);
    c.save();
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05070d'); bg.addColorStop(1, `rgba(${this.rgb},0.25)`);
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    // swirling portal
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const a = i * 2.4 + this.t * (1.2 + (i % 5) * 0.2), r = 30 + (i * 7 + this.t * 60) % 150;
      const s = 18 * (1 - r / 190);
      c.globalAlpha = 0.5 * (1 - r / 190);
      c.drawImage(glowSprite(this.rgb), W / 2 + Math.cos(a) * r - s, 300 + Math.sin(a) * r * 0.55 - s, s * 2, s * 2);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.globalAlpha = k;
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const R = this.roster.length;
    const ty = R ? 236 : 470;                                  // with a hero picker the text moves up
    if (this.badge) {                                          // Adventure: STAGE n · ROUND m (· the stage's boon)
      c.font = 'bold 13px system-ui';
      const boon = this.boonName ? '  ·  ' + this.boonName : '';
      const w0 = c.measureText(this.badge).width, w1 = c.measureText(boon).width, bw = w0 + w1 + 34;
      c.fillStyle = `rgba(${this.rgb},0.18)`; roundRect(c, W / 2 - bw / 2, ty - 74, bw, 30, 15); c.fill();
      c.strokeStyle = `rgba(${this.rgb},0.7)`; c.lineWidth = 1.5; c.stroke();
      c.textBaseline = 'middle'; c.textAlign = 'left';
      c.fillStyle = '#fff'; c.fillText(this.badge, W / 2 - (w0 + w1) / 2, ty - 58);
      if (boon) { c.fillStyle = '#ffd86b'; c.fillText(boon, W / 2 - (w0 + w1) / 2 + w0, ty - 58); }
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    }
    c.fillStyle = `rgb(${this.rgb})`; c.font = 'bold 34px Georgia, serif';
    c.fillText(this.def.title, W / 2, ty);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '15px system-ui';
    const sub = typeof this.def.subtitle === 'function' ? this.def.subtitle(this.reason) : (this.def.subtitle || '');
    wrap(c, sub, W / 2, ty + 32, 320, 20);
    if (R) this.drawPicker(c);
    c.fillStyle = 'rgba(255,230,160,0.95)'; c.font = 'bold 14px system-ui';
    wrap(c, this.def.hint || '', W / 2, R ? 540 : 580, 330, 20);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = '12.5px system-ui';
    (this.def.howto || []).forEach((line, i) => c.fillText(line, W / 2, (R ? 584 : 630) + i * 19));
    if (this.def.landscape) {                                   // screen choice for side-scrollers
      const on = wantLandscape();
      c.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(c, W / 2 - 112, 652, 224, 36, 18); c.fill();
      c.strokeStyle = on ? `rgba(${this.rgb},0.8)` : 'rgba(255,255,255,0.3)'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = on ? `rgb(${this.rgb})` : 'rgba(255,255,255,0.8)'; c.font = 'bold 13.5px system-ui'; c.textBaseline = 'middle';
      c.fillText(on ? '📱⟷  Landscape (tap for portrait)' : '📱  Portrait (tap for landscape)', W / 2, 671); c.textBaseline = 'alphabetic';
    }
    // loading bar / tap to start
    if (!this.ready) {
      c.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(c, W / 2 - 80, 740, 160, 6, 3); c.fill();
      c.fillStyle = `rgb(${this.rgb})`; roundRect(c, W / 2 - 80, 740, 160 * this.loadK, 6, 3); c.fill();
    } else {
      c.globalAlpha = k * (0.55 + 0.45 * Math.sin(this.t * 4));
      if (R) {                                                  // a real Start button under the picker
        c.globalAlpha = k;
        c.fillStyle = this.heroLoading ? 'rgba(255,255,255,0.18)' : `rgba(${this.rgb},0.9)`;
        roundRect(c, W / 2 - 100, 712, 200, 52, 16); c.fill();
        c.fillStyle = '#071828'; c.font = 'bold 19px system-ui'; c.textBaseline = 'middle';
        c.fillText(this.heroLoading ? 'Loading…' : 'Start', W / 2, 739); c.textBaseline = 'alphabetic';
      } else { c.fillStyle = '#fff'; c.font = 'bold 15px system-ui'; c.fillText('Tap to start', W / 2, 752); }
    }
    c.restore();
  };

  Session.prototype.drawPicker = function (c) {
    const n = this.roster.length, x0 = W / 2 - (n * PICK.w + (n - 1) * PICK.gap) / 2;
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = 'bold 12px system-ui';
    c.fillText('CHOOSE YOUR HERO', W / 2, PICK.y - 12);
    let sel = null;
    for (let i = 0; i < n; i++) {
      const h = this.roster[i], x = x0 + i * (PICK.w + PICK.gap), on = h.id === this.heroId;
      if (on) sel = h;
      c.fillStyle = on ? `rgba(${this.rgb},0.32)` : 'rgba(255,255,255,0.07)';
      roundRect(c, x, PICK.y, PICK.w, PICK.h, 12); c.fill();
      c.lineWidth = on ? 2.5 : 1; c.strokeStyle = on ? `rgb(${this.rgb})` : 'rgba(255,255,255,0.2)'; c.stroke();
      const im = this.portraits[h.id];
      if (im) {
        const s = Math.min((PICK.w - 8) / im.width, (PICK.h - 8) / im.height);
        c.drawImage(im, x + PICK.w / 2 - im.width * s / 2, PICK.y + PICK.h - 4 - im.height * s, im.width * s, im.height * s);
      }
    }
    if (sel) {
      c.fillStyle = '#fff'; c.font = 'bold 17px Georgia, serif'; c.fillText(sel.name, W / 2, PICK.y + PICK.h + 26);
      c.fillStyle = 'rgba(255,255,255,0.65)'; c.font = 'italic 12.5px system-ui'; c.fillText(sel.tag || '', W / 2, PICK.y + PICK.h + 45);
    }
  };

  Session.prototype.drawRotate = function (c) {
    c.save();
    c.fillStyle = '#05070d'; c.fillRect(0, 0, SW, SH);
    c.textAlign = 'center'; c.fillStyle = `rgb(${this.rgb})`;
    const cx = SW / 2, cy = SH * 0.32, a = Math.sin(this.t * 2.2) * 0.7 - 0.7;   // a phone tipping onto its side
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.strokeStyle = `rgb(${this.rgb})`; c.lineWidth = 3; roundRect(c, -18, -32, 36, 64, 7); c.stroke();
    c.fillRect(-5, 24, 10, 3); c.restore();
    c.font = 'bold 20px system-ui'; c.fillStyle = '#fff'; c.fillText('Turn your phone sideways', cx, SH * 0.5);
    c.font = '13px system-ui'; c.fillStyle = 'rgba(255,255,255,0.65)'; c.fillText('Landscape shows much more of the level', cx, SH * 0.5 + 24);
    c.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(c, cx - 110, SH * 0.68, 220, 40, 14); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = 'bold 14px system-ui'; c.textBaseline = 'middle';
    c.fillText('Play in portrait instead', cx, SH * 0.68 + 20);
    c.restore();
  };

  Session.prototype.drawResult = function (c) {
    const k = clamp(this.resultT / 0.6, 0, 1);
    c.save();
    c.fillStyle = `rgba(0,0,0,${(0.62 * k).toFixed(3)})`; c.fillRect(0, 0, SW, SH);
    c.globalAlpha = k; c.textAlign = 'center';
    const sc = 0.8 + 0.2 * ease(k);
    c.translate(SW / 2, SW !== W ? SH * 0.4 : 380); c.scale(sc, sc);
    c.fillStyle = this.won ? '#ffd86b' : '#ff6b6b'; c.font = 'bold 40px Georgia, serif';
    if (this.round) {
      c.fillText(this.won ? 'Round clear!' : (this.gaveUp ? 'You gave up' : 'Knocked out'), 0, 0);
      if (this.won) {
        const st = this.starsFinal(), shown = Math.min(st, Math.floor(this.resultT / 0.35));
        c.font = '44px system-ui';
        for (let i = 0; i < 3; i++) { c.fillStyle = i < shown ? '#ffd86b' : 'rgba(255,216,107,0.18)'; c.fillText(i < shown ? '★' : '☆', (i - 1) * 46, 56); }
      } else { c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '16px system-ui'; c.fillText('You lose a life', 0, 40); }
    } else {
      c.fillText(this.won ? 'Escaped!' : (this.gaveUp ? 'You gave up' : 'Knocked out'), 0, 0);
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '16px system-ui';
      c.fillText(this.won ? 'Back to the pond, right where you were' : 'You lose a heart and wake at the start pad', 0, 40);
    }
    if (this.resultT > 0.9) { c.globalAlpha = 0.55 + 0.45 * Math.sin(this.t * 4); c.fillStyle = '#fff'; c.font = 'bold 15px system-ui'; c.fillText('Tap to continue', 0, 110); }
    c.restore();
    if (this.resultT > 3.2) this.finish();
  };

  Session.prototype.drawPause = function (c) {
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, 0, SW, SH);
    const o = pauseRows();
    c.textAlign = 'center'; c.fillStyle = '#fff'; c.font = 'bold 30px Georgia, serif'; c.fillText('Paused', SW / 2, o.title);
    const btn = (y, txt, rgb) => {
      c.fillStyle = `rgba(${rgb},0.85)`; roundRect(c, SW / 2 - 110, y, 220, 50, 14); c.fill();
      c.fillStyle = '#071828'; c.font = 'bold 17px system-ui'; c.textBaseline = 'middle'; c.fillText(txt, SW / 2, y + 26); c.textBaseline = 'alphabetic';
    };
    btn(o.rows[0], 'Resume', '93,202,165'); btn(o.rows[1], this.round ? 'Give up (lose a life)' : 'Give up (lose a heart)', '255,140,120');
    if (window.DABAudio) btn(o.rows[2], DABAudio.muted() ? '🔇  Sound: off' : '🔊  Sound: on', '200,210,230');
    c.restore();
  };

  // the round's stars: the world's own rating, else from the health left
  Session.prototype.starsFinal = function () {
    if (this.stars) return this.stars;
    const h = this.health / this.maxHealth;
    return h >= 0.7 ? 3 : h >= 0.35 ? 2 : 1;
  };
  Session.prototype.finish = function () { this.end(this.won, false); };
  Session.prototype.end = function (won, aborted) {
    if (active !== this) return;
    active = null;
    cancelAnimationFrame(this.raf);
    for (const h of this.loops) h.stop(0.5);
    if (window.DABAudio) { DABAudio.duck(false); DABAudio.music(this.opts.music === undefined ? 'music_pond' : this.opts.music); }
    try { this.world && this.world.destroy && this.world.destroy(); } catch (e) { /* ignore */ }
    keysDown.clear();
    if (this.land || this.phase === 'rotate') {                  // the pond is portrait
      const N = native();
      if (N && N.setOrientation) { try { N.setOrientation('portrait'); } catch (e) { } }
      else if (screen.orientation && screen.orientation.unlock) { try { screen.orientation.unlock(); } catch (e) { } }
    }
    layer.style.transition = 'opacity .3s ease'; layer.style.opacity = '0';
    setTimeout(() => { if (!active) { layer.style.display = 'none'; SW = W; SH = H; placeLayer(false); } }, 320);
    this.resolve({ won: !!won, aborted: !!aborted, stars: won ? this.starsFinal() : 0 });
  };

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function wrap(c, txt, x, y, maxW, lh) {
    const words = String(txt).split(' '); let line = '', yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = test;
    }
    if (line) c.fillText(line, x, yy);
  }

  window.DABWorlds = {
    register(id, def) { registry[id] = def; },
    has(id) { return !!registry[id]; },
    list() { return Object.keys(registry); },
    enter,
    isActive() { return !!active; },
    abort() { if (active) active.end(false, true); },
    // shared helpers other modules may want outside a session
    drawHero, glowSprite, roundRect, HERO,
    pxScale() { return active ? active.dpr : 2; }               // device px per world px (pre-rendered art resolution)
  };
  // test hook: end the running world now (won = true / false)
  window.__dabWorldEnd = won => { if (active && active.phase !== 'result') { if (active.phase === 'intro') active.startPlay(); if (active.phase === 'rotate') active.beginWorld(false); won ? active.env.win() : active.env.lose(); } };
  window.__dabWorld = () => active ? Object.assign({
    world: active.id, phase: active.phase, health: active.health, t: active.t, paused: active.paused,
    won: active.won, particles: active.fx.list.length, dpr: +active.dpr.toFixed(2), land: active.land, viewW: active.env.W
  }, active.world && active.world.debug ? active.world.debug() : {}) : null;
})();
