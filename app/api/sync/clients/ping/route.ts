import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getDb } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { clientId, instanceName } = body

    if (!clientId || !instanceName) {
      return NextResponse.json(
        { error: "clientId and instanceName are required" },
        { status: 400 }
      )
    }

    const db = getDb()
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO sync_clients (id, instance_name, username, registered_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         instance_name = excluded.instance_name,
         last_seen_at = excluded.last_seen_at`
    ).run(clientId, instanceName, user.username, now, now)

    return NextResponse.json({ ok: true, serverTime: now })
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
