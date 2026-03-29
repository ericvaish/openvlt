import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getConfig, setConfig } from "@/lib/admin/config"
import { getDb } from "@/lib/db"

export async function GET() {
  try {
    await requireAuth()

    const role = getConfig("sync_role") || "standalone"
    const serverUrl = getConfig("sync_server_url")
    const username = getConfig("sync_server_username")
    const connectedAt = getConfig("sync_connected_at")
    const lastSyncAt = getConfig("sync_last_sync_at")

    // Get device list: from local DB if server, from remote if client
    let devices: {
      deviceId: string
      displayName: string
      lastSeenAt: string
      browser: string | null
      os: string | null
      isOnline: boolean
    }[] = []
    let serverLive: boolean | null = null

    if (role === "server") {
      const db = getDb()
      const rows = db
        .prepare(
          "SELECT device_id, display_name, last_seen_at, browser, os FROM device_heartbeats ORDER BY last_seen_at DESC"
        )
        .all() as {
        device_id: string
        display_name: string
        last_seen_at: string
        browser: string | null
        os: string | null
      }[]
      const now = Date.now()
      for (const r of rows) {
        devices.push({
          deviceId: r.device_id,
          displayName: r.display_name,
          lastSeenAt: r.last_seen_at,
          browser: r.browser,
          os: r.os,
          isOnline: now - new Date(r.last_seen_at).getTime() < 2 * 60 * 1000,
        })
      }
      serverLive = true
    } else if (role === "client" && serverUrl) {
      // Fetch device list from the remote server (server-side, no CORS)
      const token = getConfig("sync_server_token")
      if (token) {
        try {
          const res = await fetch(
            `${serverUrl}/api/sync/server-connection`,
            {
              headers: { Cookie: `openvlt_session=${token}` },
              signal: AbortSignal.timeout(5000),
            }
          )
          if (res.ok) {
            const data = await res.json()
            devices = data.devices || []
            serverLive = true
          } else {
            serverLive = false
          }
        } catch {
          serverLive = false
        }
      }
    }

    return NextResponse.json({
      role,
      serverUrl,
      username,
      connectedAt,
      lastSyncAt,
      clientCount: devices.filter((d) => d.isOnline).length,
      devices,
      serverLive,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth()
    const body = await request.json()
    const { serverUrl, username, password } = body

    if (!serverUrl || !username || !password) {
      return NextResponse.json(
        { error: "Server URL, username, and password are required" },
        { status: 400 }
      )
    }

    // Normalize URL
    const normalizedUrl = serverUrl.replace(/\/+$/, "")

    // Verify credentials against the remote server
    let token: string
    try {
      const loginRes = await fetch(`${normalizedUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      if (!loginRes.ok) {
        const data = await loginRes.json().catch(() => ({}))
        return NextResponse.json(
          {
            error:
              loginRes.status === 401
                ? "Invalid username or password"
                : data.error || "Failed to connect to server",
          },
          { status: 400 }
        )
      }

      // Extract session token from Set-Cookie header
      const setCookie = loginRes.headers.get("set-cookie") || ""
      const tokenMatch = setCookie.match(/openvlt_session=([^;]+)/)
      if (!tokenMatch) {
        return NextResponse.json(
          { error: "Server responded but did not return a session" },
          { status: 400 }
        )
      }
      token = tokenMatch[1]

      // Notify the remote server that it is now a server
      try {
        await fetch(`${normalizedUrl}/api/sync/server-connection/promote`, {
          method: "POST",
          headers: { Cookie: `openvlt_session=${token}` },
        })
      } catch {
        // Non-fatal: server promotion is best-effort
      }
    } catch {
      return NextResponse.json(
        { error: "Could not reach the server. Check the URL and try again." },
        { status: 400 }
      )
    }

    // Store connection config
    const now = new Date().toISOString()
    setConfig("sync_role", "client")
    setConfig("sync_server_url", normalizedUrl)
    setConfig("sync_server_token", token)
    setConfig("sync_server_username", username)
    setConfig("sync_connected_at", now)

    return NextResponse.json({
      role: "client",
      serverUrl: normalizedUrl,
      username,
      connectedAt: now,
      lastSyncAt: null,
      clientCount: 0,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    await requireAuth()

    const db = getDb()
    const keys = [
      "sync_server_url",
      "sync_server_token",
      "sync_server_username",
      "sync_connected_at",
      "sync_last_sync_at",
      "sync_last_sync_seq",
    ]
    for (const key of keys) {
      db.prepare("DELETE FROM instance_config WHERE key = ?").run(key)
    }
    setConfig("sync_role", "standalone")

    return NextResponse.json({
      role: "standalone",
      serverUrl: null,
      username: null,
      connectedAt: null,
      lastSyncAt: null,
      clientCount: 0,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
