// Network first so updates show up right away; fall back to the cache when offline.
const CACHE = 'coaster-doodle-v4';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/draw.js',
  'js/ride.js',
  'js/scenery.js',
  'js/characters.js',
  'js/effects.js',
  'js/track.js',
  'js/sound.js',
  'js/storage.js',
  'vendor/three.module.min.js',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
