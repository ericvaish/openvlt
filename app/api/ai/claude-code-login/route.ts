import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import {
  startLoginSession,
  cancelLoginSession,
} from "@/lib/ai/claude-login"

/** POST: Start a new Claude login session. */
export async function POST() {
  try {
    await requireAuthWithVault()
    const result = startLoginSession()
    return NextResponse.json(result)
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

/** DELETE: Cancel an active login session. */
export async function DELETE(request: Request) {
  try {
    await requireAuthWithVault()
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("session")
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session parameter" },
        { status: 400 }
      )
    }
    cancelLoginSession(sessionId)
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
