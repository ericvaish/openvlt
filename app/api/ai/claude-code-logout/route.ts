import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { execSync } from "child_process"
import path from "path"

function getClaudeBinaryPath(): string {
  return path.join(process.cwd(), "node_modules", ".bin", "claude")
}

/** POST: Log out from Claude Code. */
export async function POST() {
  try {
    await requireAuthWithVault()

    const claudePath = getClaudeBinaryPath()
    execSync(`"${claudePath}" auth logout`, {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, TERM: "dumb", NO_COLOR: "1" },
    })

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
