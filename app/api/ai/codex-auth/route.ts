import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { startCodexAuthFlow } from "@/lib/ai/codex-oauth"

export async function POST() {
  try {
    await requireAuthWithVault()

    const { authUrl, port } = await startCodexAuthFlow()

    return NextResponse.json({ authUrl, port })
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
