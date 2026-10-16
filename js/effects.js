// Short-lived particle effects: star sparkles, water splashes, fireworks.
import * as THREE from 'three';
import * as sound from './sound.js';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  update(dt) {
    // Effects may spawn new ones while updating (a rocket bursting), so collect those separately.
    const current = this.list;
    this.list = [];
    const alive = current.filter((fx) => {
      const ok = fx.update(dt);
      if (!ok) fx.dispose?.();
      return ok;
    });
    this.list = alive.concat(this.list);
  }

  clear() {
    for (const fx of this.list) fx.dispose?.();
    this.list = [];
  }

  burst(opts) {
    this.list.push(new Burst(this.scene, opts));
  }

  // carry: the train's velocity, so the burst opens up in front of him instead of in his face.
  sparkle(at, carry) {
    this.burst({
      at,
      count: 40,
      colors: ['#ffd23f', '#fff4b0', '#ffffff'],
      velocity: () => new THREE.Vector3().randomDirection().multiplyScalar(3 + Math.random() * 3).add(carry),
      gravity: 0,
      drag: 0,
      life: 0.6,
      size: 0.14,
    });
  }

  // Water spraying up on both sides of the track.
  splash(at, side) {
    for (const s of [-1, 1]) {
      this.burst({
        at: at.clone().addScaledVector(side, s * 1.5),
        count: 120,
        colors: ['#ffffff', '#bfe6ff', '#7cc6ff'],
        velocity: () => new THREE.Vector3().addScaledVector(side, s * (2 + Math.random() * 5)).add(new THREE.Vector3((Math.random() - 0.5) * 4, 6 + Math.random() * 8, (Math.random() - 0.5) * 4)),
        gravity: 14,
        life: 1.5,
        size: 0.45,
      });
    }
  }

  // A show of rockets in front of the camera.
  fireworks(camera, count = 7) {
    // Aim where the camera is looking, so they show up in the seat view and the outside view.
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const fwd = new THREE.Vector3(look.x, 0, look.z);
    if (fwd.lengthSq() < 1e-4) fwd.set(1, 0, 0);
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const center = camera.position.clone().addScaledVector(look, 45);
    const palette = ['#ff4d6d', '#ffd23f', '#3bceac', '#3a86ff', '#c77dff', '#ff8c42', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const at = center.clone().addScaledVector(fwd, Math.random() * 20).addScaledVector(right, (Math.random() - 0.5) * 55);
      at.y = Math.max(camera.position.y + 5 + Math.random() * 13, 12);
      const colors = [palette[i % palette.length], palette[(i * 3 + 1) % palette.length], '#ffffff'];
      this.list.push(new Rocket(this, at, colors, 0.25 + i * 0.45 + Math.random() * 0.2));
    }
  }
}

// Soft round dot so particles aren't little squares.
let dotTexture = null;
function getDot() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

class Burst {
  constructor(scene, { at, count, colors, speed = [8, 14], velocity = null, gravity = 4, drag = 0.6, life = 1.6, size = 1 }) {
    this.scene = scene;
    this.life = life;
    this.age = 0;
    this.gravity = gravity;
    this.drag = drag;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.vel = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      c.set(colors[i % colors.length]);
      col.set([c.r, c.g, c.b], i * 3);
      if (velocity) this.vel.push(velocity());
      else {
        const v = new THREE.Vector3().randomDirection();
        this.vel.push(v.multiplyScalar(speed[0] + Math.random() * (speed[1] - speed[0])));
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.PointsMaterial({
      size,
      map: getDot(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt) {
    this.age += dt;
    const pos = this.geo.attributes.position;
    for (let i = 0; i < this.vel.length; i++) {
      const v = this.vel[i];
      v.y -= this.gravity * dt;
      v.multiplyScalar(1 - dt * this.drag);
      pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt);
    }
    pos.needsUpdate = true;
    this.mat.opacity = Math.max(0, 1 - Math.pow(this.age / this.life, 2));
    return this.age < this.life;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// A glowing dot that rises, then pops into a big colorful burst.
class Rocket {
  constructor(effects, target, colors, delay) {
    this.effects = effects;
    this.target = target;
    this.colors = colors;
    this.delay = delay;
    this.age = 0;
    this.rise = 0.8;
    const start = target.clone();
    start.y = Math.max(0, target.y - 30);
    this.start = start;
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: colors[0], fog: false }));
    this.dot.visible = false;
    effects.scene.add(this.dot);
  }

  update(dt) {
    this.age += dt;
    const t = (this.age - this.delay) / this.rise;
    if (t < 0) return true;
    if (t < 1) {
      this.dot.visible = true;
      this.dot.position.lerpVectors(this.start, this.target, 1 - (1 - t) * (1 - t));
      return true;
    }
    this.effects.burst({ at: this.target, count: 140, colors: this.colors, speed: [8, 13], gravity: 4, life: 2.4, size: 2.2 });
    sound.firework();
    return false;
  }

  dispose() {
    this.effects.scene.remove(this.dot);
    this.dot.geometry.dispose();
    this.dot.material.dispose();
  }
}

// Wind streaks rushing past the camera when the train is really flying (child of the camera).
export function makeStreaks(count = 80) {
  const pos = new Float32Array(count * 6);
  const spawn = (d, anywhere) => {
    const a = Math.random() * Math.PI * 2;
    const r = 2.2 + Math.random() * 6;
    d.x = Math.cos(a) * r;
    d.y = Math.sin(a) * r * 0.7 + 0.8; // keep most of them above the car
    d.z = anywhere ? -Math.random() * 50 : -45 - Math.random() * 10;
    return d;
  };
  const streaks = Array.from({ length: count }, () => spawn({}, true));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const material = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, material);
  lines.frustumCulled = false;
  lines.visible = false;
  return {
    lines,
    // v: speed in m/s; strength: 0..1 how visible they should be.
    update(dt, v, strength) {
      material.opacity = 0.45 * strength;
      lines.visible = strength > 0.01;
      if (!lines.visible) return;
      const len = Math.min(4, 0.2 + v * 0.13);
      streaks.forEach((d, i) => {
        d.z += v * 1.4 * dt;
        if (d.z > 2) spawn(d, false);
        pos.set([d.x, d.y, d.z, d.x, d.y, d.z - len], i * 6);
      });
      geo.attributes.position.needsUpdate = true;
    },
  };
}
