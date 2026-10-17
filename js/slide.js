// Water slide math: toilet bowls from tight circles, and the run-out into the splash pool.
// Pure (no DOM, no three.js) so it can be unit tested in node, like track.js.
//
// Drawing coordinates are normalized (y = 0 is the ground, 1 unit = 40 m); bowlPath works in meters.

const TURN_NEEDED = 1.75 * Math.PI; // 315 degrees of turning in one direction makes a circle
const MIN_BOWL = 0.25; // normalized: circles up to this wide are "tight" (about 165 px on an iPad)
const BOWL_WOBBLES = 4.5; // ...or up to 4.5 finger-wobbles wide, so it scales with the zoom (w is ~20 px)

// Tight circles in the drawn path. Returns [{ i0, i1, cx, cy, r, top, turns }], where i0..i1 are
// path indices of the circle. Wider circles are left alone (they become loops).
export function findBowls(path) {
  const n = path.length;
  if (n < 6) return [];
  // Heading of each segment (a repeated point keeps the heading before it), then total turning.
  const heading = new Float64Array(n);
  let h = 0;
  for (let k = 0; k < n - 1; k++) {
    const dx = path[k + 1].x - path[k].x;
    const dy = path[k + 1].y - path[k].y;
    if (Math.hypot(dx, dy) > 1e-7) h = Math.atan2(dy, dx);
    heading[k] = h;
  }
  heading[n - 1] = h;
  const cum = new Float64Array(n); // cum[k]: turning from segment 0 to segment k
  for (let k = 1; k < n; k++) {
    let d = heading[k] - heading[k - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    cum[k] = cum[k - 1] + d;
  }
  // Turning from point i to point j (segments i..j-1).
  const turning = (i, j) => cum[j - 1] - cum[i];

  const out = [];
  for (let i = 0; i < n - 5; ) {
    let minX = path[i].x;
    let maxX = minX;
    let minY = path[i].y;
    let maxY = minY;
    let limit = Math.max(MIN_BOWL, BOWL_WOBBLES * (path[i].w || 0));
    let best = -1;
    let bestTurn = 0;
    for (let j = i + 1; j < n; j++) {
      const p = path[j];
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      limit = Math.max(limit, BOWL_WOBBLES * (p.w || 0));
      if (Math.max(maxX - minX, maxY - minY) > limit) break;
      const t = Math.abs(turning(i, j));
      if (t > bestTurn) {
        bestTurn = t;
        if (t >= TURN_NEEDED) best = j;
      } else if (t < bestTurn - 1.2) break; // turned back the other way: not one circle
    }
    if (best < 0) {
      i++;
      continue;
    }
    // Trim straight track off the front so the cut starts where the circling does.
    let i0 = i;
    while (i0 + 1 < best && Math.abs(turning(i0 + 1, best)) >= Math.max(TURN_NEEDED, bestTurn - 0.35)) i0++;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = i0; k <= best; k++) {
      x0 = Math.min(x0, path[k].x);
      x1 = Math.max(x1, path[k].x);
      y0 = Math.min(y0, path[k].y);
      y1 = Math.max(y1, path[k].y);
    }
    const turns = Math.max(1, Math.round(Math.abs(turning(i0, best)) / (2 * Math.PI)));
    out.push({ i0, i1: best, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, r: Math.max(x1 - x0, y1 - y0) / 2, top: y1, turns });
    i = best;
  }
  return out;
}

// The path with each bowl's circle cut out. The point where the circle ends carries the bowl, so
// buildTrack knows where to splice the 3D bowl in.
export function cutBowls(path, bowls) {
  if (!bowls.length) return path;
  const out = [];
  let k = 0;
  for (let i = 0; i < path.length; i++) {
    const b = bowls[k];
    if (b && i > b.i0 && i < b.i1) continue;
    if (b && i === b.i1) {
      out.push({ ...path[i], bowl: { r: b.r, top: b.top, turns: b.turns } });
      k++;
    } else out.push(path[i]);
  }
  return out;
}

// --- Bowl in 3D ------------------------------------------------------------------------------

export const BOWL = {
  drainR: 1.3, // meters: radius where the spiral reaches the drain
  minDepth: 6, // rim to drain at least this deep, so he picks up speed going round
  maxDepth: 9, // ...and at most this; any extra height becomes a longer fall down the drain
  drainAbove: 5.5, // drain at least this far above where the slide carries on (room for the bend)
  bend: 2.5, // radius of the bend out of the bottom of the drain
};

// Height of the funnel surface at radius rho (a gravity-well shape: gentle at the rim, steep
// near the drain) and its slope.
export function funnelY(b, rho) {
  const k = (1 - b.drainR / rho) / (1 - b.drainR / b.R);
  return b.drainTop + (b.rim - b.drainTop) * k;
}
export function funnelSlope(b, rho) {
  return ((b.rim - b.drainTop) * (b.drainR / (rho * rho))) / (1 - b.drainR / b.R);
}

// 3D points (meters) for one bowl, starting from `from` (the point where the circle was drawn)
// heading `dirX` (+1 right, -1 left). exitY is where the drawn slide carries on afterwards.
// Each point has a hint for which way is "up" (h*) and how much to use it (hw), plus which part
// of the bowl it belongs to (bp: 1 approach, 2 spiral, 3 drain, 4 run-out).
// Returns { points, exit, info }.
export function bowlPath(from, drawn, dirX, exitY, spacing = 0.48) {
  const R = Math.max(7, Math.min(12, drawn.r * 40));
  const laps = Math.min(3.25, 1.25 + drawn.turns); // ends a quarter turn past whole laps, see the drain
  const rim = Math.max(drawn.top * 40, exitY + BOWL.drainAbove + BOWL.minDepth);
  const drainTop = Math.max(exitY + BOWL.drainAbove, rim - BOWL.maxDepth);
  // The bowl always sits on the far side of the slide from the outside camera, so it looks in.
  const side = dirX >= 0 ? 1 : -1;
  const points = [];
  const push = (x, y, z, hint, hw, bp) => points.push({ x, y, z, hx: hint[0], hy: hint[1], hz: hint[2], hw, bp });
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  // 1. Straight approach to the rim height (it climbs on water jets if it has to).
  const lenIn = Math.max(5, Math.abs(rim - from.y) * 1.6);
  const nIn = Math.max(2, Math.ceil(lenIn / spacing));
  for (let k = 1; k <= nIn; k++) {
    const t = k / nIn;
    push(from.x + dirX * lenIn * t, from.y + (rim - from.y) * smoother(t), from.z, [0, 1, 0], t, 1);
  }
  const E = { x: from.x + dirX * lenIn, y: rim, z: from.z };
  const C = { x: E.x, z: E.z + side * R };
  const info = { center: { x: C.x, y: rim, z: C.z }, R, rim, drainTop, drainR: BOWL.drainR, laps, exitY };
  // Radial direction at angle phi: phi = 0 points from the center back to the entry point,
  // and increasing phi moves the way he was going.
  const a = [0, 0, -side];
  const b = [dirX, 0, 0];
  const radial = (phi) => [a[0] * Math.cos(phi) + b[0] * Math.sin(phi), 0, a[2] * Math.cos(phi) + b[2] * Math.sin(phi)];

  // 2. Spiral down the funnel, slowly at first, then whizzing round the drain.
  const total = laps * 2 * Math.PI;
  let phi = 0;
  while (phi < total) {
    const u = phi / total;
    const rho = R - (R - BOWL.drainR) * Math.pow(u, 1.6);
    phi = Math.min(total, phi + spacing / rho);
    const u2 = phi / total;
    const r2 = R - (R - BOWL.drainR) * Math.pow(u2, 1.6);
    const rd = radial(phi);
    const slope = funnelSlope(info, r2);
    // Up is the funnel's surface normal: tilted in toward the drain, so he rides the wall.
    push(C.x + rd[0] * r2, funnelY(info, r2), C.z + rd[2] * r2, [-rd[0] * slope, 1, -rd[2] * slope], 1, 2);
  }

  // 3. Round the last half turn into the hole, straight down the drain, then out the bottom.
  const drainSpin = Math.PI;
  const nSpin = 18;
  const holeDrop = 2;
  for (let k = 1; k <= nSpin; k++) {
    const s = k / nSpin;
    const p = total + drainSpin * s;
    const rd = radial(p);
    const r = BOWL.drainR * Math.pow(1 - s, 1.5);
    const tilt = funnelSlope(info, BOWL.drainR) * (1 - s);
    push(C.x + rd[0] * r, drainTop - holeDrop * s * s, C.z + rd[2] * r, [-rd[0] * Math.max(1, tilt), 1 - s, -rd[2] * Math.max(1, tilt)], 1, 3);
  }
  // Half a turn later the inward direction is +dirX, the way the bend at the bottom curves out.
  const bendTop = exitY + BOWL.bend;
  for (let y = drainTop - holeDrop - spacing; y > bendTop; y -= spacing) push(C.x, y, C.z, b, 1, 3);
  const nBend = Math.ceil((BOWL.bend * Math.PI) / 2 / spacing);
  for (let k = 0; k <= nBend; k++) {
    const th = (k / nBend) * (Math.PI / 2);
    push(C.x + dirX * BOWL.bend * (1 - Math.cos(th)), bendTop - BOWL.bend * Math.sin(th), C.z, [b[0] * Math.cos(th), Math.sin(th), 0], 1, 3);
  }

  // 4. Out from under the bowl, past its rim, then on with the rest of the drawing.
  const runFrom = C.x + dirX * BOWL.bend;
  const runLen = R + 3 - BOWL.bend;
  const nRun = Math.ceil(runLen / spacing);
  for (let k = 1; k <= nRun; k++) push(runFrom + dirX * runLen * (k / nRun), exitY, C.z, [0, 1, 0], 1 - k / nRun, 4);
  const exit = { x: runFrom + dirX * runLen, y: exitY, z: C.z };
  return { points, exit, info };
}

// --- The splash pool at the end ----------------------------------------------------------------

export const LIP_Y = 1.4 / 40; // normalized: end of the slide, just above the pool
export const POOL_Y = 0.45 / 40; // where the raft skims across the water
export const POOL_LEN = 15 / 40;

// From the end of the drawing: a smooth slide down to the lip, a little drop, then across the pool.
// Points are normalized; the ones in the pool are marked pool: 1.
export function slideRunout(end, dir) {
  const pts = [];
  let x = end.x + dir * 0.05;
  pts.push({ x, y: end.y });
  const h = end.y - LIP_Y;
  if (h > 0.001) {
    const t = Math.max(0, Math.min(1, (h - 0.2) / 2.8));
    const slope = 0.35 + 0.35 * t * t * (3 - 2 * t);
    const len = (1.5 * h) / slope; // a smoothstep's steepest slope is 1.5x its average
    const n = Math.max(8, Math.ceil(len / 0.02));
    for (let k = 1; k <= n; k++) {
      const s = k / n;
      pts.push({ x: x + dir * len * s, y: end.y - h * s * s * (3 - 2 * s) });
    }
    x += dir * len;
  }
  const lip = Math.min(end.y, LIP_Y);
  pts.push({ x: x + dir * 0.08, y: lip });
  x += dir * 0.08;
  for (let k = 1; k <= 6; k++) {
    const s = k / 6;
    pts.push({ x: x + dir * 0.06 * s, y: lip + (POOL_Y - lip) * s * s, pool: 1 });
  }
  x += dir * 0.06;
  pts.push({ x: x + dir * POOL_LEN, y: POOL_Y, pool: 1 });
  return pts;
}

// --- Trapdoor drops and rapids ---------------------------------------------------------------

const DROP_MIN = 0.15; // normalized: a straight-down line at least this tall (6 m, ~100 px on an iPad)
const DROP_WOBBLES = 6; // ...or 6 finger-wobbles tall when zoomed out
const DROP_STEEP = 0.58; // each piece within ~30 degrees of straight down (|dx| <= 0.58 |dy|)
const DROP_DRIFT = 0.3; // and it can't wander sideways more than 0.3x its height overall
export const CAPSULE_LEN = 0.12; // normalized: level spot at the top for the capsule (5 m)

// Lines drawn straight down. Returns [{ i0, i1 }] (top and bottom path indices).
export function findDrops(path) {
  const out = [];
  const n = path.length;
  for (let i = 1; i < n - 1; ) {
    let last = i;
    let maxW = path[i].w || 0;
    for (let k = i + 1; k < n; k++) {
      // Step from the last point checked, once it's moved more than a tiny wobble (~2 px).
      const a = path[last];
      const b = path[k];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      maxW = Math.max(maxW, b.w || 0);
      if (Math.hypot(dx, dy) < Math.max(0.003, (b.w || 0) / 10)) continue;
      if (dy >= 0 || Math.abs(dx) > DROP_STEEP * -dy) break;
      last = k;
    }
    const drop = path[i].y - path[last].y;
    const drift = Math.abs(path[last].x - path[i].x);
    if (last > i && drop >= Math.max(DROP_MIN, DROP_WOBBLES * maxW) && drift <= DROP_DRIFT * drop && straight(path, i, last)) {
      out.push({ i0: i, i1: last });
      i = last + 1;
    } else i++;
  }
  return out;
}

// A straight line, not the steep side of a curve (like a loop): its first and last thirds head
// the same way, within about 20 degrees.
function straight(path, i, j) {
  const third = (j - i) / 3;
  const a = path[i];
  const b = path[Math.round(i + third)];
  const c = path[Math.round(j - third)];
  const d = path[j];
  let turn = Math.atan2(d.y - c.y, d.x - c.x) - Math.atan2(b.y - a.y, b.x - a.x);
  turn = Math.abs(((turn + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return turn < 0.35;
}

const RAPIDS_TURNS = 4; // up-down turning points in a row
const RAPIDS_AMP = 0.2; // normalized: each swing at most this tall...
const RAPIDS_AMP_WOBBLES = 7; // ...or 7 finger-wobbles when zoomed out
const RAPIDS_GAP = 0.15; // and turning points at most this far apart sideways
const RAPIDS_GAP_WOBBLES = 5;

// Quick up-and-down zigzags. Returns [{ i0, i1 }].
export function findRapids(path) {
  const n = path.length;
  if (n < 6) return [];
  // Turning points (peaks and dips), ignoring wiggles smaller than about 10 px.
  const turns = [];
  let dir = 0;
  let hi = 0;
  let lo = 0;
  for (let k = 1; k < n; k++) {
    const y = path[k].y;
    const thr = Math.max(0.012, 0.6 * (path[k].w || 0));
    if (y > path[hi].y) hi = k;
    if (y < path[lo].y) lo = k;
    if (dir >= 0 && path[hi].y - y > thr) {
      if (dir === 1 || hi > 0) turns.push(hi);
      dir = -1;
      lo = k;
    } else if (dir <= 0 && y - path[lo].y > thr) {
      if (dir === -1 || lo > 0) turns.push(lo);
      dir = 1;
      hi = k;
    }
  }
  const out = [];
  let a = 0;
  const ok = (j) => {
    const p = path[turns[j - 1]];
    const q = path[turns[j]];
    const w = Math.max(p.w || 0, q.w || 0);
    const dx = q.x - p.x;
    return (
      Math.abs(q.y - p.y) <= Math.max(RAPIDS_AMP, RAPIDS_AMP_WOBBLES * w) &&
      Math.abs(dx) <= Math.max(RAPIDS_GAP, RAPIDS_GAP_WOBBLES * w) &&
      Math.abs(dx) > 1e-4
    );
  };
  const sameWay = (j) => Math.sign(path[turns[j]].x - path[turns[j - 1]].x) === Math.sign(path[turns[a + 1]].x - path[turns[a]].x);
  for (let j = 1; j <= turns.length; j++) {
    const fits = j < turns.length && ok(j);
    if (fits && (j === a + 1 || sameWay(j))) continue;
    if (j - a >= RAPIDS_TURNS) out.push({ i0: turns[a], i1: turns[j - 1] });
    a = fits ? j - 1 : j; // turned back the other way: a new run can start from the last turn
  }
  return out;
}

// The slide's path after all its tricks are applied: tight circles cut out (bowls), zigzags
// flattened into rapids (tagged rp: 1), straight-down lines made truly vertical with a level
// spot for the capsule at the top (tagged tp: 1 for the capsule, tp: 2 for the drop).
// `found` reuses features found earlier, which stay valid while a line is only being added to.
export function shapeSlide(path, found = null) {
  const bowls = found ? found.bowls : findBowls(path);
  const p = cutBowls(path, bowls).map((q) => ({ ...q }));
  const rapids = found ? found.rapids : findRapids(p);
  for (const r of rapids) {
    if (r.i1 >= p.length) continue;
    const a = p[r.i0];
    const b = p[r.i1];
    for (let k = r.i0; k <= r.i1; k++) {
      const f = Math.max(0, Math.min(1, (p[k].x - a.x) / (b.x - a.x || 1)));
      p[k].y = a.y + (b.y - a.y) * f;
      p[k].rp = 1;
    }
  }
  const drops = found ? found.drops : findDrops(p);
  for (const d of drops) {
    if (d.i1 >= p.length) continue;
    const top = p[d.i0];
    for (let k = d.i0 + 1; k <= d.i1; k++) {
      p[k].x = top.x;
      p[k].tp = 2;
    }
    top.tp = 1;
    let len = 0;
    for (let k = d.i0 - 1; k >= 2 && len < CAPSULE_LEN; k--) {
      len += Math.abs(p[k + 1].x - p[k].x); // along the ground (heights are being levelled)
      p[k].y = top.y;
      p[k].tp = 1;
    }
  }
  return { path: p, bowls, rapids, drops, found: { bowls, rapids, drops } };
}
