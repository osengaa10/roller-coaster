// The drawing screen: a side view of a sunny park where a finger drag lays down track.
import { STATION, MIN_Y, MIN_DRAWN_LENGTH, pathFromStrokes, drawnLength, cssColor } from './track.js';
import * as sound from './sound.js';

const GROUND = 0.86; // ground line as a fraction of screen height
const MAX_HISTORY = 60;
const MIN_ZOOM = 0.01; // how far the view can zoom out (1 = the sky is one track-height tall)
const TOP_Y = 1 / MIN_ZOOM; // highest point he can draw (normalized; 100 = 4 km, up in space)
const SUPPORT_TOP = 7.5; // normalized (300 m): no supports drawn above this, same as the ride
const EARTH_R = 500; // normalized; a pretend-small Earth so its curve shows when zoomed way out
const REF_UNIT = 700; // px per unit on an iPad; decorations scale relative to this
const EDGE_ZOOM = 0.55; // per second at first; speeds up the longer he holds against the edge

// Sky color by height (normalized units): blue near the ground, dark space way up high.
// The blue lasts a long way up and only slowly turns into space (1 unit = 40 m).
const SKY_STOPS = [
  [0, [201, 236, 255]],
  [1, [79, 179, 255]],
  [6, [48, 120, 230]],
  [25, [30, 62, 165]],
  [55, [14, 20, 62]],
  [80, [5, 6, 26]],
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
  return Array.from({ length: 700 }, () => ({ x: -40 + rand() * 340, y: 20 + Math.pow(rand(), 0.7) * 82, r: 0.6 + rand() * 1.5 }));
})();
const STARS_FROM = 20; // units: stars start to show above here
const PLANETS = [
  { x: 20, y: 42, r: 2.5, color: '#e9e9ee', craters: true },
  { x: 55, y: 66, r: 4.5, color: '#e8c27a', ring: '#d9b77a' },
  { x: 92, y: 86, r: 2, color: '#d9623b' },
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
    this.edgeHold = 0; // seconds the finger has been held against an edge
    this.dirty = true;
    this.active = true;

    this.resize();
    this.fitView();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));

    let last = performance.now();
    const tick = (t) => {
      const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
      last = t;
      if (this.active) {
        this.edgeZoom(dt);
        if (this.dirty) this.render();
        this.animateHand(t);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  get canGo() {
    return drawnLength(this.strokes) >= MIN_DRAWN_LENGTH;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    this.zoom = Math.max(MIN_ZOOM, Math.min(1, zoom));
    const visible = (this.w - this.left) / this.unit;
    const farthest = Math.max(...pathFromStrokes(this.strokes).map((p) => p.x));
    this.panX = Math.max(0, Math.min(panX, farthest - visible * 0.5));
    this.dirty = true;
  }

  // Zoom out just enough to show the whole drawing (used when a saved drawing loads).
  fitView() {
    const pts = pathFromStrokes(this.strokes);
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
    };
  }

  down(e) {
    e.preventDefault();
    sound.unlock();
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
    sound.drawStart(p.y);
    this.dirty = true;
  }

  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch) return this.movePinch();
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const stroke = this.strokes[this.strokes.length - 1].p;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) {
      if (Math.hypot(ev.clientX - this.lastScreen.x, ev.clientY - this.lastScreen.y) < 4) continue;
      this.lastScreen = { x: ev.clientX, y: ev.clientY };
      stroke.push(this.toTrack(ev.clientX, ev.clientY));
    }
    sound.drawMove(stroke[stroke.length - 1].y);
    this.dirty = true;
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
    this.dirty = true;
    this.onChange();
  }

  // Holding a line against the right or top edge zooms out. The finger stays put while the world
  // shrinks under it, so the track keeps growing that way and the whole coaster stays in view.
  edgeZoom(dt) {
    if (this.pointerId === null || !this.lastScreen || this.zoom <= MIN_ZOOM) return;
    const band = Math.max(28, Math.min(this.w, this.h) * 0.07);
    const { x, y } = this.lastScreen;
    if (x < this.w - band && y > band) {
      this.edgeHold = 0;
      return;
    }
    this.edgeHold += dt;
    const rate = EDGE_ZOOM * (1 + Math.min(this.edgeHold, 4) * 0.45);
    this.setView(this.zoom * Math.exp(-rate * dt), this.panX);
    const stroke = this.strokes[this.strokes.length - 1].p;
    const p = this.toTrack(x, y);
    const prev = stroke[stroke.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0.004) {
      stroke.push(p);
      sound.drawMove(p.y);
    }
  }

  // Two fingers: pinch to zoom out/in, slide to move along the track.
  startPinch() {
    if (this.pointerId !== null) {
      // The first finger had just started a line; a tiny one was really the start of a pinch.
      const stroke = this.strokes[this.strokes.length - 1];
      this.pointerId = null;
      sound.drawStop();
      if (stroke.p.length < 15) {
        this.strokes.pop();
        this.history.pop();
      }
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
    this.onChange();
    return true;
  }

  clear() {
    if (!this.strokes.length) return false;
    this.pushHistory(); // so undo can bring it back
    this.strokes = [];
    this.setView(1, 0);
    this.onChange();
    return true;
  }

  render() {
    this.dirty = false;
    const { ctx, w, h, groundY } = this;

    // Sky, colored by height: zoomed out far enough, the top of the screen is outer space.
    const topAlt = groundY / this.unit;
    const sky = ctx.createLinearGradient(0, groundY, 0, 0);
    for (const [alt] of SKY_STOPS) if (alt < topAlt) sky.addColorStop(alt / topAlt, skyAt(alt));
    sky.addColorStop(1, skyAt(topAlt));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, groundY);
    const space = Math.max(0, Math.min(1, (topAlt - 6) / 40)); // 0 = all blue, 1 = deep space on screen
    if (topAlt > STARS_FROM) this.drawSpace();

    // Sun and clouds are scenery: sized to the screen, not the zoom.
    const z = Math.max(0.45, Math.min(1, Math.min(w, h) / 834));
    const sx = w * 0.5;
    const sy = h * 0.15;
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = '#ffe14d';
    ctx.lineWidth = 5 * z;
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * 46 * z, sy + Math.sin(a) * 46 * z);
      ctx.lineTo(sx + Math.cos(a) * 62 * z, sy + Math.sin(a) * 62 * z);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, 36 * z, 0, Math.PI * 2);
    ctx.fill();

    // Clouds belong low in the sky, so they fade away as space comes into view.
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - space)})`;
    for (const [cx, cy, s] of [[0.18, 0.22, 1], [0.78, 0.3, 1.3], [0.35, 0.45, 0.8]]) {
      cloud(ctx, cx * w, cy * h, s * z);
    }

    // Ground. Zoomed way out, it curves away like the Earth seen from up high.
    const pts = pathFromStrokes(this.strokes);
    const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
    const groundAt = (sx) => {
      const wx = (sx - this.left) / this.unit + this.panX;
      return groundY + ((wx - cx) ** 2 / (2 * EARTH_R)) * this.unit;
    };
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
    edge();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = '#5cc94f';
    ctx.fill();
    edge();
    ctx.strokeStyle = '#4bb33f';
    ctx.lineWidth = 8;
    ctx.stroke();

    this.drawTrack();
    this.drawStation();
  }

  drawSpace() {
    const { ctx } = this;
    for (const s of STARS) {
      const p = this.toScreen(s);
      if (p.x < -4 || p.x > this.w + 4 || p.y < -4) continue;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (s.y - STARS_FROM) / 30)})`;
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

  drawTrack() {
    const { ctx, groundY, k } = this;
    const pts = pathFromStrokes(this.strokes).map((p) => ({ ...this.toScreen(p), c: p.c, high: p.y > SUPPORT_TOP }));

    // Support poles
    ctx.strokeStyle = '#b9c3d6';
    ctx.lineWidth = Math.max(2, 5 * k);
    ctx.lineCap = 'butt';
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc > Math.max(14, 34 * k) && groundY - pts[i].y > 20 * k && !pts[i].high) {
        acc = 0;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y + 8 * k);
        ctx.lineTo(pts[i].x, groundY + 4);
        ctx.stroke();
      }
    }

    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    };

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Ties
    path();
    ctx.setLineDash([Math.max(2, 6 * k), Math.max(3, 8 * k)]);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#7a4a2a';
    ctx.lineWidth = Math.max(7, 20 * k);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
    // Rail, in each stroke's crayon color. Same-colored pieces are batched into one path.
    ctx.lineWidth = Math.max(3, 8 * k);
    let along = 0;
    let color = null;
    const mid = (i) => ({ x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 });
    for (let i = 1; i < pts.length; i++) {
      along += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / this.unit;
      const c = cssColor(pts[i].c, along);
      if (c !== color) {
        if (color) ctx.stroke();
        color = c;
        ctx.strokeStyle = c;
        ctx.beginPath();
        const from = i === 1 ? pts[0] : mid(i - 1);
        ctx.moveTo(from.x, from.y);
      }
      if (i < pts.length - 1) {
        const to = mid(i);
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, to.x, to.y);
      } else ctx.lineTo(pts[i].x, pts[i].y);
    }
    if (color) ctx.stroke();
    path();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, 2 * k);
    ctx.stroke();
  }

  drawStation() {
    const { ctx, k } = this;
    const a = this.toScreen({ x: STATION.x0, y: STATION.y });
    const b = this.toScreen({ x: STATION.x1, y: STATION.y });
    const len = b.x - a.x;

    // Roof on posts
    ctx.fillStyle = '#8a5a3c';
    ctx.fillRect(a.x + 4 * k, a.y - 70 * k, 6 * k, 70 * k);
    ctx.fillRect(b.x - 10 * k, a.y - 70 * k, 6 * k, 70 * k);
    ctx.fillStyle = '#ff8c42';
    ctx.beginPath();
    ctx.moveTo(a.x - 10 * k, a.y - 66 * k);
    ctx.lineTo(a.x + len / 2, a.y - 100 * k);
    ctx.lineTo(b.x + 10 * k, a.y - 66 * k);
    ctx.closePath();
    ctx.fill();
    // Platform
    ctx.fillStyle = '#d9a066';
    ctx.fillRect(a.x - 6 * k, a.y + 10 * k, len + 12 * k, this.groundY - a.y - 10 * k);

    // Little train waiting at the station
    const colors = ['#ffd23f', '#3bceac', '#ee4266'];
    const carW = (len - 22 * k) / 3;
    for (let i = 0; i < 3; i++) {
      const x = a.x + 8 * k + i * (carW + 3 * k);
      ctx.fillStyle = colors[i];
      roundRect(ctx, x, a.y - 24 * k, carW, 20 * k, 6 * k);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(x + 7 * k, a.y - 3 * k, 4 * k, 0, Math.PI * 2);
      ctx.arc(x + carW - 7 * k, a.y - 3 * k, 4 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A pointing hand that shows how to draw a hill, only while the track is empty.
  animateHand(t) {
    const show = this.strokes.length === 0 && this.pointers.size === 0;
    this.hand.style.opacity = show ? '1' : '0';
    if (!show) return;
    const cycle = (t / 3200) % 1;
    const k = Math.min(1, cycle / 0.8);
    const p = this.toScreen({
      x: STATION.x1 + 0.05 + k * 0.7,
      y: STATION.y + 0.03 + 0.35 * Math.sin(Math.PI * k),
    });
    const size = this.hand.offsetHeight || 64;
    this.hand.style.transform = `translate(${p.x - size * 0.47}px, ${p.y - size * 0.1}px)`;
  }
}

function cloud(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
  ctx.arc(x + 30 * s, y - 12 * s, 32 * s, 0, Math.PI * 2);
  ctx.arc(x + 62 * s, y, 24 * s, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
