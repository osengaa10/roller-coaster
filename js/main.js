import { DrawPad } from './draw.js';
import { Ride } from './ride.js';
import { buildTrack } from './track.js';
import { loadStrokes, saveStrokes } from './storage.js';
import * as sound from './sound.js';

const $ = (id) => document.getElementById(id);

// Stop iOS pinch-zoom, double-tap zoom and long-press menus anywhere in the app.
for (const type of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('pointerdown', sound.unlock, { capture: true });

const pad = new DrawPad($('pad'), $('hand'), { strokes: loadStrokes(), onChange: changed });
const ride = new Ride($('view'), { onFinish: celebrate });
let track = null;

function changed() {
  saveStrokes(pad.strokes);
  track = null;
  const go = $('go');
  go.classList.toggle('disabled', !pad.canGo);
  go.classList.toggle('ready', pad.canGo);
}
changed();

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  pad.active = id === 'draw';
  if (pad.active) pad.dirty = true;
}

function startRide() {
  $('finish').classList.remove('show');
  $('confetti').replaceChildren();
  show('ride');
  ride.resize();
  track ??= buildTrack(pad.strokes);
  ride.start(track);
}

function backToDrawing() {
  ride.stop();
  $('finish').classList.remove('show');
  show('draw');
}

function celebrate() {
  const bits = ['⭐', '🎉', '🌟', '🎈', '✨', '❤️'];
  const box = $('confetti');
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('span');
    s.textContent = bits[i % bits.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    s.style.animationDelay = `${Math.random() * 1.2}s`;
    box.append(s);
  }
  $('finish').classList.add('show');
}

function tap(id, fn) {
  $(id).addEventListener('click', fn);
}

tap('go', () => {
  if (!pad.canGo) {
    // Not enough track yet: wiggle "no" and point at where to draw.
    const go = $('go');
    go.classList.remove('shake');
    void go.offsetWidth;
    go.classList.add('shake');
    return;
  }
  sound.pop();
  startRide();
});
tap('undo', () => (pad.undo() ? sound.pop() : null));
tap('clear', () => (pad.clear() ? sound.trash() : null));
tap('home', () => {
  sound.pop();
  backToDrawing();
});
tap('again', () => {
  sound.pop();
  startRide();
});
tap('redraw', () => {
  sound.pop();
  backToDrawing();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
