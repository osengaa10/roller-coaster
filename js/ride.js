// The ride: moves the train (or the raft, on the water slide) along the track, runs the camera,
// and fires off the fun bits.
import * as THREE from 'three';
import { V_MAX } from './track.js';
import * as sound from './sound.js';
import { makeStaticWorld, makeTrackWorld, makeSpace, disposeTree, shadowFlags } from './scenery.js';
import { makeSlideWorld } from './slide-world.js';
import { makeBeachStaticWorld } from './tropical.js';
import { makeTrain } from './train.js';
import { makeSeatCar, makeRider, makeHands, makeRaft, makeSeatRaft, FRIENDS, PEOPLE, FRIEND_SEAT, FRIEND_RAFT, RING_Z } from './characters.js';
import { Effects, makeStreaks, makeSprayTrail } from './effects.js';
import { makeSky, SUN_DIR, EARTH_R, WIND } from './nature.js';
import { quality, stepDown, FrameWatch } from './quality.js';

const EYE = 1.3; // seat height above the track
const RAFT_EYE = 0.95; // sitting low in a ring float
const LOOK_AHEAD = 6; // meters
const START_DELAY = 1.3; // seconds sitting in the station before rolling
// Sky colors (overhead / at the horizon), for day and for the sunset at the finish. The water
// park's sky is a little more tropical turquoise.
const SKIES = {
  coaster: { top: new THREE.Color('#2f7fd8'), horizon: new THREE.Color('#cfe8fb'), ground: new THREE.Color('#4a7a3a') },
  slide: { top: new THREE.Color('#1c95e6'), horizon: new THREE.Color('#d4f6ff'), ground: new THREE.Color('#c9b07a') },
};
const DUSK_TOP = new THREE.Color('#3a3f8f');
const DUSK_HORIZON = new THREE.Color('#f4a37c');
const SPACE = new THREE.Color('#060820');
const SPACE_FROM = 150; // meters: the sky starts getting darker
const SPACE_TO = 1300; // meters: full outer space (the change is spread out on a log scale)
const SUN_COLOR = new THREE.Color('#fff1d6');
const DUSK_SUN = new THREE.Color('#ffb27a');
const UP = new THREE.Vector3(0, 1, 0);
const SHADOW_R = 60; // meters: real shadows cover this far around the train
const SWING_HOLD = 2.5; // seconds a swiped view stays put before drifting back behind the train
const ZOOM_IN = 0.35; // a pinch can bring the camera this much nearer the train...
const ZOOM_OUT = 4; // ...or take it this much further away

const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

export class Ride {
  constructor(canvas, { onFinish = () => {}, onStar = () => {} } = {}) {
    this.onFinish = onFinish;
    this.onStar = onStar;
    // Log depth: the view goes from the lap bar a meter away to the Earth's horizon 60 km off.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    // Neutral tone mapping rolls off the bright highlights but keeps his crayon colors saturated.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality().softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.frames = new FrameWatch();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKIES.coaster.horizon.clone(), 250, 2600); // haze: far things fade into the sky
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 4000);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight('#dcefff', '#4a7a3a', 1.2);
    this.scene.add(this.hemi);
    // The sun, with real shadows in a box that follows the train around.
    const sun = new THREE.DirectionalLight(SUN_COLOR, 2.3);
    sun.position.copy(SUN_DIR).multiplyScalar(300);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -SHADOW_R;
    sc.right = sc.top = SHADOW_R;
    sc.near = 1;
    sc.far = 600;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMaps = {};
    this.skyDome = makeSky();
    this.scene.add(this.skyDome.mesh);
    // Scenery that never changes: built once per game, the other one hidden.
    this.statics = { coaster: makeStaticWorld() };
    shadowFlags(this.statics.coaster);
    this.scene.add(this.statics.coaster);
    this.space = makeSpace();
    this.scene.add(this.space.group);

    // Speed: wind streaks past the camera, darkened edges, a wider view and a little rumble.
    this.streaks = makeStreaks();
    this.camera.add(this.streaks.lines);
    this.speedfx = document.getElementById('speedfx');
    this.drips = document.getElementById('drips');
    this.fovBoost = 0;

    // Front-seat view: the car nose (or his ring float) and his own arms hang off the camera.
    this.seatCar = makeSeatCar();
    this.seatRaft = makeSeatRaft(RAFT_EYE);
    this.hands = makeHands();
    this.camera.add(this.seatCar, this.seatRaft, this.hands.group);

    // Outside view: a real train with him and his friend in the front car, or the two of them
    // on a ring float, one behind the other.
    this.train = makeTrain(['#ee4266', '#ffd23f', '#3bceac']);
    this.cars = this.train.cars;
    this.scene.add(this.train.group);
    this.raft = makeRaft();
    this.scene.add(this.raft);
    for (const o of [this.train.group, this.raft, this.seatCar, this.seatRaft, this.hands.group]) shadowFlags(o);
    this.spray = makeSprayTrail(this.scene);
    this.kid = makeRider('kid');
    shadowFlags(this.kid.group);
    this.friend = null;
    this.friendKind = null;
    this.riders = new Map(); // everyone else, built once and reused ride after ride
    this.passengers = [];

    this.effects = new Effects(this.scene);
    this.mode = 'outside'; // start watching from outside; the eye button switches to the front seat
    this.kind = 'coaster';
    this.world = null;
    this.running = false;
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.chaseDir = new THREE.Vector3(1, 0, 0);
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();
    this.resetSwing();
    this.timeScale = Number(new URLSearchParams(location.search).get('fast')) || 1; // debug: ?fast=4

    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this);
  }

  get slide() {
    return this.kind === 'slide';
  }

  get eye() {
    return this.slide ? RAFT_EYE : EYE;
  }

  // Pixel ratio and shadows for the current quality tier (also after stepping down mid-ride).
  applyQuality() {
    const q = quality();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.sun.castShadow = q.shadows > 0;
    this.syncBlobShadows();
    if (q.shadows && this.sun.shadow.mapSize.x !== q.shadows) {
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
    }
    this.resize();
  }

  // Soft blob shadows under trees stand in for real ones when those are off.
  syncBlobShadows() {
    this.world?.group.traverse((o) => {
      if (o.userData.blobShadow) o.visible = !this.sun.castShadow;
    });
  }

  // The sky reflected in steel, fiberglass and water: rendered once per game into an environment map.
  environment(kind) {
    if (!this.envMaps[kind]) {
      const env = new THREE.Scene();
      const sky = makeSky();
      sky.uniforms.top.value.copy(SKIES[kind].top);
      sky.uniforms.horizon.value.copy(SKIES[kind].horizon);
      sky.mesh.scale.setScalar(50 / 1800);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(49, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: SKIES[kind].ground }));
      ground.position.y = -3;
      env.add(sky.mesh, ground);
      this.envMaps[kind] = this.pmrem.fromScene(env, 0.02).texture;
      disposeTree(env);
    }
    return this.envMaps[kind];
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep a wide view in portrait too.
    this.baseFov = w < h ? 95 : 75;
    this.camera.fov = this.baseFov + (this.fovBoost || 0);
    this.camera.updateProjectionMatrix();
  }

  start(track, kind = 'coaster') {
    this.kind = kind;
    if (this.track !== track) {
      if (this.world) {
        this.scene.remove(this.world.group);
        disposeTree(this.world.group);
      }
      this.track = track;
      this.world = this.slide ? makeSlideWorld(track, RAFT_EYE) : makeTrackWorld(track, EYE);
      shadowFlags(this.world.group);
      this.scene.add(this.world.group);
      this.syncBlobShadows();
      this.space.place(track.pos[(track.count >> 1) * 3]);
    }
    if (this.slide && !this.statics.slide) {
      this.statics.slide = makeBeachStaticWorld();
      shadowFlags(this.statics.slide);
      this.scene.add(this.statics.slide);
    }
    for (const [k, group] of Object.entries(this.statics)) group.visible = k === kind;
    this.sky = SKIES[kind];
    this.hemi.groundColor.copy(this.sky.ground);
    this.scene.environment = this.environment(kind);
    this.frames.reset();
    this.streaks.lines.material.color.set(this.slide ? '#d8f4ff' : '#ffffff');
    for (const p of this.world.pickups) p.holder.visible = true;

    // His seat: the front car of the train, or the back ring of the float.
    this.kid.group.removeFromParent();
    if (this.slide) {
      this.kid.group.position.set(0, 0.1, -RING_Z);
      this.raft.add(this.kid.group);
    } else {
      this.kid.group.position.set(-0.45, 0.55, -0.3);
      this.cars[0].add(this.kid.group);
    }
    this.kid.goggles.visible = this.slide;

    // A different animal friend every ride, and the other friends and kids fill the cars behind.
    if (this.friend) this.friend.group.removeFromParent();
    for (const p of this.passengers) p.group.removeFromParent();
    const choices = FRIENDS.filter((f) => f !== this.friendKind);
    this.friendKind = choices[Math.floor(Math.random() * choices.length)];
    this.friend = this.rider(this.friendKind);
    const others = [...FRIENDS, ...PEOPLE].filter((f) => f !== this.friendKind).sort(() => Math.random() - 0.5);
    this.passengers = this.cars.slice(1).flatMap((car, c) =>
      [-0.45, 0.45].map((x, j) => {
        const p = this.rider(others[c * 2 + j]);
        p.group.position.set(x, 0.55, -0.3);
        p.group.rotation.set(0, 0, 0);
        p.group.scale.setScalar(1); // it may have ridden in the front seat view last time
        car.add(p.group);
        return p;
      }),
    );

    this.s = 0;
    this.v = 0;
    this.time = 0;
    this.lastClack = 0;
    this.nextWhee = 0;
    this.nextStar = 0;
    this.starCount = 0;
    this.nextTunnel = 0;
    this.nextTwist = 0;
    this.nextLaunch = 0;
    this.nextJump = 0;
    this.flying = false;
    this.bump = 0; // landing a jump gives the camera a jolt, this big
    this.countedDown = false;
    this.boostTo = -1; // the end of the boosters he's on (sample index)
    this.lastFlame = -1;
    this.splashed = false;
    this.nextBowl = 0;
    this.nextDrain = 0;
    this.pooled = false;
    this.inRapids = false;
    this.lastRapids = -1;
    this.lastJet = -1;
    this.raftYaw = 0;
    this.bowlCam = 0;
    this.cheer = 0;
    this.handsTimer = 0;
    this.lastYay = -1;
    this.finished = false;
    this.dusk = 0;
    this.effects.clear();
    this.drips?.replaceChildren();
    this.camUp.set(0, 1, 0);
    this.resetSwing();
    this.applyMode(true);
    this.running = true;
    // Compile every shader the ride needs before its clock starts, so the stall (if any) happens
    // sitting in the station, not on the first drop. A newer start() supersedes this one.
    const token = (this.startToken = (this.startToken || 0) + 1);
    const go = () => {
      if (token !== this.startToken || !this.running) return;
      this.last = performance.now();
      if (this.slide) {
        sound.whistle();
        sound.waterStart();
      } else {
        sound.bell();
        sound.windStart();
      }
      requestAnimationFrame(this.loop);
    };
    this.renderer.compileAsync(this.scene, this.camera).then(go, go);
  }

  stop() {
    this.running = false;
    this.effects.clear();
    if (this.speedfx) this.speedfx.style.opacity = '0';
    this.drips?.replaceChildren();
    sound.windStop();
    sound.waterStop();
  }

  toggleMode() {
    this.mode = this.mode === 'seat' ? 'outside' : 'seat';
    this.resetSwing();
    this.applyMode(false);
    return this.mode;
  }

  applyMode(snap) {
    const seat = this.mode === 'seat';
    this.seatCar.visible = seat && !this.slide;
    this.seatRaft.visible = seat && this.slide;
    this.train.group.visible = !seat && !this.slide;
    this.raft.visible = !seat && this.slide;
    const f = this.friend.group;
    f.removeFromParent();
    if (seat) {
      // Sitting just ahead and to the right, turned to look at him.
      const at = this.slide ? FRIEND_RAFT : FRIEND_SEAT;
      f.position.set(at.x, at.y, at.z);
      f.rotation.set(0, this.slide ? -0.5 : -0.6, 0);
      f.scale.setScalar(this.slide ? 0.7 : 0.75);
      this.camera.add(f);
    } else if (this.slide) {
      f.position.set(0, 0.1, RING_Z);
      f.rotation.set(0, 0, 0);
      f.scale.setScalar(1);
      this.raft.add(f);
    } else {
      f.position.set(0.45, 0.55, -0.3);
      f.rotation.set(0, 0, 0);
      f.scale.setScalar(1);
      this.cars[0].add(f);
    }
    this.placeTrain();
    if (seat) this.placeSeatCamera(this.s, 1);
    else this.placeChaseCamera(0, snap);
  }

  rider(kind) {
    if (!this.riders.has(kind)) {
      const r = makeRider(kind);
      shadowFlags(r.group);
      this.riders.set(kind, r);
    }
    return this.riders.get(kind);
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

  // Swiping in the outside view swings the camera round the train. dx, dy: how far the finger
  // moved, as a share of the screen. Drag down to look from up high, drag sideways to go round.
  swipe(dx, dy) {
    if (!this.running || this.mode === 'seat') return;
    const sw = this.swing;
    sw.toYaw -= dx * Math.PI * 1.6;
    sw.toPitch = Math.min(1.2, Math.max(-0.5, sw.toPitch + dy * 2));
    sw.held = true;
    sw.idle = 0;
  }

  // Pinching zooms in and out. scale: how much further apart his fingers are than a moment ago.
  pinch(scale) {
    if (!this.running || this.mode === 'seat') return;
    const sw = this.swing;
    // Kept as a log, so zooming in and back out again eases at the same pace.
    sw.toZoom = Math.min(Math.log(ZOOM_OUT), Math.max(Math.log(ZOOM_IN), sw.toZoom - Math.log(scale)));
    sw.held = true;
    sw.idle = 0;
  }

  // Finger up: spun round three times is the same as not at all, so it drifts back the short way.
  letGo() {
    const sw = this.swing;
    const turns = sw.toYaw - wrapAngle(sw.toYaw);
    sw.toYaw -= turns;
    sw.yaw -= turns;
    sw.held = false;
  }

  resetSwing() {
    this.swing = { yaw: 0, pitch: 0, zoom: 0, toYaw: 0, toPitch: 0, toZoom: 0, held: false, idle: 0 };
  }

  loop(now) {
    if (!this.running) return;
    // Slow frames for a while: step the looks down a notch.
    if (this.frames.add((now - this.last) / 1000) && stepDown()) this.applyQuality();
    // Allow long frames so a slow device doesn't put the whole ride in slow motion.
    const dt = Math.min(0.1, (now - this.last) / 1000) * this.timeScale;
    this.last = now;
    this.time += dt;
    this.dt = dt;
    const tr = this.track;

    if (!this.finished && this.time > START_DELAY) {
      const ramp = Math.min(1, (this.time - START_DELAY) / 1.5);
      this.v = this.sample(tr.speed, this.s) * ramp;
      this.s = Math.min(tr.length, this.s + this.v * dt);
      this.triggers();
    }
    if (this.slide) this.spinRaft(dt);

    // Characters
    this.handsTimer = Math.max(0, this.handsTimer - dt);
    this.cheer = Math.max(0, this.cheer - dt);
    const handsUp = this.handsTimer > 0 || this.finished;
    const speed01 = Math.min(1, this.v / V_MAX);
    this.hands.update(dt, this.handsTimer > 0);
    if (this.mode !== 'seat') this.hands.group.visible = false; // his arms belong to the front-seat view
    this.kid.update(dt, handsUp ? 1 : 0, speed01);
    this.friend.update(dt, handsUp || this.cheer > 0 ? 1 : 0, speed01);
    if (this.train.group.visible) for (const p of this.passengers) p.update(dt, handsUp || this.cheer > 0 ? 1 : 0, speed01);

    for (const p of this.world.pickups) if (p.holder.visible) p.spin.rotation.y += dt * (p.spinRate ?? 3);
    WIND.value = this.time;
    this.world.update?.(dt, this.time);
    this.effects.update(dt);
    if (this.finished) this.dusk = Math.min(1, this.dusk + dt * 0.5);

    this.placeTrain();
    if (this.mode === 'seat') this.placeSeatCamera(this.s, 1 - Math.exp(-dt * 8));
    else this.placeChaseCamera(dt, false);
    this.speedFeel(dt);
    this.updateSky();
    this.placeSun();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  // The ring float turns as it goes: a lazy sway on the slide, round and round in a bowl.
  spinRaft(dt) {
    const tr = this.track;
    const i = Math.min(tr.count - 1, Math.round(this.s / tr.step));
    const bowl = tr.bowls.find((b) => i >= b.spiralStart && i <= b.drainEnd);
    if (bowl && !this.finished) {
      const p = this.vec(tr.pos, this.s);
      const rho = Math.max(1.5, Math.hypot(p.x - bowl.center.x, p.z - bowl.center.z));
      this.raftYaw += dt * Math.min(4, (this.v / rho) * 0.7);
    } else if (this.inRapids) {
      this.raftYaw += dt * 0.9; // the rapids turn the float slowly round
    } else {
      this.raftYaw = wrapAngle(this.raftYaw);
      const target = this.finished ? this.raftYaw : 0.35 * Math.sin(this.time * 0.6);
      this.raftYaw += (target - this.raftYaw) * Math.min(1, dt * 0.8);
    }
    this.bowlCam += ((bowl ? 1 : 0) - this.bowlCam) * Math.min(1, dt * 1.2);
    this.inBowl = bowl || null;
  }

  // The faster he goes, the wider the view, the more it rumbles, and the more wind streaks by.
  // Works in both views, and goes by real speed (m/s) so a normal hill's ~20 m/s drop feels fast.
  speedFeel(dt) {
    const seat = this.mode === 'seat';
    const ramp = (from, to) => {
      const t = Math.min(1, Math.max(0, (this.v - from) / (to - from)));
      return t * t * (3 - 2 * t);
    };
    const boost = (seat ? 20 : 14) * ramp(8, 28);
    this.fovBoost += (boost - this.fovBoost) * Math.min(1, dt * 3);
    this.camera.fov = this.baseFov + this.fovBoost;
    this.camera.updateProjectionMatrix();
    this.bump = Math.max(0, this.bump - dt * 2.5);
    if (this.bump > 0) this.camera.translateY(-0.35 * this.bump * Math.sin(this.time * 30) * this.bump);
    // Flying through the air over a jump is smooth: no rumble.
    const flying = this.track.air?.[Math.min(this.track.count - 1, Math.round(this.s / this.track.step))];
    if (this.v > 0 && !this.finished && !flying) {
      const t = this.time;
      const amp = (seat ? 0.05 : 0.08) * ramp(6, 35) * (this.slide ? 0.6 : 1); // water is smoother than steel
      this.camera.translateX(amp * (Math.sin(t * 31) * 0.6 + Math.sin(t * 53 + 1.3) * 0.4));
      this.camera.translateY(amp * (Math.sin(t * 37 + 0.7) * 0.6 + Math.sin(t * 67) * 0.4));
      this.camera.rotateZ(amp * 0.1 * Math.sin(t * 43));
    }
    if (this.slide && this.inRapids && !this.finished) {
      // Bumping over the waves in the rapids.
      const t = this.time;
      this.camera.translateY((seat ? 0.09 : 0.05) * Math.sin(t * 8.5));
      this.camera.rotateZ((seat ? 0.04 : 0.02) * Math.sin(t * 6.3 + 1));
    }
    this.streaks.update(dt, this.v, ramp(12, 30));
    if (this.speedfx) this.speedfx.style.opacity = String(0.75 * ramp(15, 35));
  }

  // Blue sky with a haze at the horizon, a sunset at the finish, and outer space up high.
  updateSky() {
    const h = this.camera.position.y;
    const t = Math.min(1, Math.max(0, Math.log(Math.max(h, 1) / SPACE_FROM) / Math.log(SPACE_TO / SPACE_FROM)));
    const space = t * t * (3 - 2 * t);
    // See all the way to the curved horizon from up high.
    const horizon = Math.sqrt(2 * EARTH_R * Math.max(h, 0));
    this.camera.far = Math.max(4000, horizon * 1.3 + 2000);
    const u = this.skyDome.uniforms;
    u.top.value.copy(this.sky.top).lerp(DUSK_TOP, this.dusk);
    u.horizon.value.copy(this.sky.horizon).lerp(DUSK_HORIZON, this.dusk);
    u.spaceMix.value = space;
    u.dusk.value = this.dusk;
    this.skyDome.mesh.position.copy(this.camera.position);
    this.scene.fog.color.copy(u.horizon.value).lerp(SPACE, space);
    this.scene.fog.near = 250 + h * 2;
    this.scene.fog.far = 2600 + h * 9;
    this.space.update(this.camera.position, space);
  }

  // The shadow box follows the train, reaching a little ahead of the camera, snapped to whole
  // shadow-map texels so shadow edges don't crawl as it moves. Warmer, lower sun at the finish.
  placeSun() {
    const sun = this.sun;
    sun.color.copy(SUN_COLOR).lerp(DUSK_SUN, this.dusk);
    sun.intensity = 2.3 - this.dusk * 0.9;
    this.scene.environmentIntensity = 1 - this.dusk * 0.4;
    if (!sun.castShadow) return;
    const focus = this.vec(this.track.pos, this.s);
    const fwd = this.camera.getWorldDirection(new THREE.Vector3()).setY(0);
    if (fwd.lengthSq() > 1e-4) focus.addScaledVector(fwd.normalize(), SHADOW_R * 0.4);
    const x = new THREE.Vector3().crossVectors(UP, SUN_DIR).normalize();
    const y = new THREE.Vector3().crossVectors(SUN_DIR, x);
    const texel = (2 * SHADOW_R) / sun.shadow.mapSize.x;
    for (const axis of [x, y]) {
      const d = focus.dot(axis);
      focus.addScaledVector(axis, Math.round(d / texel) * texel - d);
    }
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(SUN_DIR, 300);
  }

  // Things that happen at places along the track.
  triggers() {
    const tr = this.track;
    const i = Math.round(this.s / tr.step);
    if (this.slide) sound.waterSpeed(Math.min(1, this.v / 25), !!tr.enclosed[Math.min(i, tr.count - 1)]);
    else sound.windSpeed(Math.min(1, this.v / V_MAX));

    if (tr.lift[i]) {
      if (this.slide) {
        // Water jets: a hiss and a fizz of bubbles every so often.
        if (this.time - this.lastJet > 0.4) {
          this.lastJet = this.time;
          sound.jet();
          this.effects.bubbles(this.vec(tr.pos, this.s + 1.5), this.vec(tr.tan, this.s).multiplyScalar(this.v), 12);
        }
      } else if (this.s - this.lastClack > 1.2 && this.time - (this.lastClackTime || 0) > 0.09) {
        this.lastClack = this.s;
        this.lastClackTime = this.time;
        sound.clack();
      }
    }
    while (this.nextWhee < tr.whee.length && tr.whee[this.nextWhee] <= i) {
      this.nextWhee++;
      this.cheer = 1.8;
      sound.whee();
    }
    const pickups = this.world.pickups;
    while (this.nextStar < pickups.length && this.s >= pickups[this.nextStar].s - 3) {
      const p = pickups[this.nextStar++];
      p.holder.visible = false;
      const carry = this.vec(tr.tan, p.s).multiplyScalar(this.v);
      this.starCount++;
      if (this.slide) {
        this.effects.bubbles(p.at, carry);
        sound.quack(this.starCount);
      } else {
        this.effects.sparkle(p.at, carry);
        sound.ding(this.starCount);
      }
      this.onStar(this.starCount);
    }
    const tunnels = this.world.tunnels;
    while (this.nextTunnel < tunnels.length && this.s >= tunnels[this.nextTunnel][0] * tr.step - 4) {
      this.nextTunnel++;
      if (this.slide) {
        // Through the waterfall into the cave.
        sound.waterfall();
        this.wetLens(14);
        this.cheer = 1.2;
      } else sound.whoosh();
    }
    // Rocket boosters: a countdown as they come up, then blast off, with flames (or, on the
    // slide, a water cannon) out the back all the way along.
    const launches = tr.launches;
    if (this.nextLaunch < launches.length) {
      const [a, b] = launches[this.nextLaunch];
      const ahead = a * tr.step - this.s;
      if (!this.countedDown && ahead > 0 && ahead < Math.max(1, this.v) * this.timeScale * 1.2) {
        this.countedDown = true;
        sound.countdown();
      }
      if (i >= a) {
        this.nextLaunch++;
        this.countedDown = false;
        this.boostTo = b;
        this.cheer = 2.5;
        if (this.slide) {
          sound.jet();
          sound.whoosh();
          this.wetLens(8);
        } else sound.rocket();
      }
    }
    if (i <= this.boostTo && this.time - this.lastFlame > 0.05) {
      this.lastFlame = this.time;
      const back = this.vec(tr.tan, this.s).negate();
      const carry = back.clone().multiplyScalar(-this.v * 0.6);
      const at = this.vec(tr.pos, Math.max(0, this.s - (this.slide ? 1.5 : 8))).addScaledVector(this.vec(tr.up, this.s), 0.6);
      if (this.slide) this.effects.bubbles(at, back.multiplyScalar(8).add(carry), 18);
      else this.effects.flames(at, back, carry);
    }

    // Ramp jumps: "wheee" off the lip, quiet in the air, then a boing and a bump on landing
    // (a big splash on the slide).
    const jumps = tr.jumps;
    if (this.nextJump < jumps.length) {
      const j = jumps[this.nextJump];
      if (!this.flying && i >= j.lip) {
        this.flying = true;
        this.cheer = 2.5;
        sound.whee();
      }
      if (this.flying && i >= j.land) {
        this.flying = false;
        this.nextJump++;
        this.bump = 1;
        this.cheer = Math.max(this.cheer, 1.5);
        sound.boing();
        const at = this.vec(tr.pos, this.s);
        if (this.slide) {
          const up = this.vec(tr.up, this.s);
          const side = new THREE.Vector3().crossVectors(up, this.vec(tr.tan, this.s)).normalize();
          this.effects.splash(at, side, 60);
          sound.splash();
          this.wetLens(12);
        } else this.effects.sparkle(at, this.vec(tr.tan, this.s).multiplyScalar(this.v * 0.5));
      }
    }

    // Into a corkscrew: boing, hands up, and a spray of sparkles.
    const twists = tr.corkscrews;
    while (this.nextTwist < twists.length && i >= twists[this.nextTwist][0]) {
      this.nextTwist++;
      sound.twist();
      setTimeout(() => this.running && sound.whee(), 450 / this.timeScale);
      this.cheer = 2.2;
      const carry = this.vec(tr.tan, this.s).multiplyScalar(this.v);
      if (this.slide) this.effects.bubbles(this.vec(tr.pos, this.s + 2), carry, 24);
      else this.effects.sparkle(this.vec(tr.pos, this.s + 2), carry);
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
      if (this.slide) this.wetLens(18);
    }
    if (this.slide) this.slideTriggers(i);

    if (this.s >= tr.length - 0.01) {
      this.finished = true;
      this.v = 0;
      sound.windStop();
      sound.waterStop();
      sound.cheer();
      if (this.slide) {
        const pool = this.world.pool;
        this.effects.fountainShow(new THREE.Vector3(pool.center.x, 0, pool.center.z), new THREE.Vector3(pool.dir.x, 0, pool.dir.z).normalize());
      } else this.effects.fireworks(this.camera);
      this.onFinish(this.starCount);
    }
  }

  // Water slide extras: round the toilet bowls, down the drain, rapids, and the splash into
  // the pool.
  slideTriggers(i) {
    const tr = this.track;
    // Rapids: splashes and bounces all the way through.
    const rapids = tr.special[Math.min(i, tr.count - 1)] === 1;
    if (rapids && !this.inRapids) {
      sound.whoosh();
      this.cheer = 1.5;
    }
    this.inRapids = rapids;
    if (rapids && this.time - this.lastRapids > 1.1) {
      this.lastRapids = this.time;
      const up = this.vec(tr.up, this.s);
      const tan = this.vec(tr.tan, this.s);
      const side = new THREE.Vector3().crossVectors(up, tan).normalize();
      this.effects.splash(this.vec(tr.pos, this.s + 1.5), side, 35);
      sound.rapids();
      this.wetLens(4);
      this.cheer = Math.max(this.cheer, 1.1);
    }
    const bowls = tr.bowls;
    if (this.nextBowl < bowls.length && i >= bowls[this.nextBowl].spiralStart) {
      const b = bowls[this.nextBowl++];
      let secs = 0;
      for (let k = b.spiralStart; k < b.spiralEnd; k++) secs += tr.step / tr.speed[k];
      sound.swirl(Math.min(6, Math.max(1.5, secs / this.timeScale)));
      this.cheer = 1.8;
    }
    if (this.nextDrain < bowls.length && i >= bowls[this.nextDrain].drainStart) {
      this.nextDrain++;
      sound.flush();
      setTimeout(() => this.running && sound.whee(), 350 / this.timeScale);
      this.cheer = 2.2;
      this.wetLens(10);
    }
    if (!this.pooled && i >= tr.pool.start) {
      this.pooled = true;
      const up = this.vec(tr.up, this.s);
      const tan = this.vec(tr.tan, this.s);
      const side = new THREE.Vector3().crossVectors(up, tan).normalize();
      this.effects.bigSplash(this.vec(tr.pos, this.s), tan, side);
      sound.bigSplash();
      this.wetLens(26);
      this.cheer = 2.5;
    }
  }

  // Drops of water land on the "lens" and run down the screen (fewer when watching from outside).
  wetLens(count) {
    const box = this.drips;
    if (!box) return;
    const n = this.mode === 'seat' ? count : Math.ceil(count / 3);
    const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
    for (let k = 0; k < n; k++) {
      const d = document.createElement('span');
      const size = (2 + Math.random() * 5) * vmin;
      d.style.width = `${size}px`;
      d.style.height = `${size * 1.15}px`;
      d.style.left = `${Math.random() * 100}%`;
      d.style.top = `${Math.random() * 70}%`;
      const dur = 1.4 + Math.random() * 1.8;
      d.style.animationDuration = `${dur}s`;
      d.style.animationDelay = `${Math.random() * 0.25}s`;
      box.append(d);
      setTimeout(() => d.remove(), (dur + 0.4) * 1000);
    }
  }

  placeTrain() {
    if (this.slide) {
      if (this.mode !== 'seat') this.placeRaft();
      else this.spray.update(0, false);
      return;
    }
    if (this.mode === 'seat') return;
    this.train.place((s) => this.frameAt(s), this.s);
  }

  // The track's position, up and forward s meters along; past either end it carries on straight.
  frameAt(s) {
    const tr = this.track;
    const c = Math.max(0, Math.min((tr.count - 1) * tr.step, s));
    const tan = this.vec(tr.tan, c).normalize();
    return { pos: this.vec(tr.pos, c).addScaledVector(tan, s - c), up: this.vec(tr.up, c).normalize(), tan };
  }

  placeRaft() {
    const tr = this.track;
    const up = this.vec(tr.up, this.s).normalize();
    const tan = this.vec(tr.tan, this.s).normalize();
    const side = new THREE.Vector3().crossVectors(up, tan).normalize();
    const m = new THREE.Matrix4().makeBasis(side, up, tan);
    this.raft.quaternion.setFromRotationMatrix(m);
    this.raft.rotateY(this.raftYaw);
    if (this.inRapids) {
      // Bucking over the waves.
      this.raft.rotateX(0.14 * Math.sin(this.time * 8.5));
      this.raft.rotateZ(0.12 * Math.sin(this.time * 6.3 + 1));
    }
    const p = this.vec(tr.pos, this.s);
    // Bobbing gently on the water.
    p.addScaledVector(up, 0.04 * Math.sin(this.time * 5));
    this.raft.position.copy(p);
    const moving = this.v > 3 && !this.finished && !(this.s > tr.pool.start * tr.step + 6);
    this.spray.update(this.dt || 0, moving, p.clone().addScaledVector(tan, -0.9), tan.clone().negate(), up, side, this.v);
  }

  placeSeatCamera(s, upBlend) {
    const tr = this.track;
    const eye = this.eye;
    const p = this.vec(tr.pos, s);
    const up = this.vec(tr.up, s).normalize();
    // Look further ahead when fast, so little wiggles in the track don't jerk the view.
    // Going round a bowl, look just along the wall instead of across it.
    const reach = this.slide && this.inBowl ? 4 : Math.min(30, LOOK_AHEAD + this.v * 0.25);
    const ahead = Math.min(tr.length, s + reach);
    const q = this.vec(tr.pos, ahead).addScaledVector(this.vec(tr.up, ahead).normalize(), eye);
    if (ahead - s < 1) q.add(this.vec(tr.tan, tr.length).multiplyScalar(LOOK_AHEAD));
    this.camUp.lerp(up, upBlend).normalize();
    this.camera.position.copy(p).addScaledVector(up, eye);
    this.camera.up.copy(this.camUp);
    this.camera.lookAt(q);
    // On the ring float the view sways a little as it turns.
    if (this.slide) this.camera.rotateY(0.3 * Math.sin(this.raftYaw));
  }

  // Following the train from behind and to the side, always right-side up. Going round a toilet
  // bowl it swings up high over the rim to watch him spiral down into it.
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
    // The faster the train, the further it pulls away from the camera.
    const back = 9 + 7 * Math.min(1, Math.max(0, (this.v - 8) / 25));
    const want = p.clone().addScaledVector(this.chaseDir, -back).addScaledVector(sideways, -5);
    want.y = Math.max(p.y + 4, 2.5);
    const bowl = this.slide && this.bowlCam > 0.001 ? this.inBowl || this.lastBowl : null;
    if (this.inBowl) this.lastBowl = this.inBowl;
    if (bowl) {
      const c = new THREE.Vector3(bowl.center.x, bowl.rim, bowl.center.z);
      const entry = this.vec(tr.pos, bowl.spiralStart * tr.step).setY(bowl.rim).sub(c).normalize();
      const crane = c.clone().addScaledVector(entry, bowl.R * 1.35).add(new THREE.Vector3(0, bowl.R * 0.9 + 3, 0));
      want.lerp(crane, this.bowlCam);
    }
    if (this.chaseLast && !snap) {
      // Move along with the train first, so even at space speeds the camera keeps up. Not when
      // craning over a bowl: there the camera holds still and watches him go round.
      const moved = p.clone().sub(this.chaseLast).multiplyScalar(1 - this.bowlCam);
      this.chasePos.add(moved);
      this.chaseLook.add(moved);
    }
    this.chaseLast = p.clone();
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
    // Never dip into a bowl's funnel on the way in or out of the crane shot.
    const clearBowls = (v) => {
      for (const b of this.slide ? tr.bowls : []) {
        if (Math.hypot(v.x - b.center.x, v.z - b.center.z) < b.R + 2.5) v.y = Math.max(v.y, b.rim + 2);
      }
    };
    clearBowls(this.chasePos);
    const eye = this.swungEye(dt);
    clearBowls(eye);
    this.camera.position.copy(eye);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.chaseLook);
  }

  // Where the camera goes once he's swiped it round the train or pinched it nearer or further
  // away. It follows his fingers closely, then
  // a little while after he lets go it drifts back to the usual view from behind.
  swungEye(dt) {
    const sw = this.swing;
    if (!sw.held && (sw.idle += dt) > SWING_HOLD) {
      const back = 1 - Math.exp(-dt * 1.5);
      sw.toYaw -= sw.toYaw * back;
      sw.toPitch -= sw.toPitch * back;
      sw.toZoom -= sw.toZoom * back;
    }
    const follow = 1 - Math.exp(-dt * 10);
    sw.yaw += (sw.toYaw - sw.yaw) * follow;
    sw.pitch += (sw.toPitch - sw.pitch) * follow;
    sw.zoom += (sw.toZoom - sw.zoom) * follow;
    const eye = this.chasePos.clone();
    if (Math.abs(sw.yaw) + Math.abs(sw.pitch) + Math.abs(sw.zoom) < 1e-4) return eye;
    const orbit = new THREE.Spherical().setFromVector3(eye.sub(this.chaseLook));
    orbit.theta += sw.yaw;
    // Zooming in also leans up, to look down over the cars behind at the riders up front.
    const up = sw.pitch + Math.max(0, -sw.zoom) * 0.5;
    // Swinging up stops short of straight overhead, and swinging down stops just above level
    // with the train, but a view already past either limit is left alone.
    const phi = orbit.phi - up;
    const TOP = 0.2;
    const LOW = Math.PI / 2 - 0.03;
    orbit.phi = up > 0 ? Math.max(Math.min(orbit.phi, TOP), phi) : Math.min(Math.max(orbit.phi, LOW), phi);
    // Zooming in stops before the camera bumps into the train, the same way.
    orbit.radius = Math.max(Math.min(orbit.radius, 3), orbit.radius * Math.exp(sw.zoom));
    eye.setFromSpherical(orbit).add(this.chaseLook);
    eye.y = Math.max(eye.y, Math.min(this.chasePos.y, 1.5)); // and never into the ground
    return eye;
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
