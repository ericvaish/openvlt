import { NextRequest, NextResponse } from "next/server"
import { requireAuthWithVault, AuthError } from "@/lib/auth/middleware"
import {
  configureBackup,
  getBackupConfig,
  updateBackupConfig,
} from "@/lib/backup/service"
import { scheduleBackup, cancelBackup } from "@/lib/backup/scheduler"
import type { BackupFrequency } from "@/types"

export async function GET() {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const config = getBackupConfig(vaultId, user.id)
    return NextResponse.json(config)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = (await request.json()) as {
      providerId?: string
      frequency?: BackupFrequency
      backupPassword?: string
      maxVersions?: number
      enabled?: boolean
    }

    // Check if config already exists
    const existing = getBackupConfig(vaultId, user.id)

    if (existing) {
      // Update existing config
      const updates: { frequency?: BackupFrequency; maxVersions?: number; enabled?: boolean } = {}
      if (body.frequency) updates.frequency = body.frequency
      if (body.maxVersions !== undefined) updates.maxVersions = body.maxVersions
      if (body.enabled !== undefined) updates.enabled = body.enabled

      updateBackupConfig(existing.id, updates)

      if (body.enabled === false) {
        cancelBackup(existing.id)
      } else if (body.frequency) {
        scheduleBackup(existing.id, body.frequency)
      }

      return NextResponse.json({ ...existing, ...updates })
    }

    // Create new config
    if (!body.providerId || !body.backupPassword || !body.frequency) {
      return NextResponse.json(
        { error: "providerId, backupPassword, and frequency are required" },
        { status: 400 }
      )
    }

    const config = configureBackup(
      user.id,
      vaultId,
      body.providerId,
      body.frequency,
      body.backupPassword,
      body.maxVersions
    )

    scheduleBackup(config.id, config.frequency)

    return NextResponse.json(config, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
