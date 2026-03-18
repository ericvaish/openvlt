import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { isCodexAvailable, getCodexToken } from "@/lib/ai/providers/codex"
import { execSync } from "child_process"

function isCodexInstalled(): boolean {
  try {
    execSync("which codex 2>/dev/null || where codex 2>nul", {
      stdio: "pipe",
    })
    return true
  } catch {
    return false
  }
}

export async function GET() {
  try {
    await requireAuthWithVault()

    const installed = isCodexInstalled()
    const authenticated = isCodexAvailable()
    const token = authenticated ? getCodexToken() : null

    return NextResponse.json({
      installed,
      authenticated,
      hasAccountId: !!token?.account_id,
    })
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
