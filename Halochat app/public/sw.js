const CACHE = "halo-static-v8";

const STATIC = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/css/variables.css",
  "/css/global.css",
  "/css/auth.css",
  "/css/app.css",
  "/css/components.css",
  "/js/theme.js",
  "/js/api.js",
  "/js/auth.js",
  "/js/dataApi.js",
  "/js/realtime.js",
  "/js/notifications.js",
  "/js/ui.js",
  "/js/app.js",
];

self.addEventListener("install", (event) => {
  console.log("HALO SW V8 INSTALLING");

  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(STATIC))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  console.log("HALO SW V8 ACTIVATED");

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never interfere with non-GET requests.
  if (request.method !== "GET") return;

  // Never touch requests to another origin.
  if (url.origin !== self.location.origin) return;

  // Never cache authenticated APIs or Socket.IO.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) {
    return;
  }

  // Pages must always come from the network.
  // This prevents stale authenticated app pages.
  if (request.mode === "navigate" || url.pathname === "/app.html") {
    event.respondWith(
      fetch(request, {
        cache: "no-store",
      }),
    );

    return;
  }

  const isCode = url.pathname.startsWith("/js/") || url.pathname.startsWith("/css/");

  // JS/CSS: network first.
  if (isCode) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request, {
            cache: "no-cache",
          });

          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE);
            await cache.put(request, copy);
          }

          return response;
        } catch (error) {
          const cached = await caches.match(request);

          if (cached) return cached;

          throw error;
        }
      })(),
    );

    return;
  }

  // Static assets: cache first, network fallback.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      if (cached) return cached;

      const response = await fetch(request);

      if (response.ok) {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        await cache.put(request, copy);
      }

      return response;
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const conversationId = event.notification.data?.conversationId;

  const target = conversationId ? `/app.html#conversation=${encodeURIComponent(conversationId)}` : "/app.html";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(async (windows) => {
        if (windows.length) {
          const client = windows[0];

          await client.focus();

          if ("navigate" in client) {
            await client.navigate(target);
          }

          return;
        }

        return clients.openWindow(target);
      }),
  );
});
