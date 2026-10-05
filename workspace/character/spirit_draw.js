// ============================================================================
// spirit_draw.js — Drift & Bloom shared drawing module (CHARACTER AGENT)
// Pure-canvas drawing functions, no DOM dependencies beyond Image() preloading.
// Include with:  <script src="spirit_draw.js"></script>   (adjust relative path)
//
// DRAGON (photoreal sprite sheet + procedural aimed flame)
// ----------------------------------------------------------------------------
// drawDragonSprite(ctx, x, y, t, opts)
//   Draws the sprite-sheet dragon centered at (x, y), facing LEFT, cycling
//   its 4-frame flap loop from time t (seconds). Image preloading is handled
//   internally — frames before the sheet finishes loading draw nothing.
//   opts.src    — path to dragon_sheet.png as seen from the host page
//                 (default '../../assets/sprites/dragon_sheet.png')
//   opts.scale  — render scale, 1.0 = 384 px cell (default 0.68)
//   opts.flip   — true to mirror horizontally (dragon faces right)
//   opts.firing — true while breathing fire: switches to the open-jaw twin
//                 of the current wing pose (cells offset by openSetOffset),
//                 so the dragon visibly opens its mouth without the wing
//                 beat skipping; the mouth anchor moves into the open gape
//   Returns { mouthX, mouthY, loaded } — world-space mouth anchor of the
//   CURRENT frame; use it as the flame origin.
//
// getDragonMouth(x, y, t, opts)
//   Same mouth anchor WITHOUT drawing — call it when you need the flame
//   rendered underneath the dragon (fire first, then sprite on top).
//
// drawDragonFlame(ctx, mx, my, tx, ty, t, power, reach)
//   Procedural fire stream from mouth (mx,my) toward target (tx,ty).
//   power 0..1 — intensity (ramp it in/out for burst cycles)
//   reach 0..1 — how far along the stream has extended (default 1)
//   Returns true while flames are connecting with the target ("hit").
//
// Typical gameplay burst cycle (1.45 s on / 0.95 s off):
//   const bp = t % 2.4;
//   const power = inRange && bp < 1.45 ? Math.min(1, bp/0.3, (1.45-bp)/0.25) : 0;
//   const m = getDragonMouth(dx, dy, t, opts);
//   if (power > 0) hit = drawDragonFlame(ctx, m.mouthX, m.mouthY, tx, ty, t,
//                                        power, Math.min(1, bp/0.5));
//   drawDragonSprite(ctx, dx, dy, t, opts);
// ============================================================================

const DRAGON_SHEET = {
  // v4 DUAL-CYCLE sheet from the user's video (dragon4.mp4): the dragon
  // flaps continuously with its mouth CLOSED, then opens its jaws WIDE to
  // breathe fire. Two phase-aligned 27-frame flap cycles, both starting at
  // wings-high: closed-mouth = cells 0-26, open-jaw twin = cells 27-53.
  // `openSetOffset: 27` lets drawDragonSprite/getDragonMouth switch to the
  // open-jaw twin of the SAME wing pose the instant a burst starts, so the
  // wing beat never skips and the jaws open exactly when firing.
  frameWidth: 480, frameHeight: 384, frameCount: 27, cols: 7, fps: 16,
  openSetOffset: 27,
  glideFrame: 0, glideTime: 0,
  // 54 per-frame mouth anchors (closed set 0-26 then open set 27-53),
  // snout-tracked from the cells, smoothed per set, marker-verified on
  // cells 0/13 (closed snout) and 27/40 (open gape). Indices 27..53 are
  // reached via openSetOffset while firing.
  mouthAnchors: [
    // --- closed-mouth set (cells 0-26): mouth at the lower jaw/snout ---
    [112,256],[112,255],[112,255],[113,254],[113,254],[113,254],[113,254],[113,254],[113,254],
    [113,255],[113,255],[113,256],[113,257],[113,257],[113,257],[113,257],[109,256],[109,247],
    [108,247],[112,259],[112,259],[112,259],[112,259],[112,258],[112,258],[112,257],[112,256],
    // --- open-jaw set (cells 27-53): mouth inside the open gape ---
    [88,231],[88,233],[88,231],[87,229],[87,228],[87,227],[87,226],[86,225],[86,225],
    [86,225],[86,226],[86,226],[86,227],[80,233],[86,228],[86,228],[86,228],[86,228],
    [78,231],[86,229],[86,229],[86,228],[86,228],[86,228],[86,227],[86,226],[87,229]
  ].map(([x, y]) => ({ x, y }))
};

let _dragonImg = null, _dragonImgSrc = null;

// frame pair + blend fraction: frames cross-fade into each other so the
// flap reads as one smooth continuous motion instead of snapping.
// Cadence is swim-like: one full wing stroke, then a drifting glide on
// spread wings (glideFrame held for glideTime), then the next stroke.
function _dragonPhase(t, opts) {
  const m = DRAGON_SHEET;
  // during the glide the wings never freeze — playback creeps through one
  // frame interval (glideFrame -> glideFrame+1) over glideTime seconds,
  // then resumes full speed for the next stroke
  let fpos, slow = false;
  if (!m.glideTime) {
    fpos = (t * m.fps) % m.frameCount;           // continuous loop, video-like
  } else {
    const holdT = m.glideFrame / m.fps;          // moment the glide pose is reached
    const cycleT = (m.frameCount - 1) / m.fps + m.glideTime;
    const u = t % cycleT;
    if (u < holdT) fpos = u * m.fps;             // stroke up to the glide pose
    else if (u < holdT + m.glideTime) {
      fpos = m.glideFrame + (u - holdT) / m.glideTime;
      slow = true;                               // drifting — creep between frames
    }
    else fpos = m.glideFrame + 1 + (u - holdT - m.glideTime) * m.fps;
  }
  const fi = Math.floor(fpos) % m.frameCount;
  return { fi, fj: (fi + 1) % m.frameCount,
           frac: fpos - Math.floor(fpos), phase: fpos / m.frameCount, slow };
}

// 0..1 blend toward the open-jaw twin set. Driven by opts.fireBlend (pass
// the flame's power envelope so the jaws ease open as the fire swells);
// boolean opts.firing alone snaps it fully open.
function _fireBlend(opts) {
  if (!opts) return 0;
  if (opts.fireBlend !== undefined) return Math.max(0, Math.min(1, opts.fireBlend));
  return opts.firing ? 1 : 0;
}

// wing-cycle phase 0..1 (frozen while gliding) — lets the host sync body
// bob to the beat: y += Math.sin(getDragonPhase(t) * 2 * Math.PI) * few px
function getDragonPhase(t, opts) {
  return _dragonPhase(t, opts).phase;
}

// gentle whole-body sway — pitches the sprite a couple of degrees so the
// head, tail and legs drift like the dragon is riding moving air (frames
// from the video hold the body rigid; this puts life back into it)
function _dragonSway(t) {
  return Math.sin(t * 1.7) * 0.026 + Math.sin(t * 0.61) * 0.012;
}

function getDragonMouth(x, y, t, opts) {
  opts = opts || {};
  const scale = opts.scale || 0.68;
  const m = DRAGON_SHEET;
  const { fi, fj, frac } = _dragonPhase(t, opts);
  const blend = _fireBlend(opts);
  // closed-set anchor, then lerp toward the open-gape anchor as jaws open
  let axc = m.mouthAnchors[fi].x + (m.mouthAnchors[fj].x - m.mouthAnchors[fi].x) * frac;
  let ayc = m.mouthAnchors[fi].y + (m.mouthAnchors[fj].y - m.mouthAnchors[fi].y) * frac;
  if (blend > 0 && m.openSetOffset) {
    const oi = fi + m.openSetOffset, oj = fj + m.openSetOffset;
    const oxc = m.mouthAnchors[oi].x + (m.mouthAnchors[oj].x - m.mouthAnchors[oi].x) * frac;
    const oyc = m.mouthAnchors[oi].y + (m.mouthAnchors[oj].y - m.mouthAnchors[oi].y) * frac;
    axc += (oxc - axc) * blend;
    ayc += (oyc - ayc) * blend;
  }
  const ax0 = (axc - m.frameWidth / 2) * scale;
  const ay0 = (ayc - m.frameHeight / 2) * scale;
  const ax = opts.flip ? -ax0 : ax0;
  const sw = _dragonSway(t);
  return {
    mouthX: x + ax * Math.cos(sw) - ay0 * Math.sin(sw),
    mouthY: y + ax * Math.sin(sw) + ay0 * Math.cos(sw)
  };
}

function drawDragonSprite(ctx, x, y, t, opts) {
  opts = opts || {};
  const src = opts.src || '../../assets/sprites/dragon_sheet.png';
  const scale = opts.scale || 0.68;
  if (!_dragonImg || _dragonImgSrc !== src) {
    _dragonImg = new Image();
    _dragonImg.src = src;
    _dragonImgSrc = src;
  }
  const m = DRAGON_SHEET;
  const { fi, fj, frac, slow } = _dragonPhase(t, opts);
  const mouth = getDragonMouth(x, y, t, opts);
  if (!_dragonImg.complete || !_dragonImg.naturalWidth) {
    return { mouthX: mouth.mouthX, mouthY: mouth.mouthY, loaded: false };
  }
  const w = m.frameWidth * scale, h = m.frameHeight * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(_dragonSway(t));
  if (opts.flip) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const cols = m.cols || m.frameCount;   // grid-packed sheet (1 row if no cols)
  const blend = m.openSetOffset ? _fireBlend(opts) : 0;
  // closed-set frame fades OUT as the jaws open (the roaring head shifts,
  // so leaving it at full alpha under the open frame shows two heads).
  // Fully open -> the closed frame is skipped entirely.
  if (blend < 0.99) {
    ctx.globalAlpha = 1 - blend;
    ctx.drawImage(_dragonImg,
                  (fi % cols) * m.frameWidth, Math.floor(fi / cols) * m.frameHeight,
                  m.frameWidth, m.frameHeight, -w / 2, -h / 2, w, h);
    // discrete frames at full speed (cross-fade smears at video framerates:
    // it doubles the wings, head and tail); fade ONLY during the slow glide creep
    if (slow && fj !== fi && frac > 0.01 && blend < 0.01) {
      ctx.globalAlpha = frac;
      ctx.drawImage(_dragonImg,
                    (fj % cols) * m.frameWidth, Math.floor(fj / cols) * m.frameHeight,
                    m.frameWidth, m.frameHeight, -w / 2, -h / 2, w, h);
    }
    ctx.globalAlpha = 1;
  }
  if (blend > 0.01) {
    const oi = fi + m.openSetOffset;
    ctx.globalAlpha = blend;
    ctx.drawImage(_dragonImg,
                  (oi % cols) * m.frameWidth, Math.floor(oi / cols) * m.frameHeight,
                  m.frameWidth, m.frameHeight, -w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return { mouthX: mouth.mouthX, mouthY: mouth.mouthY, loaded: true };
}

// Pre-rendered soft puffs, hottest (white-yellow) to coolest (deep red), plus
// smoke. Drawing cached sprites keeps the stream smooth at 100+ puffs a frame.
let _flamePuffs = null, _smokePuff = null;
function _buildFlamePuffs() {
  const mk = (rgb, a0) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},${a0})`);
    gr.addColorStop(0.4, `rgba(${rgb},${a0 * 0.55})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return cv;
  };
  _flamePuffs = ['255,252,232', '255,236,160', '255,204,90', '255,160,50', '250,112,28', '215,66,16', '150,36,10'].map((c) => mk(c, 1));
  _smokePuff = mk('38,30,32', 0.9);
}
function _h1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// Dragon fire: a jet that leaves the jaw white-hot, slows and billows into
// orange flame, rolls off into smoke, and splashes across the water where it
// lands. power 0..1 ramps it in/out; reach 0..1 is how far it has travelled.
// Returns true while the flame is touching the target.
function drawDragonFlame(ctx, mx, my, tx, ty, t, power, reach) {
  if (!(power > 0)) return false;
  if (!_flamePuffs) _buildFlamePuffs();
  if (reach === undefined) reach = 1;
  const ang = Math.atan2(ty - my, tx - mx);
  const dist = Math.hypot(tx - mx, ty - my);
  const len = Math.max(8, dist * Math.min(1, reach));
  const scale = Math.max(0.6, Math.min(1.0, dist / 360));   // a bit wider for longer throws
  const connected = len >= dist - 12 && power > 0.2;

  ctx.save();
  // warm light cast on the water around the landing point
  if (connected) {
    ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.42);
    const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 90 * scale);
    lg.addColorStop(0, `rgba(255,150,50,${(0.45 * power).toFixed(3)})`);
    lg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lg; ctx.fillRect(-90 * scale, -90 * scale, 180 * scale, 180 * scale);
    ctx.restore();
  }

  ctx.translate(mx, my); ctx.rotate(ang);
  // smoke rolling off the top and the far end (normal blend, behind the flame)
  for (let i = 0; i < 18; i++) {
    const a = _fract(t * 0.9 + i / 18);
    const cyc = Math.floor(t * 0.9 + i / 18);
    const s = (0.35 + 0.65 * (1 - (1 - a) * (1 - a))) * len;
    const lat = (_h1(i * 5.3 + cyc) - 0.5) * (8 + s * 0.12) - a * 12 * scale;
    const sz = (8 + a * 18) * scale;
    ctx.globalAlpha = power * 0.3 * Math.sin(a * Math.PI);
    ctx.drawImage(_smokePuff, s - sz, lat - sz, sz * 2, sz * 2);
  }
  ctx.globalCompositeOperation = 'lighter';
  // continuous tapered ribbon under the puffs so the jet reads as one stream
  {
    const seg = 14;
    ctx.beginPath(); ctx.moveTo(0, -1.2 * scale);
    for (let k = 1; k <= seg; k++) {
      const f = k / seg, x = f * len;
      ctx.lineTo(x, -(1.8 + x * 0.055) * scale * (1 + 0.16 * Math.sin(t * 11 + k * 1.9)));
    }
    for (let k = seg; k >= 0; k--) {
      const f = k / seg, x = f * len;
      ctx.lineTo(x, (1.8 + x * 0.055) * scale * (1 + 0.16 * Math.cos(t * 10 + k * 2.3)));
    }
    ctx.closePath();
    const rg = ctx.createLinearGradient(0, 0, len, 0);
    rg.addColorStop(0, `rgba(255,248,215,${(0.7 * power).toFixed(3)})`);
    rg.addColorStop(0.25, `rgba(255,205,95,${(0.5 * power).toFixed(3)})`);
    rg.addColorStop(0.6, `rgba(255,120,35,${(0.34 * power).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(200,50,10,0.04)');
    ctx.globalAlpha = 1; ctx.fillStyle = rg; ctx.fill();
  }
  // flame body: puffs travel from the jaw and ease out, widening and cooling
  const N = 140;
  const HEAT = [0.07, 0.18, 0.34, 0.52, 0.68, 0.84];       // age thresholds: white -> deep red
  for (let i = 0; i < N; i++) {
    const a = _fract(t * 2.3 + i / N);
    const cyc = Math.floor(t * 2.3 + i / N);
    const r1 = _h1(i * 13.1 + cyc * 7.7), r2 = _h1(i * 3.7 + cyc * 1.9);
    const s = (1 - Math.pow(1 - a, 1.45)) * len * (0.94 + r2 * 0.1);
    const spread = (1.2 + s * 0.07) * scale;
    const lat = (r1 - 0.5) * 2 * spread + Math.sin(t * 8 + i * 1.7) * s * 0.015;
    const sz = (4.5 + s * 0.042 + a * 6) * scale * (0.7 + r2 * 0.6) * (0.6 + 0.4 * power);
    let idx = 0; while (idx < 6 && a + (r2 - 0.5) * 0.06 > HEAT[idx]) idx++;
    const fade = (a < 0.05 ? a / 0.05 : 1) * (1 - Math.max(0, (a - 0.75) / 0.25));
    ctx.globalAlpha = power * fade * (idx < 2 ? 0.28 : 0.36);
    ctx.drawImage(_flamePuffs[idx], s - sz, lat - sz, sz * 2, sz * 2);
  }
  // white-hot core jet right out of the jaw
  const coreL = Math.min(len, 50 * scale + len * 0.3);
  for (let k = 0; k < 3; k++) {
    const w = (3.6 - k * 1) * scale, l = coreL * (1 - k * 0.22);
    ctx.save(); ctx.translate(l / 2, Math.sin(t * 22 + k) * 1.2); ctx.scale(l / 2, w);
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    cg.addColorStop(0, `rgba(255,255,240,${(0.75 * power).toFixed(3)})`);
    cg.addColorStop(0.5, `rgba(255,230,150,${(0.45 * power).toFixed(3)})`);
    cg.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // embers flung from the stream
  for (let i = 0; i < 24; i++) {
    const a = _fract(t * 1.3 + i * 0.137);
    const cyc = Math.floor(t * 1.3 + i * 0.137);
    const s = a * len * (0.7 + _h1(i + cyc) * 0.5);
    const lat = (_h1(i * 2.3 + cyc) - 0.5) * (6 + s * 0.35) - a * a * 18;
    const e = (1 - a) * power;
    ctx.globalAlpha = e;
    ctx.fillStyle = `rgb(255,${(215 - a * 120) | 0},${(90 - a * 70) | 0})`;
    ctx.beginPath(); ctx.arc(s, lat, 0.7 + (1 - a) * 1.1, 0, Math.PI * 2); ctx.fill();
  }
  // muzzle flash
  ctx.globalAlpha = 1;
  const mg = ctx.createRadialGradient(4, 0, 0, 4, 0, 26 * scale);
  mg.addColorStop(0, `rgba(255,220,130,${(0.55 * power).toFixed(3)})`);
  mg.addColorStop(1, 'rgba(255,110,20,0)');
  ctx.fillStyle = mg; ctx.fillRect(-24 * scale, -26 * scale, 56 * scale, 52 * scale);
  ctx.restore();

  // fire splashing across the water at the landing point
  if (connected) {
    ctx.save(); ctx.translate(tx, ty); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const a = _fract(t * 1.6 + i / 26);
      const cyc = Math.floor(t * 1.6 + i / 26);
      const dir = _h1(i * 9.1 + cyc) * Math.PI * 2;
      const r = a * (20 + _h1(i + cyc * 3) * 18) * scale;
      const px = Math.cos(dir) * r, py = Math.sin(dir) * r * 0.38 - a * a * 16 * scale;
      const sz = (5 + a * 8) * scale;
      const idx = Math.min(6, 2 + Math.floor(a * 4.5));
      ctx.globalAlpha = power * (1 - a) * 0.55;
      ctx.drawImage(_flamePuffs[idx], px - sz, py - sz, sz * 2, sz * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {                       // steam
      const a = _fract(t * 0.7 + i / 6);
      const px = Math.sin(i * 2.7 + t) * 16 * scale, py = -a * 46 * scale;
      const sz = (8 + a * 16) * scale;
      ctx.globalAlpha = power * 0.18 * Math.sin(a * Math.PI);
      ctx.drawImage(_smokePuff, px - sz, py - sz, sz * 2, sz * 2);
    }
    ctx.restore();
  }
  ctx.restore();
  return connected;
}

// ============================================================================
// REAL BREATH FLAME — billowing fire keyed from the user's fire video,
// stamped from the mouth and rotated onto the mouth->target axis, with
// extra ember/spark particles. Additive blend, so the dark video haze in
// the sprite corners disappears and only the bright fire shows.
// ----------------------------------------------------------------------------
// drawDragonFlameReal(ctx, mx, my, tx, ty, t, power, opts)
//   (mx,my) mouth · (tx,ty) target · power 0..1 intensity
//   opts.src   — flame_sheet.png (default '../../assets/sprites/flame_sheet.png')
//   Returns true while the fire reaches the target.
// ============================================================================
const FLAME_SHEET = {
  frameWidth: 290, frameHeight: 180, frameCount: 24, cols: 6, fps: 22,
  origin: { x: 270, y: 14 },   // mouth-attach point in cell coords
  nativeAng: 2.52,             // radians the fire naturally points (down-left)
  reach: 250                   // native fire length at scale 1
};
let _flameImg = null, _flameImgSrc = null;

function drawDragonFlameReal(ctx, mx, my, tx, ty, t, power, opts) {
  if (!(power > 0.01)) return false;
  opts = opts || {};
  const src = opts.src || '../../assets/sprites/flame_sheet.png';
  if (!_flameImg || _flameImgSrc !== src) {
    _flameImg = new Image(); _flameImg.src = src; _flameImgSrc = src;
  }
  const m = FLAME_SHEET;
  const ang = Math.atan2(ty - my, tx - mx);
  const dist = Math.hypot(tx - mx, ty - my);
  // scale so the fire spans roughly mouth->target, growing in with power
  const sc = Math.max(0.3, dist / m.reach) * (0.55 + 0.45 * power);

  if (_flameImg.complete && _flameImg.naturalWidth) {
    const fi = Math.floor(t * m.fps) % m.frameCount;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';   // additive — kills dark haze
    ctx.globalAlpha = Math.min(1, power * 1.1);
    ctx.translate(mx, my);
    ctx.rotate(ang - m.nativeAng);
    ctx.scale(sc, sc);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(_flameImg,
                  (fi % m.cols) * m.frameWidth, Math.floor(fi / m.cols) * m.frameHeight,
                  m.frameWidth, m.frameHeight,
                  -m.origin.x, -m.origin.y, m.frameWidth, m.frameHeight);
    ctx.restore();
  }

  // extra flying sparks/embers along the stream (motion + reach the video lacks)
  ctx.save();
  ctx.translate(mx, my); ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) {
    const ep = (t * 1.5 + i * 0.137) % 1;
    const ex = ep * dist * (0.6 + 0.5 * power);
    const spread = ep * (10 + dist * 0.08);
    const ey = Math.sin(i * 4.7 + t * 6) * spread;
    const r = Math.max(0.4, (1.7 - ep * 1.3) * (0.6 + power * 0.5));
    const fade = (1 - ep) * power;
    ctx.beginPath(); ctx.arc(ex, ey, r, 0, 6.28);
    ctx.fillStyle = `rgba(255,${(200 - ep * 150) | 0},${(70 - ep * 60) | 0},${(fade * 0.9).toFixed(3)})`;
    ctx.fill();
  }
  // muzzle flash at the jaw
  const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, 30 * power);
  fg.addColorStop(0, `rgba(255,235,150,${(0.5 * power).toFixed(3)})`);
  fg.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, 30 * power, 0, 6.28); ctx.fill();
  ctx.restore();

  return dist <= m.reach * sc + 20 && power > 0.15;
}

// ============================================================================
// BURN IMPACT — real fire + smoke + ash loop, keyed from the user's
// dragon-breathes-fire video. Draw where the flame lands; let intensity
// rise while the flame connects and decay afterward so the embers smolder.
// ----------------------------------------------------------------------------
// drawBurnFx(ctx, x, y, t, intensity, opts)
//   (x, y)    — bottom-center of the burn on screen
//   intensity — 0..1 master alpha (0 skips drawing entirely)
//   opts.src   — path to burn_sheet.png (default '../../assets/sprites/burn_sheet.png')
//   opts.scale — render scale, 1 = 210x186 px cell (default 0.55)
// ============================================================================
const BURN_SHEET = {
  frameWidth: 210, frameHeight: 186, frameCount: 24, cols: 6, fps: 20
};
let _burnImg = null, _burnImgSrc = null;
// reusable offscreen canvas: each burn cell is composited through a soft
// radial alpha mask here BEFORE it hits the scene, so the rectangular cell
// edge always fades to 0 — the ash billows outward with no visible box,
// even if the source sheet still carries a dark video background.
let _burnMaskCanvas = null, _burnMaskCtx = null, _burnMaskGrad = null;

function drawBurnFx(ctx, x, y, t, intensity, opts) {
  if (!(intensity > 0.01)) return;
  opts = opts || {};
  const src = opts.src || '../../assets/sprites/burn_sheet.png';
  const scale = opts.scale || 0.55;
  if (!_burnImg || _burnImgSrc !== src) {
    _burnImg = new Image();
    _burnImg.src = src;
    _burnImgSrc = src;
  }
  if (!_burnImg.complete || !_burnImg.naturalWidth) return;
  const m = BURN_SHEET;
  const fi = Math.floor(t * m.fps) % m.frameCount;
  const fw = m.frameWidth, fh = m.frameHeight;
  const sx = (fi % m.cols) * fw, sy = Math.floor(fi / m.cols) * fh;

  // build (once) a frame-sized scratch canvas + a radial feather gradient
  // (opaque core -> 0 at the edges); the fire sits a touch below center.
  if (!_burnMaskCanvas) {
    _burnMaskCanvas = document.createElement('canvas');
    _burnMaskCanvas.width = fw; _burnMaskCanvas.height = fh;
    _burnMaskCtx = _burnMaskCanvas.getContext('2d');
    const cx = fw / 2, cy = fh * 0.58, r = Math.max(fw, fh) * 0.62;
    _burnMaskGrad = _burnMaskCtx.createRadialGradient(cx, cy, r * 0.18, cx, cy, r);
    _burnMaskGrad.addColorStop(0,    'rgba(0,0,0,1)');
    _burnMaskGrad.addColorStop(0.62, 'rgba(0,0,0,1)');
    _burnMaskGrad.addColorStop(1,    'rgba(0,0,0,0)');
  }
  const mc = _burnMaskCtx;
  mc.globalCompositeOperation = 'source-over';
  mc.clearRect(0, 0, fw, fh);
  mc.drawImage(_burnImg, sx, sy, fw, fh, 0, 0, fw, fh);   // the burn cell
  mc.globalCompositeOperation = 'destination-in';         // keep only feathered core
  mc.fillStyle = _burnMaskGrad;
  mc.fillRect(0, 0, fw, fh);
  mc.globalCompositeOperation = 'source-over';

  const w = fw * scale, h = fh * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  // smoke/ash base pass — soft, normal blend, gives the dark billow body
  ctx.globalAlpha = Math.min(1, intensity) * 0.85;
  ctx.drawImage(_burnMaskCanvas, x - w / 2, y - h, w, h);
  // bright fire/ember pass — additive so the glow blooms outward past the
  // old cell box and reads as live flame (dark smoke contributes ~0 here)
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, intensity) * 0.6;
  ctx.drawImage(_burnMaskCanvas, x - w / 2, y - h, w, h);
  ctx.restore();
}

// ============================================================================
// PLAYER SPIRITS — v2 (2026-09-25): ten distinct hand-built characters.
// Each has its own silhouette, shading, face style and signature effects,
// all four states, and a per-character motion trail.
// ----------------------------------------------------------------------------
// drawSpirit(ctx, x, y, t, state, characterId, opts)
//   state       — 'IDLE' | 'MOVING' | 'COLLECTING' | 'CELEBRATING'
//   characterId — 'spirit' 'ember' 'luna' 'moss' 'storm' 'kira' 'blaze'
//                 'zephyr' 'void' 'aurora'  (unknown ids fall back to spirit)
//   opts.vx/vy  — current velocity in px/frame; drives lean, eye-look
//                 direction, stretch and the motion trail
//   opts.scale  — render scale (1 = ~60 px tall body, ~96 px incl. glow)
//   opts.land   — standing on land (side worlds): no water glow / ripple ring
//   (x, y) is the contact point on the water; the body sits ~16 px above it.
//
// SPIRIT_CHARS — exported roster table {id: {name, tag, col, ...}} for UIs.
//
// ENEMIES
// ----------------------------------------------------------------------------
// drawEnemy(ctx, x, y, t, type, opts)
//   type — 'croc' | 'snake' | 'dragon' | 'saucer' | 'shooting_star'
//   'croc'/'snake' face LEFT; opts.flip = face right.
//   'croc': opts.state 'telegraph' | 'charge' opens the jaws.
//   'dragon' delegates to drawDragonSprite (pass opts.src / opts.scale).
//   'saucer' draws its tractor beam when opts.beam is true.
//   'shooting_star': opts.angle = travel direction (default down-left).
// ============================================================================

const _TAU = Math.PI * 2;

function _mix(c, target, k) {
  return c.map((v, i) => Math.round(v + (target[i] - v) * k));
}
function _fract(n) { return n - Math.floor(n); }
function _clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function _hash(n) { return _fract(Math.sin(n * 127.1 + 311.7) * 43758.5453); }
function _c(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a === undefined ? 1 : Math.max(0, a).toFixed(3)})`; }

// radial gradient lit from the upper right (the moon side of the pond)
function _litGrad(ctx, cx, cy, r, light, mid, dark) {
  const g = ctx.createRadialGradient(cx + r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.25);
  g.addColorStop(0, _c(light)); g.addColorStop(0.5, _c(mid)); g.addColorStop(1, _c(dark));
  return g;
}
function _glow(ctx, x, y, r, rgb, a) {
  if (a <= 0.002 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, _c(rgb, a)); g.addColorStop(1, _c(rgb, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function _spec(ctx, x, y, rx, ry, a, rot) {           // glossy highlight
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, _TAU); ctx.fill(); ctx.restore();
}
// rim light: strokes the CURRENT path, bright on the lower-left (backlit by the aura)
function _rim(ctx, cx, cy, r, rgb, a, w) {
  const g = ctx.createLinearGradient(cx - r, cy + r, cx + r * 0.3, cy - r * 0.3);
  g.addColorStop(0, _c(rgb, a)); g.addColorStop(0.6, _c(rgb, 0));
  ctx.strokeStyle = g; ctx.lineWidth = w || 1.5; ctx.stroke();
}
function _blobPath(ctx, cx, cy, n, rFn) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * _TAU, r = rFn(a);
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function _star4(ctx, x, y, s, rot, fill) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * 0.28, -s * 0.28); ctx.lineTo(s, 0); ctx.lineTo(s * 0.28, s * 0.28);
  ctx.lineTo(0, s); ctx.lineTo(-s * 0.28, s * 0.28); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.28, -s * 0.28);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
// jagged lightning bolt with a glow pass and a white core
function _bolt(ctx, x0, y0, x1, y1, seed, w, rgb, a) {
  const pts = [[x0, y0]];
  const n = 5, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < n; i++) {
    const f = i / n, off = (_hash(seed + i * 7.3) - 0.5) * len * 0.45;
    pts.push([x0 + dx * f - dy / len * off, y0 + dy * f + dx / len * off]);
  }
  pts.push([x1, y1]);
  const stroke = (col, lw) => {
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  };
  stroke(_c(rgb, a * 0.35), w * 3.2);
  stroke(_c(rgb, a * 0.9), w * 1.5);
  stroke(`rgba(255,255,255,${(a * 0.95).toFixed(3)})`, w * 0.6);
}

// ---------------------------------------------------------------------------
// FACE — shared eye / brow / mouth rig with per-character styles
//   f.y eye-line, f.sep eye spacing, f.rx/ry eye size, f.iris rgb,
//   f.skin (eyelid color), f.dark (eye background), f.style:
//   'round' | 'fierce' | 'sleepy' | 'wise' | 'glow' | 'sharp' | 'playful' | 'kind'
//   f.brow: 'fierce' | 'bushy' | 'storm' | 'ledge'; f.blush rgb; f.lash;
//   f.mouth: 'smile' (default) | 'none' | 'lava'; f.fang; f.beard; f.cheekStars
// ---------------------------------------------------------------------------
function _eye(ctx, x, y, rx, ry, f, side, lid, S) {
  const shape = () => {
    ctx.beginPath();
    if (f.style === 'sharp') {                      // almond, lifted outer corner
      const o = side * rx;
      ctx.moveTo(x - o * 1.05, y + ry * 0.2);
      ctx.quadraticCurveTo(x - o * 0.1, y - ry * 1.35, x + o * 1.1, y - ry * 0.45);
      ctx.quadraticCurveTo(x + o * 0.2, y + ry * 1.25, x - o * 1.05, y + ry * 0.2);
      ctx.closePath();
    } else if (f.slant) {                           // tilted ellipse (void)
      ctx.ellipse(x, y, rx, ry, side * f.slant, 0, _TAU);
    } else {
      ctx.ellipse(x, y, rx, ry, 0, 0, _TAU);
    }
  };
  if (f.style === 'glow') {
    // emissive eyes (storm / blaze / void): white-hot core, colored edge
    _glow(ctx, x, y, rx * 3.4, f.iris, 0.4 * (1 - lid));
    if (lid > 0.85) {
      ctx.beginPath(); ctx.moveTo(x - rx, y); ctx.lineTo(x + rx, y);
      ctx.strokeStyle = _c(f.iris, 0.9); ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
      return;
    }
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 1 - lid * 0.9); ctx.translate(-x, -y);
    shape();
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, _c(_mix(f.iris, [255, 255, 255], 0.5)));
    g.addColorStop(1, _c(f.iris));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  shape();
  ctx.fillStyle = _c(f.dark || [10, 20, 32]); ctx.fill();
  ctx.save(); shape(); ctx.clip();
  // iris
  const ig = ctx.createRadialGradient(x, y + ry * 0.35, 0, x, y + ry * 0.1, ry * 1.05);
  ig.addColorStop(0, _c(_mix(f.iris, [255, 255, 255], 0.45)));
  ig.addColorStop(0.55, _c(f.iris));
  ig.addColorStop(1, _c(_mix(f.iris, [0, 0, 0], 0.55)));
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.ellipse(x, y + ry * 0.12, rx * 0.88, ry * 0.9, 0, 0, _TAU); ctx.fill();
  // pupil
  ctx.fillStyle = 'rgba(4,8,14,0.96)';
  ctx.beginPath(); ctx.ellipse(x, y + ry * 0.14, rx * 0.42, ry * 0.5, 0, 0, _TAU); ctx.fill();
  // catch-lights
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.arc(x - rx * 0.3, y - ry * 0.34, rx * 0.36, 0, _TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(x + rx * 0.36, y + ry * 0.38, rx * 0.15, 0, _TAU); ctx.fill();
  // eyelid (blink / sleepy / focused) sweeping down from the top
  if (lid > 0.01) {
    const ly = y - ry * 1.1 + ry * 2.2 * lid;
    ctx.fillStyle = _c(f.skin || [120, 200, 180]);
    ctx.beginPath(); ctx.moveTo(x - rx * 1.4, y - ry * 1.4);
    ctx.lineTo(x + rx * 1.4, y - ry * 1.4);
    ctx.lineTo(x + rx * 1.4, ly - (f.style === 'fierce' ? side * ry * 0.35 : 0));
    ctx.quadraticCurveTo(x, ly + ry * 0.25, x - rx * 1.4, ly + (f.style === 'fierce' ? side * ry * 0.35 : 0));
    ctx.closePath(); ctx.fill();
    // lid edge line
    ctx.beginPath();
    ctx.moveTo(x - rx * 1.1, ly + (f.style === 'fierce' ? side * ry * 0.3 : 0));
    ctx.quadraticCurveTo(x, ly + ry * 0.25, x + rx * 1.1, ly - (f.style === 'fierce' ? side * ry * 0.3 : 0));
    ctx.strokeStyle = 'rgba(10,18,28,0.75)'; ctx.lineWidth = 0.9; ctx.stroke();
  }
  ctx.restore();   // clip
  // lashes: flick at the outer corner
  if (f.lash && lid < 0.9) {
    ctx.strokeStyle = 'rgba(10,16,26,0.85)'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const a = -0.5 - k * 0.45;
      const bx = x + side * rx * 0.85, by = y - ry * (0.55 - k * 0.3) + ry * lid * 1.2;
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.lineTo(bx + side * Math.cos(a) * 2.2, by + Math.sin(a) * 2.2); ctx.stroke();
    }
  }
  ctx.restore();
}

function _face(ctx, S, f) {
  const st = S.state;
  const happy = st === 'CELEBRATING', wow = st === 'COLLECTING';
  const lk = f.lookK || 1;
  const lx = S.lookX * lk, ly = S.lookY * lk;
  const ex = f.sep / 2;
  // cheeks
  if (f.blush) {
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * (ex + f.rx * 0.9) + lx * 0.4, f.y + f.ry * 1.35 + ly * 0.3); ctx.scale(1, 0.6);
      _glow(ctx, 0, 0, f.rx * 1.35, f.blush, happy ? 0.7 : 0.45);
      ctx.restore();
    }
  }
  if (f.cheekStars) {
    for (const s of [-1, 1]) {
      _star4(ctx, s * (ex + f.rx * 1.1) + lx * 0.4, f.y + f.ry * 1.45, 1.6, 0.3,
             `rgba(255,190,235,${(0.55 + 0.35 * Math.sin(S.T * 2 + s)).toFixed(3)})`);
    }
  }
  // eyes
  if (happy && f.style !== 'glow') {
    ctx.strokeStyle = 'rgba(10,18,30,0.9)'; ctx.lineWidth = f.rx * 0.55; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * ex + lx * 0.5, f.y + f.ry * 0.45 + ly * 0.3, f.rx * 0.95, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
  } else {
    let lid = S.blink;
    if (f.style === 'sleepy') lid = Math.max(lid, 0.42 + Math.sin(S.T * 0.8) * 0.06);
    else if (f.style === 'wise') lid = Math.max(lid, 0.36);
    else if (f.style === 'sharp') lid = Math.max(lid, 0.14);
    else if (f.style === 'fierce') lid = Math.max(lid, 0.22);
    if (st === 'MOVING' && f.style !== 'sleepy') lid = Math.max(lid, 0.16);
    if (wow) lid = Math.min(lid, 0.05);
    if (happy) lid = Math.max(lid, 0.5);             // glow eyes squint happily
    const sz = wow ? 1.14 : 1;
    for (const s of [-1, 1]) {
      let l = lid;
      if (f.style === 'playful' && s > 0 && !wow) l = Math.max(l, S.wink);   // right eye winks
      _eye(ctx, s * ex + lx, f.y + ly, f.rx * sz, f.ry * sz, f, s, l, S);
    }
  }
  // brows
  if (f.brow) {
    const bc = f.browCol || [20, 20, 30];
    for (const s of [-1, 1]) {
      const bx = s * ex + lx * 0.6, by = f.y - f.ry * 1.45 + ly * 0.4 - (wow ? 1.2 : 0) - (happy ? 1 : 0);
      if (f.brow === 'fierce') {
        const tilt = happy ? -0.1 : 0.42;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(-s * tilt);
        ctx.beginPath(); ctx.moveTo(-f.rx * 1.2, 0); ctx.quadraticCurveTo(0, -1.2, f.rx * 1.2, 0);
        ctx.strokeStyle = _c(bc, 0.95); ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
      } else if (f.brow === 'bushy') {
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.ellipse(bx + s * (k - 1.5) * 1.6, by + (k === 0 || k === 3 ? 0.9 : 0) + Math.sin(S.T * 1.5 + k) * 0.2,
                      1.7, 1.3, 0, 0, _TAU);
          ctx.fillStyle = _c(_mix(bc, [255, 255, 200], k * 0.07)); ctx.fill();
        }
      } else if (f.brow === 'storm') {
        ctx.save(); ctx.translate(bx, by + 0.6); ctx.rotate(-s * 0.25);
        ctx.beginPath(); ctx.ellipse(0, 0, f.rx * 1.25, 1.3, 0, 0, _TAU);
        ctx.fillStyle = _c(bc, 0.9); ctx.fill(); ctx.restore();
      } else if (f.brow === 'ledge') {
        ctx.save(); ctx.translate(bx, by + 1); ctx.rotate(-s * (happy ? 0 : 0.28));
        ctx.beginPath(); ctx.moveTo(-f.rx * 1.5, 0.6); ctx.lineTo(f.rx * 1.5, -0.6); ctx.lineTo(f.rx * 1.3, 1.8); ctx.lineTo(-f.rx * 1.3, 2.4);
        ctx.closePath(); ctx.fillStyle = _c(bc, 0.95); ctx.fill(); ctx.restore();
      }
    }
  }
  // mouth
  const mx = lx * 0.5, my = f.y + (f.mouthY || 7) + ly * 0.4, mw = f.mouthW || 3;
  const ink = f.mouth === 'lava' ? 'rgba(255,170,40,0.95)' : 'rgba(12,16,28,0.88)';
  if (f.mouth === 'none' && !happy && !wow) {
    // no mouth — Void keeps its silence
  } else if (happy) {
    ctx.beginPath(); ctx.moveTo(mx - mw * 1.25, my - 0.6);
    ctx.quadraticCurveTo(mx, my + mw * 1.9, mx + mw * 1.25, my - 0.6);
    ctx.closePath();
    ctx.fillStyle = f.mouth === 'lava' ? 'rgba(255,140,30,0.95)' : 'rgba(60,14,30,0.95)'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.ellipse(mx, my + mw * 1.2, mw * 0.8, mw * 0.55, 0, 0, _TAU);
    ctx.fillStyle = f.mouth === 'lava' ? 'rgba(255,240,150,0.95)' : 'rgba(255,120,150,0.95)'; ctx.fill();
    ctx.restore();
    if (f.fang) _fang(ctx, mx + mw * 0.7, my - 0.4);
  } else if (wow) {
    ctx.beginPath(); ctx.ellipse(mx, my + 0.6, mw * 0.5, mw * 0.65, 0, 0, _TAU);
    ctx.fillStyle = f.mouth === 'lava' ? 'rgba(255,170,40,0.95)' : 'rgba(60,14,30,0.92)'; ctx.fill();
  } else if (f.zigzag && st === 'MOVING') {
    ctx.beginPath(); ctx.moveTo(mx - mw, my);
    for (let k = 1; k <= 4; k++) ctx.lineTo(mx - mw + k * mw / 2, my + (k % 2 ? 0.9 : 0));
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke();
  } else {
    const curve = st === 'MOVING' ? 0.35 : (f.style === 'fierce' ? 0.55 : 1);
    ctx.beginPath();
    ctx.moveTo(mx - mw, my - 0.3);
    ctx.quadraticCurveTo(mx, my + mw * 0.9 * curve, mx + mw * (f.style === 'fierce' ? 1.2 : 1), my - 0.3 - (f.style === 'fierce' ? 0.8 : 0));
    ctx.strokeStyle = ink; ctx.lineWidth = f.mouth === 'lava' ? 1.4 : 1.15; ctx.lineCap = 'round'; ctx.stroke();
    if (f.mouth === 'lava') _glow(ctx, mx, my, 6, [255, 140, 20], 0.35);
    if (f.fang && st !== 'MOVING') _fang(ctx, mx + mw * 0.7, my - 0.1);
  }
  if (f.beard) _mossBeard(ctx, mx, my + 1.4, S);
}

function _fang(ctx, x, y) {
  ctx.beginPath(); ctx.moveTo(x - 0.9, y); ctx.lineTo(x + 0.9, y); ctx.lineTo(x, y + 1.8); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,245,0.95)'; ctx.fill();
}

function _mossBeard(ctx, x, y, S) {
  const tufts = [[-3.2, 0.6, 1.9], [-1.2, 1.6, 2.1], [1.2, 1.6, 2.1], [3.2, 0.6, 1.9], [0, 2.6, 1.9]];
  tufts.forEach(([dx, dy, r], i) => {
    const sw = Math.sin(S.T * 1.7 + i * 1.3) * 0.3;
    const g = ctx.createRadialGradient(x + dx - 0.5, y + dy - 0.6, 0, x + dx, y + dy, r);
    g.addColorStop(0, 'rgb(150,200,95)'); g.addColorStop(1, 'rgb(62,110,42)');
    ctx.beginPath(); ctx.ellipse(x + dx + sw, y + dy, r, r * 0.85, 0, 0, _TAU);
    ctx.fillStyle = g; ctx.fill();
  });
}

// ---------------------------------------------------------------------------
// CHARACTERS
// Every body is drawn around center (0,-16), bottom ~ (0,2), in local units.
// ---------------------------------------------------------------------------

function _drawWater(ctx, S) {                       // SPIRIT — living water droplet
  const T = S.T;
  const sway = Math.sin(T * 1.3) * 2 - S.vx * 0.9;
  // translucent fins
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 13, -18);
    ctx.rotate(s * (0.35 + Math.sin(T * 3.2 + (s > 0 ? 0 : 1.2)) * 0.28 + S.speed * 0.35));
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(s * 6, -6, s * 15, -3, s * 17, 5);
    ctx.bezierCurveTo(s * 11, 6.5, s * 5, 5, 0, 0); ctx.closePath();
    const fg = ctx.createLinearGradient(0, 0, s * 17, 4);
    fg.addColorStop(0, 'rgba(120,230,205,0.25)'); fg.addColorStop(1, 'rgba(200,255,240,0.6)');
    ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = 'rgba(210,255,245,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 2, 1); ctx.quadraticCurveTo(s * 9, 0, s * 15, 4);
    ctx.moveTo(s * 2, 2.5); ctx.quadraticCurveTo(s * 8, 3.5, s * 12, 5.5);
    ctx.strokeStyle = 'rgba(230,255,250,0.35)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.restore();
  }
  const path = () => {
    ctx.beginPath(); ctx.moveTo(sway, -42);
    ctx.bezierCurveTo(sway * 0.6 + 6, -34, 16.5, -29, 16.5, -16);
    ctx.bezierCurveTo(16.5, -4.5, 9, 2.5, 0, 2.5);
    ctx.bezierCurveTo(-9, 2.5, -16.5, -4.5, -16.5, -16);
    ctx.bezierCurveTo(-16.5, -29, sway * 0.6 - 6, -34, sway, -42);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = _litGrad(ctx, 0, -16, 19, [215, 255, 244], [88, 205, 170], [16, 86, 96]);
  ctx.globalAlpha = 0.94; ctx.fill(); ctx.globalAlpha = 1;
  ctx.save(); path(); ctx.clip();
  // depth shadow low-left
  const dg = ctx.createLinearGradient(-16, 2, 10, -30);
  dg.addColorStop(0, 'rgba(6,50,70,0.45)'); dg.addColorStop(0.5, 'rgba(6,50,70,0)');
  ctx.fillStyle = dg; ctx.fillRect(-18, -44, 36, 48);
  // caustic light lines drifting upward
  for (let i = 0; i < 3; i++) {
    const p = _fract(T * 0.22 + i / 3), yy = 2 - p * 42;
    ctx.beginPath();
    for (let xx = -17; xx <= 17; xx += 2) {
      const py = yy + Math.sin(xx * 0.38 + T * 2.1 + i * 2) * 1.8;
      if (xx === -17) ctx.moveTo(xx, py); else ctx.lineTo(xx, py);
    }
    ctx.strokeStyle = `rgba(230,255,250,${(Math.sin(p * Math.PI) * 0.32).toFixed(3)})`;
    ctx.lineWidth = 1.1; ctx.stroke();
  }
  // rising bubbles
  for (let i = 0; i < 5; i++) {
    const p = _fract(T * 0.33 + i * 0.23);
    const bx = Math.sin(i * 2.3 + T * 0.9) * 7, by = 0 - p * 36, br = 0.8 + (i % 3) * 0.45;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, _TAU);
    ctx.strokeStyle = `rgba(235,255,252,${((1 - p) * 0.6).toFixed(3)})`; ctx.lineWidth = 0.6; ctx.stroke();
  }
  _glow(ctx, 0, -14, 13, [225, 255, 246], 0.42);
  ctx.restore();
  path(); ctx.strokeStyle = 'rgba(8,70,72,0.55)'; ctx.lineWidth = 1.1; ctx.stroke();
  path(); _rim(ctx, 0, -16, 17, [190, 255, 238], 0.85, 1.4);
  _spec(ctx, 7.5, -25, 2.8, 6, 0.85, 0.45);
  _spec(ctx, 10.5, -14, 1.1, 1.8, 0.6, 0.3);
  // curling crest at the tip
  ctx.beginPath(); ctx.moveTo(sway, -42);
  ctx.bezierCurveTo(sway + 3, -48, sway + 9, -46.5, sway + 7.5, -42.5);
  ctx.strokeStyle = 'rgba(200,255,240,0.9)'; ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.stroke();
  _face(ctx, S, { y: -15, sep: 11.5, rx: 3.3, ry: 4.3, iris: [60, 205, 195], skin: [110, 215, 188],
                  style: 'round', blush: [255, 160, 190], mouthY: 7, mouthW: 3.1 });
}

function _flameTongue(ctx, bx, by, w, h, lean, t) {
  const tipX = bx + lean + Math.sin(t * 9) * w * 0.3, tipY = by - h;
  ctx.beginPath(); ctx.moveTo(bx - w, by);
  ctx.bezierCurveTo(bx - w * 1.05, by - h * 0.45, tipX - w * 0.35, tipY + h * 0.38, tipX, tipY);
  ctx.bezierCurveTo(tipX + w * 0.35, tipY + h * 0.38, bx + w * 1.05, by - h * 0.45, bx + w, by);
  ctx.closePath();
}

function _drawEmber(ctx, S) {                       // EMBER — fire sprite with a flame crown
  const T = S.T, lean = -S.vx * 2.4 + Math.sin(T * 1.7) * 1.2;
  const crown = [[-9, 10, 4.2], [-4.5, 16, 5.2], [0, 22, 5.8], [4.5, 16, 5.2], [9, 10, 4.2]];
  const layers = [[[255, 60, 15], 0.6, 1.0], [[255, 135, 30], 0.7, 0.74], [[255, 225, 120], 0.8, 0.46]];
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  _glow(ctx, 0, -30, 20, [255, 110, 30], 0.35);
  layers.forEach(([rgb, a, k], li) => {
    crown.forEach(([cx0, h0, w0], i) => {
      const h = h0 * (0.82 + 0.26 * Math.sin(T * 7.3 + i * 1.9 + li * 0.7) + 0.08 * Math.sin(T * 13 + i));
      _flameTongue(ctx, cx0 * 0.95, -22 - li * 0.8, w0 * k, h * k + 2, lean * (0.6 + h0 / 30), T + i * 1.3 + li);
      ctx.fillStyle = _c(rgb, a); ctx.fill();
    });
  });
  ctx.restore();
  // soft flame wisp trailing beneath (fades out, so it never reads as legs)
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.translate(0, -3); ctx.scale(1, -1);
  _flameTongue(ctx, 0, 0, 5.5, 8 + Math.sin(T * 8) * 2 + S.speed * 7, S.vx * 1.5, T);
  const wg = ctx.createLinearGradient(0, 0, 0, -14);
  wg.addColorStop(0, 'rgba(255,150,40,0.55)'); wg.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = wg; ctx.fill();
  ctx.restore();
  // body orb
  const R = 13.8;
  _blobPath(ctx, 0, -15, 40, (a) => R * (1 + 0.03 * Math.sin(3 * a + T * 4) + 0.02 * Math.sin(5 * a - T * 3)));
  const bg = ctx.createRadialGradient(1, -12, 1, 0, -15, R * 1.15);
  bg.addColorStop(0, 'rgb(255,250,215)'); bg.addColorStop(0.35, 'rgb(255,205,95)');
  bg.addColorStop(0.75, 'rgb(255,125,40)'); bg.addColorStop(1, 'rgb(200,52,18)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = 'rgba(120,25,5,0.6)'; ctx.lineWidth = 1.1; ctx.stroke();
  // inner flicker
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  _glow(ctx, Math.sin(T * 5) * 2, -13 + Math.cos(T * 4) * 1.5, 9, [255, 240, 170], 0.35 + 0.15 * Math.sin(T * 11));
  ctx.restore();
  _spec(ctx, 6.5, -23, 3, 2, 0.55, 0.6);
  _face(ctx, S, { y: -14, sep: 10.5, rx: 3, ry: 3.7, iris: [255, 232, 120], skin: [255, 170, 70],
                  dark: [60, 14, 4], style: 'fierce', brow: 'fierce', browCol: [110, 25, 8],
                  mouthY: 6.5, mouthW: 3, fang: true });
}

function _drawLuna(ctx, S) {                        // LUNA — dreamy moon spirit
  const T = S.T;
  // stardust veil
  const tailX = Math.sin(T * 1.1) * 4 - S.vx * 3;
  ctx.beginPath(); ctx.moveTo(-9, -8);
  ctx.quadraticCurveTo(-7 + tailX * 0.3, 8, tailX, 15);
  ctx.quadraticCurveTo(7 + tailX * 0.3, 8, 9, -8); ctx.closePath();
  const vg = ctx.createLinearGradient(0, -6, 0, 15);
  vg.addColorStop(0, 'rgba(170,130,255,0.55)'); vg.addColorStop(1, 'rgba(120,80,230,0)');
  ctx.fillStyle = vg; ctx.fill();
  for (let i = 0; i < 5; i++) {
    const p = _fract(T * 0.4 + i * 0.21);
    _star4(ctx, tailX * p + Math.sin(i * 3 + T) * 3, -2 + p * 16, 1.3 * (1 - p) + 0.3, T + i,
           `rgba(235,225,255,${((1 - p) * 0.9).toFixed(3)})`);
  }
  // body
  const path = () => _blobPath(ctx, 0, -16, 40, (a) => 15.2 * (1 + 0.07 * Math.sin(a)) * (1 + 0.02 * Math.sin(2 * a + T * 1.5)));
  path(); ctx.fillStyle = _litGrad(ctx, 0, -16, 17, [232, 214, 255], [150, 108, 248], [44, 22, 112]); ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  _glow(ctx, -6, -9, 11, [255, 120, 210], 0.28);
  _glow(ctx, 7, -22, 10, [110, 170, 255], 0.3);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 9; i++) {
    const sx = (_hash(i + 4) - 0.5) * 26, sy = -16 + (_hash(i + 17) - 0.5) * 26;
    const tw = 0.35 + 0.65 * Math.max(0, Math.sin(T * (1.4 + _hash(i) * 2) + i * 2.1));
    ctx.beginPath(); ctx.arc(sx, sy, 0.45 + _hash(i + 9) * 0.5, 0, _TAU);
    ctx.fillStyle = `rgba(245,240,255,${(tw * 0.85).toFixed(3)})`; ctx.fill();
  }
  ctx.restore();
  path(); ctx.strokeStyle = 'rgba(36,14,88,0.6)'; ctx.lineWidth = 1.1; ctx.stroke();
  path(); _rim(ctx, 0, -16, 16, [215, 195, 255], 0.8, 1.4);
  _spec(ctx, 7, -25, 3.4, 2.2, 0.6, 0.55);
  // crescent moon hat
  ctx.save();
  ctx.translate(5, -35 + Math.sin(T * 1.1) * 1.2);
  ctx.rotate(-0.4 + Math.sin(T * 0.9) * 0.08);
  _glow(ctx, 0, 0, 16, [215, 200, 255], 0.38);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, _TAU); ctx.clip();
  ctx.beginPath(); ctx.rect(-12, -12, 24, 24); ctx.arc(3.6, -2.6, 7.2, 0, _TAU, true); ctx.clip('evenodd');
  const mg = ctx.createLinearGradient(-8, 6, 6, -6);
  mg.addColorStop(0, 'rgb(255,250,228)'); mg.addColorStop(1, 'rgb(200,184,255)');
  ctx.fillStyle = mg; ctx.fillRect(-10, -10, 20, 20);
  ctx.restore();
  _star4(ctx, -6.5, 6.2, 2 + Math.sin(T * 3) * 0.5, T * 0.8, 'rgba(255,248,210,0.95)');
  ctx.restore();
  _face(ctx, S, { y: -15, sep: 11, rx: 3.2, ry: 3.9, iris: [196, 160, 255], skin: [160, 120, 246],
                  style: 'sleepy', lash: true, cheekStars: true, mouthY: 7, mouthW: 2.6 });
}

function _drawMoss(ctx, S) {                        // MOSS — ancient little forest keeper
  const T = S.T;
  // root feet
  ctx.lineCap = 'round';
  for (const s of [-1, 0, 1]) {
    ctx.beginPath(); ctx.moveTo(s * 5, -1);
    ctx.quadraticCurveTo(s * 8, 3, s * 11 + (s === 0 ? 1.5 : 0), 5 + (s === 0 ? 1 : 0));
    ctx.strokeStyle = 'rgb(88,55,28)'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,110,60,0.6)'; ctx.lineWidth = 0.9; ctx.stroke();
  }
  // acorn body
  const body = () => {
    ctx.beginPath(); ctx.moveTo(-13.5, -24);
    ctx.bezierCurveTo(-15.5, -12, -12, 2, 0, 3);
    ctx.bezierCurveTo(12, 2, 15.5, -12, 13.5, -24); ctx.closePath();
  };
  body(); ctx.fillStyle = _litGrad(ctx, 0, -13, 17, [222, 176, 110], [158, 104, 54], [74, 42, 20]); ctx.fill();
  ctx.save(); body(); ctx.clip();
  for (let i = 0; i < 5; i++) {                      // wood grain
    const gx = -10 + i * 5 + Math.sin(i * 2.1) * 1.2;
    ctx.beginPath(); ctx.moveTo(gx, -24); ctx.bezierCurveTo(gx - 2, -14, gx + 2, -8, gx * 0.7, 3);
    ctx.strokeStyle = 'rgba(80,45,18,0.22)'; ctx.lineWidth = 0.7; ctx.stroke();
  }
  ctx.restore();
  body(); ctx.strokeStyle = 'rgba(55,30,12,0.7)'; ctx.lineWidth = 1.1; ctx.stroke();
  body(); _rim(ctx, 0, -12, 15, [240, 200, 120], 0.55, 1.2);
  // moss cap
  const cap = () => {
    ctx.beginPath(); ctx.moveTo(-16.5, -22);
    ctx.bezierCurveTo(-17.5, -33, -8, -38.5, 0, -38.5);
    ctx.bezierCurveTo(8, -38.5, 17.5, -33, 16.5, -22);
    ctx.bezierCurveTo(10, -18.5, -10, -18.5, -16.5, -22); ctx.closePath();
  };
  cap(); const cg = ctx.createLinearGradient(0, -38, 0, -19);
  cg.addColorStop(0, 'rgb(160,205,95)'); cg.addColorStop(0.5, 'rgb(96,150,55)'); cg.addColorStop(1, 'rgb(44,86,34)');
  ctx.fillStyle = cg; ctx.fill();
  ctx.save(); cap(); ctx.clip();
  for (let i = 0; i < 26; i++) {                     // moss clumps
    const mx = (_hash(i + 30) - 0.5) * 32, my = -38 + _hash(i + 60) * 18;
    ctx.beginPath(); ctx.arc(mx, my, 1 + _hash(i + 90) * 1.4, 0, _TAU);
    ctx.fillStyle = _hash(i) > 0.5 ? 'rgba(190,230,120,0.35)' : 'rgba(30,70,25,0.35)'; ctx.fill();
  }
  ctx.restore();
  cap(); ctx.strokeStyle = 'rgba(25,55,20,0.75)'; ctx.lineWidth = 1; ctx.stroke();
  // hanging moss fringe
  for (let i = 0; i < 8; i++) {
    const fx = -13 + i * 3.7, fy = -20.5 + Math.abs(i - 3.5) * 0.35;
    const len = 2 + _hash(i + 5) * 2.5 + Math.sin(T * 1.8 + i) * 0.4;
    ctx.beginPath(); ctx.ellipse(fx, fy + len * 0.5, 1.2, len, 0, 0, _TAU);
    ctx.fillStyle = 'rgba(80,130,48,0.9)'; ctx.fill();
  }
  _spec(ctx, 6, -33, 4, 1.8, 0.4, 0.3);
  // sprout
  const sw = Math.sin(T * 1.6) * 0.18 - S.vx * 0.05;
  ctx.save(); ctx.translate(0, -38); ctx.rotate(sw);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(1, -4, 0, -7);
  ctx.strokeStyle = 'rgb(95,150,55)'; ctx.lineWidth = 1.3; ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(0, -6.5); ctx.rotate(s * (0.9 + Math.sin(T * 2.1 + s) * 0.12));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2.8, -2.8, 0, -7.5); ctx.quadraticCurveTo(-2.8, -2.8, 0, 0);
    const lg = ctx.createLinearGradient(0, 0, 0, -7.5);
    lg.addColorStop(0, 'rgb(90,160,60)'); lg.addColorStop(1, 'rgb(170,225,100)');
    ctx.fillStyle = lg; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -0.5); ctx.lineTo(0, -6.5); ctx.strokeStyle = 'rgba(60,110,40,0.7)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // tiny toadstool on the cap
  ctx.save(); ctx.translate(11, -31); ctx.rotate(0.35);
  ctx.fillStyle = 'rgb(240,230,205)'; ctx.fillRect(-0.9, -3.5, 1.8, 3.8);
  ctx.beginPath(); ctx.ellipse(0, -3.8, 3.6, 2.4, 0, Math.PI, 0); ctx.closePath();
  const tg = ctx.createLinearGradient(0, -6, 0, -3.8);
  tg.addColorStop(0, 'rgb(255,90,70)'); tg.addColorStop(1, 'rgb(190,30,30)');
  ctx.fillStyle = tg; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  [[-1.6, -4.6], [0.6, -5.6], [1.9, -4.3]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx, dy, 0.55, 0, _TAU); ctx.fill(); });
  ctx.restore();
  _face(ctx, S, { y: -13.5, sep: 10.5, rx: 2.8, ry: 3.3, iris: [236, 190, 92], skin: [170, 116, 62],
                  dark: [30, 16, 6], style: 'wise', brow: 'bushy', browCol: [92, 146, 58],
                  beard: true, mouthY: 6.2, mouthW: 2.5 });
}

function _drawStorm(ctx, S) {                       // STORM — a living thundercloud
  const T = S.T;
  const flash = _clamp((Math.sin(T * 2.3) * Math.sin(T * 7.1 + 1.3) - 0.55) * 3, 0, 1);
  // drizzle
  for (let i = 0; i < 7; i++) {
    const p = _fract(T * 1.7 + i * 0.37), rx = -11 + i * 3.6 + Math.sin(i * 5) * 1.2 - S.vx * p * 3;
    ctx.beginPath(); ctx.moveTo(rx, -2 + p * 15); ctx.lineTo(rx - 0.8 - S.vx * 0.5, 1.5 + p * 15);
    ctx.strokeStyle = `rgba(150,235,255,${((1 - p) * 0.5).toFixed(3)})`; ctx.lineWidth = 0.9; ctx.stroke();
  }
  // lightning strike below
  if (flash > 0.05) {
    const sd = Math.floor(T * 3);
    _bolt(ctx, -3 + _hash(sd) * 6, -3, -8 + _hash(sd + 1) * 16, 17, sd, 1.1, [120, 240, 255], flash);
  }
  const puffs = [[-10.5, -14, 8.6], [-4.5, -23, 9.6], [5, -24, 10.2], [11.5, -15, 8.4], [0, -10, 10.4], [-6.5, -8, 7.6], [7.5, -8, 7.6]];
  const unionPath = (grow) => {
    ctx.beginPath();
    puffs.forEach(([px, py, r], i) => {
      const rr = r * (1 + 0.045 * Math.sin(T * 2.2 + i * 1.7)) + grow;
      ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, _TAU);
    });
  };
  unionPath(1.2); ctx.fillStyle = 'rgba(20,28,58,0.8)'; ctx.fill();      // outline pass
  unionPath(0);
  const cg = ctx.createLinearGradient(0, -34, 0, 0);
  cg.addColorStop(0, 'rgb(186,214,246)'); cg.addColorStop(0.45, 'rgb(104,130,182)'); cg.addColorStop(1, 'rgb(46,56,98)');
  ctx.fillStyle = cg; ctx.fill();
  ctx.save(); unionPath(0); ctx.clip();
  puffs.forEach(([px, py, r], i) => _spec(ctx, px + r * 0.25, py - r * 0.45, r * 0.55, r * 0.3, 0.28, 0));
  ctx.globalCompositeOperation = 'lighter';
  _glow(ctx, 0, -14, 20, [90, 230, 255], 0.22 + flash * 0.55);
  // crackling surface arcs
  for (let i = 0; i < 2; i++) {
    const on = Math.sin(T * (5 + i * 3.1) + i * 4) > 0.7;
    if (!on) continue;
    const a = _hash(Math.floor(T * 8) + i * 11) * _TAU;
    const bx = Math.cos(a) * 11, by = -16 + Math.sin(a) * 9;
    _bolt(ctx, bx, by, bx + Math.cos(a + 1.3) * 7, by + Math.sin(a + 1.3) * 7, Math.floor(T * 8) + i, 0.5, [150, 245, 255], 0.9);
  }
  ctx.restore();
  _face(ctx, S, { y: -15, sep: 11.5, rx: 3.1, ry: 3.6, iris: [120, 248, 255], style: 'glow',
                  brow: 'storm', browCol: [36, 46, 88], mouthY: 7, mouthW: 3.2, zigzag: true });
}

function _drawKira(ctx, S) {                        // KIRA — graceful ice crystal
  const T = S.T;
  // shoulder crystals
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * 11, -27); ctx.rotate(s * (0.7 + Math.sin(T * 1.3 + s) * 0.05));
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(2.3, -2); ctx.lineTo(0, 2); ctx.lineTo(-2.3, -2); ctx.closePath();
    const sg = ctx.createLinearGradient(-2, 0, 2, -8);
    sg.addColorStop(0, 'rgb(120,190,235)'); sg.addColorStop(1, 'rgb(240,252,255)');
    ctx.fillStyle = sg; ctx.fill(); ctx.strokeStyle = 'rgba(60,120,170,0.7)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.restore();
  }
  const V = [[0, -43], [12.5, -29], [12, -8], [0, 3], [-12, -8], [-12.5, -29]];
  const C0 = [1.5, -19];
  const L = [0.6, -0.8];
  const outline = () => { ctx.beginPath(); V.forEach(([vx, vy], i) => (i ? ctx.lineTo(vx, vy) : ctx.moveTo(vx, vy))); ctx.closePath(); };
  _glow(ctx, 0, -18, 26, [170, 230, 255], 0.3);
  for (let i = 0; i < 6; i++) {
    const a = V[i], b = V[(i + 1) % 6];
    const mx = (a[0] + b[0]) / 2 - C0[0], my = (a[1] + b[1]) / 2 - C0[1];
    const ml = Math.hypot(mx, my) || 1;
    const lit = 0.5 + 0.5 * ((mx / ml) * L[0] + (my / ml) * L[1]);
    const col = _mix([70, 135, 190], [240, 252, 255], lit);
    ctx.beginPath(); ctx.moveTo(C0[0], C0[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath();
    const fg = ctx.createLinearGradient(C0[0], C0[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    fg.addColorStop(0, _c(_mix(col, [255, 255, 255], 0.35), 0.96)); fg.addColorStop(1, _c(col, 0.96));
    ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
  }
  // sweeping glint
  ctx.save(); outline(); ctx.clip();
  const gp = _fract(T * 0.35) * 2.2 - 0.6;
  if (gp < 1.3) {
    ctx.save(); ctx.translate(-14 + gp * 28, -20); ctx.rotate(0.5);
    const gg = ctx.createLinearGradient(-4, 0, 4, 0);
    gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,0.7)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg; ctx.fillRect(-4, -30, 8, 60); ctx.restore();
  }
  ctx.globalCompositeOperation = 'lighter';
  _glow(ctx, 0, -17, 11, [190, 240, 255], 0.3 + 0.1 * Math.sin(T * 2));
  ctx.restore();
  outline(); ctx.strokeStyle = 'rgba(40,95,145,0.8)'; ctx.lineWidth = 1.1; ctx.lineJoin = 'round'; ctx.stroke();
  // sparkle at the tip
  const tw = Math.max(0, Math.sin(T * 2.6));
  if (tw > 0.3) _star4(ctx, 0, -43, 1.5 + tw * 2.5, T, `rgba(255,255,255,${(tw * 0.9).toFixed(3)})`);
  _face(ctx, S, { y: -17.5, sep: 10, rx: 3.1, ry: 3.3, iris: [130, 205, 255], skin: [196, 232, 250],
                  dark: [14, 36, 60], style: 'sharp', lash: true, blush: [175, 220, 255], mouthY: 7, mouthW: 2.3 });
}

function _fist(ctx, s, S) {
  const T = S.T, st = S.state;
  let fx = s * 21, fy = -12 + Math.sin(T * 2.4 + s) * 1.6, rot = s * 0.2;
  if (st === 'MOVING') {                               // swing forward with travel
    const dir = S.vx >= 0 ? 1 : -1;
    const lead = s === dir ? 1 : 0;
    fx += dir * (lead ? 5 : -3) * S.speed; fy += lead ? -2 : 1;
  } else if (st === 'CELEBRATING') {                 // alternating fist pumps
    const up = Math.max(0, Math.sin(T * 7 + (s > 0 ? 0 : Math.PI)));
    fy -= 6 + up * 12; fx = s * (17 + up * 2); rot = -s * 0.3;
  } else if (st === 'COLLECTING') {
    fy -= 4; fx = s * 18;
  }
  ctx.save(); ctx.translate(fx, fy); ctx.rotate(rot);
  _glow(ctx, 0, 0, 10, [255, 110, 20], 0.25);
  ctx.beginPath(); ctx.roundRect(-5.2, -4.8, 10.4, 9.6, 3.2);
  ctx.fillStyle = _litGrad(ctx, 0, 0, 7, [120, 80, 64], [72, 44, 36], [34, 20, 17]); ctx.fill();
  ctx.strokeStyle = 'rgba(20,10,8,0.8)'; ctx.lineWidth = 0.9; ctx.stroke();
  const glowA = 0.6 + 0.4 * Math.sin(T * 3.1 + s);
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) { ctx.moveTo(k * 2.6, -4.2); ctx.lineTo(k * 2.6, -1.2); }
  ctx.moveTo(-4.5, 1.2); ctx.lineTo(4.5, 1.2);
  ctx.strokeStyle = `rgba(255,150,30,${glowA.toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

function _drawBlaze(ctx, S) {                       // BLAZE — magma golem with floating fists
  const T = S.T;
  const pulse = 0.65 + 0.35 * Math.sin(T * 3.1);
  // head flame
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  [[[255, 70, 10], 0.55, 1], [[255, 170, 40], 0.7, 0.62], [[255, 245, 170], 0.8, 0.35]].forEach(([rgb, a, k], li) => {
    [[-3.5, 9], [0, 14], [3.5, 9]].forEach(([bx, h], i) => {
      _flameTongue(ctx, bx, -28, 3.6 * k, (h * (0.85 + 0.25 * Math.sin(T * 8 + i * 2 + li))) * k + 2, -S.vx * 2, T + i + li);
      ctx.fillStyle = _c(rgb, a); ctx.fill();
    });
  });
  ctx.restore();
  // rock body
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * _TAU - Math.PI / 2;
    const r = 15.2 * (0.86 + 0.14 * _hash(i + 3));
    pts.push([Math.cos(a) * r * 1.06, -16 + Math.sin(a) * r * (a > 0 && a < Math.PI ? 1.02 : 0.98)]);
  }
  const rock = () => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
    }
    const p0 = pts[0], q0 = pts[1];
    ctx.quadraticCurveTo(p0[0], p0[1], (p0[0] + q0[0]) / 2, (p0[1] + q0[1]) / 2);
    ctx.closePath();
  };
  _glow(ctx, 0, -16, 26, [255, 90, 10], 0.22 * pulse);
  rock(); ctx.fillStyle = _litGrad(ctx, 0, -16, 17, [128, 86, 70], [72, 44, 36], [28, 17, 15]); ctx.fill();
  ctx.save(); rock(); ctx.clip();
  const cracks = [[[-8, -28], [-5, -21], [-7, -15]], [[5, -29], [3, -22], [7, -17], [5, -11]], [[-12, -12], [-6, -8], [-3, -1]],
                  [[11, -6], [6, -3], [2, 1]], [[-2, -30], [0, -26]]];
  ctx.globalCompositeOperation = 'lighter';
  cracks.forEach((cr, i) => {
    const a = pulse * (0.7 + 0.3 * Math.sin(T * 2 + i * 1.7));
    ctx.beginPath(); cr.forEach(([cx0, cy0], k) => (k ? ctx.lineTo(cx0, cy0) : ctx.moveTo(cx0, cy0)));
    ctx.strokeStyle = `rgba(255,90,10,${(a * 0.5).toFixed(3)})`; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = `rgba(255,170,40,${(a * 0.85).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = `rgba(255,240,170,${(a * 0.8).toFixed(3)})`; ctx.lineWidth = 0.5; ctx.stroke();
  });
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 10; i++) {                     // rock grit
    ctx.beginPath(); ctx.arc((_hash(i + 40) - 0.5) * 26, -16 + (_hash(i + 70) - 0.5) * 26, 0.6 + _hash(i + 3) * 0.8, 0, _TAU);
    ctx.fillStyle = _hash(i + 1) > 0.5 ? 'rgba(160,120,100,0.35)' : 'rgba(10,5,5,0.35)'; ctx.fill();
  }
  ctx.restore();
  rock(); ctx.strokeStyle = 'rgba(16,8,6,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
  rock(); _rim(ctx, 0, -16, 16, [255, 120, 40], 0.7, 1.4);
  // molten drip
  const dp = _fract(T * 0.45);
  if (dp < 0.7) {
    const dy = dp < 0.35 ? 0 : (dp - 0.35) * 40;
    const dr = dp < 0.35 ? 0.6 + dp * 4 : 2;
    ctx.beginPath(); ctx.arc(2, 1 + dy, dr, 0, _TAU); ctx.fillStyle = 'rgba(255,160,40,0.95)'; ctx.fill();
    _glow(ctx, 2, 1 + dy, 5, [255, 110, 20], 0.5);
  }
  _face(ctx, S, { y: -16.5, sep: 11, rx: 3.2, ry: 2.3, iris: [255, 205, 70], style: 'glow',
                  brow: 'ledge', browCol: [34, 20, 16], mouth: 'lava', mouthY: 8, mouthW: 3.6, fang: false });
  for (const s of [-1, 1]) _fist(ctx, s, S);
}

function _drawZephyr(ctx, S) {                      // ZEPHYR — breezy wind sprite
  const T = S.T;
  // tornado tail
  for (let k = 24; k >= 0; k--) {
    const u = k / 24;
    const ang = u * 4.2 * Math.PI + T * 3.2;
    const rad = 6.5 * (1 - u) + 1.5;
    const px = Math.cos(ang) * rad * (1 - u * 0.4) - S.vx * u * 7;
    const py = -9 + u * 20;
    ctx.beginPath(); ctx.arc(px, py, (7.5 * (1 - u) + 0.8) * 0.55, 0, _TAU);
    ctx.fillStyle = `rgba(150,255,215,${(0.32 * (1 - u) + 0.05).toFixed(3)})`; ctx.fill();
  }
  // feather ears
  for (const s of [-1, 1]) {
    const fl = Math.sin(T * 4 + s) * 0.15 - S.vx * 0.06;
    ctx.save(); ctx.translate(s * 6, -30); ctx.rotate(s * 0.55 + fl - S.speed * 0.3 * s);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(s * 4, -4, s * 5, -12, s * 2, -17);
    ctx.bezierCurveTo(s * -1, -12, s * -2, -5, 0, 0); ctx.closePath();
    const eg = ctx.createLinearGradient(0, 0, s * 2, -17);
    eg.addColorStop(0, 'rgba(110,235,190,0.95)'); eg.addColorStop(1, 'rgba(230,255,245,0.9)');
    ctx.fillStyle = eg; ctx.fill(); ctx.strokeStyle = 'rgba(40,140,110,0.6)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.quadraticCurveTo(s * 2, -8, s * 2, -15);
    ctx.strokeStyle = 'rgba(40,150,115,0.5)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.restore();
  }
  // head / body
  const path = () => _blobPath(ctx, 0, -19, 36, (a) => 13.6 * (1 + 0.05 * Math.sin(a) + 0.025 * Math.sin(3 * a + T * 3)));
  path(); ctx.fillStyle = _litGrad(ctx, 0, -19, 15, [232, 255, 247], [128, 250, 206], [36, 146, 126]);
  ctx.globalAlpha = 0.96; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(22,110,90,0.6)'; ctx.lineWidth = 1.05; ctx.stroke();
  path(); _rim(ctx, 0, -19, 14, [220, 255, 245], 0.8, 1.3);
  // swirl mark
  ctx.beginPath();
  for (let k = 0; k <= 20; k++) {
    const a = k * 0.45 + T * 0.6, r = 0.3 + k * 0.17;
    const px = 5 + Math.cos(a) * r, py = -27 + Math.sin(a) * r * 0.8;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  _spec(ctx, 7, -26, 2.8, 1.8, 0.55, 0.5);
  _face(ctx, S, { y: -18.5, sep: 10.5, rx: 3, ry: 3.7, iris: [60, 190, 160], skin: [140, 246, 210],
                  style: 'playful', blush: [255, 170, 195], mouthY: 6.8, mouthW: 3 });
}

function _drawVoid(ctx, S) {                        // VOID — a shadow holding a galaxy
  const T = S.T;
  // smoke wisps behind
  for (let i = 0; i < 6; i++) {
    const p = _fract(T * 0.3 + i / 6);
    const sx = Math.sin(i * 2.4 + T * 0.4) * (10 + p * 10), sy = -8 - p * 30;
    _glow(ctx, sx, sy, 5 + p * 7, [60, 20, 90], (1 - p) * 0.45);
  }
  const path = () => {
    ctx.beginPath(); ctx.moveTo(-15, -20);
    ctx.arc(0, -20, 15, Math.PI, 0);
    ctx.bezierCurveTo(15.5, -10, 14.5, -4, 13.5, 1);
    for (let k = 0; k <= 8; k++) {
      const u = k / 8, px = 13.5 - u * 27;
      const py = 1 + Math.sin(u * 9.4 + T * 3.2) * 2.6 + (k % 2 ? 2.2 : 0);
      ctx.lineTo(px, py);
    }
    ctx.bezierCurveTo(-14.5, -4, -15.5, -10, -15, -20);
    ctx.closePath();
  };
  // event horizon ring
  ctx.save(); ctx.translate(0, -18); ctx.rotate(-0.25 + Math.sin(T * 0.5) * 0.06);
  ctx.beginPath(); ctx.ellipse(0, 0, 25, 6.5, 0, 0, _TAU);
  ctx.strokeStyle = 'rgba(200,110,255,0.18)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = 'rgba(235,180,255,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.restore();
  path(); const bg = ctx.createLinearGradient(0, -36, 0, 4);
  bg.addColorStop(0, 'rgb(46,18,78)'); bg.addColorStop(1, 'rgb(8,3,16)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  _glow(ctx, -5 + Math.sin(T * 0.4) * 3, -14, 12, [180, 50, 255], 0.3);
  _glow(ctx, 6, -24 + Math.cos(T * 0.5) * 2, 10, [255, 70, 190], 0.22);
  for (let i = 0; i < 16; i++) {
    const sx = (_hash(i + 101) - 0.5) * 30;
    const sy = -36 + _fract(_hash(i + 202) + T * 0.04) * 40;
    const tw = 0.4 + 0.6 * Math.max(0, Math.sin(T * (1 + _hash(i) * 2) + i));
    ctx.beginPath(); ctx.arc(sx, sy, 0.4 + _hash(i + 303) * 0.55, 0, _TAU);
    ctx.fillStyle = `rgba(240,225,255,${(tw * 0.9).toFixed(3)})`; ctx.fill();
  }
  ctx.restore();
  path(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.1; ctx.stroke();
  path(); _rim(ctx, 0, -16, 16, [205, 120, 255], 0.9, 1.4);
  _face(ctx, S, { y: -19, sep: 11, rx: 3.5, ry: 2.4, iris: [235, 165, 255], style: 'glow', slant: 0.32,
                  mouth: 'none', mouthY: 7.5, mouthW: 2.8 });
}

function _drawAurora(ctx, S) {                      // AURORA — dawn spirit with ribbon wings
  const T = S.T;
  // soft dawn rays
  ctx.save(); ctx.translate(0, -16); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = T * 0.3 + (i / 7) * _TAU, ln = 18 + Math.sin(T * 1.3 + i * 1.7) * 6;
    ctx.save(); ctx.rotate(a);
    const g = ctx.createLinearGradient(12, 0, 12 + ln, 0);
    g.addColorStop(0, 'rgba(255,230,160,0.11)'); g.addColorStop(1, 'rgba(255,230,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(12, -1.2); ctx.lineTo(12 + ln, -3.2); ctx.lineTo(12 + ln, 3.2); ctx.lineTo(12, 1.2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // aurora ribbon wings
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const wv = Math.sin(T * 2.2 + k * 1.3 + (s > 0 ? 0 : 0.8)) * 3.5 + (S.state === 'MOVING' ? S.speed * 4 : 0);
      const tipX = s * (27 + k * 5), tipY = -31 + k * 13 + wv;
      ctx.beginPath(); ctx.moveTo(s * 8, -21 + k * 5);
      ctx.bezierCurveTo(s * 15, -30 + k * 6 + wv * 0.5, s * 22, -34 + k * 10 + wv, tipX, tipY);
      ctx.bezierCurveTo(s * 20, -26 + k * 12 + wv * 0.6, s * 14, -16 + k * 6, s * 8, -13 + k * 4);
      ctx.closePath();
      const rg = ctx.createLinearGradient(s * 8, 0, tipX, 0);
      rg.addColorStop(0, `rgba(255,150,205,${0.55 - k * 0.1})`);
      rg.addColorStop(0.5, `rgba(255,220,120,${0.5 - k * 0.1})`);
      rg.addColorStop(1, 'rgba(140,255,215,0.08)');
      ctx.fillStyle = rg; ctx.fill();
      ctx.strokeStyle = `rgba(255,245,210,${0.35 - k * 0.1})`; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  // halo
  const hy = -38 + Math.sin(T * 1.4) * 1.3;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); ctx.ellipse(0, hy, 9.5, 2.9, 0, 0, _TAU);
  ctx.strokeStyle = 'rgba(255,215,90,0.35)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,245,190,0.95)'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.restore();
  // warm orb body
  _glow(ctx, 0, -16, 24, [255, 200, 90], 0.3);
  const path = () => _blobPath(ctx, 0, -16, 40, (a) => 14.4 * (1 + 0.035 * Math.sin(a) + 0.015 * Math.sin(4 * a + T * 2)));
  path();
  const bg = ctx.createRadialGradient(2, -20, 1, 0, -16, 16);
  bg.addColorStop(0, 'rgb(255,252,232)'); bg.addColorStop(0.45, 'rgb(255,222,120)');
  bg.addColorStop(0.85, 'rgb(250,165,70)'); bg.addColorStop(1, 'rgb(215,120,55)');
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = 'rgba(150,80,20,0.55)'; ctx.lineWidth = 1.05; ctx.stroke();
  path(); _rim(ctx, 0, -16, 15, [255, 240, 200], 0.8, 1.3);
  _spec(ctx, 6.5, -24, 3.2, 2.1, 0.7, 0.55);
  _face(ctx, S, { y: -15.5, sep: 11, rx: 3.2, ry: 3.9, iris: [200, 128, 60], skin: [255, 212, 112],
                  dark: [40, 18, 6], style: 'kind', lash: true, blush: [255, 140, 150], mouthY: 7, mouthW: 3 });
}

// ---------------------------------------------------------------------------
// motion trails (stateless: particles derived from time)
// ---------------------------------------------------------------------------
function _trail(ctx, S) {
  const { speed, vx, vy, spd, ch, T } = S;
  if (speed < 0.05) return;
  const bx = -vx / (spd || 1), by = -vy / (spd || 1);
  const px = -by, py = bx;
  // soft afterimages
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.ellipse(bx * i * 8 * speed, -16 + by * i * 8 * speed, 14 - i * 2.8, 17 - i * 3.2, 0, 0, _TAU);
    ctx.fillStyle = _c(ch.col, 0.11 - i * 0.03); ctx.fill();
  }
  for (let k = 0; k < 9; k++) {
    const p = _fract(T * 1.7 + k / 9);
    const d = (12 + p * 38) * speed;
    const wob = Math.sin(k * 2.3 + T * 5) * (2 + p * 6);
    const x = bx * d + px * wob, y = -16 + by * d + py * wob;
    const a = (1 - p) * 0.85, s = 1 - p * 0.6;
    switch (ch.trail) {
      case 'drop':
        ctx.beginPath(); ctx.arc(x, y, 1.6 * s, 0, _TAU); ctx.fillStyle = `rgba(190,255,240,${(a * 0.8).toFixed(3)})`; ctx.fill(); break;
      case 'spark': case 'ember':
        _glow(ctx, x, y, 4 * s, [255, 140, 40], a * 0.5);
        ctx.beginPath(); ctx.arc(x, y, 1.1 * s, 0, _TAU); ctx.fillStyle = `rgba(255,${(220 - p * 120) | 0},90,${a.toFixed(3)})`; ctx.fill(); break;
      case 'star':
        _star4(ctx, x, y, 2.2 * s, T * 2 + k, `rgba(230,215,255,${a.toFixed(3)})`); break;
      case 'leaf':
        ctx.save(); ctx.translate(x, y); ctx.rotate(T * 3 + k);
        ctx.beginPath(); ctx.ellipse(0, 0, 2.4 * s, 1.1 * s, 0, 0, _TAU);
        ctx.fillStyle = `rgba(130,185,70,${a.toFixed(3)})`; ctx.fill(); ctx.restore(); break;
      case 'bolt':
        if (k % 3 === 0) _bolt(ctx, x, y, x + bx * 6, y + by * 6 + 2, Math.floor(T * 10) + k, 0.45, [120, 240, 255], a);
        else { ctx.beginPath(); ctx.arc(x, y, 1 * s, 0, _TAU); ctx.fillStyle = `rgba(150,235,255,${(a * 0.7).toFixed(3)})`; ctx.fill(); }
        break;
      case 'shard':
        ctx.save(); ctx.translate(x, y); ctx.rotate(T * 2 + k);
        ctx.beginPath(); ctx.moveTo(0, -2.4 * s); ctx.lineTo(1.3 * s, 0); ctx.lineTo(0, 2.4 * s); ctx.lineTo(-1.3 * s, 0); ctx.closePath();
        ctx.fillStyle = `rgba(225,248,255,${a.toFixed(3)})`; ctx.fill(); ctx.restore(); break;
      case 'wind':
        ctx.beginPath(); ctx.arc(x, y, 4 + p * 4, k, k + 1.4);
        ctx.strokeStyle = `rgba(170,255,225,${(a * 0.6).toFixed(3)})`; ctx.lineWidth = 0.9; ctx.stroke(); break;
      case 'smoke':
        _glow(ctx, x, y, 5 + p * 6, [70, 25, 110], a * 0.55);
        if (k % 2) { ctx.beginPath(); ctx.arc(x, y, 0.6, 0, _TAU); ctx.fillStyle = `rgba(235,200,255,${a.toFixed(3)})`; ctx.fill(); }
        break;
      case 'light':
        _glow(ctx, x, y, 4 * s, [255, 220, 120], a * 0.55);
        ctx.beginPath(); ctx.arc(x, y, 0.9 * s, 0, _TAU); ctx.fillStyle = `rgba(255,250,220,${a.toFixed(3)})`; ctx.fill(); break;
    }
  }
}

// signature ambient effects around each character
function _ambient(ctx, S) {
  const { ch, T } = S;
  switch (ch.id) {
    case 'spirit': {                                   // water ring
      if (S.land) break;
      const rp = _fract(T * 0.55 + 0.3);
      ctx.beginPath(); ctx.ellipse(0, 4, 14 + rp * 22, 3.6 + rp * 6, 0, 0, _TAU);
      ctx.strokeStyle = `rgba(150,240,215,${((1 - rp) * 0.4).toFixed(3)})`; ctx.lineWidth = 1.1; ctx.stroke();
      break;
    }
    case 'ember':                                      // rising sparks
      for (let i = 0; i < 9; i++) {
        const sp = _fract(T * (0.7 + (i % 3) * 0.3) + i * 0.37);
        const sx = Math.sin(i * 2.6 + sp * 3) * (6 + sp * 14), sy = -30 - sp * 26;
        _glow(ctx, sx, sy, 3.5 * (1 - sp), [255, 150, 40], (1 - sp) * 0.5);
        ctx.beginPath(); ctx.arc(sx, sy, 1.2 * (1 - sp) + 0.2, 0, _TAU);
        ctx.fillStyle = `rgba(255,${(215 - sp * 110) | 0},80,${((1 - sp) * 0.9).toFixed(3)})`; ctx.fill();
      }
      break;
    case 'luna':                                       // orbiting mini moons (front half)
      for (let i = 0; i < 2; i++) {
        const a = T * (0.8 - i * 0.25) + i * 2.6;
        if (Math.sin(a) < 0) continue;
        const px = Math.cos(a) * (27 + i * 6), py = -14 + Math.sin(a) * (9 + i * 3);
        const r = 2.8 - i * 0.7;
        _glow(ctx, px, py, r * 3, [210, 190, 255], 0.35);
        ctx.beginPath(); ctx.arc(px, py, r, 0, _TAU);
        ctx.fillStyle = _litGrad(ctx, px, py, r, [255, 250, 235], [210, 195, 255], [120, 95, 200]); ctx.fill();
      }
      break;
    case 'moss':                                       // drifting golden spores
      for (let i = 0; i < 8; i++) {
        const sx = Math.sin(i * 2.4 + T * 0.5) * 27, sy = -16 + Math.cos(i * 1.9 + T * 0.4) * 24;
        const a = 0.3 + Math.sin(T * 1.5 + i) * 0.2;
        _glow(ctx, sx, sy, 4, [240, 200, 90], a * 0.6);
        ctx.beginPath(); ctx.arc(sx, sy, 1, 0, _TAU); ctx.fillStyle = `rgba(255,235,150,${a.toFixed(3)})`; ctx.fill();
      }
      break;
    case 'kira':                                       // orbiting ice shards + snowflakes
      for (let i = 0; i < 5; i++) {
        const a = T * 1.05 + (i / 5) * _TAU;
        if (Math.sin(a) < -0.2) continue;
        const px = Math.cos(a) * 27, py = -16 + Math.sin(a) * 10;
        ctx.save(); ctx.translate(px, py); ctx.rotate(a * 2);
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(2.2, 0); ctx.lineTo(0, 4); ctx.lineTo(-2.2, 0); ctx.closePath();
        const g = ctx.createLinearGradient(-2, 2, 2, -3);
        g.addColorStop(0, 'rgba(150,210,245,0.9)'); g.addColorStop(1, 'rgba(250,255,255,0.95)');
        ctx.fillStyle = g; ctx.fill(); ctx.restore();
      }
      for (let i = 0; i < 4; i++) {
        const p = _fract(T * 0.25 + i * 0.27);
        const fx = Math.sin(i * 3.1 + T * 0.6) * 22, fy = -40 + p * 44;
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(T + i);
        ctx.strokeStyle = `rgba(230,248,255,${(Math.sin(p * Math.PI) * 0.7).toFixed(3)})`; ctx.lineWidth = 0.5;
        for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.stroke(); }
        ctx.restore();
      }
      break;
    case 'blaze':                                      // embers + heat shimmer
      for (let i = 0; i < 6; i++) {
        const sp = _fract(T * 0.8 + i * 0.29);
        const sx = Math.sin(i * 1.9 + sp * 4) * (8 + sp * 10), sy = -24 - sp * 30;
        _glow(ctx, sx, sy, 3 * (1 - sp), [255, 120, 30], (1 - sp) * 0.55);
      }
      break;
    case 'zephyr':                                     // wind arcs + riding leaf
      for (let i = 0; i < 3; i++) {
        const a = T * 1.8 + i * 2.1, r = 22 + Math.sin(T * 2 + i) * 4;
        ctx.beginPath(); ctx.arc(0, -18, r, a, a + 0.9);
        ctx.strokeStyle = `rgba(190,255,230,${(0.35 + Math.sin(T * 3 + i) * 0.12).toFixed(3)})`;
        ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.stroke();
      }
      {
        const a = T * 1.4, lx = Math.cos(a) * 25, ly = -18 + Math.sin(a) * 11;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(a * 2.5);
        ctx.beginPath(); ctx.moveTo(-3.5, 0); ctx.quadraticCurveTo(0, -2.6, 3.5, 0); ctx.quadraticCurveTo(0, 2.6, -3.5, 0);
        ctx.fillStyle = 'rgba(120,200,80,0.9)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.strokeStyle = 'rgba(60,120,40,0.8)'; ctx.lineWidth = 0.4; ctx.stroke();
        ctx.restore();
      }
      break;
    case 'void':                                       // watching eyes in the dark
      [[-19, -30, 1.6], [18, -26, 2], [-20, -8, 1.3]].forEach(([ex, ey, er], i) => {
        const op = 0.45 + Math.sin(T * 1.7 + i * 2.2) * 0.4;
        if (op < 0.2) return;
        _glow(ctx, ex, ey, er * 4, [200, 90, 255], op * 0.3);
        ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 1.4, 0, 0, _TAU);
        ctx.fillStyle = `rgba(235,170,255,${op.toFixed(3)})`; ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex, ey, er * 0.35, er, 0, 0, _TAU);
        ctx.fillStyle = 'rgba(10,0,16,0.95)'; ctx.fill();
      });
      break;
    case 'aurora':                                     // rising light motes
      for (let i = 0; i < 6; i++) {
        const p = _fract(T * 0.35 + i / 6);
        const mx = Math.sin(i * 2.7 + T * 0.7) * 20, my = -2 - p * 44;
        _glow(ctx, mx, my, 4, [255, 225, 140], Math.sin(p * Math.PI) * 0.5);
      }
      break;
  }
}

const SPIRIT_CHARS = {};
[
  ['spirit', 'Spirit', 'Drifts like water, calm and pure',        [93, 202, 165],  _drawWater,  'drop'],
  ['ember',  'Ember',  'Burns bright, fierce and fearless',       [255, 122, 53],  _drawEmber,  'spark'],
  ['luna',   'Luna',   'Dances among stars, dreams of sky',       [155, 114, 255], _drawLuna,   'star'],
  ['moss',   'Moss',   'Roots run deep, ancient and wise',        [200, 168, 75],  _drawMoss,   'leaf'],
  ['storm',  'Storm',  'Thunderclouds given living form',         [0, 238, 255],   _drawStorm,  'bolt'],
  ['kira',   'Kira',   'Ice-cold, razor-sharp, impossible grace', [170, 232, 255], _drawKira,   'shard'],
  ['blaze',  'Blaze',  'Born from the core, fists of pure magma', [255, 85, 0],    _drawBlaze,  'ember'],
  ['zephyr', 'Zephyr', 'Rides the gale, weightless and free',     [128, 255, 208], _drawZephyr, 'wind'],
  ['void',   'Void',   'Silence between stars, shadow made alive', [204, 68, 255], _drawVoid,   'smoke'],
  ['aurora', 'Aurora', 'First light of dawn, warmth and wonder',  [255, 220, 96],  _drawAurora, 'light']
].forEach(([id, name, tag, col, draw, trail], i) => {
  SPIRIT_CHARS[id] = {
    id, name, tag, col, draw, trail, fx: trail, seed: i * 1.73,
    hi: _mix(col, [255, 255, 255], 0.45),
    lo: _mix(col, [0, 0, 0], 0.35)
  };
});

function drawSpirit(ctx, x, y, t, state, characterId, opts) {
  opts = opts || {};
  const ch = SPIRIT_CHARS[characterId] || SPIRIT_CHARS.spirit;
  const scale = opts.scale || 1;
  const vx = opts.vx !== undefined ? opts.vx : (state === 'MOVING' ? 2.2 : 0);
  const vy = opts.vy || 0;
  const spd = Math.hypot(vx, vy);
  const speed = Math.min(1, spd / 3);
  const T = t + ch.seed;
  // smooth blink (lids sweep down and back up), per-character cadence
  const bp = T % (3.3 + (ch.seed % 1.3));
  const blink = bp < 0.18 ? Math.sin((bp / 0.18) * Math.PI) : 0;
  const wp = (T * 0.8) % 5.5;
  const wink = wp < 0.35 ? Math.sin((wp / 0.35) * Math.PI) : 0;
  const moving = state === 'MOVING';
  const S = {
    t, T, state, ch, vx, vy, spd, speed, blink, wink,
    lookX: moving ? _clamp(vx * 0.9, -2.2, 2.2) : Math.sin(T * 0.45) * 1.1,
    lookY: moving ? _clamp(vy * 0.8, -1.4, 1.6) : Math.sin(T * 0.31) * 0.45,
    land: !!opts.land
  };

  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  // glow pooled on the water beneath
  const breathe = state === 'IDLE' ? 0.3 + Math.sin(T * 1.6) * 0.07 : state === 'COLLECTING' ? 0.5 : 0.36;
  if (!opts.land) {
    ctx.save(); ctx.scale(1, 0.24);
    _glow(ctx, 0, 18, 30, ch.col, breathe * 0.9);
    ctx.restore();
  }

  const bob = state === 'IDLE' ? Math.sin(T * 1.4) * 2.6 : Math.sin(T * 2.2) * 1.2;
  ctx.translate(0, bob);
  // aura
  _glow(ctx, 0, -16, 50, ch.col, breathe * 0.75);
  _glow(ctx, 0, -16, 26, ch.col, 0.28);

  if (moving) _trail(ctx, S);

  // lean into movement / celebratory hop-spin
  ctx.save();
  if (moving) ctx.rotate(_clamp(vx * 0.085, -0.38, 0.38));
  else if (state === 'CELEBRATING') { ctx.translate(0, -Math.abs(Math.sin(T * 5)) * 7); ctx.rotate(Math.sin(T * 6) * 0.16); }
  let stretch = 1;
  if (moving) stretch = 1 + speed * 0.16;
  else if (state === 'IDLE') stretch = 1 + Math.sin(T * 1.4 + 1.2) * 0.03;
  else if (state === 'CELEBRATING') stretch = 0.93 + Math.abs(Math.sin(T * 5)) * 0.14;
  else if (state === 'COLLECTING') stretch = 1.04 + Math.sin(T * 14) * 0.03;
  ctx.translate(0, 2); ctx.scale(1 / Math.sqrt(stretch), stretch); ctx.translate(0, -2);
  ch.draw(ctx, S);
  ctx.restore();

  _ambient(ctx, S);

  // COLLECTING — flash ring + sparkles + spinning 4-point stars
  if (state === 'COLLECTING') {
    const cp = _fract(t * 1.4);
    ctx.beginPath(); ctx.arc(0, -16, 12 + cp * 30, 0, _TAU);
    ctx.strokeStyle = `rgba(255,255,255,${((1 - cp) * 0.6).toFixed(3)})`;
    ctx.lineWidth = 2 - cp; ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * _TAU + cp * 1.2, r = 14 + cp * 26;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, -16 + Math.sin(a) * r, 1.4, 0, _TAU);
      ctx.fillStyle = _c(ch.hi, (1 - cp) * 0.9); ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * _TAU + 0.6, r = 18 + cp * 20;
      _star4(ctx, Math.cos(a) * r, -16 + Math.sin(a) * r, (1 - cp) * 3, cp * 2.5, `rgba(255,255,235,${((1 - cp) * 0.9).toFixed(3)})`);
    }
  }
  // CELEBRATING — orbiting sparkle stars
  if (state === 'CELEBRATING') {
    for (let i = 0; i < 7; i++) {
      const a = t * 4 + (i / 7) * _TAU;
      const tw = 0.5 + 0.5 * Math.sin(t * 9 + i * 2);
      _star4(ctx, Math.cos(a) * 30, -18 + Math.sin(a) * 14, 3, a, `rgba(255,255,220,${(0.4 + tw * 0.5).toFixed(3)})`);
    }
  }
  ctx.restore();
}

// ============================================================================
// ENEMIES — v2 (2026-09-25)
// ============================================================================

function _drawCroc(ctx, x, y, t, opts) {
  const st = opts.state;
  const open = st === 'telegraph' ? 0.34 + Math.sin(t * 22) * 0.04 : st === 'charge' ? 0.5 : 0.04 + Math.max(0, Math.sin(t * 0.8)) * 0.05;
  ctx.save(); ctx.translate(x, y + Math.sin(t * 1.1) * 1.2);
  if (opts.flip) ctx.scale(-1, 1);
  // submerged body silhouette trailing behind the head
  ctx.save(); ctx.globalAlpha = 0.42;
  const tail = (u) => Math.sin(t * 2.2 - u * 4) * 5 * u;
  ctx.beginPath(); ctx.moveTo(8, 3);
  for (let k = 0; k <= 12; k++) { const u = k / 12; ctx.lineTo(8 + u * 92, 5 - (1 - u) * 5 + tail(u)); }
  for (let k = 12; k >= 0; k--) { const u = k / 12; ctx.lineTo(8 + u * 92, 7 + (1 - u) * 8 + tail(u)); }
  ctx.closePath();
  const ub = ctx.createLinearGradient(8, 0, 100, 0);
  ub.addColorStop(0, 'rgba(10,40,34,0.9)'); ub.addColorStop(1, 'rgba(10,40,34,0)');
  ctx.fillStyle = ub; ctx.fill();
  for (const lx of [22, 54]) {                     // paddling legs
    ctx.beginPath(); ctx.ellipse(lx + Math.sin(t * 3 + lx) * 2, 13, 5, 2, 0.4, 0, _TAU);
    ctx.fillStyle = 'rgba(10,40,34,0.8)'; ctx.fill();
  }
  ctx.restore();
  // V-wake
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(18, s * 2);
    ctx.quadraticCurveTo(58, s * 9, 96, s * 16);
    ctx.strokeStyle = `rgba(150,225,205,${st === 'charge' ? 0.35 : 0.16})`; ctx.lineWidth = 1.4; ctx.stroke();
  }
  // back scutes above the water
  for (let i = 0; i < 9; i++) {
    const sx = 22 + i * 7.5, sh = 3.6 - i * 0.3, sy = -0.5 + tail((sx - 8) / 92) * 0.3;
    ctx.beginPath(); ctx.moveTo(sx - 3, sy); ctx.quadraticCurveTo(sx, sy - sh * 1.6, sx + 3, sy); ctx.closePath();
    const sg = ctx.createLinearGradient(sx, sy - sh, sx, sy);
    sg.addColorStop(0, 'rgb(96,126,72)'); sg.addColorStop(1, 'rgb(28,52,32)');
    ctx.fillStyle = sg; ctx.fill();
  }
  const HX = 10, HY = -3;                            // jaw hinge
  // lower jaw (mostly submerged), swings down
  ctx.save(); ctx.translate(HX, HY); ctx.rotate(-open * 0.45);
  ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(-44, 3.5); ctx.quadraticCurveTo(-47, 6, -40, 7.5); ctx.quadraticCurveTo(-14, 9, 6, 7); ctx.closePath();
  ctx.fillStyle = 'rgb(58,84,52)'; ctx.fill();
  // mouth interior
  ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(-42, 3.2); ctx.lineTo(-40, 1.2); ctx.lineTo(2, 0.5); ctx.closePath();
  ctx.fillStyle = 'rgb(170,70,80)'; ctx.fill();
  ctx.fillStyle = 'rgba(250,245,225,0.95)';           // lower teeth
  for (let k = 0; k < 9; k++) { const tx = -40 + k * 4.6; ctx.beginPath(); ctx.moveTo(tx - 1, 2.8); ctx.lineTo(tx + 1, 2.8); ctx.lineTo(tx, 0.2); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // upper jaw / skull, lifts up when open
  ctx.save(); ctx.translate(HX, HY); ctx.rotate(open * 0.62);
  if (open > 0.1) {                                   // palate
    ctx.beginPath(); ctx.moveTo(2, 1.2); ctx.lineTo(-44, 2.2); ctx.lineTo(-40, 4.5); ctx.lineTo(2, 3.5); ctx.closePath();
    ctx.fillStyle = 'rgb(200,95,100)'; ctx.fill();
  }
  const skull = () => {
    ctx.beginPath();
    ctx.moveTo(-48, 1.5);
    ctx.bezierCurveTo(-49, -4, -44, -6.5, -36, -6);
    ctx.bezierCurveTo(-26, -5.5, -18, -7, -14, -9);
    ctx.bezierCurveTo(-10, -13, -2, -13, 4, -10);
    ctx.bezierCurveTo(10, -8, 16, -5, 20, -2);
    ctx.lineTo(20, 2.5);
    ctx.lineTo(-44, 2.5);
    ctx.closePath();
  };
  skull();
  const hg = ctx.createLinearGradient(0, -13, 0, 3);
  hg.addColorStop(0, 'rgb(104,136,80)'); hg.addColorStop(0.55, 'rgb(54,84,50)'); hg.addColorStop(1, 'rgb(26,48,30)');
  ctx.fillStyle = hg; ctx.fill();
  ctx.save(); skull(); ctx.clip();
  for (let r = 0; r < 3; r++) {                      // scale rows
    for (let k = 0; k < 12; k++) {
      const sx = -42 + k * 5.5 + (r % 2) * 2.7, sy = -3.5 - r * 2.6;
      ctx.beginPath(); ctx.arc(sx, sy, 1.9, Math.PI * 0.1, Math.PI * 0.9);
      ctx.strokeStyle = 'rgba(20,40,24,0.45)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  _spec(ctx, -18, -8, 12, 1.4, 0.18, -0.08);
  ctx.restore();
  skull(); ctx.strokeStyle = 'rgba(10,24,14,0.85)'; ctx.lineWidth = 0.9; ctx.stroke();
  // upper teeth along the jawline
  ctx.fillStyle = 'rgba(250,245,225,0.95)';
  for (let k = 0; k < 10; k++) {
    const tx = -43 + k * 4.4, big = k === 1 || k === 6;
    ctx.beginPath(); ctx.moveTo(tx - 1.1, 2.3); ctx.lineTo(tx + 1.1, 2.3); ctx.lineTo(tx, 2.3 + (big ? 3.4 : 2.2)); ctx.closePath(); ctx.fill();
  }
  // nostril bump
  ctx.beginPath(); ctx.ellipse(-43, -5.6, 3.2, 2, 0, Math.PI, 0);
  ctx.fillStyle = 'rgb(76,106,62)'; ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath(); ctx.ellipse(-44.3, -6.4, 0.6, 0.9, 0, 0, _TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-41.7, -6.4, 0.6, 0.9, 0, 0, _TAU); ctx.fill();
  // eye turrets (far eye first, slightly darker)
  [[3, -11.5, 0.8], [-6, -12.5, 1]].forEach(([ex, ey, k]) => {
    ctx.beginPath(); ctx.ellipse(ex, ey, 4.6 * k, 3.4 * k, 0, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = k < 1 ? 'rgb(58,86,50)' : 'rgb(80,112,64)'; ctx.fill();
    ctx.strokeStyle = 'rgba(10,24,14,0.8)'; ctx.lineWidth = 0.7; ctx.stroke();
    const glare = st === 'telegraph' || st === 'charge';
    _glow(ctx, ex, ey - 1.2, 6 * k, [255, 190, 50], glare ? 0.55 : 0.28);
    ctx.beginPath(); ctx.ellipse(ex, ey - 1.2, 2.6 * k, 1.9 * k, 0, 0, _TAU);
    const eg = ctx.createRadialGradient(ex - 0.6, ey - 1.8, 0, ex, ey - 1.2, 2.6 * k);
    eg.addColorStop(0, 'rgb(255,240,150)'); eg.addColorStop(1, glare ? 'rgb(255,120,20)' : 'rgb(215,150,30)');
    ctx.fillStyle = eg; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, ey - 1.2, 0.5 * k, 1.7 * k, 0, 0, _TAU);
    ctx.fillStyle = 'rgba(5,5,0,0.95)'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex - 0.9 * k, ey - 2 * k, 0.5 * k, 0, _TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    // brow ridge
    ctx.beginPath(); ctx.moveTo(ex - 4 * k, ey - 2.4 * k); ctx.quadraticCurveTo(ex, ey - 4.6 * k, ex + 4 * k, ey - 2.2 * k);
    ctx.strokeStyle = 'rgba(20,40,24,0.9)'; ctx.lineWidth = 1.1; ctx.stroke();
  });
  ctx.restore();
  // waterline: submerge everything below y = 0
  const wg = ctx.createLinearGradient(0, 0, 0, 12);
  wg.addColorStop(0, 'rgba(10,37,53,0.55)'); wg.addColorStop(1, 'rgba(10,37,53,0.88)');
  ctx.fillStyle = wg; ctx.fillRect(-56, 0.5, 60, 12);
  ctx.beginPath(); ctx.moveTo(-54, 0.8);
  for (let k = 0; k <= 16; k++) ctx.lineTo(-54 + k * 4.5, 0.8 + Math.sin(t * 3 + k) * 0.5);
  ctx.strokeStyle = 'rgba(170,230,215,0.45)'; ctx.lineWidth = 0.9; ctx.stroke();
  // ripples + bubbles by the snout
  const rp = _fract(t * 0.7);
  ctx.beginPath(); ctx.ellipse(-30, 2, 20 + rp * 20, 3 + rp * 3, 0, 0, _TAU);
  ctx.strokeStyle = `rgba(150,225,205,${((1 - rp) * 0.28).toFixed(3)})`; ctx.lineWidth = 0.9; ctx.stroke();
  for (let i = 0; i < 2; i++) {
    const b = _fract(t * 0.7 + i * 0.5);
    if (b > 0.4) continue;
    ctx.beginPath(); ctx.arc(-46 + i * 3, -2 - b * 12, 0.9 + b * 1.6, 0, _TAU);
    ctx.strokeStyle = `rgba(180,230,215,${((0.4 - b) * 1.4).toFixed(3)})`; ctx.lineWidth = 0.7; ctx.stroke();
  }
  ctx.restore();
}

function _drawSnake(ctx, x, y, t, opts) {
  ctx.save(); ctx.translate(x, y);
  if (opts.flip) ctx.scale(-1, 1);
  const N = 30, L = 96;
  const P = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const ph = t * 4 - u * 6;
    P.push({
      x: -2 + u * L,
      y: Math.sin(ph) * 6.5 * (0.35 + 0.65 * u),
      w: 5.6 * (1 - u * 0.86) + 0.5,
      sub: Math.sin(ph + 1.3) < -0.35              // this stretch dips under the surface
    });
  }
  // outline normals along the centerline
  P.forEach((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(N, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
    p.nx = -dy / dl; p.ny = dx / dl;
  });
  const band = (i0, i1, k) => {                      // closed outline of P[i0..i1] at width*k
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) { const p = P[i]; const px = p.x + p.nx * p.w * k, py = p.y + p.ny * p.w * k; if (i === i0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    for (let i = i1; i >= i0; i--) { const p = P[i]; ctx.lineTo(p.x - p.nx * p.w * k, p.y - p.ny * p.w * k); }
    ctx.closePath();
  };
  // one continuous body: dark outline, green body, lighter back ridge
  band(1, N, 1.18); ctx.fillStyle = 'rgba(8,30,14,0.9)'; ctx.fill();
  band(1, N, 1); ctx.fillStyle = 'rgb(52,118,50)'; ctx.fill();
  band(1, N, 0.45); ctx.fillStyle = 'rgba(120,180,80,0.55)'; ctx.fill();
  for (let i = 4; i < N - 2; i += 3) {               // diamond back markings
    const p = P[i];
    ctx.beginPath();
    ctx.moveTo(p.x - 2.2, p.y); ctx.lineTo(p.x, p.y - p.w * 0.6); ctx.lineTo(p.x + 2.2, p.y); ctx.lineTo(p.x, p.y + p.w * 0.6); ctx.closePath();
    ctx.fillStyle = 'rgba(225,225,95,0.8)'; ctx.fill();
  }
  // submerged stretches: veil them with water in single runs (no seams)
  let run = -1;
  for (let i = 1; i <= N + 1; i++) {
    const sub = i <= N && P[i].sub;
    if (sub && run < 0) run = i;
    if (!sub && run >= 0) {
      const i1 = i - 1;
      band(Math.max(1, run - 1), Math.min(N, i1 + 1), 1.3); ctx.fillStyle = 'rgba(10,37,53,0.68)'; ctx.fill();
      for (const e of [run, i1]) {                    // ripple rings where the body breaks the surface
        const rp = _fract(t * 1.2 + e * 0.13);
        ctx.beginPath(); ctx.ellipse(P[e].x, P[e].y + 1.5, 4 + rp * 7, 1.5 + rp * 2, 0, 0, _TAU);
        ctx.strokeStyle = `rgba(150,225,205,${((1 - rp) * 0.4).toFixed(3)})`; ctx.lineWidth = 0.8; ctx.stroke();
      }
      run = -1;
    }
  }
  // head
  const hx = P[0].x - 2, hy = P[0].y;
  const head = () => {
    ctx.beginPath(); ctx.moveTo(hx - 12, hy);
    ctx.quadraticCurveTo(hx - 10, hy - 5.5, hx - 3, hy - 6.4);
    ctx.quadraticCurveTo(hx + 4, hy - 6.8, hx + 6, hy - 4);
    ctx.lineTo(hx + 6, hy + 4);
    ctx.quadraticCurveTo(hx + 4, hy + 6.8, hx - 3, hy + 6.4);
    ctx.quadraticCurveTo(hx - 10, hy + 5.5, hx - 12, hy);
    ctx.closePath();
  };
  head();
  const hg = ctx.createLinearGradient(hx, hy - 7, hx, hy + 7);
  hg.addColorStop(0, 'rgb(28,72,34)'); hg.addColorStop(0.5, 'rgb(74,146,62)'); hg.addColorStop(1, 'rgb(40,96,40)');
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = 'rgba(8,28,12,0.8)'; ctx.lineWidth = 0.8; ctx.stroke();
  _spec(ctx, hx - 3, hy - 3, 4, 1.2, 0.3, 0);
  for (const s of [-1, 1]) {                          // eyes on top of the head
    const ex = hx - 4, ey = hy + s * 3.4;
    _glow(ctx, ex, ey, 4, [200, 255, 60], 0.3);
    ctx.beginPath(); ctx.ellipse(ex, ey, 2, 1.6, 0, 0, _TAU);
    ctx.fillStyle = 'rgb(215,255,80)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, ey, 0.45, 1.4, 0, 0, _TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.95)'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex - 0.6, ey - 0.5, 0.35, 0, _TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.7)';                  // nostrils
  ctx.beginPath(); ctx.arc(hx - 10.2, hy - 1.3, 0.45, 0, _TAU); ctx.arc(hx - 10.2, hy + 1.3, 0.45, 0, _TAU); ctx.fill();
  // forked tongue
  if (Math.sin(t * 5) > 0.25) {
    const fl = hx - 13 - Math.abs(Math.sin(t * 14)) * 6;
    ctx.strokeStyle = 'rgba(225,40,50,0.95)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - 11.5, hy); ctx.lineTo(fl, hy);
    ctx.lineTo(fl - 2.6, hy - 2); ctx.moveTo(fl, hy); ctx.lineTo(fl - 2.6, hy + 2); ctx.stroke();
  }
  const rp2 = _fract(t * 0.8);                        // bow wave under the head
  ctx.beginPath(); ctx.ellipse(hx - 4, hy + 7, 9 + rp2 * 12, 2.2 + rp2 * 3, 0, 0, _TAU);
  ctx.strokeStyle = `rgba(150,225,205,${((1 - rp2) * 0.25).toFixed(3)})`; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.restore();
}

function _drawSaucer(ctx, x, y, t, opts) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 0.9) * 4); ctx.rotate(Math.sin(t * 0.7) * 0.05);
  // tractor beam
  if (opts.beam) {
    const bw = 13 + Math.sin(t * 6) * 2.5, bh = opts.beamLength || 90;
    const bc = ctx.createLinearGradient(0, 9, 0, 9 + bh);
    bc.addColorStop(0, 'rgba(90,255,220,0.38)'); bc.addColorStop(1, 'rgba(60,200,180,0)');
    ctx.beginPath(); ctx.moveTo(-bw, 9); ctx.lineTo(bw, 9); ctx.lineTo(bw * 2.5, 9 + bh); ctx.lineTo(-bw * 2.5, 9 + bh); ctx.closePath();
    ctx.fillStyle = bc; ctx.fill();
    ctx.save(); ctx.clip();
    for (let i = 0; i < 5; i++) {                    // rings travelling up the beam
      const p = _fract(t * 0.9 + i / 5), ry = 9 + bh * (1 - p);
      ctx.beginPath(); ctx.ellipse(0, ry, bw * (1 + (1 - p) * 1.5), 3 + (1 - p) * 3, 0, 0, _TAU);
      ctx.strokeStyle = `rgba(170,255,235,${(p * 0.35).toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const p = _fract(t * 0.7 + i * 0.137);
      ctx.beginPath(); ctx.arc(Math.sin(i * 7 + t) * bw * (1 + (1 - p)), 9 + bh * (1 - p), 0.9, 0, _TAU);
      ctx.fillStyle = `rgba(220,255,245,${(p * 0.8).toFixed(3)})`; ctx.fill();
    }
    ctx.restore();
  }
  // under-glow
  const up = 0.5 + Math.sin(t * 3.2) * 0.25;
  ctx.save(); ctx.scale(1, 0.4); _glow(ctx, 0, 24, 30, [60, 230, 210], up * 0.5); ctx.restore();
  // lower hull
  ctx.beginPath(); ctx.ellipse(0, 5, 28, 7.5, 0, 0, _TAU);
  const lg = ctx.createLinearGradient(0, -2, 0, 12);
  lg.addColorStop(0, 'rgb(190,205,220)'); lg.addColorStop(0.45, 'rgb(110,125,150)'); lg.addColorStop(1, 'rgb(36,44,66)');
  ctx.fillStyle = lg; ctx.fill();
  ctx.strokeStyle = 'rgba(16,20,34,0.85)'; ctx.lineWidth = 0.9; ctx.stroke();
  // engine ring
  ctx.beginPath(); ctx.ellipse(0, 9.5, 9, 2.4, 0, 0, _TAU);
  ctx.fillStyle = `rgba(120,255,230,${(0.55 + up * 0.4).toFixed(3)})`; ctx.fill();
  // rim lights (front half lit, cycling colors)
  for (let i = 0; i < 12; i++) {
    const a = t * 1.8 + (i / 12) * _TAU;
    if (Math.sin(a) < 0) continue;
    const px = Math.cos(a) * 24, py = 5.5 + Math.sin(a) * 4.2;
    const on = (Math.floor(t * 6) + i) % 3;
    const col = on === 0 ? [255, 90, 90] : on === 1 ? [255, 220, 90] : [100, 255, 220];
    _glow(ctx, px, py, 4, col, 0.45);
    ctx.beginPath(); ctx.arc(px, py, 1.3, 0, _TAU); ctx.fillStyle = _c(col, 0.95); ctx.fill();
  }
  // upper hull
  ctx.beginPath(); ctx.ellipse(0, 0.5, 19, 5, 0, Math.PI, 0); ctx.closePath();
  const ug = ctx.createLinearGradient(0, -5, 0, 1);
  ug.addColorStop(0, 'rgb(225,235,245)'); ug.addColorStop(1, 'rgb(130,145,170)');
  ctx.fillStyle = ug; ctx.fill();
  // glass dome with a pilot inside
  ctx.save();
  ctx.beginPath(); ctx.arc(0, -1, 11.5, Math.PI, 0); ctx.closePath(); ctx.clip();
  ctx.fillStyle = 'rgba(30,70,80,0.75)'; ctx.fillRect(-12, -13, 24, 13);
  const bobA = Math.sin(t * 2.3) * 0.8;
  ctx.beginPath(); ctx.ellipse(0, -4 + bobA, 5.2, 5.6, 0, 0, _TAU);             // alien head
  ctx.fillStyle = _litGrad(ctx, 0, -4, 6, [190, 255, 160], [110, 210, 100], [40, 120, 50]); ctx.fill();
  ctx.fillStyle = 'rgba(5,10,10,0.95)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 2.1, -4.5 + bobA, 1.6, 2.3, s * 0.35, 0, _TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 2.1 - 0.5, -5.4 + bobA, 0.5, 0, _TAU); ctx.fill(); }
  ctx.strokeStyle = 'rgb(110,210,100)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(0, -9.4 + bobA); ctx.lineTo(Math.sin(t * 3) * 1.5, -12 + bobA); ctx.stroke();
  const dg = ctx.createRadialGradient(-4, -9, 1, 0, -2, 12);
  dg.addColorStop(0, 'rgba(230,255,250,0.55)'); dg.addColorStop(0.5, 'rgba(120,220,210,0.18)'); dg.addColorStop(1, 'rgba(60,160,160,0.35)');
  ctx.fillStyle = dg; ctx.fillRect(-12, -13, 24, 13);
  // sweeping glint
  const gp = _fract(t * 0.45) * 2 - 1;
  if (Math.abs(gp) < 0.8) {
    ctx.beginPath(); ctx.ellipse(gp * 12, -7, 1.8, 7, -0.4, 0, _TAU);
    ctx.fillStyle = `rgba(245,255,252,${((0.8 - Math.abs(gp)) * 0.55).toFixed(3)})`; ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, -1, 11.5, Math.PI, 0);
  ctx.strokeStyle = 'rgba(200,255,245,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
  // antenna beacon
  ctx.strokeStyle = 'rgba(150,170,200,0.9)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -12.5); ctx.lineTo(0, -17); ctx.stroke();
  const bl = 0.5 + 0.5 * Math.sin(t * 5);
  _glow(ctx, 0, -18.5, 6, [255, 80, 80], bl * 0.6);
  ctx.beginPath(); ctx.arc(0, -18.5, 1.6, 0, _TAU); ctx.fillStyle = `rgba(255,110,110,${(0.5 + bl * 0.5).toFixed(3)})`; ctx.fill();
  ctx.restore();
}

function _drawComet(ctx, x, y, t, opts) {
  const ang = opts.angle !== undefined ? opts.angle : 2.5;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  // layered tail behind the head (negative x)
  [[96, 11, 'rgba(255,120,40,0.16)'], [76, 6, 'rgba(255,170,70,0.35)'], [52, 2.4, 'rgba(255,240,190,0.8)']].forEach(([len, w, col]) => {
    const g = ctx.createLinearGradient(0, 0, -len, 0);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.beginPath(); ctx.moveTo(2, -w); ctx.quadraticCurveTo(-len * 0.4, -w * 0.7, -len, 0);
    ctx.quadraticCurveTo(-len * 0.4, w * 0.7, 2, w); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
  });
  // shedding sparkles
  for (let i = 0; i < 10; i++) {
    const sp = _fract(t * 2.2 + i * 0.29);
    const sx = -sp * 80, sy = Math.sin(i * 2.9 + t * 9) * (2 + sp * 9);
    const a = (1 - sp) * 0.9;
    if (i % 3 === 0) _star4(ctx, sx, sy, 2.2 * (1 - sp) + 0.4, t * 4 + i, `rgba(255,235,190,${a.toFixed(3)})`);
    else { ctx.beginPath(); ctx.arc(sx, sy, 1.2 * (1 - sp) + 0.2, 0, _TAU); ctx.fillStyle = `rgba(255,${(200 - sp * 120) | 0},60,${a.toFixed(3)})`; ctx.fill(); }
  }
  // head
  _glow(ctx, 0, 0, 18, [255, 170, 70], 0.55);
  _glow(ctx, 0, 0, 8, [255, 245, 210], 0.9);
  ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, _TAU); ctx.fillStyle = 'rgba(255,252,235,1)'; ctx.fill();
  const tw = 0.7 + Math.sin(t * 13) * 0.3;
  _star4(ctx, 0, 0, 11 * tw, t * 1.5, `rgba(255,250,225,${(0.55 * tw).toFixed(3)})`);
  ctx.restore();
}

function drawEnemy(ctx, x, y, t, type, opts) {
  opts = opts || {};
  switch (type) {
    case 'croc': return _drawCroc(ctx, x, y, t, opts);
    case 'snake': return _drawSnake(ctx, x, y, t, opts);
    case 'dragon': return drawDragonSprite(ctx, x, y, t, opts);
    case 'saucer': return _drawSaucer(ctx, x, y, t, opts);
    case 'shooting_star': return _drawComet(ctx, x, y, t, opts);
  }
}
