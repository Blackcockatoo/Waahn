const CACHE = "black-omen-webapp-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./styles.css",
  "./app.js",
  "./admin.js",
  "./config.js",
  "./data.js",
  "./manifest.webmanifest",
  "./assets/black-omen-poster.png"
  ,"./assets/4f57c614-84bd-4bdb-9222-400ed92e3f2f.png"
  ,"./assets/ChatGPT Image Jun 18, 2026, 06_34_08 PM.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(() => null));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  })));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
