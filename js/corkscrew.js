// Corkscrews: a row of little curly-cues (like a spring, drawn along) becomes a corkscrew that
// twists once per curl. Both games have them: steel on the coaster, a twisty tube on the slide.
// Pure (no DOM, no three.js) so it can be unit tested in node, like track.js and slide.js.
//
// Drawing coordinates are normalized (y = 0 is the ground, 1 unit = 40 m); corkscrewPath works in meters.

const FULL = 2 * Math.PI;
const TURN_NEEDED = 1.75 * Math.PI; // 315 degrees of turning in one direction makes a curl (like a bowl)
const CURL_MAX = 0.25; // normalized: each curl at most this wide (the same as a toilet bowl)...
const CURL_WOBBLES = 4.5; // ...or up to 4.5 finger-wobbles wide, so it scales with the zoom
const SHARP = 1.6; // radians: a corner this sharp is a zigzag or a hook, not a curl
const TURN_BACK = 1.2; // radians of turning back the other way ends a row of curls
export const MIN_CURLS = 2; // one curl on its own stays what it always was (a wiggle, or a toilet bowl)
// The curls have to move along as they go round (a spring), at least this much of their radius
// per curl. Going round and round on the spot is a bigger toilet bowl on the slide, not a corkscrew.
const ADVANCE = 0.5;
const MAX_TURNS = 6;

// Heading of each segment and how much the line turns at each point (a repeated point keeps
// the heading before it), worked out on a lightly blurred copy so finger jitter doesn't count as
// turning. cum[k]: total turning from segment 0 to segment k.
function turningOf(raw) {
  const n = raw.length;
  let path = raw;
  for (let pass = 0; pass < 3; pass++) {
    path = path.map((p, i) => (i === 0 || i === n - 1 ? p : { x: (path[i - 1].x + 2 * p.x + path[i + 1].x) / 4, y: (path[i - 1].y + 2 * p.y + path[i + 1].y) / 4 }));
  }
  const heading = new Float64Array(n);
  let h = 0;
  for (let k = 0; k < n - 1; k++) {
    const dx = path[k + 1].x - path[k].x;
    const dy = path[k + 1].y - path[k].y;
    if (Math.hypot(dx, dy) > 1e-7) h = Math.atan2(dy, dx);
    heading[k] = h;
  }
  heading[n - 1] = h;
  const cum = new Float64Array(n);
  const bend = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    let d = heading[k] - heading[k - 1];
    while (d > Math.PI) d -= FULL;
    while (d < -Math.PI) d += FULL;
    cum[k] = cum[k - 1] + d;
    bend[k] = d;
  }
  return { cum, bend };
}

// Rows of two or more tight curls going one way round. Returns [{ i0, i1, turns, dir, dirX, r }]:
// path indices of the curls, how many, which way round (1 = counter-clockwise), which way along
// x they move (1 = right) and their radius (normalized).
export function findCorkscrews(path) {
  const n = path.length;
  if (n < 8) return [];
  const { cum, bend } = turningOf(path);
  const turning = (i, j) => cum[j - 1] - cum[i];
  const arc = new Float64Array(n);
  for (let k = 1; k < n; k++) arc[k] = arc[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
  const curlsIn = (t) => Math.floor((t + FULL - TURN_NEEDED) / FULL);

  const out = [];
  for (let i = 0; i < n - 6; ) {
    let dir = 0;
    let most = 0;
    let limit = Math.max(CURL_MAX, CURL_WOBBLES * (path[i].w || 0));
    // Each curl on its own: its size, and how much line it took.
    let box = { x0: path[i].x, x1: path[i].x, y0: path[i].y, y1: path[i].y };
    let curlFrom = i;
    const heights = [];
    let curls = 0;
    let end = -1;
    for (let j = i + 1; j < n; j++) {
      const p = path[j];
      limit = Math.max(limit, CURL_WOBBLES * (p.w || 0));
      box = { x0: Math.min(box.x0, p.x), x1: Math.max(box.x1, p.x), y0: Math.min(box.y0, p.y), y1: Math.max(box.y1, p.y) };
      if (box.y1 - box.y0 > limit || box.x1 - box.x0 > limit * 1.6) break;
      if (arc[j] - arc[curlFrom] > Math.PI * limit * 1.3) break; // a long way without curling round
      if (j - 1 > i && Math.abs(bend[j - 1]) > SHARP) break;
      const t = turning(i, j);
      if (!dir && Math.abs(t) > 0.5) dir = Math.sign(t);
      const st = dir ? dir * t : Math.abs(t);
      if (st > most) most = st;
      else if (st < most - TURN_BACK) break;
      // Each whole turn starts a new curl.
      while (st >= (heights.length + 1) * FULL) {
        heights.push(box.y1 - box.y0);
        box = { x0: p.x, x1: p.x, y0: p.y, y1: p.y };
        curlFrom = j;
      }
      if (curlsIn(st) > curls) {
        curls = curlsIn(st);
        end = j;
      }
    }
    if (curls < MIN_CURLS) {
      i++;
      continue;
    }
    // Trim straight line off the front so the corkscrew starts where the curling does.
    const need = curls * FULL - (FULL - TURN_NEEDED);
    let i0 = i;
    while (i0 + 1 < end && dir * turning(i0 + 1, end) >= Math.max(need, dir * turning(i, end) - 0.35)) i0++;
    const along = path[end].x - path[i0].x;
    const r = Math.max(0.01, (heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : limit) / 2);
    if (Math.abs(along) < ADVANCE * r * curls) {
      i++; // round and round on the spot
      continue;
    }
    out.push({ i0, i1: end, turns: Math.min(MAX_TURNS, curls), dir, dirX: Math.sign(along), r });
    i = end;
  }
  return out;
}

// The path with stretches cut out ([{ i0, i1, mark }], in order, not overlapping). The point at
// the end of each cut carries its mark, so buildTrack knows where to splice the 3D trick in. A
// sticker he put on a cut-out bit moves there too.
export function cutOut(path, cuts) {
  if (!cuts.length) return path;
  const out = [];
  let k = 0;
  let st = null;
  for (let i = 0; i < path.length; i++) {
    const c = cuts[k];
    if (c && i > c.i0 && i < c.i1) {
      st = path[i].st || st;
      continue;
    }
    if (c && i === c.i1) {
      out.push({ ...path[i], ...c.mark, ...(st && !path[i].st ? { st } : {}) });
      st = null;
      k++;
    } else out.push(path[i]);
  }
  return out;
}

// Each row of curls cut out, with the corkscrew (`twist`) where they end.
export const twistCut = (c) => ({ i0: c.i0, i1: c.i1, mark: { twist: { turns: c.turns, dir: c.dir, dirX: c.dirX, r: c.r } } });
export const cutCorkscrews = (path, found) => cutOut(path, found.map(twistCut));

// The coaster's path with its corkscrews cut out. `found` reuses corkscrews found earlier, which
// stay valid while a line is only being added to.
export function shapeCoaster(path, found = null) {
  const corkscrews = found ? found.corkscrews : findCorkscrews(path);
  return { path: cutCorkscrews(path, corkscrews), corkscrews, found: { corkscrews } };
}

// A neat spring in place of each row of scribbled curls, for the drawing screen: evenly spaced
// curls from where they start to where they end. Points are normalized, like the path.
export function springPoints(a, b, c, spacing = 0.006) {
  const total = c.turns * FULL;
  const r = c.r;
  const steps = Math.max(8, Math.ceil((c.turns * (FULL * r + Math.abs(b.x - a.x) / c.turns)) / spacing));
  const pts = [];
  for (let k = 1; k < steps; k++) {
    const th = (total * k) / steps;
    const u = th / total;
    pts.push({ x: a.x + (b.x - a.x) * u + c.dir * r * Math.sin(th), y: a.y + (b.y - a.y) * u + r * (1 - Math.cos(th)) });
  }
  return pts;
}

// The drawn path with every corkscrew's curls tidied into a neat spring (see springPoints).
export function tidyCurls(path, corkscrews) {
  if (!corkscrews.length) return path;
  const out = [];
  let k = 0;
  for (let i = 0; i < path.length; i++) {
    const c = corkscrews[k];
    if (c && i > c.i0 && i < c.i1) continue;
    if (c && i === c.i1) {
      for (const p of springPoints(path[c.i0], path[c.i1], c)) out.push({ ...path[c.i1], ...p });
      k++;
    }
    out.push(path[i]);
  }
  return out;
}

// --- Corkscrew in 3D --------------------------------------------------------------------------

export const CORKSCREW = {
  pitch: 15, // meters along per twist
  minR: 3, // meters: radius of the twist...
  maxR: 4.5, // ...from how big the curls were drawn
};

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// 3D points (meters) for one corkscrew, starting from `from` (the point where the curls were
// drawn). exitY is where the drawn track carries on afterwards. The track spirals round an axis
// along x, riding along the bottom first, rolling up and over (upside down at the top) once per
// curl. The twist grows in over the first half turn and out over the last, and its axis slides
// from the height going in to the height coming out. Each point has a hint for which way is "up"
// (h*: toward the axis, like a real corkscrew keeps heads in) and how much to use it (hw), and is
// tagged cs: 1. Returns { points, exit }.
export function corkscrewPath(from, twist, exitY, spacing = 0.48) {
  const R = Math.max(CORKSCREW.minR, Math.min(CORKSCREW.maxR, twist.r * 40 * 0.7));
  const turns = Math.max(1, Math.min(MAX_TURNS, twist.turns));
  const dirX = twist.dirX || 1;
  const spin = (twist.dir || 1) * dirX; // which side it swings out to first
  const L = turns * CORKSCREW.pitch;
  const total = turns * FULL;
  const len = turns * Math.hypot(CORKSCREW.pitch, FULL * R);
  const N = Math.max(8, Math.ceil(len / spacing));
  const ramp = 4; // meters: the up hint fades in and out over this much track at the ends
  const points = [];
  for (let k = 1; k <= N; k++) {
    const th = (total * k) / N;
    const u = th / total;
    const e = smoother(Math.min(1, th / Math.PI)) * smoother(Math.min(1, (total - th) / Math.PI));
    const base = from.y + (exitY - from.y) * smoother(u);
    const along = len * u;
    const hw = Math.min(1, along / ramp, (len - along) / ramp);
    points.push({
      x: from.x + dirX * L * u,
      y: base + R * e * (1 - Math.cos(th)),
      z: from.z + spin * R * e * Math.sin(th),
      hx: 0,
      hy: Math.cos(th),
      hz: -spin * Math.sin(th),
      hw: Math.max(0, hw),
      cs: 1,
    });
  }
  const exit = { x: from.x + dirX * L, y: exitY, z: from.z };
  return { points, exit };
}
