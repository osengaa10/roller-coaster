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
