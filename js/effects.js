// Short-lived particle effects: star sparkles, water splashes, fireworks.
import * as THREE from 'three';
import * as sound from './sound.js';
import { glowTexture } from './textures.js';
import { quality } from './quality.js';

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
      size: 0.18,
      glow: true,
    });
  }

  // Rocket flames shooting out the back (back: unit vector backwards along the track).
  flames(at, back, carry) {
    this.burst({
      at,
      count: 20,
      colors: ['#ffd23f', '#ff8c42', '#ff4d6d', '#fff4b0'],
      velocity: () => back.clone().multiplyScalar(6 + Math.random() * 8).add(new THREE.Vector3().randomDirection().multiplyScalar(1.5)).add(carry),
      gravity: -1,
      drag: 2,
      life: 0.5,
      size: 0.55,
      glow: true,
    });
  }

  // Water spraying up on both sides of the track.
  splash(at, side, count = 120) {
    for (const s of [-1, 1]) {
      this.burst({
        at: at.clone().addScaledVector(side, s * 1.5),
        count,
        colors: ['#ffffff', '#bfe6ff', '#7cc6ff'],
        velocity: () => new THREE.Vector3().addScaledVector(side, s * (2 + Math.random() * 5)).add(new THREE.Vector3((Math.random() - 0.5) * 4, 6 + Math.random() * 8, (Math.random() - 0.5) * 4)),
        gravity: 14,
        life: 1.5,
        size: 0.45,
      });
    }
  }

  // Bubbles fizzing up (a duck scooped up, water jets).
  bubbles(at, carry = new THREE.Vector3(), count = 30) {
    this.burst({
      at,
      count,
      colors: ['#ffffff', '#d8f4ff', '#9fe1ff'],
      velocity: () => new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 3).add(carry),
      gravity: -2,
      drag: 1.5,
      life: 0.9,
      size: 0.22,
    });
  }

  // Splashing down into the pool: walls of water thrown out both sides and up ahead.
  bigSplash(at, fwd, side) {
    for (const s of [-1, 1]) {
      this.burst({
        at: at.clone().addScaledVector(side, s * 0.8),
        count: 180,
        colors: ['#ffffff', '#bfe6ff', '#7cc6ff'],
        velocity: () =>
          new THREE.Vector3()
            .addScaledVector(side, s * (3 + Math.random() * 6))
            .addScaledVector(fwd, 2 + Math.random() * 6)
            .add(new THREE.Vector3(0, 5 + Math.random() * 9, 0)),
        gravity: 14,
        life: 1.6,
        size: 0.5,
      });
    }
  }

  // The finish at the water park: colored fountains shooting up around the pool, again and again.
  fountainShow(center, fwd, count = 8) {
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const palette = ['#ff4d6d', '#ffd23f', '#3bceac', '#3a86ff', '#c77dff', '#ff8c42'];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const at = center.clone().addScaledVector(fwd, Math.cos(a) * 14).addScaledVector(right, Math.sin(a) * 10);
      at.y = 0.5;
      this.list.push(new Fountain(this, at, [palette[i % palette.length], '#ffffff'], 0.2 + (i % 4) * 0.35));
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
export function getDot() {
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
  // glow: light, not water: blended additively, twinkling, with a flash where it bursts.
  constructor(scene, { at, count, colors, speed = [8, 14], velocity = null, gravity = 4, drag = 0.6, life = 1.6, size = 1, glow = false, flash = 0 }) {
    this.scene = scene;
    this.glow = glow;
    this.size = size;
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
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    if (flash > 0) {
      this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colors[0], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      this.flash.position.copy(at);
      this.flashSize = flash * quality().glow;
      scene.add(this.flash);
    }
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
    if (this.glow) this.mat.size = this.size * (0.8 + 0.35 * Math.sin(this.age * 40));
    if (this.flash) {
      const t = this.age / 0.5;
      this.flash.visible = t < 1;
      this.flash.scale.setScalar(this.flashSize * (0.5 + t));
      this.flash.material.opacity = Math.max(0, 1 - t) * 0.9;
    }
    return this.age < this.life;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
    if (this.flash) {
      this.scene.remove(this.flash);
      this.flash.material.dispose();
    }
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
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: colors[0], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    halo.scale.setScalar(4);
    this.dot.add(halo);
    this.dot.visible = false;
    this.lastTrail = 0;
    effects.scene.add(this.dot);
  }

  update(dt) {
    this.age += dt;
    const t = (this.age - this.delay) / this.rise;
    if (t < 0) return true;
    if (t < 1) {
      this.dot.visible = true;
      this.dot.position.lerpVectors(this.start, this.target, 1 - (1 - t) * (1 - t));
      // A sparkly trail behind it on the way up.
      if (this.age - this.lastTrail > 0.05) {
        this.lastTrail = this.age;
        this.effects.burst({ at: this.dot.position.clone(), count: 4, colors: ['#fff4c0', this.colors[0]], speed: [0.5, 1.5], gravity: 3, life: 0.6, size: 0.8, glow: true });
      }
      return true;
    }
    this.effects.burst({ at: this.target, count: 140, colors: this.colors, speed: [8, 13], gravity: 4, life: 2.4, size: 2.2, glow: true, flash: 40 });
    sound.firework();
    return false;
  }

  dispose() {
    this.effects.scene.remove(this.dot);
    this.dot.geometry.dispose();
    this.dot.material.dispose();
    this.dot.children[0].material.dispose();
  }
}

// A jet of colored water that spurts a few times, then stops.
class Fountain {
  constructor(effects, at, colors, delay) {
    this.effects = effects;
    this.at = at;
    this.colors = colors;
    this.next = delay;
    this.left = 5;
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.next && this.left > 0) {
      this.left--;
      this.next += 0.9 + Math.random() * 0.4;
      this.effects.burst({
        at: this.at,
        count: 90,
        colors: this.colors,
        velocity: () => new THREE.Vector3((Math.random() - 0.5) * 2.5, 13 + Math.random() * 5, (Math.random() - 0.5) * 2.5),
        gravity: 12,
        drag: 0.2,
        life: 2.2,
        size: 0.7,
      });
      sound.fountain();
    }
    return this.left > 0;
  }
}

// Spray thrown up behind the raft (rooster tail), more the faster it goes. One recycled set of
// points, so it costs the same however long the ride.
export function makeSprayTrail(scene, count = 160) {
  const pos = new Float32Array(count * 3);
  const vel = Array.from({ length: count }, () => new THREE.Vector3());
  const age = new Float32Array(count).fill(9);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const material = new THREE.PointsMaterial({ color: '#e8f8ff', size: 0.32, map: getDot(), transparent: true, depthWrite: false, opacity: 0.85 });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);
  let next = 0;
  let carry = 0;
  return {
    points,
    // at: back of the raft; back: direction behind it; up, side: the raft's frame.
    update(dt, on, at, back, up, side, speed) {
      points.visible = on;
      if (!on) return;
      carry += dt * Math.min(120, speed * 9);
      while (carry >= 1) {
        carry -= 1;
        const k = next;
        next = (next + 1) % count;
        const s = Math.random() < 0.5 ? -1 : 1;
        pos.set([at.x + side.x * s * 0.5, at.y + side.y * s * 0.5 + 0.1, at.z + side.z * s * 0.5], k * 3);
        vel[k]
          .copy(back)
          .multiplyScalar(speed * (0.15 + Math.random() * 0.2))
          .addScaledVector(up, 1.5 + Math.random() * 2.5 + speed * 0.12)
          .addScaledVector(side, s * (0.5 + Math.random() * 1.5));
        age[k] = 0;
      }
      for (let k = 0; k < count; k++) {
        if (age[k] > 1) {
          pos[k * 3 + 1] = -1000;
          continue;
        }
        age[k] += dt;
        vel[k].y -= 9.8 * dt;
        pos[k * 3] += vel[k].x * dt;
        pos[k * 3 + 1] += vel[k].y * dt;
        pos[k * 3 + 2] += vel[k].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// Mist drifting up where falling water lands: soft puffs that rise, spread and start again.
export function makeMist(at, width, count = 40) {
  const pos = new Float32Array(count * 3);
  const age = Float32Array.from({ length: count }, () => Math.random() * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const material = new THREE.PointsMaterial({ color: '#eef9ff', size: 1.1, map: getDot(), transparent: true, opacity: 0.28, depthWrite: false });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  const spawn = (k) => {
    pos[k * 3] = at.x + (Math.random() - 0.5) * width;
    pos[k * 3 + 1] = at.y + Math.random() * 0.3;
    pos[k * 3 + 2] = at.z + (Math.random() - 0.5) * width;
    age[k] = 0;
  };
  for (let k = 0; k < count; k++) spawn(k);
  return {
    points,
    update(dt) {
      for (let k = 0; k < count; k++) {
        age[k] += dt;
        if (age[k] > 2) spawn(k);
        pos[k * 3] += (Math.random() - 0.5) * dt * 0.8;
        pos[k * 3 + 1] += dt * 0.7;
        pos[k * 3 + 2] += (Math.random() - 0.5) * dt * 0.8;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
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
