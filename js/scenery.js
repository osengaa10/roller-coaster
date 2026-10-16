// The 3D world: sky, ground, trees, and everything built from a drawn track.
import * as THREE from 'three';
import { supportSpots, supportLegs, starSpots, splashSpot, tunnelRuns } from './track.js';

const RAIL_GAP = 0.6; // half distance between rails
const SPINE_DROP = 0.6; // spine center below the rails

// Fresh (uncached) materials, so a track's world can be disposed in one go.
const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
// Painted steel: picks up a highlight from the sun.
const shiny = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 70, specular: '#4d4d4d', ...extra });

const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Matrix for a unit cylinder (radius 1, height 1, centered) stretched from a to b.
function beam(m, a, b, r) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.divideScalar(len || 1));
  return m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
}

export function makeStaticWorld() {
  const g = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), mat('#5cc94f'));
  ground.rotation.x = -Math.PI / 2;
  g.add(ground);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffe14d', fog: false }));
  sun.position.set(-500, 400, -900);
  g.add(sun);

  // Clouds: puffy sphere clusters, scattered high up.
  const puff = new THREE.SphereGeometry(1, 12, 8);
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#bbbbbb' });
  const rand = mulberry32(7);
  for (let c = 0; c < 40; c++) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(puff, white);
      const r = 8 + rand() * 6;
      m.scale.set(r, r * 0.7, r);
      m.position.set(k * 10 - 15, rand() * 4, rand() * 6);
      cloud.add(m);
    }
    cloud.position.set((rand() - 0.3) * 1200, 70 + rand() * 80, (rand() - 0.5) * 1200);
    g.add(cloud);
  }

  // Far-away rolling hills.
  const hill = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const m = new THREE.Mesh(hill, mat(i % 2 ? '#47b04a' : '#3fa05a'));
    const r = 60 + rand() * 60;
    m.scale.set(r * 1.6, r * 0.6, r);
    m.position.set(Math.cos(a) * 750 + 150, 0, Math.sin(a) * 750);
    g.add(m);
  }
  return g;
}

// Everything that depends on the drawing. Returns the group plus the bits the ride animates.
export function makeTrackWorld(tr, eye) {
  const g = new THREE.Group();
  const n = tr.count;
  const all = Array.from({ length: n }, (_, i) => i);
  const P = (i) => new THREE.Vector3(tr.pos[i * 3], tr.pos[i * 3 + 1], tr.pos[i * 3 + 2]);
  const U = (i) => new THREE.Vector3(tr.up[i * 3], tr.up[i * 3 + 1], tr.up[i * 3 + 2]);
  const T = (i) => new THREE.Vector3(tr.tan[i * 3], tr.tan[i * 3 + 1], tr.tan[i * 3 + 2]);
  const side = (i) => new THREE.Vector3().crossVectors(U(i), T(i)).normalize();
  const paint = (i) => [tr.rgb[i * 3], tr.rgb[i * 3 + 1], tr.rgb[i * 3 + 2]];
  const frame = (i) => new THREE.Matrix4().makeBasis(side(i), U(i), T(i));

  // Steel track: two rails and a round spine, painted in his crayon colors.
  const steel = shiny('#ffffff', { vertexColors: true });
  const railPaint = (i) => paint(i).map((v) => v * 0.8 + 0.2);
  for (const s of [-1, 1]) {
    const rail = tube(all, (i) => P(i).addScaledVector(side(i), s * RAIL_GAP), U, side, 0.1, { sides: 10, colorAt: railPaint });
    g.add(new THREE.Mesh(rail, steel));
  }
  g.add(new THREE.Mesh(tube(all, (i) => P(i).addScaledVector(U(i), -SPINE_DROP), U, side, 0.26, { sides: 12, colorAt: paint }), steel));

  // Cross-ties every meter: a crossbar under the rails, braced down to the spine.
  const m = new THREE.Matrix4();
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const tieIds = all.filter((i) => i % 2 === 0);
  const bars = new THREE.InstancedMesh(unitBox, shiny('#ffffff'), tieIds.length);
  const braces = new THREE.InstancedMesh(unitCyl, shiny('#ffffff'), tieIds.length * 2);
  const col = new THREE.Color();
  tieIds.forEach((i, k) => {
    const u = U(i);
    const sd = side(i);
    const p = P(i);
    col.fromArray(paint(i).map((v) => v * 0.72));
    m.makeBasis(sd, u, T(i)).scale(new THREE.Vector3(1.45, 0.1, 0.16)).setPosition(p.clone().addScaledVector(u, -0.15));
    bars.setMatrixAt(k, m);
    bars.setColorAt(k, col);
    const spine = p.clone().addScaledVector(u, -SPINE_DROP);
    [-1, 1].forEach((s, j) => {
      braces.setMatrixAt(k * 2 + j, beam(m, spine, p.clone().addScaledVector(sd, s * RAIL_GAP).addScaledVector(u, -0.15), 0.055));
      braces.setColorAt(k * 2 + j, col);
    });
  });
  g.add(bars, braces);

  // Lift chain up the middle of every climb.
  const liftIds = all.filter((i) => tr.lift[i]);
  if (liftIds.length) {
    const links = new THREE.InstancedMesh(unitBox, shiny('#3a3a3a', { shininess: 30 }), liftIds.length * 2);
    liftIds.forEach((i, k) => {
      for (const j of [0, 1]) {
        const at = P(i).addScaledVector(U(i), -0.05).addScaledVector(T(i), j * 0.25 - 0.12);
        const w = j ? 0.07 : 0.12;
        m.makeBasis(side(i), U(i), T(i)).scale(new THREE.Vector3(w, 0.06, 0.2)).setPosition(at);
        links.setMatrixAt(k * 2 + j, m);
      }
    });
    g.add(links);
  }

  // Supports: concrete footing, steel column(s), and a saddle under the spine.
  // Tall ones are A-frames with cross braces (their legs were checked against the track).
  const columns = [];
  const footings = [];
  const saddles = [];
  for (const sp of supportSpots(tr)) {
    const top = new THREE.Vector3(sp.x, sp.y - 0.3, sp.z);
    if (sp.spread > 0) {
      const legs = supportLegs(sp).map(([a, b]) => [new THREE.Vector3(b.x, 0.4, b.z), new THREE.Vector3(a.x, a.y - 0.3, a.z)]);
      for (const [bottom, legTop] of legs) {
        columns.push([bottom, legTop, 0.2]);
        footings.push(bottom);
      }
      for (let y = 6; y < sp.y - 3; y += Math.max(7, sp.y / 8)) {
        const f = y / (sp.y - 0.3);
        const [l, r] = legs.map(([b, t]) => b.clone().lerp(t, f));
        columns.push([l, r, 0.11]);
      }
    } else {
      const bottom = new THREE.Vector3(sp.x, 0.4, sp.z);
      columns.push([bottom, top, 0.26]);
      footings.push(bottom);
    }
    saddles.push([top, sp.dir, sp.spread > 0 ? 1.1 : 0.8]);
  }
  if (columns.length) {
    const steelGrey = shiny('#e3e8ef');
    const cols = new THREE.InstancedMesh(unitCyl, steelGrey, columns.length);
    columns.forEach(([a, b, r], k) => cols.setMatrixAt(k, beam(m, a, b, r)));
    const feet = new THREE.InstancedMesh(unitBox, mat('#c4c4c4'), footings.length);
    footings.forEach((f, k) => feet.setMatrixAt(k, m.makeScale(1.3, 0.8, 1.3).setPosition(f.x, 0.3, f.z)));
    const caps = new THREE.InstancedMesh(unitBox, steelGrey, saddles.length);
    saddles.forEach(([t, dir, w], k) => {
      const across = new THREE.Vector3(dir.x, 0, dir.z);
      const along = new THREE.Vector3().crossVectors(across, Y_AXIS);
      m.makeBasis(across, Y_AXIS, along).scale(new THREE.Vector3(w, 0.3, 0.5)).setPosition(t);
      caps.setMatrixAt(k, m);
    });
    g.add(cols, feet, caps);
  }

  // Station: platform and a bright roof high enough to see out from under.
  const st = new THREE.Group();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 4), mat('#d9a066'));
  platform.position.set(4.5, 0.6, -3.5);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 8), new THREE.MeshBasicMaterial({ color: '#ff8c42' }));
  roof.position.set(4.5, 10, 0);
  st.add(platform, roof);
  for (const [x, z] of [[0, -3.2], [9, -3.2], [0, 3.2], [9, 3.2]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 8), mat('#8a5a3c'));
    post.position.set(x, 5, z);
    st.add(post);
  }
  g.add(st);

  // Splash pond in the deepest dip after a big drop.
  const splash = splashSpot(tr);
  let pondAt = null;
  if (splash !== null) {
    pondAt = P(splash);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(11, 40), mat('#e9d8a6'));
    const water = new THREE.Mesh(new THREE.CircleGeometry(9.5, 40), mat('#3a9bdc', { emissive: '#0b3d66' }));
    sand.rotation.x = water.rotation.x = -Math.PI / 2;
    sand.position.set(pondAt.x, 0.04, pondAt.z);
    water.position.set(pondAt.x, 0.08, pondAt.z);
    g.add(sand, water);
  }

  // Tunnels where the track skims the ground: a grassy mound outside, dark inside, stone arches.
  const tunnels = tunnelRuns(tr, splash);
  const inside = mat('#3a2a20', { side: THREE.BackSide });
  const outside = mat('#4bb33f');
  const stone = mat('#9a9a9a');
  for (const [a, b] of tunnels) {
    const ids = all.slice(a, b + 1);
    const center = (i) => P(i).addScaledVector(U(i), 0.3);
    g.add(new THREE.Mesh(tube(ids, center, U, side, 3.4, { sides: 16, arc: 1.95, toGround: true }), inside));
    g.add(new THREE.Mesh(tube(ids, center, U, side, 3.8, { sides: 16, arc: 1.95, toGround: true }), outside));
    for (const i of [a, b]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.45, 8, 20, Math.PI), stone);
      arch.applyMatrix4(frame(i).setPosition(center(i)));
      g.add(arch);
    }
  }

  // Stars to fly through, right at seat height.
  const starGeo = makeStarGeometry();
  const gold = mat('#ffd23f', { emissive: '#b07800' });
  const stars = starSpots(tr).map((i) => {
    const holder = new THREE.Group();
    holder.applyMatrix4(frame(i).setPosition(P(i).addScaledVector(U(i), eye)));
    const spin = new THREE.Mesh(starGeo, gold);
    holder.add(spin);
    g.add(holder);
    return { holder, spin, s: i * tr.step, at: P(i).addScaledVector(U(i), eye) };
  });

  // Trees and flowers sprinkled around, keeping clear of the track and pond.
  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(tr.pos, 3));
  const rand = mulberry32(Math.round(tr.length * 13));
  const spots = [];
  for (let k = 0; spots.length < 160 && k < 3000; k++) {
    const x = box.min.x - 120 + rand() * (box.max.x - box.min.x + 240);
    const z = box.min.z - 120 + rand() * (box.max.z - box.min.z + 240);
    let ok = !(x > -6 && x < 15 && Math.abs(z) < 8);
    if (pondAt && Math.hypot(pondAt.x - x, pondAt.z - z) < 14) ok = false;
    for (let i = 0; ok && i < n; i += 4) {
      if (Math.hypot(tr.pos[i * 3] - x, tr.pos[i * 3 + 2] - z) < 7) ok = false;
    }
    if (ok) spots.push([x, z, 0.7 + rand() * 0.9]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.6, 3, 6), mat('#8a5a3c'), spots.length);
  const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 6, 8), mat('#ffffff'), spots.length);
  const greens = ['#2e8b57', '#3cb371', '#228b22', '#56c271'].map((c) => new THREE.Color(c));
  spots.forEach(([x, z, s], k) => {
    m.makeScale(s, s, s).setPosition(x, 1.5 * s, z);
    trunks.setMatrixAt(k, m);
    m.makeScale(s, s, s).setPosition(x, 5.5 * s, z);
    tops.setMatrixAt(k, m);
    tops.setColorAt(k, greens[k % greens.length]);
  });
  g.add(trunks, tops);

  return { group: g, stars, splash, tunnels };
}

function makeStarGeometry() {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.26 : 0.6;
    const a = Math.PI / 2 + (k / 10) * Math.PI * 2;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  geo.center();
  return geo;
}

// A tube following a centerline, using the track's own frames so it twists with loops.
// arc: only build the top part of the ring (+-arc radians from "up"); toGround: drop both
// edges straight down to the grass, for tunnel walls. colorAt: per-sample vertex colors.
function tube(ids, center, up, side, radius, { sides = 8, arc = null, toGround = false, colorAt = null } = {}) {
  const ring = arc === null ? sides : sides + 1 + (toGround ? 2 : 0);
  const n = ids.length;
  const verts = new Float32Array(n * ring * 3);
  const normals = new Float32Array(n * ring * 3);
  const colors = colorAt ? new Float32Array(n * ring * 3) : null;
  ids.forEach((id, i) => {
    const c = center(id);
    const u = up(id);
    const s = side(id);
    const rgb = colorAt?.(id);
    for (let k = 0; k < ring; k++) {
      let kk = k;
      let ground = false;
      if (arc !== null && toGround) {
        ground = k === 0 || k === ring - 1;
        kk = Math.min(Math.max(k - 1, 0), sides);
      }
      const a = arc === null ? (kk / sides) * Math.PI * 2 : -arc + (kk / sides) * 2 * arc;
      const nx = u.x * Math.cos(a) + s.x * Math.sin(a);
      const ny = u.y * Math.cos(a) + s.y * Math.sin(a);
      const nz = u.z * Math.cos(a) + s.z * Math.sin(a);
      const o = (i * ring + k) * 3;
      verts.set([c.x + nx * radius, ground ? -0.2 : c.y + ny * radius, c.z + nz * radius], o);
      normals.set([nx, ny, nz], o);
      if (colors) colors.set(rgb, o);
    }
  });
  const index = [];
  const wrap = arc === null;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < (wrap ? ring : ring - 1); k++) {
      const a = i * ring + k;
      const b = i * ring + ((k + 1) % ring);
      const c = a + ring;
      const d = b + ring;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  return geo;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => m.dispose());
  });
}

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Outer space, for very tall coasters: stars that fade in with height, plus planets far away.
// The planets use fog, so they stay hidden in the blue until the fog thins out up high.
export function makeSpace() {
  const g = new THREE.Group();
  const rand = mulberry32(42);
  const count = 900;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand() * 1.1 - 0.1, rand() * 2 - 1).normalize().multiplyScalar(1400);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: '#ffffff', size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }),
  );
  stars.frustumCulled = false;
  g.add(stars);

  const saturn = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 20), mat('#e8c27a', { emissive: '#4a3a1a' }));
  saturn.position.set(900, 650, -900);
  const ring = new THREE.Mesh(new THREE.RingGeometry(100, 160, 64), mat('#d9b77a', { side: THREE.DoubleSide, emissive: '#3a2e14' }));
  ring.position.copy(saturn.position);
  ring.rotation.set(-1.2, 0.3, 0);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(45, 28, 18), mat('#e9e9ee', { emissive: '#444450' }));
  moon.position.set(-500, 520, -700);
  const mars = new THREE.Mesh(new THREE.SphereGeometry(32, 24, 16), mat('#d9623b', { emissive: '#4a1a0a' }));
  mars.position.set(300, 900, 800);
  g.add(saturn, ring, moon, mars);

  const planets = [
    [saturn, [700, 520, -500]],
    [ring, [700, 520, -500]],
    [moon, [420, 680, 420]],
    [mars, [1000, 860, 120]],
  ];
  return {
    group: g,
    // Hang the planets ahead of the coaster and up high, where he'll see them on the climb.
    place(centerX) {
      for (const [mesh, [x, y, z]] of planets) mesh.position.set(centerX + x, y, z);
    },
    update(cameraPos, t) {
      stars.position.copy(cameraPos);
      stars.material.opacity = t;
    },
  };
}
