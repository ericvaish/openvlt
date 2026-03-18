import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import fs from "fs"
import path from "path"
import os from "os"

const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json")

/** POST: Log out from ChatGPT (Codex). Removes ~/.codex/auth.json. */
export async function POST() {
  try {
    await requireAuthWithVault()

    if (fs.existsSync(CODEX_AUTH_PATH)) {
      fs.unlinkSync(CODEX_AUTH_PATH)
    }

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
