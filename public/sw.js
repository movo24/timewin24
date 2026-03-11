const CACHE_NAME = "timewin-v2";
const STATIC_ASSETS = [
  "/planning",
  "/login",
  "/offline.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// ─── Install: cache shell ─────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ───────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

// ─── Fetch: network first, fallback to cache / offline ────

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET, API calls, and Next.js internals
  if (request.method !== "GET") return;
  if (request.url.includes("/api/")) return;
  if (request.url.includes("/_next/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) =>
            cached ||
            (request.mode === "navigate"
              ? caches.match("/offline.html")
              : new Response("Offline", { status: 503 }))
        )
      )
  );
});

// ─── Push Notifications ───────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "TimeWin", body: event.data.text() };
  }

  const { title, body, icon, badge, url, tag, priority } = data;

  const options = {
    body: body || "",
    icon: icon || "/icon-192.png",
    badge: badge || "/icon-192.png",
    tag: tag || "timewin-" + Date.now(),
    data: { url: url || "/planning" },
    vibrate: [200, 100, 200],
    requireInteraction: priority === "CRITICAL",
    actions:
      priority === "CRITICAL"
        ? [{ action: "view", title: "Voir" }]
        : undefined,
  };

  event.waitUntil(self.registration.showNotification(title || "TimeWin", options));
});

// ─── Notification Click ───────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/planning";
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if one is open on our origin
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            return client.focus().then((c) => c.navigate(fullUrl));
          }
        }
        // Open new window
        return clients.openWindow(fullUrl);
      })
  );

  // Report click to backend (best-effort, no auth needed)
  const tag = event.notification.tag;
  if (tag) {
    fetch("/api/notifications/clicked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: tag }),
    }).catch(() => {});
  }
});
