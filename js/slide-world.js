// The water slide's 3D world: the slide (open trough, closed tubes, toilet bowls), water jets,
// supports, the start tower, the splash pool, waterfall caves, spray fountains and rubber ducks.
import * as THREE from 'three';
import { supportSpots, supportLegs, starSpots, splashSpot, tunnelRuns } from './track.js';
import { tube, beam, mat, shiny, Y_AXIS } from './scenery.js';
import { makeBeachLandscape } from './tropical.js';
import { getDot, makeMist } from './effects.js';
import { mulberry32, fbm, noise } from './nature.js';
import { makeWater } from './water.js';
import { plankTexture, concreteTexture, tileTexture, causticsTexture, drainTexture, stoneTexture, glowTexture } from './textures.js';

const RT = 1.15; // trough / tube radius
const SINK = 0.12; // the raft rides this far above the bottom of the trough
const OPEN_ARC = 1.75; // radians either side of the bottom: the open trough's walls
const RW = 2.1; // rapids: a wide, shallow channel
const RAPIDS_ARC = 1.0;
const WAVE_LENGTH = 2.8; // meters between wave crests (matches track.js)
const HIGH = 300; // meters: above this, slide geometry is built with less detail

// A mesh moved into place by a matrix (Object3D.applyMatrix4 doesn't hand the mesh back).
function posed(mesh, matrix) {
  mesh.applyMatrix4(matrix);
  return mesh;
}

// Water streaks running down the slide (scrolled every frame). Foam: white water for the rapids.
function streakTexture(foam = false) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = foam ? 'rgba(200,240,255,0.7)' : 'rgba(150,215,255,0.55)';
  g.fillRect(0, 0, 64, 256);
  const rand = mulberry32(foam ? 19 : 8);
  if (foam) {
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`;
      const x = rand() * 64;
      const y = rand() * 256;
      for (const dy of [0, 256, -256]) {
        g.beginPath();
        g.ellipse(x, y + dy, 3 + rand() * 8, 2 + rand() * 5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = rand() * 64;
    const y = rand() * 256;
    const len = 12 + rand() * 40;
    g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.6})`;
    for (const dy of [0, 256, -256]) g.fillRect(x, y + dy, 1 + rand() * 2.5, len);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Candy stripes for closed tubes: white bands over a lighter base, wrapping around the tube.
function tubeStripeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c8c8c8';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  for (let k = -2; k < 4; k++) {
    g.beginPath();
    g.moveTo(k * 64, 0);
    g.lineTo(k * 64 + 32, 0);
    g.lineTo(k * 64 + 32 + 128, 128);
    g.lineTo(k * 64 + 128, 128);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Swirling stripes for a bowl, in its crayon color.
function bowlTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let k = -4; k < 8; k++) {
    g.beginPath();
    g.moveTo(k * 42, 0);
    g.lineTo(k * 42 + 16, 0);
    g.lineTo(k * 42 + 16 + 140, 256);
    g.lineTo(k * 42 + 140, 256);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Whitewater on a wave crest: a frothy band of foam across the channel (v = 0.5 is the crest),
// thick on top of the wave and trailing off into bubbles downstream. Transparent elsewhere.
function crestTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  for (let i = 0; i < 420; i++) {
    const downstream = rand() < 0.35;
    const x = rand() * 128;
    const y = 128 + (downstream ? Math.abs(gauss()) * 90 : gauss() * 26);
    const r = downstream ? 1.5 + rand() * 3 : 3 + rand() * 9;
    g.fillStyle = `rgba(255,255,255,${(downstream ? 0.35 : 0.55) + rand() * 0.4})`;
    for (const dx of [0, 128, -128]) {
      g.beginPath();
      g.ellipse(x + dx, y, r * 1.4, r, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A whirlpool: spiral arms of foam on see-through water.
function swirlTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(90,200,250,0.35)';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) {
    g.lineWidth = 5;
    g.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const a = arm * ((Math.PI * 2) / 5) + t * Math.PI * 2.2;
      const r = 10 + t * 118;
      g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    }
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}

// A curtain of falling water, for the waterfalls over the caves and the spill off the end.
function fallTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(200,235,255,0.35)';
  g.fillRect(0, 0, 128, 256);
  const rand = mulberry32(13);
  for (let i = 0; i < 140; i++) {
    const x = rand() * 128;
    const y = rand() * 256;
    g.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.6})`;
    for (const dy of [0, 256, -256]) g.fillRect(x, y + dy, 1 + rand() * 3, 20 + rand() * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A rounded boulder, lumpy and flat underneath, grey with moss on top (vertex colors, so the
// instance color just tints it).
function boulderGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  const rock = new THREE.Color('#8d8a84');
  const rock2 = new THREE.Color('#a59d90');
  const moss = new THREE.Color('#5f8a3a');
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k);
    const n = noise(v.x * 1.8 + 3, v.z * 1.8 + v.y * 1.8);
    v.multiplyScalar(0.82 + n * 0.36);
    v.y = Math.max(v.y, -0.45);
    pos.setXYZ(k, v.x, v.y, v.z);
    c.copy(rock).lerp(rock2, noise(v.x * 4, v.z * 4 + v.y * 3)).lerp(moss, v.y > 0.3 + n * 0.25 ? 0.75 : 0);
    colors.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function duckGeometry() {
  const g = new THREE.Group();
  // Glossy squeaky rubber.
  const yellow = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#4a3600', roughness: 0.32 });
  const orange = new THREE.MeshStandardMaterial({ color: '#ff8c42', emissive: '#3a1800', roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 18), yellow);
  body.scale.set(1, 0.75, 1.25);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12), yellow);
  tail.position.set(0, 0.22, -0.5);
  tail.rotation.x = -0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 16), yellow);
  head.position.set(0, 0.48, 0.28);
  // Beak in two halves, a little open, like he's quacking.
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10), orange);
  top.scale.set(1.2, 0.35, 1.35);
  top.position.set(0, 0.44, 0.55);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), orange);
  bottom.scale.set(1.05, 0.25, 1.15);
  bottom.position.set(0, 0.39, 0.52);
  g.add(body, tail, head, top, bottom);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10), yellow);
    wing.scale.set(0.35, 0.6, 1.1);
    wing.position.set(s * 0.37, 0.1, -0.05);
    wing.rotation.x = -0.3;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.1 }));
    eye.position.set(s * 0.12, 0.56, 0.49);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    shine.position.set(s * 0.12 + 0.015, 0.575, 0.535);
    g.add(wing, eye, shine);
  }
  return g;
}

// Everything that depends on the drawing. Returns the group plus the bits the ride animates.
export function makeSlideWorld(tr, eye) {
  const g = new THREE.Group();
  const n = tr.count;
  const all = Array.from({ length: n }, (_, i) => i);
  const P = (i) => new THREE.Vector3(tr.pos[i * 3], tr.pos[i * 3 + 1], tr.pos[i * 3 + 2]);
  const U = (i) => new THREE.Vector3(tr.up[i * 3], tr.up[i * 3 + 1], tr.up[i * 3 + 2]);
  const D = (i) => U(i).negate();
  const T = (i) => new THREE.Vector3(tr.tan[i * 3], tr.tan[i * 3 + 1], tr.tan[i * 3 + 2]);
  const side = (i) => new THREE.Vector3().crossVectors(U(i), T(i)).normalize();
  const paint = (i) => [tr.rgb[i * 3], tr.rgb[i * 3 + 1], tr.rgb[i * 3 + 2]];
  const frame = (i) => new THREE.Matrix4().makeBasis(side(i), U(i), T(i));
  const center = (i) => P(i).addScaledVector(U(i), RT - SINK);
  const updates = [];
  const m = new THREE.Matrix4();
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const high = (i) => tr.pos[i * 3 + 1] > HIGH;
  const fewer = (ids) => ids.filter((i, k) => !high(i) || i % 3 === 0 || k === ids.length - 1);

  // What each piece of slide is: in a bowl (the bowl itself is the slide), a closed tube, open,
  // or past the end (the raft is out in the pool).
  let lipEnd = tr.pool.start;
  while (lipEnd > 0 && tr.pos[lipEnd * 3 + 1] < 1.25) lipEnd--;
  // Down the drain: from the hole to the bottom of the straight drop it's a plain pipe; the
  // bend out at the bottom is ordinary closed tube.
  const drainPipe = new Set();
  for (const b of tr.bowls) {
    let vEnd = b.drainStart;
    for (let i = b.drainStart; i <= b.drainEnd; i++) if (tr.tan[i * 3 + 1] <= -0.9) vEnd = i;
    for (let i = b.drainStart; i <= vEnd; i++) drainPipe.add(i);
  }
  const kindOf = (i) => {
    if (i > lipEnd || tr.air[i]) return null;
    if (tr.bowlMask[i] === 2 || drainPipe.has(i)) return null;
    if (tr.special[i] === 1) return 'rapids';
    return tr.enclosed[i] ? 'tube' : 'open';
  };
  const runs = [];
  for (let i = 0; i < n; ) {
    const k = kindOf(i);
    let j = i;
    while (j + 1 < n && kindOf(j + 1) === k) j++;
    if (k) runs.push({ kind: k, ids: all.slice(Math.max(0, i - 1), Math.min(n, j + 2)) });
    i = j + 1;
  }

  // Open trough: a fiberglass half-pipe in his crayon colors, with a rolled lip on each edge.
  const glass = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, roughness: 0.2, metalness: 0, emissive: '#1e1e1e' });
  // The outside of the shell is a little darker and duller than the polished inside.
  glass.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if ( gl_FrontFacing ) diffuseColor.rgb *= 0.8;');
  };
  glass.customProgramCacheKey = () => 'slide-shell';
  const lip = shiny('#ffffff');
  const troughPaint = (i) => paint(i).map((v) => v * 0.85 + 0.15);
  const stripes = tubeStripeTexture();
  const tubeMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    map: stripes,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    roughness: 0.12,
    metalness: 0,
    depthWrite: false,
  });
  const collars = [];
  const seams = []; // bolted joints between the open trough's fiberglass sections
  // Rapids: the channel's middle, its two edges, and a point on its floor `x` meters off-center.
  const centerR = (i) => P(i).addScaledVector(U(i), RW - SINK);
  const edgeR = (i, s) => centerR(i).addScaledVector(U(i), -RW * Math.cos(RAPIDS_ARC)).addScaledVector(side(i), s * RW * Math.sin(RAPIDS_ARC));
  const floorR = (i, x) => P(i).addScaledVector(U(i), RW - Math.sqrt(RW * RW - x * x) - SINK).addScaledVector(side(i), x);
  const boulders = [];
  const crests = []; // [sample id] at every wave crest, for the spray
  const rand = mulberry32(n * 7 + 3);
  for (const run of runs) {
    const ids = fewer(run.ids);
    if (ids.length < 2) continue;
    if (run.kind === 'rapids') {
      g.add(new THREE.Mesh(tube(ids, centerR, D, side, RW, { sides: 16, arc: RAPIDS_ARC, colorAt: troughPaint }), glass));
      for (const s of [-1, 1]) g.add(new THREE.Mesh(tube(ids, (i) => edgeR(i, s), U, side, 0.12, { sides: 6 }), lip));
      // Boulders along both banks, and whitewater on every wave crest (the waves are in track.js).
      const first = ids.find((i) => tr.special[i] === 1) ?? ids[0];
      run.first = first;
      for (const i of ids) {
        if ((i - first) % 3 === 0) {
          for (const s of [-1, 1]) boulders.push([edgeR(i, s).addScaledVector(side(i), s * (0.4 + rand() * 0.5)).addScaledVector(U(i), -0.1), 0.35 + rand() * 0.55, rand() * 6]);
        }
        const d = (i - first) * tr.step - WAVE_LENGTH / 4;
        const phase = ((d % WAVE_LENGTH) + WAVE_LENGTH) % WAVE_LENGTH;
        if (tr.special[i] === 1 && phase < tr.step) crests.push(i);
      }
    } else if (run.kind === 'open') {
      g.add(new THREE.Mesh(tube(ids, center, D, side, RT, { sides: 18, arc: OPEN_ARC, colorAt: troughPaint }), glass));
      for (let k = 0; k < ids.length; k += Math.max(1, Math.round(3 / tr.step))) seams.push(ids[k]);
      for (const s of [-1, 1]) {
        const edge = (i) => center(i).addScaledVector(U(i), -RT * Math.cos(OPEN_ARC)).addScaledVector(side(i), s * RT * Math.sin(OPEN_ARC));
        g.add(new THREE.Mesh(tube(ids, edge, U, side, 0.1, { sides: 6 }), lip));
      }
    } else {
      const mesh = new THREE.Mesh(tube(ids, center, U, side, RT, { sides: 18, colorAt: troughPaint, uv: (i) => (i * tr.step) / 6 }), tubeMat);
      mesh.renderOrder = 2;
      g.add(mesh);
      for (let k = 0; k < ids.length; k += Math.max(1, Math.round(6 / tr.step))) collars.push(ids[k]);
      collars.push(ids[ids.length - 1]);
    }
  }
  if (boulders.length) {
    const rocks = new THREE.InstancedMesh(boulderGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), boulders.length);
    const tones = ['#ffffff', '#e8e2d8', '#d0cac2'].map((c) => new THREE.Color(c));
    boulders.forEach(([at, r, turn], k) => {
      rocks.setMatrixAt(k, m.compose(at, new THREE.Quaternion().setFromAxisAngle(Y_AXIS, turn), new THREE.Vector3(r, r * 0.7, r)));
      rocks.setColorAt(k, tones[k % tones.length]);
    });
    g.add(rocks);
  }
  if (seams.length) {
    // A flange ring round the outside of the trough, centered under it.
    const flange = new THREE.TorusGeometry(RT + 0.05, 0.05, 6, 24, OPEN_ARC * 2).rotateZ(-Math.PI / 2 - OPEN_ARC);
    const ring = new THREE.InstancedMesh(flange, shiny('#ffffff'), seams.length);
    seams.forEach((i, k) => {
      ring.setMatrixAt(k, frame(i).setPosition(center(i)));
      ring.setColorAt(k, new THREE.Color().fromArray(troughPaint(i)).multiplyScalar(0.85));
    });
    g.add(ring);
  }
  if (collars.length) {
    const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(RT + 0.06, 0.09, 6, 20), shiny('#ffffff'), collars.length);
    collars.forEach((i, k) => ring.setMatrixAt(k, frame(i).setPosition(center(i))));
    g.add(ring);
  }

  // Water running down every bit of slide, scrolled along so it flows.
  const streaks = streakTexture();
  const waterMat = makeWater({ color: '#cdeeff', map: streaks, opacity: 0.78, side: THREE.DoubleSide, repeat: [1, 1.5], flow: [0.03, -0.45], strength: 0.5, emissive: '#16384a' });
  const foam = streakTexture(true);
  // Rapids water: churning turquoise with foam streaks, thick enough that the channel doesn't show through.
  const foamMat = makeWater({ color: '#a5ecfa', emissive: '#1a5a70', map: foam, opacity: 0.97, side: THREE.DoubleSide, repeat: [2, 1.5], flow: [0.05, -1.2], strength: 0.8, roughness: 0.12 });
  for (const run of runs) {
    const ids = fewer(run.ids);
    if (ids.length < 2) continue;
    const water =
      run.kind === 'rapids'
        ? new THREE.Mesh(tube(ids, (i) => centerR(i).addScaledVector(U(i), 0.06), D, side, RW - 0.04, { sides: 10, arc: 0.85, uv: (i) => (i * tr.step) / 4 }), foamMat)
        : new THREE.Mesh(tube(ids, (i) => center(i).addScaledVector(U(i), 0.06), D, side, RT - 0.04, { sides: 6, arc: 0.75, uv: (i) => (i * tr.step) / 5 }), waterMat);
    water.renderOrder = 1;
    g.add(water);
  }
  updates.push((dt, time) => {
    streaks.offset.y -= dt * 1.6;
    foam.offset.y -= dt * 4.5;
    stripes.offset.y += dt * 0.02;
    waterMat.userData.tick(time);
    foamMat.userData.tick(time);
  });

  // Rapids whitewater: two layers of foam sitting on the wave crests (standing waves stay put,
  // the foam churns and sloshes on them), and spray kicked up off every crest.
  const crestLayers = [crestTexture(31), crestTexture(57)].map((tex, k) => {
    tex.repeat.set(1.5 + k * 0.4, 1);
    return {
      tex,
      mat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 }),
    };
  });
  for (const run of runs) {
    if (run.kind !== 'rapids') continue;
    const ids = fewer(run.ids);
    if (ids.length < 2) continue;
    crestLayers.forEach(({ mat: crestMat }, k) => {
      const lift = 0.12 + k * 0.04;
      const geo = tube(ids, (i) => centerR(i).addScaledVector(U(i), lift), D, side, RW - 0.04, {
        sides: 12,
        arc: 0.95,
        uv: (i) => ((i - run.first) * tr.step - WAVE_LENGTH / 4) / WAVE_LENGTH + 0.5 + k * 0.08,
      });
      const mesh = new THREE.Mesh(geo, crestMat);
      mesh.renderOrder = 2 + k;
      g.add(mesh);
    });
  }
  if (crests.length) {
    const count = Math.min(600, crests.length * 30);
    const posArr = new Float32Array(count * 3).fill(-1000);
    const vel = Array.from({ length: count }, () => new THREE.Vector3());
    const age = new Float32Array(count).fill(9);
    const life = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.3, map: getDot(), transparent: true, depthWrite: false, opacity: 0.9 }));
    spray.frustumCulled = false;
    g.add(spray);
    let next = 0;
    let carry = 0;
    updates.push((dt, time) => {
      crestLayers.forEach(({ tex, mat: crestMat }, k) => {
        tex.offset.x = time * (0.12 + k * 0.07) * (k ? -1 : 1);
        tex.offset.y = 0.025 * Math.sin(time * (5 + k * 1.7) + k);
        crestMat.opacity = 0.8 + 0.15 * Math.sin(time * (7 + k * 3));
      });
      // Kick up new droplets off random crests.
      carry += dt * count * 1.4;
      while (carry >= 1) {
        carry -= 1;
        const k = next;
        next = (next + 1) % count;
        const i = crests[Math.floor(Math.random() * crests.length)];
        const at = floorR(i, (Math.random() - 0.5) * 2.6).addScaledVector(U(i), 0.15);
        posArr.set([at.x, at.y, at.z], k * 3);
        vel[k]
          .copy(U(i))
          .multiplyScalar(1.2 + Math.random() * 2.4)
          .addScaledVector(T(i), (Math.random() - 0.3) * 1.6)
          .addScaledVector(side(i), (Math.random() - 0.5) * 1.4);
        age[k] = 0;
        life[k] = 0.4 + Math.random() * 0.5;
      }
      for (let k = 0; k < count; k++) {
        if (age[k] >= life[k]) {
          posArr[k * 3 + 1] = -1000;
          continue;
        }
        age[k] += dt;
        vel[k].y -= 9.8 * dt;
        posArr[k * 3] += vel[k].x * dt;
        posArr[k * 3 + 1] += vel[k].y * dt;
        posArr[k * 3 + 2] += vel[k].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // Water jets on the climbs: nozzles on both walls, puffing spray up the slide.
  const jetIds = all.filter((i, k) => tr.lift[i] && !tr.bowlMask[i] && i <= lipEnd && k % 4 === 0);
  if (jetIds.length) {
    const nozzles = new THREE.InstancedMesh(unitBox, shiny('#1d4e89'), jetIds.length * 2);
    const sprays = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.22, 1.2, 8, 1, true).translate(0, 0.6, 0),
      new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }),
      jetIds.length * 2,
    );
    jetIds.forEach((i, k) => {
      [-1, 1].forEach((s, j) => {
        const at = center(i).addScaledVector(U(i), -RT * 0.55).addScaledVector(side(i), s * RT * 0.8);
        nozzles.setMatrixAt(k * 2 + j, frame(i).scale(new THREE.Vector3(0.18, 0.18, 0.3)).setPosition(at));
        // Spray cones point forward along the slide and in toward the middle.
        const dir = T(i).addScaledVector(side(i), -s * 0.35).addScaledVector(U(i), -0.1).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir);
        sprays.setMatrixAt(k * 2 + j, m.compose(at, q, new THREE.Vector3(1, 1, 1)));
      });
    });
    g.add(nozzles, sprays);
    updates.push((dt, time) => {
      sprays.material.opacity = 0.35 + 0.2 * Math.sin(time * 18);
    });
  }

  // Supports: white columns on concrete feet with a curved cradle under the slide.
  const columns = [];
  const footings = [];
  const cradles = [];
  for (const sp of supportSpots(tr)) {
    if (sp.y > 0 && tr.bowls.some((b) => Math.hypot(sp.x - b.center.x, sp.z - b.center.z) < b.R + 1.5)) continue;
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
        columns.push([l, r, 0.1]);
      }
    } else {
      const bottom = new THREE.Vector3(sp.x, 0.4, sp.z);
      columns.push([bottom, top, 0.22]);
      footings.push(bottom);
    }
    cradles.push([top, sp.dir]);
  }
  if (columns.length) {
    const white = shiny('#f2f4f7');
    const cols = new THREE.InstancedMesh(unitCyl, white, columns.length);
    columns.forEach(([a, b, r], k) => cols.setMatrixAt(k, beam(m, a, b, r)));
    const feet = new THREE.InstancedMesh(unitBox, mat('#c9c9c9'), footings.length);
    footings.forEach((f, k) => feet.setMatrixAt(k, m.makeScale(1.2, 0.8, 1.2).setPosition(f.x, 0.3, f.z)));
    const cradleGeo = new THREE.TorusGeometry(1.0, 0.12, 6, 14, Math.PI).rotateZ(Math.PI);
    const cradle = new THREE.InstancedMesh(cradleGeo, white, cradles.length);
    cradles.forEach(([t, dir], k) => {
      const across = new THREE.Vector3(dir.x, 0, dir.z);
      const along = new THREE.Vector3().crossVectors(across, Y_AXIS);
      m.makeBasis(across, Y_AXIS, along).setPosition(t.x, t.y + 1.15, t.z);
      cradle.setMatrixAt(k, m);
    });
    g.add(cols, feet, cradle);
  }

  // Toilet bowls: the funnel he rides around (shaped from his own path, so the raft sits right
  // on it), a white outside, a lip, a whirlpool turning inside, the dark drain and legs.
  for (const b of tr.bowls) {
    const color = new THREE.Color().fromArray(paint(b.spiralStart)).getStyle();
    const prof = [];
    for (let i = b.spiralStart; i <= b.spiralEnd; i++) {
      const p = P(i);
      prof.push([Math.hypot(p.x - b.center.x, p.z - b.center.z), p.y - SINK]);
    }
    prof.sort((a, c) => a[0] - c[0]);
    const pts = [];
    let last = -1;
    for (const [r, y] of prof) {
      if (r - last < 0.25) continue;
      pts.push(new THREE.Vector2(r, y));
      last = r;
    }
    const bottomY = pts[0].y;
    const inner = [new THREE.Vector2(b.drainR * 0.85, bottomY - 0.25), ...pts, new THREE.Vector2(b.R + 0.5, b.rim + 0.05), new THREE.Vector2(b.R + 0.75, b.rim + 0.55)];
    const funnel = new THREE.Mesh(
      new THREE.LatheGeometry(inner, 56),
      new THREE.MeshStandardMaterial({ map: bowlTexture(color), side: THREE.DoubleSide, roughness: 0.18, metalness: 0 }),
    );
    funnel.position.set(b.center.x, 0, b.center.z);
    const outerPts = inner.map((v) => new THREE.Vector2(v.x + 0.2, v.y - 0.22));
    const shell = new THREE.Mesh(new THREE.LatheGeometry(outerPts, 56), new THREE.MeshStandardMaterial({ color: '#eef1f4', side: THREE.DoubleSide, roughness: 0.4 }));
    shell.position.copy(funnel.position);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(b.R + 0.8, 0.22, 8, 64), shiny('#ffffff'));
    rimRing.rotation.x = -Math.PI / 2;
    rimRing.position.set(b.center.x, b.rim + 0.55, b.center.z);
    g.add(funnel, shell, rimRing);

    // The whirlpool: a thin layer of water over the funnel, turning the way he goes round.
    const swirlPts = pts.filter((v) => v.x < b.R).map((v) => new THREE.Vector2(v.x, v.y + 0.07));
    const swirlMat = makeWater({ color: '#ffffff', map: swirlTexture(), opacity: 0.999, side: THREE.DoubleSide, repeat: [3, 3], flow: [0.04, 0.03], strength: 0.4, emissive: '#3a6a80' });
    swirlMat.transparent = true;
    swirlMat.depthWrite = false;
    const swirl = new THREE.Mesh(new THREE.LatheGeometry(swirlPts, 48), swirlMat);
    // Map the swirl straight down from above, so its arms spiral into the drain.
    const sp = swirl.geometry.attributes.position;
    const uvs = swirl.geometry.attributes.uv;
    for (let k = 0; k < sp.count; k++) uvs.setXY(k, 0.5 + sp.getX(k) / (2 * b.R), 0.5 + sp.getZ(k) / (2 * b.R));
    swirl.position.copy(funnel.position);
    swirl.renderOrder = 1;
    g.add(swirl);
    const a = P(b.spiralStart + 2).sub(new THREE.Vector3(b.center.x, 0, b.center.z));
    const v = T(b.spiralStart + 2);
    const spin = Math.sign(a.z * v.x - a.x * v.z) || 1;
    updates.push((dt, time) => {
      swirl.rotation.y += dt * spin * 1.1;
      swirlMat.userData.tick(time);
    });

    const hole = new THREE.Mesh(new THREE.CircleGeometry(b.drainR * 1.6, 32), new THREE.MeshBasicMaterial({ map: drainTexture(), transparent: true, depthWrite: false }));
    hole.renderOrder = 2;
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(b.center.x, bottomY - 0.2, b.center.z);
    g.add(hole);
    // The drain pipe straight down under the hole, to where the bend comes out.
    const pipeTop = bottomY - 0.2;
    const pipeBottom = b.exitY + 2.2;
    if (pipeTop > pipeBottom) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(RT + 0.05, RT + 0.05, pipeTop - pipeBottom, 18, 1, true), tubeMat);
      pipe.position.set(b.center.x, (pipeTop + pipeBottom) / 2, b.center.z);
      pipe.renderOrder = 2;
      g.add(pipe);
    }
    // Legs around the outside and a ring beam holding them together.
    const legs = 6;
    const legR = b.R * 0.72;
    const legTop = (k) => {
      const ang = (k / legs) * Math.PI * 2;
      const r = legR;
      let y = b.rim;
      for (const v2 of pts) if (v2.x <= r) y = v2.y; // funnel height there
      return new THREE.Vector3(b.center.x + Math.cos(ang) * r, y - 0.35, b.center.z + Math.sin(ang) * r);
    };
    const legMesh = new THREE.InstancedMesh(unitCyl, shiny('#f2f4f7'), legs * 2);
    for (let k = 0; k < legs; k++) {
      const top = legTop(k);
      legMesh.setMatrixAt(k, beam(m, new THREE.Vector3(top.x, 0, top.z), top, 0.25));
      const next = legTop((k + 1) % legs);
      const y = Math.min(top.y, next.y) * 0.5;
      legMesh.setMatrixAt(legs + k, beam(m, new THREE.Vector3(top.x, y, top.z), new THREE.Vector3(next.x, y, next.z), 0.12));
    }
    g.add(legMesh);
  }

  // The start: a tower with zigzag stairs, a striped canopy, a flag and a little start pool.
  const startTop = P(0).y;
  const tower = new THREE.Group();
  const orange = shiny('#ff8c42');
  const deckY = startTop - 0.6;
  // The deck is beside the slide (the slide itself starts from the little pool at the top).
  const deckBoards = plankTexture().clone();
  deckBoards.needsUpdate = true;
  deckBoards.repeat.set(3, 1.3);
  const wood = new THREE.MeshLambertMaterial({ color: '#f0c896', map: deckBoards });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 5.2), wood);
  deck.position.set(3, deckY, -4.1);
  tower.add(deck);
  const corners = [[-3, -6.5], [9, -6.5], [-3, 2.1], [9, 2.1]];
  for (const [x, z] of corners) tower.add(posed(new THREE.Mesh(unitCyl, orange), beam(m, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, deckY, z), 0.25)));
  for (let y = 0; y < deckY - 2; y += 4) {
    for (const [a, c] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {
      const [x0, z0] = corners[a];
      const [x1, z1] = corners[c];
      tower.add(posed(new THREE.Mesh(unitCyl, orange), beam(m, new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, Math.min(deckY, y + 4), z1), 0.08)));
      tower.add(posed(new THREE.Mesh(unitCyl, orange), beam(m, new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, Math.min(deckY, y + 4), z0), 0.08)));
    }
  }
  // Stairs: flights going back and forth up the outside, each with a landing.
  const flights = Math.max(1, Math.round(deckY / 3));
  const rise = deckY / flights;
  const stepMesh = new THREE.InstancedMesh(unitBox, wood, flights * 10);
  let si = 0;
  for (let f = 0; f < flights; f++) {
    const dir = f % 2 ? -1 : 1;
    const x0 = dir > 0 ? -2 : 8;
    for (let k = 0; k < 10; k++) {
      const x = x0 + dir * (k + 0.5) * 0.6 * (10 / 10);
      stepMesh.setMatrixAt(si++, m.makeScale(0.6, 0.12, 1.4).setPosition(x, f * rise + ((k + 1) / 10) * rise, -7.4));
    }
    const rail = new THREE.Mesh(unitCyl, shiny('#ffffff'));
    rail.applyMatrix4(beam(m, new THREE.Vector3(x0, f * rise + 1, -8.1), new THREE.Vector3(x0 + dir * 6, (f + 1) * rise + 1, -8.1), 0.05));
    tower.add(rail);
    const landing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 1.6), wood);
    landing.position.set(dir > 0 ? x0 + 6.9 : x0 - 6.9, (f + 1) * rise, -7.4);
    if (f < flights - 1) tower.add(landing);
  }
  tower.add(stepMesh);
  // Railing round the deck.
  for (const [a, c] of [[[-3, -6.7], [9, -6.7]], [[-3, -6.7], [-3, 2.3]]]) {
    tower.add(posed(new THREE.Mesh(unitCyl, shiny('#ffffff')), beam(m, new THREE.Vector3(a[0], deckY + 1.1, a[1]), new THREE.Vector3(c[0], deckY + 1.1, c[1]), 0.06)));
  }
  // Canopy: a big striped tent roof on four white posts.
  const roofY = deckY + 7.5;
  for (const [x, z] of corners) {
    tower.add(posed(new THREE.Mesh(unitCyl, shiny('#ffffff')), beam(m, new THREE.Vector3(x, deckY, z), new THREE.Vector3(x, roofY, z), 0.14)));
  }
  const tent = new THREE.ConeGeometry(8, 2.6, 12, 1, true).toNonIndexed();
  const tp = tent.attributes.position;
  const tc = new Float32Array(tp.count * 3);
  for (let t = 0; t < tp.count / 3; t++) {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += tp.getX(t * 3 + k);
      cz += tp.getZ(t * 3 + k);
    }
    const wedge = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 12) % 12;
    const col = new THREE.Color(wedge % 2 ? '#ffffff' : '#ff4d6d');
    for (let k = 0; k < 3; k++) tc.set([col.r, col.g, col.b], (t * 3 + k) * 3);
  }
  tent.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const roof = new THREE.Mesh(tent, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  roof.position.set(3, roofY + 1.5, -2.2);
  // A scalloped valance hanging round the edge, in the same stripes.
  const flaps = [];
  const flapCols = [];
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * Math.PI * 2;
    const a1 = ((k + 1) / 24) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const col = new THREE.Color(Math.floor(k / 2) % 2 ? '#ffffff' : '#ff4d6d');
    flaps.push(Math.cos(a0) * 8, -1.3, Math.sin(a0) * 8, Math.cos(am) * 8, -2.0, Math.sin(am) * 8, Math.cos(a1) * 8, -1.3, Math.sin(a1) * 8);
    for (let j = 0; j < 3; j++) flapCols.push(col.r, col.g, col.b);
  }
  const flapGeo = new THREE.BufferGeometry();
  flapGeo.setAttribute('position', new THREE.Float32BufferAttribute(flaps, 3));
  flapGeo.setAttribute('color', new THREE.Float32BufferAttribute(flapCols, 3));
  flapGeo.computeVertexNormals();
  const valance = new THREE.Mesh(flapGeo, roof.material);
  valance.position.copy(roof.position);
  tower.add(roof, valance);
  const flagPole = posed(new THREE.Mesh(unitCyl, shiny('#ffffff')), beam(m, new THREE.Vector3(3, roofY + 2.8, -2.2), new THREE.Vector3(3, roofY + 6, -2.2), 0.06));
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.lineTo(2.2, -0.6);
  flagShape.lineTo(0, -1.2);
  flagShape.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), mat('#ffd23f', { side: THREE.DoubleSide }));
  flag.position.set(3, roofY + 6, -2.2);
  tower.add(flagPole, flag);
  updates.push((dt, time) => {
    flag.rotation.y = Math.sin(time * 2.2) * 0.4;
    flag.scale.x = 1 + Math.sin(time * 5) * 0.08;
  });
  // A little pool at the top the slide starts from.
  const startPool = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 4.2), new THREE.MeshStandardMaterial({ color: '#ffffff', map: concreteTexture(), roughness: 0.8 }));
  startPool.position.set(-1.6, startTop - 0.35, 0);
  const startWaterMat = makeWater({ color: '#4fd2f0', repeat: [1.5, 1.5], flow: [0.06, 0.04] });
  updates.push((dt, time) => startWaterMat.userData.tick(time));
  const startWater = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 3.6), startWaterMat);
  startWater.position.set(-1.6, startTop + 0.17, 0);
  tower.add(startPool, startWater);
  // The deck and stairs go on the far side, so they never block the outside camera's view.
  tower.scale.z = -1;
  g.add(tower);

  // The splash pool at the end: tiled rim, sparkling water, lane ropes, a ladder, loungers and
  // a lifeguard chair. The slide ends at a lip, spilling a little waterfall into it.
  const pool = tr.pool;
  const poolGroup = new THREE.Group();
  const poolLen = pool.length + 16;
  const poolW = 15;
  const rounded = (w, h, r) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r);
    s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
    s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
    s.lineTo(-w / 2, -h / 2 + r);
    s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    return s;
  };
  const rimShape = rounded(poolLen + 2.4, poolW + 2.4, 5);
  rimShape.holes.push(rounded(poolLen, poolW, 4));
  const coping = concreteTexture().clone();
  coping.needsUpdate = true;
  coping.repeat.set(0.25, 0.25);
  const rim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rimShape, { depth: 0.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#f6f3ec', map: coping, roughness: 0.75 }),
  );
  // The pool's tiled floor with dark lane lines, light rippling over it, and clear water on top.
  const floorTiles = tileTexture().clone();
  floorTiles.needsUpdate = true;
  floorTiles.repeat.set(0.5, 0.5);
  const poolFloor = new THREE.Mesh(new THREE.ShapeGeometry(rounded(poolLen, poolW, 4)).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: floorTiles }));
  poolFloor.position.y = 0.05;
  const lanes = new THREE.InstancedMesh(unitBox, mat('#1d4e89'), 3);
  [-poolW / 4, 0, poolW / 4].forEach((z, k) => lanes.setMatrixAt(k, m.makeScale(poolLen - 6, 0.01, 0.3).setPosition(0, 0.065, z)));
  lanes.userData.noShadow = true;
  const caustics = [0, 1].map((k) => {
    const tex = causticsTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(0.16 + k * 0.05, 0.16 + k * 0.05);
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(rounded(poolLen, poolW, 4)).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.position.y = 0.075 + k * 0.01;
    mesh.userData.noShadow = true;
    return mesh;
  });
  const poolMat = makeWater({ color: '#38c4ee', opacity: 0.68, repeat: [0.2, 0.2], flow: [0.012, 0.008], strength: 0.45 });
  const poolWater = new THREE.Mesh(new THREE.ShapeGeometry(rounded(poolLen, poolW, 4)).rotateX(-Math.PI / 2), poolMat);
  poolWater.position.y = 0.36;
  poolWater.renderOrder = 1;
  // Floor of the shallow pool (seen through the edge) and lane ropes of bobbing floats.
  const floats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 14, 10), shiny('#ffffff', { shininess: 60 }), 2 * Math.floor(poolLen / 0.8));
  let fi = 0;
  for (const z of [-poolW / 2 + 3, poolW / 2 - 3]) {
    for (let x = -poolLen / 2 + 1; x < poolLen / 2 - 1 && fi < floats.count; x += 0.8) {
      floats.setMatrixAt(fi, m.makeScale(1, 0.7, 1).setPosition(x, 0.4, z));
      floats.setColorAt(fi, new THREE.Color(fi % 4 < 2 ? '#ff4d6d' : '#ffffff'));
      fi++;
    }
  }
  floats.count = fi;
  const ladderSteel = shiny('#e8edf2', { shininess: 100, metalness: 0.9 });
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 16, Math.PI), ladderSteel);
    bar.position.set(poolLen / 2 + 0.6, 0.9, s * 0.5);
    bar.rotation.y = Math.PI / 2;
    // ...and down into the water.
    const leg = posed(new THREE.Mesh(unitCyl, ladderSteel), beam(m, new THREE.Vector3(poolLen / 2 - 0.4, 0.05, s * 0.5), new THREE.Vector3(poolLen / 2 + 0.1, 0.9, s * 0.5), 0.06));
    poolGroup.add(bar, leg);
  }
  for (const x of [poolLen / 2 - 0.25, poolLen / 2 - 0.1]) {
    poolGroup.add(posed(new THREE.Mesh(unitCyl, ladderSteel), beam(m, new THREE.Vector3(x, 0.15 + (poolLen / 2 - x) * 1.2, -0.5), new THREE.Vector3(x, 0.15 + (poolLen / 2 - x) * 1.2, 0.5), 0.04)));
  }
  // Lifeguard chair beside the pool.
  const chair = new THREE.Group();
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) chair.add(posed(new THREE.Mesh(unitCyl, mat('#ffffff')), beam(m, new THREE.Vector3(x * 1.3, 0, z * 1.3), new THREE.Vector3(x, 3, z), 0.08)));
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 1.4), mat('#ff4d6d'));
  seat.position.y = 3;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.15), mat('#ff4d6d'));
  back.position.set(0, 3.6, -0.65);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 10, 1, true), mat('#ffd23f', { side: THREE.DoubleSide }));
  shade.position.y = 5.4;
  const shadePole = posed(new THREE.Mesh(unitCyl, mat('#ffffff')), beam(m, new THREE.Vector3(0, 3, -0.7), new THREE.Vector3(0, 5.4, -0.2), 0.05));
  chair.add(seat, back, shade, shadePole);
  chair.position.set(0, 0, poolW / 2 + 4);
  chair.rotation.y = Math.PI;
  poolGroup.add(rim, poolFloor, lanes, ...caustics, poolWater, floats, chair);
  // Loungers along the other side.
  for (let k = 0; k < 5; k++) {
    const lounger = new THREE.Group();
    const seatL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 1.4), mat('#ffffff'));
    seatL.position.y = 0.4;
    const backL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.8), mat('#ffffff'));
    backL.position.set(0, 0.7, -0.95);
    backL.rotation.x = -0.9;
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 1.3), mat(['#3a86ff', '#ff8c42', '#06d6a0', '#9b5de5', '#ffd23f'][k]));
    towel.position.y = 0.48;
    lounger.add(seatL, backL, towel);
    lounger.position.set(-poolLen / 2 + 4 + k * 3, 0, -poolW / 2 - 3);
    poolGroup.add(lounger);
  }
  poolGroup.position.set(pool.center.x, 0, pool.center.z);
  poolGroup.rotation.y = -Math.atan2(pool.dir.z, pool.dir.x);
  g.add(poolGroup);
  // Spilling off the end of the slide.
  const fall = fallTexture();
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(RT * 1.6, 1.2), new THREE.MeshBasicMaterial({ map: fall, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  spill.applyMatrix4(frame(lipEnd).setPosition(P(lipEnd).addScaledVector(T(lipEnd), 0.3).add(new THREE.Vector3(0, -0.4, 0))));
  g.add(spill);
  const spillMist = makeMist(P(lipEnd).addScaledVector(T(lipEnd), 0.6).setY(0.5), 1.4, 40);
  g.add(spillMist.points);
  updates.push((dt, time) => {
    poolMat.userData.tick(time);
    caustics[0].material.map.offset.set(time * 0.012, time * 0.009);
    caustics[1].material.map.offset.set(-time * 0.009, time * 0.013);
    fall.offset.y += dt * 2.2;
    floats.position.y = Math.sin(time * 2) * 0.04;
    spillMist.update(dt);
  });

  // Caves where the slide skims along the ground: a rocky hill with jungle on top, dark inside
  // with glowing crystals, and a waterfall pouring over the entrance.
  const splash = splashSpot(tr);
  const tunnels = tunnelRuns(tr, splash);
  const caveInside = mat('#2a2230', { side: THREE.BackSide });
  const rock = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const crystalColors = ['#6ef3ff', '#ff6ef0', '#b0ff6e', '#ffd36e'];
  const archMap = stoneTexture().clone();
  archMap.needsUpdate = true;
  archMap.repeat.set(5, 1);
  const archStone = new THREE.MeshLambertMaterial({ color: '#d8c8b4', map: archMap });
  const basinMat = makeWater({ color: '#4fd2f0', repeat: [1.2, 1.2], flow: [0.05, 0.08], strength: 0.6 });
  const fall2 = fallTexture();
  fall2.repeat.set(1.3, 0.8);
  const mists = [];
  updates.push((dt, time) => {
    basinMat.userData.tick(time);
    fall2.offset.y += dt * 3.1;
    for (const mist of mists) mist.update(dt);
  });
  for (const [a, b] of tunnels) {
    const ids = all.slice(a, b + 1);
    const c = (i) => P(i).addScaledVector(U(i), 0.3);
    g.add(new THREE.Mesh(tube(ids, c, U, side, 3.4, { sides: 16, arc: 1.95, toGround: true }), caveInside));
    const outside = tube(ids, c, U, side, 4.1, { sides: 16, arc: 1.95, toGround: true });
    // Lumpy rock with green on top.
    const op = outside.attributes.position;
    const oc = new Float32Array(op.count * 3);
    const col = new THREE.Color();
    for (let k = 0; k < op.count; k++) {
      const x = op.getX(k);
      const y = op.getY(k);
      const z = op.getZ(k);
      const bump = fbm(x / 3 + 2, z / 3 + y / 3) - 0.5;
      if (y > 0.2) op.setY(k, y + bump * 1.6 + 0.6);
      col.set(y > 5.6 + bump * 2 ? '#3f9a3e' : bump > 0 ? '#8a7a6a' : '#6f6257');
      oc.set([col.r, col.g, col.b], k * 3);
    }
    outside.setAttribute('color', new THREE.BufferAttribute(oc, 3));
    outside.computeVertexNormals();
    g.add(new THREE.Mesh(outside, rock));
    for (const i of [a, b]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.6, 8, 24, Math.PI), archStone);
      arch.applyMatrix4(frame(i).setPosition(c(i)));
      g.add(arch);
    }
    for (let i = a + 6; i < b - 4; i += 5) {
      for (const s of [-1, 1]) {
        const color = crystalColors[(i + s + 2) % 4];
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color }));
        crystal.position.copy(c(i).addScaledVector(side(i), s * 2.9).addScaledVector(U(i), 0.6 + ((i * 7) % 5) * 0.4));
        crystal.scale.set(1, 1.8, 1);
        crystal.rotation.set(i, i * 2, s);
        crystal.userData.noShadow = true;
        const shine = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.7, depthWrite: false }));
        shine.position.copy(crystal.position);
        shine.scale.setScalar(2.4);
        g.add(crystal, shine);
      }
    }
    // The waterfall over the way in.
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 6.2), new THREE.MeshBasicMaterial({ map: fall, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    curtain.applyMatrix4(frame(a).setPosition(c(a).addScaledVector(U(a), 2.2).addScaledVector(T(a), -0.6)));
    curtain.renderOrder = 3;
    // A second, faster sheet just in front, so the falling water has depth.
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 6.2), new THREE.MeshBasicMaterial({ map: fall2, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    sheet.applyMatrix4(frame(a).setPosition(c(a).addScaledVector(U(a), 2.2).addScaledVector(T(a), -0.9)));
    sheet.renderOrder = 3;
    g.add(curtain, sheet);
    const mist = makeMist(c(a).addScaledVector(T(a), -1.2).setY(0.6), 3.2, 50);
    mists.push(mist);
    g.add(mist.points);
    const basin = new THREE.Mesh(new THREE.CircleGeometry(4.5, 28), basinMat);
    basin.rotation.x = -Math.PI / 2;
    const at = c(a).addScaledVector(T(a), -1.5);
    basin.position.set(at.x, 0.06, at.z);
    g.add(basin);
  }

  // Spray fountains at the bottom of the biggest drop: one each side, arching water over the slide.
  if (splash !== null) {
    const sd = side(splash);
    const base = P(splash);
    const ends = [-1, 1].map((s) => new THREE.Vector3(base.x + sd.x * s * 5, 0, base.z + sd.z * s * 5));
    for (const e of ends) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3.2, 12), mat('#ffffff'));
      stem.position.set(e.x, 1.6, e.z);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff4d6d'));
      cap.position.set(e.x, 3.1, e.z);
      g.add(stem, cap);
    }
    const count = 240;
    const posArr = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dff6ff', size: 0.55, map: getDot(), transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    g.add(pts);
    const phase = Array.from({ length: count }, (_, k) => (k / (count / 2)) % 1);
    const from = [new THREE.Vector3(ends[0].x, 4, ends[0].z), new THREE.Vector3(ends[1].x, 4, ends[1].z)];
    updates.push((dt) => {
      for (let k = 0; k < count; k++) {
        phase[k] = (phase[k] + dt * 0.7) % 1;
        const t = phase[k];
        const a = from[k % 2];
        const b = from[1 - (k % 2)];
        const y = a.y + 22 * t * (1 - t); // up over the slide and down onto the other fountain
        posArr.set([a.x + (b.x - a.x) * t + Math.sin(k) * 0.2, Math.max(0.3, y + Math.cos(k * 3) * 0.2), a.z + (b.z - a.z) * t + Math.cos(k) * 0.2], k * 3);
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // Rubber ducks bobbing in the water, waiting to be scooped up.
  const ducks = starSpots(tr).map((i, k) => {
    const holder = new THREE.Group();
    holder.applyMatrix4(frame(i).setPosition(P(i).addScaledVector(U(i), 0.05)));
    const spin = duckGeometry();
    spin.scale.setScalar(1.15);
    holder.add(spin);
    g.add(holder);
    updates.push((dt, time) => {
      spin.position.y = Math.sin(time * 3 + k) * 0.06;
      spin.rotation.z = Math.sin(time * 2.4 + k) * 0.12;
    });
    return { holder, spin, spinRate: 0.8, s: i * tr.step, at: P(i).addScaledVector(U(i), eye * 0.6) };
  });

  // The island around it all, kept clear of the slide, tower, bowls and pool.
  const box = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(tr.pos, 3));
  const low = [];
  for (let i = 0; i < n; i += 4) if (tr.pos[i * 3 + 1] < 40) low.push(tr.pos[i * 3], tr.pos[i * 3 + 2]);
  const poolAt = new THREE.Vector3(pool.center.x, 0, pool.center.z);
  const keepOut = (x, z, d) => {
    if (x > -12 && x < 14 && z > -12 && z < 8) return true; // tower
    if (Math.hypot(poolAt.x - x, poolAt.z - z) < poolLen / 2 + 8) return true;
    for (const b of tr.bowls) if (Math.hypot(b.center.x - x, b.center.z - z) < b.R + 4) return true;
    if (splash !== null && P(splash).distanceTo(new THREE.Vector3(x, P(splash).y, z)) < 9) return true;
    for (let k = 0; k < low.length; k += 2) if (Math.hypot(low[k] - x, low[k + 1] - z) < d) return true;
    return false;
  };
  const nearTrack = (u, d, sgn) => {
    const i = Math.min(n - 1, Math.floor(u * n));
    const t = T(i);
    const flatLen = Math.hypot(t.x, t.z) || 1;
    return { x: tr.pos[i * 3] - (t.z / flatLen) * d * sgn, z: tr.pos[i * 3 + 2] + (t.x / flatLen) * d * sgn };
  };
  const land = makeBeachLandscape(box, keepOut, nearTrack);
  g.add(land.group);
  updates.push(land.update);

  return {
    group: g,
    pickups: ducks,
    splash,
    tunnels,
    bowls: tr.bowls,
    pool,
    lipEnd,
    update(dt, time) {
      for (const u of updates) u(dt, time);
    },
  };
}
