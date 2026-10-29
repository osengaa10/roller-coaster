# Coaster Doodle

A roller coaster (and water slide) game for little kids (built for a 4-year-old on an iPad).

The app opens on two big pictures: tap the **coaster** or the **water slide**. Each one remembers its own drawing.

## Roller coaster

1. **Draw** the coaster with your finger: hills, big drops, loop-de-loops. The track always starts at the little station. Tap a crayon at the top to change the track color (the striped one is rainbow).
   **Draw a row of little curly-cues** (like a spring, ℓℓℓ) and they turn into a **corkscrew** when you lift your finger (boing!): the train twists upside down once per curl. One curl on its own stays a little loop, and bigger curls stay loop-de-loops.
   **Drag a sticker** from the tray at the bottom onto the track: the 🚀 **rocket** launches the train with a countdown and flames (the arrows show how far the boosters go), and the **ramp** makes the train **jump** off a kicker, fly over a gap and land back on the track (the dotted arc shows the flight). Drag a sticker along the track to move it, or off the track to get rid of it.
2. Tap the big green **▶** button.
3. **Ride it** in first person with an animal friend (a different one each time), then ride again or draw a new one.

**Take the line up toward the top edge** and the view zooms out (gently at first, faster the closer the finger gets, stopping when it turns back down) while the track keeps climbing; keep going and the sky turns into outer space (stars, the moon, planets, the curve of the Earth). Coming back down, the view zooms back in so loops and hills near the ground are normal size. **Take it toward the right or left side** and the drawing scrolls along that way, the same way (left stops once the station is back in view). With fingers lifted, slide two fingers to scroll.

Things that happen on their own during the ride:
- **Stars** float along the track. Fly through them to collect them, then count them at the end.
- **Tunnels** appear where the track skims along the ground.
- A **splash pond** appears at the bottom of the biggest drop.
- **Fireworks** go off at the finish.

**Tap anywhere** during the ride to throw your hands up. Rides start watching the train from outside; tap the **seat** button to ride in the front seat (and the **eye** button to go back outside).

## Water slide

Same idea, at a tropical water park on an island: sand, palm trees, beach umbrellas, kiddie pools with mushroom fountains, the sea with sailboats, gulls, and a smoking volcano on the horizon.

1. **Draw** the slide. It starts at the top of a tower with stairs and a striped canopy.
2. **Draw a row of curly-cues** and it becomes a **twisty corkscrew tube**. The stickers work here too: the rocket is a **water cannon** and the ramp a **ski-jump** that lands with a splash.
3. **Draw a tight circle** with your finger and it turns into a **toilet bowl**: when you lift your finger the circle becomes a funnel (with a swirly sound). On the ride you spin round and round the bowl, faster and faster, then get *flushed* down the drain and shoot out underneath. Go round twice for a bigger bowl. Big circles stay loops, inside a see-through closed tube.
4. **Draw a quick zigzag** and it becomes **rapids**: a wide rocky white-water channel where the float bounces and spins over the waves, splashing.
5. Ride it on a two-seat ring float with your animal friend sitting in front (you wear swim goggles).

Things that happen on their own:
- **Rubber ducks** bob along the slide. Scoop them up (quack!) and count them at the end.
- **Water jets** push the float up any uphill parts.
- Steep or upside-down parts become **closed tubes**.
- Low stretches go through a **waterfall** into a rocky cave with glowing crystals.
- **Fountains** arch water over the slide at the bottom of the biggest drop.
- Every slide ends with a **splash into the pool**, then a **fountain show**.
- Water splashes leave drops running down the screen.

No reading needed, no menus, and nothing can go wrong: the train never gets stuck, lifting your finger and drawing again just keeps adding track, and undo can even bring back a cleared drawing.

| Button | Does |
| --- | --- |
| Coaster / slide pictures | Pick which one to draw |
| 🏠 (purple, bottom-left of drawing) | Back to the pictures |
| ▶ (green, wiggles when ready) | Ride it |
| ↩ (blue) | Undo the last line |
| 🗑 (orange) | Start over (undo brings it back) |
| Crayons (top-left) | Pick the track color |
| 🚀 / ramp stickers (bottom middle) | Drag onto the track for a rocket launch / a jump |
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
npm test             # track and slide math tests (node --test)
```

To try it on the iPad from your laptop, open `http://<laptop-ip>:8888` on the same Wi-Fi.
Add `?fast=4` to the URL to speed up the ride while testing, and `?q=high`, `?q=medium` or `?q=low` to force a graphics quality tier.

Graphics quality picks itself: rides start at the best tier (real sun shadows, glossy clear-coat paint, full grass) and step down one notch whenever frames stay slow for a couple of seconds, remembering that for next time, so an older iPad stays smooth.

## How it works

- `js/draw.js`: the side-view drawing canvas (pointer events, iOS gesture blocking, the view), painted in stacked layers: the scenery and the track are only repainted when they change, and what moves (clouds, swaying trees, the waiting train's riders, running water) is painted every frame on top. `js/draw-park.js` paints the coaster's park (mountains, woods, the steel track with its spine, truss, lift chain and columns, the station and train) and `js/draw-slide.js` the beach. `js/draw-art.js` holds the shared pieces, including the pure math for the side view: which side the spine hangs on (matching the ride's loops and rolls), where the chain runs and where columns can stand without poking through other track.
- `js/track.js`: pure math that turns the finger path into a smooth 3D track. Loops tilt slightly sideways so they don't hit themselves. Long right-to-left stretches get barrel-rolled back upright. The speed profile uses gravity on drops, plus a chain lift so it never stalls. It also picks the spots for stars, tunnels and the pond.
- `js/slide.js`: water slide math: finding tight circles, building the 3D toilet bowl, and the run-out into the pool.
- `js/corkscrew.js`: finding rows of curls (both games), the neat spring the drawing screen shows instead, and the 3D corkscrew spliced in where they were.
- `js/stickers.js`: the stickers' track math: where the rocket boosters run and how fast they push, and where a ramp jump fits, how far it goes and the arc over the gap.
- `js/ride.js`: runs the ride, both cameras, and the events along the track.
- `js/scenery.js`: the 3D world (painted track, tunnels, pond, stars, trees).
- `js/slide-world.js`: the water slide's 3D pieces (trough, tubes, bowls, tower, pool, caves, ducks); `js/tropical.js` the island around it.
- `js/characters.js`: the train cars, him, and the animal friends.
- `js/effects.js`: particles for sparkles, splashes, mist and fireworks.
- `js/quality.js`: the graphics quality tiers and the frame-time watcher that steps them down.
- `js/textures.js`: procedural textures (concrete, planks, grating, stone, pool tiles, caustics, ripples, glow), drawn on canvases and built ahead of the first ride.
- `js/water.js`: the one water material (drifting ripples reflecting the sky) used by every pool, pond, the sea and the slide.
- `js/sound.js`: every sound is synthesized with Web Audio (no audio files).
- `vendor/three.module.min.js`: Three.js r169, vendored so it works offline.
