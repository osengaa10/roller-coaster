// First-person ride through the drawn track.
import * as THREE from 'three';
import { V_MAX, supportSpots } from './track.js';
import * as sound from './sound.js';

const RAIL_GAP = 0.6; // half distance between rails
const EYE = 1.3; // seat height above the track
const LOOK_AHEAD = 6; // meters
const START_DELAY = 1.3; // seconds sitting in the station before rolling

export class Ride {
  constructor(canvas, { onFinish = () => {} } = {}) {
    this.onFinish = onFinish;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd3ff');
    this.scene.fog = new THREE.Fog('#8fd3ff', 120, 650);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000);
    this.scene.add(this.camera);
    this.camera.add(makeCar());

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#5cc94f', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-100, 200, 80);
    this.scene.add(sun);
    this.scene.add(makeStaticWorld());

    this.trackGroup = null;
    this.running = false;
    this.camUp = new THREE.Vector3(0, 1, 0);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.timeScale = Number(new URLSearchParams(location.search).get('fast')) || 1; // debug: ?fast=4
    this.loop = this.loop.bind(this);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep a wide view in portrait too.
    this.camera.fov = w < h ? 95 : 75;
    this.camera.updateProjectionMatrix();
  }

  start(track) {
    if (this.track !== track) {
      if (this.trackGroup) {
        this.scene.remove(this.trackGroup);
        disposeTree(this.trackGroup);
      }
      this.track = track;
      this.trackGroup = makeTrackWorld(track);
      this.scene.add(this.trackGroup);
    }
    this.s = 0;
    this.time = 0;
    this.lastClack = 0;
    this.nextWhee = 0;
    this.finished = false;
    this.camUp.set(0, 1, 0);
    this.placeCamera(0, 1);
    this.running = true;
    this.last = performance.now();
    sound.bell();
    sound.windStart();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    sound.windStop();
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
    this.last = now;
    this.time += dt;
    const tr = this.track;

    if (!this.finished && this.time > START_DELAY) {
      const ramp = Math.min(1, (this.time - START_DELAY) / 1.5);
      const v = this.sample(tr.speed, this.s) * ramp;
      this.s = Math.min(tr.length, this.s + v * dt);
      const i = Math.round(this.s / tr.step);

      sound.windSpeed(v / V_MAX);
      if (tr.lift[i] && this.s - this.lastClack > 1.2) {
        this.lastClack = this.s;
        sound.clack();
      }
      while (this.nextWhee < tr.whee.length && tr.whee[this.nextWhee] <= i) {
        this.nextWhee++;
        sound.whee();
      }
      if (this.s >= tr.length - 0.01) {
        this.finished = true;
        sound.windStop();
        sound.cheer();
        this.onFinish();
      }
    }

    this.placeCamera(this.s, 1 - Math.exp(-dt * 8));
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  placeCamera(s, upBlend) {
    const tr = this.track;
    const p = this.vec(tr.pos, s);
    const up = this.vec(tr.up, s).normalize();
    const ahead = Math.min(tr.length, s + LOOK_AHEAD);
    const q = this.vec(tr.pos, ahead).addScaledVector(this.vec(tr.up, ahead).normalize(), EYE);
    if (ahead - s < 1) q.add(this.vec(tr.tan, tr.length).multiplyScalar(LOOK_AHEAD));
    this.camUp.lerp(up, upBlend).normalize();
    this.camera.position.copy(p).addScaledVector(up, EYE);
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(q);
  }

  sample(arr, s) {
    const f = Math.max(0, Math.min(this.track.count - 1, s / this.track.step));
    const i = Math.floor(f);
    const j = Math.min(this.track.count - 1, i + 1);
    return arr[i] + (arr[j] - arr[i]) * (f - i);
  }

  vec(arr, s) {
    const f = Math.max(0, Math.min(this.track.count - 1, s / this.track.step));
    const i = Math.floor(f);
    const j = Math.min(this.track.count - 1, i + 1);
    const k = f - i;
    return new THREE.Vector3(
      arr[i * 3] + (arr[j * 3] - arr[i * 3]) * k,
      arr[i * 3 + 1] + (arr[j * 3 + 1] - arr[i * 3 + 1]) * k,
      arr[i * 3 + 2] + (arr[j * 3 + 2] - arr[i * 3 + 2]) * k,
    );
  }
}

// --- Scene building -------------------------------------------------------

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function makeCar() {
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2.2), mat('#ee4266'));
  body.position.set(0, -1.4, -1.5);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 20, 1, false, 0, Math.PI), mat('#ffd23f'));
  nose.rotation.set(0, 0, Math.PI / 2);
  nose.position.set(0, -1.05, -2.6);
  nose.scale.set(0.5, 1, 1);
  const bar = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 24, Math.PI), mat('#3bceac'));
  bar.position.set(0, -1.0, -0.8);
  bar.rotation.set(-0.3, 0, 0);
  const lights = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat('#ffffff'));
  lights.position.set(0.55, -0.87, -2.62);
  const lights2 = lights.clone();
  lights2.position.x = -0.55;
  car.add(body, nose, bar, lights, lights2);
  return car;
}

function makeStaticWorld() {
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

function makeTrackWorld(tr) {
  const g = new THREE.Group();
  const n = tr.count;
  const P = (i) => new THREE.Vector3(tr.pos[i * 3], tr.pos[i * 3 + 1], tr.pos[i * 3 + 2]);
  const U = (i) => new THREE.Vector3(tr.up[i * 3], tr.up[i * 3 + 1], tr.up[i * 3 + 2]);
  const T = (i) => new THREE.Vector3(tr.tan[i * 3], tr.tan[i * 3 + 1], tr.tan[i * 3 + 2]);
  const side = (i) => new THREE.Vector3().crossVectors(U(i), T(i)).normalize();

  // Rails and a fat spine underneath.
  g.add(new THREE.Mesh(tube(n, (i) => P(i).addScaledVector(side(i), RAIL_GAP), U, side, 0.12), mat('#e63946')));
  g.add(new THREE.Mesh(tube(n, (i) => P(i).addScaledVector(side(i), -RAIL_GAP), U, side, 0.12), mat('#e63946')));
  g.add(new THREE.Mesh(tube(n, (i) => P(i).addScaledVector(U(i), -0.55), U, side, 0.28), mat('#ffd23f')));

  // Ties
  const tieEvery = 2;
  const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.14, 0.35), mat('#7a4a2a'), Math.ceil(n / tieEvery));
  const m = new THREE.Matrix4();
  let t = 0;
  for (let i = 0; i < n; i += tieEvery) {
    const u = U(i);
    m.makeBasis(side(i), u, T(i)).setPosition(P(i).addScaledVector(u, -0.18));
    ties.setMatrixAt(t++, m);
  }
  ties.count = t;
  g.add(ties);

  // Support poles from the spine down to the grass.
  const poles = supportSpots(tr);
  if (poles.length) {
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 1, 8), mat('#dfe6f2'), poles.length);
    poles.forEach((b, k) => {
      m.makeScale(1, b.y, 1).setPosition(b.x, b.y / 2, b.z);
      pole.setMatrixAt(k, m);
    });
    g.add(pole);
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

  // Trees and flowers sprinkled around, keeping clear of the track.
  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(tr.pos, 3));
  const rand = mulberry32(Math.round(tr.length * 13));
  const spots = [];
  for (let k = 0; spots.length < 160 && k < 3000; k++) {
    const x = box.min.x - 120 + rand() * (box.max.x - box.min.x + 240);
    const z = box.min.z - 120 + rand() * (box.max.z - box.min.z + 240);
    let ok = !(x > -6 && x < 15 && Math.abs(z) < 8);
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
  return g;
}

// A tube following a centerline, using the track's own frames so it twists with loops.
function tube(n, center, up, side, radius, sides = 8) {
  const verts = new Float32Array(n * sides * 3);
  const normals = new Float32Array(n * sides * 3);
  for (let i = 0; i < n; i++) {
    const c = center(i);
    const u = up(i);
    const s = side(i);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const nx = u.x * Math.cos(a) + s.x * Math.sin(a);
      const ny = u.y * Math.cos(a) + s.y * Math.sin(a);
      const nz = u.z * Math.cos(a) + s.z * Math.sin(a);
      const o = (i * sides + k) * 3;
      verts.set([c.x + nx * radius, c.y + ny * radius, c.z + nz * radius], o);
      normals.set([nx, ny, nz], o);
    }
  }
  const index = [];
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(index);
  return geo;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => m.dispose());
  });
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
