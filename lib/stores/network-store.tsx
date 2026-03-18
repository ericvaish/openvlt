"use client"

import * as React from "react"
import { getQueueLength } from "@/lib/offline/queue"
import { replayQueue, getIsReplaying } from "@/lib/offline/replayer"
import { toast } from "sonner"

interface NetworkState {
  isOnline: boolean
  pendingMutations: number
  syncStatus: "idle" | "syncing" | "error" | "synced"
}

interface NetworkContextValue extends NetworkState {
  refreshQueueCount: () => Promise<void>
}

const NetworkContext = React.createContext<NetworkContextValue>({
  isOnline: true,
  pendingMutations: 0,
  syncStatus: "idle",
  refreshQueueCount: async () => {},
})

export function useNetwork() {
  return React.useContext(NetworkContext)
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<NetworkState>({
    isOnline: true,
    pendingMutations: 0,
    syncStatus: "idle",
  })

  // Sync initial online state after hydration to avoid SSR mismatch
  React.useEffect(() => {
    setState((s) => (s.isOnline !== navigator.onLine ? { ...s, isOnline: navigator.onLine } : s))
  }, [])

  const wasOfflineRef = React.useRef(false)
  const replayTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track online/offline changes
  React.useEffect(() => {
    function handleOnline() {
      setState((s) => ({ ...s, isOnline: true }))
    }
    function handleOffline() {
      setState((s) => ({ ...s, isOnline: false, syncStatus: "idle" }))
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  // When coming back online, replay the queue after a debounce
  React.useEffect(() => {
    if (!state.isOnline) {
      wasOfflineRef.current = true
      return
    }

    if (!wasOfflineRef.current) return
    wasOfflineRef.current = false

    // Debounce: wait 2s to avoid rapid toggling
    if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current)
    replayTimeoutRef.current = setTimeout(async () => {
      const queueLen = await getQueueLength()
      if (queueLen === 0) return

      setState((s) => ({ ...s, syncStatus: "syncing" }))

      try {
        const result = await replayQueue((progress) => {
          setState((s) => ({
            ...s,
            pendingMutations: Math.max(
              0,
              s.pendingMutations - (progress.succeeded || 0)
            ),
          }))
        })

        const remaining = await getQueueLength()
        setState((s) => ({
          ...s,
          pendingMutations: remaining,
          syncStatus: result.failed > 0 ? "error" : "synced",
        }))

        if (result.succeeded > 0) {
          toast.success(
            `Synced ${result.succeeded} offline change${result.succeeded > 1 ? "s" : ""}`
          )
        }
        if (result.conflicts > 0) {
          toast.warning(
            `${result.conflicts} conflict${result.conflicts > 1 ? "s" : ""} found. Please review.`
          )
        }

        // Reset to idle after showing "synced" briefly
        setTimeout(() => {
          setState((s) =>
            s.syncStatus === "synced" ? { ...s, syncStatus: "idle" } : s
          )
        }, 3000)
      } catch {
        setState((s) => ({ ...s, syncStatus: "error" }))
      }
    }, 2000)

    return () => {
      if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current)
    }
  }, [state.isOnline])

  // Poll queue length periodically
  React.useEffect(() => {
    async function updateCount() {
      try {
        const count = await getQueueLength()
        setState((s) => (s.pendingMutations !== count ? { ...s, pendingMutations: count } : s))
      } catch {}
    }

    updateCount()
    const interval = setInterval(updateCount, 5000)
    return () => clearInterval(interval)
  }, [])

  const refreshQueueCount = React.useCallback(async () => {
    try {
      const count = await getQueueLength()
      setState((s) => ({ ...s, pendingMutations: count }))
    } catch {}
  }, [])

  const value = React.useMemo(
    () => ({ ...state, refreshQueueCount }),
    [state, refreshQueueCount]
  )

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  )
}
