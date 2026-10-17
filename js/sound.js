// All sounds are synthesized with Web Audio, so there are no files to load.
// iOS only allows audio after a touch, so unlock() is called on the first pointerdown.

let ctx = null;
let master = null;
let noiseBuffer = null;
let drawOsc = null;
let drawGain = null;
let wind = null;
let water = null;
let drawWobble = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') ctx.resume();
}

const ready = () => ctx && ctx.state === 'running';

function tone(freq, start, dur, { type = 'sine', vol = 0.3, to = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(start, dur, { freq = 2000, q = 1, vol = 0.3, type = 'bandpass' } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master);
  src.start(start, Math.random());
  src.stop(start + dur + 0.05);
}

export function pop() {
  if (!ready()) return;
  tone(500, ctx.currentTime, 0.12, { vol: 0.25, to: 900 });
}

export function trash() {
  if (!ready()) return;
  noise(ctx.currentTime, 0.35, { freq: 800, q: 0.7, vol: 0.4 });
  tone(400, ctx.currentTime, 0.3, { type: 'triangle', vol: 0.2, to: 120 });
}

// Drawing hum: pitch follows how high his finger is (y is 0..1). Watery: a bubbly wobble.
export function drawStart(y, watery = false) {
  if (!ready()) return;
  drawStop();
  drawOsc = ctx.createOscillator();
  drawGain = ctx.createGain();
  drawOsc.type = 'triangle';
  drawOsc.frequency.value = pitchFor(y);
  drawGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  drawGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
  drawOsc.connect(drawGain).connect(master);
  if (watery) {
    drawWobble = ctx.createOscillator();
    const depth = ctx.createGain();
    drawWobble.frequency.value = 9;
    depth.gain.value = 18;
    drawWobble.connect(depth).connect(drawOsc.frequency);
    drawWobble.start();
  }
  drawOsc.start();
}

export function drawMove(y) {
  if (drawOsc) drawOsc.frequency.setTargetAtTime(pitchFor(y), ctx.currentTime, 0.03);
}

export function drawStop() {
  if (!drawOsc) return;
  const t = ctx.currentTime;
  drawGain.gain.cancelScheduledValues(t);
  drawGain.gain.setTargetAtTime(0.0001, t, 0.04);
  drawOsc.stop(t + 0.3);
  drawWobble?.stop(t + 0.3);
  drawOsc = null;
  drawGain = null;
  drawWobble = null;
}

const pitchFor = (y) => 200 * Math.pow(2, Math.max(0, Math.min(1, y)) * 2.2);

export function bell() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(1320, t, 0.5, { vol: 0.25 });
  tone(1320, t + 0.35, 0.7, { vol: 0.25 });
}

export function clack() {
  if (!ready()) return;
  noise(ctx.currentTime, 0.05, { freq: 1800, q: 4, vol: 0.5 });
}

export function windStart() {
  if (!ready()) return;
  windStop();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  wind = { src, filter, gain };
}

// speed01: 0 = stopped, 1 = top speed
export function windSpeed(speed01) {
  if (!wind) return;
  const t = ctx.currentTime;
  wind.gain.gain.setTargetAtTime(0.05 + speed01 * 0.5, t, 0.2);
  wind.filter.frequency.setTargetAtTime(250 + speed01 * 1800, t, 0.2);
}

export function windStop() {
  if (!wind) return;
  const w = wind;
  wind = null;
  w.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
  w.src.stop(ctx.currentTime + 0.6);
}

// A sliding "wheeeee!" with a bit of vibrato.
export function whee() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const vib = ctx.createOscillator();
  const vibGain = ctx.createGain();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2200;
  o.frequency.setValueAtTime(500, t);
  o.frequency.exponentialRampToValueAtTime(1100, t + 0.35);
  o.frequency.exponentialRampToValueAtTime(700, t + 1.4);
  vib.frequency.value = 7;
  vibGain.gain.value = 25;
  vib.connect(vibGain).connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
  g.gain.setValueAtTime(0.18, t + 1.0);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  vib.start(t);
  o.stop(t + 1.6);
  vib.stop(t + 1.6);
}

export function cheer() {
  if (!ready()) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.35, { type: 'triangle', vol: 0.25 }));
  tone(1047, t + 0.5, 0.9, { type: 'triangle', vol: 0.25 });
  tone(1319, t + 0.5, 0.9, { type: 'sine', vol: 0.15 });
  // Clappy crowd
  for (let i = 0; i < 30; i++) noise(t + 0.4 + Math.random() * 1.4, 0.04, { freq: 1500 + Math.random() * 1500, q: 2, vol: 0.25 });
}

// Star collected: a bright ding that climbs a little with every star in a row.
export function ding(n = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const f = 880 * Math.pow(2, (Math.min(n, 12) % 13) / 12);
  tone(f, t, 0.35, { vol: 0.22 });
  tone(f * 2, t + 0.04, 0.25, { type: 'triangle', vol: 0.08 });
}

// Hands up: a quick happy "yay!"
export function yay() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(520, t, 0.18, { type: 'triangle', vol: 0.18, to: 880 });
  tone(700, t + 0.16, 0.3, { type: 'triangle', vol: 0.18, to: 1150 });
}

// Into a tunnel: a filtered rush of air.
export function whoosh() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(2200, t + 0.35);
  f.frequency.exponentialRampToValueAtTime(250, t + 1.0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + 1.2);
}

export function splash() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 1.1, { type: 'lowpass', freq: 1400, q: 0.5, vol: 0.7 });
  noise(t + 0.05, 0.6, { freq: 3500, q: 0.8, vol: 0.25 });
  for (let i = 0; i < 10; i++) tone(1200 + Math.random() * 1800, t + 0.2 + Math.random() * 0.9, 0.08, { vol: 0.06 });
}

export function firework() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.5, { type: 'lowpass', freq: 220, q: 0.7, vol: 0.9 });
  for (let i = 0; i < 14; i++) noise(t + 0.15 + Math.random() * 0.8, 0.03, { freq: 2500 + Math.random() * 3000, q: 3, vol: 0.18 });
}

// --- Water slide ---------------------------------------------------------------------------

// Lifeguard whistle: two quick tweets with a trill.
export function whistle() {
  if (!ready()) return;
  const t = ctx.currentTime;
  for (const [at, dur] of [[0, 0.18], [0.26, 0.45]]) {
    const o = ctx.createOscillator();
    const trill = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 2900;
    trill.frequency.value = 38;
    depth.gain.value = 160;
    trill.connect(depth).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.12, t + at + 0.02);
    g.gain.setValueAtTime(0.12, t + at + dur - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
    o.connect(g).connect(master);
    o.start(t + at);
    trill.start(t + at);
    o.stop(t + at + dur + 0.05);
    trill.stop(t + at + dur + 0.05);
  }
}

// Rushing water that follows the raft's speed, with a slow gurgle. Louder inside closed tubes.
export function waterStart() {
  if (!ready()) return;
  waterStop();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 0.8;
  filter.frequency.value = 600;
  const gurgle = ctx.createOscillator();
  const gurgleDepth = ctx.createGain();
  gurgle.frequency.value = 3.3;
  gurgleDepth.gain.value = 180;
  gurgle.connect(gurgleDepth).connect(filter.frequency);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  gurgle.start();
  water = { src, filter, gain, gurgle };
}

export function waterSpeed(speed01, inTube = false) {
  if (!water) return;
  const t = ctx.currentTime;
  water.gain.gain.setTargetAtTime((0.08 + speed01 * 0.45) * (inTube ? 1.5 : 1), t, 0.2);
  water.filter.frequency.setTargetAtTime((inTube ? 380 : 500) + speed01 * 1600, t, 0.2);
  water.gurgle.frequency.setTargetAtTime(3 + speed01 * 6, t, 0.3);
}

export function waterStop() {
  if (!water) return;
  const w = water;
  water = null;
  w.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
  w.src.stop(ctx.currentTime + 0.6);
  w.gurgle.stop(ctx.currentTime + 0.6);
}

// Water jets pushing the raft uphill: a short hissing puff.
export function jet() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.16, { freq: 2600, q: 1.5, vol: 0.22 });
  noise(t, 0.12, { type: 'lowpass', freq: 400, q: 0.7, vol: 0.25 });
}

// Rubber duck: a squeaky quack that climbs a little with every duck in a row.
export function quack(n = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const up = Math.pow(2, (Math.min(n, 12) % 13) / 12);
  for (const [at, f0] of [[0, 900], [0.13, 1050]]) {
    const o = ctx.createOscillator();
    const bp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * up, t + at);
    o.frequency.exponentialRampToValueAtTime(f0 * up * 0.62, t + at + 0.11);
    bp.type = 'bandpass';
    bp.frequency.value = 1500 * up;
    bp.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(0.35, t + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.12);
    o.connect(bp).connect(g).connect(master);
    o.start(t + at);
    o.stop(t + at + 0.15);
  }
}

// Round and round: a whirling whoosh that swings from ear to ear.
export function swirl(seconds = 1.6) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(1600, t + seconds * 0.5);
  f.frequency.exponentialRampToValueAtTime(400, t + seconds);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  let out = g;
  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.2;
    lfo.connect(pan.pan);
    lfo.start(t);
    lfo.stop(t + seconds + 0.05);
    g.connect(pan);
    out = pan;
  }
  src.connect(f).connect(g);
  out.connect(master);
  src.start(t, Math.random());
  src.stop(t + seconds + 0.05);
  // A bubbly rising tune on top.
  [440, 554, 659, 880].forEach((fr, i) => tone(fr, t + i * 0.1, 0.18, { type: 'triangle', vol: 0.12, to: fr * 1.3 }));
}

// Down the drain: a cartoon flush, a big swooshing sweep with glugs.
export function flush() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(2400, t);
  f.frequency.exponentialRampToValueAtTime(180, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.8, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + 1.7);
  for (let i = 0; i < 9; i++) {
    const at = t + 0.5 + i * 0.12 + Math.random() * 0.05;
    const fr = 160 + Math.random() * 120;
    tone(fr, at, 0.1, { vol: 0.28, to: fr * 2.4 });
  }
}

// Through the waterfall into a cave: a roaring splashy rush.
export function waterfall() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 1.2, { type: 'lowpass', freq: 900, q: 0.6, vol: 0.6 });
  noise(t, 0.9, { freq: 4000, q: 0.7, vol: 0.25 });
  for (let i = 0; i < 8; i++) tone(900 + Math.random() * 1500, t + Math.random() * 0.8, 0.07, { vol: 0.05 });
}

// Splashing down into the pool: a big deep splash, then sprinkles.
export function bigSplash() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.5, { type: 'lowpass', freq: 260, q: 0.8, vol: 0.9 });
  noise(t, 1.6, { type: 'lowpass', freq: 1600, q: 0.5, vol: 0.75 });
  noise(t + 0.05, 0.8, { freq: 3800, q: 0.8, vol: 0.3 });
  for (let i = 0; i < 18; i++) tone(1000 + Math.random() * 2200, t + 0.25 + Math.random() * 1.4, 0.08, { vol: 0.06 });
}

// Fountain show: rising whooshes as the jets shoot up.
export function fountain() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1;
  f.frequency.setValueAtTime(400, t);
  f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + 1);
}
