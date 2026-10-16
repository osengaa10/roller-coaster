// The ride: moves the train along the track, runs the camera, and fires off the fun bits.
import * as THREE from 'three';
import { V_MAX } from './track.js';
import * as sound from './sound.js';
import { makeStaticWorld, makeTrackWorld, disposeTree } from './scenery.js';
import { makeSeatCar, makeTrainCar, makeRider, makeHands, FRIENDS, FRIEND_SEAT } from './characters.js';
import { Effects } from './effects.js';

const EYE = 1.3; // seat height above the track
const LOOK_AHEAD = 6; // meters
const START_DELAY = 1.3; // seconds sitting in the station before rolling
const CAR_GAP = 2.7; // meters between train cars
const SKY = new THREE.Color('#8fd3ff');
const DUSK = new THREE.Color('#4a5aa8');

export class Ride {
  constructor(canvas, { onFinish = () => {}, onStar = () => {} } = {}) {
    this.onFinish = onFinish;
    this.onStar = onStar;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = SKY.clone();
    this.scene.fog = new THREE.Fog(SKY.clone(), 120, 650);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#5cc94f', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(-100, 200, 80);
    this.scene.add(sun);
    this.scene.add(makeStaticWorld());

    // Front-seat view: the car nose and his own arms hang off the camera.
    this.seatCar = makeSeatCar();
    this.hands = makeHands();
    this.camera.add(this.seatCar, this.hands.group);

    // Outside view: a real train with him and his friend in the front car.
    this.cars = [
      makeTrainCar('#ee4266', true),
      makeTrainCar('#ffd23f'),
      makeTrainCar('#3bceac'),
    ];
    this.scene.add(...this.cars);
    this.kid = makeRider('kid');
    this.kid.group.position.set(-0.45, 0.25, 0.1);
    this.cars[0].add(this.kid.group);
    this.friend = null;
    this.friendKind = null;

    this.effects = new Effects(this.scene);
    this.mode = 'seat';
    this.world = null;
    this.running = false;
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.chaseDir = new THREE.Vector3(1, 0, 0);
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();
    this.timeScale = Number(new URLSearchParams(location.search).get('fast')) || 1; // debug: ?fast=4

    this.resize();
    window.addEventListener('resize', () => this.resize());
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
      if (this.world) {
        this.scene.remove(this.world.group);
        disposeTree(this.world.group);
      }
      this.track = track;
      this.world = makeTrackWorld(track, EYE);
      this.scene.add(this.world.group);
    }
    for (const star of this.world.stars) star.holder.visible = true;

    // A different animal friend every ride.
    if (this.friend) this.friend.group.removeFromParent();
    const choices = FRIENDS.filter((f) => f !== this.friendKind);
    this.friendKind = choices[Math.floor(Math.random() * choices.length)];
    this.friend = makeRider(this.friendKind);

    this.s = 0;
    this.v = 0;
    this.time = 0;
    this.lastClack = 0;
    this.nextWhee = 0;
    this.nextStar = 0;
    this.starCount = 0;
    this.nextTunnel = 0;
    this.splashed = false;
    this.cheer = 0;
    this.handsTimer = 0;
    this.lastYay = -1;
    this.finished = false;
    this.effects.clear();
    this.scene.background.copy(SKY);
    this.scene.fog.color.copy(SKY);
    this.camUp.set(0, 1, 0);
    this.applyMode(true);
    this.running = true;
    this.last = performance.now();
    sound.bell();
    sound.windStart();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    this.effects.clear();
    sound.windStop();
  }

  toggleMode() {
    this.mode = this.mode === 'seat' ? 'outside' : 'seat';
    this.applyMode(false);
    return this.mode;
  }

  applyMode(snap) {
    const seat = this.mode === 'seat';
    this.seatCar.visible = seat;
    for (const car of this.cars) car.visible = !seat;
    const f = this.friend.group;
    f.removeFromParent();
    if (seat) {
      // Sitting just ahead and to the right, turned to look at him.
      f.position.set(FRIEND_SEAT.x, FRIEND_SEAT.y, FRIEND_SEAT.z);
      f.rotation.set(0, -0.6, 0);
      f.scale.setScalar(0.75);
      this.camera.add(f);
    } else {
      f.position.set(0.45, 0.25, 0.1);
      f.rotation.set(0, 0, 0);
      f.scale.setScalar(1);
      this.cars[0].add(f);
    }
    this.placeTrain();
    if (seat) this.placeSeatCamera(this.s, 1);
    else this.placeChaseCamera(0, snap);
  }

  // Tap anywhere: hands up!
  handsUp() {
    if (!this.running) return;
    this.handsTimer = 1.4;
    if (this.time - this.lastYay > 0.6) {
      this.lastYay = this.time;
      sound.yay();
    }
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
    this.last = now;
    this.time += dt;
    const tr = this.track;

    if (!this.finished && this.time > START_DELAY) {
      const ramp = Math.min(1, (this.time - START_DELAY) / 1.5);
      this.v = this.sample(tr.speed, this.s) * ramp;
      this.s = Math.min(tr.length, this.s + this.v * dt);
      this.triggers();
    }

    // Characters
    this.handsTimer = Math.max(0, this.handsTimer - dt);
    this.cheer = Math.max(0, this.cheer - dt);
    const handsUp = this.handsTimer > 0 || this.finished;
    const speed01 = this.v / V_MAX;
    this.hands.update(dt, this.handsTimer > 0);
    if (this.mode !== 'seat') this.hands.group.visible = false; // his arms belong to the front-seat view
    this.kid.update(dt, handsUp ? 1 : 0, speed01);
    this.friend.update(dt, handsUp || this.cheer > 0 ? 1 : 0, speed01);

    for (const star of this.world.stars) if (star.holder.visible) star.spin.rotation.y += dt * 3;
    this.effects.update(dt);
    if (this.finished) {
      const k = Math.min(1, dt * 0.6);
      this.scene.background.lerp(DUSK, k);
      this.scene.fog.color.lerp(DUSK, k);
    }

    this.placeTrain();
    if (this.mode === 'seat') this.placeSeatCamera(this.s, 1 - Math.exp(-dt * 8));
    else this.placeChaseCamera(dt, false);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  // Things that happen at places along the track.
  triggers() {
    const tr = this.track;
    const i = Math.round(this.s / tr.step);
    sound.windSpeed(this.v / V_MAX);

    if (tr.lift[i] && this.s - this.lastClack > 1.2) {
      this.lastClack = this.s;
      sound.clack();
    }
    while (this.nextWhee < tr.whee.length && tr.whee[this.nextWhee] <= i) {
      this.nextWhee++;
      this.cheer = 1.8;
      sound.whee();
    }
    const stars = this.world.stars;
    while (this.nextStar < stars.length && this.s >= stars[this.nextStar].s - 3) {
      const star = stars[this.nextStar++];
      star.holder.visible = false;
      this.effects.sparkle(star.at, this.vec(tr.tan, star.s).multiplyScalar(this.v));
      this.starCount++;
      sound.ding(this.starCount);
      this.onStar(this.starCount);
    }
    const tunnels = this.world.tunnels;
    while (this.nextTunnel < tunnels.length && this.s >= tunnels[this.nextTunnel][0] * tr.step - 4) {
      this.nextTunnel++;
      sound.whoosh();
    }
    const splash = this.world.splash;
    if (!this.splashed && splash !== null && this.s >= splash * tr.step - 1) {
      this.splashed = true;
      const up = this.vec(tr.up, this.s);
      const tan = this.vec(tr.tan, this.s);
      const side = new THREE.Vector3().crossVectors(up, tan).normalize();
      this.effects.splash(this.vec(tr.pos, this.s), side);
      this.cheer = 1.8;
      sound.splash();
    }

    if (this.s >= tr.length - 0.01) {
      this.finished = true;
      this.v = 0;
      sound.windStop();
      sound.cheer();
      this.effects.fireworks(this.camera);
      this.onFinish(this.starCount);
    }
  }

  placeTrain() {
    if (this.mode === 'seat') return;
    const tr = this.track;
    const m = new THREE.Matrix4();
    this.cars.forEach((car, k) => {
      const s = Math.max(0, this.s - k * CAR_GAP);
      const up = this.vec(tr.up, s).normalize();
      const tan = this.vec(tr.tan, s).normalize();
      const side = new THREE.Vector3().crossVectors(up, tan).normalize();
      m.makeBasis(side, up, tan);
      car.quaternion.setFromRotationMatrix(m);
      car.position.copy(this.vec(tr.pos, s)).addScaledVector(up, 0.25);
    });
  }

  placeSeatCamera(s, upBlend) {
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

  // Following the train from behind and to the side, always right-side up.
  placeChaseCamera(dt, snap) {
    const tr = this.track;
    const p = this.vec(tr.pos, this.s);
    const tan = this.vec(tr.tan, this.s);
    const flat = new THREE.Vector3(tan.x, 0, tan.z);
    if (flat.lengthSq() > 0.04) {
      flat.normalize();
      if (snap) this.chaseDir.copy(flat);
      else this.chaseDir.lerp(flat, 1 - Math.exp(-dt * 1.2)).normalize();
    }
    const sideways = new THREE.Vector3(-this.chaseDir.z, 0, this.chaseDir.x);
    const want = p.clone().addScaledVector(this.chaseDir, -13).addScaledVector(sideways, -7);
    want.y = Math.max(p.y + 6, 3);
    if (snap) {
      this.chasePos.copy(want);
      this.chaseLook.copy(p);
    } else {
      if (dt === 0) {
        // Switching from the seat: swoop out from where the camera is now.
        this.chasePos.copy(this.camera.position);
        this.chaseLook.copy(p);
      }
      this.chasePos.lerp(want, 1 - Math.exp(-dt * 2.5));
      this.chaseLook.lerp(p, 1 - Math.exp(-dt * 6));
    }
    this.camera.position.copy(this.chasePos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.chaseLook);
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
