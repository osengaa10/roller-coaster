import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, pathFromStrokes, supportSpots, starSpots, V_MIN } from '../js/track.js';
import { findCorkscrews, shapeCoaster, tidyCurls } from '../js/corkscrew.js';
import { findBowls, shapeSlide } from '../js/slide.js';

const stroke = (f, n = 120) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const W = 0.03; // finger wobble at normal zoom on an iPad (20 px in track units)
const line = (x0, y0, x1, y1, w = W) => stroke((t) => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, w }));
// A row of curls like a spring, drawn along from (x0, y0): each curl goes up and round
// (counter-clockwise when drawn to the right), `pitch` further along than the last.
const spring = (x0, y0, curls, { r = 0.07, pitch = 0.09, dir = 1, w = W } = {}) =>
  stroke((t) => {
    const th = t * curls * 2 * Math.PI;
    return { x: x0 + dir * (pitch * curls * t + r * Math.sin(th)), y: y0 + r * (1 - Math.cos(th)), w };
  }, 50 * curls);
const circle = (cx, cy, r, laps = 1, w = W, n = 60) =>
  stroke((t) => {
    const a = -Math.PI / 2 + t * laps * 2 * Math.PI;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), w };
  }, n * laps);
const withSpring = (curls, opts) => [...line(0.25, 0.12, 0.6, 0.12), ...spring(0.6, 0.12, curls, opts), ...line(0.6 + 0.09 * curls, 0.12, 1.6, 0.12)];
const coaster = (pts) => findCorkscrews(pathFromStrokes([pts]));
const U = (tr, i) => [tr.up[i * 3], tr.up[i * 3 + 1], tr.up[i * 3 + 2]];
const P = (tr, i) => [tr.pos[i * 3], tr.pos[i * 3 + 1], tr.pos[i * 3 + 2]];

function assertFinite(track) {
  for (const key of ['pos', 'tan', 'up', 'speed']) {
    for (const v of track[key]) assert.ok(Number.isFinite(v), `${key} has non-finite value`);
  }
}

test('a row of curls is one corkscrew, one twist per curl', () => {
  for (const n of [2, 3, 4]) {
    const found = coaster(withSpring(n));
    assert.equal(found.length, 1, `${n} curls`);
    assert.equal(found[0].turns, n);
    assert.equal(found[0].dirX, 1);
  }
});

test('curls drawn to the left, or the other way round, are corkscrews too', () => {
  const left = [...line(0.25, 0.12, 2, 0.12), ...spring(2, 0.12, 3, { dir: -1 }), ...line(1.7, 0.12, 1.2, 0.12)];
  const found = coaster(left);
  assert.equal(found.length, 1);
  assert.equal(found[0].dirX, -1);
  assert.equal(found[0].turns, 3);
});

test('one curl on its own, a big loop, hills and zigzags are not corkscrews', () => {
  const one = withSpring(1);
  const loop = [...line(0.25, 0.1, 0.8, 0.1), ...circle(1.1, 0.4, 0.3), ...line(1.1, 0.1, 2, 0.1)];
  const hill = stroke((t) => ({ x: 0.3 + t * 0.4, y: 0.1 + 0.25 * Math.sin(Math.PI * t), w: W }));
  const zigzag = stroke((t) => ({ x: 0.3 + t, y: 0.2 + 0.08 * Math.sin(t * 40), w: W }), 400);
  const scribble = stroke((t) => ({ x: 0.4 + 0.3 * Math.sin(t * 6 * Math.PI), y: 0.2 + t * 0.05, w: W }), 400);
  for (const pts of [one, loop, hill, zigzag, scribble]) assert.equal(coaster(pts).length, 0);
});

test('a coil of bigger loops is still loops, not a corkscrew', () => {
  assert.equal(coaster(withSpring(3, { r: 0.2, pitch: 0.2 })).length, 0);
});

test('zoomed out, curls that look tight on screen are a corkscrew', () => {
  const pts = withSpring(3, { r: 0.5, pitch: 0.6, w: W * 10 });
  assert.equal(coaster(pts).length, 1);
});

test('the coaster rides a corkscrew: upside down at each top, heads toward the middle', () => {
  const tr = buildTrack([withSpring(3)]);
  assertFinite(tr);
  assert.equal(tr.corkscrews.length, 1);
  const [a, b] = tr.corkscrews[0];
  // Upside down three times, once per twist, and upright again after.
  let flips = 0;
  let down = false;
  for (let i = a; i <= b; i++) {
    const isDown = tr.up[i * 3 + 1] < -0.8;
    if (isDown && !down) flips++;
    down = isDown;
  }
  assert.equal(flips, 3);
  assert.ok(tr.up[(b + 20) * 3 + 1] > 0.9, 'upright after the corkscrew');
  // The track goes round an axis: in the middle of the twist, "up" points back to it.
  const axisY = (Math.max(...Array.from({ length: b - a }, (_, k) => tr.pos[(a + k) * 3 + 1])) + tr.pos[a * 3 + 1]) / 2;
  const mid = Math.round((a + b) / 2);
  for (let i = mid - 20; i <= mid + 20; i += 5) {
    const p = P(tr, i);
    const toAxis = [0, axisY - p[1], tr.pos[a * 3 + 2] - p[2]];
    const l = Math.hypot(...toAxis);
    if (l < 1.5) continue;
    const u = U(tr, i);
    assert.ok((u[1] * toAxis[1] + u[2] * toAxis[2]) / l > 0.7, `up points at the axis at ${i}`);
  }
});

test('the corkscrew joins on smoothly and never stalls', () => {
  const tr = buildTrack([withSpring(4)]);
  for (let i = 1; i < tr.count; i++) {
    const d = Math.hypot(...[0, 1, 2].map((k) => tr.pos[i * 3 + k] - tr.pos[(i - 1) * 3 + k]));
    assert.ok(d < tr.step * 1.5, `gap in the track at ${i}`);
    const u0 = U(tr, i - 1);
    const u1 = U(tr, i);
    assert.ok(u0[0] * u1[0] + u0[1] * u1[1] + u0[2] * u1[2] > 0.9, `up jumps at ${i}`);
  }
  const [a, b] = tr.corkscrews[0];
  for (let i = a; i <= b; i++) {
    assert.ok(tr.speed[i] >= V_MIN - 1e-3);
    assert.equal(tr.lift[i], 0, 'no chain lift in a corkscrew');
  }
  // It comes out at the drawn height, back in line with where it went in.
  assert.ok(Math.abs(tr.pos[(b + 5) * 3 + 1] - 0.12 * 40) < 0.6);
  assert.ok(Math.abs(tr.pos[(b + 5) * 3 + 2] - tr.pos[(a - 5) * 3 + 2]) < 0.6);
});

test('supports and stars around a corkscrew stay sensible', () => {
  const tr = buildTrack([withSpring(3)]);
  for (const s of supportSpots(tr)) assert.ok(s.y > 0 && Number.isFinite(s.x + s.z));
  assert.ok(starSpots(tr).length > 0);
});

test('on the slide a row of curls is a corkscrew tube, not a row of toilet bowls', () => {
  const pts = [...line(0.25, 0.3, 0.6, 0.15), ...spring(0.6, 0.15, 3), ...line(0.87, 0.15, 1.6, 0.1)];
  const shape = shapeSlide(pathFromStrokes([pts], 'slide'));
  assert.equal(shape.corkscrews.length, 1);
  assert.equal(shape.bowls.length, 0);
  const tr = buildTrack([pts], { kind: 'slide' });
  assertFinite(tr);
  assert.equal(tr.corkscrews.length, 1);
  const [a, b] = tr.corkscrews[0];
  for (let i = a; i <= b; i++) assert.equal(tr.enclosed[i], 1, 'closed tube all the way round');
});

test('on the slide, one circle or going round twice on the spot is still a toilet bowl', () => {
  for (const laps of [1, 2]) {
    const pts = [...line(0.25, 0.3, 0.65, 0.1), ...circle(0.75, 0.2, 0.1, laps), ...line(0.75, 0.1, 1.4, 0.1)];
    const shape = shapeSlide(pathFromStrokes([pts], 'slide'));
    assert.equal(shape.corkscrews.length, 0, `${laps} laps`);
    assert.equal(shape.bowls.length, 1);
    assert.equal(shape.bowls[0].turns, laps);
    assert.equal(findBowls(pathFromStrokes([pts], 'slide')).length, 1);
  }
});

test('the drawing screen shows the curls as a neat spring between the same ends', () => {
  const path = pathFromStrokes([withSpring(3)]);
  const { corkscrews } = shapeCoaster(path);
  const tidy = tidyCurls(path, corkscrews);
  const c = corkscrews[0];
  assert.equal(tidy[0], path[0]);
  assert.equal(tidy[tidy.length - 1], path[path.length - 1]);
  const spring = tidy.slice(c.i0, c.i0 + (tidy.length - path.length + (c.i1 - c.i0)));
  assert.ok(spring.every((p) => p.y >= path[c.i0].y - 1e-6 && Number.isFinite(p.x)));
});
