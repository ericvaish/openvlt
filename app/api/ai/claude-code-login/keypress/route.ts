import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { sendKeypress } from "@/lib/ai/claude-login"

/** POST: Send a keypress to the login process (e.g. Enter to open browser). */
export async function POST(request: Request) {
  try {
    await requireAuthWithVault()
    const { sessionId, key } = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId" },
        { status: 400 }
      )
    }

    // Only allow safe keys (Enter, space)
    const safeKey = key === "enter" ? "\n" : key === "space" ? " " : null
    if (!safeKey) {
      return NextResponse.json(
        { error: "Invalid key. Allowed: enter, space" },
        { status: 400 }
      )
    }

    sendKeypress(sessionId, safeKey)
    return NextResponse.json({ ok: true })
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
