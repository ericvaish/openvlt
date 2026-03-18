"use client"

import * as React from "react"
import {
  CloudIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  WifiOffIcon,
  MonitorSmartphoneIcon,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useNetwork } from "@/lib/stores/network-store"
import { useDeviceHeartbeat } from "@/hooks/use-device-heartbeat"
import { DeviceStatusPopover } from "@/components/device-status-popover"

export function SyncStatus() {
  const { isOnline, pendingMutations, syncStatus } = useNetwork()
  const devices = useDeviceHeartbeat()
  const [lastSync, setLastSync] = React.useState<string | null>(null)
  const [pairingCount, setPairingCount] = React.useState(0)
  const [backupEnabled, setBackupEnabled] = React.useState(false)

  React.useEffect(() => {
    if (!isOnline) return

    async function loadStatus() {
      try {
        const syncRes = await fetch("/api/sync/settings")
        if (syncRes.ok) {
          const data = await syncRes.json()
          const activePairings =
            data.pairings?.filter(
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
            }
          }
        }

        const backupRes = await fetch("/api/backup/config")
        if (backupRes.ok) {
          const config = await backupRes.json()
          if (config?.enabled) setBackupEnabled(true)
        }
      } catch {}
    }

    loadStatus()
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [isOnline])

  // Determine display state
  const displayState = !isOnline
    ? "offline"
    : syncStatus === "syncing"
      ? "syncing"
      : syncStatus === "error"
        ? "error"
        : syncStatus === "synced"
          ? "synced"
          : pairingCount > 0 || backupEnabled
            ? "synced"
            : "idle"

  const icon = {
    idle: <CloudIcon className="size-3.5 text-muted-foreground" />,
    syncing: (
      <RefreshCwIcon className="size-3.5 animate-spin text-blue-500" />
    ),
    synced: <CheckCircleIcon className="size-3.5 text-green-600" />,
    error: <AlertCircleIcon className="size-3.5 text-destructive" />,
    offline: <WifiOffIcon className="size-3.5 text-yellow-500" />,
  }[displayState]

  const statusText = {
    idle: "Sync idle",
    syncing: "Syncing...",
    synced: lastSync
      ? `Synced ${new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Synced",
    error: "Sync error",
    offline: pendingMutations > 0
      ? `Offline (${pendingMutations} pending)`
      : "Offline",
  }[displayState]

  const details: string[] = []
  if (!isOnline && pendingMutations > 0) {
    details.push(
      `${pendingMutations} change${pendingMutations > 1 ? "s" : ""} waiting to sync`
    )
  }
  if (pairingCount > 0) {
    details.push(
      `${pairingCount} peer${pairingCount > 1 ? "s" : ""} connected`
    )
  }
  if (backupEnabled) {
    details.push("Cloud backup active")
  }
  const onlineDevices = devices.filter((d) => d.isOnline && !d.isThisDevice)
  if (onlineDevices.length > 0) {
    details.push(
      `${onlineDevices.length} other device${onlineDevices.length > 1 ? "s" : ""} online`
    )
  }

  return (
    <div className="flex items-center gap-1">
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
              {details.length > 0 ? (
                details.map((d, i) => (
                  <p key={i} className="text-xs">
                    {d}
                  </p>
                ))
              ) : (
                <p className="text-xs">No sync configured</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {devices.length > 1 && (
        <DeviceStatusPopover devices={devices}>
          <button className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <MonitorSmartphoneIcon className="size-3.5" />
            <span>{devices.filter((d) => d.isOnline).length}</span>
          </button>
        </DeviceStatusPopover>
      )}
    </div>
  )
}
