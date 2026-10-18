// The water slide's drawing screen: a beach with the sea behind, a slide tower, the slide itself
// (tight circles shown as toilet bowls) and a peek at the splash pool at the end.
import { cssColor, stationFor } from './track.js';
import { cloud, sunGlow } from './draw.js';

const SUPPORT_TOP = 7.5; // normalized, same as the coaster: no poles drawn above this

// Sun in sunglasses, puffy clouds and a few gulls. Scenery is sized to the screen, not the zoom.
export function paintSky(pad, z, space) {
  const { ctx, w, h } = pad;
  const sx = w * 0.5;
  const sy = h * 0.15;
  sunGlow(ctx, sx, sy, z);
  ctx.fillStyle = '#ffd93d';
  ctx.strokeStyle = '#ffd93d';
  ctx.lineWidth = 6 * z;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const r1 = i % 2 ? 58 : 66;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * 46 * z, sy + Math.sin(a) * 46 * z);
    ctx.lineTo(sx + Math.cos(a) * r1 * z, sy + Math.sin(a) * r1 * z);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(sx, sy, 38 * z, 0, Math.PI * 2);
  ctx.fill();
  // Cool sunglasses and a big smile.
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
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx + s * 14 * z - 4 * z, sy - 8 * z, 3.5 * z, 2.2 * z, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#c46a00';
  ctx.lineWidth = 3 * z;
  ctx.beginPath();
  ctx.arc(sx, sy + 6 * z, 15 * z, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  // Clouds and gulls belong low in the sky, so they fade away as space comes into view.
  for (const [cx, cy, s] of [[0.12, 0.2, 1.1], [0.74, 0.26, 1.4], [0.3, 0.42, 0.75]]) cloud(ctx, cx * w, cy * h, s * z, 0.95 * (1 - space));
  ctx.strokeStyle = `rgba(60,60,70,${0.8 * (1 - space)})`;
  ctx.lineWidth = 3 * z;
  for (const [gx, gy, s] of [[0.62, 0.12, 1], [0.67, 0.16, 0.8], [0.88, 0.1, 0.9], [0.4, 0.3, 0.7]]) {
    const x = gx * w;
    const y = gy * h;
    const r = 11 * s * z;
    ctx.beginPath();
    ctx.arc(x - r, y, r, Math.PI * 1.15, Math.PI * 1.85);
    ctx.arc(x + r, y, r, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
}

// The sea along the horizon, with little waves and an island with a palm on it.
export function paintSea(pad, groundAt, z) {
  const { ctx, w } = pad;
  const sea = 30 * z;
  const top = (sx) => groundAt(sx) - sea;
  ctx.beginPath();
  for (let sx = 0; sx <= w + 8; sx += 8) ctx.lineTo(sx, top(sx));
  for (let sx = w + 8; sx >= 0; sx -= 8) ctx.lineTo(sx, groundAt(sx) + 4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, top(w / 2), 0, groundAt(w / 2));
  g.addColorStop(0, '#1b8fd1');
  g.addColorStop(1, '#5ad3f0');
  ctx.fillStyle = g;
  ctx.fill();

  // An island poking up out of the sea.
  const ix = w * 0.84;
  const iy = top(ix) + 6 * z;
  ctx.fillStyle = '#3ea85a';
  ctx.beginPath();
  ctx.ellipse(ix, iy, 70 * z, 22 * z, 0, Math.PI, 0);
  ctx.fill();
  palm(ctx, ix + 14 * z, iy - 16 * z, 0.55 * z, '#2f8a48', '#8a5a3c');

  // Sun glints dancing on the water.
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 26; i++) {
    const gx = ((Math.sin(i * 91.7) * 0.5 + 0.5) * w) | 0;
    const gy = top(gx) + (4 + ((i * 37) % 22)) * z;
    ctx.fillRect(gx, gy, (4 + (i % 4) * 3) * z, 1.6 * z);
  }

  // Wave scallops and sparkles.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2.5 * z;
  for (let row = 0; row < 2; row++) {
    const off = row * 17;
    for (let sx = (off * z) % (34 * z); sx < w; sx += 34 * z) {
      const y = top(sx) + (8 + row * 12) * z;
      ctx.beginPath();
      ctx.arc(sx, y, 6 * z, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  }
}

// Palms, shells and starfish on the sand.
export function paintSand(pad, groundAt, z) {
  const { ctx, w, h } = pad;
  for (const [fx, s] of [[0.58, 1], [0.95, 0.85]]) {
    const x = fx * w;
    palm(ctx, x, groundAt(x) + 2, s * z, '#3aa654', '#9a6a43');
  }
  for (const [fx, fy, kind] of [[0.08, 0.35, 0], [0.33, 0.6, 1], [0.5, 0.3, 0], [0.71, 0.55, 1], [0.86, 0.4, 0], [0.2, 0.75, 1]]) {
    const x = fx * w;
    const y = groundAt(x) + 8 + fy * (h - groundAt(x) - 8);
    if (kind) starfish(ctx, x, y, 9 * z);
    else shell(ctx, x, y, 8 * z);
  }
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
}

// The slide: a fat trough in his crayon colors with water running down the middle and white poles
// underneath. Its tricks (from shapeSlide) are drawn too:
// toilet bowls and rapids.
export function paintSlide(pad, path, shape) {
  const { ctx, groundY, k } = pad;
  const { path: cut, bowls, rapids } = shape;
  const pts = cut.map((p) => ({ ...pad.toScreen(p), c: p.c, high: p.y > SUPPORT_TOP }));

  // Support poles.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, 4 * k);
  ctx.lineCap = 'butt';
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc > Math.max(16, 40 * k) && groundY - pts[i].y > 24 * k && !pts[i].high) {
      acc = 0;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y + 8 * k);
      ctx.lineTo(pts[i].x, groundY + 4);
      ctx.stroke();
    }
  }

  const path2 = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Dark rim, then the trough in crayon colors (same-colored pieces batched into one path).
  path2();
  ctx.strokeStyle = 'rgba(20,40,80,0.35)';
  ctx.lineWidth = Math.max(8, 22 * k);
  ctx.stroke();
  ctx.lineWidth = Math.max(6, 17 * k);
  let along = 0;
  let color = null;
  const mid = (i) => ({ x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 });
  for (let i = 1; i < pts.length; i++) {
    along += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / pad.unit;
    const c = cssColor(pts[i].c, along);
    if (c !== color) {
      if (color) ctx.stroke();
      color = c;
      ctx.strokeStyle = c;
      ctx.beginPath();
      const from = i === 1 ? pts[0] : mid(i - 1);
      ctx.moveTo(from.x, from.y);
    }
    if (i < pts.length - 1) {
      const to = mid(i);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, to.x, to.y);
    } else ctx.lineTo(pts[i].x, pts[i].y);
  }
  if (color) ctx.stroke();
  // Water running down the middle, with white highlights.
  path2();
  ctx.strokeStyle = 'rgba(191,233,255,0.95)';
  ctx.lineWidth = Math.max(2, 6 * k);
  ctx.stroke();
  path2();
  ctx.setLineDash([Math.max(3, 9 * k), Math.max(6, 18 * k)]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 2.5 * k);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const r of rapids) paintRapids(pad, cut.slice(r.i0, r.i1 + 1));
  for (const b of bowls) paintBowl(pad, b, cssColor(path[b.i1].c, 0));
}

// Rapids: a wide foamy channel with rocks along both banks and white waves to bounce over.
function paintRapids(pad, pts) {
  const { ctx, k } = pad;
  if (pts.length < 2) return;
  const sp = pts.map((p) => pad.toScreen(p));
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
  // Along the channel: white wave bumps on top and rocks on both banks.
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
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y - 3 * k, Math.max(3, 7 * k), Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#e8f8ff';
    ctx.beginPath();
    ctx.arc(b.x + 6 * k, b.y + 4 * k, Math.max(1.5, 3.5 * k), 0, Math.PI * 2);
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.fillStyle = s > 0 ? '#8d8f94' : '#a39a8e';
      ctx.beginPath();
      ctx.ellipse(b.x + nx * s * 17 * k, b.y + ny * s * 17 * k, Math.max(3, 7 * k), Math.max(2, 5 * k), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// A toilet bowl, seen from the side: a wide rim, a funnel narrowing to the drain, a swirl inside.
function paintBowl(pad, b, color) {
  const { ctx, groundY, k } = pad;
  const c = pad.toScreen({ x: b.cx, y: b.cy });
  const R = Math.max(18, b.r * pad.unit * 1.1);
  const top = c.y - R * 0.75;
  const bottom = c.y + R * 0.8;
  // Legs and the drain pipe down to the ground.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, 4 * k);
  for (const s of [-0.8, 0.8]) {
    ctx.beginPath();
    ctx.moveTo(c.x + s * R, top + R * 0.2);
    ctx.lineTo(c.x + s * R * 1.1, groundY + 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#7d8aa0';
  ctx.fillRect(c.x - R * 0.16, bottom - 2, R * 0.32, Math.max(0, groundY - bottom + 2));
  // The funnel.
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(20,40,80,0.35)';
  ctx.lineWidth = Math.max(2, 4 * k);
  ctx.beginPath();
  ctx.moveTo(c.x - R * 1.2, top);
  ctx.bezierCurveTo(c.x - R * 1.1, top + R * 0.9, c.x - R * 0.25, bottom - R * 0.5, c.x - R * 0.22, bottom);
  ctx.lineTo(c.x + R * 0.22, bottom);
  ctx.bezierCurveTo(c.x + R * 0.25, bottom - R * 0.5, c.x + R * 1.1, top + R * 0.9, c.x + R * 1.2, top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // White stripes swirling down the outside.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(2, R * 0.09);
  for (const f of [0.3, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(c.x - R * (1.15 - f * 0.8), top + R * 0.35 + f * R * 0.9);
    ctx.quadraticCurveTo(c.x, top + R * 0.65 + f * R * 1.1, c.x + R * (1.15 - f * 0.8), top + R * 0.15 + f * R * 0.9);
    ctx.stroke();
  }
  // Rim and the water swirling inside.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(c.x, top, R * 1.25, R * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5ad3f0';
  ctx.beginPath();
  ctx.ellipse(c.x, top, R * 1.08, R * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, R * 0.06);
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.2) {
    const r = 1 - a / (Math.PI * 5.4);
    ctx.lineTo(c.x + Math.cos(a) * R * r, top + Math.sin(a) * R * 0.25 * r);
  }
  ctx.stroke();
  ctx.fillStyle = '#1b4a7a';
  ctx.beginPath();
  ctx.ellipse(c.x, top, R * 0.14, R * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
}

// The tower at the start: stairs up the side, a striped canopy, a flag, and the ring float waiting.
export function paintTower(pad) {
  const { ctx, groundY, k } = pad;
  const st = stationFor('slide');
  const a = pad.toScreen({ x: st.x0, y: st.y });
  const b = pad.toScreen({ x: st.x1, y: st.y });
  const len = b.x - a.x;
  const legL = a.x + 6 * k;
  const legR = b.x - 6 * k;
  // Legs and cross braces.
  ctx.strokeStyle = '#ff8c42';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(3, 7 * k);
  for (const x of [legL, legR]) {
    ctx.beginPath();
    ctx.moveTo(x, a.y + 10 * k);
    ctx.lineTo(x, groundY + 4);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(1.5, 3 * k);
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const y0 = a.y + 14 * k + ((groundY - a.y - 14 * k) * i) / levels;
    const y1 = a.y + 14 * k + ((groundY - a.y - 14 * k) * (i + 1)) / levels;
    ctx.beginPath();
    ctx.moveTo(legL, y0);
    ctx.lineTo(legR, y1);
    ctx.moveTo(legR, y0);
    ctx.lineTo(legL, y1);
    ctx.stroke();
  }
  // Zigzag stairs up the left side.
  ctx.strokeStyle = '#d9a066';
  ctx.lineWidth = Math.max(2, 5 * k);
  const flights = 4;
  const sx0 = a.x - 26 * k;
  const sx1 = legL;
  ctx.beginPath();
  for (let i = 0; i <= flights; i++) {
    const y = groundY - ((groundY - a.y) * i) / flights;
    ctx.lineTo(i % 2 ? sx1 : sx0, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 2 * k);
  ctx.beginPath();
  for (let i = 0; i <= flights; i++) ctx.lineTo(i % 2 ? sx1 : sx0, groundY - ((groundY - a.y) * i) / flights - 12 * k);
  ctx.stroke();
  // Platform and railing.
  ctx.fillStyle = '#d9a066';
  ctx.fillRect(a.x - 8 * k, a.y + 8 * k, len + 16 * k, 8 * k);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, 3 * k);
  ctx.beginPath();
  ctx.moveTo(a.x - 8 * k, a.y - 14 * k);
  ctx.lineTo(a.x + len * 0.3, a.y - 14 * k);
  for (const x of [a.x - 8 * k, a.x + len * 0.12, a.x + len * 0.3]) {
    ctx.moveTo(x, a.y - 14 * k);
    ctx.lineTo(x, a.y + 8 * k);
  }
  ctx.stroke();
  // Canopy posts, striped roof and a flag.
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
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(a.x + len / 2, roofY - 30 * k);
    ctx.lineTo(a.x - 12 * k + ((len + 24 * k) * i) / stripes, roofY);
    ctx.lineTo(a.x - 12 * k + ((len + 24 * k) * (i + 1)) / stripes, roofY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 2.5 * k);
  ctx.beginPath();
  ctx.moveTo(a.x + len / 2, roofY - 30 * k);
  ctx.lineTo(a.x + len / 2, roofY - 56 * k);
  ctx.stroke();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(a.x + len / 2, roofY - 56 * k);
  ctx.lineTo(a.x + len / 2 + 22 * k, roofY - 50 * k);
  ctx.lineTo(a.x + len / 2, roofY - 44 * k);
  ctx.closePath();
  ctx.fill();
  // The ring float waiting at the top, with a little head peeking out.
  const fx = a.x + len * 0.62;
  const fy = a.y - 6 * k;
  ctx.fillStyle = '#f2c6a0';
  ctx.beginPath();
  ctx.arc(fx, fy - 13 * k, 7 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff8c42';
  ctx.beginPath();
  ctx.ellipse(fx, fy, 20 * k, 7 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(fx, fy - 1 * k, 9 * k, 3 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}
