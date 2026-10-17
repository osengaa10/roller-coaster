import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, pathFromStrokes, starSpots, supportSpots, tunnelRuns, SLIDE_V_MIN, liftSpeed, STATIONS } from '../js/track.js';
import { findBowls, cutBowls, funnelY, findRapids, shapeSlide } from '../js/slide.js';

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

// --- Rapids ----------------------------------------------------------------

const zigzag = (x0 = 0.6, w = W) => stroke((t) => ({ x: x0 + t * 0.6, y: 0.2 + 0.06 * Math.sin(t * Math.PI * 10), w }), 240);
const withRapids = () => [...line(0.25, 0.3, 0.6, 0.2), ...zigzag(), ...line(1.2, 0.2, 1.6, 0.1)];
const shaped = (pts) => shapeSlide(pathFromStrokes([pts], 'slide'));

test('a zigzag is rapids; a hill, a big S-curve and a tight circle are not', () => {
  assert.equal(shaped(withRapids()).rapids.length, 1);
  const hill = stroke((t) => ({ x: 0.3 + t * 0.8, y: 0.1 + 0.3 * Math.sin(Math.PI * t), w: W }));
  const s = stroke((t) => ({ x: 0.3 + t * 1.2, y: 0.3 + 0.25 * Math.sin(t * Math.PI * 2), w: W }));
  for (const pts of [hill, s, withBowl()]) assert.equal(findRapids(pathFromStrokes([pts], 'slide')).length, 0);
});

test('a tight circle next to a zigzag makes one bowl and one rapids', () => {
  const both = [...withBowl(), ...zigzag(1.45), ...line(2.05, 0.2, 2.5, 0.1)];
  const sh = shaped(both);
  assert.equal(sh.bowls.length, 1);
  assert.equal(sh.rapids.length, 1);
});

test('rapids: a bumpy stretch of little waves, with no cave in it', () => {
  const tr = buildTrack([withRapids()], { kind: 'slide' });
  assertFinite(tr);
  assert.equal(tr.rapids.length, 1);
  const [a, b] = tr.rapids[0];
  let turns = 0;
  let dir = 0;
  // The rapids run gently downhill (peak to dip of the zigzag); the waves ride on that slope.
  // Measured away from the ends, which blend into the zigzag either side.
  const inner = (i) => i > a + (b - a) * 0.15 && i < b - (b - a) * 0.15;
  const ids = Array.from({ length: b - a + 1 }, (_, k) => a + k).filter(inner);
  const mx = ids.reduce((t, i) => t + i, 0) / ids.length;
  const my = ids.reduce((t, i) => t + tr.pos[i * 3 + 1], 0) / ids.length;
  const k = ids.reduce((t, i) => t + (i - mx) * (tr.pos[i * 3 + 1] - my), 0) / ids.reduce((t, i) => t + (i - mx) ** 2, 0);
  const slope = (i) => my + k * (i - mx);
  for (let i = a + 1; i <= b; i++) {
    const d = Math.sign(tr.pos[i * 3 + 1] - tr.pos[(i - 1) * 3 + 1]);
    if (d && d !== dir) {
      turns++;
      dir = d;
    }
    if (inner(i)) assert.ok(Math.abs(tr.pos[i * 3 + 1] - slope(i)) < 0.6, 'waves stay small');
  }
  assert.ok(turns >= 6, `bounces up and down (${turns} turns)`);
  for (const [c, d] of tunnelRuns(tr)) assert.ok(d < a || c > b, 'no cave in the rapids');
  for (let i = 1; i < tr.count; i++) {
    const [p, q] = [P(tr, i - 1), P(tr, i)];
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < tr.step * 2, `position jumps at ${i}`);
  }
});

test('only the middle of a zigzag becomes rapids: its first and last turns stay zigzag', () => {
  const zig = vs([[0.5, 0.25], [0.58, 0.08], [0.66, 0.25], [0.74, 0.08], [0.82, 0.25], [0.9, 0.08], [0.98, 0.25], [1.4, 0.25]]);
  const sh = shaped([...line(0.25, 0.3, 0.5, 0.25), ...zig]);
  assert.equal(sh.rapids.length, 1);
  const flat = sh.path.filter((p) => p.rp);
  const xs = flat.map((p) => p.x);
  assert.ok(Math.min(...xs) > 0.57 && Math.max(...xs) < 0.99, 'the outer V\'s are left alone');
  // The first V is still there in the 3D slide: it goes down and back up before the rapids.
  const tr = buildTrack([[...line(0.25, 0.3, 0.5, 0.25), ...zig]], { kind: 'slide' });
  const [a] = tr.rapids[0];
  const ys = Array.from({ length: a }, (_, i) => tr.pos[i * 3 + 1]);
  const low = Math.min(...ys.slice(Math.floor(a / 2)));
  assert.ok(ys[a - 1] - low > 3, 'climbs back out of a zigzag dip just before the rapids');
});

test('a tall, narrow zigzag (like a quick scribble up and down) makes rapids of a good length', () => {
  // About 40 px across but 230 px tall on an iPad, wobbling back and forth a little.
  const scribble = finger([[0.62, 0.15], [0.68, 0.5], [0.66, 0.17], [0.7, 0.48], [0.67, 0.18], [0.71, 0.47], [0.69, 0.16], [0.72, 0.45], [0.7, 0.15], [1.2, 0.15]]);
  const pts = [...finger([[0.25, 0.3], [0.6, 0.15]]), ...scribble];
  assert.equal(shaped(pts).bowls.length, 0, 'not a toilet bowl');
  assert.equal(shaped(pts).rapids.length, 1);
  const tr = buildTrack([pts], { kind: 'slide' });
  const [a, b] = tr.rapids[0];
  assert.ok((b - a) * tr.step >= 12, `rapids ${((b - a) * tr.step).toFixed(1)} m long`);
  for (let i = 1; i < tr.count; i++) {
    const [p, q] = [P(tr, i - 1), P(tr, i)];
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < tr.step * 2, `position jumps at ${i}`);
  }
});

test('the coaster ignores zigzags', () => {
  const tr = buildTrack([[...line(0.25, 0.1, 0.6, 0.2), ...zigzag(), ...line(1.2, 0.2, 1.6, 0.1)]]);
  assert.equal(tr.rapids, undefined);
});

// Zigzags the way a finger draws them: a few sharp V's, each about as wide as it is tall.
const vs = (pts) => pts.slice(1).flatMap((q, k) => line(pts[k][0], pts[k][1], q[0], q[1]));

test('a tight finger zigzag is rapids, even only a couple of V\'s; a spread-out one is not', () => {
  const tight = vs([[0.5, 0.25], [0.65, 0.1], [0.8, 0.28], [0.95, 0.1], [1.1, 0.27], [1.25, 0.12], [1.6, 0.12]]);
  const few = vs([[0.5, 0.25], [0.65, 0.08], [0.8, 0.25], [0.95, 0.08], [1.1, 0.25], [1.4, 0.25]]);
  const wide = vs([[0.5, 0.3], [0.8, 0.1], [1.1, 0.3], [1.4, 0.1], [1.7, 0.3], [2.0, 0.12]]);
  for (const [name, pts] of Object.entries({ tight, few })) assert.equal(shaped([...line(0.25, 0.3, 0.5, 0.25), ...pts]).rapids.length, 1, name);
  assert.equal(shaped([...line(0.25, 0.3, 0.5, 0.3), ...wide]).rapids.length, 0, 'wide');
});

// Finger-like points (~6 px apart) along straight pieces.
const finger = (pts) =>
  pts.slice(1).flatMap((q, k) => {
    const p = pts[k];
    const n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.009));
    return Array.from({ length: n }, (_, i) => ({ x: p[0] + (q[0] - p[0]) * (i / n), y: p[1] + (q[1] - p[1]) * (i / n), w: W }));
  });

test('sharp up-and-down zigzags never turn into toilet bowls', () => {
  // Nearly straight up and down, leaning a little differently each time: these used to add up
  // to a full "circle" and become a bowl.
  const zig = finger([[0.3, 0.3], [0.528, 0.08], [0.59, 0.28], [0.618, 0.08], [0.618, 0.28], [0.613, 0.08], [0.666, 0.28], [1.076, 0.2]]);
  const sh = shaped(zig);
  assert.equal(sh.bowls.length, 0);
  assert.equal(sh.rapids.length, 1);
});

test('starting a line a bit above and behind the tower does not make a toilet bowl', () => {
  // The slide joins the tower's end to wherever he first touches, then he swoops down.
  for (const start of [[0.12, 0.33], [0.15, 0.34], [0.18, 0.32], [0.1, 0.36]]) {
    const pts = finger([start, [0.5, 0.12], [1.3, 0.1]]);
    assert.equal(findBowls(pathFromStrokes([pts], 'slide')).length, 0, String(start));
  }
  assert.equal(bowlsIn(withBowl()).length, 1, 'a real tight circle still is one');
  assert.equal(bowlsIn(withBowl(2))[0].turns, 2, 'and going round twice still counts twice');
});

test('gentle rolling bumps stay ordinary hills', () => {
  const bumps = stroke((t) => ({ x: 0.3 + t * 1.6, y: 0.15 + 0.04 * Math.sin(t * Math.PI * 8), w: W }), 400);
  assert.equal(shaped(bumps).rapids.length, 0);
});
