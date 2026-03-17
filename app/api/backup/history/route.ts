import { NextResponse } from "next/server"
import { requireAuthWithVault, AuthError } from "@/lib/auth/middleware"
import { getBackupConfig, getBackupHistory } from "@/lib/backup/service"

export async function GET() {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const config = getBackupConfig(vaultId, user.id)

    if (!config) {
      return NextResponse.json([])
    }

    const history = getBackupHistory(config.id)
    return NextResponse.json(history)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
