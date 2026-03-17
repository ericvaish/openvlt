import { NextRequest, NextResponse } from "next/server"
import { createSession } from "@/lib/auth/service"
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "@/lib/constants"
import {
  validatePending2FAToken,
  consumePending2FAToken,
  verifyTotpCode,
  verifyRecoveryCode,
} from "@/lib/auth/totp"
import { getDb } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pendingToken, method, code } = body

    if (!pendingToken || typeof pendingToken !== "string") {
      return NextResponse.json(
        { error: "Pending token is required" },
        { status: 400 }
      )
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { error: "Verification code is required" },
        { status: 400 }
      )
    }

    const pending = validatePending2FAToken(pendingToken)
    if (!pending) {
      return NextResponse.json(
        { error: "Invalid or expired verification session. Please log in again." },
        { status: 401 }
      )
    }

    let verified = false

    if (method === "recovery") {
      verified = await verifyRecoveryCode(pending.userId, code)
    } else {
      // Default to TOTP
      verified = verifyTotpCode(pending.userId, code)
    }

    if (!verified) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 401 }
      )
    }

    // Consume the pending token and create a real session
    consumePending2FAToken(pending.tokenId)
    const session = createSession(pending.userId)

    // Get user info for the response
    const db = getDb()
    const userRow = db
      .prepare("SELECT id, username, display_name, created_at FROM users WHERE id = ?")
      .get(pending.userId) as {
      id: string
      username: string
      display_name: string
      created_at: string
    }

    const response = NextResponse.json({
      user: {
        id: userRow.id,
        username: userRow.username,
        displayName: userRow.display_name,
        createdAt: userRow.created_at,
      },
    })
    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    })

    return response
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
