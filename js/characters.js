// Cartoon people, animals and train cars, all built from a few shared primitives.
import * as THREE from 'three';

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
  if (!paints.has(key)) paints.set(key, new THREE.MeshPhongMaterial({ color, shininess, specular: '#666666' }));
  return paints.get(key);
};
const CHROME = '#d5dbe2';

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
    bevelSegments: 2,
    curveSegments: 10,
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
// seats: x of each seat; the front car gets headlights, a bumper and a star badge.
export function makeTrainCar(color, front = false, { width = 1.9, seats = [0.45, -0.45], seatBacks = true, lapBars = seats, wheels = true } = {}) {
  const car = new THREE.Group();
  car.add(new THREE.Mesh(bodyGeometry(width), paint(color)));
  // Racing stripe down each side.
  for (const sx of [-1, 1]) car.add(part(BOX, '#ffffff', [sx * (width / 2 + 0.01), 0.68, 0.05], [0.03, 0.1, 2.1]));
  // Chrome trim along the cockpit edge.
  car.add(part(CYL, CHROME, [0, 1.1, 0.6], [0.04, width - 0.1, 0.04]).rotateZ(Math.PI / 2));

  for (const x of seats) {
    if (seatBacks) {
      const back = part(BOX, '#2b2d42', [x, 1.12, -0.66], [0.72, 0.62, 0.14]);
      back.rotation.x = -0.12;
      car.add(back, ball('#2b2d42', [x, 1.5, -0.71], 1, [0.3, 0.17, 0.09]));
    }
    car.add(part(BOX, '#3d405b', [x, 0.86, -0.25], [0.72, 0.05, 0.85]));
  }
  for (const x of lapBars) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 20, Math.PI), paint('#ffd23f'));
    // Padded bar standing up in front of the rider, leaning back toward them.
    bar.position.set(x, 0.86, 0.15);
    bar.rotation.set(-0.35, 0, 0);
    car.add(bar);
  }

  if (wheels) {
    // Chassis, then a wheel assembly hugging each rail at front and back:
    // a road wheel on top, an up-stop wheel underneath and a guide wheel at the side.
    car.add(part(BOX, '#3d3d45', [0, 0.44, 0], [1.5, 0.14, 2.1]));
    for (const z of [-0.8, 0.8]) {
      for (const sx of [-1, 1]) {
        const x = sx * 0.6;
        car.add(part(BOX, '#55555f', [x + sx * 0.3, 0.05, z], [0.1, 0.75, 0.42]));
        car.add(part(BOX, '#55555f', [x + sx * 0.15, 0.42, z], [0.35, 0.08, 0.42]));
        for (const [y, r] of [[0.25, 0.15], [-0.24, 0.1]]) {
          const wheel = part(CYL, '#1f1f1f', [x, y, z], [r, 0.1, r]);
          wheel.rotation.z = Math.PI / 2;
          car.add(wheel);
        }
        car.add(part(CYL, '#1f1f1f', [x + sx * 0.2, 0, z], [0.1, 0.1, 0.1]));
      }
    }
    // Tow bar to the car behind.
    const hitch = part(CYL, '#3d3d45', [0, 0.45, -1.3], [0.06, 0.4, 0.06]);
    hitch.rotation.x = Math.PI / 2;
    car.add(hitch);
  }

  if (front) {
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(SPHERE, new THREE.MeshPhongMaterial({ color: '#fffbe0', emissive: '#aa9a55', shininess: 100 }));
      lamp.position.set(sx * (width / 2 - 0.35), 0.86, 1.3);
      lamp.scale.set(0.13, 0.13, 0.06);
      car.add(lamp);
    }
    const bumper = part(CYL, CHROME, [0, 0.56, 1.33], [0.06, width - 0.3, 0.06]);
    bumper.rotation.z = Math.PI / 2;
    const star = new THREE.Mesh(smallStar(), paint('#ffd23f'));
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

  if (kind === 'kid') {
    head.add(ball('#6b3e26', [0, 0.08, -0.02], 0.3, [1, 0.8, 1])); // hair
    head.add(ball(k.head, [0, -0.01, 0.06], 0.26));
    eyes(0.02, 0.29, 0.09);
    head.add(part(SPHERE, '#d9534f', [0, -0.1, 0.27], [0.08, 0.03, 0.03])); // smile
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
