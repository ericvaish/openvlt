"use client"

import * as React from "react"
import { WifiOffIcon, XIcon } from "lucide-react"
import { useNetwork } from "@/lib/stores/network-store"

export function OfflineBanner() {
  const { isOnline, pendingMutations } = useNetwork()
  const [visible, setVisible] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    if (isOnline) {
      setVisible(false)
      setDismissed(false)
      return
    }

    // Show after 3 seconds of being offline
    const timer = setTimeout(() => setVisible(true), 3000)
    return () => clearTimeout(timer)
  }, [isOnline])

  if (!visible || dismissed || isOnline) return null

  return (
    <div className="flex items-center gap-2 border-b border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400">
      <WifiOffIcon className="size-4 shrink-0" />
      <span className="flex-1">
        You are offline.
        {pendingMutations > 0
          ? ` ${pendingMutations} change${pendingMutations > 1 ? "s" : ""} will sync when you reconnect.`
          : " Changes will sync when you reconnect."}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 hover:bg-yellow-500/20"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}
