// All sounds are synthesized with Web Audio, so there are no files to load.
// iOS only allows audio after a touch, so unlock() is called on the first pointerdown.

let ctx = null;
let master = null;
let noiseBuffer = null;
let drawOsc = null;
let drawGain = null;
let wind = null;

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

// Drawing hum: pitch follows how high his finger is (y is 0..1).
export function drawStart(y) {
  if (!ready()) return;
  drawStop();
  drawOsc = ctx.createOscillator();
  drawGain = ctx.createGain();
  drawOsc.type = 'triangle';
  drawOsc.frequency.value = pitchFor(y);
  drawGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  drawGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
  drawOsc.connect(drawGain).connect(master);
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
  drawOsc = null;
  drawGain = null;
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
