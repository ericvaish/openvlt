import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getConfig, setConfig } from "@/lib/admin/config"
import { getDb } from "@/lib/db"
import { v4 as uuid } from "uuid"
import os from "os"

export async function GET() {
  try {
    await requireAuth()

    const role = getConfig("sync_role") || "standalone"
    const serverUrl = getConfig("sync_server_url")
    const username = getConfig("sync_server_username")
    const connectedAt = getConfig("sync_connected_at")
    const lastSyncAt = getConfig("sync_last_sync_at")

    // Get sync clients: from local DB if server, from remote if client
    let clients: {
      id: string
      instanceName: string
      username: string
      lastSeenAt: string
      isOnline: boolean
    }[] = []
    let sLive: boolean | null = null

    if (role === "server") {
      const db = getDb()
      const rows = db
        .prepare(
          "SELECT id, instance_name, username, last_seen_at FROM sync_clients ORDER BY last_seen_at DESC"
        )
        .all() as {
        id: string
        instance_name: string
        username: string
        last_seen_at: string
      }[]
      const now = Date.now()
      for (const r of rows) {
        clients.push({
          id: r.id,
          instanceName: r.instance_name,
          username: r.username,
          lastSeenAt: r.last_seen_at,
          isOnline:
            now - new Date(r.last_seen_at).getTime() < 2 * 60 * 1000,
        })
      }
      sLive = true
    } else if (role === "client" && serverUrl) {
      const token = getConfig("sync_server_token")
      const clientId = getConfig("sync_client_id")
      const instanceName =
        getConfig("instance_name") || os.hostname() || "Unknown"

      if (token) {
        try {
          // Ping the server (acts as heartbeat)
          if (clientId) {
            await fetch(`${serverUrl}/api/sync/clients/ping`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: `openvlt_session=${token}`,
              },
              body: JSON.stringify({ clientId, instanceName }),
              signal: AbortSignal.timeout(5000),
            })
          }

          // Fetch the client list from the server
          const res = await fetch(
            `${serverUrl}/api/sync/server-connection`,
            {
              headers: { Cookie: `openvlt_session=${token}` },
              signal: AbortSignal.timeout(5000),
            }
          )
          if (res.ok) {
            const data = await res.json()
            clients = data.clients || []
            sLive = true
          } else {
            sLive = false
          }
        } catch {
          sLive = false
        }
      }
    }

    return NextResponse.json({
      role,
      serverUrl,
      username,
      connectedAt,
      lastSyncAt,
      clientCount: clients.filter((c) => c.isOnline).length,
      clients,
      serverLive: sLive,
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

    // Generate or retrieve a stable client ID
    let clientId = getConfig("sync_client_id")
    if (!clientId) {
      clientId = uuid()
      setConfig("sync_client_id", clientId)
    }
    const instanceName =
      getConfig("instance_name") || os.hostname() || "Unknown"

    // Register this client on the server
    try {
      await fetch(`${normalizedUrl}/api/sync/clients/ping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `openvlt_session=${token}`,
        },
        body: JSON.stringify({ clientId, instanceName }),
      })
    } catch {
      // Non-fatal: registration is best-effort
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
