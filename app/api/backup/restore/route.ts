import { NextRequest, NextResponse } from "next/server"
import { requireAuthWithVault, AuthError } from "@/lib/auth/middleware"
import { getBackupConfig } from "@/lib/backup/service"
import { listBackupContents, restoreNote, restoreVault } from "@/lib/backup/restore"

export async function GET(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const backupPassword = request.nextUrl.searchParams.get("password")

    if (!backupPassword) {
      return NextResponse.json(
        { error: "password query parameter is required" },
        { status: 400 }
      )
    }

    const config = getBackupConfig(vaultId, user.id)
    if (!config) {
      return NextResponse.json({ error: "No backup configured" }, { status: 404 })
    }

    const manifest = await listBackupContents(config.id, backupPassword)
    return NextResponse.json(manifest)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = (await request.json()) as {
      backupPassword: string
      noteId?: string
      mode?: "overwrite" | "new"
      restoreAll?: boolean
    }

    if (!body.backupPassword) {
      return NextResponse.json(
        { error: "backupPassword is required" },
        { status: 400 }
      )
    }

    const config = getBackupConfig(vaultId, user.id)
    if (!config) {
      return NextResponse.json({ error: "No backup configured" }, { status: 404 })
    }

    if (body.restoreAll) {
      const result = await restoreVault(
        config.id,
        body.backupPassword,
        vaultId,
        user.id
      )
      return NextResponse.json(result)
    }

    if (!body.noteId) {
      return NextResponse.json(
        { error: "noteId is required (or set restoreAll: true)" },
        { status: 400 }
      )
    }

    const result = await restoreNote(
      config.id,
      body.noteId,
      body.backupPassword,
      vaultId,
      user.id,
      body.mode || "new"
    )

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
