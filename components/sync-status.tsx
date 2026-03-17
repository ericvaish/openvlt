"use client"

import * as React from "react"
import {
  CloudIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  WifiOffIcon,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type SyncState = "idle" | "syncing" | "synced" | "error" | "offline"

export function SyncStatus() {
  const [syncState, setSyncState] = React.useState<SyncState>("idle")
  const [lastSync, setLastSync] = React.useState<string | null>(null)
  const [pairingCount, setPairingCount] = React.useState(0)
  const [backupEnabled, setBackupEnabled] = React.useState(false)

  React.useEffect(() => {
    async function loadStatus() {
      try {
        // Check sync pairings
        const syncRes = await fetch("/api/sync/settings")
        if (syncRes.ok) {
          const data = await syncRes.json()
          const activePairings = data.pairings?.filter(
            (p: { isActive: boolean }) => p.isActive
          ) || []
          setPairingCount(activePairings.length)

          if (activePairings.length > 0) {
            const latest = activePairings
              .filter((p: { lastSyncAt: string | null }) => p.lastSyncAt)
              .sort(
                (a: { lastSyncAt: string }, b: { lastSyncAt: string }) =>
                  new Date(b.lastSyncAt).getTime() -
                  new Date(a.lastSyncAt).getTime()
              )[0]
            if (latest?.lastSyncAt) {
              setLastSync(latest.lastSyncAt)
              setSyncState("synced")
            }
          }
        }

        // Check backup config
        const backupRes = await fetch("/api/backup/config")
        if (backupRes.ok) {
          const config = await backupRes.json()
          if (config?.enabled) {
            setBackupEnabled(true)
          }
        }
      } catch {
        // Not connected or API not available
      }
    }

    loadStatus()

    // Refresh status every 30 seconds
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // Don't render if no sync features are configured
  if (pairingCount === 0 && !backupEnabled) return null

  const icon = {
    idle: <CloudIcon className="size-3.5 text-muted-foreground" />,
    syncing: (
      <RefreshCwIcon className="size-3.5 animate-spin text-blue-500" />
    ),
    synced: <CheckCircleIcon className="size-3.5 text-green-600" />,
    error: <AlertCircleIcon className="size-3.5 text-destructive" />,
    offline: <WifiOffIcon className="size-3.5 text-muted-foreground" />,
  }[syncState]

  const statusText = {
    idle: "Sync idle",
    syncing: "Syncing...",
    synced: lastSync
      ? `Synced ${new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Synced",
    error: "Sync error",
    offline: "Offline",
  }[syncState]

  const details: string[] = []
  if (pairingCount > 0) {
    details.push(
      `${pairingCount} peer${pairingCount > 1 ? "s" : ""} connected`
    )
  }
  if (backupEnabled) {
    details.push("Cloud backup active")
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1">
            {icon}
            <span className="text-xs text-muted-foreground">
              {statusText}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-1">
            {details.map((d, i) => (
              <p key={i} className="text-xs">
                {d}
              </p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
