# Coaster Doodle

A roller coaster game for little kids (built for a 4-year-old on an iPad).

1. **Draw** the coaster with your finger: hills, big drops, loop-de-loops. The track always starts at the little station.
2. Tap the big green **▶** button.
3. **Ride it** in first person, then ride again or draw a new one.

No reading needed, no menus, and nothing can go wrong: the train never gets stuck, lifting your finger and drawing again just keeps adding track, and undo can even bring back a cleared drawing.

| Button | Does |
| --- | --- |
| ▶ (green, wiggles when ready) | Ride it |
| ↩ (blue) | Undo the last line |
| 🗑 (orange) | Start over (undo brings it back) |
| 🏠 (purple, during ride) | Back to drawing |
| ⟳ / ✏️ (after ride) | Ride again / draw again |

## Play on the iPad

Open the GitHub Pages URL in Safari, then **Share → Add to Home Screen**. It launches full-screen like an app and keeps working offline.

## Run locally

No build step, it's plain static files.

```sh
npm start            # python3 -m http.server 8000
npm test             # track math tests (node --test)
```

To try it on the iPad from your laptop, open `http://<laptop-ip>:8000` on the same Wi-Fi.
Add `?fast=4` to the URL to speed up the ride while testing.

## How it works

- `js/draw.js`: the side-view drawing canvas (pointer events, iOS gesture blocking).
- `js/track.js`: pure math that turns the finger path into a smooth 3D track. Loops tilt slightly sideways so they don't hit themselves. Long right-to-left stretches get barrel-rolled back upright. The speed profile uses gravity on drops, plus a chain lift so it never stalls.
- `js/ride.js`: the Three.js scene and first-person camera.
- `js/sound.js`: every sound is synthesized with Web Audio (no audio files).
- `vendor/three.module.min.js`: Three.js r169, vendored so it works offline.
