// Remembers the last drawing. Storage can be missing or blocked, so every access is guarded.
const KEY = 'coaster-doodle:strokes';

export function loadStrokes() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(data) && data.every((s) => Array.isArray(s))) return data;
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
