import { NextRequest, NextResponse } from "next/server"
import { authenticateUser, createSession } from "@/lib/auth/service"
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
} from "@/lib/constants"
import {
  getUserTwoFactorStatus,
  createPending2FAToken,
  cleanupExpiredPendingTokens,
} from "@/lib/auth/totp"

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      )
    }
    const { username, password } = body

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      )
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      )
    }

    const user = await authenticateUser(
      username.trim().toLowerCase(),
      password
    )
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      )
    }

    // Clean up expired pending tokens opportunistically
    cleanupExpiredPendingTokens()

    // Check if 2FA is enabled
    const twoFactor = getUserTwoFactorStatus(user.id)
    if (twoFactor.enabled && twoFactor.methods.length > 0) {
      const pendingToken = createPending2FAToken(user.id)
      return NextResponse.json({
        requires2FA: true,
        pendingToken,
        methods: twoFactor.methods,
      })
    }

    // No 2FA — create session directly
    const session = createSession(user.id)

    const response = NextResponse.json({ user })
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
