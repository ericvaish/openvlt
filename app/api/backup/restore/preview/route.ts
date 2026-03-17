import { NextRequest, NextResponse } from "next/server"
import { requireAuthWithVault, AuthError } from "@/lib/auth/middleware"
import { getBackupConfig } from "@/lib/backup/service"
import { previewNote } from "@/lib/backup/restore"

export async function POST(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = (await request.json()) as {
      noteId: string
      backupPassword: string
    }

    if (!body.noteId || !body.backupPassword) {
      return NextResponse.json(
        { error: "noteId and backupPassword are required" },
        { status: 400 }
      )
    }

    const config = getBackupConfig(vaultId, user.id)
    if (!config) {
      return NextResponse.json({ error: "No backup configured" }, { status: 404 })
    }

    const result = await previewNote(config.id, body.noteId, body.backupPassword)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
