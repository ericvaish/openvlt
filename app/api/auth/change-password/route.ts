import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/auth/crypto"
import { AuthError, getSession, requireAuth } from "@/lib/auth/middleware"

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Both current and new passwords are required" },
        { status: 400 }
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 }
      )
    }

    const db = getDb()
    const row = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(user.id) as { password_hash: string } | undefined

    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const valid = await verifyPassword(currentPassword, row.password_hash)
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 403 }
      )
    }

    const newHash = await hashPassword(newPassword)
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      newHash,
      user.id
    )

    // Invalidate all other sessions for this user (keep current session)
    const session = await getSession()
    if (session) {
      db.prepare(
        "DELETE FROM sessions WHERE user_id = ? AND token != ?"
      ).run(user.id, session.token)
    } else {
      // Shouldn't happen since requireAuth passed, but be safe
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id)
    }

    return NextResponse.json({ success: true })
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
