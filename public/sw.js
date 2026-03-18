/// <reference lib="webworker" />

const CACHE_VERSION = "v1"
const SHELL_CACHE = `openvlt-shell-${CACHE_VERSION}`
const STATIC_CACHE = `openvlt-static-${CACHE_VERSION}`
const API_CACHE = `openvlt-api-${CACHE_VERSION}`
const ATTACHMENT_CACHE = `openvlt-attachments-${CACHE_VERSION}`

const ALL_CACHES = [SHELL_CACHE, STATIC_CACHE, API_CACHE, ATTACHMENT_CACHE]

// App shell routes to precache
const SHELL_ROUTES = ["/notes", "/login", "/register"]

// SSE and streaming endpoints that should never be cached
const EXCLUDED_PATTERNS = ["/api/watch", "/api/sync/stream", "/api/sync/push"]

// ── Install ──

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ROUTES))
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

  // Static assets: cache-first
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

  // App shell (HTML pages): network-first with cache fallback
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(event.request, SHELL_CACHE))
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
