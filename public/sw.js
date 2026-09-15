const VERSION = "v4";
const SHELL_CACHE = `parkspot-shell-${VERSION}`;
const STATIC_CACHE = `parkspot-static-${VERSION}`;
const API_CACHE = `parkspot-api-${VERSION}`;

const OFFLINE_MSG =
  "You're offline. Reconnect to the network and try again.";

const APP_SHELL = [
  "/",
  "/login",
  "/register",
  "/admin/gate",
  "/admin/operations",
];

async function installCrawl(cache) {
  const assetPaths = new Set();
  for (const page of APP_SHELL) {
    try {
      const res = await fetch(page);
      if (!res.ok) continue;
      const html = await res.text();
      const refRe = /(?:src|href)=["']([^"']+)["']/g;
      let m;
      while ((m = refRe.exec(html))) {
        const ref = m[1];
        if (
          ref.startsWith("/_next/static/") ||
          ref.startsWith("/icons/") ||
          ref === "/manifest.webmanifest"
        ) {
          assetPaths.add(ref);
        }
      }
    } catch {
      // Skip pages that fail during install; the app shell still works.
    }
  }
  await Promise.all(
    [...assetPaths].map(async (path) => {
      try {
        const url = new URL(path, self.location.origin);
        const req = new Request(url.href);
        const res = await fetch(req);
        if (res.ok) {
          await cache.put(req, res.clone());
        }
      } catch {
        // Ignore individual asset failures.
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      try {
        await shellCache.addAll(APP_SHELL);
      } catch {
        // If one shell page fails to fetch, keep whatever cached fine.
      }
      const staticCache = await caches.open(STATIC_CACHE);
      await installCrawl(staticCache);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("parkspot-shell-") ||
                key.startsWith("parkspot-static-") ||
                key.startsWith("parkspot-api-")
            )
            .filter((key) => !key.endsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function offlineShell(request) {
  return (await caches.match(request)) || (await caches.match("/"));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // API calls: only GET responses are cached (network-first). Never cache
  // mutations - those always need a live server.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: OFFLINE_MSG }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        })
    );
    return;
  }

  // External resources (map tiles, etc.) are not cached.
  if (url.origin !== self.location.origin) return;

  // App shell: network-first, fall back to cache, then to home page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => offlineShell(request))
    );
    return;
  }

  // Versioned static assets and icons: cache-first with background refresh.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        // Background refresh so a cached copy does not go stale while online.
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(STATIC_CACHE)
                .then((cache) => cache.put(request, copy));
            }
          })
          .catch(() => {});
        if (cached) return cached;
        return fetch(request).catch(() => new Response("", { status: 404 }));
      })
    );
    return;
  }

  // Pass everything else through untouched.
  return;
});