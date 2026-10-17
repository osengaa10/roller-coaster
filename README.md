# Coaster Doodle

A roller coaster game for little kids (built for a 4-year-old on an iPad).

1. **Draw** the coaster with your finger: hills, big drops, loop-de-loops. The track always starts at the little station. Tap a crayon at the top to change the track color (the striped one is rainbow).
2. Tap the big green **▶** button.
3. **Ride it** in first person with an animal friend (a different one each time), then ride again or draw a new one.

**Hold the line against the top edge** and the view zooms out while the track keeps climbing; keep going and the sky turns into outer space (stars, the moon, planets, the curve of the Earth). Coming back down, the view zooms back in so loops and hills near the ground are normal size. **Hold it against the right or left side** and the drawing scrolls along that way (left stops once the station is back in view). With fingers lifted, slide two fingers to scroll.

Things that happen on their own during the ride:
- **Stars** float along the track. Fly through them to collect them, then count them at the end.
- **Tunnels** appear where the track skims along the ground.
- A **splash pond** appears at the bottom of the biggest drop.
- **Fireworks** go off at the finish.

**Tap anywhere** during the ride to throw your hands up. Rides start watching the train from outside; tap the **seat** button to ride in the front seat (and the **eye** button to go back outside).

No reading needed, no menus, and nothing can go wrong: the train never gets stuck, lifting your finger and drawing again just keeps adding track, and undo can even bring back a cleared drawing.

| Button | Does |
| --- | --- |
| ▶ (green, wiggles when ready) | Ride it |
| ↩ (blue) | Undo the last line |
| 🗑 (orange) | Start over (undo brings it back) |
| Crayons (top-left) | Pick the track color |
| 🏠 (purple, during ride) | Back to drawing |
| seat / 👁 (blue, during ride) | Ride in the front seat / watch from outside |
| ⟳ / ✏️ (after ride) | Ride again / draw again |

## Play on an iPad or iPhone

Open the GitHub Pages URL in Safari, then **Share → Add to Home Screen**. It launches full-screen like an app (no Safari toolbars eating the screen) and keeps working offline.

On an iPhone, hold it sideways; a little turning-phone picture asks for that if it's upright. **Pinch with two fingers** on the drawing to zoom out for a longer, taller coaster (and back in), and slide two fingers to move along it. A saved coaster opens zoomed to fit.

## Run locally

No build step, it's plain static files.

```sh
npm start            # python3 -m http.server 8888
npm test             # track math tests (node --test)
```

To try it on the iPad from your laptop, open `http://<laptop-ip>:8888` on the same Wi-Fi.
Add `?fast=4` to the URL to speed up the ride while testing.

## How it works

- `js/draw.js`: the side-view drawing canvas (pointer events, iOS gesture blocking).
- `js/track.js`: pure math that turns the finger path into a smooth 3D track. Loops tilt slightly sideways so they don't hit themselves. Long right-to-left stretches get barrel-rolled back upright. The speed profile uses gravity on drops, plus a chain lift so it never stalls. It also picks the spots for stars, tunnels and the pond.
- `js/ride.js`: runs the ride, both cameras, and the events along the track.
- `js/scenery.js`: the 3D world (painted track, tunnels, pond, stars, trees).
- `js/characters.js`: the train cars, him, and the animal friends.
- `js/effects.js`: particles for sparkles, splashes and fireworks.
- `js/sound.js`: every sound is synthesized with Web Audio (no audio files).
- `vendor/three.module.min.js`: Three.js r169, vendored so it works offline.
