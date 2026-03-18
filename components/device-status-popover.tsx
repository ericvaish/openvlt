"use client"

import * as React from "react"
import {
  MonitorIcon,
  SmartphoneIcon,
  TabletIcon,
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { DeviceInfo } from "@/hooks/use-device-heartbeat"

function getDeviceIcon(os: string | null) {
  if (!os) return MonitorIcon
  if (os === "iOS" || os === "Android") return SmartphoneIcon
  if (os === "iPadOS") return TabletIcon
  return MonitorIcon
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function DeviceStatusPopover({
  devices,
  children,
}: {
  devices: DeviceInfo[]
  children: React.ReactNode
}) {
  if (devices.length === 0) return <>{children}</>

  const onlineCount = devices.filter((d) => d.isOnline).length

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-64 p-0"
      >
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Devices</p>
          <p className="text-xs text-muted-foreground">
            {onlineCount} of {devices.length} online
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {devices.map((device) => {
            const Icon = getDeviceIcon(device.os)
            return (
              <div
                key={device.deviceId}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {device.displayName}
                    {device.isThisDevice && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (this device)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {device.isOnline ? (
                      <span className="text-green-600 dark:text-green-400">
                        Online
                      </span>
                    ) : (
                      <>Last seen {timeAgo(device.lastSeenAt)}</>
                    )}
                  </p>
                </div>
                <div
                  className={`size-2 shrink-0 rounded-full ${
                    device.isOnline ? "bg-green-500" : "bg-muted-foreground/30"
                  }`}
                />
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
