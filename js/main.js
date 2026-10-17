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

// Two games: the roller coaster and the water slide. Each keeps its own drawing.
let mode = 'coaster';
const ICON = { coaster: '⭐', slide: '🦆' };
const CONFETTI = {
  coaster: ['⭐', '🎉', '🌟', '🎈', '✨', '❤️'],
  slide: ['💦', '🦆', '🌊', '🐠', '☀️', '🏖️'],
};

const pad = new DrawPad($('pad'), $('hand'), { strokes: loadStrokes(mode), onChange: changed });
const ride = new Ride($('view'), { onFinish: celebrate, onStar: showStars });
let track = null;

function changed() {
  saveStrokes(mode, pad.strokes);
  track = null;
  const go = $('go');
  go.classList.toggle('disabled', !pad.canGo);
  go.classList.toggle('ready', pad.canGo);
}
changed();
show('pick');

function pick(m) {
  mode = m;
  document.body.dataset.mode = m;
  $('hud-icon').textContent = ICON[m];
  pad.setMode(m, loadStrokes(m));
  changed();
  show('draw');
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  pad.active = id === 'draw';
  if (pad.active) pad.dirty = true;
}

function startRide() {
  $('finish').classList.remove('show');
  $('confetti').replaceChildren();
  $('tally').replaceChildren();
  $('hud-count').textContent = '0';
  show('ride');
  ride.resize();
  track ??= buildTrack(pad.strokes, { kind: mode });
  ride.start(track, mode);
}

function backToDrawing() {
  ride.stop();
  $('finish').classList.remove('show');
  show('draw');
}

function showStars(n) {
  const hud = $('hud');
  $('hud-count').textContent = String(n);
  hud.classList.remove('bump');
  void hud.offsetWidth;
  hud.classList.add('bump');
}

// Up to 10 stars are shown one by one so he can count them; more than that shows a number.
function showTally(n) {
  const tally = $('tally');
  if (n === 0) return;
  const icon = ICON[mode];
  const items = n <= 10 ? Array(n).fill(icon) : [icon, String(n)];
  items.forEach((text, i) => {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.animationDelay = `${0.6 + i * 0.25}s`;
    tally.append(span);
  });
}

function celebrate(stars) {
  showTally(stars);
  const bits = CONFETTI[mode];
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
for (const crayon of document.querySelectorAll('.crayon')) {
  crayon.addEventListener('click', () => {
    pad.color = Number(crayon.dataset.c);
    for (const c of document.querySelectorAll('.crayon')) c.classList.toggle('selected', c === crayon);
    sound.pop();
  });
}
tap('look', () => {
  sound.pop();
  $('look').classList.toggle('outside', ride.toggleMode() === 'outside');
});
// Tap anywhere on the ride for hands up.
$('view').addEventListener('pointerdown', () => ride.handsUp());

tap('pick-coaster', () => {
  sound.pop();
  pick('coaster');
});
tap('pick-slide', () => {
  sound.pop();
  pick('slide');
});
tap('picker', () => {
  sound.pop();
  show('pick');
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
