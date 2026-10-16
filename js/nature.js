// Natural scenery: sky dome, grass, rolling hills, mountains, trees and little ground details.
// Everything that repeats is instanced so it stays fast on an iPad.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
export const EARTH_R = 200000; // meters; a pretend-small Earth so its curve shows at ~10 km up

// --- Noise -------------------------------------------------------------------------------

function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Layered noise in roughly 0..1.
function fbm(x, y) {
  let sum = 0;
  let amp = 0.5;
  for (let o = 0; o < 4; o++) {
    sum += noise(x, y) * amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Sky ---------------------------------------------------------------------------------

// A big dome that follows the camera: haze at the horizon, deeper blue overhead, a glowing sun,
// and a mix toward black space for very tall coasters.
export function makeSky() {
  const uniforms = {
    top: { value: new THREE.Color('#2f7fd8') },
    horizon: { value: new THREE.Color('#cfe8fb') },
    space: { value: new THREE.Color('#060820') },
    spaceMix: { value: 0 },
    sunDir: { value: SUN_DIR.clone() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 space;
      uniform float spaceMix;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(horizon, top, pow(h, 0.5));
        float s = max(dot(d, sunDir), 0.0);
        vec3 glow = vec3(1.0, 0.92, 0.7) * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
        c = mix(c + glow, space + glow * 0.6, spaceMix);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// --- Grass -------------------------------------------------------------------------------

let grassTexture = null;
function getGrassTexture() {
  if (grassTexture) return grassTexture;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#5aa83c';
  g.fillRect(0, 0, size, size);
  const rand = mulberry32(3);
  // Soft darker and lighter patches.
  for (let i = 0; i < 60; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand() < 0.5 ? '60,120,40' : '120,190,80';
    grad.addColorStop(0, `rgba(${tone},0.35)`);
    grad.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grad;
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.save();
      g.translate(dx, dy);
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
    }
  }
  // Thousands of little blades.
  const blades = ['#4d9a33', '#66b844', '#3f8a2a', '#79c450', '#5fae3a', '#8bcf5c'];
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  for (let i = 0; i < 14000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 7;
    const a = -Math.PI / 2 + (rand() - 0.5) * 0.9;
    g.strokeStyle = blades[(rand() * blades.length) | 0];
    g.globalAlpha = 0.55 + rand() * 0.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.globalAlpha = 1;
  grassTexture = new THREE.CanvasTexture(c);
  grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.colorSpace = THREE.SRGBColorSpace;
  grassTexture.anisotropy = 8;
  return grassTexture;
}

// --- Mountains and clouds (static) ---------------------------------------------------------

export function makeMountains(center = new THREE.Vector3(300, 0, 0)) {
  const g = new THREE.Group();
  const rand = mulberry32(11);
  // No haze on the mountains (it made them look see-through); their blue-grey rock
  // already reads as far away.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
  const rock = new THREE.Color('#8794ab');
  const rock2 = new THREE.Color('#76849c');
  const snow = new THREE.Color('#f4f7fb');
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rand() * 0.2;
    const dist = 1450 + rand() * 450;
    const r = 220 + rand() * 260;
    const h = 260 + rand() * 330;
    const geo = new THREE.ConeGeometry(r, h, 9, 6).toNonIndexed();
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      const up = (y + h / 2) / h; // 0 at the base, 1 at the peak
      const n = noise(x * 0.02 + i * 7, z * 0.02 + y * 0.01);
      if (up < 0.98) pos.setXYZ(k, x * (0.85 + n * 0.3), y + (n - 0.5) * h * 0.08, z * (0.85 + n * 0.3));
      c.copy(up > 0.6 + n * 0.15 ? snow : n > 0.5 ? rock : rock2);
      colors.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    m.position.set(center.x + Math.cos(a) * dist, h / 2 - 20, center.z + Math.sin(a) * dist);
    m.rotation.y = rand() * Math.PI;
    g.add(m);
  }
  return g;
}

export function makeClouds() {
  const g = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 2);
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#9aa4b0' });
  const rand = mulberry32(7);
  for (let c = 0; c < 45; c++) {
    const cloud = new THREE.Group();
    const puffs = 6 + Math.floor(rand() * 5);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.Mesh(puff, white);
      const r = 7 + rand() * 9;
      m.scale.set(r * 1.2, r * 0.6, r);
      m.position.set((k - puffs / 2) * 8 + rand() * 4, rand() * 5, rand() * 12 - 6);
      cloud.add(m);
    }
    cloud.position.set((rand() - 0.3) * 1600, 80 + rand() * 90, (rand() - 0.5) * 1600);
    g.add(cloud);
  }
  return g;
}

// --- Landscape around a track --------------------------------------------------------------

// Ground with rolling hills that stay flat near the coaster, plus trees, bushes, flowers,
// grass tufts and rocks. keepOut(x, z) says where nothing may grow (track, pond, station).
export function makeLandscape(bounds, keepOut, nearTrack) {
  const g = new THREE.Group();
  const center = bounds.getCenter(new THREE.Vector3());
  const flat = (x, z) => {
    const dx = Math.max(bounds.min.x - x, 0, x - bounds.max.x);
    const dz = Math.max(bounds.min.z - z, 0, z - bounds.max.z);
    return Math.hypot(dx, dz);
  };
  const curve = (x, z) => ((x - center.x) ** 2 + (z - center.z) ** 2) / (2 * EARTH_R);
  const hills = (x, z) => {
    const fadeOut = 1 - smoothstep(2200, 2900, Math.hypot(x - center.x, z - center.z)); // meets the Earth smoothly
    return fbm(x / 280, z / 280) * 110 * smoothstep(70, 520, flat(x, z)) * fadeOut;
  };
  const heightAt = (x, z) => hills(x, z) - curve(x, z);

  // Ground
  const size = 6000;
  const geo = new THREE.PlaneGeometry(size, size, 180, 180);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center.x, 0, center.z);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    pos.setY(k, heightAt(x, z));
    const shade = 0.78 + fbm(x / 140, z / 140) * 0.42;
    const dry = smoothstep(0.55, 0.8, fbm(x / 400 + 9, z / 400));
    colors.set([shade * (1 + dry * 0.25), shade, shade * (1 - dry * 0.3)], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = getGrassTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(size / 7, size / 7);
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true })));
  g.add(makeEarth(center));

  const rand = mulberry32(Math.round(center.x * 7 + center.z * 3) + 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const place = (mesh, k, x, y, z, scale, sy = scale, turn = rand() * Math.PI * 2) => {
    q.setFromAxisAngle(Y, turn);
    mesh.setMatrixAt(k, m.compose(p.set(x, y, z), q, s.set(scale, sy, scale)));
  };

  // Trees: tiered pines and round leafy trees, near ones with soft shadows.
  const trees = [];
  for (let k = 0; trees.length < 260 && k < 6000; k++) {
    const x = bounds.min.x - 150 + rand() * (bounds.max.x - bounds.min.x + 300);
    const z = bounds.min.z - 150 + rand() * (bounds.max.z - bounds.min.z + 300);
    if (!keepOut(x, z, 8)) trees.push({ x, z, near: true });
  }
  for (let k = 0; k < 650; k++) {
    const a = rand() * Math.PI * 2;
    const r = 160 + rand() * 650;
    const x = center.x + Math.cos(a) * (r + (bounds.max.x - bounds.min.x) / 2);
    const z = center.z + Math.sin(a) * (r + (bounds.max.z - bounds.min.z) / 2);
    trees.push({ x, z, near: false });
  }
  for (const t of trees) {
    t.pine = rand() < 0.55;
    t.scale = (t.near ? 0.7 : 0.9) + rand() * 0.9;
    t.y = heightAt(t.x, t.z);
  }
  const pines = trees.filter((t) => t.pine);
  const leafy = trees.filter((t) => !t.pine);
  const bark = new THREE.MeshLambertMaterial({ color: '#6b4a32' });
  const leaves = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const pineGreens = ['#2f6b3a', '#2a5f34', '#3a7a45', '#24563a'].map((c) => new THREE.Color(c));
  const leafGreens = ['#4f9a3a', '#5fae44', '#3f8a35', '#74b84c', '#8fbf4a'].map((c) => new THREE.Color(c));
  const parts = [
    [pines, new THREE.CylinderGeometry(0.25, 0.4, 2.4, 6).translate(0, 1.2, 0), bark, null],
    [pines, pineFoliage(), leaves, pineGreens],
    [leafy, new THREE.CylinderGeometry(0.3, 0.5, 3.4, 6).translate(0, 1.7, 0), bark, null],
    [leafy, leafyFoliage(), leaves, leafGreens],
  ];
  for (const [list, shape, material, tints] of parts) {
    const mesh = new THREE.InstancedMesh(shape, material, list.length);
    list.forEach((t, k) => {
      place(mesh, k, t.x, t.y, t.z, t.scale, t.scale * (0.9 + (k % 5) * 0.06), k * 2.4);
      if (tints) mesh.setColorAt(k, tints[k % tints.length]);
    });
    g.add(mesh);
  }
  const near = trees.filter((t) => t.near);
  const shadows = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
    near.length,
  );
  near.forEach((t, k) => place(shadows, k, t.x + 0.8, t.y + 0.06, t.z + 0.8, t.scale * 2.6, 1));
  g.add(shadows);

  // Close to the track: bushes, flowers, grass tufts and rocks rush past and show the speed.
  const scatter = (count, minD, maxD) => {
    const out = [];
    for (let k = 0; out.length < count && k < count * 20; k++) {
      const at = nearTrack(rand(), minD + rand() * (maxD - minD), rand() < 0.5 ? -1 : 1);
      if (at && !keepOut(at.x, at.z, minD)) out.push(at);
    }
    return out;
  };
  const bushes = scatter(320, 4, 40);
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaves, bushes.length);
  bushes.forEach((b, k) => {
    const sc = 0.6 + rand() * 0.9;
    place(bushMesh, k, b.x, sc * 0.45, b.z, sc, sc * 0.75);
    bushMesh.setColorAt(k, leafGreens[k % leafGreens.length]);
  });
  const tufts = scatter(1400, 2.5, 45);
  const tuftMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.12, 0.7, 4).translate(0, 0.35, 0),
    new THREE.MeshLambertMaterial({ color: '#ffffff' }),
    tufts.length,
  );
  const tuftColors = ['#3f8a2a', '#5fae3a', '#79c450'].map((c) => new THREE.Color(c));
  tufts.forEach((b, k) => {
    place(tuftMesh, k, b.x, 0, b.z, 0.8 + rand() * 0.8, 0.6 + rand() * 0.9);
    tuftMesh.setColorAt(k, tuftColors[k % 3]);
  });
  const flowers = scatter(900, 3, 50);
  const flowerMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.16, 0).translate(0, 0.32, 0),
    new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#222222' }),
    flowers.length,
  );
  const petals = ['#ff5d73', '#ffd23f', '#ffffff', '#b388ff', '#ff9f43'].map((c) => new THREE.Color(c));
  flowers.forEach((b, k) => {
    place(flowerMesh, k, b.x, 0, b.z, 0.8 + rand() * 0.6);
    flowerMesh.setColorAt(k, petals[k % petals.length]);
  });
  const rocks = scatter(90, 5, 60);
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#8d8f94', flatShading: true }), rocks.length);
  rocks.forEach((b, k) => {
    const sc = 0.3 + rand() * 0.9;
    place(rockMesh, k, b.x, sc * 0.3, b.z, sc, sc * 0.6);
  });
  g.add(bushMesh, tuftMesh, flowerMesh, rockMesh);
  return g;
}

function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

function pineFoliage() {
  return merge([
    new THREE.ConeGeometry(2.3, 3.4, 8).translate(0, 3.3, 0),
    new THREE.ConeGeometry(1.8, 3.0, 8).translate(0, 5.0, 0),
    new THREE.ConeGeometry(1.2, 2.6, 8).translate(0, 6.6, 0),
  ]);
}

function leafyFoliage() {
  const blob = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
  return merge([blob(2.2, 0, 4.8, 0), blob(1.6, 1.3, 4.2, 0.5), blob(1.7, -1.2, 4.4, -0.5), blob(1.5, 0.2, 5.9, -0.2), blob(1.4, -0.3, 4.0, 1.2)]);
}

// The rest of the planet: a big curved cap of land, sea and clouds under the park, only really
// visible from way up high (near the ground the grass covers it).
let earthTexture = null;
function getEarthTexture() {
  if (earthTexture) return earthTexture;
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5;
      const v = y / size - 0.5;
      // Land around the park in the middle, ocean further out.
      const land = fbm(x / 70 + 3, y / 70 + 5) + 0.38 - Math.hypot(u, v) * 1.1;
      const relief = fbm(x / 25 + 11, y / 25 + 2);
      let col;
      if (land < 0.42) col = mix([20, 70, 150], [45, 120, 190], smoothstep(0.2, 0.42, land));
      else if (land < 0.45) col = [216, 200, 144];
      else if (relief > 0.68) col = relief > 0.76 ? [240, 242, 245] : [130, 128, 112];
      else col = mix([90, 168, 60], [52, 112, 44], smoothstep(0.35, 0.65, relief));
      const cloud = smoothstep(0.58, 0.75, fbm(x / 40 + 31, y / 40 + 17));
      col = mix(col, [255, 255, 255], cloud * 0.85);
      img.data.set([col[0], col[1], col[2], 255], (y * size + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  earthTexture = new THREE.CanvasTexture(c);
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  return earthTexture;
}

function makeEarth(center) {
  const cap = 0.5; // radians of the sphere around the top
  const geo = new THREE.SphereGeometry(EARTH_R, 128, 48, 0, Math.PI * 2, 0, cap);
  // Map the texture straight down onto the cap (no squashed poles).
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const span = 2 * EARTH_R * Math.sin(cap);
  for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k) / span + 0.5, pos.getZ(k) / span + 0.5);
  const earth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: getEarthTexture() }));
  earth.position.set(center.x, -EARTH_R - 3, center.z); // just under the grass
  return earth;
}
