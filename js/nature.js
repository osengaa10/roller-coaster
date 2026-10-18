// Natural scenery: sky dome, grass, rolling hills, mountains, trees and little ground details.
// Everything that repeats is instanced so it stays fast on an iPad.
import * as THREE from 'three';
import { quality } from './quality.js';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
export const EARTH_R = 50000; // meters; a pretend-small Earth so its curve shows at ~1.5 km up

// --- Wind and ground detail (shader patches shared by both games) ---------------------------

// The breeze: plants sway by how high each vertex is above the plant's root. WIND.value is the
// ride's clock (set every frame); strength is meters of sway per meter of height.
export const WIND = { value: 0 };
export function windy(material, strength) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = WIND;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float windTime;').replace(
      '#include <begin_vertex>',
      /* glsl */ `#include <begin_vertex>
      vec3 rootPos = vec3(0.0);
      #ifdef USE_INSTANCING
        rootPos = instanceMatrix[3].xyz;
      #endif
      float sway = max(transformed.y, 0.0) * ${strength.toFixed(4)} * (0.65 + 0.35 * sin(windTime * 0.37 + rootPos.x * 0.01));
      transformed.x += sin(windTime * 1.7 + rootPos.x * 0.15 + rootPos.z * 0.1) * sway;
      transformed.z += cos(windTime * 1.3 + rootPos.z * 0.13) * sway * 0.6;`,
    );
  };
  material.customProgramCacheKey = () => `wind${strength}`;
  return material;
}

// Big ground textures repeat every few meters, which shows as a grid far away. Mixing in the same
// texture at a much bigger, offset scale breaks that up.
export function detailMap(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `#ifdef USE_MAP
        vec4 texelNear = texture2D( map, vMapUv );
        vec4 texelFar = texture2D( map, vMapUv * 0.137 + vec2( 0.31, 0.17 ) );
        diffuseColor *= mix( texelNear, texelFar, 0.45 );
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'detail-map';
  return material;
}

// Darker low down, lighter up top: a cheap stand-in for light getting into a bush or a crown.
export function shadeByHeight(geo, lo, hi, dark = 0.6) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const v = dark + (1 - dark) * smoothstep(lo, hi, pos.getY(k));
    colors.set([v, v, v], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// --- Noise -------------------------------------------------------------------------------

function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function noise(x, y) {
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
export function fbm(x, y) {
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

export const smoothstep = (a, b, x) => {
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

// A big dome that follows the camera: haze at the horizon, deeper blue overhead, a sun disk with
// a soft halo, a warm glow along the horizon toward the sun (stronger at sunset), and a mix
// toward black space for very tall coasters.
export function makeSky() {
  const uniforms = {
    top: { value: new THREE.Color('#2f7fd8') },
    horizon: { value: new THREE.Color('#cfe8fb') },
    space: { value: new THREE.Color('#060820') },
    spaceMix: { value: 0 },
    dusk: { value: 0 },
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
      uniform float dusk;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        float s = max(dot(d, sunDir), 0.0);
        // Deeper blue overhead, pale haze low down; a little darker below the horizon.
        vec3 c = mix(horizon, top, pow(h, 0.45));
        c = mix(c, horizon * 0.86, smoothstep(0.0, -0.25, d.y));
        // Warm light scattered along the horizon on the sun's side of the sky.
        vec3 warm = mix(vec3(1.0, 0.86, 0.66), vec3(1.0, 0.55, 0.3), dusk);
        float band = exp(-h * mix(9.0, 5.0, dusk)) * pow(s, mix(3.0, 1.5, dusk));
        c = mix(c, warm, band * mix(0.22, 0.6, dusk));
        // The sun: a crisp disk, a bright halo and a wide soft glow.
        float disk = smoothstep(0.99965, 0.9999, s);
        vec3 glow = mix(vec3(1.0, 0.95, 0.82), vec3(1.0, 0.7, 0.4), dusk) * (disk * 8.0 + pow(s, 600.0) * 1.5 + pow(s, 40.0) * 0.3 + pow(s, 6.0) * 0.1);
        c = mix(c + glow, space + glow * 0.6, spaceMix);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// --- Grass -------------------------------------------------------------------------------

let grassTexture = null;
export function getGrassTexture() {
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
  // No fog on the mountains (it made them look see-through): their colors are mixed toward the
  // haze here instead, so they still read as far away.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const forest = new THREE.Color('#4f6f55');
  const rock = new THREE.Color('#7f8aa0');
  const rock2 = new THREE.Color('#68748c');
  const snow = new THREE.Color('#f4f7fb');
  const haze = new THREE.Color('#b9cfe6');
  const c = new THREE.Color();
  const n3 = new THREE.Vector3();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rand() * 0.2;
    const dist = 1450 + rand() * 450;
    const r = 220 + rand() * 260;
    const h = 260 + rand() * 330;
    // Turned from a concave profile (ConeGeometry drops half its triangles when it has several
    // height segments, which left holes).
    const rows = 32;
    const profile = [];
    for (let k = 0; k <= rows; k++) profile.push(new THREE.Vector2(k === rows ? 0 : r * (1 - k / rows) ** 1.3, -h / 2 + (k / rows) * h));
    const geo = new THREE.LatheGeometry(profile, 72);
    const pos = geo.attributes.position;
    // Ridges running down from the peak with gullies between them, plus rocky lumps.
    const ridgeAt = (ang, up) => {
      const w = noise(Math.cos(ang) * 2.2 + i * 5, Math.sin(ang) * 2.2 + up * 1.2) * 0.65 + noise(Math.cos(ang) * 5 + i, Math.sin(ang) * 5 - up * 2) * 0.35;
      return 1 - Math.abs(2 * w - 1);
    };
    const ridges = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      const up = (y + h / 2) / h; // 0 at the base, 1 at the peak
      const ang = Math.atan2(z, x);
      const ridge = ridgeAt(ang, up);
      ridges[k] = ridge;
      const lump = noise(x * 0.012 + i * 3, z * 0.012 + y * 0.01) - 0.5;
      const bump = 0.8 + ridge * 0.32 + lump * 0.12;
      pos.setXYZ(k, x * bump, y + (ridge - 0.5) * h * 0.05 * up, z * bump);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      const up = (y + h / 2) / h;
      const n = noise(x * 0.01 + i * 7, z * 0.01 + y * 0.006);
      const flat = n3.fromBufferAttribute(nor, k).y;
      // Rock in bands (strata), forest at the foot, snow on the high slopes and down the gullies.
      c.copy(rock).lerp(rock2, 0.5 + 0.5 * Math.sin(y * 0.03 + n * 5));
      c.lerp(forest, 1 - smoothstep(0.1, 0.28 + n * 0.12, up));
      const snowLine = 0.47 + n * 0.16 + ridges[k] * 0.1;
      c.lerp(snow, smoothstep(snowLine, snowLine + 0.05, up) * smoothstep(0.05, 0.3, flat));
      c.lerp(haze, 0.3);
      colors.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.Mesh(geo, material);
    m.position.set(center.x + Math.cos(a) * dist, h / 2 - 20, center.z + Math.sin(a) * dist);
    m.rotation.y = rand() * Math.PI;
    m.userData.noShadow = true;
    g.add(m);
  }
  return g;
}

// Puffy clouds with flat bottoms, shaded once when built (sunlit white tops, blue-grey
// undersides), all merged into one mesh. Plus a few thin wisps high up.
export function makeClouds() {
  const g = new THREE.Group();
  const rand = mulberry32(7);
  // One indexed puff (the icosahedron comes unindexed: three copies of every corner).
  const raw = new THREE.IcosahedronGeometry(1, 2).attributes.position;
  const corners = new Map();
  const unique = [];
  const index = [];
  for (let j = 0; j < raw.count; j++) {
    const key = [raw.getX(j), raw.getY(j), raw.getZ(j)].map((n) => n.toFixed(4)).join();
    if (!corners.has(key)) {
      corners.set(key, unique.length / 3);
      unique.push(raw.getX(j), raw.getY(j), raw.getZ(j));
    }
    index.push(corners.get(key));
  }
  const pp = new THREE.Float32BufferAttribute(unique, 3);
  const per = pp.count;
  const positions = [];
  const colors = [];
  const indices = [];
  const top = new THREE.Color('#ffffff');
  const under = new THREE.Color('#aebdd0');
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  let base = 0;
  for (let cl = 0; cl < 45; cl++) {
    const cx = (rand() - 0.3) * 1600;
    const cy = 80 + rand() * 90;
    const cz = (rand() - 0.5) * 1600;
    const puffs = 9 + Math.floor(rand() * 7);
    const width = puffs * 6;
    for (let k = 0; k < puffs; k++) {
      // Bigger puffs in the middle make a dome; all of them sit on the same flat bottom.
      const mid = 1 - Math.abs(k / (puffs - 1) - 0.5) * 2;
      const r = 6 + rand() * 6 + mid * 7;
      const px = (k / (puffs - 1) - 0.5) * width + rand() * 4;
      const py = r * 0.25 + rand() * 3 + mid * 4;
      const pz = rand() * 14 - 7;
      for (let j = 0; j < per; j++) {
        v.fromBufferAttribute(pp, j);
        // Shade by the puff's own normal: lit toward the sun, darker below.
        const lit = 0.82 + 0.22 * Math.max(0, v.dot(SUN_DIR));
        const x = px + v.x * r * 1.25;
        const y = Math.max(0, py + v.y * r * 0.7);
        const z = pz + v.z * r;
        c.copy(under).lerp(top, smoothstep(0, 16, y)).multiplyScalar(lit);
        positions.push(cx + x, cy + y, cz + z);
        colors.push(c.r, c.g, c.b);
      }
      for (const i of index) indices.push(base + i);
      base += per;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  const clouds = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  clouds.userData.noShadow = true;
  g.add(clouds);

  // Wisps: thin streaky cloud high above, lying flat.
  const wisp = new THREE.MeshBasicMaterial({ map: getWispTexture(), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  for (let k = 0; k < 7; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(700, 160), wisp);
    m.rotation.set(-Math.PI / 2, 0, rand() * 0.6 - 0.3);
    m.position.set((rand() - 0.3) * 2000, 380 + rand() * 120, (rand() - 0.5) * 2000);
    m.userData.noShadow = true;
    g.add(m);
  }
  return g;
}

let wispTexture = null;
function getWispTexture() {
  if (wispTexture) return wispTexture;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  const rand = mulberry32(23);
  for (let i = 0; i < 70; i++) {
    const len = 50 + rand() * 130;
    const x = len + 6 + rand() * (500 - 2 * len);
    const y = 30 + rand() * 68;
    g.save();
    g.translate(x, y);
    g.scale(len / 20, 1);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 20);
    grad.addColorStop(0, `rgba(255,255,255,${0.15 + rand() * 0.25})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(-20, -20, 40, 40);
    g.restore();
  }
  wispTexture = new THREE.CanvasTexture(c);
  wispTexture.colorSpace = THREE.SRGBColorSpace;
  return wispTexture;
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
  // The ground curves down like the planet, but only past the park so the track area stays level.
  const level = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2 + 300;
  const curve = (x, z) => Math.max(0, Math.hypot(x - center.x, z - center.z) - level) ** 2 / (2 * EARTH_R);
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
  geo.computeVertexNormals();
  // Bare rock showing on the steep sides of the hills.
  const nor = geo.attributes.normal;
  for (let k = 0; k < pos.count; k++) {
    const steep = smoothstep(0.93, 0.8, nor.getY(k));
    if (steep <= 0) continue;
    for (let j = 0; j < 3; j++) colors[k * 3 + j] += ([1.35, 1.25, 1.2][j] - colors[k * 3 + j]) * steep * 0.7;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const tex = getGrassTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(size / 7, size / 7);
  g.add(new THREE.Mesh(geo, detailMap(new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }))));
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

  // Trees: tiered pines, round leafy trees and white birches. Near ones cast real shadows (or
  // soft blob shadows when real ones are off); far ones don't.
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
  trees.forEach((t, k) => {
    const r = rand();
    t.kind = r < 0.5 ? 'pine' : r < 0.85 ? 'leafy' : 'birch';
    t.scale = (t.near ? 0.7 : 0.9) + rand() * 0.9;
    t.sy = t.scale * (0.9 + (k % 5) * 0.06);
    t.turn = k * 2.4;
    t.tint = k;
    t.y = heightAt(t.x, t.z);
  });
  const bark = new THREE.MeshLambertMaterial({ color: '#6b4a32' });
  const leaves = windy(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, vertexColors: true }), 0.018);
  const pineGreens = ['#2f6b3a', '#2a5f34', '#3a7a45', '#24563a'].map((c) => new THREE.Color(c));
  const leafGreens = ['#4f9a3a', '#5fae44', '#3f8a35', '#74b84c', '#8fbf4a'].map((c) => new THREE.Color(c));
  const birchGreens = ['#9ccc4a', '#b5d65a', '#86bd45'].map((c) => new THREE.Color(c));
  const species = {
    pine: [[new THREE.CylinderGeometry(0.25, 0.4, 2.4, 7).translate(0, 1.2, 0), bark, null], [pineFoliage(), leaves, pineGreens]],
    leafy: [[new THREE.CylinderGeometry(0.3, 0.5, 3.4, 7).translate(0, 1.7, 0), bark, null], [leafyFoliage(), leaves, leafGreens]],
    leafyFar: [[new THREE.CylinderGeometry(0.3, 0.5, 3.4, 5).translate(0, 1.7, 0), bark, null], [leafyFoliage(4), leaves, leafGreens]],
    birch: [[birchTrunk(), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), null], [birchFoliage(), leaves, birchGreens]],
  };
  for (const [kind, parts] of Object.entries(species)) {
    for (const near of [true, false]) {
      if (kind === 'leafy' && !near) continue; // far leafy trees are 'leafyFar'
      if (kind === 'leafyFar' && near) continue;
      const list = trees.filter((t) => (t.kind === kind || (kind === 'leafyFar' && t.kind === 'leafy')) && t.near === near);
      if (!list.length) continue;
      for (const [shape, material, tints] of parts) {
        const mesh = new THREE.InstancedMesh(shape, material, list.length);
        list.forEach((t, k) => {
          place(mesh, k, t.x, t.y, t.z, t.scale, t.sy, t.turn);
          if (tints) mesh.setColorAt(k, tints[t.tint % tints.length]);
        });
        if (!near) mesh.userData.noShadow = true;
        g.add(mesh);
      }
    }
  }
  const near = trees.filter((t) => t.near);
  const shadows = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
    near.length,
  );
  near.forEach((t, k) => place(shadows, k, t.x + 0.8, t.y + 0.06, t.z + 0.8, t.scale * 2.6, 1));
  shadows.userData.blobShadow = true;
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
  const bushMesh = new THREE.InstancedMesh(shadeByHeight(new THREE.IcosahedronGeometry(1, 1), -0.8, 0.9, 0.55), leaves, bushes.length);
  bushes.forEach((b, k) => {
    const sc = 0.6 + rand() * 0.9;
    place(bushMesh, k, b.x, sc * 0.45, b.z, sc, sc * 0.75);
    bushMesh.setColorAt(k, leafGreens[k % leafGreens.length]);
  });
  // Grass clumps (crossed cards of blades) and flowers with petals on little stems.
  const tufts = scatter(Math.round(1400 * quality().grass), 2.5, 45);
  const tuftMesh = new THREE.InstancedMesh(
    grassClumpGeometry(),
    windy(new THREE.MeshLambertMaterial({ color: '#ffffff', map: grassBladeTexture(), alphaTest: 0.45 }), 0.12),
    tufts.length,
  );
  const tuftColors = ['#e6f5d0', '#ffffff', '#cfe8b0'].map((c) => new THREE.Color(c));
  tufts.forEach((b, k) => {
    place(tuftMesh, k, b.x, 0, b.z, 0.8 + rand() * 0.8, 0.6 + rand() * 0.9);
    tuftMesh.setColorAt(k, tuftColors[k % 3]);
  });
  tuftMesh.userData.noCast = true;
  const flowers = scatter(900, 3, 50);
  const flowerMesh = new THREE.InstancedMesh(
    flowerGeometry(),
    new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#222222', vertexColors: true }),
    flowers.length,
  );
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.02, 0.32, 4).translate(0, 0.16, 0), new THREE.MeshLambertMaterial({ color: '#4c8a2f' }), flowers.length);
  const petals = ['#ff5d73', '#ffd23f', '#ffffff', '#b388ff', '#ff9f43'].map((c) => new THREE.Color(c));
  flowers.forEach((b, k) => {
    const sc = 0.8 + rand() * 0.6;
    const turn = rand() * Math.PI * 2;
    place(flowerMesh, k, b.x, 0, b.z, sc, sc, turn);
    place(stems, k, b.x, 0, b.z, sc, sc, turn);
    flowerMesh.setColorAt(k, petals[k % petals.length]);
  });
  flowerMesh.userData.noCast = stems.userData.noCast = true;
  const rocks = scatter(90, 5, 60);
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#8d8f94', flatShading: true }), rocks.length);
  rocks.forEach((b, k) => {
    const sc = 0.3 + rand() * 0.9;
    place(rockMesh, k, b.x, sc * 0.3, b.z, sc, sc * 0.6);
  });
  g.add(bushMesh, tuftMesh, flowerMesh, stems, rockMesh);
  return g;
}

export function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const withUv = parts.every((g) => g.attributes.uv);
  const withColor = parts.every((g) => g.attributes.color);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = withUv ? new Float32Array(count * 2) : null;
  const col = withColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

// Four tiers, each darker underneath where the tier above shades it.
function pineFoliage() {
  return merge(
    [
      [2.4, 3.2, 3.1],
      [1.95, 2.9, 4.6],
      [1.5, 2.6, 6.0],
      [1.0, 2.2, 7.3],
    ].map(([r, h, y]) => shadeByHeight(new THREE.ConeGeometry(r, h, 10).translate(0, y, 0), y - h / 2, y + h / 2, 0.5)),
  );
}

// blobs: 8 for trees up close, fewer (and bigger) for far-off ones nobody sees in detail.
export function leafyFoliage(blobs = 8) {
  const blob = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
  const all = [
    blob(2.0, 0, 4.9, 0),
    blob(1.5, 1.4, 4.3, 0.5),
    blob(1.6, -1.3, 4.5, -0.5),
    blob(1.4, 0.3, 6.0, -0.2),
    blob(1.3, -0.4, 4.0, 1.3),
    blob(1.2, 0.6, 4.1, -1.3),
    blob(1.1, -0.9, 5.7, 0.7),
    blob(1.0, 1.1, 5.6, 0.9),
  ];
  const crown = blobs >= all.length ? merge(all) : merge(all.slice(0, blobs).map((b, k) => (k ? b.scale(1.15, 1.15, 1.15) : b)));
  return shadeByHeight(crown, 2.8, 6.6, 0.5);
}

// A slim white trunk with dark marks, and a tall oval crown.
function birchTrunk() {
  const geo = new THREE.CylinderGeometry(0.16, 0.24, 4.2, 7, 6).translate(0, 2.1, 0);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) {
    const mark = noise(pos.getY(k) * 3.1, Math.atan2(pos.getZ(k), pos.getX(k)) * 2) > 0.72 ? 0.25 : 0.95;
    colors.set([mark, mark, mark * 0.97], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function birchFoliage() {
  const blob = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 1).scale(1, 1.4, 1).translate(x, y, z);
  return shadeByHeight(merge([blob(1.3, 0, 5.2, 0), blob(1.0, 0.6, 4.4, 0.3), blob(1.0, -0.5, 4.6, -0.3), blob(0.9, 0.1, 6.4, 0.1)]), 3.4, 7, 0.55);
}

// Three crossed cards for a clump of grass blades, standing on the ground (each card twice, back
// to back, since a two-sided material would light the back faces from below). Normals point up so
// the clump is lit like the ground it grows from, whichever way it faces.
function grassClumpGeometry() {
  const cards = [0, 1, 2, 3, 4, 5].map((k) => new THREE.PlaneGeometry(0.9, 0.6).translate(0, 0.3, 0).rotateY((k * Math.PI) / 3));
  const geo = merge(cards);
  const nor = geo.attributes.normal;
  for (let k = 0; k < nor.count; k++) nor.setXYZ(k, 0, 1, 0);
  return geo;
}

// Five petals round a yellow middle (petals are white, so the instance color tints them).
function flowerGeometry() {
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push(new THREE.SphereGeometry(0.09, 4, 2).scale(1, 0.35, 0.6).translate(0.1, 0, 0).rotateY(a).translate(0, 0.33, 0));
  }
  for (const p of parts) shadeByHeight(p, 0, 1, 1);
  const middle = new THREE.SphereGeometry(0.06, 5, 3).translate(0, 0.35, 0);
  const mc = new Float32Array(middle.attributes.position.count * 3);
  for (let k = 0; k < mc.length; k += 3) mc.set([1, 0.82, 0.25], k);
  middle.setAttribute('color', new THREE.BufferAttribute(mc, 3));
  return merge([...parts, middle]);
}

// Blades of grass on a see-through card: dark at the root, lighter at the tips.
let bladeTexture = null;
export function grassBladeTexture() {
  if (bladeTexture) return bladeTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d');
  const rand = mulberry32(31);
  for (let i = 0; i < 34; i++) {
    const x = 8 + rand() * 112;
    const h = 40 + rand() * 54;
    const lean = (rand() - 0.5) * 30;
    const grad = g.createLinearGradient(0, 96, 0, 96 - h);
    grad.addColorStop(0, '#3d6e22');
    grad.addColorStop(1, rand() < 0.5 ? '#b5e07a' : '#9fd060');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - 2.5, 96);
    g.quadraticCurveTo(x + lean * 0.3, 96 - h * 0.6, x + lean, 96 - h);
    g.quadraticCurveTo(x + lean * 0.3 + 1, 96 - h * 0.6, x + 2.5, 96);
    g.fill();
  }
  bladeTexture = new THREE.CanvasTexture(c);
  bladeTexture.colorSpace = THREE.SRGBColorSpace;
  return bladeTexture;
}

// The rest of the planet: a big curved cap of land, sea and clouds under the park, only really
// visible from way up high (near the ground the grass covers it).
// kind 'beach': mostly ocean, with the park on a tropical island in the middle.
const earthTextures = {};
function getEarthTexture(kind) {
  if (earthTextures[kind]) return earthTextures[kind];
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
      const r = Math.hypot(u, v);
      const land =
        kind === 'beach'
          ? fbm(x / 50 + 3, y / 50 + 5) - 0.05 - r * 1.3 + 0.5 * Math.max(0, 1 - r * 14)
          : fbm(x / 70 + 3, y / 70 + 5) + 0.38 - r * 1.1;
      const relief = fbm(x / 25 + 11, y / 25 + 2);
      let col;
      if (land < 0.42) col = kind === 'beach' ? mix([18, 80, 165], [60, 200, 215], smoothstep(0.3, 0.42, land)) : mix([20, 70, 150], [45, 120, 190], smoothstep(0.2, 0.42, land));
      else if (land < 0.45) col = [216, 200, 144];
      else if (relief > 0.68) col = relief > 0.76 ? [240, 242, 245] : [130, 128, 112];
      else col = mix([90, 168, 60], [52, 112, 44], smoothstep(0.35, 0.65, relief));
      const cloud = smoothstep(0.58, 0.75, fbm(x / 40 + 31, y / 40 + 17));
      col = mix(col, [255, 255, 255], cloud * 0.85);
      img.data.set([col[0], col[1], col[2], 255], (y * size + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  earthTextures[kind] = tex;
  return tex;
}

export function makeEarth(center, kind = 'park') {
  const cap = 0.5; // radians of the sphere around the top
  const geo = new THREE.SphereGeometry(EARTH_R, 128, 48, 0, Math.PI * 2, 0, cap);
  // Map the texture straight down onto the cap (no squashed poles).
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const span = 2 * EARTH_R * Math.sin(cap);
  for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k) / span + 0.5, pos.getZ(k) / span + 0.5);
  const earth = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: getEarthTexture(kind) }));
  earth.position.set(center.x, -EARTH_R - 3, center.z); // just under the grass
  return earth;
}
