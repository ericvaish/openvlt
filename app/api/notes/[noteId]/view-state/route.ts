import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { getDb } from "@/lib/db"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { user } = await requireAuthWithVault()
    const { noteId } = await params
    const db = getDb()

    const row = db
      .prepare(
        "SELECT scroll_x, scroll_y, zoom FROM note_view_state WHERE user_id = ? AND note_id = ?"
      )
      .get(user.id, noteId) as
      | { scroll_x: number; scroll_y: number; zoom: number }
      | undefined

    if (!row) {
      return NextResponse.json(null)
    }

    return NextResponse.json({
      scrollX: row.scroll_x,
      scrollY: row.scroll_y,
      zoom: row.zoom,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { user } = await requireAuthWithVault()
    const { noteId } = await params
    const body = await request.json()

    const scrollX = typeof body.scrollX === "number" ? body.scrollX : 0
    const scrollY = typeof body.scrollY === "number" ? body.scrollY : 0
    const zoom = typeof body.zoom === "number" ? body.zoom : 1

    const db = getDb()
    db.prepare(
      `INSERT INTO note_view_state (user_id, note_id, scroll_x, scroll_y, zoom, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, note_id) DO UPDATE SET
         scroll_x = excluded.scroll_x,
         scroll_y = excluded.scroll_y,
         zoom = excluded.zoom,
         updated_at = datetime('now')`
    ).run(user.id, noteId, scrollX, scrollY, zoom)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
