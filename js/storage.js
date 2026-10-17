// Remembers the last drawing for each game. Storage can be missing or blocked, so every access is guarded.
import { normalizeStroke } from './track.js';

// The coaster keeps the original key so drawings saved before the water slide came along still load.
const KEYS = { coaster: 'coaster-doodle:strokes', slide: 'coaster-doodle:slide-strokes' };

export function loadStrokes(mode = 'coaster') {
  try {
    const data = JSON.parse(localStorage.getItem(KEYS[mode]) || '[]');
    if (Array.isArray(data)) {
      const strokes = data.map(normalizeStroke);
      if (strokes.every((s) => s && Number.isInteger(s.c) && Array.isArray(s.p))) return strokes;
    }
  } catch {
    // fall through
  }
  return [];
}

export function saveStrokes(mode, strokes) {
  try {
    localStorage.setItem(KEYS[mode], JSON.stringify(strokes));
  } catch {
    // not fatal: the drawing just won't be remembered
  }
}
