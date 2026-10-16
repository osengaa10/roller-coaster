// Pure track math: no DOM, no three.js, so it can be unit tested in node.
//
// Drawing coordinates are normalized: y = 0 is the ground, y = 1 is the top of
// the drawing area, x uses the same unit. World coordinates are meters.

export const WORLD_SCALE = 40; // meters per normalized drawing unit
export const STATION = { x0: 0.04, x1: 0.26, y: 0.06 };
export const MIN_DRAWN_LENGTH = 0.35; // how much he must draw before "go" lights up
export const MIN_Y = 0.025;
export const STEP = 0.5; // meters between final track samples

export const V_MIN = 5.5; // chain-lift speed: the train never stalls or rolls back
export const V_MAX = 30;
// The lift chain runs faster the higher it goes, so a climb into space doesn't take forever.
export const liftSpeed = (height) => Math.min(24, V_MIN + Math.max(0, height) * 0.1);
const G = 9.81;
const FRICTION = 0.015;
const BRAKE_LENGTH = 0.7; // normalized
const BRAKE_DECEL = 7;
const Z_DRIFT = 0.4; // sideways shift per unit of backwards travel, keeps loops from hitting themselves
const LONG_INVERSION = 22; // meters; longer upside-down runs get rolled back upright

// Crayon colors. Index RAINBOW cycles through hues along the track.
export const TRACK_COLORS = ['#e63946', '#ff8c42', '#3bb273', '#3a86ff', '#9b5de5'];
export const RAINBOW = TRACK_COLORS.length;
const RAINBOW_PERIOD = 1.5; // normalized units per trip around the color wheel

// [r, g, b] in 0..1 for a crayon index at a distance (normalized units) along the track.
export function colorAt(c, d = 0, steps = 0) {
  if (c !== RAINBOW) {
    const hex = TRACK_COLORS[c] || TRACK_COLORS[0];
    return [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
  }
  let h = (((d / RAINBOW_PERIOD) % 1) + 1) % 1;
  if (steps) h = Math.round(h * steps) / steps;
  return hsl(h, 0.85, 0.55);
}

export function cssColor(c, d = 0) {
  const [r, g, b] = colorAt(c, d, 24).map((v) => Math.round(v * 255));
  return `rgb(${r},${g},${b})`;
}

function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

// Strokes are { c: crayon, p: [points] }. Older saves were bare point arrays.
export function normalizeStroke(s) {
  return Array.isArray(s) ? { c: 0, p: s } : s;
}

// The full 2D path the player sees: station, then everything drawn, joined end to end.
export function pathFromStrokes(strokes) {
  const path = [
    { x: STATION.x0, y: STATION.y, c: 0 },
    { x: STATION.x1, y: STATION.y, c: 0 },
  ];
  for (const stroke of strokes) {
    const { c, p } = normalizeStroke(stroke);
    for (const pt of p) path.push({ x: pt.x, y: pt.y, c });
  }
  return path;
}

export function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

export function drawnLength(strokes) {
  return pathLength(pathFromStrokes(strokes)) - (STATION.x1 - STATION.x0);
}

// Evenly spaced points along a polyline (works for any dimension via keys).
// A crayon index `c` rides along un-interpolated: each segment takes its end point's color,
// so the line joining two strokes matches the new stroke.
export function resample(pts, spacing, keys = ['x', 'y']) {
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (dist(pts[i], clean[clean.length - 1], keys) > 1e-9) clean.push(pts[i]);
  }
  if (clean.length < 2) return clean.map((p) => ({ ...p }));

  const out = [{ ...clean[0] }];
  let carry = 0; // distance already travelled since the last emitted point
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1];
    const b = clean[i];
    const seg = dist(a, b, keys);
    let t = spacing - carry;
    while (t <= seg) {
      const f = t / seg;
      const p = {};
      for (const k of keys) p[k] = a[k] + (b[k] - a[k]) * f;
      if ('c' in b) p.c = b.c;
      out.push(p);
      t += spacing;
    }
    carry = seg - (t - spacing);
  }
  const last = clean[clean.length - 1];
  if (dist(out[out.length - 1], last, keys) > spacing * 0.25) out.push({ ...last });
  return out;
}

// Repeated [1 2 1] blur with both ends pinned. Irons out finger wobble and sharp corners.
export function smooth(pts, passes, keys = ['x', 'y']) {
  let cur = pts.map((p) => ({ ...p }));
  for (let n = 0; n < passes; n++) {
    const next = cur.map((p) => ({ ...p }));
    for (let i = 1; i < cur.length - 1; i++) {
      for (const k of keys) next[i][k] = (cur[i - 1][k] + 2 * cur[i][k] + cur[i + 1][k]) / 4;
    }
    cur = next;
  }
  return cur;
}

function dist(a, b, keys) {
  let s = 0;
  for (const k of keys) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
}

export function buildTrack(strokes) {
  // 1. 2D path: station + drawing + flat brake run in whatever direction he was heading.
  const drawn = resample(pathFromStrokes(strokes), 0.012);
  let dirX = 1;
  for (let i = drawn.length - 1; i > 0 && drawn.length - i < 12; i--) {
    const dx = drawn[drawn.length - 1].x - drawn[i - 1].x;
    if (Math.abs(dx) > 0.01) {
      dirX = Math.sign(dx);
      break;
    }
  }
  const end = drawn[drawn.length - 1];
  const withBrake = resample(
    [...drawn, { x: end.x + dirX * 0.06, y: end.y, c: 0 }, { x: end.x + dirX * BRAKE_LENGTH, y: end.y, c: 0 }],
    0.012,
  );
  const flat = smooth(withBrake, 10);
  for (const p of flat) p.y = Math.max(p.y, MIN_Y);

  // 2. Into 3D meters, drifting sideways (z) whenever the path doubles back.
  let z = 0;
  const pts3 = flat.map((p, i) => {
    if (i > 0) z += Math.max(0, flat[i - 1].x - p.x) * Z_DRIFT;
    return { x: (p.x - STATION.x0) * WORLD_SCALE, y: p.y * WORLD_SCALE, z: z * WORLD_SCALE, c: p.c ?? 0 };
  });
  const keys3 = ['x', 'y', 'z'];
  const samples = smooth(resample(smooth(pts3, 4, keys3), STEP, keys3), 3, keys3);

  const n = samples.length;
  const pos = new Float32Array(n * 3);
  samples.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));

  // 3. Frames. "up" is the in-plane normal of the drawn line, so loops turn him upside down.
  const tan = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  let prevN = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(n - 1, i + 1)];
    const t = norm([b.x - a.x, b.y - a.y, b.z - a.z]) || [1, 0, 0];
    let nv = [-t[1], t[0], 0];
    const d = dot(nv, t);
    nv = norm([nv[0] - t[0] * d, nv[1] - t[1] * d, nv[2] - t[2] * d]) || prevN;
    prevN = nv;
    tan.set(t, i * 3);
    normal.set(nv, i * 3);
  }

  // Long upside-down stretches (e.g. drawing right-to-left for a while) get a barrel roll
  // back to upright; short ones (loops) stay upside down because that's the fun part.
  const flip = new Float32Array(n);
  for (let i = 0; i < n; ) {
    if (normal[i * 3 + 1] < -0.2) {
      let j = i;
      while (j < n && normal[j * 3 + 1] < -0.2) j++;
      if ((j - i) * STEP > LONG_INVERSION) flip.fill(1, i, j);
      i = j;
    } else i++;
  }
  const roll = boxBlur(flip, Math.round(7 / STEP));
  const up = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = [tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]];
    const nv = [normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]];
    const b = cross(t, nv);
    const phi = roll[i] * Math.PI;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    up.set(norm([nv[0] * c + b[0] * s, nv[1] * c + b[1] * s, nv[2] * c + b[2] * s]) || nv, i * 3);
  }

  // 4. Speed: real-ish energy on drops, chain lift floor on climbs, brakes at the end.
  const length = (n - 1) * STEP;
  const speed = new Float32Array(n);
  const lift = new Uint8Array(n);
  let v2 = V_MIN * V_MIN;
  for (let i = 0; i < n; i++) {
    if (i > 0) v2 += 2 * G * (pos[(i - 1) * 3 + 1] - pos[i * 3 + 1]) - 2 * FRICTION * G * STEP;
    let v = Math.sqrt(Math.max(0, v2));
    const floor = liftSpeed(pos[i * 3 + 1]);
    if (v < floor) {
      v = floor;
      lift[i] = tan[i * 3 + 1] > 0.05 ? 1 : 0;
    }
    v = Math.min(v, V_MAX);
    v2 = v * v;
    speed[i] = v;
  }
  for (let i = 0; i < n; i++) {
    const toEnd = length - i * STEP;
    speed[i] = Math.max(0.6, Math.min(speed[i], Math.sqrt(2 * BRAKE_DECEL * toEnd)));
  }

  // 5. Places to shout "wheee": the top of any big drop.
  const whee = [];
  const ahead = Math.round(20 / STEP);
  for (let i = 0; i + ahead < n; i++) {
    const drop = pos[i * 3 + 1] - pos[(i + ahead) * 3 + 1];
    if (drop > 9 && (whee.length === 0 || (i - whee[whee.length - 1]) * STEP > 40)) whee.push(i);
  }

  // 6. Paint: one color per sample, rainbow measured along the track.
  const rgb = new Float32Array(n * 3);
  samples.forEach((p, i) => rgb.set(colorAt(p.c ?? 0, (i * STEP) / WORLD_SCALE), i * 3));

  return { count: n, step: STEP, length, pos, tan, up, speed, lift, whee, rgb };
}

// Where to stand support pillars: one every few meters, from just under the track down to
// the grass, skipping any pillar that would poke through another part of the track
// (under a crest, inside a loop, or where the track crosses back under itself).
const POLE_EVERY = 7; // meters
const POLE_ATTACH = 3; // meters of track either side that the pillar is allowed to touch
const CLEARANCE = 1.6; // horizontal meters a pillar must stay away from the track and car
const A_FRAME_FROM = 10; // meters: taller supports become two-legged A-frames
const UPRIGHT = 0.8; // track tilted more than this (up.y) gets no supports
const LEG_CLEARANCE = 1.6;

// The two legs of an A-frame support, as [top, bottom] points.
export function supportLegs(spot) {
  return [-1, 1].map((s) => [
    { x: spot.x + s * spot.dir.x * 0.3, y: spot.y, z: spot.z + s * spot.dir.z * 0.3 },
    { x: spot.x + s * spot.dir.x * spot.spread, y: 0, z: spot.z + s * spot.dir.z * spot.spread },
  ]);
}

export function supportSpots(track) {
  const { count: n, pos, up, step } = track;
  const spots = [];
  const near = Math.round(POLE_ATTACH / step);
  for (let i = 0; i < n; i += Math.round(POLE_EVERY / step)) {
    // Only under upright track: in loops and other inversions "under the spine" points sideways
    // or up, and a column there would hold nothing. Loops hold themselves up.
    if (up[i * 3 + 1] < UPRIGHT) continue;
    const base = {
      x: pos[i * 3] - up[i * 3] * 0.6,
      y: pos[i * 3 + 1] - up[i * 3 + 1] * 0.6,
      z: pos[i * 3 + 2] - up[i * 3 + 2] * 0.6,
    };
    if (base.y < 1) continue;
    let blocked = false;
    for (let j = 0; j < n && !blocked; j++) {
      if (Math.abs(i - j) <= near) continue;
      const below = pos[j * 3 + 1] - 0.8 < base.y; // bottom of that track's spine
      const close = Math.hypot(pos[j * 3] - base.x, pos[j * 3 + 2] - base.z) < CLEARANCE;
      blocked = below && close;
    }
    if (blocked) continue;

    // Sideways direction (across the track, level with the ground) for A-frame legs.
    const t = [track.tan[i * 3], track.tan[i * 3 + 2]];
    const flat = Math.hypot(t[0], t[1]);
    base.dir = flat > 0.2 ? { x: -t[1] / flat, z: t[0] / flat } : { x: 0, z: 1 };
    base.spread = 0;
    if (base.y > A_FRAME_FROM) {
      base.spread = 0.8 + Math.min(base.y, 40) * 0.12; // legs stop spreading on giant towers
      if (legsHitTrack(track, i, near, supportLegs(base))) base.spread = 0;
    }
    spots.push(base);
  }
  return spots;
}

function legsHitTrack(track, i, near, legs) {
  const { count: n, pos } = track;
  for (const [a, b] of legs) {
    for (let k = 0; k <= 10; k++) {
      const f = k / 10;
      const p = [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f];
      for (let j = 0; j < n; j++) {
        if (Math.abs(i - j) <= near) continue;
        if (Math.hypot(pos[j * 3] - p[0], pos[j * 3 + 1] - p[1], pos[j * 3 + 2] - p[2]) < LEG_CLEARANCE) return true;
      }
    }
  }
  return false;
}

// The ride proper, between leaving the station and reaching the brake run (sample indices).
function rideSpan(track, startMeters = 18, endMeters = 30) {
  return [Math.round(startMeters / track.step), track.count - 1 - Math.round(endMeters / track.step)];
}

// Stars to fly through: one every STAR_EVERY meters along the ride.
const STAR_EVERY = 25;
export function starSpots(track) {
  const [a, b] = rideSpan(track);
  const out = [];
  for (let i = a; i <= b; i += Math.round(STAR_EVERY / track.step)) out.push(i);
  return out;
}

// The splash pond goes in the deepest low dip that comes right after a big drop.
const SPLASH_LOW = 4.5; // meters
const SPLASH_DROP = 10;
export function splashSpot(track) {
  const { pos, up, step } = track;
  const y = (i) => pos[i * 3 + 1];
  const [a, b] = rideSpan(track);
  const back = Math.round(40 / step);
  const win = Math.round(5 / step);
  let best = null;
  let bestDrop = 0;
  for (let i = a; i <= b; i++) {
    if (y(i) > SPLASH_LOW || up[i * 3 + 1] < 0.5) continue;
    let isMin = true;
    for (let j = Math.max(0, i - win); j <= Math.min(track.count - 1, i + win) && isMin; j++) if (y(j) < y(i)) isMin = false;
    if (!isMin) continue;
    let peak = 0;
    for (let j = Math.max(0, i - back); j < i; j++) peak = Math.max(peak, y(j));
    if (peak - y(i) >= SPLASH_DROP && peak - y(i) > bestDrop) {
      best = i;
      bestDrop = peak - y(i);
    }
  }
  return best;
}

// Tunnels: stretches that skim along the ground. Index ranges [start, end].
const TUNNEL_LOW = 3.5; // meters
const TUNNEL_MIN = 15;
const TUNNEL_MAX = 40;
export function tunnelRuns(track, splash = splashSpot(track)) {
  const { pos, up, step } = track;
  const [a, b] = rideSpan(track, 14, 32);
  const clear = Math.round(14 / step);
  const ok = (i) =>
    pos[i * 3 + 1] < TUNNEL_LOW && up[i * 3 + 1] > 0.7 && (splash === null || Math.abs(i - splash) > clear);
  const runs = [];
  for (let i = a; i <= b; ) {
    if (!ok(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 <= b && ok(j + 1)) j++;
    if ((j - i) * step >= TUNNEL_MIN) runs.push([i, Math.min(j, i + Math.round(TUNNEL_MAX / step))]);
    i = j + 1;
  }
  return runs;
}

function boxBlur(arr, r) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) {
      s += arr[j];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l < 1e-9 ? null : [v[0] / l, v[1] / l, v[2] / l];
}
