import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { isClaudeCodeAvailable } from "@/lib/ai/providers/claude-code"

export async function GET() {
  try {
    await requireAuthWithVault()
    const status = await isClaudeCodeAvailable()
    return NextResponse.json(status)
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
