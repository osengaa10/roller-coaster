import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackShape, supportSpots2D, uprightNormals } from '../js/draw-art.js';

const stroke = (f, n = 120) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
// Counter-clockwise loop (right, up, back left over the top, down, right again), as in track.test.js.
const loop = [
  ...stroke((t) => ({ x: 0.3 + t * 0.4, y: 0.06 })),
  ...stroke((t) => {
    const a = -Math.PI / 2 + t * 2 * Math.PI;
    return { x: 0.7 + 0.15 * Math.cos(a) + t * 0.05, y: 0.21 + 0.15 * Math.sin(a) };
  }),
  ...stroke((t) => ({ x: 0.75 + t * 0.5, y: 0.06 })),
];
// The same loop flipped upside down: coming in along the top, it loops down underneath clockwise.
const overhand = loop.map((p) => ({ x: p.x, y: 1 - p.y }));
const upY = (shape, i) => shape.up[i * 2 + 1];
const lowest = (pts, from, to) => {
  let best = from;
  for (let i = from; i < to; i++) if (pts[i].y < pts[best].y) best = i;
  return best;
};
const highest = (pts, from, to) => {
  let best = from;
  for (let i = from; i < to; i++) if (pts[i].y > pts[best].y) best = i;
  return best;
};

test('track rides on top along flat ground', () => {
  const pts = stroke((t) => ({ x: t, y: 0.1 }));
  const shape = trackShape(pts);
  for (let i = 0; i < pts.length; i++) assert.ok(upY(shape, i) > 0.95);
});

test('a normal loop keeps its spine on the outside', () => {
  const shape = trackShape(loop);
  assert.ok(upY(shape, lowest(loop, 130, 230)) > 0.5, 'bottom of the loop rides on top');
  assert.ok(upY(shape, highest(loop, 121, 241)) < -0.5, 'top of the loop is upside down');
});

test('an overhand loop is ridden on the inside too', () => {
  const shape = trackShape(overhand);
  assert.equal(shape.structure.loops.length, 1);
  assert.equal(shape.structure.loops[0].dir, -1);
  assert.ok(upY(shape, lowest(overhand, 121, 241)) > 0.5, 'bottom of the loop: heads point up, toward the middle');
  assert.ok(upY(shape, highest(overhand, 140, 220)) < -0.5, 'top of the loop: heads point down, toward the middle');
});

// Right, up a tall turn, then back left for `back` units.
const outAndBack = (back) => [
  ...stroke((t) => ({ x: 0.3 + t * 0.4, y: 0.1 })),
  ...stroke((t) => ({ x: 0.7 + 0.15 * Math.sin(Math.PI * t), y: 0.1 + 0.3 * t }), 40),
  ...stroke((t) => ({ x: 0.7 - t * back, y: 0.4 })),
];

test('a long right-to-left stretch rolls back upright, a short one stays upside down', () => {
  const long = outAndBack(1.2);
  assert.ok(upY(trackShape(long), long.length - 60) > 0.5);
  const short = outAndBack(0.25);
  assert.ok(upY(trackShape(short), short.length - 60) < -0.5);
});

test('the lift chain runs up the first climb but not down the drop', () => {
  const hill = stroke((t) => ({ x: 0.3 + t * 1.2, y: 0.06 + 0.6 * Math.sin(Math.PI * t) }));
  const { lift } = trackShape(hill);
  assert.equal(lift[30], 1);
  assert.equal(lift[90], 0);
});

test('reusing the found loops gives the same shape', () => {
  const first = trackShape(overhand);
  const again = trackShape(overhand, first.structure);
  assert.deepEqual([...again.up], [...first.up]);
});

test('columns stand under flat track, evenly spaced (further apart when tall)', () => {
  const count = (y) => {
    const pts = stroke((t) => ({ x: t * 2, y }), 400);
    const spots = supportSpots2D(pts, trackShape(pts).up, { every: 0.1 });
    for (const sp of spots) assert.ok(sp.y < y && sp.y > y - 0.02);
    for (let k = 1; k < spots.length; k++) assert.ok(Math.abs(spots[k].x - spots[k - 1].x - (spots[1].x - spots[0].x)) < 0.02);
    return spots.length;
  };
  const low = count(0.05);
  assert.ok(low >= 18 && low <= 21, `got ${low}`);
  assert.ok(count(0.6) < low * 0.75);
});

test('no column pokes through the bottom of a loop', () => {
  const spots = supportSpots2D(loop, trackShape(loop).up, { every: 0.03 });
  for (const sp of spots) {
    const overBottom = sp.x > 0.6 && sp.x < 0.85 && sp.y > 0.12;
    assert.ok(!overBottom, `column at ${sp.x.toFixed(3)}, ${sp.y.toFixed(3)} stands on the loop's bottom`);
  }
  assert.ok(spots.length > 0);
});

test('tall columns become towers unless their legs would hit track', () => {
  // High track out to x = 2, then a turn and back low (y = 0.05) as far as x = 1.
  const pts = [
    ...stroke((t) => ({ x: t * 2, y: 0.8 }), 200),
    ...stroke((t) => ({ x: 2 + 0.1 * Math.sin(Math.PI * t), y: 0.8 - 0.75 * t }), 40),
    ...stroke((t) => ({ x: 2 - t, y: 0.05 }), 100),
  ];
  for (const every of [0.1, 0.13, 0.17]) {
    const spots = supportSpots2D(pts, uprightNormals(pts), { every });
    const high = spots.filter((sp) => sp.y > 0.7);
    assert.ok(high.filter((sp) => sp.x < 0.8).every((sp) => sp.spread > 0), 'open ground: towers');
    // A tower's legs reach about 0.04 out; one that close to the low track stays a single column.
    assert.ok(high.filter((sp) => sp.x > 0.92 && sp.x < 1).every((sp) => sp.spread === 0), 'legs would land on the low track');
    assert.ok(!high.some((sp) => sp.x > 1.04 && sp.x < 1.95), 'nothing stands on the low track');
    for (let k = 1; k < high.length; k++) {
      const [a, b] = [high[k - 1], high[k]];
      assert.ok(b.x - a.x >= a.spread + b.spread, 'neighbouring towers keep their legs apart');
    }
  }
});
