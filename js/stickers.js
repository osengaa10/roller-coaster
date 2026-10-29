// Stickers he drags onto the drawn line: a rocket that launches the train (or float) and a ramp
// it jumps off. A sticker is a label on one drawn point (st: 'rocket' | 'jump'), so it saves,
// loads and undoes along with the drawing. Pure (no DOM, no three.js), like track.js.

export const STICKERS = ['rocket', 'jump'];

// Rocket launch: over this much track after the sticker, the train is pushed up to launch
// speed (or kept going faster, if it already is). Then gravity takes over as usual.
export const LAUNCH = {
  length: 25, // meters of boosters
  coaster: 32, // m/s, about 70 mph
  slide: 17,
};

// Where each kind of sticker landed on the 3D track: [{ at, kind }] by sample index.
export function stickerSpots(samples) {
  const out = [];
  samples.forEach((p, i) => {
    if (p.st) out.push({ at: i, kind: p.st });
  });
  return out;
}

// The booster stretches: [start, end] sample ranges, one per rocket. Ones that would run into
// the brakes at the end are cut short there, and ones too close to the end are left off.
export function launchRuns(spots, n, step, endClear = 30) {
  const last = n - 1 - Math.round(endClear / step);
  const runs = [];
  for (const { at, kind } of spots) {
    if (kind !== 'rocket' || at >= last - 2) continue;
    const end = Math.min(last, at + Math.round(LAUNCH.length / step));
    if (runs.length && at <= runs[runs.length - 1][1]) runs[runs.length - 1][1] = Math.max(runs[runs.length - 1][1], end);
    else runs.push([at, end]);
  }
  return runs;
}

// Speed squared along a booster run (k samples in, out of len), starting from v0 squared:
// a steady push up to launch speed.
export function launchSpeed2(v0sq, k, len, launchV) {
  const f = Math.min(1, k / Math.max(1, len));
  return Math.max(v0sq, v0sq + (launchV * launchV - v0sq) * f);
}

// Ramp jump: the track curls up off a kicker ramp, the train flies through the air over a gap
// with no track, and lands back on the track further on. A faster train jumps further.
export const JUMP = {
  longest: 24, // meters of gap at most...
  shortest: 8, // ...and at least (a little hop); anything shorter isn't a jump
  kicker: 3, // meters of ramp at the start of the gap, curling up (the rails still run here)
  lookAhead: 30, // meters further along to look for room, if the sticker's spot has none
  slope: 0.6, // track steeper than this (about 30 degrees) is no place to jump
  straight: 0.85, // and it has to keep going about the same way (no turns, loops or U-turns)
  height: [1.5, 5], // meters: how high above the track the arc goes, smallest and largest
};

// Where the jumps go, given the 3D samples (meters, with tags), the speed the train would have
// along them (to size each jump) and the stickers. A sticker where there's no room looks a bit
// further on, and one with no room anywhere near is left off. Returns
// [{ takeoff, lip, land, height }] by sample index: the kicker runs from takeoff to lip, the train
// is in the air from lip to land.
export function placeJumps(samples, step, spots, speed, { startClear = 14, endClear = 30 } = {}) {
  const n = samples.length;
  const first = Math.round(startClear / step);
  const last = n - 1 - Math.round(endClear / step);
  const taken = new Uint8Array(n);
  const dir = (k) => {
    const a = samples[Math.max(0, k - 1)];
    const b = samples[Math.min(n - 1, k + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    const flat = Math.hypot(dx, dz) || 1;
    return { slope: Math.abs(dy) / l, x: dx / flat, z: dz / flat };
  };
  const free = (k) => {
    const p = samples[k];
    return !(p.cs || p.lp || p.hp || p.bp || p.pool || p.rp || taken[k]) && dir(k).slope < JUMP.slope;
  };
  const jumps = [];
  for (const { at, kind } of spots) {
    if (kind !== 'jump') continue;
    for (let start = Math.max(at, first); start < Math.min(last, at + Math.round(JUMP.lookAhead / step)); start++) {
      if (!free(start)) continue;
      const want = Math.max(JUMP.shortest, Math.min(JUMP.longest, (speed[start] || 0) * 0.9 + 4));
      const d0 = dir(start);
      let len = 0;
      while (len * step < want && start + len + 1 < last && free(start + len + 1)) {
        const d = dir(start + len + 1);
        if (d.x * d0.x + d.z * d0.z < JUMP.straight) break;
        len++;
      }
      if (len * step < JUMP.shortest) continue;
      const land = start + len;
      const lip = start + Math.max(1, Math.round(JUMP.kicker / step));
      const height = Math.max(JUMP.height[0], Math.min(JUMP.height[1], len * step * 0.2));
      jumps.push({ takeoff: start, lip, land, height });
      taken.fill(1, Math.max(0, start - Math.round(10 / step)), Math.min(n, land + Math.round(10 / step)));
      break;
    }
  }
  return jumps.sort((a, b) => a.takeoff - b.takeoff);
}

// Raise the samples over each jump into a smooth arc (half a sine wave, so the kicker curls up
// and the landing comes down gently onto the track), and tag the ones in the air (air: 1).
export function shapeJumps(samples, jumps) {
  for (const j of jumps) {
    const len = j.land - j.takeoff;
    for (let k = j.takeoff; k <= j.land; k++) {
      const u = (k - j.takeoff) / len;
      samples[k].y += j.height * Math.sin(Math.PI * u);
      if (k > j.lip && k < j.land) samples[k].air = 1;
    }
  }
}
