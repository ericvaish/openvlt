export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    })

    // Listen for updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing
      if (!newWorker) return

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "activated" &&
          navigator.serviceWorker.controller
        ) {
          // New version available; the SW already called skipWaiting + claim
          // so the next navigation will use the new SW automatically
        }
      })
    })

    // Listen for messages from the SW (e.g., background sync trigger)
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "replay-queue") {
        window.dispatchEvent(new CustomEvent("openvlt:replay-queue"))
      }
    })

    // Register for background sync if supported
    if ("sync" in registration) {
      try {
        await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register("openvlt-queue-flush")
      } catch {
        // Background sync not supported (e.g., iOS Safari) — that's fine
      }
    }
  } catch {
    // Service worker registration failed — app still works, just no offline support
  }
}
