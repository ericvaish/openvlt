/// <reference lib="webworker" />

const CACHE_VERSION = "v3"
const SHELL_CACHE = `openvlt-shell-${CACHE_VERSION}`
const STATIC_CACHE = `openvlt-static-${CACHE_VERSION}`
const API_CACHE = `openvlt-api-${CACHE_VERSION}`
const ATTACHMENT_CACHE = `openvlt-attachments-${CACHE_VERSION}`

const ALL_CACHES = [SHELL_CACHE, STATIC_CACHE, API_CACHE, ATTACHMENT_CACHE]

// Critical static assets to precache for offline app shell
const PRECACHE_ASSETS = [
  "/logo.svg",
  "/manifest.json",
]

// SSE and streaming endpoints that should never be cached
const EXCLUDED_PATTERNS = [
  "/api/watch",
  "/api/sync/stream",
  "/api/sync/push",
  "/api/ai/chat",
]

// ── Install ──

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: clean up old caches ──

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("openvlt-") && !ALL_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ── Fetch handler ──

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // Skip caching entirely in development (Turbopack HMR)
  if (url.port === "3000" && url.hostname === "localhost") return

  // Skip SSE/streaming endpoints
  if (EXCLUDED_PATTERNS.some((p) => url.pathname.startsWith(p))) return

  // Skip non-GET requests (mutations handled client-side by the queue)
  if (event.request.method !== "GET") return

  // Static assets (JS/CSS/fonts/images): cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.match(/\.(js|css|woff2?|ttf|ico|svg|png|jpg|webp)$/)
  ) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE))
    return
  }

  // Attachment downloads: cache-first
  if (url.pathname.startsWith("/api/attachments/") && url.pathname.includes("/download")) {
    event.respondWith(cacheFirst(event.request, ATTACHMENT_CACHE))
    return
  }

  // API GET requests: network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(event.request, API_CACHE))
    return
  }

  // HTML navigation requests (app shell): network-first with offline fallback
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(handleNavigation(event.request))
    return
  }
})

// ── Background Sync ──

self.addEventListener("sync", (event) => {
  if (event.tag === "openvlt-queue-flush") {
    event.waitUntil(notifyClientsToReplay())
  }
})

async function notifyClientsToReplay() {
  const clients = await self.clients.matchAll({ type: "window" })
  for (const client of clients) {
    client.postMessage({ type: "replay-queue" })
  }
}

// ── Caching Strategies ──

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response("Offline", { status: 503 })
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response(
      JSON.stringify({ error: "You are offline" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}

/**
 * Handle navigation requests (HTML pages).
 *
 * Strategy: network-first. On success, cache the response so it's available
 * offline. On failure (offline), serve from cache. If nothing is cached,
 * try to serve ANY cached HTML page as a fallback — the client-side router
 * will handle routing to the correct view once the JS loads.
 *
 * This is critical for iOS Safari PWA where the OS kills the webview when
 * backgrounded and needs a cached HTML response to relaunch the app.
 */
async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE)

  try {
    const response = await fetch(request)
    // Cache successful HTML responses (not redirects — those contain stale Location headers)
    if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Offline: try exact URL match first
    const cached = await cache.match(request)
    if (cached) return cached

    // Fallback: serve any cached navigation response
    // The client-side JS will boot and the router will handle the correct route
    const keys = await cache.keys()
    for (const key of keys) {
      const resp = await cache.match(key)
      if (resp && resp.headers.get("content-type")?.includes("text/html")) {
        return resp
      }
    }

    // Last resort: minimal offline page
    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>openvlt</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0c0a09; color: #e7e5e4;
           display: flex; align-items: center; justify-content: center; height: 100vh;
           margin: 0; text-align: center; }
    .box { max-width: 320px; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: #a8a29e; }
    button { margin-top: 1rem; padding: 0.5rem 1.5rem; border-radius: 0.5rem;
             border: 1px solid #292524; background: #1c1917; color: #e7e5e4;
             font-size: 0.875rem; cursor: pointer; }
  </style>
</head>
<body>
  <div class="box">
    <h1>You are offline</h1>
    <p>openvlt needs an internet connection to load for the first time. Please reconnect and try again.</p>
    <button onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    )
  }
}
