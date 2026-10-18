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

// Build the common textures ahead of the first ride, a few at a time when the browser is idle.
export function prewarm(extra = []) {
  const jobs = [concreteTexture, plankTexture, gratingTexture, stoneTexture, glowTexture, ...extra];
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const next = () => {
    const job = jobs.shift();
    if (!job) return;
    job();
    idle(next);
  };
  idle(next);
}
