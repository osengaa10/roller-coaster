// The coaster's drawing screen: a sunny park seen from the side, previewing the world of the ride.
// Snowy mountains far away, hills with woods, trees that sway, and the coaster built for real:
// a running rail and a fat spine joined by a truss, a lift chain up the climbs, steel columns on
// concrete footings, a station with a waiting train full of riders. All in his crayon colors.
import { STATION, cssColor } from './track.js';
import { sprite, hash, shade, paintClouds, paintBirds, paintSunRays, paintSunDisc } from './draw-art.js';

const CLOUDS = [[0.16, 0.22, 1, 0], [0.76, 0.3, 1.3, 1], [0.38, 0.45, 0.8, 2], [0.58, 0.11, 0.65, 2]];
const BIRDS = [[0.2, 0.8, 16, 0.1], [0.23, 0.6, 16, 0.135], [0.36, 0.7, 12, 0.6]];
const TREE_EVERY = 150; // px (times z) between places a tree might stand

// Track sizes in px at k = 1 (an iPad at normal zoom), and the least they shrink to.
export function trackSizes(k) {
  return {
    rail: Math.max(3, 7 * k),
    spine: Math.max(3, 11 * k),
    drop: Math.max(4, 13 * k), // rail center to spine center
    detail: k >= 0.22, // ties, chain and bolts only when they're big enough to see
  };
}

// ---- Back layer (repainted only when the view moves) ----

// Sharp snowy mountains far away, in two hazy rows, sliding by very slowly.
export function paintMountains(pad, groundAt, z, space) {
  const { ctx, w } = pad;
  const alpha = (1 - space) * Math.max(0, Math.min(1, (pad.zoom - 0.06) / 0.2));
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  for (const [row, color, every, tall, par] of [[0, '#b7c6dc', 210, 1.2, 0.08], [1, '#9cafc9', 170, 0.95, 0.12]]) {
    const shift = pad.panX * pad.unit * par;
    const step = every * z;
    for (let j = Math.floor((shift - 200 * z) / step); j * step - shift < w + 200 * z; j++) {
      const seed = j * 3.7 + row * 101;
      const px = j * step + hash(seed) * step * 0.6 - shift;
      const h = (60 + 80 * hash(seed + 0.5)) * tall * z;
      const hw = h * (1.05 + 0.5 * hash(seed + 0.2));
      peak(ctx, px, groundAt(px) + 4, h, hw, color, seed);
    }
  }
  ctx.globalAlpha = 1;
}

function peak(ctx, x, base, h, hw, color, seed) {
  const top = base - h;
  // Rocky outline: a couple of jags down each side.
  const left = [[x - hw * 0.35, top + h * (0.3 + hash(seed + 1) * 0.08)], [x - hw * 0.62, top + h * 0.55], [x - hw, base]];
  const right = [[x + hw * 0.3, top + h * (0.26 + hash(seed + 2) * 0.1)], [x + hw * 0.6, top + h * 0.6], [x + hw, base]];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (const [px, py] of right) ctx.lineTo(px, py);
  for (const [px, py] of [...left].reverse()) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  // The shady side, away from the sun (up and to the left).
  ctx.fillStyle = shade(color, 0.86);
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (const [px, py] of right) ctx.lineTo(px, py);
  ctx.lineTo(x + hw * 0.1, base);
  ctx.lineTo(x - hw * 0.05, top + h * 0.45);
  ctx.closePath();
  ctx.fill();
  // A snow cap with a ragged edge, a little grey-blue on the shady side.
  const snow = 0.3;
  const lx = x - hw * 0.35 * (snow / 0.3);
  const rx = x + hw * 0.3 * (snow / 0.28);
  ctx.fillStyle = '#f6f9fd';
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(rx, top + h * snow);
  ctx.lineTo(x + hw * 0.12, top + h * (snow - 0.08));
  ctx.lineTo(x, top + h * (snow + 0.04));
  ctx.lineTo(x - hw * 0.14, top + h * (snow - 0.06));
  ctx.lineTo(lx, top + h * (snow + 0.02));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(190,206,230,0.9)';
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(rx, top + h * snow);
  ctx.lineTo(x + hw * 0.12, top + h * (snow - 0.08));
  ctx.lineTo(x - hw * 0.02, top + h * 0.2);
  ctx.closePath();
  ctx.fill();
}

// Rolling hills far away, pale with haze, scrolling slower than the drawing; woods along the
// nearer one.
export function paintHills(pad, groundAt, z, space) {
  const { ctx, w } = pad;
  if (space >= 1) return;
  const shift = pad.panX * pad.unit * 0.3;
  const hillTop = (sx, height, freq, seed) => {
    const t = (sx + shift) * freq;
    const bump = 0.55 + 0.3 * Math.sin(t + seed) + 0.15 * Math.sin(t * 2.3 + seed * 3);
    return groundAt(sx) - height * z * bump;
  };
  const layers = [[50, `rgba(160,205,180,${0.85 * (1 - space)})`, 0.006, 1.7], [30, `rgba(112,186,122,${0.95 * (1 - space)})`, 0.011, 4.1]];
  layers.forEach(([height, color, freq, seed], n) => {
    ctx.beginPath();
    for (let sx = 0; sx <= w + 8; sx += 8) ctx.lineTo(sx, hillTop(sx, height, freq, seed));
    for (let sx = w + 8; sx >= 0; sx -= 8) ctx.lineTo(sx, groundAt(sx) + 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (n === 0) return;
    // Patches of woods: little round trees and pines along the hilltop.
    const step = 9 * z;
    const first = Math.floor(shift / step);
    for (let i = first; (i - first) * step < w + 20 * z; i++) {
      const sx = i * step - shift + hash(i) * 4 * z;
      const patch = Math.sin(i * 0.11) + Math.sin(i * 0.037 + 2) * 0.8;
      if (patch < 0.3) continue;
      const y = hillTop(sx, height, freq, seed) + 3 * z;
      const s = (7 + hash(i + 0.4) * 6) * z;
      ctx.fillStyle = `rgba(${hash(i + 0.6) < 0.5 ? '62,140,84' : '78,156,80'},${1 - space})`;
      ctx.beginPath();
      if (hash(i + 0.8) < 0.4) {
        ctx.moveTo(sx - s * 0.45, y);
        ctx.lineTo(sx, y - s * 1.5);
        ctx.lineTo(sx + s * 0.45, y);
      } else ctx.arc(sx, y - s * 0.6, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// ---- Live (every frame) ----

// The sun with slowly turning rays, drifting clouds and birds.
export function paintSky(pad, t, z, space) {
  const { ctx, w, h } = pad;
  const sx = w * 0.5;
  const sy = h * 0.15;
  paintSunRays(ctx, sx, sy, z, t, { color: '#ffe14d', count: 10, inner: 46, outer: 64, width: 5, alt: 6 });
  paintSunDisc(ctx, sx, sy, 36 * z, '#fff6b0', '#ffd93a');
  paintClouds(ctx, w, h, z, t, 0.95 * (1 - space), CLOUDS);
  paintBirds(ctx, w, h, z, t, 0.85 * (1 - space), BIRDS);
}

// Trees standing behind the track, a bit further off than the drawing (so they slide by a little
// slower), swaying in the breeze. None in front of the station.
export function paintTrees(pad, t, z, space, { sway = true, fewer = false } = {}) {
  const { ctx, w } = pad;
  if (space >= 1) return;
  const shift = pad.panX * pad.unit * 0.55;
  const step = TREE_EVERY * z;
  const st0 = pad.toScreen({ x: STATION.x0, y: 0 }).x - 40 * z;
  const st1 = pad.toScreen({ x: STATION.x1, y: 0 }).x + 30 * z;
  // Zoomed far out, trees this size would dwarf the coaster: they fade away.
  const alpha = (1 - space) * Math.max(0, Math.min(1, (pad.zoom - 0.12) / 0.2));
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  for (let j = Math.floor((shift - step) / step); j * step - shift < w + step; j++) {
    if (hash(j + 0.3) > (fewer ? 0.35 : 0.6)) continue;
    const kind = Math.floor(hash(j + 0.7) * 3);
    const s = 0.75 + 0.35 * hash(j + 0.9);
    const x = j * step + hash(j) * step * 0.6 - shift;
    const sp = treeSprite(kind, Math.round(z * 20) / 20);
    const tw = sp.w * s;
    if (x + tw / 2 > st0 && x - tw / 2 < st1) continue;
    const base = pad.groundAt(x) + 3 * z;
    ctx.save();
    ctx.translate(x, base);
    if (sway) ctx.rotate(Math.sin(t * 1.1 + j * 2.1) * 0.025 + Math.sin(t * 2.7 + j) * 0.008);
    ctx.drawImage(sp.canvas, -tw / 2, -sp.h * s + sp.foot * s, tw, sp.h * s);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// Three kinds of tree, as sprites standing on (0, 0): a pine, a round leafy tree and a birch.
function treeSprite(kind, z) {
  const W = [46, 64, 42][kind] * z;
  const H = [92, 84, 90][kind] * z;
  const foot = 6 * z; // room for the shadow under it
  return Object.assign(
    sprite(`tree${kind}:${z}`, W, H + foot, (ctx) => {
      const cx = W / 2;
      const by = H;
      ctx.fillStyle = 'rgba(30,70,30,0.18)';
      ctx.beginPath();
      ctx.ellipse(cx, by + 1 * z, W * 0.38, 3.5 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      if (kind === 0) {
        ctx.fillStyle = '#6b4a32';
        ctx.fillRect(cx - 3 * z, by - 14 * z, 6 * z, 14 * z);
        const tiers = 4;
        for (let i = 0; i < tiers; i++) {
          const f = i / tiers;
          const bottom = by - 10 * z - f * (H - 22 * z);
          const half = (W / 2 - 1 * z) * (1 - f * 0.55);
          const top = bottom - (H - 10 * z) * 0.42;
          ctx.fillStyle = '#2f7d46';
          ctx.beginPath();
          ctx.moveTo(cx - half, bottom);
          ctx.quadraticCurveTo(cx, bottom + 4 * z, cx + half, bottom);
          ctx.lineTo(cx, top);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#4aa062';
          ctx.beginPath();
          ctx.moveTo(cx - half, bottom);
          ctx.quadraticCurveTo(cx - half * 0.4, bottom + 2.5 * z, cx - 1 * z, bottom + 1 * z);
          ctx.lineTo(cx, top);
          ctx.closePath();
          ctx.fill();
        }
      } else if (kind === 1) {
        ctx.strokeStyle = '#7a5232';
        ctx.lineCap = 'round';
        ctx.lineWidth = 6 * z;
        ctx.beginPath();
        ctx.moveTo(cx, by);
        ctx.lineTo(cx, by - 36 * z);
        ctx.moveTo(cx, by - 22 * z);
        ctx.lineTo(cx + 9 * z, by - 34 * z);
        ctx.stroke();
        const blobs = [[0, -50, 22], [-15, -42, 15], [15, -40, 16], [-9, -62, 15], [10, -62, 14], [0, -70, 11]];
        const blob = (dx, dy, grow, color) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          for (const [bx, bY, r] of blobs) {
            ctx.moveTo(cx + (bx + dx) * z + (r + grow) * z, by + (bY + dy) * z);
            ctx.arc(cx + (bx + dx) * z, by + (bY + dy) * z, (r + grow) * z, 0, Math.PI * 2);
          }
          ctx.fill();
        };
        blob(0, 3, 0, '#3e9440');
        blob(-1.5, 0, -1.5, '#57b649');
        blob(-4, -4, -7, '#7ccf5c');
      } else {
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(cx - 2.5 * z, by - 52 * z, 5 * z, 52 * z);
        ctx.fillStyle = '#3a3a3a';
        for (const [y, l] of [[-10, 3], [-19, 2], [-30, 3], [-41, 2]]) ctx.fillRect(cx - 2.5 * z + (l === 2 ? 2 * z : 0), by + y * z, l * z, 1.6 * z);
        const leaves = [[0, -66, 13, 22], [-9, -52, 10, 15], [9, -54, 10, 15], [0, -44, 11, 10]];
        for (const [color, dx, dy, grow] of [['#5fae44', 0, 2, 0], ['#8fd06a', -1.5, -1.5, -2.5]]) {
          ctx.fillStyle = color;
          ctx.beginPath();
          for (const [bx, bY, rx, ry] of leaves) {
            ctx.moveTo(cx + (bx + dx) * z + (rx + grow) * z, by + (bY + dy) * z);
            ctx.ellipse(cx + (bx + dx) * z, by + (bY + dy) * z, Math.max(1, rx + grow) * z, Math.max(1, ry + grow) * z, 0, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    }),
    { foot },
  );
}

// ---- Track layer (repainted when the drawing or the view changes) ----

// The steel track seen from the side: support columns first, then a soft shadow, the spine,
// the truss joining it to the rail, the lift chain, and the running rail with a shine on top.
// `pts` are the drawn points, `shape` their side (trackShape), `spots` the columns.
export function paintTrack(pad, pts, shape, spots) {
  const { ctx, k } = pad;
  const n = pts.length;
  if (n < 2) return;
  const size = trackSizes(k);
  const rail = pts.map((p) => pad.toScreen(p));
  // Screen direction to the spine side (y flips between track and screen).
  const dn = (i) => ({ x: -shape.up[i * 2], y: shape.up[i * 2 + 1] });
  const off = (i, d) => {
    const v = dn(i);
    return { x: rail[i].x + v.x * d, y: rail[i].y + v.y * d };
  };
  const spine = rail.map((_, i) => off(i, size.drop));
  const along = new Float32Array(n);
  for (let i = 1; i < n; i++) along[i] = along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const color = (i) => cssColor(pts[i].c, along[i]);

  paintColumns(pad, spots);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Soft shadow, as if the sun were up and to the left.
  ctx.save();
  ctx.translate(3 * k, 7 * k);
  smoothLine(ctx, rail.map((_, i) => off(i, size.drop / 2)));
  ctx.strokeStyle = 'rgba(20,40,60,0.12)';
  ctx.lineWidth = size.drop + size.spine;
  ctx.stroke();
  ctx.restore();

  // Spine: the big tube under the rails, a shade darker, with its own highlight.
  strokeByColor(ctx, spine, (i) => shade(color(i), 0.86), size.spine);

  if (size.detail) {
    // Truss: a plate from rail to spine every meter or so, and a brace back up to the next one.
    const gap = Math.max(10, 0.03 * pad.unit);
    const ties = new Map();
    const add = (c, a, b) => {
      if (!ties.has(c)) ties.set(c, []);
      ties.get(c).push(a, b);
    };
    let carry = gap * 0.5;
    let last = null;
    for (let i = 1; i < n; i++) {
      const seg = Math.hypot(rail[i].x - rail[i - 1].x, rail[i].y - rail[i - 1].y);
      let t = carry;
      while (t <= seg) {
        const f = seg ? t / seg : 0;
        const r = lerp(rail[i - 1], rail[i], f);
        const s = lerp(spine[i - 1], spine[i], f);
        const c = shade(color(i), 0.72);
        add(c, r, s);
        if (last && Math.hypot(last.x - s.x, last.y - s.y) < gap * 2.5) add(c, last, r);
        last = s;
        t += gap;
      }
      carry = t - seg;
    }
    ctx.lineWidth = Math.max(1.2, 2.4 * k);
    ctx.lineCap = 'round';
    for (const [c, segs] of ties) {
      ctx.strokeStyle = c;
      ctx.beginPath();
      for (let j = 0; j < segs.length; j += 2) {
        ctx.moveTo(segs[j].x, segs[j].y);
        ctx.lineTo(segs[j + 1].x, segs[j + 1].y);
      }
      ctx.stroke();
    }
    // Lift chain up the climbs, just under the rail, with the clack-clack teeth beside it.
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < n; i++) {
      if (!shape.lift[i]) {
        on = false;
        continue;
      }
      const p = off(i, size.drop * 0.38);
      if (on) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      on = true;
    }
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = Math.max(1.5, 3 * k);
    ctx.setLineDash([Math.max(1.5, 2.5 * k), Math.max(1, 1.5 * k)]);
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'round';
  }

  // The running rail in his crayon color, a darker edge on the spine side and a shine on top.
  strokeByColor(ctx, rail, color, size.rail);
  if (size.detail) {
    ctx.save();
    smoothLine(ctx, rail.map((_, i) => off(i, size.rail * 0.3)));
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = Math.max(1, size.rail * 0.3);
    ctx.stroke();
    ctx.restore();
  }
  smoothLine(ctx, rail.map((_, i) => off(i, -size.rail * 0.22)));
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(1, size.rail * 0.28);
  ctx.stroke();
  smoothLine(ctx, spine.map((p, i) => {
    const v = dn(i);
    return { x: p.x - v.x * size.spine * 0.25, y: p.y - v.y * size.spine * 0.25 };
  }));
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, size.spine * 0.22);
  ctx.stroke();
}

// Steel columns on concrete footings, with a saddle at the top; tall ones are lattice towers
// with spread legs and cross-bracing.
function paintColumns(pad, spots) {
  const { ctx, k, unit } = pad;
  const cw = Math.max(2.5, 7 * k);
  const footW = cw * 2.6;
  const footH = Math.max(3, 7 * k);
  const shadows = new Path2D();
  const footings = [];
  const posts = new Path2D();
  const shine = new Path2D();
  const saddles = new Path2D();
  const lattice = new Path2D();
  for (const sp of spots) {
    const top = pad.toScreen(sp);
    const gy = pad.groundAt(top.x);
    if (gy - top.y < 6) continue;
    const feet = sp.spread > 0 ? [-1, 1].map((s) => top.x + s * sp.spread * unit) : [top.x];
    for (const fx of feet) {
      shadows.ellipse(fx + 2 * k, gy + 2 * k, footW * 0.7, Math.max(1.5, 3 * k), 0, 0, Math.PI * 2);
      footings.push([fx, pad.groundAt(fx)]);
    }
    if (sp.spread > 0) {
      const legW = cw * 0.75;
      const legs = [-1, 1].map((s) => [{ x: top.x + s * cw * 0.6, y: top.y }, { x: feet[(s + 1) / 2], y: pad.groundAt(feet[(s + 1) / 2]) - footH }]);
      for (const [a, b] of legs) quad(posts, a, b, legW);
      for (const [a, b] of legs) quad(shine, a, b, legW * 0.35, -legW * 0.2);
      // Cross-bracing between the legs, level by level.
      const levels = Math.max(1, Math.round((legs[0][1].y - top.y) / Math.max(24, 60 * k)));
      const at = (leg, f) => lerp(legs[leg][0], legs[leg][1], f);
      for (let l = 0; l <= levels; l++) {
        const f = l / levels;
        const a = at(0, f);
        const b = at(1, f);
        lattice.moveTo(a.x, a.y);
        lattice.lineTo(b.x, b.y);
        if (l < levels) {
          const c = at(0, (l + 1) / levels);
          const d = at(1, (l + 1) / levels);
          lattice.moveTo(a.x, a.y);
          lattice.lineTo(d.x, d.y);
          lattice.moveTo(b.x, b.y);
          lattice.lineTo(c.x, c.y);
        }
      }
    } else {
      posts.rect(top.x - cw / 2, top.y, cw, gy - footH - top.y);
      shine.rect(top.x - cw * 0.32, top.y, cw * 0.28, gy - footH - top.y);
      // A bolted flange partway up tall columns.
      if (gy - top.y > 90 * k) posts.rect(top.x - cw * 0.75, top.y + (gy - top.y) * 0.5, cw * 1.5, Math.max(1.5, 3 * k));
    }
    saddles.moveTo(top.x - cw * 1.2, top.y - 1);
    saddles.lineTo(top.x + cw * 1.2, top.y - 1);
    saddles.lineTo(top.x + cw * 0.6, top.y + Math.max(2, 5 * k));
    saddles.lineTo(top.x - cw * 0.6, top.y + Math.max(2, 5 * k));
    saddles.closePath();
  }
  ctx.fillStyle = 'rgba(30,70,30,0.2)';
  ctx.fill(shadows);
  ctx.strokeStyle = '#b7c1cf';
  ctx.lineWidth = Math.max(1, 2 * k);
  ctx.lineCap = 'round';
  ctx.stroke(lattice);
  ctx.fillStyle = '#b3bdcb';
  ctx.fill(posts);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill(shine);
  ctx.fillStyle = '#7f8896';
  ctx.fill(saddles);
  // Concrete footings with a lit top edge.
  ctx.fillStyle = '#d3cdc1';
  for (const [fx, gy] of footings) ctx.fillRect(fx - footW / 2, gy - footH, footW, footH + 2);
  ctx.fillStyle = '#ece8e0';
  for (const [fx, gy] of footings) ctx.fillRect(fx - footW / 2, gy - footH, footW, Math.max(1, footH * 0.3));
}

// A thick line a-b as a filled quad (optionally nudged sideways), so many can share one fill.
function quad(path, a, b, wdt, nudge = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * wdt * 0.5;
  const ny = (dx / l) * wdt * 0.5;
  const sx = (-dy / l) * nudge;
  const sy = (dx / l) * nudge;
  path.moveTo(a.x - nx + sx, a.y - ny + sy);
  path.lineTo(b.x - nx + sx, b.y - ny + sy);
  path.lineTo(b.x + nx + sx, b.y + ny + sy);
  path.lineTo(a.x + nx + sx, a.y + ny + sy);
  path.closePath();
}

const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });

// A smooth line through points (quadratic curves through the midpoints).
export function smoothLine(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

// The same smooth line, stroked piece by piece in each point's color (same-colored runs batched).
export function strokeByColor(ctx, pts, colorAt, width) {
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let color = null;
  const mid = (i) => ({ x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 });
  for (let i = 1; i < pts.length; i++) {
    const c = colorAt(i);
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
}

// ---- The station ----

function stationBox(pad) {
  const { k } = pad;
  const a = pad.toScreen({ x: STATION.x0, y: STATION.y });
  const b = pad.toScreen({ x: STATION.x1, y: STATION.y });
  return { a, b, len: b.x - a.x, k, eave: a.y - 64 * k, ridge: a.y - 90 * k, ground: pad.groundAt((a.x + b.x) / 2) };
}

// Behind the track: the back wall with bunting under the eaves, and the posts.
export function paintStationBack(pad) {
  const { ctx } = pad;
  const { a, b, k, eave } = stationBox(pad);
  const x0 = a.x - 4 * k;
  const x1 = b.x + 4 * k;
  ctx.fillStyle = '#fff3dc';
  ctx.fillRect(x0, eave, x1 - x0, a.y + 8 * k - eave);
  ctx.strokeStyle = 'rgba(170,120,70,0.16)';
  ctx.lineWidth = Math.max(1, 1.5 * k);
  ctx.beginPath();
  for (let x = x0 + 9 * k; x < x1; x += 9 * k) {
    ctx.moveTo(x, eave);
    ctx.lineTo(x, a.y + 8 * k);
  }
  ctx.stroke();
  const shadow = ctx.createLinearGradient(0, eave, 0, eave + 14 * k);
  shadow.addColorStop(0, 'rgba(120,70,30,0.3)');
  shadow.addColorStop(1, 'rgba(120,70,30,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(x0, eave, x1 - x0, 14 * k);
  // Bunting.
  const flags = 9;
  const colors = ['#e63946', '#ffd23f', '#3a86ff', '#3bb273', '#ff8c42'];
  ctx.strokeStyle = 'rgba(90,60,40,0.6)';
  ctx.lineWidth = Math.max(1, 1 * k);
  const sag = (f) => eave + 6 * k + Math.sin(f * Math.PI) * 7 * k;
  ctx.beginPath();
  ctx.moveTo(x0, sag(0));
  for (let i = 1; i <= 20; i++) ctx.lineTo(x0 + ((x1 - x0) * i) / 20, sag(i / 20));
  ctx.stroke();
  for (let i = 0; i < flags; i++) {
    const f0 = (i + 0.15) / flags;
    const f1 = (i + 0.85) / flags;
    const fx0 = x0 + (x1 - x0) * f0;
    const fx1 = x0 + (x1 - x0) * f1;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(fx0, sag(f0));
    ctx.lineTo(fx1, sag(f1));
    ctx.lineTo((fx0 + fx1) / 2, (sag(f0) + sag(f1)) / 2 + 9 * k);
    ctx.closePath();
    ctx.fill();
  }
  // Posts.
  for (const x of [a.x, (a.x + b.x) / 2, b.x]) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 3 * k, eave, 6 * k, a.y + 8 * k - eave);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + 0.5 * k, eave, 2.5 * k, a.y + 8 * k - eave);
  }
}

// In front of the track: the platform's deck and stone base, steps up the side, the roof and a
// sign with a little coaster on it.
export function paintStationFront(pad) {
  const { ctx } = pad;
  const { a, b, k, eave, ridge, ground } = stationBox(pad);
  const deck = a.y + 6 * k;
  // Stone base.
  const bx0 = a.x - 6 * k;
  const bx1 = b.x + 6 * k;
  ctx.fillStyle = '#eadcc0';
  ctx.fillRect(bx0, deck, bx1 - bx0, ground - deck + 2);
  ctx.strokeStyle = 'rgba(140,110,70,0.3)';
  ctx.lineWidth = Math.max(1, 1.2 * k);
  ctx.beginPath();
  const course = 8 * k;
  for (let row = 0, y = deck + 7 * k; y < ground; row++, y += course) {
    ctx.moveTo(bx0, y);
    ctx.lineTo(bx1, y);
    for (let x = bx0 + (row % 2 ? 10 * k : 0) + 20 * k; x < bx1; x += 20 * k) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, Math.min(ground, y + course));
    }
  }
  ctx.stroke();
  const fade = ctx.createLinearGradient(0, deck, 0, deck + 14 * k);
  fade.addColorStop(0, 'rgba(90,60,30,0.28)');
  fade.addColorStop(1, 'rgba(90,60,30,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(bx0, deck, bx1 - bx0, 14 * k);
  // Deck edge board.
  ctx.fillStyle = '#b5764a';
  ctx.fillRect(a.x - 8 * k, deck, b.x - a.x + 16 * k, 7 * k);
  ctx.fillStyle = '#d99c6c';
  ctx.fillRect(a.x - 8 * k, deck, b.x - a.x + 16 * k, Math.max(1, 1.8 * k));

  // Steps up the left side, with a handrail.
  const sx0 = a.x - 26 * k;
  const sx1 = a.x - 6 * k;
  const steps = 4;
  ctx.fillStyle = '#e0cfae';
  ctx.beginPath();
  ctx.moveTo(sx0, ground + 2);
  for (let i = 0; i < steps; i++) {
    const y = ground - ((ground - deck) * (i + 1)) / steps;
    const x = sx0 + ((sx1 - sx0) * i) / steps;
    ctx.lineTo(x, y);
    ctx.lineTo(x + (sx1 - sx0) / steps, y);
  }
  ctx.lineTo(sx1, ground + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f5ead6';
  ctx.lineWidth = Math.max(1, 1.5 * k);
  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    const y = ground - ((ground - deck) * (i + 1)) / steps;
    const x = sx0 + ((sx1 - sx0) * i) / steps;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (sx1 - sx0) / steps, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, 2 * k);
  ctx.beginPath();
  ctx.moveTo(sx0 + 2 * k, ground - 16 * k);
  ctx.lineTo(sx1, deck - 14 * k);
  ctx.moveTo(sx0 + 2 * k, ground - 16 * k);
  ctx.lineTo(sx0 + 2 * k, ground);
  ctx.moveTo(sx1, deck - 14 * k);
  ctx.lineTo(sx1, deck);
  ctx.stroke();

  // Roof: shingles in rows, a white fascia board along the eaves and a ridge cap.
  const ex0 = a.x - 14 * k;
  const ex1 = b.x + 14 * k;
  const rx0 = a.x + 12 * k;
  const rx1 = b.x - 12 * k;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ex0, eave);
  ctx.lineTo(rx0, ridge);
  ctx.lineTo(rx1, ridge);
  ctx.lineTo(ex1, eave);
  ctx.closePath();
  const roof = ctx.createLinearGradient(0, ridge, 0, eave);
  roof.addColorStop(0, '#ffa463');
  roof.addColorStop(1, '#f2792f');
  ctx.fillStyle = roof;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(160,60,10,0.32)';
  ctx.lineWidth = Math.max(1, 1.4 * k);
  const rowH = 7 * k;
  const r = 3.6 * k;
  ctx.beginPath();
  for (let row = 0, y = ridge + rowH; y < eave + rowH; row++, y += rowH) {
    for (let x = ex0 + (row % 2 ? r : 0); x < ex1 + r; x += r * 2) {
      ctx.moveTo(x + r, y - r * 0.4);
      ctx.arc(x, y - r * 0.4, r, 0, Math.PI);
    }
  }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ex0 - 2 * k, eave - 1 * k, ex1 - ex0 + 4 * k, 5 * k);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(ex0 - 2 * k, eave + 2.5 * k, ex1 - ex0 + 4 * k, 1.5 * k);
  ctx.fillStyle = '#d9622a';
  ctx.fillRect(rx0 - 2 * k, ridge - 2 * k, rx1 - rx0 + 4 * k, 4 * k);

  // The sign on top: a little coaster with a loop, and a star.
  const mx = (a.x + b.x) / 2;
  const sw = 50 * k;
  const sh = 22 * k;
  const sy = ridge - 8 * k - sh;
  ctx.strokeStyle = '#8a5a3c';
  ctx.lineWidth = Math.max(1, 2.5 * k);
  ctx.beginPath();
  ctx.moveTo(mx - sw * 0.3, ridge);
  ctx.lineTo(mx - sw * 0.3, sy + sh);
  ctx.moveTo(mx + sw * 0.3, ridge);
  ctx.lineTo(mx + sw * 0.3, sy + sh);
  ctx.stroke();
  roundRect(ctx, mx - sw / 2, sy, sw, sh, 6 * k);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = Math.max(1, 2.5 * k);
  ctx.stroke();
  const ix = mx - sw / 2;
  const iy = sy + sh - 5 * k;
  ctx.strokeStyle = '#3a86ff';
  ctx.lineWidth = Math.max(1, 2.4 * k);
  ctx.beginPath();
  ctx.moveTo(ix + 5 * k, iy);
  ctx.quadraticCurveTo(ix + 14 * k, sy - 2 * k, ix + 22 * k, iy);
  ctx.lineTo(ix + 30 * k, iy);
  ctx.arc(ix + 30 * k, iy - 5 * k, 5 * k, Math.PI / 2, Math.PI / 2 - Math.PI * 2, true);
  ctx.lineTo(ix + sw - 13 * k, iy);
  ctx.stroke();
  star(ctx, ix + sw - 8 * k, sy + 7 * k, 4.5 * k, '#ffd23f');
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// ---- Live station: waving flags, and the train with its riders ----

const CARS = ['#3bceac', '#ffd23f', '#ee4266']; // left to right; the front car (on the right) is red
const LOOKS = {
  kid: { body: '#3a86ff', head: '#f2c6a0', paw: '#f2c6a0', hair: '#6b3e26' },
  girl: { body: '#ff70a6', head: '#e0ac69', paw: '#e0ac69', hair: '#3b2416' },
  pal: { body: '#06d6a0', head: '#8d5524', paw: '#8d5524', hair: '#1f1a17' },
  bear: { body: '#a0522d', head: '#a0522d', paw: '#7a3e1d', snout: '#deb887' },
  bunny: { body: '#f5f5f5', head: '#f5f5f5', paw: '#ffffff', nose: '#ff8fab' },
  panda: { body: '#222222', head: '#f8f8f8', paw: '#222222' },
  frog: { body: '#5cc94f', head: '#5cc94f', paw: '#4bb33f' },
  dino: { body: '#9b5de5', head: '#9b5de5', paw: '#7b3fc5', snout: '#c8a2f5' },
};
// Who sits where, back seat then front seat, from the back car to the front car.
const FRIENDS = ['bear', 'bunny', 'panda', 'frog', 'dino'];
const pick = FRIENDS.slice().sort(() => Math.random() - 0.5);
const SEATS = [[pick[2], 'pal'], ['girl', pick[1]], [pick[0], 'kid']];

export function paintStationLive(pad, t) {
  const { ctx } = pad;
  const { a, b, k, ridge, len } = stationBox(pad);
  // Pennants on the roof ends.
  for (const [x, color, ph] of [[a.x + 10 * k, '#ffd23f', 0], [b.x - 10 * k, '#3bceac', 1.7]]) {
    const top = ridge - 30 * k;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, 2 * k);
    ctx.beginPath();
    ctx.moveTo(x, ridge);
    ctx.lineTo(x, top);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, top);
    const L = 17 * k;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      ctx.lineTo(x + L * f, top + 4.5 * k * f + Math.sin(t * 6 + ph - f * 3) * 2 * k * f);
    }
    for (let i = steps; i >= 0; i--) {
      const f = i / steps;
      ctx.lineTo(x + L * f, top + 9 * k - 4.5 * k * f + Math.sin(t * 6 + ph - f * 3) * 2 * k * f);
    }
    ctx.closePath();
    ctx.fill();
  }

  // The train: three cars on wheel trucks, coupled together.
  const carW = (len - 18 * k) / 3;
  const railTop = a.y - 3.5 * k;
  const wr = Math.max(1.5, 3.6 * k);
  const bodyB = railTop - wr * 2 + 1 * k;
  const bodyH = 14 * k;
  const bodyT = bodyB - bodyH;
  CARS.forEach((color, c) => {
    const x0 = a.x + 6 * k + c * (carW + 3 * k);
    const front = c === CARS.length - 1;
    const back = c === 0;
    // Riders (behind the car's side), each sat in front of a seat back.
    SEATS[c].forEach((who, s) => {
      const sx = x0 + carW * (s ? 0.7 : 0.32);
      ctx.fillStyle = '#2b2d42';
      roundRect(ctx, sx - 8 * k, bodyT - 14 * k, 4 * k, 16 * k, 2 * k);
      ctx.fill();
      rider(ctx, who, sx, bodyT, k, t, c * 2 + s);
    });
    // Wheels on their truck.
    ctx.fillStyle = '#3d3d45';
    ctx.fillRect(x0 + carW * 0.1, bodyB - 1 * k, carW * 0.8, 3 * k);
    for (const f of [0.22, 0.78]) {
      const wx = x0 + carW * f;
      const wy = railTop - wr;
      ctx.fillStyle = '#ff7b39';
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d3d9e0';
      ctx.beginPath();
      ctx.arc(wx, wy, wr * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a505a';
      ctx.beginPath();
      ctx.arc(wx, wy, wr * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    // Coupler bar to the next car.
    if (!front) {
      ctx.strokeStyle = '#3d3d45';
      ctx.lineWidth = Math.max(1, 2.2 * k);
      ctx.beginPath();
      ctx.moveTo(x0 + carW - 2 * k, bodyB - 2 * k);
      ctx.lineTo(x0 + carW + 5 * k, bodyB - 2 * k);
      ctx.stroke();
    }
    // Body: glossy fiberglass, a sloped nose on the front car.
    ctx.beginPath();
    const r = 4 * k;
    ctx.moveTo(x0 + r, bodyB);
    ctx.arcTo(x0, bodyB, x0, bodyT, r);
    ctx.arcTo(x0, bodyT, x0 + carW, bodyT, r);
    if (front) {
      ctx.lineTo(x0 + carW * 0.74, bodyT);
      ctx.quadraticCurveTo(x0 + carW + 1 * k, bodyT + bodyH * 0.1, x0 + carW + 2 * k, bodyT + bodyH * 0.65);
      ctx.arcTo(x0 + carW + 2 * k, bodyB, x0, bodyB, r);
    } else {
      ctx.arcTo(x0 + carW, bodyT, x0 + carW, bodyB, r);
      ctx.arcTo(x0 + carW, bodyB, x0, bodyB, r);
    }
    ctx.closePath();
    const paint = ctx.createLinearGradient(0, bodyT, 0, bodyB);
    paint.addColorStop(0, shade(color, 1.35));
    paint.addColorStop(0.45, color);
    paint.addColorStop(1, shade(color, 0.72));
    ctx.fillStyle = paint;
    ctx.fill();
    // Racing stripe, number plate, chrome trim and a shine.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + 1 * k, bodyT + bodyH * 0.58, carW - (front ? 0 : 2 * k), Math.max(1, 2 * k));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x0 + carW * 0.5, bodyT + bodyH * 0.32, 3.4 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#26262e';
    ctx.font = `bold ${Math.max(4, 5 * k)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(CARS.length - c), x0 + carW * 0.5, bodyT + bodyH * 0.34);
    ctx.strokeStyle = '#eef2f6';
    ctx.lineWidth = Math.max(1, 1.4 * k);
    ctx.beginPath();
    ctx.moveTo(x0 + 3 * k, bodyT + 0.5 * k);
    ctx.lineTo(x0 + carW * (front ? 0.72 : 1) - 3 * k, bodyT + 0.5 * k);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, 1.6 * k);
    ctx.beginPath();
    ctx.moveTo(x0 + carW * 0.12, bodyT + 3 * k);
    ctx.lineTo(x0 + carW * 0.4, bodyT + 3 * k);
    ctx.stroke();
    // Lap bars, in front of each rider.
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = Math.max(1, 2 * k);
    for (const f of [0.32, 0.7]) {
      const lx = x0 + carW * f;
      ctx.beginPath();
      ctx.moveTo(lx + 6 * k, bodyT + 1 * k);
      ctx.quadraticCurveTo(lx + 6 * k, bodyT - 6 * k, lx + 2.5 * k, bodyT - 6 * k);
      ctx.stroke();
    }
    if (front) {
      const hx = x0 + carW - 1 * k;
      const hy = bodyT + bodyH * 0.62;
      const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 9 * k);
      glow.addColorStop(0, 'rgba(255,240,170,0.8)');
      glow.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(hx - 9 * k, hy - 9 * k, 18 * k, 18 * k);
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      ctx.arc(hx, hy, 2.4 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    if (back) {
      ctx.fillStyle = '#ff4d5e';
      ctx.beginPath();
      ctx.arc(x0 + 1.2 * k, bodyT + bodyH * 0.55, 1.8 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// A rider seen from the side, facing right, sat with their middle at (x, seat). They bob along,
// and now and then throw their hands up.
function rider(ctx, who, x, seat, k, t, n) {
  const look = LOOKS[who];
  const y = seat + Math.sin(t * 2.4 + n * 1.3) * 0.8 * k;
  // Hands up: one rider at a time takes a turn, smoothly.
  const turn = (t / 2.2) % 6;
  const up = Math.floor(turn) === n ? Math.sin(Math.min(1, (turn % 1) * 1.4) * Math.PI) : 0;
  const hr = 5.6 * k;
  const hx = x + 0.5 * k;
  const hy = y - 12 * k - up * 1.5 * k;
  // Torso.
  ctx.fillStyle = look.body;
  roundRect(ctx, x - 4.5 * k, y - 8 * k, 9 * k, 10 * k, 3 * k);
  ctx.fill();
  // Arms: resting on the lap bar, or up in the air.
  ctx.strokeStyle = look.body;
  ctx.lineWidth = Math.max(1, 2.6 * k);
  ctx.lineCap = 'round';
  for (const [sx, reach] of [[-1.5, 1], [1.5, 1.25]]) {
    const ex = x + sx * k + (4.5 - up * 2) * k * reach;
    const ey = y - 4 * k - up * 17 * k * reach;
    ctx.beginPath();
    ctx.moveTo(x + sx * k, y - 6 * k);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = look.paw;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.7 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  head(ctx, who, look, hx, hy, hr);
}

function head(ctx, who, look, x, y, r) {
  const dot = (dx, dy, rr, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
    ctx.fill();
  };
  const oval = (dx, dy, rx, ry, color, rot = 0) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + dx * r, y + dy * r, rx * r, ry * r, rot, 0, Math.PI * 2);
    ctx.fill();
  };
  // Ears and things behind the head.
  if (who === 'bear') {
    dot(-0.45, -0.8, 0.33, look.head);
    dot(-0.45, -0.8, 0.17, look.snout);
  } else if (who === 'bunny') {
    oval(-0.35, -1.45, 0.24, 0.72, look.head, -0.25);
    oval(-0.35, -1.4, 0.1, 0.5, '#ffc2d1', -0.25);
    oval(0.05, -1.5, 0.24, 0.72, look.head, 0.1);
  } else if (who === 'panda') {
    dot(-0.5, -0.78, 0.32, '#222222');
  } else if (who === 'dino') {
    ctx.fillStyle = look.snout;
    ctx.beginPath();
    for (const [a, s] of [[-2.3, 0.4], [-1.85, 0.45], [-1.4, 0.4]]) {
      const bx = x + Math.cos(a) * r * 0.95;
      const by = y + Math.sin(a) * r * 0.95;
      ctx.moveTo(bx - Math.sin(a) * r * 0.22, by + Math.cos(a) * r * 0.22);
      ctx.lineTo(bx + Math.cos(a) * r * s, by + Math.sin(a) * r * s);
      ctx.lineTo(bx + Math.sin(a) * r * 0.22, by - Math.cos(a) * r * 0.22);
    }
    ctx.fill();
  } else if (who === 'girl') {
    dot(-0.95, 0.15, 0.38, look.hair);
    dot(-0.85, -0.2, 0.2, '#ffd23f');
  }
  dot(0, 0, 1, look.head);
  // Hair and faces.
  if (who === 'kid' || who === 'girl') {
    ctx.fillStyle = look.hair;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.02, Math.PI * 0.92, Math.PI * 1.9);
    ctx.quadraticCurveTo(x + r * 0.2, y - r * 0.45, x - r * 0.75, y + r * 0.15);
    ctx.fill();
  } else if (who === 'pal') {
    for (const [dx, dy] of [[-0.75, -0.35], [-0.45, -0.75], [0, -0.92], [0.45, -0.75], [-0.85, 0.1]]) dot(dx, dy, 0.32, look.hair);
  } else if (who === 'bear' || who === 'dino') {
    oval(0.72, 0.2, 0.42, 0.32, look.snout);
    dot(1.05, 0.08, 0.13, '#2b2b2b');
  } else if (who === 'bunny') {
    dot(0.96, 0.12, 0.12, look.nose);
  } else if (who === 'panda') {
    oval(0.38, -0.12, 0.26, 0.32, '#222222', 0.4);
    dot(0.98, 0.15, 0.12, '#222222');
  } else if (who === 'frog') {
    dot(0.25, -0.85, 0.38, look.head);
    dot(0.3, -0.88, 0.26, '#ffffff');
    dot(0.38, -0.88, 0.13, '#111111');
    ctx.strokeStyle = '#2f7a2a';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(x + r * 0.35, y + r * 0.05, r * 0.55, 0.2, 1.3);
    ctx.stroke();
  }
  if (who !== 'frog') {
    dot(0.48, -0.12, 0.14, who === 'panda' ? '#ffffff' : '#1d1d1d');
    if (who === 'panda') dot(0.5, -0.12, 0.08, '#1d1d1d');
    ctx.strokeStyle = '#7a3b2a';
    ctx.lineWidth = Math.max(1, r * 0.11);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x + r * 0.5, y + r * 0.22, r * 0.28, 0.3, 1.5);
    ctx.stroke();
    dot(0.2, 0.3, 0.16, 'rgba(255,120,140,0.35)');
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
