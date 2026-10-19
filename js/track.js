// Pure track math: no DOM, no three.js, so it can be unit tested in node.
//
// Drawing coordinates are normalized: y = 0 is the ground, y = 1 is the top of
// the drawing area, x uses the same unit. World coordinates are meters.

import { shapeSlide, bowlPath, slideRunout, POOL_Y } from './slide.js';

export const WORLD_SCALE = 40; // meters per normalized drawing unit
// Where the ride starts: the coaster station on the ground, the water slide on top of a tower.
export const STATIONS = {
  coaster: { x0: 0.04, x1: 0.26, y: 0.06 },
  slide: { x0: 0.04, x1: 0.22, y: 0.3 },
};
export const STATION = STATIONS.coaster;
export const stationFor = (kind = 'coaster') => STATIONS[kind] || STATION;
export const MIN_DRAWN_LENGTH = 0.35; // how much he must draw before "go" lights up
export const MIN_Y = 0.025;
export const STEP = 0.5; // meters between final track samples (more on giant coasters)
const MAX_SAMPLES = 16000; // giant space coasters get coarser sampling to stay fast

export const V_MIN = 5.5; // chain-lift speed: the train never stalls or rolls back
export const SLIDE_V_MIN = 4.5; // water jets push the raft at least this fast
export const V_MAX = 45; // about 100 mph, like the fastest real coasters
// The lift chain speeds up gently on tall hills so a giant one doesn't take forever, and very
// tall drops may go a bit faster. Kept modest so the ride stays smooth.
// Normal-size hills keep a gentle chain; past ~30 m it picks up much faster, so even a
// max-height hill climbs in well under half a minute.
const FAST_LIFT_FROM = 30; // meters
export const liftSpeed = (height, vMin = V_MIN) => {
  const h = Math.max(0, height);
  const gentle = vMin + Math.min(h, FAST_LIFT_FROM) * 0.12;
  return Math.min(100, gentle + Math.max(0, h - FAST_LIFT_FROM) * 0.7);
};
const G = 9.81;
const BRAKE_LENGTH = 0.7; // normalized
// Coaster: steel wheels, brakes at the end. Slide: water is slower and stops him in the pool.
const PROFILES = {
  coaster: { vMin: V_MIN, vMax: V_MAX, friction: 0.015, brakeDecel: 7 },
  slide: { vMin: SLIDE_V_MIN, vMax: 28, friction: 0.025, brakeDecel: 9 },
};
const maxSpeed = (height, prof) => Math.min(100, Math.max(prof.vMax, liftSpeed(height, prof.vMin) * 1.25));
const ENCLOSE_UP = 0.4; // slide steeper than this (or upside down) is a closed tube
const ENCLOSE_PAD = 6; // meters of closed tube either side, so the tube pieces don't flicker
const Z_DRIFT = 0.4; // sideways shift per unit of backwards travel, keeps loops from hitting themselves
const LONG_INVERSION = 22; // meters; longer upside-down runs get rolled back upright
// Drawn loops (the line crosses itself around a roundish shape) are ridden on the inside,
// whichever way round he drew them. Too small and there's no room to roll in; too big and
// it's really an out-and-back circuit, not a loop.
const LOOP_MIN = 0.45; // normalized perimeter
const LOOP_MAX = 2.5;
const LOOP_ROUND = 0.35; // 4*pi*area / perimeter^2: 1 for a circle, ~0 for a thin sliver
// Scribbles back and forth: a tight, flat turnaround becomes a banked U-turn out sideways (z),
// so each lane rides upright and the next one sits a little further over.
const HAIRPIN_REACH = 0.15; // normalized: how far either side of the turn to look for the lanes
const HAIRPIN_GAP = 0.08; // normalized: lanes further apart than this are a tall turn, kept as drawn
const HAIRPIN_FLAT = Math.cos(Math.PI / 6); // a lane is within 30 degrees of level
const HAIRPIN_R = 3.5; // meters
const HAIRPIN_BANK = 0.75; // radians of lean at the middle of the turn

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
export function pathFromStrokes(strokes, kind = 'coaster') {
  const st = stationFor(kind);
  const path = [
    { x: st.x0, y: st.y, c: 0 },
    { x: st.x1, y: st.y, c: 0 },
  ];
  for (const stroke of strokes) {
    const { c, p } = normalizeStroke(stroke);
    for (const pt of p) path.push({ x: pt.x, y: pt.y, c, w: pt.w || 0 });
  }
  return path;
}

export function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

export function drawnLength(strokes, kind = 'coaster') {
  const st = stationFor(kind);
  return pathLength(pathFromStrokes(strokes, kind)) - (st.x1 - st.x0);
}

// Evenly spaced points along a polyline (works for any dimension via keys).
// Labels (crayon `c`, wobble `w`, loop `lp`, hairpin `hp`, and the slide's pool, bowl and rapids tags) ride along
// un-interpolated: each segment takes its end point's labels, so the line joining two strokes
// matches the new stroke. `lerp` fields are interpolated without counting toward distance.
// A bowl marker is passed on to exactly one output point.
const CARRY = ['c', 'w', 'pool', 'bp', 'bi', 'rp', 'rl', 'lp', 'hp'];
export function resample(pts, spacing, keys = ['x', 'y'], lerp = []) {
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (dist(pts[i], clean[clean.length - 1], keys) > 1e-9) clean.push(pts[i]);
    else if (pts[i].bowl) clean[clean.length - 1] = { ...clean[clean.length - 1], bowl: pts[i].bowl };
  }
  if (clean.length < 2) return clean.map((p) => ({ ...p }));

  const out = [{ ...clean[0] }];
  let carry = 0; // distance already travelled since the last emitted point
  let pending = null;
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1];
    const b = clean[i];
    if (b.bowl) pending = b.bowl;
    const seg = dist(a, b, keys);
    let t = spacing - carry;
    while (t <= seg) {
      const f = t / seg;
      const p = {};
      for (const k of keys) p[k] = a[k] + (b[k] - a[k]) * f;
      for (const k of lerp) p[k] = a[k] + (b[k] - a[k]) * f;
      for (const k of CARRY) if (k in b) p[k] = b[k];
      if (pending) {
        p.bowl = pending;
        pending = null;
      }
      out.push(p);
      t += spacing;
    }
    carry = seg - (t - spacing);
  }
  const last = { ...clean[clean.length - 1] };
  delete last.bowl;
  if (dist(out[out.length - 1], last, keys) > spacing * 0.25) out.push(last);
  if (pending) out[out.length - 1].bowl = pending;
  return out;
}

// Lines drawn while zoomed way out carry finger wobble that's huge in real meters. Each point
// remembers how zoomed out he was (w: about 20 screen pixels, in track units) and gets averaged
// over that much track, so a line comes out as smooth as it looked on screen. Lines drawn at
// normal zoom have a small w and are left alone (the regular smoothing handles them).
export function smoothByScale(pts, spacing) {
  const n = pts.length;
  const sx = new Float64Array(n + 1);
  const sy = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sx[i + 1] = sx[i] + pts[i].x;
    sy[i + 1] = sy[i] + pts[i].y;
  }
  return pts.map((p, i) => {
    const k = Math.round((p.w || 0) / spacing);
    if (k <= 4 || i === 0 || i === n - 1) return p;
    const a = Math.max(0, i - k);
    const b = Math.min(n - 1, i + k);
    const count = b - a + 1;
    return { ...p, x: (sx[b + 1] - sx[a]) / count, y: (sy[b + 1] - sy[a]) / count };
  });
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

export function buildTrack(strokes, { kind = 'coaster' } = {}) {
  const slide = kind === 'slide';
  const prof = PROFILES[slide ? 'slide' : 'coaster'];
  const station = stationFor(kind);
  // 1. 2D path: station + drawing + the end (a flat brake run in whatever direction he was
  // heading, or for the slide a run down into the pool). The slide's tricks are shaped here:
  // tight circles are cut out (they come back as toilet bowls in 3D) and zigzags become rapids.
  let path = pathFromStrokes(strokes, kind);
  if (slide) path = shapeSlide(path).path;
  const drawn = smoothByScale(smoothByScale(resample(path, 0.012), 0.012), 0.012);
  let dirX = 1;
  for (let i = drawn.length - 1; i > 0 && drawn.length - i < 12; i--) {
    const dx = drawn[drawn.length - 1].x - drawn[i - 1].x;
    if (Math.abs(dx) > 0.01) {
      dirX = Math.sign(dx);
      break;
    }
  }
  const end = drawn[drawn.length - 1];
  const tail = slide
    ? slideRunout(end, dirX).map((p) => ({ ...p, c: end.c ?? 0 }))
    : [{ x: end.x + dirX * 0.06, y: end.y, c: 0 }, { x: end.x + dirX * BRAKE_LENGTH, y: end.y, c: 0 }];
  const withEnd = resample([...drawn, ...tail], 0.012);
  const flat = smooth(withEnd, 10);
  for (const p of flat) p.y = Math.max(p.y, p.pool ? POOL_Y : MIN_Y);
  // Coaster loops get tagged with which way round they go; tight flat turnarounds become hairpins.
  const loops = slide ? [] : findLoops(flat);
  for (const { a, b, dir } of loops) for (let k = a; k <= b; k++) flat[k].lp = dir;
  const hairpins = slide ? new Map() : findHairpins(flat, loops);

  // 2. Into 3D meters, drifting sideways (z) whenever the path doubles back. Each bowl is
  // spliced in where its circle was, and everything after it moves over to where it comes out.
  // Hairpins work the same way: a U-turn out sideways, and the rest of the track moves over.
  let z = 0;
  const shift = { x: 0, z: 0 };
  const stretch = slide ? rapidsStretch(flat) : null;
  const bowlInfo = [];
  const pts3 = [];
  const drift = (k) => Math.max(0, flat[k - 1].x - flat[k].x) * Z_DRIFT;
  for (let i = 0; i < flat.length; i++) {
    const p = flat[i];
    if (i > 0) z += drift(i);
    // Rapids from a narrow zigzag get stretched out to their proper length.
    if (stretch && i > 0 && stretch[i] !== 1) shift.x += (p.x - flat[i - 1].x) * (stretch[i] - 1) * WORLD_SCALE;
    const q = { x: (p.x - station.x0) * WORLD_SCALE + shift.x, y: p.y * WORLD_SCALE, z: z * WORLD_SCALE + shift.z, c: p.c ?? 0 };
    if (slide) Object.assign(q, { hx: 0, hy: 1, hz: 0, hw: 0, rp: p.rp });
    else q.bank = 0;
    if (p.lp) q.lp = p.lp;
    const hp = hairpins.get(i);
    if (hp && pts3.length) {
      pts3.push(q);
      // Where lane b lands: drawn x, drawn height, and one turn's width further over.
      let zb = z;
      for (let k = i + 1; k <= hp.b; k++) zb += drift(k);
      const end = { x: (flat[hp.b].x - station.x0) * WORLD_SCALE + shift.x, y: flat[hp.b].y * WORLD_SCALE, z: q.z + 2 * HAIRPIN_R };
      const prev = pts3[pts3.length - 2];
      const hIn = planDir(q.x - prev.x, q.z - prev.z, hp.dirIn);
      const nb = Math.min(hp.b + 1, flat.length - 1);
      const dxOut = flat[nb].x - flat[nb - 1].x;
      const hOut = planDir(dxOut, Math.max(0, -dxOut) * Z_DRIFT, -hp.dirIn);
      for (const h of hairpinPath(q, end, hIn, hOut, hp.dirIn)) pts3.push({ ...h, c: q.c });
      shift.z += end.z - (zb * WORLD_SCALE + shift.z);
      for (let k = i + 1; k < hp.b; k++) z += drift(k);
      i = hp.b - 1; // lane b itself is added next time round, right where the turn comes out
      continue;
    }
    if (p.bowl && pts3.length) {
      let dir = dirX;
      for (let k = i - 2; k >= 0 && i - k < 40; k--) {
        const dx = flat[i - 1].x - flat[k].x;
        if (Math.abs(dx) > 0.01) {
          dir = Math.sign(dx);
          break;
        }
      }
      const { points, exit, info } = bowlPath(pts3[pts3.length - 1], p.bowl, dir, q.y);
      for (const b of points) pts3.push({ ...b, c: q.c, bi: bowlInfo.length });
      bowlInfo.push(info);
      shift.x += exit.x - q.x;
      shift.z += exit.z - q.z;
      q.x = exit.x;
      q.z = exit.z;
    }
    pts3.push(q);
  }
  const keys3 = ['x', 'y', 'z'];
  const hintKeys = slide ? ['hx', 'hy', 'hz', 'hw'] : ['bank'];
  const rough = smooth(pts3, 4, keys3);
  let roughLength = 0;
  for (let i = 1; i < rough.length; i++) roughLength += dist(rough[i], rough[i - 1], keys3);
  const step = Math.max(STEP, roughLength / MAX_SAMPLES);
  const samples = smooth(resample(rough, step, keys3, hintKeys), 3, keys3);
  if (slide) addRapidsWaves(samples, step);

  const n = samples.length;
  const pos = new Float32Array(n * 3);
  samples.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
  const inBowl = (i) => samples[i].bp === 2 || samples[i].bp === 3; // the spiral and the drain

  // 3. Frames. "up" is the in-plane normal of the drawn line, so loops turn him upside down.
  // In a bowl it's the funnel wall instead (from the hint), so he rides around the wall.
  // In a hairpin it's straight up (or down, if he came in upside down), and the lane coming out
  // carries on the same way up (sign), so a scribble's lanes all match.
  const tan = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const sign = new Int8Array(n);
  let prevN = [0, 1, 0];
  let sg = 1;
  let hpUp = 1;
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)];
    const b = samples[Math.min(n - 1, i + 1)];
    const t = norm([b.x - a.x, b.y - a.y, b.z - a.z]) || [1, 0, 0];
    const hp = samples[i].hp;
    if (hp && (i === 0 || !samples[i - 1].hp)) hpUp = prevN[1] < 0 ? -1 : 1;
    if (!hp && i > 0 && samples[i - 1].hp) sg = (t[0] < 0 ? -1 : 1) * hpUp;
    sign[i] = sg;
    let nv;
    if (slide && inBowl(i)) nv = [samples[i].hx, samples[i].hy, samples[i].hz];
    else if (hp) nv = [0, hpUp, 0];
    else nv = [-t[1] * sg, t[0] * sg, 0];
    const d = dot(nv, t);
    nv = norm([nv[0] - t[0] * d, nv[1] - t[1] * d, nv[2] - t[2] * d]) || prevN;
    prevN = nv;
    tan.set(t, i * 3);
    normal.set(nv, i * 3);
  }

  // Loops are ridden on the inside: one drawn the "wrong" way round rolls over as it dives in
  // and back after. Elsewhere, long upside-down stretches (e.g. drawing right-to-left for a
  // while) get a barrel roll back to upright; short ones stay upside down because that's fun,
  // unless they run into a hairpin: those turns (and the lanes either side) always ride upright.
  const flip = new Float32Array(n);
  const free = (i) => !samples[i].lp && !samples[i].hp;
  for (let i = 0; i < n; i++) {
    if (samples[i].lp && samples[i].lp !== sign[i]) flip[i] = 1;
    if (samples[i].hp && normal[i * 3 + 1] < 0) flip[i] = 1;
  }
  for (let i = 0; i < n; ) {
    if (free(i) && normal[i * 3 + 1] < -0.2) {
      let j = i;
      while (j < n && free(j) && normal[j * 3 + 1] < -0.2) j++;
      const hairpin = (i > 0 && samples[i - 1].hp) || (j < n && samples[j].hp);
      if (hairpin || (j - i) * step > LONG_INVERSION) flip.fill(1, i, j);
      i = j;
    } else i++;
  }
  const roll = boxBlur(flip, Math.max(1, Math.round(7 / step)));
  const up = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = [tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]];
    let nv = [normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]];
    nv = rotateAbout(nv, t, roll[i] * Math.PI);
    // Hairpins lean into the turn.
    if (samples[i].bank) nv = rotateAbout(nv, t, samples[i].bank);
    up.set(nv, i * 3);
  }
  if (slide) blendHints(samples, tan, up);

  // 4. Speed: real-ish energy on drops, chain lift (or water jets) on climbs, brakes at the end.
  const length = (n - 1) * step;
  const speed = new Float32Array(n);
  const lift = new Uint8Array(n);
  let v2 = prof.vMin * prof.vMin;
  for (let i = 0; i < n; i++) {
    if (i > 0) v2 += 2 * G * (pos[(i - 1) * 3 + 1] - pos[i * 3 + 1]) - 2 * prof.friction * G * step;
    let v = Math.sqrt(Math.max(0, v2));
    const floor = liftSpeed(pos[i * 3 + 1], prof.vMin);
    if (v < floor) {
      v = floor;
      lift[i] = tan[i * 3 + 1] > 0.05 ? 1 : 0;
    }
    v = Math.min(v, maxSpeed(pos[i * 3 + 1], prof));
    v2 = v * v;
    speed[i] = v;
  }
  for (let i = 0; i < n; i++) {
    const toEnd = length - i * step;
    speed[i] = Math.max(0.6, Math.min(speed[i], Math.sqrt(2 * prof.brakeDecel * toEnd)));
  }

  // 5. Places to shout "wheee": the top of any big drop.
  const whee = [];
  const ahead = Math.max(1, Math.round(20 / step));
  for (let i = 0; i + ahead < n; i++) {
    const drop = pos[i * 3 + 1] - pos[(i + ahead) * 3 + 1];
    if (drop > 9 && (whee.length === 0 || (i - whee[whee.length - 1]) * step > 40)) whee.push(i);
  }

  // 6. Paint: one color per sample, rainbow measured along the track.
  const rgb = new Float32Array(n * 3);
  samples.forEach((p, i) => rgb.set(colorAt(p.c ?? 0, (i * step) / WORLD_SCALE), i * 3));

  const track = { kind, count: n, step, length, pos, tan, up, speed, lift, whee, rgb };
  if (slide) Object.assign(track, slideParts(samples, track, bowlInfo));
  return track;
}

// How much each rapids stretch is drawn out: its planned length (rl) over how far it actually
// goes along x. 1 everywhere else.
function rapidsStretch(flat) {
  const out = new Float64Array(flat.length).fill(1);
  for (let i = 0; i < flat.length; ) {
    if (!flat[i].rp) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < flat.length && flat[j + 1].rp) j++;
    const span = Math.abs(flat[j].x - flat[i].x);
    const k = Math.max(1, Math.min(40, (flat[i].rl || span) / Math.max(span, 1e-3)));
    for (let m = i + 1; m <= j; m++) out[m] = k;
    i = j + 1;
  }
  return out;
}

// Drawn loops: wherever the 2D line crosses itself around a roundish shape. Returns the index
// range between the two passes through the crossing, and which way round it goes (1 = counter-
// clockwise, -1 = clockwise). Thin slivers (scribbled lanes crossing) and huge circuits don't count.
function findLoops(pts) {
  const n = pts.length;
  if (n < 4) return [];
  const s = new Float64Array(n); // distance along the line
  const S = new Float64Array(n); // running shoelace sum, for the area inside any stretch
  for (let i = 1; i < n; i++) {
    s[i] = s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    S[i] = S[i - 1] + pts[i - 1].x * pts[i].y - pts[i].x * pts[i - 1].y;
  }
  const CELL = 0.05;
  const grid = new Map();
  const eachCell = (k, fn) => {
    const [p, q] = [pts[k], pts[k + 1]];
    for (let cx = Math.floor(Math.min(p.x, q.x) / CELL); cx <= Math.floor(Math.max(p.x, q.x) / CELL); cx++) {
      for (let cy = Math.floor(Math.min(p.y, q.y) / CELL); cy <= Math.floor(Math.max(p.y, q.y) / CELL); cy++) fn(`${cx},${cy}`);
    }
  };
  for (let k = 0; k < n - 1; k++) eachCell(k, (c) => (grid.get(c) || grid.set(c, []).get(c)).push(k));

  const found = [];
  const seen = new Set();
  for (let k = 0; k < n - 1; k++) {
    eachCell(k, (c) => {
      for (const m of grid.get(c)) {
        if (m <= k + 1 || seen.has(k * n + m)) continue;
        seen.add(k * n + m);
        const inner = s[m] - s[k + 1];
        if (inner < LOOP_MIN * 0.8 || inner > LOOP_MAX) continue;
        const X = crossing(pts[k], pts[k + 1], pts[m], pts[m + 1]);
        if (!X) continue;
        const [p, q] = [pts[k + 1], pts[m]];
        const area = (X.x * p.y - p.x * X.y + S[m] - S[k + 1] + q.x * X.y - X.x * q.y) / 2;
        const perim = inner + Math.hypot(p.x - X.x, p.y - X.y) + Math.hypot(q.x - X.x, q.y - X.y);
        if (perim < LOOP_MIN || perim > LOOP_MAX || (4 * Math.PI * Math.abs(area)) / (perim * perim) < LOOP_ROUND) continue;
        found.push({ a: k + 1, b: m, dir: Math.sign(area) });
      }
    });
  }
  // Smallest first, so a coil of loops is several loops, not one big one.
  found.sort((u, v) => u.b - u.a - (v.b - v.a));
  const loops = [];
  for (const l of found) if (!loops.some((o) => l.a <= o.b && l.b >= o.a)) loops.push(l);
  return loops.sort((u, v) => u.a - v.a);
}

// Where segments p1-p2 and q1-q2 cross, or null.
function crossing(p1, p2, q1, q2) {
  const rx = p2.x - p1.x;
  const ry = p2.y - p1.y;
  const sx = q2.x - q1.x;
  const sy = q2.y - q1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((q1.x - p1.x) * sy - (q1.y - p1.y) * sx) / den;
  const u = ((q1.x - p1.x) * ry - (q1.y - p1.y) * rx) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { x: p1.x + rx * t, y: p1.y + ry * t } : null;
}

// Tight, flat turnarounds (scribbling back and forth): the line runs one way along x, curls
// round within a small height and comes back level. Keyed by where the turn starts (a), with
// where it ends (b) and which way along x he was going into it. Tall turns are left alone.
function findHairpins(pts, loops) {
  const n = pts.length;
  const out = new Map();
  if (n < 5) return out;
  const s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const level = (i) => {
    const dx = pts[i + 1].x - pts[i - 1].x;
    const dy = pts[i + 1].y - pts[i - 1].y;
    return Math.abs(dx) >= HAIRPIN_FLAT * Math.hypot(dx, dy);
  };
  const turns = []; // where the direction along x changes
  let was = 0;
  for (let i = 1; i < n; i++) {
    const d = Math.sign(pts[i].x - pts[i - 1].x);
    if (!d) continue;
    if (was && d !== was) turns.push(i - 1);
    was = d;
  }
  let lastB = 1;
  turns.forEach((k, e) => {
    const lo = Math.max(1, lastB, e > 0 ? turns[e - 1] : 0);
    const hi = Math.min(n - 2, e + 1 < turns.length ? turns[e + 1] : n - 2);
    let a = k - 1;
    while (a > lo && s[k] - s[a] <= HAIRPIN_REACH && !level(a)) a--;
    let b = k + 1;
    while (b < hi && s[b] - s[k] <= HAIRPIN_REACH && !level(b)) b++;
    if (a < 1 || b > n - 2 || !level(a) || !level(b) || Math.abs(pts[a].y - pts[b].y) > HAIRPIN_GAP) return;
    if (loops.some((l) => a <= l.b && b >= l.a)) return;
    const dirIn = Math.sign(pts[k].x - pts[a].x);
    if (!dirIn || Math.sign(pts[b].x - pts[k].x) !== -dirIn) return;
    out.set(a, { b, dirIn });
    lastB = b;
  });
  return out;
}

// Unit direction on the ground (x, z), or straight along x if there's no length to go by.
function planDir(dx, dz, fallbackX) {
  const l = Math.hypot(dx, dz);
  return l > 1e-6 ? { x: dx / l, z: dz / l } : { x: fallbackX, z: 0 };
}

// A hairpin's U-turn on the ground: a curve from one lane round to the next, about a half
// circle out sideways (+z, the way the track drifts anyway), easing from one lane's height to
// the other's and leaning in. Leaves out both ends (they're the lanes' own points).
function hairpinPath(from, end, hIn, hOut, dirIn, spacing = 0.48) {
  const L = (4 / 3) * HAIRPIN_R;
  const P = [
    [from.x, from.z],
    [from.x + hIn.x * L, from.z + hIn.z * L],
    [end.x - hOut.x * L, end.z - hOut.z * L],
    [end.x, end.z],
  ];
  const m = Math.max(4, Math.ceil((Math.PI * HAIRPIN_R + Math.abs(end.x - from.x) + Math.abs(end.y - from.y)) / spacing));
  const out = [];
  for (let k = 1; k < m; k++) {
    const u = k / m;
    const w = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3];
    const ease = u * u * (3 - 2 * u);
    out.push({
      x: w.reduce((sum, wk, j) => sum + wk * P[j][0], 0),
      y: from.y + (end.y - from.y) * ease,
      z: w.reduce((sum, wk, j) => sum + wk * P[j][1], 0),
      bank: dirIn * HAIRPIN_BANK * Math.sin(Math.PI * u),
      hp: 1,
    });
  }
  return out;
}

// Rapids: little waves along the zigzag's stretch for the float to bounce over, eased in and out.
const WAVE_HEIGHT = 0.35; // meters
const WAVE_LENGTH = 2.8;
function addRapidsWaves(samples, step) {
  for (let i = 0; i < samples.length; ) {
    if (!samples[i].rp) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < samples.length && samples[j + 1].rp) j++;
    for (let k = i; k <= j; k++) {
      const d = (k - i) * step;
      const ease = Math.min(1, d / 3, ((j - k) * step) / 3);
      samples[k].y += WAVE_HEIGHT * ease * ease * (3 - 2 * ease) * Math.sin((2 * Math.PI * d) / WAVE_LENGTH);
    }
    i = j + 1;
  }
}

// Bowl samples carry a hint for which way is up (hw = how much). Turn the regular frame toward
// it around the direction of travel, so going into and out of a bowl rolls smoothly.
function blendHints(samples, tan, up) {
  let prev = 0;
  let prevW = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    const w = Math.max(0, Math.min(1, p.hw || 0));
    if (w < 1e-3) {
      prevW = 0;
      continue;
    }
    const t = [tan[i * 3], tan[i * 3 + 1], tan[i * 3 + 2]];
    const u0 = [up[i * 3], up[i * 3 + 1], up[i * 3 + 2]];
    const d = p.hx * t[0] + p.hy * t[1] + p.hz * t[2];
    const h = norm([p.hx - t[0] * d, p.hy - t[1] * d, p.hz - t[2] * d]);
    if (!h) continue;
    let ang = Math.atan2(dot(cross(u0, h), t), dot(u0, h));
    // Keep the turn going the same way as the sample before, unless fully on the hint
    // (where any equivalent angle gives the same answer).
    if (prevW > 0 && prevW < 0.999) {
      while (ang - prev > Math.PI) ang -= 2 * Math.PI;
      while (ang - prev < -Math.PI) ang += 2 * Math.PI;
    }
    prev = ang;
    prevW = w;
    const a = ang * w;
    const tu = cross(t, u0);
    up.set(norm([u0[0] * Math.cos(a) + tu[0] * Math.sin(a), u0[1] * Math.cos(a) + tu[1] * Math.sin(a), u0[2] * Math.cos(a) + tu[2] * Math.sin(a)]) || u0, i * 3);
  }
}

// The slide's extras: where the bowls are, which parts are closed tubes, and the pool.
function slideParts(samples, track, bowlInfo) {
  const { count: n, up, pos, step } = track;
  const bowls = bowlInfo.map((info, id) => {
    const range = (test) => {
      let a = -1;
      let b = -1;
      samples.forEach((p, i) => {
        if (p.bi === id && test(p)) {
          if (a < 0) a = i;
          b = i;
        }
      });
      return [a, b];
    };
    const [start, end] = range(() => true);
    const [spiralStart, spiralEnd] = range((p) => p.bp === 2);
    const [drainStart, drainEnd] = range((p) => p.bp === 3);
    return { ...info, start, end, spiralStart, spiralEnd, drainStart, drainEnd };
  });
  const bowlMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (samples[i].bp >= 2) bowlMask[i] = samples[i].bp;

  // The pool: the low stretch at the very end.
  let poolStart = n - 1;
  while (poolStart > 0 && pos[(poolStart - 1) * 3 + 1] < 0.9) poolStart--;

  // Closed tubes: wherever he'd fall out (steep or upside down), down the drain and out from
  // under the bowl. Padded, and short gaps filled in, so it doesn't keep opening and closing.
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const bp = samples[i].bp;
    raw[i] = (up[i * 3 + 1] < ENCLOSE_UP && bp !== 2) || bp === 3 || bp === 4 ? 1 : 0;
  }
  const pad = Math.round(ENCLOSE_PAD / step);
  const enclosed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!raw[i]) continue;
    for (let j = Math.max(0, i - pad); j <= Math.min(n - 1, i + pad); j++) enclosed[j] = 1;
  }
  for (let i = 0; i < n; ) {
    if (enclosed[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !enclosed[j]) j++;
    if (i > 0 && j < n && (j - i) * step < 8) enclosed.fill(1, i, j);
    i = j;
  }
  for (let i = 0; i < n; i++) if (samples[i].bp === 2 || i >= poolStart - Math.round(2 / step)) enclosed[i] = 0;

  // Rapids.
  const special = new Uint8Array(n);
  for (let i = 0; i < n; i++) special[i] = samples[i].rp ? 1 : 0;
  const rapids = [];
  for (let i = 0; i < n; ) {
    if (special[i] !== 1) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && special[j + 1] === 1) j++;
    rapids.push([i, j]);
    i = j + 1;
  }

  const mid = Math.round((poolStart + n - 1) / 2);
  const pool = {
    start: poolStart,
    center: { x: pos[mid * 3], y: 0, z: pos[mid * 3 + 2] },
    dir: { x: track.tan[mid * 3], z: track.tan[mid * 3 + 2] },
    length: (n - 1 - poolStart) * step,
  };
  return { bowls, bowlMask, enclosed, pool, rapids, special };
}

// Where to stand support pillars: one every few meters, from just under the track down to
// the grass, skipping any pillar that would poke through another part of the track
// (under a crest, inside a loop, or where the track crosses back under itself).
const POLE_EVERY = 7; // meters
const POLE_ATTACH = 3; // meters of track either side that the pillar is allowed to touch
const CLEARANCE = 1.6; // horizontal meters a pillar must stay away from the track and car
const A_FRAME_FROM = 10; // meters: taller supports become two-legged A-frames
const UPRIGHT = 0.35; // track steeper than ~70 degrees (or upside down) gets no supports
const SUPPORT_MAX = 300; // meters: above this the track flies on its own
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
  for (let i = 0; i < n; i += Math.max(1, Math.round(POLE_EVERY / step))) {
    // Only under upright track: in loops and other inversions "under the spine" points sideways
    // or up, and a column there would hold nothing. Loops hold themselves up.
    if (up[i * 3 + 1] < UPRIGHT || pos[i * 3 + 1] > SUPPORT_MAX || track.bowlMask?.[i]) continue;
    const base = {
      x: pos[i * 3] - up[i * 3] * 0.6,
      y: pos[i * 3 + 1] - up[i * 3 + 1] * 0.6,
      z: pos[i * 3 + 2] - up[i * 3 + 2] * 0.6,
    };
    if (base.y < 1) continue;
    // On a steep slope the track itself runs close by below, so let the column touch more of it.
    const slope = Math.hypot(track.tan[i * 3], track.tan[i * 3 + 2]);
    const nearHere = Math.max(near, Math.ceil((CLEARANCE + 0.6) / Math.max(slope, 0.3) / step));
    let blocked = false;
    for (let j = 0; j < n && !blocked; j++) {
      if (Math.abs(i - j) <= nearHere) continue;
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
      if (legsHitTrack(track, i, nearHere, supportLegs(base))) base.spread = 0;
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
const MAX_STARS = 40;
export function starSpots(track) {
  const [a, b] = rideSpan(track);
  const out = [];
  const every = Math.max(STAR_EVERY, (b - a) * track.step / MAX_STARS); // giant coasters: at most MAX_STARS
  for (let i = a; i <= b; i += Math.max(1, Math.round(every / track.step))) {
    // Slide: no ducks in a bowl or bobbing upside down.
    if (track.bowlMask?.[i] || (track.kind === 'slide' && track.up[i * 3 + 1] < 0.3)) continue;
    out.push(i);
  }
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
    if (y(i) > SPLASH_LOW || up[i * 3 + 1] < 0.5 || track.bowlMask?.[i] || track.special?.[i]) continue;
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
    pos[i * 3 + 1] < TUNNEL_LOW && up[i * 3 + 1] > 0.7 && !track.bowlMask?.[i] && !track.special?.[i] && (splash === null || Math.abs(i - splash) > clear);
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

// v (at right angles to the unit axis) turned by angle around it.
function rotateAbout(v, axis, angle) {
  if (!angle) return v;
  const b = cross(axis, v);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return norm([v[0] * c + b[0] * s, v[1] * c + b[1] * s, v[2] * c + b[2] * s]) || v;
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
