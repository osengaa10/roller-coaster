import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, drawnLength, resample, smooth, supportSpots, V_MIN, STATION } from '../js/track.js';

// A stroke helper: f(t) for t in [0, 1] -> {x, y}
const stroke = (f, n = 120) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const hill = stroke((t) => ({ x: 0.3 + t * 1.2, y: 0.06 + 0.6 * Math.sin(Math.PI * t) }));
// Counter-clockwise loop (right, up, back left over the top, down, right again).
const loop = [
  ...stroke((t) => ({ x: 0.3 + t * 0.4, y: 0.06 })),
  ...stroke((t) => {
    const a = -Math.PI / 2 + t * 2 * Math.PI;
    return { x: 0.7 + 0.15 * Math.cos(a) + t * 0.05, y: 0.21 + 0.15 * Math.sin(a) };
  }),
  ...stroke((t) => ({ x: 0.75 + t * 0.5, y: 0.06 })),
];

function assertFinite(track) {
  for (const key of ['pos', 'tan', 'up', 'speed']) {
    for (const v of track[key]) assert.ok(Number.isFinite(v), `${key} has non-finite value`);
  }
}

const upY = (tr, i) => tr.up[i * 3 + 1];

test('resample produces even spacing', () => {
  const out = resample([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 0.1);
  for (let i = 1; i < out.length - 1; i++) {
    assert.ok(Math.abs(Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y) - 0.1) < 0.03);
  }
  assert.ok(Math.hypot(out.at(-1).x - 1, out.at(-1).y - 1) < 1e-6);
});

test('smooth keeps endpoints', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 0 }];
  const out = smooth(pts, 3);
  assert.deepEqual(out[0], pts[0]);
  assert.deepEqual(out[2], pts[2]);
  assert.ok(out[1].y < 5);
});

test('empty and degenerate drawings still make a rideable track', () => {
  for (const strokes of [[], [[{ x: 0.5, y: 0.5 }]], [[{ x: 0.3, y: 0.06 }, { x: 0.3, y: 0.06 }]]]) {
    const tr = buildTrack(strokes);
    assert.ok(tr.count > 10);
    assertFinite(tr);
  }
});

test('starts upright at the station and speed never drops below the chain lift', () => {
  const tr = buildTrack([hill]);
  assertFinite(tr);
  assert.ok(upY(tr, 0) > 0.99);
  const brakeStart = tr.length - 30;
  for (let i = 0; i < tr.count; i++) {
    if (i * tr.step < brakeStart) assert.ok(tr.speed[i] >= V_MIN - 1e-6);
    assert.ok(tr.speed[i] > 0);
  }
  assert.ok(tr.lift.some((l) => l === 1), 'climbing the hill uses the chain lift');
  assert.ok(tr.whee.length >= 1, 'big drop gets a wheee');
  assert.ok(Math.max(...tr.speed) > V_MIN * 2, 'drops are fast');
});

test('a drawn loop turns the rider upside down at the top, upright after', () => {
  const tr = buildTrack([loop]);
  assertFinite(tr);
  assert.ok(Math.min(...Array.from({ length: tr.count }, (_, i) => upY(tr, i))) < -0.8);
  assert.ok(upY(tr, tr.count - 1) > 0.9);
  // Up vector changes smoothly (no sudden flips).
  for (let i = 1; i < tr.count; i++) {
    const d = tr.up[i * 3] * tr.up[i * 3 - 3] + tr.up[i * 3 + 1] * tr.up[i * 3 - 2] + tr.up[i * 3 + 2] * tr.up[i * 3 - 1];
    assert.ok(d > 0.9, `up vector jumps at sample ${i}`);
  }
});

test('long right-to-left drawing is rolled back upright', () => {
  const back = stroke((t) => ({ x: 1.5 - t * 1.4, y: 0.3 }));
  const tr = buildTrack([[{ x: 1.5, y: 0.3 }], back]);
  assertFinite(tr);
  const mid = Math.floor(tr.count * 0.6);
  assert.ok(upY(tr, mid) > 0.9, `expected upright mid-run, got ${upY(tr, mid)}`);
});

test('drawn length ignores the station', () => {
  assert.equal(drawnLength([]), 0);
  assert.ok(Math.abs(drawnLength([[{ x: STATION.x1 + 0.5, y: STATION.y }]]) - 0.5) < 1e-9);
});

// Any track point (away from where the pillar attaches) sitting right over the pillar's footprint.
function pillarHits(tr, spots) {
  const hits = [];
  for (const b of spots) {
    for (let j = 0; j < tr.count; j++) {
      const p = [tr.pos[j * 3], tr.pos[j * 3 + 1], tr.pos[j * 3 + 2]];
      const attached = Math.hypot(p[0] - b.x, p[1] - b.y, p[2] - b.z) < 4;
      if (!attached && p[1] < b.y && Math.hypot(p[0] - b.x, p[2] - b.z) < 1.2) hits.push({ b, p });
    }
  }
  return hits;
}

test('a plain hill gets support pillars', () => {
  const tr = buildTrack([hill]);
  assert.ok(supportSpots(tr).length > 5);
});

test('pillars never go through other parts of the track', () => {
  // Over a hill, then back underneath it, plus a loop: lots of chances to stab the track.
  const under = stroke((t) => ({ x: 1.5 - t * 1.0, y: 0.12 + 0.05 * Math.sin(t * 6) }));
  for (const strokes of [[loop], [hill, under], [hill, under, loop.map((p) => ({ x: p.x + 0.2, y: p.y }))]]) {
    const tr = buildTrack(strokes);
    const hits = pillarHits(tr, supportSpots(tr));
    assert.equal(hits.length, 0, `pillar through track at ${JSON.stringify(hits[0])}`);
  }
});
