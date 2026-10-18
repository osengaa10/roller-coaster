// How much the ride's looks may cost the GPU. Starts at the best tier, steps down on its own when
// frames get slow (and remembers that for next time), so an older iPad stays smooth.
// ?q=high|medium|low picks a tier for testing.
const KEY = 'coaster-doodle:quality';
const ORDER = ['high', 'medium', 'low'];

export const TIERS = {
  // shadows: shadow map size (0 = no real shadows, blob shadows instead); grass: share of grass
  // clumps; clearcoat: glossy car paint and slide plastic; glow: bloom-like glow sprites.
  high: { name: 'high', shadows: 2048, softShadows: true, pixelRatio: 2, grass: 1, clearcoat: true, glow: 1 },
  medium: { name: 'medium', shadows: 1024, softShadows: false, pixelRatio: 1.5, grass: 0.6, clearcoat: false, glow: 0.7 },
  low: { name: 'low', shadows: 0, softShadows: false, pixelRatio: 1.25, grass: 0.3, clearcoat: false, glow: 0.5 },
};

const forced = new URLSearchParams(location.search).get('q');

function load() {
  if (TIERS[forced]) return forced;
  try {
    const saved = localStorage.getItem(KEY);
    if (TIERS[saved]) return saved;
  } catch {
    // storage blocked: start at the top
  }
  return 'high';
}

let current = load();
export const quality = () => TIERS[current];

// One step down. Returns the new tier, or null if already at the bottom (or forced by the URL).
export function stepDown() {
  const i = ORDER.indexOf(current);
  if (forced || i === ORDER.length - 1) return null;
  current = ORDER[i + 1];
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // not fatal
  }
  return TIERS[current];
}

// Watches frame times during the ride: slow for a couple of seconds in a row means step down.
// Frames are measured unscaled (before ?fast), and the first second is ignored (shaders compile).
export class FrameWatch {
  constructor(limitMs = 22, windowS = 2) {
    this.limit = limitMs / 1000;
    this.window = windowS;
    this.reset();
  }

  reset() {
    this.sum = 0;
    this.frames = 0;
    this.skip = 1;
  }

  // Returns true when the last window was too slow.
  add(seconds) {
    if (this.skip > 0) {
      this.skip -= seconds;
      return false;
    }
    this.sum += seconds;
    this.frames++;
    if (this.sum < this.window) return false;
    const slow = this.sum / this.frames > this.limit;
    this.sum = 0;
    this.frames = 0;
    return slow;
  }
}
