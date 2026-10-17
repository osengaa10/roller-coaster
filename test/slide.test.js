import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, pathFromStrokes, starSpots, supportSpots, tunnelRuns, SLIDE_V_MIN, liftSpeed, STATIONS } from '../js/track.js';
import { findBowls, cutBowls, funnelY } from '../js/slide.js';

const stroke = (f, n = 120) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const W = 0.03; // finger wobble at normal zoom on an iPad (20 px in track units)
const circle = (cx, cy, r, laps = 1, w = W, n = 60) =>
  stroke((t) => {
    const a = -Math.PI / 2 + t * laps * 2 * Math.PI;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), w };
  }, n * laps);
const line = (x0, y0, x1, y1, w = W) => stroke((t) => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, w }));

// Down from the tower, a tight circle, then along to the end.
const withBowl = (laps = 1) => [...line(0.25, 0.3, 0.65, 0.1), ...circle(0.75, 0.2, 0.1, laps), ...line(0.75, 0.1, 1.4, 0.1)];
const bowlsIn = (pts) => findBowls(pathFromStrokes([pts], 'slide'));
const P = (tr, i) => [tr.pos[i * 3], tr.pos[i * 3 + 1], tr.pos[i * 3 + 2]];
const U = (tr, i) => [tr.up[i * 3], tr.up[i * 3 + 1], tr.up[i * 3 + 2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function assertFinite(track) {
  for (const key of ['pos', 'tan', 'up', 'speed']) {
    for (const v of track[key]) assert.ok(Number.isFinite(v), `${key} has non-finite value`);
  }
}

test('a tight circle is found as one bowl', () => {
  const bowls = bowlsIn(withBowl());
  assert.equal(bowls.length, 1);
  assert.equal(bowls[0].turns, 1);
  assert.ok(Math.abs(bowls[0].cx - 0.75) < 0.03 && Math.abs(bowls[0].r - 0.1) < 0.02);
});

test('going round twice makes one bowl with two turns', () => {
  const bowls = bowlsIn(withBowl(2));
  assert.equal(bowls.length, 1);
  assert.equal(bowls[0].turns, 2);
});

test('a circle that is only a bit wide is a loop, not a bowl', () => {
  const medium = [...line(0.25, 0.3, 0.65, 0.1), ...circle(0.8, 0.25, 0.15), ...line(0.8, 0.1, 1.5, 0.1)];
  assert.equal(bowlsIn(medium).length, 0);
});

test('hills, zigzags and big circles are not bowls', () => {
  const hill = stroke((t) => ({ x: 0.3 + t * 0.4, y: 0.1 + 0.25 * Math.sin(Math.PI * t), w: W }));
  const zigzag = stroke((t) => ({ x: 0.3 + t, y: 0.2 + 0.08 * Math.sin(t * 40), w: W }), 400);
  const big = [...line(0.25, 0.3, 0.8, 0.1), ...circle(1.1, 0.4, 0.3), ...line(1.1, 0.1, 2, 0.1)];
  for (const pts of [hill, zigzag, big]) assert.equal(bowlsIn(pts).length, 0);
});

test('zoomed out, a circle that looks tight on screen is still a bowl', () => {
  // Drawn 10x zoomed out: each point's wobble is 10x bigger, and so is the circle.
  const pts = [...line(0.25, 0.3, 2.5, 1), ...circle(3.5, 1.6, 0.6, 1, W * 10), ...line(3.5, 1, 6, 1, W * 10)];
  assert.equal(bowlsIn(pts).length, 1);
  assert.equal(bowlsIn(pts.map((p) => ({ ...p, w: W }))).length, 0, 'same size at normal zoom is a big loop');
});

test('cutting a bowl out leaves a marker where the circle ends', () => {
  const path = pathFromStrokes([withBowl()], 'slide');
  const bowls = findBowls(path);
  const cut = cutBowls(path, bowls);
  assert.equal(cut.length, path.length - (bowls[0].i1 - bowls[0].i0 - 1));
  assert.equal(cut.filter((p) => p.bowl).length, 1);
});

test('the slide starts up on the tower', () => {
  const tr = buildTrack([line(0.25, 0.3, 1.2, 0.1)], { kind: 'slide' });
  assertFinite(tr);
  assert.ok(Math.abs(tr.pos[1] - STATIONS.slide.y * 40) < 0.5);
});

test('a bowl is spliced in smoothly and banks him onto the wall', () => {
  const tr = buildTrack([withBowl()], { kind: 'slide' });
  assertFinite(tr);
  assert.equal(tr.bowls.length, 1);
  const b = tr.bowls[0];
  assert.ok(b.spiralStart > b.start && b.drainStart > b.spiralEnd && b.end > b.drainEnd);
  for (let i = 1; i < tr.count; i++) {
    const [a, c] = [P(tr, i - 1), P(tr, i)];
    assert.ok(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) < tr.step * 2, `position jumps at ${i}`);
    // The swirl down the drain twists faster (inside a closed pipe); everywhere else is gentle.
    const limit = i >= b.drainStart && i <= b.drainEnd ? 0.85 : 0.9;
    assert.ok(dot(U(tr, i), U(tr, i - 1)) > limit, `up vector jumps at ${i}`);
  }
  let lastY = Infinity;
  for (let i = b.spiralStart + 20; i <= b.spiralEnd; i++) {
    const p = P(tr, i);
    const inward = [b.center.x - p[0], 0, b.center.z - p[2]];
    const len = Math.hypot(inward[0], inward[2]);
    assert.ok(dot(U(tr, i), [inward[0] / len, 0, inward[2] / len]) > 0.02, `tilts toward the drain at ${i}`);
    if (len > 2) assert.ok(Math.abs(p[1] - funnelY(b, len)) < 0.3, 'rides on the funnel surface');
    assert.ok(p[1] <= lastY + 0.05, 'always going down');
    lastY = p[1];
  }
  assert.ok(dot(U(tr, b.spiralEnd - 5), [0, 1, 0]) < 0.6, 'way up on the wall near the drain');
  assert.ok(U(tr, b.end)[1] > 0.9 && U(tr, tr.count - 1)[1] > 0.9, 'upright again after');
});

test('the bowl keeps clear of the rest of the slide', () => {
  const tr = buildTrack([[...line(0.25, 0.3, 0.5, 0.2), ...withBowl().map((p) => ({ ...p, x: p.x + 0.2 }))]], { kind: 'slide' });
  const b = tr.bowls[0];
  for (let i = b.spiralStart; i <= b.drainEnd; i++) {
    for (let j = 0; j < tr.count; j++) {
      if (j >= b.start && j <= b.end) continue;
      const [p, q] = [P(tr, i), P(tr, j)];
      assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 2.5, `slide passes through the bowl at ${i}/${j}`);
    }
  }
});

test('every slide ends across the pool, slowing down', () => {
  for (const pts of [line(0.25, 0.3, 1.2, 0.1), line(0.25, 0.3, 1.5, 0.9), withBowl()]) {
    const tr = buildTrack([pts], { kind: 'slide' });
    const last = tr.count - 1;
    assert.ok(tr.pos[last * 3 + 1] < 0.6, 'ends at the water');
    assert.ok(tr.pool.length > 12, `pool run ${tr.pool.length}`);
    assert.ok(tr.speed[last] < 1.5);
    for (let i = tr.pool.start; i < tr.count; i++) assert.ok(tr.pos[i * 3 + 1] < 0.9);
  }
});

test('a big circle on the slide is a loop inside a closed tube', () => {
  const big = [...line(0.25, 0.3, 0.8, 0.1), ...circle(1.1, 0.4, 0.3), ...line(1.1, 0.1, 2, 0.1)];
  const tr = buildTrack([big], { kind: 'slide' });
  assert.equal(tr.bowls.length, 0);
  let sideways = 0;
  for (let i = 0; i < tr.count; i++) {
    if (tr.up[i * 3 + 1] < 0.4) {
      sideways++;
      assert.equal(tr.enclosed[i], 1, `open slide he'd fall out of at ${i}`);
    }
  }
  assert.ok(sideways > 10);
  assert.equal(tr.enclosed[0], 0, 'open at the top of the tower');
});

test('water jets keep the raft moving up hills', () => {
  const up = [...line(0.25, 0.3, 0.6, 0.06), ...line(0.6, 0.06, 1.0, 0.5), ...line(1.0, 0.5, 1.6, 0.1)];
  const tr = buildTrack([up], { kind: 'slide' });
  assert.ok(tr.lift.some((l) => l));
  for (let i = 0; i < tr.pool.start; i++) assert.ok(tr.speed[i] >= Math.min(SLIDE_V_MIN, liftSpeed(0, SLIDE_V_MIN)) - 1e-6 || tr.length - i * tr.step < 30);
});

test('ducks, caves and supports stay out of the bowl', () => {
  const tr = buildTrack([[...withBowl(), ...line(1.4, 0.04, 2.6, 0.04)]], { kind: 'slide' });
  const b = tr.bowls[0];
  const out = (i) => i < b.spiralStart || i > b.end;
  assert.ok(starSpots(tr).length > 2 && starSpots(tr).every(out));
  for (const [a, c] of tunnelRuns(tr)) assert.ok(out(a) && out(c));
  assert.ok(supportSpots(tr).length > 2);
});

test('the coaster is unchanged by the slide code', () => {
  const pts = withBowl();
  const tr = buildTrack([pts]);
  assert.equal(tr.kind, 'coaster');
  assert.equal(tr.bowls, undefined);
  assert.ok(Math.min(...Array.from({ length: tr.count }, (_, i) => tr.up[i * 3 + 1])) < -0.8, 'a circle is a loop');
});
