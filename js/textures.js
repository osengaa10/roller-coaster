// Procedural textures for the detail pass: concrete, wood planks, catwalk grating, stone
// blocks, number plates and a soft glow. All drawn on canvases once and cached, small enough for
// an iPad. prewarm() builds the common ones while nobody's looking (on the drawing screen).
import * as THREE from 'three';
import { mulberry32, noise } from './nature.js';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Grainy concrete: footings, platforms, the pool deck.
export const concreteTexture = () =>
  cached('concrete', () => {
    const size = 256;
    const [c, g] = canvas(size);
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = noise(x / 24, y / 24) * 0.5 + noise(x / 6, y / 6) * 0.3 + Math.random() * 0.2;
        const v = 175 + n * 60;
        img.data.set([v, v, v - 4, 255], (y * size + x) * 4);
      }
    }
    g.putImageData(img, 0, 0);
    return texture(c);
  });

// Wooden boards running along u, with grain and gaps.
export const plankTexture = () =>
  cached('planks', () => {
    const size = 256;
    const [c, g] = canvas(size);
    const rand = mulberry32(41);
    const boards = 8;
    for (let b = 0; b < boards; b++) {
      const y = (b / boards) * size;
      const tone = 150 + rand() * 40;
      g.fillStyle = `rgb(${tone + 40},${tone},${tone - 50})`;
      g.fillRect(0, y, size, size / boards);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(90,55,25,${0.12 + rand() * 0.18})`;
        g.lineWidth = 1;
        g.beginPath();
        const yy = y + rand() * (size / boards);
        g.moveTo(0, yy);
        for (let x = 0; x <= size; x += 16) g.lineTo(x, yy + Math.sin(x / 30 + k) * 1.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,35,15,0.6)';
      g.fillRect(0, y, size, 2);
      // Board ends, staggered.
      const end = rand() * size;
      g.fillRect(end, y, 2, size / boards);
    }
    return texture(c);
  });

// Steel grating for catwalks: see-through squares (use with alphaTest).
export const gratingTexture = () =>
  cached('grating', () => {
    const size = 64;
    const [c, g] = canvas(size);
    g.fillStyle = '#b8c0c8';
    const bar = 3;
    for (let k = 0; k < size; k += 8) {
      g.fillRect(k, 0, bar, size);
      g.fillRect(0, k, size, bar - 1);
    }
    const t = texture(c);
    t.anisotropy = 8;
    return t;
  });

// Stone blocks with mortar: tunnel portals, cave arches.
export const stoneTexture = () =>
  cached('stone', () => {
    const w = 256;
    const h = 128;
    const [c, g] = canvas(w, h);
    g.fillStyle = '#6f6a63';
    g.fillRect(0, 0, w, h);
    const rand = mulberry32(17);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -20 : 0;
      while (x < w) {
        const bw = 36 + rand() * 30;
        const v = 135 + rand() * 45;
        g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        g.fillRect(x + 2, (r * h) / rows + 2, bw - 4, h / rows - 4);
        // A little shading on each block.
        const grad = g.createLinearGradient(0, (r * h) / rows, 0, ((r + 1) * h) / rows);
        grad.addColorStop(0, 'rgba(255,255,255,0.12)');
        grad.addColorStop(1, 'rgba(0,0,0,0.18)');
        g.fillStyle = grad;
        g.fillRect(x + 2, (r * h) / rows + 2, bw - 4, h / rows - 4);
        x += bw;
      }
    }
    return texture(c);
  });

// A round plate with a number, for the side of each coaster car.
export const numberTexture = (n) =>
  cached(`number${n}`, () => {
    const [c, g] = canvas(64);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2b2d42';
    g.font = 'bold 42px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 32, 35);
    return texture(c, { repeat: false });
  });

// Soft round glow for additive sprites (stars, lights, the sun's sparkle).
export const glowTexture = () =>
  cached('glow', () => {
    const [c, g] = canvas(64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return texture(c, { repeat: false });
  });

// Tileable waves: a sum of sines whose wave numbers are whole numbers of cycles per tile, so
// the pattern wraps seamlessly. Returns a height function over 0..1 x 0..1.
function waveField(seed, count = 14, maxK = 7) {
  const rand = mulberry32(seed);
  const waves = [];
  for (let k = 0; k < count; k++) {
    const kx = Math.round((rand() * 2 - 1) * maxK) || 1;
    const ky = Math.round((rand() * 2 - 1) * maxK);
    waves.push([kx, ky, 1 / Math.hypot(kx, ky), rand() * Math.PI * 2]);
  }
  return (u, v) => {
    let h = 0;
    for (const [kx, ky, a, ph] of waves) h += a * Math.sin(2 * Math.PI * (kx * u + ky * v) + ph);
    return h;
  };
}

// Ripples on water, as a normal map (linear, not sRGB).
export const rippleNormalTexture = () =>
  cached('ripples', () => {
    const size = 256;
    const [c, g] = canvas(size);
    const h = waveField(5);
    const img = g.createImageData(size, size);
    const e = 1 / size;
    const strength = 2.2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const dx = (h(u + e, v) - h(u - e, v)) * strength;
        const dy = (h(u, v + e) - h(u, v - e)) * strength;
        const len = Math.hypot(dx, dy, 1);
        img.data.set([((-dx / len) * 0.5 + 0.5) * 255, ((-dy / len) * 0.5 + 0.5) * 255, (1 / len) * 0.5 * 255 + 127.5, 255], (y * size + x) * 4);
      }
    }
    g.putImageData(img, 0, 0);
    return texture(c, { srgb: false });
  });

// Caustics: the bright wobbly net of light on the bottom of a pool (white on black, for
// additive blending).
export const causticsTexture = () =>
  cached('caustics', () => {
    const size = 256;
    const [c, g] = canvas(size);
    const h1 = waveField(11, 10, 5);
    const h2 = waveField(29, 10, 5);
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const a = Math.exp(-Math.abs(h1(u, v)) * 5);
        const b = Math.exp(-Math.abs(h2(u, v)) * 5);
        const l = Math.min(255, (a * a + b * b) * 200 + a * b * 300);
        img.data.set([l, l, l, 255], (y * size + x) * 4);
      }
    }
    g.putImageData(img, 0, 0);
    return texture(c);
  });

// Little square pool tiles with grout.
export const tileTexture = (color = '#bfeefc') =>
  cached(`tiles${color}`, () => {
    const size = 128;
    const [c, g] = canvas(size);
    g.fillStyle = '#e8f6fb';
    g.fillRect(0, 0, size, size);
    const rand = mulberry32(3);
    const n = 8;
    const t = size / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = color;
        g.globalAlpha = 0.85 + rand() * 0.15;
        g.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
      }
    }
    g.globalAlpha = 1;
    return texture(c);
  });

// A drain: dark in the middle, fading out at the edge.
export const drainTexture = () =>
  cached('drain', () => {
    const [c, g] = canvas(128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(4,14,30,1)');
    grad.addColorStop(0.55, 'rgba(10,40,70,0.95)');
    grad.addColorStop(1, 'rgba(30,90,130,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return texture(c, { repeat: false });
  });

// Build the common textures ahead of the first ride, a few at a time when the browser is idle.
export function prewarm(extra = []) {
  const jobs = [concreteTexture, plankTexture, gratingTexture, stoneTexture, glowTexture, rippleNormalTexture, causticsTexture, () => tileTexture(), drainTexture, ...extra];
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    job();
    idle(next);
  };
  idle(next);
}
