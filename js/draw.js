// The drawing screen: a side view of a sunny park (or a beach, for the water slide) where a
// finger drag lays down track. This file handles the fingers, the view and the layers; the
// pictures are painted by draw-park.js (coaster) and draw-slide.js (water slide).
import { STATION, MIN_Y, MIN_DRAWN_LENGTH, pathFromStrokes, drawnLength, stationFor } from './track.js';
import { shapeSlide } from './slide.js';
import * as beach from './draw-slide.js';
import * as park from './draw-park.js';
import { trackShape, supportSpots2D, clearSprites, sunGlow } from './draw-art.js';
import { quality } from './quality.js';
import * as sound from './sound.js';

const GROUND = 0.86; // ground line as a fraction of screen height
const MAX_HISTORY = 60;
const MIN_ZOOM = 0.027; // how far the view can zoom out (1 = the sky is one track-height tall)
const TOP_Y = 1 / MIN_ZOOM; // highest point he can draw (normalized; ~37 = 1.5 km, up in space)
const SETTLE = 1.0; // per second: zooming back in as the line comes down from a big hill
const WOBBLE_PX = 20; // finger wobble smoothed away on screen; stored per point as track units
const SUPPORT_TOP = 7.5; // normalized (300 m): no supports drawn above this, same as the ride
const EARTH_R = 220; // normalized; a pretend-small Earth so its curve shows when zoomed way out
const REF_UNIT = 700; // px per unit on an iPad; decorations scale relative to this
const EDGE_ZOOM = 0.55; // per second at first; speeds up the longer he holds against the top
const EDGE_SCROLL = 0.5; // screen-widths per second when holding against the left or right side
const EDGE_ZONE = 0.14; // the edge zones reach this far in (fraction of the screen's short side)
const EDGE_EASE = 10; // per second: how quickly the view's edge motion speeds up and slows down
const TURN_BACK = 6; // px moved away from an edge in the last tenth of a second: he's turned back
const PINCH_BEFORE = 15; // a second finger only starts a pinch while the line is shorter than this
const IDLE_FRAME = 30; // ms between frames while the scenery just sways (about 30 fps)
const SUPPORTS_EVERY = 100; // ms: while a line is drawn, its columns catch up this often

// Sky color by height (normalized units): blue near the ground, dark space way up high.
// The blue lasts a long way up and only slowly turns into space (1 unit = 40 m).
const SKY_STOPS = [
  [0, [201, 236, 255]],
  [1, [79, 179, 255]],
  [4, [48, 120, 230]],
  [12, [30, 62, 165]],
  [24, [14, 20, 62]],
  [32, [5, 6, 26]],
];
function skyAt(alt) {
  let i = 0;
  while (i < SKY_STOPS.length - 2 && alt > SKY_STOPS[i + 1][0]) i++;
  const [a0, c0] = SKY_STOPS[i];
  const [a1, c1] = SKY_STOPS[i + 1];
  const f = Math.max(0, Math.min(1, (alt - a0) / (a1 - a0)));
  return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(',')})`;
}

// Stars live up in the sky (track coordinates), so they come into view as he zooms out.
const STARS = (() => {
  let seed = 9;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 600 }, () => ({ x: -20 + rand() * 150, y: 10 + Math.pow(rand(), 0.7) * 30, r: 0.6 + rand() * 1.5 }));
})();
export const STARS_FROM = 10; // units: stars start to show above here
const PLANETS = [
  { x: 8, y: 18, r: 1.1, color: '#e9e9ee', craters: true },
  { x: 20, y: 27, r: 1.9, color: '#e8c27a', ring: '#d9b77a' },
  { x: 32, y: 34, r: 0.9, color: '#d9623b' },
];

export class DrawPad {
  constructor(canvas, hand, { strokes = [], onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hand = hand;
    this.strokes = strokes; // [{ c: crayon index, p: [points] }]
    this.color = 0;
    this.history = [];
    this.onChange = onChange;
    this.pointerId = null; // the finger that is drawing
    this.pointers = new Map(); // every finger on the screen
    this.pinch = null;
    this.waitForLift = false; // after a pinch, ignore the leftover finger until all are lifted
    this.zoom = 1;
    this.panX = 0; // track x at the left edge of the screen
    this.edgeHold = 0; // seconds the finger has been held against the top
    this.edgePush = { top: 0, side: 0 }; // how hard the view is moving at the edges right now (0..1)
    this.trail = []; // where the drawing finger has been lately: { x, y, t }
    this.zoomedOut = false; // this line zoomed the view out (so it may zoom back in as it comes down)
    this.dirty = true;
    this.active = true;
    this.mode = 'coaster';
    this.sessions = {}; // per game: its strokes, undo history and view
    this.found = null; // water slide: bowls and rapids found in the drawing (cached; see slideShape)
    // The picture is four stacked canvases, so the browser layers them for free: the back (sky,
    // scenery, ground) and the track are only repainted when the view or the drawing changes;
    // what moves is painted every frame on the live canvas between them and on this one, on top.
    // `dirty` repaints the back and the track, `trackDirty` just the track.
    const layer = (opaque = false) => {
      const c = document.createElement('canvas');
      c.className = 'layer';
      c.setAttribute('aria-hidden', 'true');
      if (opaque) c.getContext('2d', { alpha: false }); // the sky covers it all, so nothing needs blending
      canvas.before(c);
      return c;
    };
    this.back = layer(true);
    this.mid = layer();
    this.front = layer();
    this.trackDirty = true;
    this.lastFrame = 0;
    // Gentle motion, unless the device asks for less or turns out too slow for it.
    this.motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.lite = quality().name === 'low';

    this.resize();
    this.fitView();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));

    let last = performance.now();
    let wasActive = false;
    const tick = (t) => {
      const raw = (t - last) / 1000;
      const dt = Math.max(0, Math.min(0.05, raw));
      last = t;
      if (this.active) {
        if (!wasActive) this.frameWatch = { skip: 1, sum: 0, n: 0, spells: 0 };
        this.edgeMove(dt);
        this.settleZoom(dt);
        // Full speed while a finger is down, a gentle 30 fps while the scenery just sways.
        const busy = this.pointerId !== null || this.pinch !== null;
        if (!busy && this.backScale !== this.dpr) this.dirty = true; // sharpen the back again
        if (this.dirty || this.trackDirty || (this.motion && (busy || t - this.lastFrame >= IDLE_FRAME))) {
          this.render(t);
          this.lastFrame = t;
        }
        if (this.motion) this.watchFrames(raw);
        this.animateHand(t);
      }
      wasActive = this.active;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Frame times while the scenery moves, in 3-second stretches (after a second to settle in).
  // Two slow stretches running, not just a hiccup, and it holds still from then on.
  watchFrames(seconds) {
    const fw = this.frameWatch;
    if (fw.skip > 0) {
      fw.skip -= seconds;
      return;
    }
    fw.sum += seconds;
    fw.n++;
    if (fw.sum < 3) return;
    fw.spells = fw.sum / fw.n > 0.03 ? fw.spells + 1 : 0;
    fw.sum = 0;
    fw.n = 0;
    if (fw.spells >= 2) this.motion = false;
  }

  get canGo() {
    return drawnLength(this.strokes, this.mode) >= MIN_DRAWN_LENGTH;
  }

  get station() {
    return stationFor(this.mode);
  }

  // The drawn path (station first). Cached: lines only ever grow at the end, and undo, clear
  // or switching games swap in a new strokes array.
  path() {
    const s = this.strokes;
    const key = `${this.mode}:${s.length}:${s.length ? s[s.length - 1].p.length : 0}`;
    if (this.pathCache?.strokes !== s || this.pathCache.key !== key) this.pathCache = { strokes: s, key, pts: pathFromStrokes(s, this.mode) };
    return this.pathCache.pts;
  }

  // Switch between the coaster and the water slide. Each keeps its own drawing, undo and view.
  setMode(mode, strokes) {
    this.sessions[this.mode] = { strokes: this.strokes, history: this.history, zoom: this.zoom, panX: this.panX };
    this.mode = mode;
    const saved = this.sessions[mode];
    this.strokes = saved ? saved.strokes : strokes;
    this.history = saved ? saved.history : [];
    this.found = null;
    if (saved) this.setView(saved.zoom, saved.panX);
    else this.fitView();
    this.dirty = true;
  }

  // The water slide's tricks: tight circles become toilet bowls and zigzags rapids.
  // Found once a line is finished; while a line is being drawn only
  // points are added at the end, so the ones found stay valid and are just reapplied.
  slideShape(path) {
    const shape = shapeSlide(path, this.found);
    this.found = shape.found;
    return shape;
  }

  // A line was finished (or the drawing changed): look for tricks again, with a sound for each new one.
  strokesChanged() {
    const before = this.found;
    this.found = null;
    if (this.mode !== 'slide') return;
    const now = this.slideShape(this.path()).found;
    const more = (k) => now[k].length > (before ? before[k].length : 0);
    if (more('bowls')) sound.swirl();
    if (more('rapids')) sound.splash();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    for (const layer of [this.back, this.mid, this.front]) {
      layer.width = this.canvas.width;
      layer.height = this.canvas.height;
      layer.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.backScale = dpr;
    clearSprites();
    this.dirty = true;
    this.w = w;
    this.h = h;
    this.groundY = Math.round(h * GROUND);
    // Keep the station clear of the iPhone notch in landscape.
    const probe = document.getElementById('safe-probe');
    this.left = probe ? parseFloat(getComputedStyle(probe).paddingLeft) || 0 : 0;
    this.setView(this.zoom, this.panX);
  }

  get unit() {
    return this.groundY * this.zoom; // px per normalized unit
  }

  // Decorations (line widths, the station, the sun) scale with the screen and the zoom.
  get k() {
    return Math.min(1.1, this.unit / REF_UNIT);
  }

  setView(zoom, panX) {
    const before = [this.zoom, this.panX];
    this.zoom = Math.max(MIN_ZOOM, Math.min(1, zoom));
    const visible = (this.w - this.left) / this.unit;
    const farthest = Math.max(...this.path().map((p) => p.x));
    this.panX = Math.max(0, Math.min(panX, farthest - visible * 0.5));
    if (this.zoom !== before[0] || this.panX !== before[1]) {
      this.dirty = true;
      this.viewMoved = true;
    }
  }

  // Zoom out just enough to show the whole drawing (used when a saved drawing loads).
  fitView() {
    const pts = this.path();
    const maxX = Math.max(...pts.map((p) => p.x)) + 0.15;
    const maxY = Math.max(...pts.map((p) => p.y)) + 0.1;
    const fit = Math.min((this.w - this.left - 20) / (maxX * this.groundY), (this.groundY - 20) / (maxY * this.groundY));
    this.setView(Math.min(1, fit), 0);
  }

  toScreen(p) {
    return { x: this.left + (p.x - this.panX) * this.unit, y: this.groundY - p.y * this.unit };
  }

  toTrack(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.max(this.left + 4, clientX - r.left);
    const y = Math.min(clientY - r.top, this.groundY);
    const top = Math.min(TOP_Y, (this.groundY - 12) / this.unit);
    return {
      x: +((x - this.left) / this.unit + this.panX).toFixed(4),
      y: +Math.min(top, Math.max(MIN_Y, (this.groundY - y) / this.unit)).toFixed(4),
      w: +(WOBBLE_PX / this.unit).toFixed(3), // how zoomed out he was, for smoothing (see track.js)
    };
  }

  down(e) {
    e.preventDefault();
    sound.unlock();
    // Once he's really drawing, another touch (his other hand, a palm) is ignored, so the line
    // keeps following his finger instead of turning into a pinch.
    if (this.pointerId !== null && this.strokes[this.strokes.length - 1].p.length >= PINCH_BEFORE) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) return this.startPinch();
    if (this.pointerId !== null || this.pinch || this.waitForLift) return; // ignore extra fingers
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety; drawing still works without it
    }
    this.pushHistory();
    const p = this.toTrack(e.clientX, e.clientY);
    this.strokes.push({ c: this.color, p: [p] });
    this.lastScreen = { x: e.clientX, y: e.clientY };
    this.trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    this.zoomedOut = false;
    sound.drawStart(p.y, this.mode === 'slide');
    this.trackDirty = true;
  }

  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) return this.movePinch();
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const stroke = this.strokes[this.strokes.length - 1].p;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const now = performance.now();
    for (const ev of events.length ? events : [e]) {
      this.trail.push({ x: ev.clientX, y: ev.clientY, t: now });
      // Tiny wiggles are skipped, except at an edge, so the view moves the moment he gets there.
      const near = Math.hypot(ev.clientX - this.lastScreen.x, ev.clientY - this.lastScreen.y) < 4;
      if (near && !this.atEdge(ev.clientX, ev.clientY)) continue;
      this.lastScreen = { x: ev.clientX, y: ev.clientY };
      stroke.push(this.toTrack(ev.clientX, ev.clientY));
    }
    while (this.trail.length > 2 && now - this.trail[0].t > 200) this.trail.shift();
    sound.drawMove(stroke[stroke.length - 1].y);
    this.trackDirty = true;
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    if (this.pinch && this.pointers.size < 2) {
      this.pinch = null;
      this.waitForLift = this.pointers.size > 0;
    }
    if (this.pointers.size === 0) this.waitForLift = false;
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    sound.drawStop();
    this.trackDirty = true;
    this.strokesChanged();
    this.onChange();
  }

  // The view starts moving well before the finger reaches an edge: gently as it comes into the
  // zone, full speed in the last quarter by the edge (about 90 px in on an iPad), so the line
  // flows on without stopping. Drawing close to an edge only nudges it, and turning back stops it.
  get edgeZone() {
    return Math.max(40, Math.min(this.w, this.h) * EDGE_ZONE);
  }

  // How far into an edge zone a spot `d` px from the edge is: 0 outside, easing up to 1.
  edgeDepth(d) {
    const zone = this.edgeZone;
    const s = Math.max(0, Math.min(1, (zone - d) / (zone * 0.75)));
    return s * s * (3 - 2 * s);
  }

  // Right by an edge, where the view moves at full speed.
  atEdge(x, y) {
    const zone = this.edgeZone * 0.25;
    return y <= zone || x >= this.w - zone || x <= this.left + zone;
  }

  // Which way the finger has been going over the last tenth of a second (px; zero once it stops).
  heading() {
    const now = performance.now();
    const recent = this.trail.filter((p) => now - p.t < 100);
    if (recent.length < 2) return { dx: 0, dy: 0 };
    const a = recent[0];
    const b = recent[recent.length - 1];
    return { dx: b.x - a.x, dy: b.y - a.y };
  }

  // Taking a line toward an edge keeps the track going that way:
  // the top zooms out (up toward space), the sides scroll along at the same size
  // (the left side only until the station is back in view).
  // The finger stays put while the world moves under it, so the track grows that way.
  edgeMove(dt) {
    const push = this.edgePush;
    if (this.pointerId === null || !this.lastScreen) {
      push.top = push.side = 0;
      return;
    }
    const { x, y } = this.lastScreen;
    const { dx, dy } = this.heading();
    const top = dy > TURN_BACK ? 0 : this.edgeDepth(y);
    const right = dx < -TURN_BACK ? 0 : this.edgeDepth(this.w - x);
    const left = dx > TURN_BACK || this.panX <= 0 ? 0 : this.edgeDepth(x - this.left);
    const ease = 1 - Math.exp(-EDGE_EASE * dt);
    push.top += (top - push.top) * ease;
    push.side += (right - left - push.side) * ease;
    if (push.top < 0.01) this.edgeHold = 0;
    if (push.top < 0.002 && Math.abs(push.side) < 0.002) return;
    let zoom = this.zoom;
    if (push.top >= 0.002 && zoom > MIN_ZOOM) {
      this.edgeHold += dt * push.top;
      this.zoomedOut = true;
      zoom *= Math.exp(-EDGE_ZOOM * (1 + Math.min(this.edgeHold, 4) * 0.45) * push.top * dt);
    }
    const scroll = (push.side * EDGE_SCROLL * (this.w - this.left) * dt) / (this.groundY * zoom);
    this.setView(zoom, this.panX + scroll);
    const stroke = this.strokes[this.strokes.length - 1].p;
    const p = this.toTrack(x, y);
    const prev = stroke[stroke.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0.004) {
      stroke.push(p);
      sound.drawMove(p.y);
      this.trackDirty = true;
    }
  }

  // Coming back down from a giant hill, the view zooms back in around the finger, so whatever
  // he draws next near the ground (a loop, a little hill) comes out normal size. Only after this
  // line zoomed out against the top: otherwise the view stays put under his finger.
  settleZoom(dt) {
    if (this.pointerId === null || !this.lastScreen || this.zoom >= 1 || this.edgePush.top >= 0.01 || !this.zoomedOut) return;
    const stroke = this.strokes[this.strokes.length - 1].p;
    const pen = stroke[stroke.length - 1];
    const target = Math.min(1, 0.5 / Math.max(pen.y, 0.01)); // keep the pen around mid-sky
    if (target <= this.zoom) return;
    const zoom = Math.min(target, this.zoom * Math.exp(SETTLE * dt));
    const fx = this.lastScreen.x - this.left;
    const anchor = fx / this.unit + this.panX; // track x under the finger stays put
    this.setView(zoom, anchor - fx / (this.groundY * zoom));
  }

  // Two fingers: pinch to zoom out/in, slide to move along the track.
  startPinch() {
    if (this.pointerId !== null) {
      // The first finger had just started a line; a tiny one was really the start of a pinch.
      const stroke = this.strokes[this.strokes.length - 1];
      this.pointerId = null;
      sound.drawStop();
      if (stroke.p.length < PINCH_BEFORE) {
        this.strokes.pop();
        this.history.pop();
      }
      this.found = null;
      this.trackDirty = true;
      this.onChange();
    }
    const [a, b] = [...this.pointers.values()];
    const midX = (a.x + b.x) / 2;
    this.pinch = {
      dist: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.zoom,
      anchor: (midX - this.left) / this.unit + this.panX, // track x under the fingers
    };
  }

  movePinch() {
    const [a, b] = [...this.pointers.values()];
    if (!b) return;
    const zoom = this.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.dist);
    const midX = (a.x + b.x) / 2;
    this.zoom = Math.max(MIN_ZOOM, Math.min(1, zoom));
    this.setView(this.zoom, this.pinch.anchor - (midX - this.left) / this.unit);
  }

  pushHistory() {
    this.history.push(this.strokes.map((s) => ({ c: s.c, p: s.p.slice() })));
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  undo() {
    if (!this.history.length) return false;
    this.strokes = this.history.pop();
    this.dirty = true;
    this.found = null;
    this.onChange();
    return true;
  }

  clear() {
    if (!this.strokes.length) return false;
    this.pushHistory(); // so undo can bring it back
    this.strokes = [];
    this.found = null;
    this.setView(1, 0);
    this.onChange();
    return true;
  }

  // One frame: repaint the back and track layers if they changed, then what moves behind the
  // track (on the live layer) and in front of it (on this canvas).
  render(t) {
    if (this.dirty || this.trackDirty) this.paintLayers();
    const { w, h, z, space } = this;
    const sec = t / 1000;
    const slide = this.mode === 'slide';
    this.onLayer(this.mid, () => {
      this.ctx.clearRect(0, 0, w, h);
      if (slide) beach.paintLive(this, sec, z, space, { sway: !this.lite });
      else {
        park.paintSky(this, sec, z, space);
        park.paintTrees(this, sec, z, space, { sway: !this.lite, fewer: this.lite });
      }
    });
    this.ctx.clearRect(0, 0, w, h);
    if (slide) beach.paintSlideLive(this, this.slideLive, sec);
    else park.paintStationLive(this, sec);
  }

  paintLayers() {
    const pts = this.path();
    // The ground's curve is centered on the drawing, so a line that has grown a lot moves it.
    const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
    if (this.backCx === undefined || Math.abs(cx - this.backCx) > 0.05) this.dirty = true;
    if (this.dirty) {
      this.backCx = cx;
      // While a finger is moving the view (zooming against the top, scrolling, pinching) the back
      // is repainted every frame, so it's painted at 1x then; it's soft scenery, nobody sees.
      const moving = this.viewMoved && (this.pointerId !== null || this.pinch !== null);
      const scale = moving ? 1 : this.dpr;
      if (scale !== this.backScale) {
        this.backScale = scale;
        this.back.width = Math.round(this.w * scale);
        this.back.height = Math.round(this.h * scale);
        this.back.getContext('2d', { alpha: false }).setTransform(scale, 0, 0, scale, 0, 0);
      }
      const { groundY, unit, panX, left } = this;
      // Zoomed way out, the ground curves away like the Earth seen from up high.
      this.groundAt = (sx) => groundY + (((sx - left) / unit + panX - cx) ** 2 / (2 * EARTH_R)) * unit;
      this.onLayer(this.back, () => this.paintBack());
    }
    this.onLayer(this.front, () => {
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.paintFront(pts);
    });
    this.dirty = false;
    this.trackDirty = false;
    this.viewMoved = false;
  }

  // Paint with this.ctx pointing at one of the cached layers.
  onLayer(layer, fn) {
    const main = this.ctx;
    this.ctx = layer.getContext('2d');
    try {
      fn();
    } finally {
      this.ctx = main;
    }
  }

  // Sky (by height, up into space), far scenery and the ground.
  paintBack() {
    const { ctx, w, h, groundY, groundAt } = this;
    const topAlt = groundY / this.unit;
    const sky = ctx.createLinearGradient(0, groundY, 0, 0);
    for (const [alt] of SKY_STOPS) if (alt < topAlt) sky.addColorStop(alt / topAlt, skyAt(alt));
    sky.addColorStop(1, skyAt(topAlt));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const space = Math.max(0, Math.min(1, (topAlt - 4) / 20)); // 0 = all blue, 1 = deep space on screen
    if (topAlt > STARS_FROM) this.drawSpace();
    // Sun and clouds are scenery: sized to the screen, not the zoom.
    const z = Math.max(0.45, Math.min(1, Math.min(w, h) / 834));
    this.z = z;
    this.space = space;
    const slide = this.mode === 'slide';
    sunGlow(ctx, w * 0.5, h * 0.15, z);

    const edge = () => {
      ctx.beginPath();
      for (let sx = 0; sx <= w + 8; sx += 8) ctx.lineTo(sx, groundAt(sx));
    };
    if (space > 0) {
      edge(); // a soft glow of atmosphere hugging the curve
      ctx.strokeStyle = `rgba(140,200,255,${0.35 * space})`;
      ctx.lineWidth = 18;
      ctx.stroke();
    }
    if (slide) beach.paintSea(this, groundAt, z);
    else {
      park.paintMountains(this, groundAt, z, space);
      park.paintHills(this, groundAt, z, space);
    }
    const ground = () => {
      edge();
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
    };
    ground();
    const soil = ctx.createLinearGradient(0, groundY, 0, h);
    soil.addColorStop(0, slide ? '#f6dca6' : '#66cf57');
    soil.addColorStop(1, slide ? '#e6c083' : '#3c9a36');
    ctx.fillStyle = soil;
    ctx.fill();
    if (!slide) {
      // Mowed stripes across the lawn.
      ctx.save();
      ground();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (const [a, b] of [[0.16, 0.34], [0.56, 0.76]]) ctx.fillRect(0, groundY + (h - groundY) * a, w, (h - groundY) * (b - a));
      ctx.restore();
    }
    edge();
    ctx.strokeStyle = slide ? '#e3bd78' : '#4bb33f';
    ctx.lineWidth = 8;
    ctx.stroke();
    this.paintGroundDetail(groundAt, z, slide);
    if (slide) beach.paintSand(this, groundAt, z);
  }

  // The track (or slide) and the station (or tower).
  paintFront(pts) {
    if (this.mode === 'slide') {
      this.slideLive = beach.paintSlide(this, pts, this.slideShape(pts));
      beach.paintTower(this);
      return;
    }
    const { shape, spots } = this.trackParts(pts);
    park.paintStationBack(this);
    park.paintTrack(this, pts, shape, spots);
    park.paintStationFront(this);
  }

  // Which side the spine hangs on and where the columns go. They're in drawing units, so moving
  // the view doesn't need them again. While a line is being drawn the loops found so far are
  // kept (new ones show up when he lifts his finger) and the columns catch up every so often.
  trackParts(pts) {
    const c = this.partsCache;
    const unitKey = Math.round(Math.log(this.unit) * 8);
    if (c && c.pts === pts && c.unitKey === unitKey) return c;
    const drawing = this.pointerId !== null;
    const growing = drawing && c && c.strokes === this.strokes;
    const shape = c && c.pts === pts ? c.shape : trackShape(pts, growing ? c.shape.structure : null);
    const now = performance.now();
    let spots;
    let at = now;
    if (growing && c.unitKey === unitKey && now - c.at < SUPPORTS_EVERY) {
      spots = c.spots;
      at = c.at;
    } else {
      const size = park.trackSizes(this.k);
      spots = supportSpots2D(pts, shape.up, {
        every: Math.max(0.09, 22 / this.unit),
        drop: (size.drop + size.spine / 2) / this.unit,
        clear: Math.max(0.04, 8 / this.unit),
        top: SUPPORT_TOP,
        skip: (i) => pts[i].x < STATION.x1 + 0.03,
      });
    }
    this.partsCache = { pts, strokes: this.strokes, unitKey, shape, spots, at };
    return this.partsCache;
  }

  // Grass tufts and flowers (or, on the beach, specks and pebbles) just below the ground line.
  // They sit at fixed places in the drawing, so they scroll with it.
  paintGroundDetail(groundAt, z, slide) {
    const { ctx, w, h, unit, panX } = this;
    const step = Math.max(0.035, 18 / unit);
    const first = Math.floor(panX / step);
    const last = Math.ceil((panX + (w - this.left) / unit) / step);
    const hash = (n) => {
      const x = Math.sin(n * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    ctx.lineCap = 'round';
    for (let i = first; i <= last; i++) {
      const sx = this.left + (i * step - panX) * unit + (hash(i) - 0.5) * step * unit;
      const top = groundAt(sx);
      const y = top + 6 + hash(i + 0.5) * Math.max(0, h - top - 12) * 0.85;
      const r = hash(i + 0.25);
      if (slide) {
        ctx.fillStyle = r < 0.7 ? 'rgba(190,140,80,0.45)' : 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(sx, y, (r < 0.7 ? 1.5 : 2.5) * z, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (r < 0.75) {
        ctx.strokeStyle = r < 0.4 ? '#3f9e35' : '#7ad35e';
        ctx.lineWidth = 2 * z;
        ctx.beginPath();
        for (const lean of [-0.5, 0, 0.45]) {
          ctx.moveTo(sx + lean * 3 * z, y);
          ctx.lineTo(sx + lean * 7 * z, y - (7 + Math.abs(lean) * -3) * z);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = ['#ff5d73', '#ffd23f', '#ffffff', '#b388ff'][Math.floor(hash(i + 0.75) * 4)];
        ctx.beginPath();
        ctx.arc(sx, y - 3 * z, 3 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffb000';
        ctx.beginPath();
        ctx.arc(sx, y - 3 * z, 1.2 * z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawSpace() {
    const { ctx } = this;
    for (const s of STARS) {
      const p = this.toScreen(s);
      if (p.x < -4 || p.x > this.w + 4 || p.y < -4) continue;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (s.y - STARS_FROM) / 12)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pl of PLANETS) {
      const p = this.toScreen(pl);
      const r = pl.r * this.unit;
      if (pl.ring) {
        ctx.strokeStyle = pl.ring;
        ctx.lineWidth = r * 0.22;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 1.8, r * 0.5, -0.3, Math.PI * 0.9, Math.PI * 2.1); // back half of the ring
        ctx.stroke();
      }
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (pl.ring) {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 1.8, r * 0.5, -0.3, Math.PI * 0.1, Math.PI * 0.9); // front half
        ctx.stroke();
      }
      if (pl.craters) {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (const [cx, cy, cr] of [[-0.35, -0.2, 0.22], [0.3, 0.25, 0.18], [0.1, -0.45, 0.12]]) {
          ctx.beginPath();
          ctx.arc(p.x + cx * r, p.y + cy * r, cr * r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // A pointing hand that shows how to draw a hill, only while the track is empty.
  animateHand(t) {
    const show = this.strokes.length === 0 && this.pointers.size === 0;
    this.hand.style.opacity = show ? '1' : '0';
    if (!show) return;
    const cycle = (t / 3200) % 1;
    const k = Math.min(1, cycle / 0.8);
    const st = this.station;
    // Coaster: up and over a hill. Slide: swooping down off the tower.
    const p = this.toScreen({
      x: st.x1 + 0.05 + k * 0.7,
      y: this.mode === 'slide' ? st.y + 0.03 - 0.2 * (1 - Math.cos(Math.PI * k)) : st.y + 0.03 + 0.35 * Math.sin(Math.PI * k),
    });
    const size = this.hand.offsetHeight || 64;
    this.hand.style.transform = `translate(${p.x - size * 0.47}px, ${p.y - size * 0.1}px)`;
  }
}
