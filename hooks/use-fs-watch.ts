"use client"

import { useEffect, useRef } from "react"

/**
 * Connects to the SSE endpoint that watches for filesystem changes.
 * Dispatches "openvlt:tree-refresh" when the vault changes on disk.
 */
export function useFsWatch() {
  const eventSourceRef = useRef<EventSource | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let closed = false

    function connect() {
      if (closed) return

      const es = new EventSource("/api/watch")
      eventSourceRef.current = es

      es.onmessage = (event) => {
        if (event.data === "changed") {
          window.dispatchEvent(new Event("openvlt:tree-refresh"))
          window.dispatchEvent(new Event("openvlt:vault-changed"))
        }
      }

      es.onerror = () => {
        es.close()
        eventSourceRef.current = null
        // Retry after 5s on error
        if (!closed) {
          retryTimeoutRef.current = setTimeout(connect, 5000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])
}
