import { NextResponse } from "next/server"
import { requireAuthWithVault, AuthError } from "@/lib/auth/middleware"
import { getBackupConfig, runBackup } from "@/lib/backup/service"

export async function POST() {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const config = getBackupConfig(vaultId, user.id)

    if (!config) {
      return NextResponse.json(
        { error: "No backup configured for this vault" },
        { status: 404 }
      )
    }

    const result = await runBackup(config.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
