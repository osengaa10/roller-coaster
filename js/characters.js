// Cartoon people, animals and train cars, all built from a few shared primitives.
import * as THREE from 'three';
import { quality } from './quality.js';
import { numberTexture } from './textures.js';
import { merge } from './nature.js';

// Soft, slightly fuzzy material for skin, fur and clothes: a gentle light round the edges (rim
// light) makes the riders stand out against the busy world behind them.
function rimMaterial(options) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, ...options });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'outgoingLight += vec3(0.32, 0.31, 0.3) * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);\n#include <opaque_fragment>',
    );
  };
  m.customProgramCacheKey = () => 'rim';
  m.userData.rim = true;
  return m;
}
const mats = new Map();
export const mat = (color, roughness = 0.72) => {
  const key = color + roughness;
  if (!mats.has(key)) mats.set(key, rimMaterial({ color, roughness }));
  return mats.get(key);
};
// All of a rider's rim-lit parts merged into one mesh, each part keeping its color per vertex.
const rimColors = rimMaterial({ vertexColors: true });
const glossy = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.08, metalness: 0 });
const SPHERE = new THREE.SphereGeometry(1, 32, 24);
const SMALL_SPHERE = new THREE.SphereGeometry(1, 14, 10); // eyes, cheeks and other little bits
// A rounded pad along y, `length` long overall, ends included.
const pills = new Map();
const pill = (r, length) => {
  const key = `${r},${length}`;
  if (!pills.has(key)) pills.set(key, new THREE.CapsuleGeometry(r, Math.max(0, length - 2 * r), 4, 12));
  return pills.get(key);
};
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE = new THREE.ConeGeometry(1, 1, 8);
const BOX = new THREE.BoxGeometry(1, 1, 1);

function part(geo, color, [x, y, z], [sx, sy, sz] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
const ball = (color, p, r, s = [1, 1, 1]) => part(r * Math.max(...s) < 0.12 ? SMALL_SPHERE : SPHERE, color, p, [r * s[0], r * s[1], r * s[2]]);

// Riders are built from dozens of little balls and sticks. Merge each group's own meshes (the
// body, the head, each arm, each blinking eye) into one vertex-colored mesh, plus one per special
// material such as the glossy eyes, so a rider costs a few draw calls instead of forty. The
// groups stay, so arms still wave and eyes still blink.
function bake(root) {
  const groups = [];
  root.traverse((o) => !o.isMesh && groups.push(o));
  for (const g of groups) {
    const meshes = g.children.filter((c) => c.isMesh);
    if (meshes.length < 2) continue;
    const buckets = new Map();
    for (const m of meshes) {
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      let material = m.material;
      if (material.userData.rim) {
        const c = material.color;
        geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).map((_, k) => [c.r, c.g, c.b][k % 3]), 3));
        material = rimColors;
      }
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(geo);
      g.remove(m);
    }
    for (const [material, geos] of buckets) g.add(new THREE.Mesh(merge(geos), material));
  }
  return root;
}

// Painted metal and chrome for the train.
const paints = new Map();
export const paint = (color, shininess = 80) => {
  const key = color + shininess;
  if (!paints.has(key)) paints.set(key, new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: Math.max(0.15, 1 - shininess / 110) }));
  return paints.get(key);
};
export const chrome = new THREE.MeshStandardMaterial({ color: '#eef2f6', metalness: 1, roughness: 0.18 });
export const darkSteel = new THREE.MeshStandardMaterial({ color: '#3d3d45', metalness: 0.7, roughness: 0.45 });
const vinyl = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.45 });
const cushion = new THREE.MeshStandardMaterial({ color: '#3d405b', roughness: 0.6 });
const headlamp = new THREE.MeshStandardMaterial({ color: '#fffbe0', emissive: '#ffe9a0', emissiveIntensity: 0.8, roughness: 0.1 });
const taillamp = new THREE.MeshStandardMaterial({ color: '#ff4d5e', emissive: '#ff2030', emissiveIntensity: 0.7, roughness: 0.15 });
const badge = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.8, roughness: 0.25 });
// Glossy car paint: a clear coat over the color on devices that can afford it.
const carPaints = new Map();
const carPaint = (color) => {
  if (!carPaints.has(color)) {
    carPaints.set(
      color,
      quality().clearcoat
        ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.2, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06 })
        : new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.3 }),
    );
  }
  return carPaints.get(color);
};

// Gathers parts that never move relative to each other and merges the ones sharing a material
// into one mesh, so a whole car costs a handful of draw calls instead of dozens.
export class Parts {
  constructor() {
    this.byMaterial = new Map();
  }

  // Scale, then rotate (Euler angles), then move: the same as setting a mesh's scale, rotation
  // and position.
  add(material, geo, [x, y, z], [sx, sy, sz] = [1, 1, 1], [rx, ry, rz] = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    return this.addMatrix(material, geo, m);
  }

  addMatrix(material, geo, m) {
    if (!this.byMaterial.has(material)) this.byMaterial.set(material, []);
    this.byMaterial.get(material).push((geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m));
    return this;
  }

  build() {
    return [...this.byMaterial].map(([material, geos]) => new THREE.Mesh(merge(geos), material));
  }
}

// Side profile of a car body (z forward, y up), extruded across the car's width.
// The dip in the middle is where riders sit; their legs are hidden inside the body.
function bodyGeometry(width) {
  const s = new THREE.Shape();
  s.moveTo(-1.15, 0.5);
  s.lineTo(0.95, 0.5);
  s.quadraticCurveTo(1.32, 0.5, 1.32, 0.82);
  s.quadraticCurveTo(1.32, 1.1, 0.95, 1.1);
  s.lineTo(0.6, 1.1);
  s.quadraticCurveTo(0.42, 1.1, 0.4, 0.85);
  s.lineTo(-0.75, 0.85);
  s.lineTo(-0.8, 1.0);
  s.quadraticCurveTo(-0.85, 1.12, -1.0, 1.12);
  s.lineTo(-1.05, 1.12);
  s.quadraticCurveTo(-1.15, 1.12, -1.15, 1.0);
  s.closePath();
  const bevel = 0.06;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments: 16,
  });
  geo.rotateY(-Math.PI / 2); // profile x -> forward (z), extrusion -> across (x)
  geo.translate(width / 2 - bevel, 0, 0);
  return smoothNormals(geo, 0.6);
}

// Extruded shapes come with flat faces, which show as bands on glossy paint. Average the normals
// of faces meeting at each corner, except across sharp edges (more than `crease` radians).
function smoothNormals(geo, crease) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const count = pos.count;
  const faceN = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < count / 3; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    faceN.push(new THREE.Vector3().subVectors(c, b).cross(a.clone().sub(b)).normalize());
  }
  const groups = new Map();
  for (let k = 0; k < count; k++) {
    const key = `${pos.getX(k).toFixed(4)},${pos.getY(k).toFixed(4)},${pos.getZ(k).toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(k);
  }
  const normals = new Float32Array(count * 3);
  const cos = Math.cos(crease);
  const sum = new THREE.Vector3();
  for (const list of groups.values()) {
    for (const k of list) {
      const own = faceN[Math.floor(k / 3)];
      sum.set(0, 0, 0);
      for (const j of list) {
        const other = faceN[Math.floor(j / 3)];
        if (own.dot(other) >= cos) sum.add(other);
      }
      sum.normalize();
      normals.set([sum.x, sum.y, sum.z], k * 3);
    }
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return g;
}

function smallStar() {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 0.07 : 0.16;
    const a = Math.PI / 2 + (k / 10) * Math.PI * 2;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
}

// A coaster car's body and seats. Local +z is forward, +y is up, the origin sits on the track
// between the rails (the chassis, wheels and couplers are added by makeTrain in train.js).
// seats: x of each seat; the front car gets headlights, a bumper and a star badge, the back car
// tail lights. number: the car's number on a plate on each side.
export function makeTrainCar(color, front = false, { width = 1.9, seats = [0.45, -0.45], seatBacks = true, lapBars = seats, number = null, back = false } = {}) {
  const car = new THREE.Group();
  car.add(new THREE.Mesh(bodyGeometry(width), carPaint(color)));
  const parts = new Parts();
  const plates = new Parts();
  const plate = new THREE.CircleGeometry(0.17, 20);
  // Racing stripe down each side, and the car number.
  for (const sx of [-1, 1]) {
    parts.add(paint('#ffffff', 60), BOX, [sx * (width / 2 + 0.01), 0.68, 0.05], [0.03, 0.1, 2.1]);
    if (number) plates.add(numberMaterial(number), plate, [sx * (width / 2 + 0.035), 0.86, -0.75], [1, 1, 1], [0, sx * Math.PI / 2, 0]);
  }
  // Chrome trim along the cockpit edge.
  parts.add(chrome, CYL, [0, 1.1, 0.6], [0.04, width - 0.1, 0.04], [0, 0, Math.PI / 2]);

  // The cockpit: a padded roll along each side and across the dash, and a padded divider
  // between the seats.
  const ROLL = 0.07;
  for (const sx of [-1, 1]) {
    parts.add(carPaint(color), BOX, [sx * (width / 2 - 0.08), 0.91, -0.18], [0.1, 0.14, 1.12]);
    parts.add(vinyl, pill(ROLL, 1.12), [sx * (width / 2 - 0.08), 0.99, -0.18], [1, 1, 1], [Math.PI / 2, 0, 0]);
  }
  parts.add(vinyl, pill(ROLL, width - 0.4), [0, 1.0, 0.47], [1, 1, 1], [0, 0, Math.PI / 2]);
  if (seats.length > 1) {
    const mid = (seats[0] + seats[1]) / 2;
    parts.add(vinyl, BOX, [mid, 0.92, -0.25], [0.1, 0.14, 0.8]).add(cushion, pill(0.06, 0.8), [mid, 0.99, -0.25], [1, 1, 1], [Math.PI / 2, 0, 0]);
  }

  for (const x of seats) {
    if (seatBacks) {
      // A fiberglass shell in the car's color, with tuck-and-roll pads in front of it.
      parts.add(carPaint(color), BOX, [x, 1.12, -0.71], [0.76, 0.66, 0.07], [-0.12, 0, 0]);
      for (let k = 0; k < 4; k++) parts.add(vinyl, pill(0.078, 0.56), [x + (k - 1.5) * 0.165, 1.1, -0.64], [1, 1, 0.75], [-0.12, 0, 0]);
      // Padded headrest, with a seam of piping round it.
      parts.add(vinyl, SPHERE, [x, 1.5, -0.71], [0.3, 0.17, 0.09]).add(cushion, SPHERE, [x, 1.5, -0.7], [0.31, 0.04, 0.095]);
      // A grab bar on the back of the seat for whoever sits behind.
      parts.add(chrome, CYL, [x, 1.3, -0.84], [0.03, 0.5, 0.03], [0, 0, Math.PI / 2]);
      for (const sx of [-1, 1]) parts.add(chrome, CYL, [x + sx * 0.24, 1.3, -0.79], [0.025, 0.11, 0.025], [Math.PI / 2, 0, 0]);
    }
    // The seat: pleated pads running front to back, and a roll along the front edge.
    parts.add(vinyl, BOX, [x, 0.86, -0.25], [0.7, 0.04, 0.83]);
    for (let k = 0; k < 4; k++) parts.add(cushion, pill(0.075, 0.78), [x + (k - 1.5) * 0.165, 0.89, -0.27], [1, 1, 0.6], [Math.PI / 2, 0, 0]);
    parts.add(cushion, CYL, [x, 0.88, 0.16], [0.07, 0.68, 0.07], [0, 0, Math.PI / 2]);
  }
  // Padded bar standing up in front of each rider, leaning back toward them.
  const lapBar = new THREE.TorusGeometry(0.3, 0.06, 10, 24, Math.PI);
  for (const x of lapBars) parts.add(paint('#ffd23f'), lapBar, [x, 0.86, 0.15], [1, 1, 1], [-0.35, 0, 0]);

  const lampRim = new THREE.TorusGeometry(0.13, 0.025, 6, 20);
  if (front) {
    for (const sx of [-1, 1]) {
      parts.add(headlamp, SPHERE, [sx * (width / 2 - 0.35), 0.86, 1.3], [0.13, 0.13, 0.06]);
      parts.add(chrome, lampRim, [sx * (width / 2 - 0.35), 0.86, 1.31]);
    }
    parts.add(chrome, CYL, [0, 0.56, 1.33], [0.06, width - 0.3, 0.06], [0, 0, Math.PI / 2]);
    parts.add(badge, smallStar(), [0, 0.95, 1.29]);
  }
  if (back) {
    for (const sx of [-1, 1]) {
      parts.add(taillamp, SPHERE, [sx * (width / 2 - 0.3), 0.8, -1.2], [0.09, 0.09, 0.05]);
      parts.add(chrome, lampRim, [sx * (width / 2 - 0.3), 0.8, -1.21], [0.7, 0.7, 0.7], [0, Math.PI, 0]);
    }
  }
  car.add(...parts.build(), ...plates.build());
  return car;
}

const numberMaterials = new Map();
const numberMaterial = (n) => {
  if (!numberMaterials.has(n)) numberMaterials.set(n, new THREE.MeshStandardMaterial({ map: numberTexture(n), roughness: 0.5 }));
  return numberMaterials.get(n);
};

// The car you sit in, seen from the front seat (child of the camera). It's a wide two-seater
// set a little low so the cowl doesn't block the view; his friend sits in the right seat.
export const FRIEND_SEAT = { x: 1.25, y: -1.32, z: -1.4 };
export function makeSeatCar() {
  const car = makeTrainCar('#ee4266', true, { width: 3.1, seats: [0.55, -0.7], seatBacks: false, lapBars: [0.55] });
  car.rotation.y = Math.PI; // car forward (+z) -> camera forward (-z)
  car.position.set(0.55, -1.9, -1.5);
  return car;
}

// The water slide's ride: a two-seat ring float, one ring behind the other (him in the orange
// back ring, his friend in the yellow front one), with grab handles. Local +z is forward and the
// origin sits on the water. Narrow enough (and riding high enough) to stay inside the trough.
export const RING_Z = 0.58; // ring centers at z = +-RING_Z
const RING_R = 0.45;
const RING_TUBE = 0.23;
const RING_Y = 0.25;
export function makeRaft() {
  const raft = new THREE.Group();
  const ring = new THREE.TorusGeometry(RING_R, RING_TUBE, 12, 28).rotateX(Math.PI / 2);
  const band = new THREE.TorusGeometry(RING_R, RING_TUBE + 0.005, 4, 28).rotateX(Math.PI / 2);
  const outer = RING_R + RING_TUBE;
  for (const [z, color] of [[-RING_Z, '#ff8c42'], [RING_Z, '#ffd23f']]) {
    const tubeRing = new THREE.Mesh(ring, paint(color, 60));
    tubeRing.position.set(0, RING_Y, z);
    raft.add(tubeRing);
    // Seat across the hole, and a white stripe round the ring.
    raft.add(part(CYL, '#3a86ff', [0, 0.1, z], [RING_R - 0.06, 0.06, RING_R - 0.06]));
    const stripe = new THREE.Mesh(band, paint('#ffffff', 60));
    stripe.scale.set(1, 0.18, 1);
    stripe.position.set(0, RING_Y, z);
    raft.add(stripe);
    // Grab handles on both sides of each ring, and one on the very front.
    const handles = [[outer, z, Math.PI / 2], [-outer, z, Math.PI / 2]];
    if (z > 0) handles.push([0, z + outer, 0]);
    for (const [hx, hz, turn] of handles) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI), paint('#2b2d42', 30));
      handle.position.set(hx, RING_Y + 0.2, hz);
      handle.rotation.y = turn;
      raft.add(handle);
    }
  }
  // A strap joining the two rings.
  raft.add(part(BOX, '#2b2d42', [0, RING_Y, 0], [0.5, 0.12, 0.4]));
  return raft;
}

// The raft seen from his seat (child of the camera): his own ring under him and his friend's
// ring in front. The friend sits at FRIEND_RAFT, leaning to one side to look back at him so
// they don't block the view down the slide.
const SEAT_Z = -0.1; // his ring's center, relative to the camera
export const FRIEND_RAFT = { x: 0.3, y: -0.85, z: SEAT_Z - RING_Z * 2 };
export function makeSeatRaft(eye) {
  const pivot = new THREE.Group(); // under him, in the middle of his ring
  pivot.position.set(0, -eye, SEAT_Z);
  pivot.rotation.y = Math.PI; // raft forward (+z) -> camera forward (-z)
  const raft = makeRaft();
  raft.position.z = RING_Z;
  pivot.add(raft);
  return pivot;
}

// Riders: him and the animal friends. Built facing +z, sitting at y = 0.
const RIDERS = {
  kid: { body: '#3a86ff', head: '#f2c6a0', paw: '#f2c6a0', hair: '#6b3e26', brow: '#5a321e' },
  girl: { body: '#ff70a6', head: '#e0ac69', paw: '#e0ac69', hair: '#3b2416', brow: '#2e1b10', style: 'pigtails', bow: '#ffd23f' },
  pal: { body: '#06d6a0', head: '#8d5524', paw: '#8d5524', hair: '#1f1a17', brow: '#1f1a17', style: 'curls' },
  bear: { body: '#a0522d', head: '#a0522d', paw: '#7a3e1d', snout: '#deb887' },
  bunny: { body: '#f5f5f5', head: '#f5f5f5', paw: '#ffffff', snout: '#ffffff', nose: '#ff8fab' },
  panda: { body: '#222222', head: '#f8f8f8', paw: '#222222', snout: '#ffffff' },
  frog: { body: '#5cc94f', head: '#5cc94f', paw: '#4bb33f' },
  dino: { body: '#9b5de5', head: '#9b5de5', paw: '#7b3fc5', snout: '#c8a2f5' },
};
export const FRIENDS = ['bear', 'bunny', 'panda', 'frog', 'dino'];
export const PEOPLE = ['girl', 'pal']; // other kids, who ride in the cars behind

export function makeRider(kind) {
  const k = RIDERS[kind];
  const g = new THREE.Group();
  g.add(ball(k.body, [0, 0.3, 0], 0.32, [1, 1.1, 0.85]));
  const head = new THREE.Group();
  head.position.y = 0.85;
  g.add(head);
  head.add(ball(k.head, [0, 0, 0], 0.28));

  // Big glossy eyes with two sparkles each; they close for a blink now and then.
  const lids = [];
  const eyes = (y = 0.05, z = 0.24, x = 0.1, r = 0.05) => {
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * x, y, z);
      const pupil = new THREE.Mesh(SPHERE, glossy);
      pupil.scale.set(r, r * 1.15, r * 0.7);
      eye.add(pupil, ball('#ffffff', [r * 0.35, r * 0.4, r * 0.55], r * 0.32), ball('#ffffff', [-r * 0.3, -r * 0.35, r * 0.6], r * 0.15));
      head.add(eye);
      lids.push(eye);
    }
  };
  const cheeks = (y = -0.07, z = 0.2, x = 0.16) => {
    for (const s of [-1, 1]) head.add(ball('#ff9fb3', [s * x, y, z], 0.05, [1, 0.6, 0.4]));
  };
  const smile = (y, z, r = 0.055, color = '#7a2e2e') => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 14, Math.PI), mat(color, 0.5));
    m.position.set(0, y, z);
    m.rotation.z = Math.PI; // the arc's ends point up: a smile
    head.add(m);
  };
  const snout = (r = 0.1) => {
    head.add(ball(k.snout, [0, -0.06, 0.24], r, [1, 0.8, 0.8]));
    const nose = new THREE.Mesh(SPHERE, k.nose ? mat(k.nose, 0.3) : glossy);
    nose.position.set(0, -0.03, 0.24 + r * 0.8);
    nose.scale.set(0.04, 0.032, 0.03);
    head.add(nose);
  };

  let goggles = null;
  if (k.hair) {
    // People: a cap of hair, a face in front of it, then the hairdo.
    head.add(ball(k.hair, [0, 0.08, -0.02], 0.3, [1, 0.8, 1]));
    head.add(ball(k.head, [0, -0.01, 0.06], 0.26));
    if (k.style === 'curls') {
      // A round puff of curls all over.
      for (let n = 0; n < 14; n++) {
        const a = (n / 14) * Math.PI * 2;
        const up = n % 2 ? 0.2 : 0.27;
        head.add(ball(k.hair, [Math.cos(a) * 0.2, up, Math.sin(a) * 0.18 - 0.04], 0.09));
      }
      head.add(ball(k.hair, [0, 0.31, -0.03], 0.13));
    } else {
      // A few tufts sticking up, and a fringe over the forehead.
      for (const [x, y, z, r] of [[0.05, 0.3, -0.02, 0.07], [-0.07, 0.29, 0.03, 0.06], [0.0, 0.27, 0.12, 0.06], [0.12, 0.24, 0.08, 0.055]]) head.add(ball(k.hair, [x, y, z], r, [1, 1.3, 1]));
      head.add(ball(k.hair, [0, 0.17, 0.17], 0.13, [1.4, 0.45, 0.7]));
    }
    if (k.style === 'pigtails') {
      // Bunches over each ear, tied with a bow.
      for (const s of [-1, 1]) {
        head.add(ball(k.hair, [s * 0.33, 0.02, -0.06], 0.11, [0.9, 1.2, 0.9]));
        for (const b of [-1, 1]) head.add(ball(k.bow, [s * 0.36, 0.15, -0.06 + b * 0.06], 0.06, [0.6, 0.7, 1]));
        head.add(ball(k.bow, [s * 0.37, 0.15, -0.06], 0.035));
      }
    }
    eyes(0.02, 0.29, 0.09, 0.048);
    for (const s of [-1, 1]) {
      const brow = ball(k.brow, [s * 0.09, 0.1, 0.3], 1, [0.045, 0.012, 0.012]);
      brow.rotation.z = -s * 0.15;
      head.add(brow);
    }
    cheeks(-0.06, 0.25, 0.15);
    smile(-0.08, 0.3, 0.06, '#c0392b');
  }
  if (kind === 'kid') {
    // A star on his T-shirt.
    const star = new THREE.Mesh(smallStar(), mat('#ffd23f', 0.5));
    star.position.set(-0.02, 0.32, 0.26);
    star.scale.setScalar(0.75);
    g.add(star);
    // Swim goggles pushed up on his forehead, for the water slide.
    goggles = new THREE.Group();
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 6, 24), mat('#3a86ff'));
    strap.rotation.x = Math.PI / 2 - 0.35;
    strap.position.y = 0.14;
    goggles.add(strap);
    const lens = new THREE.MeshStandardMaterial({ color: '#bff7ff', roughness: 0.05, metalness: 0.3 });
    for (const sx of [-1, 1]) {
      goggles.add(ball('#2ec4b6', [sx * 0.09, 0.2, 0.25], 0.07, [1, 0.8, 0.6]));
      const glass = new THREE.Mesh(SPHERE, lens);
      glass.position.set(sx * 0.09, 0.205, 0.275);
      glass.scale.set(0.05, 0.04, 0.025);
      goggles.add(glass);
    }
    goggles.visible = false;
    head.add(goggles);
  } else if (kind === 'bear') {
    for (const s of [-1, 1]) head.add(ball(k.head, [s * 0.2, 0.22, 0], 0.1), ball(k.snout, [s * 0.2, 0.22, 0.05], 0.055, [1, 1, 0.5]));
    eyes();
    snout();
    cheeks();
    smile(-0.14, 0.27, 0.04);
  } else if (kind === 'bunny') {
    for (const s of [-1, 1]) {
      const ear = ball(k.head, [s * 0.1, 0.4, -0.02], 1, [0.07, 0.25, 0.05]);
      ear.rotation.z = -s * 0.15;
      const inner = ball('#ffb6c8', [s * 0.1, 0.4, 0.02], 1, [0.035, 0.18, 0.03]);
      inner.rotation.z = -s * 0.15;
      head.add(ear, inner);
    }
    eyes();
    snout(0.08);
    cheeks();
    smile(-0.13, 0.27, 0.035);
    g.add(ball('#ffffff', [0, 0.12, -0.28], 0.1)); // fluffy tail
  } else if (kind === 'panda') {
    for (const s of [-1, 1]) {
      head.add(ball('#222222', [s * 0.2, 0.22, 0], 0.1));
      const patch = ball('#222222', [s * 0.1, 0.04, 0.2], 0.075, [1, 1.2, 0.7]);
      patch.rotation.z = s * 0.4;
      head.add(patch);
    }
    eyes(0.05, 0.255, 0.1, 0.04);
    snout(0.08);
    cheeks(-0.08, 0.21, 0.17);
    smile(-0.13, 0.27, 0.035);
  } else if (kind === 'frog') {
    for (const s of [-1, 1]) {
      head.add(ball('#ffffff', [s * 0.13, 0.2, 0.12], 0.1));
      const eye = new THREE.Group();
      eye.position.set(s * 0.13, 0.21, 0.2);
      const pupil = new THREE.Mesh(SPHERE, glossy);
      pupil.scale.set(0.05, 0.055, 0.035);
      eye.add(pupil, ball('#ffffff', [0.015, 0.02, 0.03], 0.014));
      head.add(eye);
      lids.push(eye);
    }
    head.add(part(SPHERE, '#c0392b', [0, -0.08, 0.25], [0.15, 0.03, 0.03]));
    cheeks(-0.04, 0.22, 0.19);
    // Darker spots on his back and head.
    for (const [x, y, z, r] of [[0.12, 0.42, -0.18, 0.05], [-0.1, 0.3, -0.24, 0.06], [0.0, 0.5, -0.12, 0.04]]) g.add(ball('#3f9a35', [x, y, z], r, [1, 1, 0.5]));
    for (const [x, y, z] of [[0.1, 0.12, -0.2], [-0.12, 0.08, -0.21]]) head.add(ball('#3f9a35', [x, y, z], 0.04, [1, 1, 0.5]));
  } else if (kind === 'dino') {
    snout(0.14);
    eyes(0.08, 0.22);
    cheeks(-0.02, 0.2, 0.18);
    for (const [y, z] of [[0.3, -0.05], [0.22, -0.2], [0.05, -0.3]]) {
      const spike = part(CONE, '#ffd23f', [0, y, z], [0.07, 0.16, 0.07]);
      spike.rotation.x = -0.6;
      head.add(spike);
    }
    // A lighter belly with stripes across it.
    g.add(ball(k.snout, [0, 0.27, 0.17], 1, [0.22, 0.25, 0.13]));
    for (const y of [0.18, 0.27, 0.36]) g.add(ball('#b38ae8', [0, y, 0.285], 1, [0.14, 0.012, 0.02]));
  }

  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.3, 0.48, 0);
    pivot.add(part(CYL, k.body, [0, -0.2, 0], [0.07, 0.4, 0.07]));
    pivot.add(ball(k.paw, [0, -0.42, 0], 0.09));
    g.add(pivot);
    return { pivot, s };
  });

  bake(g);

  let raise = 0;
  let time = Math.random() * 10;
  let nextBlink = 1 + Math.random() * 3;
  return {
    group: g,
    goggles,
    // cheer: 0..1 how much the arms should be up; speed01 makes the head bob.
    update(dt, cheer, speed01 = 0) {
      time += dt;
      raise += (cheer - raise) * Math.min(1, dt * 8);
      for (const { pivot, s } of arms) {
        pivot.rotation.z = s * (0.25 + raise * 2.55 + raise * Math.sin(time * 14 + s) * 0.15);
      }
      head.position.y = 0.85 + Math.sin(time * (4 + speed01 * 10)) * 0.02 * (0.3 + speed01);
      head.rotation.z = Math.sin(time * 2.3) * 0.08;
      // Blink: eyes squash shut for a moment every few seconds.
      nextBlink -= dt;
      if (nextBlink < -0.14) nextBlink = 2 + Math.random() * 3.5;
      const shut = nextBlink < 0 ? 0.12 : 1;
      for (const lid of lids) lid.scale.y = shut;
    },
  };
}

// His own arms, popping up in front of the camera on a tap (child of the camera).
export function makeHands() {
  const g = new THREE.Group();
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.5, -0.65, 0.15);
    pivot.add(part(CYL, '#3a86ff', [0, 0.7, 0], [0.11, 1.4, 0.11]));
    pivot.add(part(CYL, '#ffffff', [0, 1.35, 0], [0.12, 0.12, 0.12]));
    const hand = ball('#f2c6a0', [0, 1.55, 0], 0.17, [1, 1.15, 0.7]);
    pivot.add(hand);
    for (const k of [-1, 0, 1]) pivot.add(ball('#f2c6a0', [k * 0.08, 1.72, 0], 0.05, [1, 1.8, 1]));
    pivot.add(ball('#f2c6a0', [s * -0.17, 1.5, 0], 0.05, [1.8, 1, 1]));
    g.add(pivot);
    return { pivot, s };
  });
  bake(g);
  let t = 0;
  let time = 0;
  return {
    group: g,
    update(dt, up) {
      time += dt;
      t += ((up ? 1 : 0) - t) * Math.min(1, dt * (up ? 9 : 5));
      g.visible = t > 0.01;
      for (const { pivot, s } of arms) {
        pivot.rotation.x = -2.6 + t * 1.6; // ends leaning forward so the hands are in view
        pivot.rotation.z = -s * (0.35 + Math.sin(time * 12 + s) * 0.12 * t);
      }
    },
  };
}
