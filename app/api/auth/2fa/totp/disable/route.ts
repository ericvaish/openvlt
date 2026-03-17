import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { verifyPassword } from "@/lib/auth/crypto"
import { disableTotp } from "@/lib/auth/totp"
import { getDb } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { password } = body

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required to disable 2FA" },
        { status: 400 }
      )
    }

    // Verify current password
    const db = getDb()
    const userRow = db
      .prepare("SELECT password_hash FROM users WHERE id = ?")
      .get(user.id) as { password_hash: string } | undefined

    if (!userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const valid = await verifyPassword(password, userRow.password_hash)
    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 }
      )
    }

    disableTotp(user.id)

    return NextResponse.json({ success: true })
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
