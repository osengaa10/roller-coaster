import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, pathFromStrokes, resample, normalizeStroke, supportSpots, starSpots, tunnelRuns, V_MIN, SLIDE_V_MIN } from '../js/track.js';
import { LAUNCH, JUMP } from '../js/stickers.js';

const stroke = (f, n = 120) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const W = 0.03;
const line = (x0, y0, x1, y1, w = W) => stroke((t) => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, w }));
// A sticker on the point of `pts` nearest track x.
const stick = (pts, x, st) => {
  let best = 0;
  pts.forEach((p, i) => {
    if (Math.abs(p.x - x) < Math.abs(pts[best].x - x)) best = i;
  });
  return pts.map((p, i) => (i === best ? { ...p, st } : p));
};
const flatRun = () => line(0.27, 0.1, 4, 0.1);

function assertFinite(track) {
  for (const key of ['pos', 'tan', 'up', 'speed']) {
    for (const v of track[key]) assert.ok(Number.isFinite(v), `${key} has non-finite value`);
  }
}

test('a sticker stays on the drawing: through the path, resampling, saving and loading', () => {
  const pts = stick(flatRun(), 1, 'rocket');
  const path = pathFromStrokes([{ c: 2, p: pts }]);
  assert.equal(path.filter((p) => p.st === 'rocket').length, 1);
  assert.equal(resample(path, 0.012).filter((p) => p.st === 'rocket').length, 1, 'exactly one point carries it');
  const saved = JSON.parse(JSON.stringify([{ c: 2, p: pts }])).map(normalizeStroke);
  assert.equal(saved[0].p.filter((p) => p.st).length, 1);
});

test('a rocket launches the train: boosters, then much faster than without', () => {
  const plain = buildTrack([flatRun()]);
  const tr = buildTrack([stick(flatRun(), 1, 'rocket')]);
  assertFinite(tr);
  assert.equal(tr.launches.length, 1);
  const [a, b] = tr.launches[0];
  assert.ok((b - a) * tr.step >= LAUNCH.length - 1);
  assert.ok(tr.speed[b] > LAUNCH.coaster - 1, `launched to ${tr.speed[b]}`);
  assert.ok(tr.speed[b] > plain.speed[b] * 3);
  // Smooth push: no sudden jumps in speed, and no chain lift on the boosters.
  for (let i = a + 1; i <= b; i++) {
    assert.ok(tr.speed[i] - tr.speed[i - 1] < 3, `speed jumps at ${i}`);
    assert.equal(tr.lift[i], 0);
  }
  // Still stops nicely in the brakes at the end.
  assert.ok(tr.speed[tr.count - 1] < 2);
});

test('a rocket up a hill shoots the train over it', () => {
  const hill = [...line(0.27, 0.06, 0.8, 0.06), ...stroke((t) => ({ x: 0.8 + t * 0.6, y: 0.06 + 0.4 * Math.sin(Math.PI * t), w: W })), ...line(1.4, 0.06, 2.2, 0.06)];
  const plain = buildTrack([hill]);
  const tr = buildTrack([stick(hill, 0.75, 'rocket')]);
  assertFinite(tr);
  const liftsPlain = plain.lift.reduce((a, b) => a + b, 0);
  const lifts = tr.lift.reduce((a, b) => a + b, 0);
  assert.ok(lifts < liftsPlain / 2, 'the boost carries it most of the way up');
  for (let i = 0; i < tr.count; i++) assert.ok(tr.speed[i] >= Math.min(V_MIN, tr.speed[tr.count - 1]) - 1e-3 || i > tr.count - 80);
});

test('a rocket right at the end does nothing odd', () => {
  const pts = flatRun();
  const tr = buildTrack([stick(pts, pts[pts.length - 1].x, 'rocket')]);
  assertFinite(tr);
  assert.equal(tr.launches.length, 0);
});

test('on the slide a rocket is a water cannon, at slide speeds', () => {
  const slide = line(0.23, 0.3, 2.2, 0.1);
  const tr = buildTrack([stick(slide, 0.9, 'rocket')], { kind: 'slide' });
  assertFinite(tr);
  assert.equal(tr.launches.length, 1);
  const [, b] = tr.launches[0];
  assert.ok(tr.speed[b] >= LAUNCH.slide - 1);
  for (const v of tr.speed) assert.ok(v <= 28 + 1e-3);
  assert.ok(tr.speed[1] >= SLIDE_V_MIN - 1e-3);
});

test('a sticker on curls that became a corkscrew moves to just after it', () => {
  const spring = stroke((t) => {
    const th = t * 3 * 2 * Math.PI;
    return { x: 0.6 + 0.27 * t + 0.07 * Math.sin(th), y: 0.12 + 0.07 * (1 - Math.cos(th)), w: W };
  }, 150);
  const pts = [...line(0.27, 0.12, 0.6, 0.12), ...spring.map((p, i) => (i === 70 ? { ...p, st: 'rocket' } : p)), ...line(0.87, 0.12, 2.2, 0.12)];
  const tr = buildTrack([pts]);
  assertFinite(tr);
  assert.equal(tr.launches.length, 1);
  assert.ok(tr.launches[0][0] >= tr.corkscrews[0][1] - 2);
});

// A drop down to a long flat run, so the train is going well when it gets to the jump.
const dropThenFlat = () => [...line(0.27, 0.06, 0.4, 0.5), ...line(0.4, 0.5, 0.9, 0.08), ...line(0.9, 0.08, 4, 0.08)];

test('a ramp jump: the track stops, the train flies over the gap in an arc and lands', () => {
  const tr = buildTrack([stick(dropThenFlat(), 1.2, 'jump')]);
  assertFinite(tr);
  assert.equal(tr.jumps.length, 1);
  const j = tr.jumps[0];
  assert.ok(j.takeoff < j.lip && j.lip < j.land);
  const gap = (j.land - j.lip) * tr.step;
  assert.ok(gap >= 6 && gap <= JUMP.longest, `gap ${gap} m`);
  // In the air between the lip and the landing, and only there: long enough to feel it.
  for (let i = 0; i < tr.count; i++) assert.equal(tr.air[i], i > j.lip && i < j.land ? 1 : 0, `air at ${i}`);
  let airTime = 0;
  for (let i = j.lip + 1; i < j.land; i++) airTime += tr.step / tr.speed[i];
  assert.ok(airTime > 1.2, `${airTime.toFixed(2)} s of air`);
  // Up in an arc above where the track would be, and upright all the way.
  const mid = Math.round((j.lip + j.land) / 2);
  assert.ok(tr.pos[mid * 3 + 1] > 0.08 * 40 + 1.2, 'flies up over the gap');
  for (let i = j.takeoff; i <= j.land; i++) assert.ok(tr.up[i * 3 + 1] > 0.7);
  // Smooth: no kinks bigger than a few degrees between samples.
  for (let i = j.takeoff - 5; i <= j.land + 5; i++) {
    const d = tr.tan[i * 3] * tr.tan[(i + 1) * 3] + tr.tan[i * 3 + 1] * tr.tan[(i + 1) * 3 + 1] + tr.tan[i * 3 + 2] * tr.tan[(i + 1) * 3 + 2];
    assert.ok(d > Math.cos(0.12), `kink at ${i}`);
  }
  // No chain, no supports in the air, and a star to catch at the top.
  for (let i = j.lip; i <= j.land; i++) assert.equal(tr.lift[i], 0);
  for (const s of supportSpots(tr)) assert.ok(s.x < tr.pos[j.lip * 3] - 0.5 || s.x > tr.pos[j.land * 3] + 0.5 || s.y < 0);
  assert.ok(starSpots(tr).includes(mid));
  assert.ok(tunnelRuns(tr).every(([a, b]) => b < j.takeoff || a > j.land));
});

test('a faster train jumps further', () => {
  const slow = buildTrack([stick(line(0.27, 0.06, 4, 0.06), 1.2, 'jump')]);
  const fast = buildTrack([stick(dropThenFlat(), 1.2, 'jump')]);
  const len = (tr) => tr.jumps[0].land - tr.jumps[0].takeoff;
  assert.ok(len(fast) > len(slow), `${len(fast)} vs ${len(slow)}`);
});

test('a jump sticker on a loop or a steep climb moves on to where there is room, or is left off', () => {
  const loop = [...line(0.27, 0.06, 0.8, 0.1), ...stroke((t) => ({ x: 1.0 + 0.2 * Math.sin(t * 2 * Math.PI), y: 0.3 - 0.2 * Math.cos(t * 2 * Math.PI), w: W })), ...line(1.0, 0.1, 3.5, 0.1)];
  const onLoop = buildTrack([stick(loop, 1.18, 'jump')]);
  assertFinite(onLoop);
  for (const j of onLoop.jumps) {
    for (let i = j.takeoff; i <= j.land; i++) assert.ok(onLoop.up[i * 3 + 1] > 0.7, 'never jumps from upside down');
  }
  const wall = [...line(0.27, 0.06, 0.6, 0.06), ...line(0.6, 0.06, 0.65, 1.5), ...line(0.65, 1.5, 0.9, 1.5)];
  const onWall = buildTrack([stick(wall, 0.62, 'jump')]);
  assertFinite(onWall);
  assert.equal(onWall.jumps.length, 0);
});

test('a jump right at the end, or two stuck together, never break the ride', () => {
  const pts = line(0.27, 0.06, 2, 0.06);
  const end = buildTrack([stick(pts, 1.99, 'jump')]);
  assertFinite(end);
  assert.equal(end.jumps.length, 0);
  const two = buildTrack([stick(stick(dropThenFlat(), 1.2, 'jump'), 1.22, 'jump')]);
  assertFinite(two);
  assert.equal(two.jumps.length, 1, 'the second one has no room right on top of the first');
});

test('rocket then jump: launched off the ramp into a big jump', () => {
  const pts = stick(stick(line(0.27, 0.06, 4, 0.06), 0.6, 'rocket'), 1.6, 'jump');
  const tr = buildTrack([pts]);
  assertFinite(tr);
  assert.equal(tr.launches.length, 1);
  assert.equal(tr.jumps.length, 1);
  assert.ok((tr.jumps[0].land - tr.jumps[0].takeoff) * tr.step > 20);
});

test('on the slide a jump is a ski-jump out of the trough, with no tube over it', () => {
  const slide = [...line(0.23, 0.3, 0.8, 0.08), ...line(0.8, 0.08, 3, 0.06)];
  const tr = buildTrack([stick(slide, 1.0, 'jump')], { kind: 'slide' });
  assertFinite(tr);
  assert.equal(tr.jumps.length, 1);
  const j = tr.jumps[0];
  for (let i = j.takeoff; i <= j.land; i++) assert.equal(tr.enclosed[i], 0);
});
