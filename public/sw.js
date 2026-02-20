const CACHE_NAME = "timewin-v1";
const STATIC_ASSETS = ["/planning", "/login", "/manifest.json", "/icon-192.png", "/icon-512.png"];

// Install: cache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network first, fallback to cache (for navigation)
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET, API calls, and auth endpoints
  if (request.method !== "GET") return;
  if (request.url.includes("/api/")) return;
  if (request.url.includes("/_next/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
