"use client"

import * as React from "react"

const HEARTBEAT_INTERVAL = 60_000 // 60 seconds
const DEVICE_ID_KEY = "openvlt:device-id"

export interface DeviceInfo {
  deviceId: string
  displayName: string
  lastSeenAt: string
  browser: string | null
  os: string | null
  isOnline: boolean
  isThisDevice: boolean
}

function getDeviceId(): string {
  if (typeof window === "undefined") return ""
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

function parseUserAgent(): { browser: string; os: string; displayName: string } {
  if (typeof navigator === "undefined")
    return { browser: "Unknown", os: "Unknown", displayName: "Unknown device" }

  const ua = navigator.userAgent
  let browser = "Browser"
  let os = "Unknown"

  // OS detection
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS"
  else if (/Android/.test(ua)) os = "Android"
  else if (/Mac OS X/.test(ua)) os = "macOS"
  else if (/Windows/.test(ua)) os = "Windows"
  else if (/Linux/.test(ua)) os = "Linux"

  // Browser detection
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome"
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari"
  else if (/Firefox\//.test(ua)) browser = "Firefox"
  else if (/Edg\//.test(ua)) browser = "Edge"

  return {
    browser,
    os,
    displayName: `${browser} on ${os}`,
  }
}

export function useDeviceHeartbeat() {
  const [devices, setDevices] = React.useState<DeviceInfo[]>([])

  React.useEffect(() => {
    const deviceId = getDeviceId()
    if (!deviceId) return

    const { browser, os, displayName } = parseUserAgent()

    async function sendHeartbeat() {
      // Only send when tab is visible
      if (document.visibilityState === "hidden") return

      try {
        const res = await fetch("/api/sync/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId, displayName, browser, os }),
        })
        if (res.ok) {
          const data = await res.json()
          setDevices(data)
        }
      } catch {
        // Offline: don't update devices list
      }
    }

    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)

    // Re-send when tab becomes visible again
    function handleVisibility() {
      if (document.visibilityState === "visible") sendHeartbeat()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [])

  return devices
}
