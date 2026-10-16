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
export const V_MAX = 24;
const G = 9.81;
const FRICTION = 0.015;
const BRAKE_LENGTH = 0.7; // normalized
const BRAKE_DECEL = 7;
const Z_DRIFT = 0.4; // sideways shift per unit of backwards travel, keeps loops from hitting themselves
const LONG_INVERSION = 22; // meters; longer upside-down runs get rolled back upright

// The full 2D path the player sees: station, then everything drawn, joined end to end.
export function pathFromStrokes(strokes) {
  const path = [
    { x: STATION.x0, y: STATION.y },
    { x: STATION.x1, y: STATION.y },
  ];
  for (const stroke of strokes) for (const p of stroke) path.push({ x: p.x, y: p.y });
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
    [...drawn, { x: end.x + dirX * 0.06, y: end.y }, { x: end.x + dirX * BRAKE_LENGTH, y: end.y }],
    0.012,
  );
  const flat = smooth(withBrake, 10);
  for (const p of flat) p.y = Math.max(p.y, MIN_Y);

  // 2. Into 3D meters, drifting sideways (z) whenever the path doubles back.
  let z = 0;
  const pts3 = flat.map((p, i) => {
    if (i > 0) z += Math.max(0, flat[i - 1].x - p.x) * Z_DRIFT;
    return { x: (p.x - STATION.x0) * WORLD_SCALE, y: p.y * WORLD_SCALE, z: z * WORLD_SCALE };
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
    if (v < V_MIN) {
      v = V_MIN;
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

  return { count: n, step: STEP, length, pos, tan, up, speed, lift, whee };
}

// Where to stand support pillars: one every few meters, from just under the track down to
// the grass, skipping any pillar that would poke through another part of the track
// (under a crest, inside a loop, or where the track crosses back under itself).
const POLE_EVERY = 7; // meters
const POLE_ATTACH = 3; // meters of track either side that the pillar is allowed to touch
const CLEARANCE = 1.6; // horizontal meters a pillar must stay away from the track and car

export function supportSpots(track) {
  const { count: n, pos, up, step } = track;
  const spots = [];
  const near = Math.round(POLE_ATTACH / step);
  for (let i = 0; i < n; i += Math.round(POLE_EVERY / step)) {
    const flip = up[i * 3 + 1] > 0 ? -0.6 : 0.6; // hang under the spine, even upside down
    const base = {
      x: pos[i * 3] + up[i * 3] * flip,
      y: pos[i * 3 + 1] + up[i * 3 + 1] * flip,
      z: pos[i * 3 + 2] + up[i * 3 + 2] * flip,
    };
    if (base.y < 1) continue;
    let blocked = false;
    for (let j = 0; j < n && !blocked; j++) {
      if (Math.abs(i - j) <= near) continue;
      const below = pos[j * 3 + 1] - 0.8 < base.y; // bottom of that track's spine
      const close = Math.hypot(pos[j * 3] - base.x, pos[j * 3 + 2] - base.z) < CLEARANCE;
      blocked = below && close;
    }
    if (!blocked) spots.push(base);
  }
  return spots;
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
