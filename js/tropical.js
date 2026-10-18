// The water park's world: a sandy tropical island in a turquoise lagoon, with jungle hills,
// palm trees, beach things, other islands (one is a smoking volcano), sailboats and gulls.
// Built like nature.js: everything that repeats is instanced so it stays fast on an iPad.
import * as THREE from 'three';
import { EARTH_R, fbm, smoothstep, mulberry32, merge, makeClouds, makeEarth } from './nature.js';
import { makeWater } from './water.js';

export const SEA_LEVEL = -1.5;

// Scenery that doesn't depend on the drawing: just the clouds (the sea and islands sit around
// the drawn slide, so they're built with it).
export function makeBeachStaticWorld() {
  const g = new THREE.Group();
  g.add(makeClouds());
  return g;
}

// --- Textures -----------------------------------------------------------------------------

let sandTexture = null;
function getSandTexture() {
  if (sandTexture) return sandTexture;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f2';
  g.fillRect(0, 0, size, size);
  const rand = mulberry32(21);
  // Soft ripples, then grains. Near-white, so vertex colors decide sand vs. jungle.
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 15 + rand() * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() < 0.5 ? '200,200,190' : '255,255,255';
    grad.addColorStop(0, `rgba(${tone},0.4)`);
    grad.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grad;
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const v = 180 + rand() * 75;
    g.fillStyle = `rgba(${v},${v - 8},${v - 20},${0.25 + rand() * 0.5})`;
    g.fillRect(rand() * size, rand() * size, 1 + rand(), 1 + rand());
  }
  sandTexture = new THREE.CanvasTexture(c);
  sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping;
  sandTexture.colorSpace = THREE.SRGBColorSpace;
  sandTexture.anisotropy = 8;
  return sandTexture;
}

// Bright wavy highlights on the sea; scrolled every frame so the water moves.
let waveTexture = null;
export function getWaveTexture() {
  if (waveTexture) return waveTexture;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#d8eef8';
  g.fillRect(0, 0, size, size);
  const rand = mulberry32(5);
  g.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 18;
    g.strokeStyle = `rgba(255,255,255,${0.4 + rand() * 0.5})`;
    g.lineWidth = 1 + rand() * 2;
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath();
      g.moveTo(x + dx, y + dy);
      g.quadraticCurveTo(x + dx + len / 2, y + dy - 3, x + dx + len, y + dy);
      g.stroke();
    }
  }
  waveTexture = new THREE.CanvasTexture(c);
  waveTexture.wrapS = waveTexture.wrapT = THREE.RepeatWrapping;
  waveTexture.colorSpace = THREE.SRGBColorSpace;
  return waveTexture;
}

// --- Shapes ---------------------------------------------------------------------------------

// A palm trunk leaning over in a gentle curve, with rings, plus where its top ends up.
const PALM_LEAN = 1.6;
function palmTrunk() {
  const parts = [];
  const segs = 7;
  let x = 0;
  let y = 0;
  for (let k = 0; k < segs; k++) {
    const a = (k / segs) * 0.35; // leans more toward the top
    const len = 1.15;
    const seg = new THREE.CylinderGeometry(0.2 - k * 0.012, 0.26 - k * 0.012, len, 7);
    seg.rotateZ(-a);
    seg.translate(x + Math.sin(a) * len * 0.5, y + Math.cos(a) * len * 0.5, 0);
    parts.push(seg);
    x += Math.sin(a) * len;
    y += Math.cos(a) * len;
  }
  return { geo: merge(parts), top: new THREE.Vector3(x, y, 0) };
}
const TRUNK = palmTrunk();

// Fronds: long drooping leaves fanned out around the top of the trunk.
function palmFronds() {
  const leaves = [];
  const n = 8;
  for (let f = 0; f < n; f++) {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    const steps = 8;
    const L = 3.4;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const p = (t) => [t * L, 0.5 * t - 1.9 * t * t, 0];
      const w = (t) => Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.55;
      const [a, b] = [p(t0), p(t1)];
      const [wa, wb] = [w(t0), w(t1)];
      pos.push(a[0], a[1], -wa, b[0], b[1], -wb, b[0], b[1] + 0.05, wb, a[0], a[1], -wa, b[0], b[1] + 0.05, wb, a[0], a[1] + 0.05, wa);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    geo.rotateZ(0.15 * Math.sin(f * 2.3));
    geo.rotateY((f / n) * Math.PI * 2 + 0.3 * Math.sin(f));
    leaves.push(geo);
  }
  const fronds = merge(leaves);
  fronds.translate(TRUNK.top.x, TRUNK.top.y, TRUNK.top.z);
  return fronds;
}

function coconuts() {
  const nuts = [[0.2, -0.25, 0.1], [-0.15, -0.3, 0.15], [0.05, -0.3, -0.2]].map(([x, y, z]) =>
    new THREE.SphereGeometry(0.2, 8, 6).translate(TRUNK.top.x + x, TRUNK.top.y + y, TRUNK.top.z + z),
  );
  return merge(nuts);
}

// An umbrella canopy split into alternating stripes: odd ones white, even ones get the color.
function umbrellaStripes() {
  const cone = new THREE.ConeGeometry(1.7, 0.7, 12, 1, true).toNonIndexed();
  cone.translate(0, 2.35, 0);
  const pos = cone.attributes.position;
  const nor = cone.attributes.normal;
  const pick = (odd) => {
    const p = [];
    const n = [];
    for (let t = 0; t < pos.count / 3; t++) {
      // Which wedge: by the angle of the triangle's middle.
      let cx = 0;
      let cz = 0;
      for (let k = 0; k < 3; k++) {
        cx += pos.getX(t * 3 + k);
        cz += pos.getZ(t * 3 + k);
      }
      const wedge = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 12) % 12;
      if (wedge % 2 !== odd) continue;
      for (let k = 0; k < 3; k++) {
        p.push(pos.getX(t * 3 + k), pos.getY(t * 3 + k), pos.getZ(t * 3 + k));
        n.push(nor.getX(t * 3 + k), nor.getY(t * 3 + k), nor.getZ(t * 3 + k));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    return g;
  };
  return [pick(0), pick(1)];
}

// A beach ball: six colored wedges from pole to pole.
function beachBallGeometry() {
  const geo = new THREE.SphereGeometry(0.35, 18, 10).toNonIndexed();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const palette = ['#ff4d6d', '#ffffff', '#ffd23f', '#ffffff', '#3a86ff', '#ffffff'].map((c) => new THREE.Color(c));
  for (let t = 0; t < pos.count / 3; t++) {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(t * 3 + k);
      cz += pos.getZ(t * 3 + k);
    }
    const c = palette[Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6];
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (t * 3 + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.translate(0, 0.35, 0);
  return geo;
}

function sandcastleGeometry() {
  const parts = [new THREE.BoxGeometry(1.4, 0.6, 1.4).translate(0, 0.3, 0)];
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    parts.push(new THREE.CylinderGeometry(0.25, 0.3, 0.9, 8).translate(x, 0.45, z));
    parts.push(new THREE.ConeGeometry(0.3, 0.4, 8).translate(x, 1.1, z));
  }
  parts.push(new THREE.CylinderGeometry(0.35, 0.4, 1.3, 8).translate(0, 0.65, 0));
  parts.push(new THREE.ConeGeometry(0.42, 0.6, 8).translate(0, 1.6, 0));
  return merge(parts);
}

function loungerGeometry() {
  const seat = new THREE.BoxGeometry(0.7, 0.12, 1.4).translate(0, 0.35, 0.2);
  const back = new THREE.BoxGeometry(0.7, 0.12, 0.8).rotateX(-0.9).translate(0, 0.62, -0.7);
  const legs = [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.4], [0.3, -0.4]].map(([x, z]) => new THREE.BoxGeometry(0.06, 0.35, 0.06).translate(x, 0.17, z));
  return merge([seat, back, ...legs]);
}

function starfishGeometry() {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.1 : 0.26;
    const a = (k / 10) * Math.PI * 2;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function sailboat(color) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 7), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  hull.position.y = 0.3;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.18, 7.05), new THREE.MeshLambertMaterial({ color }));
  stripe.position.y = 0.45;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 6), new THREE.MeshLambertMaterial({ color: '#8a5a3c' }));
  mast.position.set(0, 5, 0.5);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, 8);
  shape.lineTo(-4.5, 0);
  shape.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: '#fffdf5', side: THREE.DoubleSide }));
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0, 1.2, 0.6);
  const jibShape = new THREE.Shape();
  jibShape.moveTo(0, 0);
  jibShape.lineTo(0, 7);
  jibShape.lineTo(2.8, 0);
  jibShape.closePath();
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(jibShape), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  jib.rotation.y = Math.PI / 2;
  jib.position.set(0, 1.2, 0.8);
  g.add(hull, stripe, mast, sail, jib);
  return g;
}

function gull() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#555555' });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), white);
  body.scale.set(0.7, 0.6, 1.6);
  g.add(body);
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.45), white);
    wing.position.x = s * 0.7;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.35), new THREE.MeshLambertMaterial({ color: '#333333' }));
    tip.position.x = s * 1.3;
    pivot.add(wing, tip);
    g.add(pivot);
    return { pivot, s };
  });
  g.userData.wings = wings;
  return g;
}

// --- Landscape around a slide ---------------------------------------------------------------

// Sand where the slide is, jungle hills further out, then a beach down into the lagoon and the
// sea, with more islands around. keepOut(x, z, d) says where nothing may grow. Returns
// { group, update(dt, time) } for the moving bits (waves, boats, gulls, volcano smoke).
export function makeBeachLandscape(bounds, keepOut, nearTrack) {
  const g = new THREE.Group();
  const center = bounds.getCenter(new THREE.Vector3());
  const boxDist = (x, z) => Math.hypot(Math.max(bounds.min.x - x, 0, x - bounds.max.x), Math.max(bounds.min.z - z, 0, z - bounds.max.z));
  const level = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2 + 600;
  const curve = (x, z) => Math.max(0, Math.hypot(x - center.x, z - center.z) - level) ** 2 / (2 * EARTH_R);
  const rand = mulberry32(Math.round(center.x * 5 + center.z * 3) + 17);

  // Where the beach meets the water, a wobbly line about 330 m out from the slide.
  const shoreAt = (x, z) => 330 + (fbm(x / 300 + 4, z / 300 + 8) - 0.5) * 220;
  // Other islands, out in the sea. The first one is the volcano.
  const islands = [];
  for (let k = 0; k < 9 && islands.length < 6; k++) {
    const a = rand() * Math.PI * 2;
    const r = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2 + 900 + rand() * 900;
    const isl = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r, r: 130 + rand() * 170, h: 25 + rand() * 50 };
    if (islands.every((o) => Math.hypot(o.x - isl.x, o.z - isl.z) > o.r + isl.r + 200)) islands.push(isl);
  }
  const volcano = islands[0];
  if (volcano) Object.assign(volcano, { r: 380, h: 30 });

  const ground = (x, z) => {
    const d = boxDist(x, z);
    const shore = shoreAt(x, z);
    const hills = fbm(x / 200, z / 200) * 55 * smoothstep(90, 260, d) * (1 - smoothstep(shore - 170, shore - 40, d));
    const sea = -15 * smoothstep(shore - 60, shore + 140, d);
    let isle = 0;
    for (const o of islands) {
      const t = 1 - Math.hypot(x - o.x, z - o.z) / o.r;
      if (t > 0) isle = Math.max(isle, (o.h + 16) * Math.pow(t, 1.4) * (0.75 + fbm(x / 60, z / 60) * 0.5));
    }
    return Math.max(hills + sea, sea + isle) - curve(x, z);
  };

  // Ground: sand near the water and in the park, jungle green up on the hills and islands.
  const size = 6000;
  const geo = new THREE.PlaneGeometry(size, size, 180, 180);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center.x, 0, center.z);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color('#f0d9a4');
  const wet = new THREE.Color('#cdb27c');
  const jungle = new THREE.Color('#3f9a3e');
  const jungle2 = new THREE.Color('#2f7a34');
  const shallow = new THREE.Color('#e9dcae');
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const y = ground(x, z);
    pos.setY(k, y);
    const above = y + curve(x, z) - SEA_LEVEL; // height above the sea
    const green = smoothstep(4, 10, above) * (boxDist(x, z) > 80 ? 1 : 0);
    c.copy(above < 0.6 ? (above < -1 ? shallow : wet) : sand).lerp(fbm(x / 90, z / 90) > 0.5 ? jungle : jungle2, green);
    c.multiplyScalar(0.9 + fbm(x / 40 + 3, z / 40) * 0.2);
    colors.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = getSandTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(size / 9, size / 9);
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true })));
  g.add(makeEarth(center, 'beach'));

  // The sea: turquoise over the sand, deep blue further out, with moving wave glints.
  const seaGeo = new THREE.PlaneGeometry(size, size, 120, 120);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(center.x, 0, center.z);
  const sp = seaGeo.attributes.position;
  const seaColors = new Float32Array(sp.count * 3);
  const lagoon = new THREE.Color('#4fd8e0');
  const deep = new THREE.Color('#1b7fc4');
  const surf = new THREE.Color('#e9fbff');
  for (let k = 0; k < sp.count; k++) {
    const x = sp.getX(k);
    const z = sp.getZ(k);
    sp.setY(k, SEA_LEVEL - curve(x, z));
    const depth = SEA_LEVEL - (ground(x, z) + curve(x, z));
    // Clear turquoise over the sand, deep blue further out, and pale surf right at the shore.
    c.copy(lagoon).lerp(deep, smoothstep(2, 13, depth)).lerp(surf, 0.45 * (1 - smoothstep(0, 1.6, depth)));
    seaColors.set([c.r, c.g, c.b], k * 3);
  }
  seaGeo.setAttribute('color', new THREE.BufferAttribute(seaColors, 3));
  seaGeo.computeVertexNormals();
  const seaMat = makeWater({ color: '#ffffff', vertexColors: true, opacity: 0.86, repeat: [size / 30, size / 30], flow: [0.004, 0.003], strength: 0.6, roughness: 0.08, emissive: '#06263a' });
  const seaMesh = new THREE.Mesh(seaGeo, seaMat);
  seaMesh.renderOrder = 1;
  g.add(seaMesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const place = (mesh, k, x, y, z, scale, sy = scale, turn = rand() * Math.PI * 2) => {
    q.setFromAxisAngle(Y, turn);
    mesh.setMatrixAt(k, m.compose(p.set(x, y, z), q, s.set(scale, sy, scale)));
  };
  const onLand = (x, z, min = 0.8) => ground(x, z) + curve(x, z) - SEA_LEVEL > min;

  // The volcano: a big cone with a crater, rocky on top, and smoke puffing out.
  const smoke = [];
  if (volcano) {
    const vy = ground(volcano.x, volcano.z);
    const cone = new THREE.CylinderGeometry(55, 260, 230, 28, 8, true).toNonIndexed();
    const cp = cone.attributes.position;
    const cc = new Float32Array(cp.count * 3);
    for (let k = 0; k < cp.count; k++) {
      const up = (cp.getY(k) + 115) / 230;
      const n = fbm(cp.getX(k) / 30 + 5, cp.getZ(k) / 30 + cp.getY(k) / 40);
      if (up > 0.02 && up < 0.98) cp.setXYZ(k, cp.getX(k) * (0.9 + n * 0.2), cp.getY(k), cp.getZ(k) * (0.9 + n * 0.2));
      c.copy(jungle).lerp(new THREE.Color(n > 0.5 ? '#6d5a4c' : '#5a4a40'), smoothstep(0.35, 0.6, up + (n - 0.5) * 0.2));
      cc.set([c.r, c.g, c.b], k * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    cone.computeVertexNormals();
    const mountain = new THREE.Mesh(cone, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    mountain.position.set(volcano.x, vy + 100, volcano.z);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(56, 24), new THREE.MeshBasicMaterial({ color: '#3a2a25' }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(volcano.x, vy + 205, volcano.z);
    const lava = new THREE.Mesh(new THREE.CircleGeometry(26, 20), new THREE.MeshBasicMaterial({ color: '#ff7a2a' }));
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(volcano.x, vy + 206, volcano.z);
    g.add(mountain, crater, lava);
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let k = 0; k < 14; k++) {
      const mesh = new THREE.Mesh(puff, new THREE.MeshLambertMaterial({ color: '#c9c4c0', emissive: '#555050', transparent: true, opacity: 0.8, depthWrite: false }));
      g.add(mesh);
      smoke.push({ mesh, age: (k / 14) * 12, base: new THREE.Vector3(volcano.x, vy + 215, volcano.z), drift: rand() * Math.PI * 2 });
    }
  }

  // Palm trees: lots around the park and up the hills, a few out on the other islands.
  const palms = [];
  for (let k = 0; palms.length < 260 && k < 8000; k++) {
    const x = bounds.min.x - 220 + rand() * (bounds.max.x - bounds.min.x + 440);
    const z = bounds.min.z - 220 + rand() * (bounds.max.z - bounds.min.z + 440);
    if (!keepOut(x, z, 7) && onLand(x, z)) palms.push({ x, z, near: true });
  }
  for (let k = 0; palms.length < 650 && k < 6000; k++) {
    const a = rand() * Math.PI * 2;
    const r = 200 + rand() * 600;
    const x = center.x + Math.cos(a) * (r + (bounds.max.x - bounds.min.x) / 2);
    const z = center.z + Math.sin(a) * (r + (bounds.max.z - bounds.min.z) / 2);
    if (onLand(x, z, 1.5)) palms.push({ x, z, near: false });
  }
  for (const o of islands.slice(1)) {
    for (let k = 0; k < 18; k++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * o.r * 0.8;
      if (onLand(o.x + Math.cos(a) * r, o.z + Math.sin(a) * r, 2)) palms.push({ x: o.x + Math.cos(a) * r, z: o.z + Math.sin(a) * r, near: false });
    }
  }
  for (const t of palms) {
    t.scale = (t.near ? 1.0 : 1.4) + rand() * 0.8;
    t.y = ground(t.x, t.z);
    t.turn = rand() * Math.PI * 2;
  }
  const trunkMesh = new THREE.InstancedMesh(TRUNK.geo, new THREE.MeshLambertMaterial({ color: '#a77b4f' }), palms.length);
  const frondMesh = new THREE.InstancedMesh(palmFronds(), new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), palms.length);
  const nutMesh = new THREE.InstancedMesh(coconuts(), new THREE.MeshLambertMaterial({ color: '#6b4a2a' }), palms.length);
  const frondGreens = ['#2f9a44', '#3fae4a', '#26883c', '#4fb64f'].map((col) => new THREE.Color(col));
  palms.forEach((t, k) => {
    for (const mesh of [trunkMesh, frondMesh, nutMesh]) place(mesh, k, t.x, t.y, t.z, t.scale, t.scale, t.turn);
    frondMesh.setColorAt(k, frondGreens[k % frondGreens.length]);
  });
  g.add(trunkMesh, frondMesh, nutMesh);
  const nearPalms = palms.filter((t) => t.near);
  const shadows = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.15, depthWrite: false }),
    nearPalms.length,
  );
  nearPalms.forEach((t, k) => {
    const dx = Math.cos(-t.turn) * PALM_LEAN * t.scale * 2.5;
    const dz = Math.sin(-t.turn) * PALM_LEAN * t.scale * 2.5;
    place(shadows, k, t.x + dx, t.y + 0.06, t.z + dz, t.scale * 2.4, 1);
  });
  g.add(shadows);

  // Close to the slide: bushes and flowers, and beach things to whizz past.
  const scatter = (count, minD, maxD, sandy = false) => {
    const out = [];
    for (let k = 0; out.length < count && k < count * 20; k++) {
      const at = nearTrack(rand(), minD + rand() * (maxD - minD), rand() < 0.5 ? -1 : 1);
      if (!at || keepOut(at.x, at.z, minD) || !onLand(at.x, at.z, 1)) continue;
      if (sandy && Math.abs(ground(at.x, at.z)) > 0.5) continue; // only on the flat sand
      at.y = ground(at.x, at.z);
      out.push(at);
    }
    return out;
  };
  const leaves = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const bushGreens = ['#3f9a3e', '#58b048', '#2f7a34', '#6cc04f'].map((col) => new THREE.Color(col));
  const bushes = scatter(260, 5, 45);
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaves, bushes.length);
  bushes.forEach((b, k) => {
    const sc = 0.7 + rand() * 1.1;
    place(bushMesh, k, b.x, b.y + sc * 0.4, b.z, sc, sc * 0.7);
    bushMesh.setColorAt(k, bushGreens[k % bushGreens.length]);
  });
  const flowers = scatter(700, 3.5, 45);
  const flowerMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.2, 0).translate(0, 0.35, 0),
    new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#222222' }),
    flowers.length,
  );
  const petals = ['#ff3d7f', '#ff5d73', '#ffd23f', '#ff9f43', '#ffffff', '#e056fd'].map((col) => new THREE.Color(col));
  flowers.forEach((b, k) => {
    place(flowerMesh, k, b.x, b.y, b.z, 0.8 + rand() * 0.7);
    flowerMesh.setColorAt(k, petals[k % petals.length]);
  });
  g.add(bushMesh, flowerMesh);

  // Beach umbrellas with a towel each, loungers, balls, sandcastles and starfish.
  const brights = ['#ff4d6d', '#3a86ff', '#ffd23f', '#06d6a0', '#ff8c42', '#9b5de5'].map((col) => new THREE.Color(col));
  const umbrellas = scatter(70, 6, 40, true);
  const [even, odd] = umbrellaStripes();
  const canopyA = new THREE.InstancedMesh(even, new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), umbrellas.length);
  const canopyB = new THREE.InstancedMesh(odd, new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), umbrellas.length);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6).translate(0, 1.3, 0), new THREE.MeshLambertMaterial({ color: '#f4f4f4' }), umbrellas.length);
  const towels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 1.9), new THREE.MeshLambertMaterial({ color: '#ffffff' }), umbrellas.length);
  umbrellas.forEach((u, k) => {
    const turn = rand() * Math.PI * 2;
    for (const mesh of [canopyA, canopyB, poles]) place(mesh, k, u.x, u.y, u.z, 1, 1, turn);
    canopyA.setColorAt(k, brights[k % brights.length]);
    place(towels, k, u.x + Math.cos(turn) * 1.4, u.y + 0.03, u.z + Math.sin(turn) * 1.4, 1, 1, turn);
    towels.setColorAt(k, brights[(k + 2) % brights.length]);
  });
  const loungerSpots = scatter(40, 6, 30, true);
  const loungers = new THREE.InstancedMesh(loungerGeometry(), new THREE.MeshLambertMaterial({ color: '#ffffff' }), loungerSpots.length);
  loungerSpots.forEach((b, k) => place(loungers, k, b.x, b.y, b.z, 1));
  const balls = scatter(40, 4, 35, true);
  const ballMesh = new THREE.InstancedMesh(beachBallGeometry(), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), balls.length);
  balls.forEach((b, k) => place(ballMesh, k, b.x, b.y, b.z, 1));
  const castles = scatter(24, 5, 35, true);
  const castleMesh = new THREE.InstancedMesh(sandcastleGeometry(), new THREE.MeshLambertMaterial({ color: '#e2c48a', flatShading: true }), castles.length);
  castles.forEach((b, k) => place(castleMesh, k, b.x, b.y, b.z, 0.7 + rand() * 0.6));
  const stars = scatter(160, 2.5, 30, true);
  const starMesh = new THREE.InstancedMesh(starfishGeometry(), new THREE.MeshLambertMaterial({ color: '#ffffff' }), stars.length);
  const starColors = ['#ff8c42', '#ff5d73', '#ffd23f'].map((col) => new THREE.Color(col));
  stars.forEach((b, k) => {
    place(starMesh, k, b.x, b.y + 0.02, b.z, 0.8 + rand() * 0.8, 1);
    starMesh.setColorAt(k, starColors[k % 3]);
  });
  const rocks = scatter(60, 6, 60);
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#7b726a', flatShading: true }), rocks.length);
  rocks.forEach((b, k) => {
    const sc = 0.4 + rand() * 1.1;
    place(rockMesh, k, b.x, b.y + sc * 0.3, b.z, sc, sc * 0.6);
  });
  g.add(canopyA, canopyB, poles, towels, loungers, ballMesh, castleMesh, starMesh, rockMesh);

  // Kiddie pools with a mushroom fountain in each.
  const kiddie = scatter(6, 18, 45, true);
  const rim = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const kidWater = makeWater({ color: '#4fd2f0', repeat: [1.5, 1.5], flow: [0.05, 0.04], strength: 0.5 });
  const curtain = new THREE.MeshLambertMaterial({ color: '#d8f4ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  for (const b of kiddie) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 8, 30), rim);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(b.x, b.y + 0.25, b.z);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4, 30), kidWater);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(b.x, b.y + 0.2, b.z);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 10), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    stem.position.set(b.x, b.y + 1.1, b.z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: brights[(kiddie.indexOf(b) * 2) % brights.length] }));
    cap.position.set(b.x, b.y + 2.1, b.z);
    const rain = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.6, 2, 18, 1, true), curtain);
    rain.position.set(b.x, b.y + 1.2, b.z);
    g.add(ring, pool, stem, cap, rain);
  }

  // Sailboats bobbing out on the sea, and gulls circling over the beach.
  const boats = [];
  for (let k = 0; boats.length < 7 && k < 200; k++) {
    const a = rand() * Math.PI * 2;
    const r = (bounds.max.x - bounds.min.x) / 2 + 420 + rand() * 700;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    if (onLand(x, z, -5)) continue;
    const boat = sailboat(brights[boats.length % brights.length].getStyle());
    boat.scale.setScalar(1.4);
    g.add(boat);
    boats.push({ boat, x, z, heading: rand() * Math.PI * 2, speed: 1.5 + rand() * 2, bob: rand() * 6 });
  }
  const flocks = [];
  for (let f = 0; f < 4; f++) {
    const at = nearTrack(rand(), 20 + rand() * 60, rand() < 0.5 ? -1 : 1);
    for (let k = 0; k < 4; k++) {
      const bird = gull();
      bird.scale.setScalar(1.3);
      g.add(bird);
      flocks.push({ bird, cx: at.x, cz: at.z, y: 30 + rand() * 30, r: 25 + rand() * 25, a: rand() * Math.PI * 2, speed: 0.25 + rand() * 0.15, flap: rand() * 6 });
    }
  }

  return {
    group: g,
    update(dt, time) {
      seaMat.userData.tick(time);
      kidWater.userData.tick(time);
      for (const b of boats) {
        b.x += Math.cos(b.heading) * b.speed * dt;
        b.z += Math.sin(b.heading) * b.speed * dt;
        b.boat.position.set(b.x, SEA_LEVEL - curve(b.x, b.z) + Math.sin(time * 1.3 + b.bob) * 0.15, b.z);
        b.boat.rotation.set(Math.sin(time * 1.1 + b.bob) * 0.05, -b.heading + Math.PI / 2, Math.sin(time * 0.9 + b.bob) * 0.06);
      }
      for (const f of flocks) {
        f.a += f.speed * dt;
        f.bird.position.set(f.cx + Math.cos(f.a) * f.r, f.y + Math.sin(f.a * 2) * 3, f.cz + Math.sin(f.a) * f.r);
        f.bird.rotation.set(0, -f.a, 0.35);
        for (const { pivot, s } of f.bird.userData.wings) pivot.rotation.z = s * Math.sin(time * 6 + f.flap) * 0.5;
      }
      for (const puff of smoke) {
        puff.age = (puff.age + dt) % 12;
        const t = puff.age / 12;
        puff.mesh.position.copy(puff.base).add(new THREE.Vector3(Math.cos(puff.drift) * t * 60 + t * 80, t * 160, Math.sin(puff.drift) * t * 60));
        puff.mesh.scale.setScalar(12 + t * 45);
        puff.mesh.material.opacity = 0.75 * (1 - t) * Math.min(1, t * 8);
      }
    },
  };
}
