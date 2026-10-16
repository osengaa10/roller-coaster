// Remembers the last drawing. Storage can be missing or blocked, so every access is guarded.
import { normalizeStroke } from './track.js';

const KEY = 'coaster-doodle:strokes';

export function loadStrokes() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(data)) {
      const strokes = data.map(normalizeStroke);
      if (strokes.every((s) => s && Number.isInteger(s.c) && Array.isArray(s.p))) return strokes;
    }
  } catch {
    // fall through
  }
  return [];
}

export function saveStrokes(strokes) {
  try {
    localStorage.setItem(KEY, JSON.stringify(strokes));
  } catch {
    // not fatal: the drawing just won't be remembered
  }
}
