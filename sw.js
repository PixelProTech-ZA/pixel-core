/* Pixel Core service worker: static shell only. */
const CACHE_NAME = "pixel-core-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./render.js",
  "./app.js",
  "./pwa.js",
  "./offline.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("pixel-core-shell-") &&
                           key !== CACHE_NAME)
            .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls or non-shell paths.
  const scopeUrl = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scopeUrl.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("./index.html")) ||
               (await cache.match("./offline.html"));
      })
    );
    return;
  }

  const allowed = SHELL_FILES.some(path =>
    new URL(path, self.registration.scope).href === url.href
  );
  if (!allowed) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
