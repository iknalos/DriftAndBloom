// ============================================================================
// scene_draw.js — Drift & Bloom shared scenery module (CHARACTER AGENT)
// Pure-canvas drawing functions, no globals, no DOM. Companion to
// spirit_draw.js. Include with:  <script src="scene_draw.js"></script>
//
// drawNightSky(ctx, W, H, t)            — gradient sky, layered stars with
//                                          sparkle flashes, haloed moon, cloud wisps
// drawWaterSurface(ctx, W, H, t, yFrac) — water with moonlight column, two
//                                          shimmer layers, twinkling glints
// drawLilyPad(ctx, x, y, t, opts)       — pad with notch cut, lip, veins, sheen, dew, buds
//                                          opts: {r:34, phase:0, ripples:true, bud:true}
// drawShoreline(ctx, W, H, t, yFrac)    — far treeline + mist + reflection at the horizon
// drawReeds(ctx, W, H, t)               — swaying reeds/cattails in the near corners
// drawBloom(ctx, x, y, t)               — gold collectible: pulsing glow, light
//                                          rays, twin petal rings, orbit sparkles
// drawLotusGoal(ctx, x, y, t)           — pink goal lotus: beacon column, rising
//                                          motes, breathing petals, pulsing glow
// drawFog(ctx, W, H, t, band)           — drifting mist band (band 0 low..1 high)
// drawFireflies(ctx, W, H, t, n)        — wandering motes with pulse flashes
// ============================================================================

const _SC_TAU = Math.PI * 2;

function drawNightSky(ctx, W, H, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,    '#010810');
  sky.addColorStop(0.65, '#071828');
  sky.addColorStop(1,    '#0a2535');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // stars — three size tiers; the brightest occasionally flash a sparkle
  for (let i = 0; i < 70; i++) {
    const sx = (i * 137 + 30) % W;
    const sy = (i * 79 + 18) % (H * 0.72);
    const tier = i % 9 === 0 ? 1.5 : i % 4 === 0 ? 1.0 : 0.7;
    const sb = 0.2 + 0.8 * Math.sin(t * (0.9 + (i % 5) * 0.12) + i * 0.82);
    ctx.beginPath(); ctx.arc(sx, sy, tier, 0, _SC_TAU);
    ctx.fillStyle = `rgba(205,222,255,${(Math.max(0, sb) * 0.45).toFixed(3)})`;
    ctx.fill();
    if (tier > 1.2 && sb > 0.93) {              // sparkle flash on the big ones
      ctx.strokeStyle = `rgba(225,238,255,${((sb - 0.93) * 6).toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(sx - 5, sy); ctx.lineTo(sx + 5, sy);
      ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.stroke();
    }
  }

  // moon — wide halo, inner ring, cratered disc
  const mx = W * 0.85, my = H * 0.16;
  const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 110);
  halo.addColorStop(0,    'rgba(240,228,195,0.55)');
  halo.addColorStop(0.30, 'rgba(240,228,195,0.18)');
  halo.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(mx - 112, my - 112, 224, 224);
  const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 68);
  mg.addColorStop(0,    'rgba(240,228,195,0.90)');
  mg.addColorStop(0.44, 'rgba(240,228,195,0.32)');
  mg.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = mg; ctx.fillRect(mx - 70, my - 70, 140, 140);
  ctx.beginPath(); ctx.arc(mx, my, 30, 0, _SC_TAU);
  ctx.fillStyle = 'rgba(242,230,198,0.95)'; ctx.fill();
  [[-8, -6, 5], [10, 4, 4], [-2, 12, 3], [12, -10, 2.4]].forEach(([cx, cy, cr]) => {
    ctx.beginPath(); ctx.arc(mx + cx, my + cy, cr, 0, _SC_TAU);
    ctx.fillStyle = 'rgba(205,190,160,0.5)'; ctx.fill();
  });

  // slow cloud wisps drifting past the moon band
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 331 + t * (4 + i * 1.6)) % (W + 320)) - 160;
    const cy = H * (0.13 + i * 0.09) + Math.sin(t * 0.2 + i * 2) * 5;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 95);
    g.addColorStop(0, 'rgba(170,195,215,0.045)');
    g.addColorStop(1, 'rgba(170,195,215,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, 95, 26, 0, 0, _SC_TAU); ctx.fill();
  }
}

function drawWaterSurface(ctx, W, H, t, yFrac) {
  const wy = H * (yFrac === undefined ? 0.82 : yFrac);
  const wg = ctx.createLinearGradient(0, wy, 0, H);
  wg.addColorStop(0,    '#0d2c3f');
  wg.addColorStop(0.25, '#0a2535');
  wg.addColorStop(1,    '#06141e');
  ctx.fillStyle = wg;
  ctx.fillRect(0, wy, W, H - wy);

  // moonlight column — a soft specular path under the moon
  const mx = W * 0.85;
  const colW = 46 + Math.sin(t * 0.9) * 8;
  const col = ctx.createLinearGradient(0, wy, 0, H);
  col.addColorStop(0, 'rgba(240,228,195,0.16)');
  col.addColorStop(1, 'rgba(240,228,195,0.02)');
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(mx - colW * 0.4, wy);
  ctx.lineTo(mx + colW * 0.4, wy);
  ctx.lineTo(mx + colW, H); ctx.lineTo(mx - colW, H);
  ctx.closePath(); ctx.fill();
  // broken specular dashes inside the column
  for (let i = 0; i < 9; i++) {
    const gy = wy + 6 + i * (H - wy) * 0.105;
    const sway = Math.sin(t * (1.1 + i * 0.13) + i * 2.1) * (8 + i * 2);
    const al = 0.10 + 0.08 * Math.sin(t * 1.6 + i * 1.3);
    ctx.beginPath();
    ctx.ellipse(mx + sway, gy, 14 + i * 1.5, 1.3, 0, 0, _SC_TAU);
    ctx.fillStyle = `rgba(240,228,195,${Math.max(0, al).toFixed(3)})`; ctx.fill();
  }

  // two shimmer layers at different speeds
  for (let x = 0; x < W; x += 7) {
    const wv = Math.sin(x * 0.04 + t * 0.88) * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, wy + wv); ctx.lineTo(x + 7, wy + wv);
    ctx.strokeStyle = 'rgba(93,202,165,0.07)'; ctx.lineWidth = 1; ctx.stroke();
  }
  for (let x = 0; x < W; x += 11) {
    const wv = Math.sin(x * 0.026 - t * 0.55 + 2) * 3.5 + 9;
    ctx.beginPath();
    ctx.moveTo(x, wy + wv); ctx.lineTo(x + 11, wy + wv);
    ctx.strokeStyle = 'rgba(120,210,180,0.04)'; ctx.lineWidth = 1; ctx.stroke();
  }

  // twinkling glints scattered on the surface
  for (let i = 0; i < 14; i++) {
    const gx = (i * 173 + 40) % W;
    const gy = wy + 4 + (i * 53) % (H - wy - 8);
    const tw = Math.sin(t * (2 + (i % 4) * 0.7) + i * 2.4);
    if (tw < 0.75) continue;
    ctx.beginPath(); ctx.arc(gx, gy, 1, 0, _SC_TAU);
    ctx.fillStyle = `rgba(200,235,220,${((tw - 0.75) * 2.4).toFixed(3)})`; ctx.fill();
  }
}

// Lily pad v2 (2026-09-25): real notch cut (water shows through), a raised lip
// for thickness, contact shadow on the water, curved veins, moonlit rim and
// sheen, twinkling dew, per-pad colour variation and the odd flower bud.
function drawLilyPad(ctx, x, y, t, opts) {
  opts = opts || {};
  const r = opts.r || 34;
  const ph = opts.phase || 0;
  const ry = r * 0.38, k = r / 34;
  const bob = Math.sin(t * 1.3 + ph) * 1.5;
  const v1 = Math.sin(ph * 12.9898) * 0.5 + 0.5, v2 = Math.sin(ph * 78.233) * 0.5 + 0.5;   // per-pad variation
  const notchA = -0.32 + (v1 - 0.5) * 0.5, notchW = 0.34;
  ctx.save(); ctx.translate(x, y + bob);
  ctx.rotate(Math.sin(t * 0.6 + ph) * 0.035);
  // contact shadow + ripples on the water
  const sh = ctx.createRadialGradient(0, ry * 0.5, 0, 0, ry * 0.5, r * 1.25);
  sh.addColorStop(0, 'rgba(0,8,14,0.45)'); sh.addColorStop(1, 'rgba(0,8,14,0)');
  ctx.save(); ctx.scale(1, 0.42); ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, ry * 1.2, r * 1.25, 0, _SC_TAU); ctx.fill(); ctx.restore();
  if (opts.ripples !== false) {
    for (let i = 0; i < 2; i++) {
      const rp = ((t * 0.4 + ph * 0.16 + i * 0.5) % 1);
      ctx.beginPath(); ctx.ellipse(0, 2, r * (1.1 + rp * 0.8), ry * 1.08 * (1 + rp * 0.65), 0, 0, _SC_TAU);
      ctx.strokeStyle = `rgba(120,215,185,${((1 - rp) * 0.18).toFixed(3)})`;
      ctx.lineWidth = 1; ctx.stroke();
    }
  }
  const padPath = (dy, rr, rry) => {
    ctx.beginPath(); ctx.moveTo(0, dy);
    ctx.ellipse(0, dy, rr, rry, 0, notchA + notchW / 2, notchA - notchW / 2 + _SC_TAU);
    ctx.closePath();
  };
  // lip / thickness (darker underside peeking below the top surface)
  padPath(2.2 * k, r, ry);
  ctx.fillStyle = `rgb(${10 + v2 * 8 | 0},${46 + v1 * 10 | 0},${32 + v2 * 6 | 0})`; ctx.fill();
  // top surface
  const hueR = 34 + v2 * 22, hueG = 118 + v1 * 26, hueB = 70 - v2 * 14;
  const g = ctx.createRadialGradient(r * 0.18, -ry * 0.35, 1, 0, 0, r * 1.05);
  g.addColorStop(0, `rgb(${hueR + 40 | 0},${hueG + 44 | 0},${hueB + 30 | 0})`);
  g.addColorStop(0.55, `rgb(${hueR | 0},${hueG | 0},${hueB | 0})`);
  g.addColorStop(1, `rgb(${hueR * 0.5 | 0},${hueG * 0.62 | 0},${hueB * 0.62 | 0})`);
  padPath(0, r, ry); ctx.fillStyle = g; ctx.fill();
  ctx.save(); padPath(0, r, ry); ctx.clip();
  // veins: curved spokes from the hub, with a light ridge beside each groove
  for (let i = 0; i < 11; i++) {
    const a = notchA + notchW / 2 + 0.25 + i * ((_SC_TAU - notchW - 0.5) / 10);
    const ex = Math.cos(a) * r * 0.95, ey = Math.sin(a) * ry * 0.95;
    const cxp = Math.cos(a + 0.18) * r * 0.5, cyp = Math.sin(a + 0.18) * ry * 0.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cxp, cyp, ex, ey);
    ctx.strokeStyle = 'rgba(8,40,24,0.38)'; ctx.lineWidth = 0.9 * k; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.quadraticCurveTo(cxp, cyp - 0.8, ex, ey - 0.8);
    ctx.strokeStyle = 'rgba(190,240,170,0.12)'; ctx.lineWidth = 0.6 * k; ctx.stroke();
  }
  // moon sheen (upper right)
  ctx.save(); ctx.translate(r * 0.35, -ry * 0.35); ctx.scale(r * 0.45, ry * 0.4);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  sg.addColorStop(0, `rgba(230,255,235,${(0.16 + 0.05 * Math.sin(t * 0.9 + ph)).toFixed(3)})`); sg.addColorStop(1, 'rgba(230,255,235,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, 1, 0, _SC_TAU); ctx.fill(); ctx.restore();
  ctx.restore();
  // hub
  ctx.beginPath(); ctx.ellipse(0, 0, 2 * k, 0.9 * k, 0, 0, _SC_TAU); ctx.fillStyle = 'rgba(20,70,40,0.8)'; ctx.fill();
  // moonlit rim on the far edge
  ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, -2.6, -0.1);
  ctx.strokeStyle = 'rgba(170,240,200,0.45)'; ctx.lineWidth = 1.3 * k; ctx.stroke();
  // dew drops
  for (let i = 0; i < 3; i++) {
    const a = ph * 3 + i * 2.1, dr = 0.35 + 0.35 * ((i * 0.37 + v1) % 1);
    const dx = Math.cos(a) * r * dr, dy = Math.sin(a) * ry * dr;
    const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + ph * 4 + i * 1.7);
    ctx.beginPath(); ctx.arc(dx, dy, 1.1 * k, 0, _SC_TAU); ctx.fillStyle = `rgba(210,250,240,${(0.35 + 0.3 * tw).toFixed(3)})`; ctx.fill();
    ctx.beginPath(); ctx.arc(dx - 0.35 * k, dy - 0.35 * k, 0.45 * k, 0, _SC_TAU); ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(3)})`; ctx.fill();
  }
  // the occasional closed flower bud
  if (opts.bud !== false && v2 > 0.78) {
    const bx = -r * 0.42, by = -ry * 0.25;
    ctx.beginPath(); ctx.moveTo(bx, by + 1); ctx.quadraticCurveTo(bx - 3.2 * k, by - 3 * k, bx, by - 7 * k); ctx.quadraticCurveTo(bx + 3.2 * k, by - 3 * k, bx, by + 1);
    const bg = ctx.createLinearGradient(bx, by, bx, by - 7 * k);
    bg.addColorStop(0, 'rgb(220,150,180)'); bg.addColorStop(1, 'rgb(255,225,235)');
    ctx.fillStyle = bg; ctx.fill();
  }
  ctx.restore();
}

// Far shore on the horizon: layered treeline silhouettes, mist, reflections.
function drawShoreline(ctx, W, H, t, yFrac) {
  const wy = H * yFrac;
  const layer = (seed, h, col, amp) => {
    ctx.beginPath(); ctx.moveTo(0, wy + 1);
    for (let x = 0; x <= W; x += 6) {
      const n = Math.sin(x * 0.021 + seed) * 0.5 + Math.sin(x * 0.057 + seed * 2.3) * 0.3 + Math.sin(x * 0.13 + seed * 5.1) * 0.2;
      const tree = Math.max(0, Math.sin(x * 0.19 + seed * 7)) * amp;          // pointy conifer tops
      ctx.lineTo(x, wy - h - n * h * 0.55 - tree);
    }
    ctx.lineTo(W, wy + 1); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  layer(1.3, 26, 'rgba(14,30,44,0.95)', 7);
  layer(4.1, 13, 'rgba(8,19,30,1)', 9);
  // mist hugging the shore
  const mg = ctx.createLinearGradient(0, wy - 26, 0, wy + 18);
  mg.addColorStop(0, 'rgba(150,185,205,0)'); mg.addColorStop(0.6, 'rgba(150,185,205,0.10)'); mg.addColorStop(1, 'rgba(150,185,205,0)');
  ctx.fillStyle = mg; ctx.fillRect(0, wy - 26, W, 44);
  // faint reflection of the treeline on the water
  ctx.save(); ctx.globalAlpha = 0.18; ctx.translate(0, wy + 1); ctx.scale(1, -0.35); ctx.translate(0, -wy - 1);
  layer(4.1, 13, 'rgba(8,19,30,1)', 9);
  ctx.restore();
}

// Reeds and cattails in the near corners, swaying.
function drawReeds(ctx, W, H, t) {
  const clump = (x0, dir, n, seed) => {
    for (let i = 0; i < n; i++) {
      const bx = x0 + dir * (i * 7 + Math.sin(seed + i * 3.1) * 4);
      const hgt = 70 + Math.sin(seed * 2 + i * 1.7) * 26 + (i % 3) * 14;
      const sway = Math.sin(t * 0.9 + i * 0.7 + seed) * 5;
      const tx = bx + dir * (4 + i % 2 * 5) + sway, ty = H - hgt;
      ctx.beginPath(); ctx.moveTo(bx, H + 2);
      ctx.quadraticCurveTo(bx + sway * 0.4, H - hgt * 0.55, tx, ty);
      ctx.strokeStyle = i % 2 ? 'rgba(20,48,34,0.95)' : 'rgba(28,62,40,0.95)';
      ctx.lineWidth = 2.4 - (i % 3) * 0.5; ctx.lineCap = 'round'; ctx.stroke();
      if (i % 3 === 1) {                           // cattail head
        ctx.save(); ctx.translate(tx, ty + 8); ctx.rotate(Math.atan2(tx - bx, hgt) * 0.8);
        ctx.beginPath(); ctx.ellipse(0, 0, 2.6, 8, 0, 0, _SC_TAU);
        const cg = ctx.createLinearGradient(-2, 0, 2.6, 0);
        cg.addColorStop(0, 'rgb(58,34,20)'); cg.addColorStop(1, 'rgb(104,66,38)');
        ctx.fillStyle = cg; ctx.fill(); ctx.restore();
      }
    }
  };
  clump(-6, 1, 6, 1.7);
  clump(W + 6, -1, 5, 4.4);
}

function drawBloom(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 1.7) * 2.4);
  const pulse = 0.8 + Math.sin(t * 2.3) * 0.2;
  // layered glow
  const g2 = ctx.createRadialGradient(0, 0, 1, 0, 0, 38);
  g2.addColorStop(0, `rgba(245,210,100,${(0.30 * pulse).toFixed(3)})`);
  g2.addColorStop(1, 'rgba(245,210,100,0)');
  ctx.fillStyle = g2; ctx.fillRect(-40, -40, 80, 80);
  const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 22);
  g.addColorStop(0, `rgba(255,232,150,${(0.55 * pulse).toFixed(3)})`);
  g.addColorStop(1, 'rgba(245,210,100,0)');
  ctx.fillStyle = g; ctx.fillRect(-24, -24, 48, 48);
  // slow light rays
  for (let i = 0; i < 4; i++) {
    const a = t * 0.6 + (i / 4) * _SC_TAU;
    ctx.save(); ctx.rotate(a);
    const rg = ctx.createLinearGradient(0, 0, 26, 0);
    rg.addColorStop(0, `rgba(255,235,160,${(0.16 * pulse).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(255,235,160,0)');
    ctx.fillStyle = rg; ctx.fillRect(6, -2, 22, 4);
    ctx.restore();
  }
  // outer petal ring (spinning)
  ctx.save(); ctx.rotate(t * 0.9);
  for (let i = 0; i < 6; i++) {
    ctx.save(); ctx.rotate((i / 6) * _SC_TAU);
    const pg = ctx.createLinearGradient(0, 0, 0, -11);
    pg.addColorStop(0, 'rgb(245,210,100)');
    pg.addColorStop(1, 'rgb(255,240,180)');
    ctx.beginPath(); ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(-3.6, -7, 0, -11);
    ctx.quadraticCurveTo(3.6, -7, 0, -2);
    ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,250,210,0.5)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // inner petal ring (counter-spinning)
  ctx.save(); ctx.rotate(-t * 1.3);
  for (let i = 0; i < 5; i++) {
    ctx.save(); ctx.rotate((i / 5) * _SC_TAU);
    ctx.beginPath(); ctx.moveTo(0, -1);
    ctx.quadraticCurveTo(-2, -4, 0, -6.5);
    ctx.quadraticCurveTo(2, -4, 0, -1);
    ctx.fillStyle = 'rgba(255,245,195,0.9)'; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // center
  ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, _SC_TAU);
  const cg = ctx.createRadialGradient(-0.8, -0.8, 0, 0, 0, 3.2);
  cg.addColorStop(0, 'rgb(255,252,225)');
  cg.addColorStop(1, 'rgb(250,220,130)');
  ctx.fillStyle = cg; ctx.fill();
  // orbit sparkles
  for (let i = 0; i < 5; i++) {
    const a = t * 2.2 + (i / 5) * _SC_TAU;
    const tw = 0.4 + 0.6 * Math.sin(t * 7 + i * 1.8);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 17, Math.sin(a) * 17 * 0.7, 1.1, 0, _SC_TAU);
    ctx.fillStyle = `rgba(255,240,180,${(tw * 0.85).toFixed(2)})`; ctx.fill();
  }
  ctx.restore();
}

function drawLotusGoal(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y + Math.sin(t * 1.1) * 1.8);
  const pulse = 0.40 + Math.sin(t * 1.8) * 0.14;
  // beacon column rising from the flower
  const bc = ctx.createLinearGradient(0, -8, 0, -86);
  bc.addColorStop(0, `rgba(232,90,138,${(0.20 + pulse * 0.18).toFixed(3)})`);
  bc.addColorStop(1, 'rgba(232,90,138,0)');
  ctx.beginPath();
  ctx.moveTo(-9, -6); ctx.lineTo(9, -6);
  ctx.lineTo(16, -86); ctx.lineTo(-16, -86);
  ctx.closePath(); ctx.fillStyle = bc; ctx.fill();
  // rising light motes
  for (let i = 0; i < 5; i++) {
    const mp = ((t * 0.5 + i * 0.21) % 1);
    const mxx = Math.sin(t * 1.4 + i * 2.4) * (5 + mp * 9);
    ctx.beginPath(); ctx.arc(mxx, -10 - mp * 64, 1.4 - mp * 0.7, 0, _SC_TAU);
    ctx.fillStyle = `rgba(255,180,205,${((1 - mp) * 0.7).toFixed(3)})`; ctx.fill();
  }
  // glow
  const g = ctx.createRadialGradient(0, -4, 2, 0, -4, 42);
  g.addColorStop(0, `rgba(232,90,138,${pulse.toFixed(3)})`);
  g.addColorStop(1, 'rgba(232,90,138,0)');
  ctx.fillStyle = g; ctx.fillRect(-44, -48, 88, 88);
  // back petal ring
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * _SC_TAU + 0.45;
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -4);
    ctx.quadraticCurveTo(-6, -14, 0, -22);
    ctx.quadraticCurveTo(6, -14, 0, -4);
    ctx.fillStyle = 'rgb(190,60,108)'; ctx.fill();
    ctx.restore();
  }
  // front petals, breathing open
  const open = 1 + Math.sin(t * 1.8) * 0.07;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * _SC_TAU;
    ctx.save(); ctx.rotate(a); ctx.scale(open, open);
    const pg = ctx.createLinearGradient(0, -3, 0, -17);
    pg.addColorStop(0, 'rgb(232,90,138)');
    pg.addColorStop(1, 'rgb(255,160,192)');
    ctx.beginPath(); ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(-5, -10, 0, -17);
    ctx.quadraticCurveTo(5, -10, 0, -3);
    ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,205,225,0.55)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.restore();
  }
  // stamens
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * _SC_TAU + t * 0.3;
    const sx = Math.cos(a) * 3, sy = Math.sin(a) * 3 - 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sx * 1.8, sy * 1.8);
    ctx.strokeStyle = 'rgba(255,225,150,0.85)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx * 1.8, sy * 1.8, 1, 0, _SC_TAU);
    ctx.fillStyle = 'rgb(255,235,170)'; ctx.fill();
  }
  ctx.restore();
}

function drawFog(ctx, W, H, t, band) {
  const baseY = H * (0.62 - (band || 0) * 0.3);
  for (let i = 0; i < 6; i++) {
    const fx = ((i * 173 + t * 9 * (1 + i * 0.13)) % (W + 220)) - 110;
    const fy = baseY + Math.sin(t * 0.4 + i * 1.7) * 9 + (i % 3) * 14;
    const fr = 60 + (i % 3) * 26;
    const g = ctx.createRadialGradient(fx, fy, 4, fx, fy, fr);
    g.addColorStop(0, 'rgba(160,190,205,0.055)');
    g.addColorStop(1, 'rgba(160,190,205,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - fr, fy - fr * 0.5, fr * 2, fr);
  }
}

function drawFireflies(ctx, W, H, t, n) {
  n = n || 12;
  for (let i = 0; i < n; i++) {
    const fx = (Math.sin(t * (0.16 + (i % 5) * 0.05) + i * 2.6) * 0.5 + 0.5) * W;
    const fy = H * 0.30 + (Math.sin(t * (0.22 + (i % 3) * 0.07) + i * 1.4) * 0.5 + 0.5) * H * 0.45;
    const tw = Math.max(0, Math.sin(t * (1.6 + (i % 4) * 0.4) + i * 2.2));
    if (tw < 0.08) continue;
    const r = 7 + tw * 4;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    g.addColorStop(0, `rgba(225,255,160,${(tw * 0.7).toFixed(3)})`);
    g.addColorStop(1, 'rgba(225,255,160,0)');
    ctx.fillStyle = g; ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
    ctx.beginPath(); ctx.arc(fx, fy, 1 + tw * 0.4, 0, _SC_TAU);
    ctx.fillStyle = `rgba(245,255,210,${(tw * 0.95).toFixed(3)})`; ctx.fill();
    // bright flash moment gets a tiny cross sparkle
    if (tw > 0.96) {
      ctx.strokeStyle = `rgba(240,255,200,${((tw - 0.96) * 18).toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(fx - 4, fy); ctx.lineTo(fx + 4, fy);
      ctx.moveTo(fx, fy - 4); ctx.lineTo(fx, fy + 4); ctx.stroke();
    }
  }
}
