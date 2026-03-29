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

    // If this is a server, count connected clients from heartbeats
    let clientCount = 0
    if (role === "server") {
      const db = getDb()
      const threshold = new Date(Date.now() - 2 * 60 * 1000).toISOString()
      const row = db
        .prepare(
          "SELECT COUNT(DISTINCT device_id) as count FROM device_heartbeats WHERE last_seen_at > ?"
        )
        .get(threshold) as { count: number }
      clientCount = row.count
    }

    return NextResponse.json({
      role,
      serverUrl,
      username,
      connectedAt,
      lastSyncAt,
      clientCount,
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
