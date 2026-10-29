// The water slide's drawing screen: a beach with the sea behind (a sailboat, an island and a
// friendly smoking volcano), a slide tower with stairs, the slide itself in glossy fiberglass with
// water running down it (tight circles shown as toilet bowls, zigzags as rapids), palms swaying
// on the sand. Things that move are painted every frame over the cached layers.
import { cssColor, stationFor } from './track.js';
import { sprite, hash, shade, uprightNormals, supportSpots2D, paintClouds, paintBirds, paintSunRays, paintSunDisc } from './draw-art.js';
import { smoothLine, strokeByColor, roundRect } from './draw-park.js';
import { springPoints } from './corkscrew.js';

const SUPPORT_TOP = 7.5; // normalized, same as the coaster: no poles drawn above this
const CLOUDS = [[0.12, 0.2, 1.1, 1], [0.74, 0.26, 1.4, 0], [0.3, 0.42, 0.75, 2], [0.55, 0.08, 0.6, 2]];
const GULLS = [[0.12, 1.1, 22, 0.55], [0.16, 0.9, 22, 0.6], [0.1, 1, 15, 0.82], [0.3, 0.8, 18, 0.3]];
const PALMS = [[0.58, 1], [0.95, 0.85], [0.22, 0.75]]; // where on the screen (it scrolls a little), size
const SEA = 30; // px (times z): how tall the strip of sea is above the sand

// Decorations slide by a little as the drawing scrolls, wrapping round.
function drift(pad, fx, margin) {
  const span = pad.w + margin * 2;
  const x = fx * pad.w - pad.panX * pad.unit * 0.5 + margin;
  return (((x % span) + span) % span) - margin;
}

// ---- Back layer ----

// The sea along the horizon, the volcano and the island.
export function paintSea(pad, groundAt, z) {
  const { ctx, w } = pad;
  const top = (sx) => groundAt(sx) - SEA * z;
  // The volcano, far out on the horizon (drawn first: the sea laps round its foot).
  const vx = w * 0.3;
  const vy = top(vx) + 4 * z;
  const vw = 120 * z;
  const vh = 62 * z;
  ctx.fillStyle = '#7f9a6a';
  ctx.beginPath();
  ctx.moveTo(vx - vw, vy);
  ctx.quadraticCurveTo(vx - vw * 0.45, vy - vh * 0.5, vx - vw * 0.22, vy - vh);
  ctx.lineTo(vx + vw * 0.2, vy - vh);
  ctx.quadraticCurveTo(vx + vw * 0.45, vy - vh * 0.5, vx + vw, vy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a8357';
  ctx.beginPath();
  ctx.moveTo(vx + vw * 0.02, vy - vh);
  ctx.lineTo(vx + vw * 0.2, vy - vh);
  ctx.quadraticCurveTo(vx + vw * 0.45, vy - vh * 0.5, vx + vw, vy);
  ctx.lineTo(vx + vw * 0.15, vy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8a6d55';
  ctx.beginPath();
  ctx.moveTo(vx - vw * 0.22, vy - vh);
  ctx.lineTo(vx + vw * 0.2, vy - vh);
  ctx.lineTo(vx + vw * 0.12, vy - vh * 0.8);
  ctx.lineTo(vx - vw * 0.05, vy - vh * 0.72);
  ctx.lineTo(vx - vw * 0.16, vy - vh * 0.84);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff8c42';
  ctx.beginPath();
  ctx.ellipse(vx - vw * 0.01, vy - vh, vw * 0.2, 3 * z, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  for (let sx = 0; sx <= w + 8; sx += 8) ctx.lineTo(sx, top(sx));
  for (let sx = w + 8; sx >= 0; sx -= 8) ctx.lineTo(sx, groundAt(sx) + 4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, top(w / 2), 0, groundAt(w / 2));
  g.addColorStop(0, '#1b8fd1');
  g.addColorStop(1, '#5ad3f0');
  ctx.fillStyle = g;
  ctx.fill();
  // A pale line where the sea meets the sky.
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5 * z;
  ctx.beginPath();
  for (let sx = 0; sx <= w + 8; sx += 8) ctx.lineTo(sx, top(sx) + 0.5);
  ctx.stroke();

  // An island poking up out of the sea, with a palm.
  const ix = w * 0.84;
  const iy = top(ix) + 6 * z;
  ctx.fillStyle = '#3ea85a';
  ctx.beginPath();
  ctx.ellipse(ix, iy, 70 * z, 22 * z, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#f2d49b';
  ctx.fillRect(ix - 70 * z, iy - 2 * z, 140 * z, 3 * z);
  palm(ctx, ix + 14 * z, iy - 16 * z, 0.55 * z, '#2f8a48', '#8a5a3c');
}

// Shells and starfish, a beach umbrella with a lounger, and a beach ball, on the sand.
export function paintSand(pad, groundAt, z) {
  const { ctx, h } = pad;
  for (const [fx, fy, kind] of [[0.08, 0.35, 0], [0.33, 0.6, 1], [0.5, 0.3, 0], [0.71, 0.55, 1], [0.86, 0.4, 0], [0.2, 0.75, 1]]) {
    const x = drift(pad, fx, 20 * z);
    const y = groundAt(x) + 8 + fy * (h - groundAt(x) - 8);
    if (kind) starfish(ctx, x, y, 9 * z);
    else shell(ctx, x, y, 8 * z);
  }
  const ux = drift(pad, 0.42, 120 * z);
  const uy = groundAt(ux) + (h - groundAt(ux)) * 0.62;
  umbrella(ctx, ux, uy, z);
  const bx = drift(pad, 0.78, 30 * z);
  ball(ctx, bx, groundAt(bx) + (h - groundAt(bx)) * 0.45, 9 * z);
}

function umbrella(ctx, x, y, z) {
  // Shade on the sand, a striped lounger under it, the pole and a striped canopy.
  ctx.fillStyle = 'rgba(170,120,60,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 14 * z, y + 2 * z, 44 * z, 7 * z, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2 * z;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 6 * z, y - 2 * z);
  ctx.lineTo(x + 8 * z, y + 2 * z);
  ctx.moveTo(x + 46 * z, y - 2 * z);
  ctx.lineTo(x + 44 * z, y + 2 * z);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#3a86ff';
    ctx.fillRect(x + 4 * z + i * 7.5 * z, y - 6 * z, 7.5 * z, 4 * z);
  }
  ctx.fillStyle = '#3a86ff';
  ctx.beginPath();
  ctx.moveTo(x - 1 * z, y - 6 * z);
  ctx.lineTo(x + 6 * z, y - 15 * z);
  ctx.lineTo(x + 9 * z, y - 6 * z);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f2f2f2';
  ctx.lineWidth = 2 * z;
  ctx.beginPath();
  ctx.moveTo(x, y + 2 * z);
  ctx.lineTo(x - 4 * z, y - 62 * z);
  ctx.stroke();
  const cx = x - 4 * z;
  const cy = y - 62 * z;
  const r = 36 * z;
  const wedges = 6;
  for (let i = 0; i < wedges; i++) {
    const a0 = Math.PI + (i / wedges) * Math.PI;
    const a1 = Math.PI + ((i + 1) / wedges) * Math.PI;
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.45);
    ctx.lineTo(cx + Math.cos(a0) * r, cy + 4 * z);
    ctx.quadraticCurveTo(cx + Math.cos((a0 + a1) / 2) * r, cy + 9 * z, cx + Math.cos(a1) * r, cy + 4 * z);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#f2f2f2';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.45, 2.5 * z, 0, Math.PI * 2);
  ctx.fill();
}
function ball(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(170,120,60,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.3, y + r * 0.9, r * 1.1, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  const colors = ['#ff4d6d', '#ffffff', '#ffd23f', '#ffffff', '#3a86ff', '#ffffff'];
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, (i / 6) * Math.PI * 2 - 0.4, ((i + 1) / 6) * Math.PI * 2 - 0.4);
    ctx.closePath();
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function palm(ctx, x, y, s, leaf, bark) {
  ctx.strokeStyle = bark;
  ctx.lineCap = 'round';
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - 6 * s, y - 70 * s, x + 18 * s, y - 130 * s);
  ctx.stroke();
  // Rings up the trunk.
  ctx.strokeStyle = 'rgba(70,40,20,0.45)';
  ctx.lineWidth = 1.6 * s;
  for (let t = 0.08; t < 0.95; t += 0.11) {
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x - 6 * s) + t * t * (x + 18 * s);
    const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y - 70 * s) + t * t * (y - 130 * s);
    ctx.beginPath();
    ctx.moveTo(px - 4.5 * s, py);
    ctx.lineTo(px + 4.5 * s, py - 1.5 * s);
    ctx.stroke();
  }
  const tx = x + 18 * s;
  const ty = y - 130 * s;
  for (const a of [-2.7, -2.1, -1.4, -0.7, -0.2, 0.35]) {
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    const ex = tx + Math.cos(a) * 60 * s;
    const ey = ty + Math.sin(a) * 34 * s + 26 * s;
    ctx.quadraticCurveTo(tx + Math.cos(a) * 40 * s, ty + Math.sin(a) * 40 * s - 12 * s, ex, ey);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 26 * s, ty + Math.sin(a) * 18 * s + 4 * s, tx, ty);
    ctx.fill();
    // A lighter rib down the middle of each frond.
    ctx.strokeStyle = 'rgba(200,240,150,0.6)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 34 * s, ty + Math.sin(a) * 30 * s - 4 * s, ex, ey);
    ctx.stroke();
  }
  ctx.fillStyle = '#7a4a2a';
  for (const [dx, dy] of [[-4, 6], [5, 7]]) {
    ctx.beginPath();
    ctx.arc(tx + dx * s, ty + dy * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A palm as a sprite standing on (0, 0), with a soft shadow under it.
function palmSprite(s) {
  const x0 = 52 * s;
  const y0 = 172 * s;
  const sp = sprite(`palm:${s.toFixed(2)}`, 140 * s, 184 * s, (ctx) => {
    ctx.fillStyle = 'rgba(170,120,60,0.25)';
    ctx.beginPath();
    ctx.ellipse(x0 + 6 * s, y0 + 3 * s, 26 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    palm(ctx, x0, y0, s, '#3aa654', '#9a6a43');
  });
  return { ...sp, x0, y0 };
}

function shell(ctx, x, y, r) {
  ctx.fillStyle = '#ffc2d1';
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.lineTo(x, y + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e58fa5';
  ctx.lineWidth = Math.max(1, r * 0.15);
  for (const a of [-0.6, 0, 0.6]) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.4);
    ctx.lineTo(x + Math.sin(a) * r, y - Math.cos(a) * r * 0.9);
    ctx.stroke();
  }
}

function starfish(ctx, x, y, r) {
  ctx.fillStyle = '#ff8c42';
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
    const rr = k % 2 ? r * 0.42 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- Live, behind the slide ----

export function paintLive(pad, t, z, space, { sway = true } = {}) {
  const { ctx, w, h } = pad;
  // The sun in cool sunglasses, with a big smile.
  const sx = w * 0.5;
  const sy = h * 0.15;
  paintSunRays(ctx, sx, sy, z, t, { color: '#ffd93d', count: 12, inner: 46, outer: 66, width: 6, alt: 8 });
  paintSunDisc(ctx, sx, sy, 38 * z, '#fff3a0', '#ffd23a');
  ctx.fillStyle = '#26262e';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx + s * 14 * z, sy - 5 * z, 12 * z, 9 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#26262e';
  ctx.lineWidth = 3.5 * z;
  ctx.beginPath();
  ctx.moveTo(sx - 4 * z, sy - 8 * z);
  ctx.lineTo(sx + 4 * z, sy - 8 * z);
  ctx.stroke();
  // The glint slides across the lenses now and then.
  const glint = ((t * 0.4) % 3) - 1;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx + s * 14 * z - 4 * z + Math.max(-1, Math.min(1, glint)) * 4 * z, sy - 8 * z, 3.5 * z, 2.2 * z, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#c46a00';
  ctx.lineWidth = 3 * z;
  ctx.beginPath();
  ctx.arc(sx, sy + 6 * z, 15 * z, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  paintClouds(ctx, w, h, z, t, 0.95 * (1 - space), CLOUDS);
  paintBirds(ctx, w, h, z, t, 0.8 * (1 - space), GULLS);
  if (space >= 1) return;
  const groundAt = pad.groundAt;
  const top = (x) => groundAt(x) - SEA * z;
  ctx.globalAlpha = 1 - space;

  // Smoke puffing out of the volcano, drifting off and fading.
  const vx = w * 0.3;
  const vy = top(vx) + 4 * z - 62 * z;
  for (let i = 0; i < 4; i++) {
    const f = (t * 0.18 + i / 4) % 1;
    ctx.fillStyle = `rgba(150,150,155,${0.55 * (1 - f) * (1 - space)})`;
    ctx.beginPath();
    ctx.arc(vx + f * 30 * z + Math.sin(f * 6 + i) * 3 * z, vy - 6 * z - f * 60 * z, (6 + f * 14) * z, 0, Math.PI * 2);
    ctx.fill();
  }

  // Waves rolling along and sun glints twinkling on the water.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2.5 * z;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let row = 0; row < 2; row++) {
    const gap = 34 * z;
    const shift = (t * (row ? 9 : 14) * z + row * 17 * z) % gap;
    for (let x = shift - gap; x < w + gap; x += gap) {
      const y = top(x) + (8 + row * 12) * z + Math.sin(t * 2 + x * 0.05) * 1 * z;
      ctx.moveTo(x + Math.cos(Math.PI * 1.1) * 6 * z, y + Math.sin(Math.PI * 1.1) * 6 * z);
      ctx.arc(x, y, 6 * z, Math.PI * 1.1, Math.PI * 1.9);
    }
  }
  ctx.stroke();
  for (let i = 0; i < 26; i++) {
    const gx = (hash(i) * w) | 0;
    const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    ctx.fillStyle = `rgba(255,255,255,${0.85 * tw * (1 - space)})`;
    ctx.fillRect(gx, top(gx) + (4 + ((i * 37) % 22)) * z, (4 + (i % 4) * 3) * z * tw, 1.6 * z);
  }

  // A sailboat bobbing along far out.
  const bx = ((w * 0.62 + t * 4 * z) % (w + 80 * z)) - 40 * z;
  const by = top(bx) + 9 * z + Math.sin(t * 1.6) * 1.5 * z;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.sin(t * 1.3) * 0.06);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-16 * z, 0);
  ctx.lineTo(16 * z, 0);
  ctx.lineTo(11 * z, 6 * z);
  ctx.lineTo(-11 * z, 6 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff4d6d';
  ctx.fillRect(-13 * z, 2 * z, 26 * z, 1.6 * z);
  ctx.strokeStyle = '#8a5a3c';
  ctx.lineWidth = 1.5 * z;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -30 * z);
  ctx.stroke();
  ctx.fillStyle = '#fffdf5';
  ctx.beginPath();
  ctx.moveTo(1.5 * z, -28 * z);
  ctx.quadraticCurveTo(12 * z, -14 * z, 15 * z, -2 * z);
  ctx.lineTo(1.5 * z, -2 * z);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff4d6d';
  ctx.beginPath();
  ctx.moveTo(-1.5 * z, -24 * z);
  ctx.lineTo(-1.5 * z, -2 * z);
  ctx.lineTo(-11 * z, -2 * z);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Palms on the sand, swaying in the sea breeze.
  PALMS.forEach(([fx, s], j) => {
    const sp = palmSprite(Math.round(s * z * 20) / 20);
    const x = drift(pad, fx, 120 * z);
    ctx.save();
    ctx.translate(x, groundAt(x) + 2 + (j === 2 ? 26 * z : 0));
    if (sway) ctx.rotate(Math.sin(t * 0.9 + j * 2) * 0.03 + Math.sin(t * 2.3 + j) * 0.008);
    ctx.drawImage(sp.canvas, -sp.x0, -sp.y0, sp.w, sp.h);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

// ---- Slide layer ----

// The slide: white columns on footings cradling a fiberglass trough in his crayon colors, with
// water in it. Its tricks (from shapeSlide) are drawn too: toilet bowls and rapids. Returns what
// the live painting needs to make the water run.
export function paintSlide(pad, path, shape) {
  const { ctx, k, unit } = pad;
  const { path: cut, bowls, rapids, corkscrews } = shape;
  const pts = cut.map((p) => pad.toScreen(p));
  const n = pts.length;
  const width = Math.max(6, 18 * k);

  // Columns, skipping the tower, bowls (they have their own legs) and anything too steep.
  const bowlAt = bowls.map((b) => ({ c: pad.toScreen({ x: b.cx, y: b.cy }), R: Math.max(18, b.r * unit * 1.1) }));
  const inBowl = (p) => bowlAt.some(({ c, R }) => Math.hypot(p.x - c.x, p.y - c.y) < R * 1.4);
  const st = stationFor('slide');
  const spots = supportSpots2D(cut, uprightNormals(cut), {
    every: Math.max(0.1, 26 / unit),
    drop: width / 2 / unit,
    clear: Math.max(0.04, 10 / unit),
    top: SUPPORT_TOP,
    skip: (i) => cut[i].x < st.x1 + 0.03 || inBowl(pts[i]),
  });
  paintPosts(pad, spots, width);

  const shifted = (dy) => pts.map((p) => ({ x: p.x, y: p.y + dy }));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // A shadow, the dark rim, then the trough in crayon colors (same-colored runs batched).
  ctx.save();
  ctx.translate(3 * k, 7 * k);
  smoothLine(ctx, pts);
  ctx.strokeStyle = 'rgba(20,40,60,0.12)';
  ctx.lineWidth = width + 4 * k;
  ctx.stroke();
  ctx.restore();
  smoothLine(ctx, pts);
  ctx.strokeStyle = 'rgba(20,40,80,0.4)';
  ctx.lineWidth = width + Math.max(2, 4 * k);
  ctx.stroke();
  let along = 0;
  const alongAt = new Float32Array(n);
  for (let i = 1; i < n; i++) alongAt[i] = along += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / unit;
  strokeByColor(ctx, pts, (i) => cssColor(cut[i].c, alongAt[i]), width);
  // Shading: darker underneath, a gloss streak on the side and a bright rolled lip on top.
  smoothLine(ctx, shifted(width * 0.26));
  ctx.strokeStyle = 'rgba(0,20,60,0.16)';
  ctx.lineWidth = width * 0.45;
  ctx.stroke();
  smoothLine(ctx, shifted(-width * 0.12));
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, width * 0.14);
  ctx.stroke();
  smoothLine(ctx, shifted(-width * 0.42));
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1, width * 0.1);
  ctx.stroke();
  // The water in it.
  smoothLine(ctx, shifted(-width * 0.05));
  ctx.strokeStyle = 'rgba(191,233,255,0.9)';
  ctx.lineWidth = Math.max(2, width * 0.34);
  ctx.stroke();

  const rapidsAt = rapids.map((r) => pts.slice(r.i0, r.i1 + 1));
  for (const r of rapidsAt) paintRapids(pad, r);
  for (const [j, b] of bowls.entries()) paintBowl(pad, b, cssColor(path[b.i1].c, 0), bowlAt[j]);
  for (const c of corkscrews) paintTwistyTube(pad, path, c, width);

  // Where the water can be seen running: not under bowls, through rapids or in a twisty tube.
  const hidden = new Uint8Array(n);
  for (const r of rapids) hidden.fill(1, r.i0, r.i1 + 1);
  for (let i = 1; i < n; i++) if (cut[i].twist) hidden.fill(1, i - 1, i + 1);
  for (let i = 0; i < n; i++) if (inBowl(pts[i])) hidden[i] = 1;
  return { pts, hidden, width, rapids: rapidsAt, bowls: bowlAt };
}

// A twisty corkscrew tube where he drew a row of curls: the curls tidied into a neat spring,
// a see-through tube in his crayon color with bright hoops round it and water swirling inside.
function paintTwistyTube(pad, path, c, width) {
  const { ctx, k } = pad;
  const pts = [path[c.i0], ...springPoints(path[c.i0], path[c.i1], c), path[c.i1]].map((p) => pad.toScreen(p));
  const color = cssColor(path[c.i1].c, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  smoothLine(ctx, pts);
  ctx.strokeStyle = 'rgba(20,40,80,0.35)';
  ctx.lineWidth = width + Math.max(2, 4 * k);
  ctx.stroke();
  smoothLine(ctx, pts);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  smoothLine(ctx, pts);
  ctx.strokeStyle = 'rgba(191,233,255,0.9)';
  ctx.lineWidth = Math.max(2, width * 0.34);
  ctx.stroke();
  // The clear tube round it, with a shine.
  smoothLine(ctx, pts);
  ctx.strokeStyle = 'rgba(220,245,255,0.35)';
  ctx.lineWidth = width * 1.5;
  ctx.stroke();
  smoothLine(ctx, pts.map((p) => ({ x: p.x, y: p.y - width * 0.45 })));
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1, width * 0.12);
  ctx.stroke();
  // Hoops every so often.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1, width * 0.14);
  for (let i = 4; i < pts.length - 2; i += Math.max(3, Math.round(pts.length / (c.turns * 8)))) {
    const a = pts[i - 1];
    const b = pts[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / l) * width * 0.75;
    const ny = ((b.x - a.x) / l) * width * 0.75;
    ctx.beginPath();
    ctx.moveTo(pts[i].x - nx, pts[i].y - ny);
    ctx.lineTo(pts[i].x + nx, pts[i].y + ny);
    ctx.stroke();
  }
}

// White columns on footings, each with a Y-bracket cradling the trough.
function paintPosts(pad, spots, width) {
  const { ctx, k } = pad;
  const cw = Math.max(2, 5 * k);
  const footW = cw * 2.8;
  const footH = Math.max(3, 6 * k);
  const shadows = new Path2D();
  const posts = new Path2D();
  const brackets = new Path2D();
  const feet = [];
  for (const sp of spots) {
    const p = pad.toScreen(sp);
    const gy = pad.groundAt(p.x);
    if (gy - p.y < 8) continue;
    shadows.ellipse(p.x + 2 * k, gy + 2 * k, footW * 0.7, Math.max(1.5, 3 * k), 0, 0, Math.PI * 2);
    posts.rect(p.x - cw / 2, p.y + width * 0.25, cw, gy - footH - p.y - width * 0.25);
    brackets.moveTo(p.x, p.y + width * 0.45);
    brackets.lineTo(p.x - width * 0.45, p.y - width * 0.05);
    brackets.moveTo(p.x, p.y + width * 0.45);
    brackets.lineTo(p.x + width * 0.45, p.y - width * 0.05);
    feet.push([p.x, gy]);
  }
  ctx.fillStyle = 'rgba(170,120,60,0.25)';
  ctx.fill(shadows);
  ctx.strokeStyle = '#f4f6f8';
  ctx.lineWidth = Math.max(1.5, 3 * k);
  ctx.lineCap = 'round';
  ctx.stroke(brackets);
  ctx.fillStyle = '#f4f6f8';
  ctx.fill(posts);
  ctx.fillStyle = 'rgba(80,100,130,0.18)';
  for (const sp of spots) {
    const p = pad.toScreen(sp);
    const gy = pad.groundAt(p.x);
    if (gy - p.y < 8) continue;
    ctx.fillRect(p.x + cw * 0.1, p.y + width * 0.25, cw * 0.4, gy - footH - p.y - width * 0.25);
  }
  ctx.fillStyle = '#d8d2c6';
  for (const [x, gy] of feet) ctx.fillRect(x - footW / 2, gy - footH, footW, footH + 2);
  ctx.fillStyle = '#eeeae2';
  for (const [x, gy] of feet) ctx.fillRect(x - footW / 2, gy - footH, footW, Math.max(1, footH * 0.3));
}

// Rapids: a wide channel with shaded rocks along both banks (the foam on top is painted live).
function paintRapids(pad, sp) {
  const { ctx, k } = pad;
  if (sp.length < 2) return;
  const line = () => {
    ctx.beginPath();
    sp.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  line();
  ctx.strokeStyle = '#7d8aa0';
  ctx.lineWidth = Math.max(12, 34 * k);
  ctx.stroke();
  line();
  ctx.strokeStyle = '#7fd8f5';
  ctx.lineWidth = Math.max(9, 26 * k);
  ctx.stroke();
  line();
  ctx.strokeStyle = 'rgba(30,120,170,0.35)';
  ctx.lineWidth = Math.max(3, 9 * k);
  ctx.stroke();
  let along = 0;
  let next = 0;
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1];
    const b = sp[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    along += seg;
    if (along < next || seg < 1e-6) continue;
    next = along + Math.max(10, 22 * k);
    const nx = -(b.y - a.y) / seg;
    const ny = (b.x - a.x) / seg;
    for (const s of [-1, 1]) {
      const rx = b.x + nx * s * 17 * k;
      const ry = b.y + ny * s * 17 * k;
      const r1 = Math.max(3, (6 + hash(i + s) * 3) * k);
      ctx.fillStyle = s > 0 ? '#8d8f94' : '#a39a8e';
      ctx.beginPath();
      ctx.ellipse(rx, ry, r1, r1 * 0.72, hash(i) - 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(rx - r1 * 0.3, ry - r1 * 0.3, r1 * 0.45, r1 * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// A toilet bowl, seen from the side: a glossy funnel narrowing to the drain, a white rim and the
// water inside (its swirl is painted live).
function paintBowl(pad, b, color, { c, R }) {
  const { ctx, k } = pad;
  const top = c.y - R * 0.75;
  const bottom = c.y + R * 0.8;
  const gy = pad.groundAt(c.x);
  // Legs and the drain pipe down to the ground.
  ctx.strokeStyle = '#f4f6f8';
  ctx.lineWidth = Math.max(2, 4 * k);
  ctx.lineCap = 'round';
  for (const s of [-0.8, 0.8]) {
    ctx.beginPath();
    ctx.moveTo(c.x + s * R, top + R * 0.2);
    ctx.lineTo(c.x + s * R * 1.1, gy + 2);
    ctx.stroke();
  }
  const pipe = ctx.createLinearGradient(c.x - R * 0.16, 0, c.x + R * 0.16, 0);
  pipe.addColorStop(0, '#9aa7bb');
  pipe.addColorStop(0.4, '#c3cdda');
  pipe.addColorStop(1, '#6f7d93');
  ctx.fillStyle = pipe;
  ctx.fillRect(c.x - R * 0.16, bottom - 2, R * 0.32, Math.max(0, gy - bottom + 2));
  // The funnel, lit from the left.
  ctx.beginPath();
  ctx.moveTo(c.x - R * 1.2, top);
  ctx.bezierCurveTo(c.x - R * 1.1, top + R * 0.9, c.x - R * 0.25, bottom - R * 0.5, c.x - R * 0.22, bottom);
  ctx.lineTo(c.x + R * 0.22, bottom);
  ctx.bezierCurveTo(c.x + R * 0.25, bottom - R * 0.5, c.x + R * 1.1, top + R * 0.9, c.x + R * 1.2, top);
  ctx.closePath();
  const gloss = ctx.createLinearGradient(c.x - R * 1.2, 0, c.x + R * 1.2, 0);
  gloss.addColorStop(0, shade(color, 1.25));
  gloss.addColorStop(0.35, color);
  gloss.addColorStop(1, shade(color, 0.7));
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,40,80,0.35)';
  ctx.lineWidth = Math.max(2, 3 * k);
  ctx.stroke();
  // A shine down the left side and white stripes swirling down the outside.
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(2, R * 0.08);
  ctx.beginPath();
  ctx.moveTo(c.x - R * 0.95, top + R * 0.2);
  ctx.quadraticCurveTo(c.x - R * 0.75, top + R * 0.9, c.x - R * 0.3, bottom - R * 0.15);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(2, R * 0.09);
  for (const f of [0.3, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(c.x - R * (1.15 - f * 0.8), top + R * 0.35 + f * R * 0.9);
    ctx.quadraticCurveTo(c.x, top + R * 0.65 + f * R * 1.1, c.x + R * (1.15 - f * 0.8), top + R * 0.15 + f * R * 0.9);
    ctx.stroke();
  }
  // Rim and the water inside.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(c.x, top, R * 1.25, R * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,40,80,0.2)';
  ctx.lineWidth = Math.max(1, 1.5 * k);
  ctx.stroke();
  const water = ctx.createRadialGradient(c.x, top, 0, c.x, top, R * 1.08);
  water.addColorStop(0, '#2b9fd8');
  water.addColorStop(1, '#7fe0f7');
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.ellipse(c.x, top, R * 1.08, R * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
}

// The tower at the start: stairs up the side with handrails, a steel lattice with gussets at
// the joints, the platform with its railing and a striped canopy (the flag and float are live).
export function paintTower(pad) {
  const { ctx, k } = pad;
  const st = stationFor('slide');
  const a = pad.toScreen({ x: st.x0, y: st.y });
  const b = pad.toScreen({ x: st.x1, y: st.y });
  const groundY = pad.groundAt((a.x + b.x) / 2);
  const len = b.x - a.x;
  const legL = a.x + 6 * k;
  const legR = b.x - 6 * k;
  // Zigzag stairs up the left side (behind the legs).
  const flights = 4;
  const sx0 = a.x - 26 * k;
  const sx1 = legL;
  const landing = (i) => groundY - ((groundY - a.y - 8 * k) * i) / flights;
  const across = (i) => (i % 2 ? sx1 : sx0);
  ctx.lineCap = 'round';
  for (let i = 0; i < flights; i++) {
    const x0 = across(i);
    const x1 = across(i + 1);
    const y0 = landing(i);
    const y1 = landing(i + 1);
    ctx.strokeStyle = '#c98f55';
    ctx.lineWidth = Math.max(2, 4 * k);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    // Treads.
    const treads = Math.max(3, Math.round(Math.abs(y1 - y0) / (6 * k)));
    ctx.strokeStyle = '#e8b680';
    ctx.lineWidth = Math.max(1, 2 * k);
    ctx.beginPath();
    for (let j = 1; j < treads; j++) {
      const f = j / treads;
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f;
      ctx.moveTo(x - 3 * k, y - 1 * k);
      ctx.lineTo(x + 3 * k, y - 1 * k);
    }
    ctx.stroke();
    // Handrail.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, 1.8 * k);
    ctx.beginPath();
    ctx.moveTo(x0, y0 - 12 * k);
    ctx.lineTo(x1, y1 - 12 * k);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, y1 - 12 * k);
    ctx.stroke();
  }
  // Legs, rungs and cross braces, with little gusset plates where they meet.
  ctx.strokeStyle = '#ff8c42';
  ctx.lineWidth = Math.max(3, 7 * k);
  ctx.lineCap = 'butt';
  for (const x of [legL, legR]) {
    ctx.beginPath();
    ctx.moveTo(x, a.y + 10 * k);
    ctx.lineTo(x, groundY);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, 2 * k);
  for (const x of [legL, legR]) {
    ctx.beginPath();
    ctx.moveTo(x - 1.5 * k, a.y + 10 * k);
    ctx.lineTo(x - 1.5 * k, groundY);
    ctx.stroke();
  }
  const levels = 4;
  const level = (i) => a.y + 14 * k + ((groundY - a.y - 14 * k) * i) / levels;
  ctx.strokeStyle = '#ff8c42';
  ctx.lineWidth = Math.max(1.5, 3 * k);
  ctx.beginPath();
  for (let i = 0; i < levels; i++) {
    ctx.moveTo(legL, level(i));
    ctx.lineTo(legR, level(i + 1));
    ctx.moveTo(legR, level(i));
    ctx.lineTo(legL, level(i + 1));
    ctx.moveTo(legL, level(i));
    ctx.lineTo(legR, level(i));
  }
  ctx.stroke();
  ctx.fillStyle = '#e0702a';
  for (let i = 0; i <= levels; i++) {
    for (const x of [legL, legR]) {
      ctx.beginPath();
      ctx.arc(x, level(i), Math.max(2, 4.5 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Concrete feet.
  ctx.fillStyle = '#d8d2c6';
  for (const x of [legL, legR]) ctx.fillRect(x - 7 * k, groundY - 5 * k, 14 * k, 7 * k);
  // Platform and railing.
  ctx.fillStyle = '#d9a066';
  ctx.fillRect(a.x - 8 * k, a.y + 8 * k, len + 16 * k, 8 * k);
  ctx.fillStyle = '#efc08f';
  ctx.fillRect(a.x - 8 * k, a.y + 8 * k, len + 16 * k, Math.max(1, 2 * k));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 3 * k);
  ctx.beginPath();
  ctx.moveTo(a.x - 8 * k, a.y - 14 * k);
  ctx.lineTo(a.x + len * 0.3, a.y - 14 * k);
  ctx.moveTo(a.x - 8 * k, a.y - 4 * k);
  ctx.lineTo(a.x + len * 0.3, a.y - 4 * k);
  for (const x of [a.x - 8 * k, a.x + len * 0.12, a.x + len * 0.3]) {
    ctx.moveTo(x, a.y - 14 * k);
    ctx.lineTo(x, a.y + 8 * k);
  }
  ctx.stroke();
  // Canopy posts and a striped roof with a scalloped edge.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, 4 * k);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y + 8 * k);
  ctx.lineTo(a.x, a.y - 62 * k);
  ctx.moveTo(b.x, a.y + 8 * k);
  ctx.lineTo(b.x, a.y - 62 * k);
  ctx.stroke();
  const roofY = a.y - 62 * k;
  const stripes = 6;
  const edge = (i) => a.x - 12 * k + ((len + 24 * k) * i) / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(a.x + len / 2, roofY - 30 * k);
    ctx.lineTo(edge(i), roofY);
    ctx.quadraticCurveTo((edge(i) + edge(i + 1)) / 2, roofY + 8 * k, edge(i + 1), roofY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  ctx.moveTo(a.x + len / 2, roofY - 30 * k);
  ctx.lineTo(edge(stripes), roofY);
  ctx.lineTo(edge(stripes) - 6 * k, roofY + 3 * k);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 2.5 * k);
  ctx.beginPath();
  ctx.moveTo(a.x + len / 2, roofY - 30 * k);
  ctx.lineTo(a.x + len / 2, roofY - 56 * k);
  ctx.stroke();
}

// ---- Live, in front of the slide ----

// Water running down the slide, foam on the rapids, the bowls swirling, the flag flapping and
// the float waiting at the top bobbing up and down.
export function paintSlideLive(pad, live, t) {
  const { ctx, k } = pad;
  if (live && live.pts.length > 1) {
    const { pts, hidden, width } = live;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, width * 0.14);
    ctx.setLineDash([Math.max(3, 9 * k), Math.max(6, 18 * k)]);
    ctx.lineDashOffset = -t * 70 * Math.max(0.3, k);
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < pts.length; i++) {
      if (hidden[i]) {
        on = false;
        continue;
      }
      const y = pts[i].y - width * 0.05;
      if (on) ctx.lineTo(pts[i].x, y);
      else ctx.moveTo(pts[i].x, y);
      on = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    for (const sp of live.rapids) rapidsFoam(ctx, sp, k, t);
    for (const b of live.bowls) bowlSwirl(ctx, b, t);
  }

  const st = stationFor('slide');
  const a = pad.toScreen({ x: st.x0, y: st.y });
  const b = pad.toScreen({ x: st.x1, y: st.y });
  const len = b.x - a.x;
  const pole = a.x + len / 2;
  const top = a.y - 62 * k - 56 * k;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(pole, top);
  for (let i = 1; i <= 6; i++) {
    const f = i / 6;
    ctx.lineTo(pole + 22 * k * f, top + 6 * k * f + Math.sin(t * 6 - f * 3) * 2.2 * k * f);
  }
  for (let i = 6; i >= 0; i--) {
    const f = i / 6;
    ctx.lineTo(pole + 22 * k * f, top + 12 * k - 6 * k * f + Math.sin(t * 6 - f * 3) * 2.2 * k * f);
  }
  ctx.closePath();
  ctx.fill();
  // The ring float, with a little head peeking out, bobbing on the water at the top.
  const fx = a.x + len * 0.62;
  const fy = a.y - 6 * k + Math.sin(t * 2.2) * 1.2 * k;
  ctx.fillStyle = '#f2c6a0';
  ctx.beginPath();
  ctx.arc(fx, fy - 13 * k, 7 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b3e26';
  ctx.beginPath();
  ctx.arc(fx, fy - 13 * k, 7.2 * k, Math.PI * 0.95, Math.PI * 1.95);
  ctx.fill();
  ctx.fillStyle = '#2ec4b6';
  roundRect(ctx, fx - 2 * k, fy - 16 * k, 10 * k, 4 * k, 2 * k);
  ctx.fill();
  ctx.fillStyle = '#ff8c42';
  ctx.beginPath();
  ctx.ellipse(fx, fy, 20 * k, 7 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(fx - 8 * k, fy - 3 * k, 6 * k, 1.8 * k, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(fx, fy - 1 * k, 9 * k, 3 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}

// White waves bouncing along the rapids, with spray flicking up.
function rapidsFoam(ctx, sp, k, t) {
  if (sp.length < 2) return;
  const gap = Math.max(10, 22 * k);
  let along = 0;
  let next = (t * 40 * Math.max(0.3, k)) % gap;
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1];
    const b = sp[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg < 1e-6) continue;
    while (along + seg >= next) {
      const f = (next - along) / seg;
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      const bob = Math.sin(t * 9 + next * 0.3);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y - 3 * k - bob * 1.5 * k, Math.max(3, 7 * k), Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(232,248,255,0.9)';
      ctx.beginPath();
      ctx.arc(x + 6 * k, y - 9 * k - Math.max(0, bob) * 5 * k, Math.max(1.2, 2.5 * k), 0, Math.PI * 2);
      ctx.fill();
      next += gap;
    }
    along += seg;
  }
}

// The water in a bowl, swirling round and round down the drain.
function bowlSwirl(ctx, { c, R }, t) {
  const top = c.y - R * 0.75;
  const spin = t * 2.4;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, R * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.2) {
    const r = 1 - a / (Math.PI * 5.4);
    ctx.lineTo(c.x + Math.cos(a + spin) * R * r, top + Math.sin(a + spin) * R * 0.25 * r);
  }
  ctx.stroke();
  ctx.fillStyle = '#1b4a7a';
  ctx.beginPath();
  ctx.ellipse(c.x, top, R * 0.14, R * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
}
