import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getDb } from "@/lib/db"

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { deviceId, displayName, browser, os } = body

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json(
        { error: "Device ID is required" },
        { status: 400 }
      )
    }

    const db = getDb()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO device_heartbeats (device_id, user_id, display_name, last_seen_at, browser, os)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         display_name = excluded.display_name,
         browser = excluded.browser,
         os = excluded.os`
    ).run(
      deviceId,
      user.id,
      displayName || "Unknown device",
      now,
      browser || null,
      os || null
    )

    // Return all devices for this user
    const devices = db
      .prepare(
        "SELECT device_id, display_name, last_seen_at, browser, os FROM device_heartbeats WHERE user_id = ? ORDER BY last_seen_at DESC"
      )
      .all(user.id) as {
      device_id: string
      display_name: string
      last_seen_at: string
      browser: string | null
      os: string | null
    }[]

    const now_ts = Date.now()
    const result = devices.map((d) => ({
      deviceId: d.device_id,
      displayName: d.display_name,
      lastSeenAt: d.last_seen_at,
      browser: d.browser,
      os: d.os,
      isOnline:
        now_ts - new Date(d.last_seen_at).getTime() < ONLINE_THRESHOLD_MS,
      isThisDevice: d.device_id === deviceId,
    }))

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
