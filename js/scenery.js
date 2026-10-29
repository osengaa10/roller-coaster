// The 3D world: sky, ground, trees, and everything built from a drawn track.
import * as THREE from 'three';
import { supportSpots, supportLegs, starSpots, splashSpot, tunnelRuns } from './track.js';
import { makeClouds, makeMountains, makeLandscape, getGrassTexture, merge } from './nature.js';
import { concreteTexture, plankTexture, gratingTexture, stoneTexture, glowTexture } from './textures.js';
import { makeWater } from './water.js';

export const RAIL_GAP = 0.6; // half distance between rails
const SPINE_DROP = 0.6; // spine center below the rails
const HIGH = 300; // meters: above this, track geometry is built with less detail
const CATWALK = 1.4; // meters from the middle of the track to the catwalk's inner edge

// Fresh (uncached) materials, so a track's world can be disposed in one go.
export const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
// Painted steel: picks up a highlight from the sun and reflects the sky. Old Phong-style
// shininess (0..150) still works and turns into roughness.
export const shiny = (color, { shininess = 70, specular, ...extra } = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: Math.max(0.12, 1 - shininess / 110), ...extra });

// Who casts and who catches the sun's shadows. Everything solid casts, except see-through
// things, giant things (the ground, the sea) and anything marked userData.noShadow; everything
// catches them except the marked ones.
export function shadowFlags(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.noShadow) {
      o.castShadow = o.receiveShadow = false;
      return;
    }
    const material = [].concat(o.material)[0];
    let r;
    if (o.isInstancedMesh) {
      o.computeBoundingSphere();
      r = o.boundingSphere.radius;
    } else {
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      r = o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z);
    }
    o.receiveShadow = !material.isShaderMaterial;
    o.castShadow = !material.transparent && !material.isShaderMaterial && !o.userData.noCast && r < 400;
  });
}

export const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Matrix for a unit cylinder (radius 1, height 1, centered) stretched from a to b.
export function beam(m, a, b, r) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.divideScalar(len || 1));
  return m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
}

// Scenery that doesn't depend on the drawing: clouds and the mountains on the horizon.
export function makeStaticWorld() {
  const g = new THREE.Group();
  g.add(makeClouds(), makeMountains());
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
  // Way up high nobody looks closely, so giant space coasters get fewer pieces there.
  const high = (i) => tr.pos[i * 3 + 1] > HIGH;
  const geoIds = all.filter((i) => !high(i) || i % 3 === 0 || i === n - 1);
  // Over a jump there's no track at all: it stops at the kicker ramp and starts again where he lands.
  const pieces = [[]];
  for (const i of geoIds) {
    if (tr.air[i]) {
      if (pieces[pieces.length - 1].length) pieces.push([]);
    } else pieces[pieces.length - 1].push(i);
  }
  for (const ids of pieces.filter((p) => p.length > 1)) {
    for (const s of [-1, 1]) {
      const rail = tube(ids, (i) => P(i).addScaledVector(side(i), s * RAIL_GAP), U, side, 0.1, { sides: 12, colorAt: railPaint });
      g.add(new THREE.Mesh(rail, steel));
    }
    g.add(new THREE.Mesh(tube(ids, (i) => P(i).addScaledVector(U(i), -SPINE_DROP), U, side, 0.26, { sides: 16, colorAt: paint }), steel));
  }
  const updates = [];

  // Cross-ties every meter: a crossbar between the rails with a clamp on each rail and a plate
  // down to the spine, braced down to the spine.
  const m = new THREE.Matrix4();
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const tieIds = all.filter((i) => i % 2 === 0 && (!high(i) || i % 8 === 0) && !tr.air[i]);
  const bars = new THREE.InstancedMesh(tieGeometry(), shiny('#ffffff'), tieIds.length);
  const braces = new THREE.InstancedMesh(unitCyl, shiny('#ffffff'), tieIds.length * 2);
  const col = new THREE.Color();
  tieIds.forEach((i, k) => {
    const u = U(i);
    const sd = side(i);
    const p = P(i);
    col.fromArray(paint(i).map((v) => v * 0.72));
    m.makeBasis(sd, u, T(i)).setPosition(p);
    bars.setMatrixAt(k, m);
    bars.setColorAt(k, col);
    const spine = p.clone().addScaledVector(u, -SPINE_DROP);
    [-1, 1].forEach((s, j) => {
      braces.setMatrixAt(k * 2 + j, beam(m, spine, p.clone().addScaledVector(sd, s * (RAIL_GAP - 0.17)).addScaledVector(u, -0.15), 0.055));
      braces.setColorAt(k * 2 + j, col);
    });
  });
  g.add(bars, braces);

  // Jumps: a kicker ramp up to the lip and a landing pad, both decked in yellow and black stripes
  // under the rails, with a padded red bumper on each side of the landing.
  const deckIds = [];
  const bumpers = [];
  for (const j of tr.jumps) {
    for (let i = Math.max(0, j.takeoff - Math.round(4 / tr.step)); i <= j.lip; i++) deckIds.push(i);
    for (let i = j.land; i <= Math.min(n - 1, j.land + Math.round(5 / tr.step)); i++) deckIds.push(i);
    for (const s of [-1, 1]) bumpers.push([Math.min(n - 1, j.land + Math.round(1.5 / tr.step)), s]);
  }
  if (deckIds.length) {
    const deck = new THREE.InstancedMesh(unitBox, shiny('#ffffff', { shininess: 30 }), deckIds.length);
    const stripe = [new THREE.Color('#ffd23f'), new THREE.Color('#3d3d45')];
    deckIds.forEach((i, k) => {
      m.makeBasis(side(i), U(i), T(i)).scale(new THREE.Vector3(2.2, 0.12, tr.step * 1.05)).setPosition(P(i).addScaledVector(U(i), -0.28));
      deck.setMatrixAt(k, m);
      deck.setColorAt(k, stripe[Math.floor((i * tr.step) / 0.9) % 2]);
    });
    g.add(deck);
    const pads = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.35, 2.2, 4, 10), shiny('#ff4d6d', { shininess: 50 }), bumpers.length);
    bumpers.forEach(([i, s], k) => {
      m.makeBasis(side(i), U(i), T(i)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).setPosition(P(i).addScaledVector(side(i), s * 1.5).addScaledVector(U(i), 0.1));
      pads.setMatrixAt(k, m);
    });
    g.add(pads);
  }

  // Rocket boosters where he put a rocket sticker: glowing fins between the rails, every meter,
  // with dark plates under them.
  const boostIds = all.filter((i) => tr.launches.some(([a, b]) => i >= a && i <= b) && i % 2 === 0);
  if (boostIds.length) {
    const fins = new THREE.InstancedMesh(unitBox, new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#ff6a00', emissiveIntensity: 1.4, roughness: 0.4 }), boostIds.length);
    const plates = new THREE.InstancedMesh(unitBox, shiny('#3d3d45', { shininess: 40 }), boostIds.length);
    boostIds.forEach((i, k) => {
      m.makeBasis(side(i), U(i), T(i)).scale(new THREE.Vector3(0.08, 0.32, 0.7)).setPosition(P(i).addScaledVector(U(i), -0.02));
      fins.setMatrixAt(k, m);
      m.makeBasis(side(i), U(i), T(i)).scale(new THREE.Vector3(0.8, 0.06, 0.85)).setPosition(P(i).addScaledVector(U(i), -0.2));
      plates.setMatrixAt(k, m);
    });
    fins.userData.noShadow = true;
    g.add(fins, plates);
  }

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
    // Anti-rollback teeth beside the chain (the clack-clack-clack).
    const teeth = new THREE.InstancedMesh(unitBox, shiny('#8a9099', { shininess: 40 }), liftIds.length);
    liftIds.forEach((i, k) => {
      const at = P(i).addScaledVector(U(i), -0.1).addScaledVector(side(i), 0.24);
      m.makeBasis(side(i), U(i), T(i)).multiply(new THREE.Matrix4().makeRotationX(0.35)).scale(new THREE.Vector3(0.06, 0.06, 0.26)).setPosition(at);
      teeth.setMatrixAt(k, m);
    });
    g.add(teeth);
    // A maintenance catwalk up the climbs on one side: steel grating, posts and a handrail.
    const runsOf = (ids) => {
      const out = [];
      for (const i of ids) {
        const last = out[out.length - 1];
        if (last && i - last[last.length - 1] <= 1) last.push(i);
        else out.push([i]);
      }
      return out.filter((r) => r.length > 4).map((r) => r.filter((i, k) => !high(i) || i % 3 === 0 || k === r.length - 1));
    };
    const walk = new THREE.MeshStandardMaterial({ color: '#c3cad2', map: gratingTexture(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });
    const railMat = shiny('#d9dee4');
    const posts = [];
    for (const ids of runsOf(liftIds)) {
      const edge = (i, d) => P(i).addScaledVector(U(i), -0.55).addScaledVector(side(i), CATWALK + d);
      g.add(new THREE.Mesh(ribbon(ids, (i) => edge(i, 0), (i) => edge(i, 0.75), (i) => (i * tr.step) / 0.75), walk));
      g.add(new THREE.Mesh(tube(ids, (i) => edge(i, 0.75).addScaledVector(U(i), 1.0), U, side, 0.035, { sides: 6 }), railMat));
      g.add(new THREE.Mesh(tube(ids, (i) => edge(i, 0.75).addScaledVector(U(i), 0.5), U, side, 0.025, { sides: 5 }), railMat));
      for (let k = 0; k < ids.length; k += 4) posts.push(ids[k]);
    }
    if (posts.length) {
      const postMesh = new THREE.InstancedMesh(unitCyl, railMat, posts.length);
      posts.forEach((i, k) => {
        const foot = P(i).addScaledVector(U(i), -0.55).addScaledVector(side(i), CATWALK + 0.75);
        postMesh.setMatrixAt(k, beam(m, foot, foot.clone().addScaledVector(U(i), 1.0), 0.03));
      });
      g.add(postMesh);
    }
  }

  // Brake fins along the last stretch, where the train slows back into the station.
  const finIds = all.filter((i) => i > n - 40 && i % 2 === 0 && !high(i));
  if (finIds.length) {
    const fins = new THREE.InstancedMesh(unitBox, shiny('#c9824a', { shininess: 60 }), finIds.length);
    finIds.forEach((i, k) => {
      m.makeBasis(side(i), U(i), T(i)).scale(new THREE.Vector3(0.03, 0.22, 0.85)).setPosition(P(i).addScaledVector(U(i), -0.3));
      fins.setMatrixAt(k, m);
    });
    g.add(fins);
  }

  // Supports: concrete footing, steel column(s) with bolted flanges, and a saddle under the spine.
  // Tall ones are A-frames with cross braces and X-bracing (their legs were checked against the track).
  const columns = [];
  const footings = [];
  const saddles = [];
  for (const sp of supportSpots(tr)) {
    const top = new THREE.Vector3(sp.x, sp.y - 0.3, sp.z);
    if (sp.spread > 0) {
      const legs = supportLegs(sp).map(([a, b]) => [new THREE.Vector3(b.x, 0.4, b.z), new THREE.Vector3(a.x, a.y - 0.3, a.z)]);
      for (const [bottom, legTop] of legs) {
        columns.push([bottom, legTop, 0.2, true]);
        footings.push(bottom);
      }
      const levels = [];
      for (let y = 6; y < sp.y - 3; y += Math.max(7, sp.y / 8)) {
        const f = y / (sp.y - 0.3);
        const [l, r] = legs.map(([b, t]) => b.clone().lerp(t, f));
        columns.push([l, r, 0.11]);
        levels.push([l, r]);
      }
      for (let k = 1; k < levels.length; k++) {
        columns.push([levels[k - 1][0], levels[k][1], 0.07]);
        columns.push([levels[k - 1][1], levels[k][0], 0.07]);
      }
    } else {
      const bottom = new THREE.Vector3(sp.x, 0.4, sp.z);
      columns.push([bottom, top, 0.26, true]);
      footings.push(bottom);
    }
    saddles.push([top, sp.dir, sp.spread > 0 ? 1.1 : 0.8]);
  }
  if (columns.length) {
    const steelGrey = shiny('#e3e8ef');
    const cols = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 12), steelGrey, columns.length);
    columns.forEach(([a, b, r], k) => cols.setMatrixAt(k, beam(m, a, b, r)));
    // Bolted flanges where the column sections join, every 8 m.
    const flanges = [];
    for (const [a, b, r, main] of columns) {
      if (!main) continue;
      const len = a.distanceTo(b);
      for (let d = 8; d < len - 2; d += 8) flanges.push([a.clone().lerp(b, d / len), b.clone().sub(a).normalize(), r]);
    }
    const flangeMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14), steelGrey, Math.max(1, flanges.length));
    flangeMesh.count = flanges.length;
    flanges.forEach(([at, dir, r], k) => flangeMesh.setMatrixAt(k, beam(m, at.clone().addScaledVector(dir, -0.05), at.clone().addScaledVector(dir, 0.05), r * 1.55)));
    const feet = new THREE.InstancedMesh(footingGeometry(), new THREE.MeshStandardMaterial({ color: '#d4d2cc', map: concreteTexture(), roughness: 0.9 }), footings.length);
    footings.forEach((f, k) => feet.setMatrixAt(k, m.makeTranslation(f.x, 0, f.z)));
    // Darker ground where each footing sits.
    const dirt = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#2b2416', transparent: true, opacity: 0.28, depthWrite: false }),
      footings.length,
    );
    footings.forEach((f, k) => dirt.setMatrixAt(k, m.makeScale(1.6, 1, 1.6).setPosition(f.x, 0.05, f.z)));
    const caps = new THREE.InstancedMesh(unitBox, steelGrey, saddles.length);
    saddles.forEach(([t, dir, w], k) => {
      const across = new THREE.Vector3(dir.x, 0, dir.z);
      const along = new THREE.Vector3().crossVectors(across, Y_AXIS);
      m.makeBasis(across, Y_AXIS, along).scale(new THREE.Vector3(w, 0.3, 0.5)).setPosition(t);
      caps.setMatrixAt(k, m);
    });
    g.add(cols, flangeMesh, feet, dirt, caps);
  }

  // Station: a wooden platform with a yellow safety edge, an airgate fence and queue rails, under
  // a gabled roof on trusses (high enough to see out from under), with lights and a star sign.
  const st = new THREE.Group();
  const planks = plankTexture().clone();
  planks.needsUpdate = true;
  planks.repeat.set(3, 1.2);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 4), [
    mat('#b7865a'),
    mat('#b7865a'),
    new THREE.MeshLambertMaterial({ color: '#e0b98a', map: planks }),
    mat('#b7865a'),
    mat('#b7865a'),
    mat('#b7865a'),
  ]);
  platform.position.set(4.5, 0.6, -3.5);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(10, 0.03, 0.3), mat('#ffd23f'));
  edge.position.set(4.5, 1.215, -1.68);
  st.add(platform, edge);
  const chrome = shiny('#e8edf2', { shininess: 100, metalness: 0.9 });
  const fence = [];
  // Airgates: short rails with gaps for each car, then the queue rail along the back.
  for (const [x0, x1] of [[-0.3, 1.6], [2.4, 4.3], [5.1, 7.0], [7.8, 9.3]]) {
    fence.push([[x0, 2.2, -2.4], [x1, 2.2, -2.4], 0.04], [[x0, 1.7, -2.4], [x1, 1.7, -2.4], 0.03]);
    for (const x of [x0, x1]) fence.push([[x, 1.2, -2.4], [x, 2.2, -2.4], 0.04]);
  }
  fence.push([[-0.3, 2.2, -5.2], [9.3, 2.2, -5.2], 0.04], [[-0.3, 1.7, -5.2], [9.3, 1.7, -5.2], 0.03]);
  for (let x = -0.3; x <= 9.4; x += 1.94) fence.push([[x, 1.2, -5.2], [x, 2.2, -5.2], 0.04]);
  const fenceMesh = new THREE.InstancedMesh(unitCyl, chrome, fence.length);
  fence.forEach(([a, b, r], k) => fenceMesh.setMatrixAt(k, beam(m, new THREE.Vector3(...a), new THREE.Vector3(...b), r)));
  st.add(fenceMesh);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#ff8c42', emissive: '#5a2400', roughness: 0.7 });
  for (const s2 of [-1, 1]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.25, 4.6), roofMat);
    half.rotation.x = s2 * 0.32;
    half.position.set(4.5, 10.75, s2 * 2.1);
    st.add(half);
  }
  const ridgeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 11.6, 10).rotateZ(Math.PI / 2), mat('#ffd23f'));
  ridgeCap.position.set(4.5, 11.45, 0);
  st.add(ridgeCap);
  const truss = [];
  for (const x of [0, 3, 6, 9]) {
    truss.push([[x, 10, -3.6], [x, 10, 3.6], 0.08], [[x, 10, -3.6], [x, 11.2, 0], 0.06], [[x, 10, 3.6], [x, 11.2, 0], 0.06], [[x, 10, 0], [x, 11.2, 0], 0.05]);
  }
  truss.push([[0, 10, -3.6], [9, 10, -3.6], 0.08], [[0, 10, 3.6], [9, 10, 3.6], 0.08]);
  const trussMesh = new THREE.InstancedMesh(unitCyl, shiny('#f4f4f4'), truss.length);
  truss.forEach(([a, b, r], k) => trussMesh.setMatrixAt(k, beam(m, new THREE.Vector3(...a), new THREE.Vector3(...b), r)));
  st.add(trussMesh);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), 6);
  [1.5, 4.5, 7.5].forEach((x, k) => {
    lamps.setMatrixAt(k * 2, m.makeTranslation(x, 9.8, -1.8));
    lamps.setMatrixAt(k * 2 + 1, m.makeTranslation(x, 9.8, 1.8));
  });
  lamps.userData.noShadow = true;
  st.add(lamps);
  for (const [x, z] of [[0, -3.2], [9, -3.2], [0, 3.2], [9, 3.2]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 10, 12), mat('#8a5a3c'));
    post.position.set(x, 5, z);
    st.add(post);
  }
  const sign = new THREE.Mesh(makeStarGeometry(), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#6a4a00', metalness: 0.7, roughness: 0.3 }));
  sign.scale.setScalar(1.6);
  sign.position.set(4.5, 12.6, -2.6);
  st.add(sign);
  g.add(st);

  // Splash pond in the deepest dip after a big drop.
  const splash = splashSpot(tr);
  let pondAt = null;
  if (splash !== null) {
    pondAt = P(splash);
    const sand = new THREE.Mesh(new THREE.CircleGeometry(11, 40), mat('#e9d8a6'));
    const pondMat = makeWater({ color: '#3a8fd0', repeat: [4, 4], flow: [0.02, 0.015], strength: 0.5, emissive: '#082848' });
    updates.push((dt, time) => pondMat.userData.tick(time));
    const water = new THREE.Mesh(new THREE.CircleGeometry(9.5, 48), pondMat);
    sand.rotation.x = water.rotation.x = -Math.PI / 2;
    sand.position.set(pondAt.x, 0.04, pondAt.z);
    water.position.set(pondAt.x, 0.08, pondAt.z);
    g.add(sand, water);
    // Pebbles round the edge and clumps of reeds.
    const prand = mulberry32(splash * 13 + 5);
    const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), 46);
    const stoneTones = ['#9a958c', '#857f76', '#aaa398'].map((c) => new THREE.Color(c));
    for (let k = 0; k < 46; k++) {
      const a = (k / 46) * Math.PI * 2 + prand() * 0.1;
      const r = 9.4 + prand() * 0.9;
      const sc = 0.3 + prand() * 0.45;
      stones.setMatrixAt(k, m.compose(new THREE.Vector3(pondAt.x + Math.cos(a) * r, 0.05, pondAt.z + Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(Y_AXIS, prand() * 6), new THREE.Vector3(sc, sc * 0.55, sc)));
      stones.setColorAt(k, stoneTones[k % 3]);
    }
    const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.04, 1.6, 4).translate(0, 0.8, 0), mat('#5c8a3a'), 120);
    for (let k = 0; k < 120; k++) {
      const a = Math.floor(k / 20) * 1.1 + prand() * 0.25;
      const r = 8.6 + prand() * 0.8;
      const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler((prand() - 0.5) * 0.4, 0, (prand() - 0.5) * 0.4));
      reeds.setMatrixAt(k, m.compose(new THREE.Vector3(pondAt.x + Math.cos(a) * r, 0, pondAt.z + Math.sin(a) * r), lean, new THREE.Vector3(1, 0.7 + prand() * 0.6, 1)));
    }
    g.add(stones, reeds);
  }

  // Tunnels where the track skims the ground: a grassy mound outside, dark inside with a row of
  // little lights, and stone-block portals.
  const tunnels = tunnelRuns(tr, splash);
  const inside = mat('#3a2a20', { side: THREE.BackSide });
  const turf = getGrassTexture().clone();
  turf.needsUpdate = true;
  turf.repeat.set(4, 1);
  const outside = new THREE.MeshLambertMaterial({ color: '#cfe8b8', map: turf });
  const stoneMap = stoneTexture().clone();
  stoneMap.needsUpdate = true;
  stoneMap.repeat.set(6, 1);
  const stone = new THREE.MeshLambertMaterial({ color: '#ffffff', map: stoneMap });
  const tunnelLights = [];
  for (const [a, b] of tunnels) {
    const ids = all.slice(a, b + 1);
    const center = (i) => P(i).addScaledVector(U(i), 0.3);
    g.add(new THREE.Mesh(tube(ids, center, U, side, 3.4, { sides: 16, arc: 1.95, toGround: true }), inside));
    g.add(new THREE.Mesh(tube(ids, center, U, side, 3.8, { sides: 16, arc: 1.95, toGround: true, uv: (i) => (i * tr.step) / 6 }), outside));
    for (const i of [a, b]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.5, 8, 24, Math.PI), stone);
      arch.applyMatrix4(frame(i).setPosition(center(i)));
      g.add(arch);
    }
    for (let i = a + 3; i < b - 2; i += 6) tunnelLights.push(center(i).addScaledVector(U(i), 3.2));
  }
  if (tunnelLights.length) {
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe9a8' }), tunnelLights.length);
    tunnelLights.forEach((at, k) => lights.setMatrixAt(k, m.makeTranslation(at.x, at.y, at.z)));
    lights.userData.noShadow = true;
    g.add(lights);
  }

  // Stars to fly through, right at seat height.
  const starGeo = makeStarGeometry();
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#8a5a00', metalness: 0.8, roughness: 0.25 });
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffd84a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const stars = starSpots(tr).map((i, k) => {
    const holder = new THREE.Group();
    holder.applyMatrix4(frame(i).setPosition(P(i).addScaledVector(U(i), eye)));
    const spin = new THREE.Mesh(starGeo, gold);
    spin.userData.noShadow = true;
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(2.6);
    holder.add(spin, glow);
    updates.push((dt, time) => glow.scale.setScalar(2.4 + 0.4 * Math.sin(time * 4 + k)));
    g.add(holder);
    return { holder, spin, s: i * tr.step, at: P(i).addScaledVector(U(i), eye) };
  });

  // The landscape: grass, hills, trees and ground details, keeping clear of the track,
  // the station and the pond.
  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(tr.pos, 3));
  // Only track near the ground can bump into trees and bushes.
  const low = [];
  for (let i = 0; i < n; i += 4) if (tr.pos[i * 3 + 1] < 40) low.push(tr.pos[i * 3], tr.pos[i * 3 + 2]);
  const keepOut = (x, z, d) => {
    if (x > -8 && x < 16 && Math.abs(z) < 9) return true; // station
    if (pondAt && Math.hypot(pondAt.x - x, pondAt.z - z) < 12) return true;
    for (let k = 0; k < low.length; k += 2) if (Math.hypot(low[k] - x, low[k + 1] - z) < d) return true;
    return false;
  };
  // A spot on the ground beside the track: u picks how far along, d how far to the side.
  const nearTrack = (u, d, sgn) => {
    const i = Math.min(n - 1, Math.floor(u * n));
    const t = T(i);
    const flatLen = Math.hypot(t.x, t.z) || 1;
    return { x: tr.pos[i * 3] - (t.z / flatLen) * d * sgn, z: tr.pos[i * 3 + 2] + (t.x / flatLen) * d * sgn };
  };
  g.add(makeLandscape(box, keepOut, nearTrack));

  return {
    group: g,
    pickups: stars,
    splash,
    tunnels,
    update(dt, time) {
      for (const u of updates) u(dt, time);
    },
  };
}

// One cross-tie in the track's frame (x across, y up, origin between the rails): the crossbar,
// a clamp on the inner side of each rail (leaving the underside clear for the train's up-stop
// wheels) and a plate down to the spine.
function tieGeometry() {
  return merge([
    new THREE.BoxGeometry(0.9, 0.08, 0.14).translate(0, -0.15, 0),
    new THREE.BoxGeometry(0.12, 0.14, 0.2).translate(-RAIL_GAP + 0.1, -0.06, 0),
    new THREE.BoxGeometry(0.12, 0.14, 0.2).translate(RAIL_GAP - 0.1, -0.06, 0),
    new THREE.BoxGeometry(0.06, 0.24, 0.12).translate(0, -0.29, 0),
  ]);
}

// A concrete footing: a block with a chamfered top and four anchor bolts.
function footingGeometry() {
  const bolts = [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]].map(([x, z]) => new THREE.CylinderGeometry(0.05, 0.05, 0.2, 6).translate(x, 0.95, z));
  return merge([
    new THREE.BoxGeometry(1.4, 0.6, 1.4).translate(0, 0.3, 0),
    new THREE.CylinderGeometry(0.62, 0.98, 0.3, 4, 1).rotateY(Math.PI / 4).translate(0, 0.75, 0),
    ...bolts,
  ]);
}

// A flat strip between two edge lines (left(i), right(i)), facing up, with u across and
// v = along(i) for textures.
export function ribbon(ids, left, right, along) {
  const n = ids.length;
  const pos = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  ids.forEach((id, k) => {
    const a = left(id);
    const b = right(id);
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
    const v = along(id);
    uv.set([0, v, 1, v], k * 4);
  });
  const index = [];
  for (let k = 0; k < n - 1; k++) {
    const a = k * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
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
// uv: texture coordinates, u around the ring (0..1) and v along it (meters, from `along`).
export function tube(ids, center, up, side, radius, { sides = 8, arc = null, toGround = false, colorAt = null, uv = null } = {}) {
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
  if (uv) return uvTube(verts, normals, colors, n, ring, arc === null, ids.map(uv));
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

// Same tube, with texture coordinates (a closed ring gets one extra column so u runs 0..1).
function uvTube(verts, normals, colors, n, ring, wrap, along) {
  const cols = wrap ? ring + 1 : ring;
  const pos = new Float32Array(n * cols * 3);
  const nor = new Float32Array(n * cols * 3);
  const col = colors ? new Float32Array(n * cols * 3) : null;
  const uvs = new Float32Array(n * cols * 2);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < cols; k++) {
      const src = (i * ring + (k % ring)) * 3;
      const dst = (i * cols + k) * 3;
      pos.set(verts.subarray(src, src + 3), dst);
      nor.set(normals.subarray(src, src + 3), dst);
      if (col) col.set(colors.subarray(src, src + 3), dst);
      uvs.set([k / (cols - 1), along[i]], (i * cols + k) * 2);
    }
  }
  const index = [];
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = i * cols + k;
      const b = a + 1;
      index.push(a, a + cols, b, b, a + cols, b + cols);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
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

  // Planets only show up in space: they fade in with the stars.
  const faint = { transparent: true, opacity: 0, fog: false, depthWrite: false };
  const saturn = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 20), mat('#e8c27a', { emissive: '#4a3a1a', ...faint }));
  saturn.position.set(900, 650, -900);
  const ring = new THREE.Mesh(new THREE.RingGeometry(100, 160, 64), mat('#d9b77a', { side: THREE.DoubleSide, emissive: '#3a2e14', ...faint }));
  ring.position.copy(saturn.position);
  ring.rotation.set(-1.2, 0.3, 0);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(45, 28, 18), mat('#e9e9ee', { emissive: '#444450', ...faint }));
  moon.position.set(-500, 520, -700);
  const mars = new THREE.Mesh(new THREE.SphereGeometry(32, 24, 16), mat('#d9623b', { emissive: '#4a1a0a', ...faint }));
  mars.position.set(300, 900, 800);
  g.add(saturn, ring, moon, mars);

  // Planets hang in fixed directions in the sky (ahead of the coaster and up high), moving with
  // the camera like the stars do, so they're there no matter how high he goes.
  const planets = [
    [saturn, new THREE.Vector3(0.6, 0.55, -0.55)],
    [ring, new THREE.Vector3(0.6, 0.55, -0.55)],
    [moon, new THREE.Vector3(0.35, 0.75, 0.55)],
    [mars, new THREE.Vector3(0.85, 0.5, 0.15)],
  ].map(([mesh, dir]) => [mesh, dir.normalize().multiplyScalar(1500)]);
  return {
    group: g,
    place() {},
    update(cameraPos, t) {
      stars.position.copy(cameraPos);
      stars.material.opacity = t;
      for (const [mesh, offset] of planets) {
        mesh.position.copy(cameraPos).add(offset);
        mesh.material.opacity = t;
        mesh.visible = t > 0.01;
      }
    },
  };
}
