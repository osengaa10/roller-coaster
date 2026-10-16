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

// The car you sit in, seen from the front seat (child of the camera).
export function makeSeatCar() {
  const car = new THREE.Group();
  car.add(part(BOX, '#ee4266', [0, -1.4, -1.5], [1.8, 0.7, 2.2]));
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 20, 1, false, 0, Math.PI), mat('#ffd23f'));
  nose.rotation.set(0, 0, Math.PI / 2);
  nose.position.set(0, -1.05, -2.6);
  nose.scale.set(0.5, 1, 1);
  const bar = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 24, Math.PI), mat('#3bceac'));
  bar.position.set(0, -1.0, -0.8);
  bar.rotation.set(-0.3, 0, 0);
  car.add(nose, bar, ball('#ffffff', [0.55, -0.87, -2.62], 0.14), ball('#ffffff', [-0.55, -0.87, -2.62], 0.14));
  return car;
}

// A train car for the outside view. Local +z is forward, +y is up.
export function makeTrainCar(color, front = false) {
  const car = new THREE.Group();
  car.add(part(BOX, color, [0, 0.35, 0], [1.9, 0.7, 2.3]));
  car.add(part(BOX, '#333333', [0, 0.75, -0.95], [1.9, 0.6, 0.25])); // seat back
  for (const x of [-0.75, 0.75]) for (const z of [-0.8, 0.8]) car.add(part(CYL, '#333333', [x, 0, z], [0.22, 0.2, 0.22]));
  if (front) {
    const nose = part(SPHERE, '#ffd23f', [0, 0.4, 1.15], [0.95, 0.4, 0.5]);
    car.add(nose);
  }
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
