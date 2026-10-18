// Cartoon people, animals and train cars, all built from a few shared primitives.
import * as THREE from 'three';
import { quality } from './quality.js';
import { numberTexture } from './textures.js';

const mats = new Map();
export const mat = (color) => {
  if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }));
  return mats.get(color);
};
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CONE = new THREE.ConeGeometry(1, 1, 8);
const BOX = new THREE.BoxGeometry(1, 1, 1);

function part(geo, color, [x, y, z], [sx, sy, sz] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}
const ball = (color, p, r, s = [1, 1, 1]) => part(SPHERE, color, p, [r * s[0], r * s[1], r * s[2]]);

// Painted metal and chrome for the train.
const paints = new Map();
const paint = (color, shininess = 80) => {
  const key = color + shininess;
  if (!paints.has(key)) paints.set(key, new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: Math.max(0.15, 1 - shininess / 110) }));
  return paints.get(key);
};
const CHROME = '#d5dbe2';
const chrome = new THREE.MeshStandardMaterial({ color: '#eef2f6', metalness: 1, roughness: 0.18 });
const darkSteel = new THREE.MeshStandardMaterial({ color: '#3d3d45', metalness: 0.7, roughness: 0.45 });
const vinyl = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.45 });
const cushion = new THREE.MeshStandardMaterial({ color: '#3d405b', roughness: 0.6 });
const tire = new THREE.MeshStandardMaterial({ color: '#202024', roughness: 0.85 });
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
function piece(geo, material, [x, y, z], [sx, sy, sz] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
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
  return geo;
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

// A coaster car. Local +z is forward, +y is up, the origin sits on the track between the rails.
// seats: x of each seat; the front car gets headlights, a bumper and a star badge. number: the
// car's number on a plate on each side.
export function makeTrainCar(color, front = false, { width = 1.9, seats = [0.45, -0.45], seatBacks = true, lapBars = seats, wheels = true, number = null } = {}) {
  const car = new THREE.Group();
  car.add(new THREE.Mesh(bodyGeometry(width), carPaint(color)));
  // Racing stripe down each side, and the car number.
  for (const sx of [-1, 1]) {
    car.add(piece(BOX, paint('#ffffff', 60), [sx * (width / 2 + 0.01), 0.68, 0.05], [0.03, 0.1, 2.1]));
    if (number) {
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshStandardMaterial({ map: numberTexture(number), roughness: 0.5 }));
      plate.position.set(sx * (width / 2 + 0.035), 0.86, -0.75);
      plate.rotation.y = sx * Math.PI / 2;
      car.add(plate);
    }
  }
  // Chrome trim along the cockpit edge.
  car.add(piece(CYL, chrome, [0, 1.1, 0.6], [0.04, width - 0.1, 0.04]).rotateZ(Math.PI / 2));

  for (const x of seats) {
    if (seatBacks) {
      const back = piece(BOX, vinyl, [x, 1.12, -0.66], [0.72, 0.62, 0.14]);
      back.rotation.x = -0.12;
      // Padded headrest, with a seam of piping round it.
      car.add(back, piece(SPHERE, vinyl, [x, 1.5, -0.71], [0.3, 0.17, 0.09]), piece(SPHERE, cushion, [x, 1.5, -0.7], [0.31, 0.04, 0.095]));
    }
    car.add(piece(BOX, cushion, [x, 0.87, -0.25], [0.7, 0.07, 0.83]), piece(CYL, cushion, [x, 0.88, 0.16], [0.07, 0.68, 0.07]).rotateZ(Math.PI / 2));
  }
  for (const x of lapBars) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 10, 24, Math.PI), paint('#ffd23f'));
    // Padded bar standing up in front of the rider, leaning back toward them.
    bar.position.set(x, 0.86, 0.15);
    bar.rotation.set(-0.35, 0, 0);
    car.add(bar);
  }

  if (wheels) {
    // Chassis, then a wheel assembly hugging each rail at front and back:
    // a road wheel on top, an up-stop wheel underneath and a guide wheel at the side.
    car.add(piece(BOX, darkSteel, [0, 0.44, 0], [1.5, 0.14, 2.1]));
    for (const z of [-0.8, 0.8]) {
      for (const sx of [-1, 1]) {
        const x = sx * 0.6;
        car.add(piece(BOX, darkSteel, [x + sx * 0.3, 0.05, z], [0.1, 0.75, 0.42]));
        car.add(piece(BOX, darkSteel, [x + sx * 0.15, 0.42, z], [0.35, 0.08, 0.42]));
        for (const [y, r] of [[0.25, 0.15], [-0.24, 0.1]]) {
          const wheel = new THREE.Group();
          wheel.add(piece(CYL, tire, [0, 0, 0], [r, 0.1, r]), piece(CYL, chrome, [0, 0, 0], [r * 0.55, 0.11, r * 0.55]));
          wheel.position.set(x, y, z);
          wheel.rotation.z = Math.PI / 2;
          car.add(wheel);
        }
        car.add(piece(CYL, tire, [x + sx * 0.2, 0, z], [0.1, 0.1, 0.1]), piece(CYL, chrome, [x + sx * 0.2, 0, z], [0.055, 0.11, 0.055]));
      }
    }
    // Tow bar to the car behind.
    const hitch = piece(CYL, darkSteel, [0, 0.45, -1.3], [0.06, 0.4, 0.06]);
    hitch.rotation.x = Math.PI / 2;
    car.add(hitch);
  }

  if (front) {
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(SPHERE, new THREE.MeshStandardMaterial({ color: '#fffbe0', emissive: '#ffe9a0', emissiveIntensity: 0.8, roughness: 0.1 }));
      lamp.position.set(sx * (width / 2 - 0.35), 0.86, 1.3);
      lamp.scale.set(0.13, 0.13, 0.06);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 20), chrome);
      rim.position.set(sx * (width / 2 - 0.35), 0.86, 1.31);
      car.add(lamp, rim);
    }
    const bumper = piece(CYL, chrome, [0, 0.56, 1.33], [0.06, width - 0.3, 0.06]);
    bumper.rotation.z = Math.PI / 2;
    const star = new THREE.Mesh(smallStar(), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.8, roughness: 0.25 }));
    star.position.set(0, 0.95, 1.29);
    car.add(bumper, star);
  }
  return car;
}

// The car you sit in, seen from the front seat (child of the camera). It's a wide two-seater
// set a little low so the cowl doesn't block the view; his friend sits in the right seat.
export const FRIEND_SEAT = { x: 1.25, y: -1.32, z: -1.4 };
export function makeSeatCar() {
  const car = makeTrainCar('#ee4266', true, { width: 3.1, seats: [0.55, -0.7], seatBacks: false, lapBars: [0.55], wheels: false });
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
  kid: { body: '#3a86ff', head: '#f2c6a0', paw: '#f2c6a0' },
  bear: { body: '#a0522d', head: '#a0522d', paw: '#7a3e1d', snout: '#deb887' },
  bunny: { body: '#f5f5f5', head: '#f5f5f5', paw: '#ffffff', snout: '#ffffff', nose: '#ff8fab' },
  panda: { body: '#222222', head: '#f8f8f8', paw: '#222222', snout: '#ffffff' },
  frog: { body: '#5cc94f', head: '#5cc94f', paw: '#4bb33f' },
  dino: { body: '#9b5de5', head: '#9b5de5', paw: '#7b3fc5', snout: '#c8a2f5' },
};
export const FRIENDS = ['bear', 'bunny', 'panda', 'frog', 'dino'];

export function makeRider(kind) {
  const k = RIDERS[kind];
  const g = new THREE.Group();
  g.add(ball(k.body, [0, 0.3, 0], 0.32, [1, 1.1, 0.85]));
  const head = new THREE.Group();
  head.position.y = 0.85;
  g.add(head);
  head.add(ball(k.head, [0, 0, 0], 0.28));

  const eyes = (y = 0.05, z = 0.24, x = 0.1) => {
    for (const s of [-1, 1]) {
      head.add(ball('#111111', [s * x, y, z], 0.045));
      head.add(ball('#ffffff', [s * x + 0.015, y + 0.018, z + 0.03], 0.014));
    }
  };
  const snout = (r = 0.1) => {
    head.add(ball(k.snout, [0, -0.06, 0.24], r, [1, 0.8, 0.8]));
    head.add(ball(k.nose || '#111111', [0, -0.03, 0.24 + r * 0.8], 0.035));
  };

  let goggles = null;
  if (kind === 'kid') {
    head.add(ball('#6b3e26', [0, 0.08, -0.02], 0.3, [1, 0.8, 1])); // hair
    head.add(ball(k.head, [0, -0.01, 0.06], 0.26));
    eyes(0.02, 0.29, 0.09);
    head.add(part(SPHERE, '#d9534f', [0, -0.1, 0.27], [0.08, 0.03, 0.03])); // smile
    // Swim goggles pushed up on his forehead, for the water slide.
    goggles = new THREE.Group();
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 6, 24), mat('#3a86ff'));
    strap.rotation.x = Math.PI / 2 - 0.35;
    strap.position.y = 0.14;
    goggles.add(strap);
    for (const sx of [-1, 1]) {
      goggles.add(ball('#2ec4b6', [sx * 0.09, 0.2, 0.25], 0.07, [1, 0.8, 0.6]));
      goggles.add(ball('#d8fbff', [sx * 0.09 + 0.02, 0.215, 0.285], 0.025));
    }
    goggles.visible = false;
    head.add(goggles);
  } else if (kind === 'bear') {
    for (const s of [-1, 1]) head.add(ball(k.head, [s * 0.2, 0.22, 0], 0.1));
    eyes();
    snout();
  } else if (kind === 'bunny') {
    for (const s of [-1, 1]) {
      const ear = ball(k.head, [s * 0.1, 0.4, -0.02], 1, [0.07, 0.25, 0.05]);
      ear.rotation.z = -s * 0.15;
      head.add(ear, ball('#ffb6c8', [s * 0.1, 0.4, 0.02], 1, [0.035, 0.18, 0.03]));
    }
    eyes();
    snout(0.08);
  } else if (kind === 'panda') {
    for (const s of [-1, 1]) {
      head.add(ball('#222222', [s * 0.2, 0.22, 0], 0.1));
      head.add(ball('#222222', [s * 0.1, 0.04, 0.2], 0.075, [1, 1.2, 0.7]));
    }
    eyes(0.05, 0.255);
    snout(0.08);
  } else if (kind === 'frog') {
    for (const s of [-1, 1]) {
      head.add(ball('#ffffff', [s * 0.13, 0.2, 0.12], 0.1));
      head.add(ball('#111111', [s * 0.13, 0.21, 0.21], 0.045));
    }
    head.add(part(SPHERE, '#c0392b', [0, -0.08, 0.25], [0.15, 0.03, 0.03]));
  } else if (kind === 'dino') {
    snout(0.14);
    eyes(0.08, 0.22);
    for (const [y, z] of [[0.3, -0.05], [0.22, -0.2], [0.05, -0.3]]) {
      const spike = part(CONE, '#ffd23f', [0, y, z], [0.07, 0.16, 0.07]);
      spike.rotation.x = -0.6;
      head.add(spike);
    }
  }

  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.3, 0.48, 0);
    pivot.add(part(CYL, k.body, [0, -0.2, 0], [0.07, 0.4, 0.07]));
    pivot.add(ball(k.paw, [0, -0.42, 0], 0.09));
    g.add(pivot);
    return { pivot, s };
  });

  let raise = 0;
  let time = Math.random() * 10;
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
