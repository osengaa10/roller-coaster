// Shared art for the drawing screens. The first half is pure math about the drawn line (no DOM,
// so it's unit tested): which side of the rail the spine hangs on, where the lift chain runs and
// where support columns can stand. The second half paints things both screens use: cached
// sprites, drifting clouds, flapping birds.
import { resample, findLoops, findHairpins, LONG_INVERSION, WORLD_SCALE, liftSpeed, V_MIN, V_MAX } from './track.js';

const SAMPLE = 0.012; // normalized spacing the shape is worked out at (the same as buildTrack)
const ROLL = 7 / WORLD_SCALE; // a barrel roll eases in over this much track either side, like the ride
const G = 9.81;

// The drawn line's side-view shape, matching how the ride will build it. For each point of `pts`
// (normalized, y up) it gives `up`: the direction the riders' heads point (x, y pairs), so the
// spine hangs on the other side. Normally that's the left of the direction of travel, so a loop has its
// spine on the outside. Loops drawn the other way round are ridden on the inside, long upside-down
// stretches roll back upright (short ones stay upside down, that's fun), and flat U-turns ride
// upright. Through a roll `up` shrinks to nothing and grows back the other way, so the spine
// swings across the rail like it does on the ride. `lift` marks where the chain pulls the train up.
// `structure` (the loops and U-turns found) can be passed back in while the line is still being
// drawn: points are only added at the end, so what was found stays valid.
export function trackShape(pts, structure = null) {
  const n = pts.length;
  const up = new Float32Array(n * 2);
  const lift = new Uint8Array(n);
  if (n < 2) {
    if (n) up[1] = 1;
    return { up, lift, structure: structure || { loops: [], hairpins: new Map() } };
  }
  const smp = resample(pts.map((p) => ({ x: p.x, y: p.y })), SAMPLE);
  const m = smp.length;
  if (!structure) {
    const loops = findLoops(smp);
    structure = { loops, hairpins: findHairpins(smp, loops) };
  }

  // Left-hand normal of the direction of travel, over a few samples so finger wobble doesn't show.
  const nx = new Float32Array(m);
  const ny = new Float32Array(m);
  const ty = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    const a = smp[Math.max(0, k - 3)];
    const b = smp[Math.min(m - 1, k + 3)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    nx[k] = l ? -dy / l : 0;
    ny[k] = l ? dx / l : 1;
    ty[k] = l ? dy / l : 0;
  }
  const flip = new Float32Array(m);
  const tag = new Uint8Array(m); // 1: in a loop, 2: in a U-turn
  for (const { a, b, dir } of structure.loops) {
    for (let k = a; k <= Math.min(b, m - 1); k++) {
      tag[k] = 1;
      if (dir < 0) flip[k] = 1;
    }
  }
  const turn = new Float32Array(m);
  for (const [a, { b }] of structure.hairpins) {
    for (let k = a; k <= Math.min(b, m - 1); k++) {
      tag[k] = 2;
      turn[k] = 1;
    }
  }
  const long = LONG_INVERSION / WORLD_SCALE;
  for (let i = 0; i < m; ) {
    if (!tag[i] && ny[i] < -0.2) {
      let j = i;
      while (j < m && !tag[j] && ny[j] < -0.2) j++;
      const nextToTurn = (i > 0 && tag[i - 1] === 2) || (j < m && tag[j] === 2);
      if (nextToTurn || (j - i) * SAMPLE > long) flip.fill(1, i, j);
      i = j;
    } else i++;
  }
  const r = Math.max(1, Math.round(ROLL / SAMPLE));
  const rolled = blur(flip, r);
  const turned = blur(turn, Math.ceil(r / 2));
  const ux = new Float32Array(m);
  const uy = new Float32Array(m);
  for (let k = 0; k < m; k++) {
    const c = Math.cos(Math.PI * rolled[k]) * (1 - turned[k]);
    ux[k] = nx[k] * c;
    uy[k] = ny[k] * c + turned[k];
  }

  // The chain: wherever the train would be slower than the lift on a climb (same rule as the ride).
  const chain = new Uint8Array(m);
  let v2 = V_MIN * V_MIN;
  for (let k = 0; k < m; k++) {
    const h = smp[k].y * WORLD_SCALE;
    if (k > 0) v2 += 2 * G * (smp[k - 1].y - smp[k].y) * WORLD_SCALE - 2 * 0.015 * G * SAMPLE * WORLD_SCALE;
    let v = Math.sqrt(Math.max(0, v2));
    const floor = liftSpeed(h);
    if (v < floor) {
      v = floor;
      chain[k] = ty[k] > 0.05 ? 1 : 0;
    }
    v = Math.min(v, Math.min(100, Math.max(V_MAX, floor * 1.25)));
    v2 = v * v;
  }

  // Back onto the drawn points, by distance along the line.
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const k = Math.min(m - 1, Math.round(s / SAMPLE));
    up[i * 2] = ux[k];
    up[i * 2 + 1] = uy[k];
    lift[i] = chain[k];
  }
  return { up, lift, structure };
}

// For things that never go upside down (the water slide): the normal that points up the screen.
export function uprightNormals(pts) {
  const n = pts.length;
  const up = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(n - 1, i + 2)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    if (!l) {
      up[i * 2 + 1] = 1;
      continue;
    }
    const s = dx >= 0 ? 1 : -1;
    up[i * 2] = (-dy / l) * s;
    up[i * 2 + 1] = (dx / l) * s;
  }
  return up;
}

// Moving average over +-r with the ends held.
function blur(arr, r) {
  const n = arr.length;
  const sum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + arr[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - r);
    const b = Math.min(n - 1, i + r);
    out[i] = (sum[b + 1] - sum[a]) / (b - a + 1);
  }
  return out;
}

// Where support columns go, in normalized units like the drawing (so it doesn't depend on zoom).
// Columns hang under the spine of upright track every `every` units, and only where the way down to
// the ground is clear: no column pokes through another piece of track below (the bottom of a loop,
// a lower hill). Tall ones become towers whose legs spread out (`spread`) unless that would hit
// track too. Returns [{ i, x, y (top of the column), spread }].
export function supportSpots2D(pts, up, { every = 0.1, drop = 0.015, minHeight = 0.02, top = 7.5, clear = 0.04, skip = null, towerFrom = 0.25 } = {}) {
  const n = pts.length;
  const out = [];
  if (n < 2) return out;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);

  // Segments bucketed by x, for the look below each candidate.
  const CELL = 0.05;
  const cells = new Map();
  for (let j = 0; j < n - 1; j++) {
    const lo = Math.floor(Math.min(pts[j].x, pts[j + 1].x) / CELL);
    const hi = Math.floor(Math.max(pts[j].x, pts[j + 1].x) / CELL);
    for (let c = lo; c <= hi; c++) (cells.get(c) || cells.set(c, []).get(c)).push(j);
  }
  // Calls fn(j) for every segment in the band x0..x1 that isn't part of this point's own stretch
  // (a segment can come up twice); stops early when fn returns true.
  const anyNear = (x0, x1, i, own, fn) => {
    for (let c = Math.floor(x0 / CELL); c <= Math.floor(x1 / CELL); c++) {
      for (const j of cells.get(c) || []) {
        if (Math.abs(s[j] - s[i]) > own && Math.abs(s[j + 1] - s[i]) > own && fn(j)) return true;
      }
    }
    return false;
  };
  // Lowest point of segment j inside the band x0..x1, or Infinity if it doesn't enter it.
  const lowestIn = (j, x0, x1) => {
    const a = pts[j];
    const b = pts[j + 1];
    if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1) return Infinity;
    if (Math.abs(b.x - a.x) < 1e-9) return Math.min(a.y, b.y);
    const at = (x) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    const lo = Math.max(x0, Math.min(a.x, b.x));
    const hi = Math.min(x1, Math.max(a.x, b.x));
    return Math.min(at(lo), at(hi));
  };
  // Points that can't hold a column are skipped a little way at a time, not one by one.
  const retry = every * 0.25;
  let next = 0;
  let lastTower = null; // neighbouring towers mustn't cross legs

  for (let i = 1; i < n; i++) {
    if (s[i] < next) continue;
    const p = pts[i];
    const ux = up[i * 2];
    const uy = up[i * 2 + 1];
    if (uy < 0.35 || p.y > top || (skip && skip(i))) {
      next = s[i] + retry;
      continue;
    }
    const x = p.x - ux * drop;
    const y = p.y - uy * drop;
    if (y < minHeight) {
      next = s[i] + retry;
      continue;
    }
    // Track right next to this point is allowed to be close (more of it on a slope).
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const slope = Math.abs(b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
    const own = Math.max(0.075, (clear + drop) / Math.max(slope, 0.3));
    if (anyNear(x - clear, x + clear, i, own, (j) => lowestIn(j, x - clear, x + clear) < y)) {
      next = s[i] + retry;
      continue;
    }

    let spread = 0;
    if (y > towerFrom) {
      spread = 0.012 + Math.min(y, 1.5) * 0.032;
      if (lastTower && Math.abs(x - lastTower.x) < spread + lastTower.spread + 0.02) spread = 0;
      const legs = [-1, 1].map((sd) => [{ x: x + sd * 0.008, y }, { x: x + sd * spread, y: 0 }]);
      const hit = (j) => legs.some(([lp, lq]) => segDist(pts[j], pts[j + 1], lp, lq) < clear);
      if (anyNear(x - spread - clear, x + spread + clear, i, own, hit)) spread = 0;
    }
    out.push({ i, x, y, spread });
    if (spread) lastTower = { x, spread };
    // Tall columns stand further apart, like the big ones on a real coaster.
    next = s[i] + every * (1 + Math.min(y, 1) * 0.8);
  }
  return out;
}

// Shortest distance between segments a-b and c-d.
function segDist(a, b, c, d) {
  if (crosses(a, b, c, d)) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}
function ptSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
function crosses(a, b, c, d) {
  const side = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
}

// ---- Painting ----

// Sprites: things that are costly to paint (clouds, trees, palms) are painted once onto a small
// canvas at the screen's pixel density, then stamped with drawImage every frame. Cleared on resize.
const sprites = new Map();
export function sprite(key, w, h, paint) {
  let s = sprites.get(key);
  if (!s) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    paint(ctx);
    s = { canvas: c, w, h };
    sprites.set(key, s);
  }
  return s;
}
export function clearSprites() {
  sprites.clear();
}

// A small stable random number in 0..1 for any number.
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// A puffy cloud sprite: a shaded blue-grey underside, a white body, and warm sunlit tops.
// kind picks one of a few shapes; size 1 is about 150 px wide on an iPad.
const CLOUD_SHAPES = [
  [[0, 0, 26], [28, -14, 32], [58, -4, 26], [80, 4, 18], [-20, 6, 17]],
  [[0, 0, 22], [24, -10, 27], [50, -18, 30], [78, -6, 24], [100, 4, 16], [-18, 6, 14]],
  [[0, 0, 18], [20, -9, 22], [42, -2, 17], [-14, 4, 12]],
];
export function cloudSprite(kind, z) {
  const puffs = CLOUD_SHAPES[kind % CLOUD_SHAPES.length];
  const minX = Math.min(...puffs.map(([x, , r]) => x - r));
  const maxX = Math.max(...puffs.map(([x, , r]) => x + r));
  const minY = Math.min(...puffs.map(([, y, r]) => y - r));
  const maxY = Math.max(...puffs.map(([, y, r]) => y + r)) + 6;
  const pad = 4;
  const w = (maxX - minX + pad * 2) * z;
  const h = (maxY - minY + pad * 2) * z;
  return sprite(`cloud${kind}:${z.toFixed(2)}`, w, h, (ctx) => {
    ctx.translate((pad - minX) * z, (pad - minY) * z);
    ctx.scale(z, z);
    const blob = (dy, grow, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (const [x, y, r] of puffs) {
        ctx.moveTo(x + r + grow, y + dy);
        ctx.arc(x, y + dy, r + grow, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    blob(6, 0, '#b8c9e2');
    const body = ctx.createLinearGradient(0, minY, 0, maxY);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.55, '#f7fbff');
    body.addColorStop(1, '#dbe6f4');
    blob(0, 0, body);
    // Sunlit tops: smaller puffs nudged up toward the sun.
    ctx.fillStyle = 'rgba(255,252,236,0.9)';
    ctx.beginPath();
    for (const [x, y, r] of puffs) {
      ctx.moveTo(x - r * 0.15 + r * 0.6, y - r * 0.28);
      ctx.arc(x - r * 0.15, y - r * 0.28, r * 0.6, 0, Math.PI * 2);
    }
    ctx.fill();
  });
}

// Clouds drifting slowly across, wrapping round. Each is [x (0..1 of the width), y (0..1 of the
// height), size, shape]. Bigger (nearer) ones drift faster.
export function paintClouds(ctx, w, h, z, t, alpha, list) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  for (const [fx, fy, s, kind] of list) {
    const sp = cloudSprite(kind, Math.round(s * z * 20) / 20);
    const span = w + sp.w;
    const x = ((((fx * w + t * 7 * s * z) % span) + span) % span) - sp.w;
    ctx.drawImage(sp.canvas, x, fy * h - sp.h / 2, sp.w, sp.h);
  }
  ctx.globalAlpha = 1;
}

// A few birds flapping slowly across the sky. Each is [y (0..1), size, speed, phase].
export function paintBirds(ctx, w, h, z, t, alpha, list, color = '#3c3c46') {
  if (alpha <= 0) return;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [fy, s, speed, ph] of list) {
    const r = 10 * s * z;
    const span = w + 8 * r;
    const x = ((ph * span + t * speed * z) % span) - 4 * r;
    const y = fy * h + Math.sin(t * 0.7 + ph * 9) * 6 * z;
    const flap = Math.sin(t * 7 * (1.2 - s * 0.3) + ph * 20);
    ctx.lineWidth = Math.max(1.5, 2.6 * s * z);
    ctx.beginPath();
    ctx.moveTo(x - r, y - flap * r * 0.55);
    ctx.quadraticCurveTo(x - r * 0.45, y - r * 0.5 - flap * r * 0.2, x, y);
    ctx.quadraticCurveTo(x + r * 0.45, y - r * 0.5 - flap * r * 0.2, x + r, y - flap * r * 0.55);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Rotating cartoon sun rays (a bright ring of them), for the sun on either screen.
export function paintSunRays(ctx, x, y, z, t, { color, count, inner, outer, width, alt = 0 }) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width * z;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const spin = t * 0.12;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + spin;
    const r1 = (outer - (i % 2 ? alt : 0) + Math.sin(t * 2 + i) * 2) * z;
    ctx.moveTo(x + Math.cos(a) * inner * z, y + Math.sin(a) * inner * z);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  ctx.stroke();
}

// Warm light glowing round the sun.
export function sunGlow(ctx, x, y, z) {
  const glow = ctx.createRadialGradient(x, y, 30 * z, x, y, 150 * z);
  glow.addColorStop(0, 'rgba(255,244,190,0.55)');
  glow.addColorStop(1, 'rgba(255,244,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 150 * z, y - 150 * z, 300 * z, 300 * z);
}

// A sun disc with a soft glossy shine.
export function paintSunDisc(ctx, x, y, r, light, dark) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Mix a css hex color toward black (f < 1) or white (f > 1, as 1 + amount).
export function shade(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  let rgb;
  if (m) rgb = [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16));
  else rgb = (hex.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  const out = rgb.map((v) => Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1)));
  return `rgb(${out.join(',')})`;
}
