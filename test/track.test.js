import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTrack, drawnLength, resample, smooth, supportSpots, supportLegs, starSpots, tunnelRuns, splashSpot,
  colorAt, normalizeStroke, RAINBOW, V_MIN, STATION,
} from '../js/track.js';

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

function assertNoUpJumps(tr) {
  for (let i = 1; i < tr.count; i++) {
    const d = tr.up[i * 3] * tr.up[i * 3 - 3] + tr.up[i * 3 + 1] * tr.up[i * 3 - 2] + tr.up[i * 3 + 2] * tr.up[i * 3 - 1];
    assert.ok(d > 0.9, `up vector jumps at sample ${i}`);
  }
}

test('an overhand (clockwise) loop is ridden on the inside', () => {
  // Down off a hill, round the bottom going left, up and out right through the crossing.
  const pts = [[0.4, 0.6], [0.6, 0.55], [0.75, 0.45], [0.85, 0.3], [0.82, 0.15], [0.7, 0.1], [0.6, 0.18], [0.6, 0.32], [0.7, 0.45], [0.85, 0.55], [1.0, 0.6], [1.4, 0.06]];
  const cw = pts.slice(1).flatMap(([x, y], i) => stroke((t) => ({ x: pts[i][0] + (x - pts[i][0]) * t, y: pts[i][1] + (y - pts[i][1]) * t }), 30));
  const tr = buildTrack([cw]);
  assertFinite(tr);
  assertNoUpJumps(tr);
  // The bottom of the loop (heading left): inside means upright, not hanging underneath.
  let bottom = -1;
  for (let i = 0; i < tr.count; i++) {
    if (tr.tan[i * 3] < -0.5 && tr.pos[i * 3 + 1] < 8 && (bottom < 0 || tr.pos[i * 3 + 1] < tr.pos[bottom * 3 + 1])) bottom = i;
  }
  assert.ok(bottom > 0, 'found the bottom of the loop');
  assert.ok(upY(tr, bottom) > 0.8, `rides inside at the bottom, got ${upY(tr, bottom)}`);
  assert.ok(upY(tr, tr.count - 1) > 0.9);
});

test('scribbling back and forth makes flat, banked U-turns that stay upright', () => {
  const scrib = [{ x: 0.3, y: 0.3 }];
  for (let k = 0; k < 6; k++) {
    const x0 = k % 2 ? 1.0 : 0.5;
    scrib.push(...stroke((t) => ({ x: x0 + (k % 2 ? -1 : 1) * t * 0.5, y: 0.3 + k * 0.03 + t * 0.03 }), 60));
  }
  const tr = buildTrack([scrib]);
  assertFinite(tr);
  assertNoUpJumps(tr);
  const lanes = (i) => tr.pos[i * 3 + 1] > 11; // up on the scribble, past the climb
  let banked = false;
  for (let i = 0; i < tr.count; i++) {
    if (!lanes(i)) continue;
    assert.ok(upY(tr, i) > 0.5, `upright on the scribble, got ${upY(tr, i)} at ${i}`);
    if (upY(tr, i) < 0.85) banked = true;
  }
  assert.ok(banked, 'leans into the U-turns');
  // Lanes move over sideways and the turns never run into another part of the track.
  const far = Math.round(20 / tr.step);
  for (let i = 0; i < tr.count; i += 2) {
    for (let j = i + far; j < tr.count; j += 2) {
      const d = Math.hypot(tr.pos[i * 3] - tr.pos[j * 3], tr.pos[i * 3 + 1] - tr.pos[j * 3 + 1], tr.pos[i * 3 + 2] - tr.pos[j * 3 + 2]);
      assert.ok(d > 3, `track at ${i} and ${j} only ${d.toFixed(2)} m apart`);
    }
  }
});

test('a tall turnaround (half loop) still goes over the top, not round a flat U-turn', () => {
  const half = [
    ...stroke((t) => ({ x: 0.3 + t * 0.4, y: 0.06 })),
    ...stroke((t) => {
      const a = -Math.PI / 2 + t * Math.PI;
      return { x: 0.7 + 0.15 * Math.cos(a), y: 0.21 + 0.15 * Math.sin(a) };
    }),
    ...stroke((t) => ({ x: 0.7 - t * 0.2, y: 0.36 })),
  ];
  const tr = buildTrack([half]);
  assertFinite(tr);
  assertNoUpJumps(tr);
  const top = Array.from({ length: tr.count }, (_, i) => tr.pos[i * 3 + 1]).findIndex((y) => y > 13);
  assert.ok(top > 0 && Math.abs(tr.pos[top * 3 + 2]) < 3, 'goes up over the top in the drawing plane');
  assert.ok(Math.min(...Array.from({ length: tr.count }, (_, i) => upY(tr, i))) < 0.3, 'tips over on the way round');
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

// --- Round 2: colors, stars, tunnels, splash -------------------------------------------

test('each stroke keeps its crayon color on the 3D track', () => {
  const blue = { c: 3, p: hill.slice(0, 60) };
  const green = { c: 2, p: hill.slice(60) };
  const tr = buildTrack([blue, green]);
  const colors = new Set();
  for (let i = 0; i < tr.count; i++) colors.add([0, 1, 2].map((k) => tr.rgb[i * 3 + k].toFixed(3)).join());
  for (const c of [0, 2, 3]) assert.ok(colors.has(colorAt(c).map((v) => v.toFixed(3)).join()), `missing color ${c}`);
  assert.ok(tr.rgb.every(Number.isFinite));
});

test('rainbow crayon makes many colors', () => {
  const tr = buildTrack([{ c: RAINBOW, p: hill }]);
  const hues = new Set();
  for (let i = 0; i < tr.count; i++) hues.add(tr.rgb[i * 3].toFixed(2) + tr.rgb[i * 3 + 2].toFixed(2));
  assert.ok(hues.size > 20);
});

test('old saved drawings (bare point arrays) still work', () => {
  const tr = buildTrack([hill]);
  assert.ok(tr.count > 100);
  assert.deepEqual(normalizeStroke(hill), { c: 0, p: hill });
});

test('stars are spread along the ride, never in the station or brakes', () => {
  const tr = buildTrack([hill]);
  const stars = starSpots(tr);
  assert.ok(stars.length >= 3);
  for (const i of stars) {
    assert.ok(i * tr.step > 15, 'not in the station');
    assert.ok(tr.length - i * tr.step > 25, 'not in the brake run');
  }
});

const ground = (x0, x1) => stroke((t) => ({ x: x0 + t * (x1 - x0), y: 0.04 }));

test('long ground-hugging stretch gets a tunnel; a tall hill does not', () => {
  const tr = buildTrack([ground(0.3, 2.0)]);
  const runs = tunnelRuns(tr);
  assert.ok(runs.length >= 1);
  for (const [a, b] of runs) assert.ok((b - a) * tr.step >= 15 && (b - a) * tr.step <= 40.5);
  const tall = buildTrack([stroke((t) => ({ x: 0.3 + t * 1.2, y: 0.4 + 0.3 * Math.sin(Math.PI * t) }))]);
  assert.equal(tunnelRuns(tall).length, 0);
});

test('splash pond sits at the bottom of a big drop, not on flat track', () => {
  const drop = [...stroke((t) => ({ x: 0.3 + t * 0.4, y: 0.06 + t * 0.6 })), ...stroke((t) => ({ x: 0.7 + t * 0.3, y: 0.66 - t * 0.62 })), ...ground(1.0, 1.6)];
  const tr = buildTrack([drop]);
  const i = splashSpot(tr);
  assert.notEqual(i, null);
  assert.ok(tr.pos[i * 3 + 1] < 4.5);
  for (const [a, b] of tunnelRuns(tr, i)) assert.ok(i < a - 20 || i > b + 20, 'tunnel keeps clear of the pond');
  assert.equal(splashSpot(buildTrack([ground(0.3, 1.5)])), null);
});

test('tall supports become A-frames whose legs stay clear of the track', () => {
  const tall = buildTrack([hill]);
  const spots = supportSpots(tall);
  assert.ok(spots.some((s) => s.spread > 0), 'a tall hill gets A-frames');
  assert.ok(spots.every((s) => s.y > 10 || s.spread === 0), 'short supports stay single columns');
  const under = stroke((t) => ({ x: 1.5 - t * 1.0, y: 0.12 + 0.05 * Math.sin(t * 6) }));
  for (const strokes of [[hill], [loop], [hill, under]]) {
    const tr = buildTrack(strokes);
    for (const spot of supportSpots(tr).filter((s) => s.spread > 0)) {
      for (const [a, b] of supportLegs(spot)) {
        for (let k = 1; k <= 10; k++) {
          const f = k / 10;
          const p = [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f];
          for (let j = 0; j < tr.count; j++) {
            const q = [tr.pos[j * 3], tr.pos[j * 3 + 1], tr.pos[j * 3 + 2]];
            if (Math.hypot(q[0] - spot.x, q[1] - spot.y, q[2] - spot.z) < 4) continue; // where it attaches
            assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 1.2, 'leg through track');
          }
        }
      }
    }
  }
});

test('every support sits right under the spine of upright track, even around loops', () => {
  for (const strokes of [[loop], [hill, loop.map((p) => ({ x: p.x + 1.2, y: p.y }))]]) {
    const tr = buildTrack(strokes);
    const spots = supportSpots(tr);
    assert.ok(spots.length > 3);
    for (const sp of spots) {
      // The column top must be the spine of upright-ish track (spine = 0.6 m under the rails).
      let held = false;
      for (let j = 0; j < tr.count && !held; j++) {
        const spine = [0, 1, 2].map((k) => tr.pos[j * 3 + k] - tr.up[j * 3 + k] * 0.6);
        const d = Math.hypot(spine[0] - sp.x, spine[1] - sp.y, spine[2] - sp.z);
        held = d < 0.3 && tr.up[j * 3 + 1] > 0.3;
      }
      assert.ok(held, `support at ${sp.x.toFixed(1)},${sp.y.toFixed(1)} holds nothing`);
    }
  }
});

test('steep lift hills get supports too', () => {
  const steep = stroke((t) => ({ x: 0.3 + t * 0.25, y: 0.06 + t * 0.6 }));
  const tr = buildTrack([[...steep, ...stroke((t) => ({ x: 0.55 + t * 0.5, y: 0.66 - t * 0.6 }))]]);
  const spots = supportSpots(tr).filter((s) => s.x > 13 && s.x < 22);
  assert.ok(spots.length >= 1, 'the ~65 degree climb has supports');
});

// A climb way up into space, as drawn when he holds against the top edge.
const space = [
  ...stroke((t) => ({ x: 0.3 + t * 6, y: 0.06 + t * 37, w: 1 }), 300),
  ...stroke((t) => ({ x: 6.3 + t * 6, y: 37 - t * 36.9, w: 1 }), 300),
];

test('a giant space coaster stays a sensible size', () => {
  const tr = buildTrack([space]);
  assertFinite(tr);
  assert.ok(tr.count <= 16100, `too many samples: ${tr.count}`);
  assert.ok(Math.max(...Array.from({ length: tr.count }, (_, i) => tr.pos[i * 3 + 1])) > 1300, 'reaches ~1.5 km');
  assert.ok(starSpots(tr).length <= 41);
  assert.ok(supportSpots(tr).every((s) => s.y < 301), 'no supports up in space');
});

test('speeds stay smooth: never faster than 100 m/s, and a 10 km hill rides in minutes', () => {
  const tr = buildTrack([space]);
  assert.ok(Math.max(...tr.speed) <= 100);
  let seconds = 0;
  for (let i = 1; i < tr.count; i++) seconds += tr.step / tr.speed[i];
  assert.ok(seconds < 90, `ride takes ${seconds.toFixed(0)} s`);
  assert.ok(Math.max(...tr.speed) > 45, 'giant drops really fly');
});

// Worst bend partway up a climb (between 60 m and 1100 m high): largest change of direction per meter.
function sharpest(tr) {
  let worst = 0;
  for (let i = 2; i < tr.count; i++) {
    if (tr.pos[i * 3 + 1] < 60 || tr.pos[i * 3 + 1] > 1100) continue;
    const d = tr.tan[i * 3] * tr.tan[i * 3 - 3] + tr.tan[i * 3 + 1] * tr.tan[i * 3 - 2] + tr.tan[i * 3 + 2] * tr.tan[i * 3 - 1];
    worst = Math.max(worst, Math.acos(Math.min(1, d)) / tr.step);
  }
  return worst;
}

test('wobbly lines drawn while zoomed way out come out smooth', () => {
  // A climb drawn at max zoom-out: every finger sample wobbles ~0.2 units (8 m).
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.4;
  const wobbly = (w) => stroke((t) => ({ x: 0.3 + t * 8 + rand(), y: 0.06 + t * 30 + rand(), w }), 400);
  const rough = sharpest(buildTrack([wobbly(0)]));
  const smooth = sharpest(buildTrack([wobbly(1)]));
  assert.ok(smooth < rough / 4, `smoothing should help a lot: ${smooth.toFixed(3)} vs ${rough.toFixed(3)} rad/m`);
  assert.ok(smooth < 0.06, `no sharp bumps: ${smooth.toFixed(3)} rad/m`);
});

test('lines drawn at normal zoom keep their shape (a loop is still a loop)', () => {
  const tr = buildTrack([loop.map((p) => ({ ...p, w: 0.04 }))]);
  assert.ok(Math.min(...Array.from({ length: tr.count }, (_, i) => upY(tr, i))) < -0.8);
});

test('a max-height hill climbs quickly, normal hills keep a gentle chain', () => {
  const climb = (tr) => {
    let t = 0;
    for (let i = 1; i < tr.count; i++) if (tr.tan[i * 3 + 1] > 0.1 && tr.pos[i * 3 + 1] > 5) t += tr.step / tr.speed[i];
    return t;
  };
  assert.ok(climb(buildTrack([space])) < 22, 'giant climb under ~20 s');
  const small = buildTrack([hill]);
  assert.ok(Math.max(...Array.from(small.speed).filter((_, i) => small.lift[i])) < 9, 'normal chain stays gentle');
});
