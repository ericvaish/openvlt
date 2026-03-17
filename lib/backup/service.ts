import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { getVaultPath } from "@/lib/vaults/service"
import { getSyncLogSince, getMaxSeq } from "@/lib/sync/log"
import { getProvider } from "@/lib/backup/provider"
import {
  generateBackupKey,
  encryptBackupKey,
  encryptFile,
  hashContent,
} from "@/lib/backup/crypto"
import {
  encryptToken,
  decryptToken,
  encryptBackupKeyWithServerKey,
  decryptBackupKeyWithServerKey,
} from "@/lib/backup/token-store"
import type {
  BackupConfig,
  BackupFrequency,
  BackupRun,
  CloudProvider,
} from "@/types"

/**
 * Connect a cloud provider by storing encrypted OAuth tokens.
 */
export function saveCloudProvider(
  userId: string,
  provider: CloudProvider,
  accessToken: string,
  refreshToken: string,
  expiresAt: string,
  displayName?: string
): string {
  const db = getDb()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO cloud_providers (id, user_id, provider, display_name, access_token_enc, refresh_token_enc, token_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       token_expires_at = excluded.token_expires_at,
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`
  ).run(
    id,
    userId,
    provider,
    displayName || null,
    encryptToken(accessToken),
    encryptToken(refreshToken),
    expiresAt,
    now,
    now
  )

  return id
}

/**
 * Get a valid access token for a cloud provider, refreshing if expired.
 */
export async function getAccessToken(
  providerId: string
): Promise<string> {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT provider, access_token_enc, refresh_token_enc, token_expires_at FROM cloud_providers WHERE id = ?"
    )
    .get(providerId) as {
    provider: CloudProvider
    access_token_enc: string
    refresh_token_enc: string
    token_expires_at: string | null
  } | undefined

  if (!row) throw new Error("Cloud provider not found")

  // Check if token is still valid (with 5 minute buffer)
  if (
    row.token_expires_at &&
    new Date(row.token_expires_at).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return decryptToken(row.access_token_enc)
  }

  // Refresh the token
  const provider = getProvider(row.provider)
  const refreshTokenValue = decryptToken(row.refresh_token_enc)
  const result = await provider.refreshToken(refreshTokenValue)

  const now = new Date().toISOString()
  db.prepare(
    "UPDATE cloud_providers SET access_token_enc = ?, token_expires_at = ?, updated_at = ? WHERE id = ?"
  ).run(encryptToken(result.accessToken), result.expiresAt, now, providerId)

  return result.accessToken
}

/**
 * List connected cloud providers for a user.
 */
export function listCloudProviders(
  userId: string
): { id: string; provider: CloudProvider; displayName: string | null; tokenExpiresAt: string | null }[] {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT id, provider, display_name, token_expires_at FROM cloud_providers WHERE user_id = ?"
    )
    .all(userId) as {
    id: string
    provider: CloudProvider
    display_name: string | null
    token_expires_at: string | null
  }[]

  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    displayName: r.display_name,
    tokenExpiresAt: r.token_expires_at,
  }))
}

/**
 * Disconnect a cloud provider.
 */
export function deleteCloudProvider(
  providerId: string,
  userId: string
): void {
  const db = getDb()
  db.prepare(
    "DELETE FROM cloud_providers WHERE id = ? AND user_id = ?"
  ).run(providerId, userId)
}

/**
 * Configure backup for a vault.
 */
export function configureBackup(
  userId: string,
  vaultId: string,
  providerId: string,
  frequency: BackupFrequency,
  backupPassword: string,
  maxVersions: number = 10
): BackupConfig {
  const db = getDb()
  const id = uuid()
  const now = new Date().toISOString()

  // Generate and encrypt the backup key
  const backupKey = generateBackupKey()
  const { encrypted: backupKeyEnc, salt: backupKeySalt } = encryptBackupKey(
    backupKey,
    backupPassword
  )
  const backupKeyServerEnc = encryptBackupKeyWithServerKey(backupKey)

  db.prepare(
    `INSERT INTO backup_configs (id, vault_id, user_id, provider_id, frequency, max_versions, backup_key_enc, backup_key_salt, backup_key_server_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    vaultId,
    userId,
    providerId,
    frequency,
    maxVersions,
    backupKeyEnc,
    backupKeySalt,
    backupKeyServerEnc,
    now,
    now
  )

  return {
    id,
    vaultId,
    userId,
    providerId,
    enabled: true,
    frequency,
    maxVersions,
    remoteFolderId: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Get backup config for a vault.
 */
export function getBackupConfig(
  vaultId: string,
  userId: string
): BackupConfig | null {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT * FROM backup_configs WHERE vault_id = ? AND user_id = ?"
    )
    .get(vaultId, userId) as Record<string, unknown> | undefined

  if (!row) return null

  return {
    id: row.id as string,
    vaultId: row.vault_id as string,
    userId: row.user_id as string,
    providerId: row.provider_id as string,
    enabled: (row.enabled as number) === 1,
    frequency: row.frequency as BackupFrequency,
    maxVersions: row.max_versions as number,
    remoteFolderId: (row.remote_folder_id as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/**
 * Update backup config.
 */
export function updateBackupConfig(
  configId: string,
  updates: { frequency?: BackupFrequency; maxVersions?: number; enabled?: boolean }
): void {
  const db = getDb()
  const now = new Date().toISOString()
  const sets: string[] = ["updated_at = ?"]
  const params: unknown[] = [now]

  if (updates.frequency !== undefined) {
    sets.push("frequency = ?")
    params.push(updates.frequency)
  }
  if (updates.maxVersions !== undefined) {
    sets.push("max_versions = ?")
    params.push(updates.maxVersions)
  }
  if (updates.enabled !== undefined) {
    sets.push("enabled = ?")
    params.push(updates.enabled ? 1 : 0)
  }

  params.push(configId)
  db.prepare(`UPDATE backup_configs SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params
  )
}

/**
 * Run an incremental backup for a config.
 * Uses the sync log to determine what changed since the last backup.
 */
export async function runBackup(configId: string): Promise<BackupRun> {
  const db = getDb()
  const config = db
    .prepare("SELECT * FROM backup_configs WHERE id = ?")
    .get(configId) as Record<string, unknown> | undefined

  if (!config) throw new Error("Backup config not found")
  if (!(config.enabled as number)) throw new Error("Backup is disabled")

  const vaultId = config.vault_id as string
  const providerId = config.provider_id as string
  const backupKeyServerEnc = config.backup_key_server_enc as string

  if (!backupKeyServerEnc) {
    throw new Error("No server-encrypted backup key. Re-configure backup.")
  }

  const backupKey = decryptBackupKeyWithServerKey(backupKeyServerEnc)

  // Get the provider and a valid access token
  const providerRow = db
    .prepare("SELECT provider FROM cloud_providers WHERE id = ?")
    .get(providerId) as { provider: CloudProvider }
  const provider = getProvider(providerRow.provider)
  const accessToken = await getAccessToken(providerId)

  // Create or get the remote folder
  let remoteFolderId = config.remote_folder_id as string | null
  if (!remoteFolderId) {
    // Get vault name for the folder
    const vault = db
      .prepare("SELECT name FROM vaults WHERE id = ?")
      .get(vaultId) as { name: string }

    // Create root folder
    const root = await provider.createFolder(accessToken, "root", "openvlt-backup")
    const vaultFolder = await provider.createFolder(
      accessToken,
      root.folderId,
      vault.name
    )
    remoteFolderId = vaultFolder.folderId

    db.prepare(
      "UPDATE backup_configs SET remote_folder_id = ? WHERE id = ?"
    ).run(remoteFolderId, configId)
  }

  // Start the backup run
  const runId = uuid()
  const startedAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO backup_runs (id, config_id, status, started_at)
     VALUES (?, ?, 'running', ?)`
  ).run(runId, configId, startedAt)

  let filesUploaded = 0
  let filesDeleted = 0
  let bytesUploaded = 0

  try {
    // Get last successful backup's sequence number
    const lastRun = db
      .prepare(
        "SELECT last_sync_log_seq FROM backup_runs WHERE config_id = ? AND status = 'completed' ORDER BY started_at DESC LIMIT 1"
      )
      .get(configId) as { last_sync_log_seq: number | null } | undefined

    const sinceSeq = lastRun?.last_sync_log_seq ?? 0
    const vaultRoot = getVaultPath(vaultId)

    // Ensure notes subfolder exists in Drive
    let notesFolderId: string | null = null
    const existingFolders = await provider.listFolder(accessToken, remoteFolderId)
    const notesFolder = existingFolders.find(
      (f) => f.name === "notes" && f.mimeType === "application/vnd.google-apps.folder"
    )
    if (notesFolder) {
      notesFolderId = notesFolder.id
    } else {
      const created = await provider.createFolder(accessToken, remoteFolderId, "notes")
      notesFolderId = created.folderId
    }

    // Process changes from sync log
    let hasMore = true
    let currentSeq = sinceSeq

    while (hasMore) {
      const changes = getSyncLogSince(vaultId, currentSeq, 100)
      if (changes.length === 0) {
        hasMore = false
        break
      }

      for (const change of changes) {
        if (change.entityType === "note") {
          if (change.changeType === "delete") {
            // Remove from remote
            const fileEntry = db
              .prepare(
                "SELECT remote_file_id FROM backup_file_index WHERE config_id = ? AND note_id = ?"
              )
              .get(configId, change.entityId) as { remote_file_id: string } | undefined

            if (fileEntry?.remote_file_id) {
              await provider.deleteFile(accessToken, fileEntry.remote_file_id)
              db.prepare(
                "DELETE FROM backup_file_index WHERE config_id = ? AND note_id = ?"
              ).run(configId, change.entityId)
              filesDeleted++
            }
          } else if (
            change.changeType === "create" ||
            change.changeType === "update"
          ) {
            // Read the note from disk
            const noteRow = db
              .prepare("SELECT file_path FROM notes WHERE id = ? AND vault_id = ?")
              .get(change.entityId, vaultId) as { file_path: string } | undefined

            if (noteRow) {
              const fullPath = path.join(vaultRoot, noteRow.file_path)
              if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath)
                const contentHashVal = hashContent(content)

                // Check if content has actually changed
                const existing = db
                  .prepare(
                    "SELECT content_hash, remote_file_id FROM backup_file_index WHERE config_id = ? AND note_id = ?"
                  )
                  .get(configId, change.entityId) as {
                  content_hash: string
                  remote_file_id: string | null
                } | undefined

                if (existing?.content_hash === contentHashVal) {
                  continue // Content unchanged, skip
                }

                const encrypted = encryptFile(content, backupKey)
                const remoteName = noteRow.file_path.replace(/\//g, "__") + ".enc"

                if (existing?.remote_file_id) {
                  // Update existing file
                  await provider.updateFile(
                    accessToken,
                    existing.remote_file_id,
                    encrypted
                  )
                } else {
                  // Upload new file
                  const uploaded = await provider.uploadFile(
                    accessToken,
                    notesFolderId!,
                    remoteName,
                    encrypted
                  )

                  // Upsert file index
                  const entryId = uuid()
                  db.prepare(
                    `INSERT INTO backup_file_index (id, config_id, note_id, entity_type, local_path, remote_file_id, content_hash, encrypted_size, last_backed_up_at)
                     VALUES (?, ?, ?, 'note', ?, ?, ?, ?, ?)
                     ON CONFLICT(config_id, local_path) DO UPDATE SET
                       remote_file_id = excluded.remote_file_id,
                       content_hash = excluded.content_hash,
                       encrypted_size = excluded.encrypted_size,
                       last_backed_up_at = excluded.last_backed_up_at`
                  ).run(
                    entryId,
                    configId,
                    change.entityId,
                    noteRow.file_path,
                    uploaded.fileId,
                    contentHashVal,
                    encrypted.length,
                    new Date().toISOString()
                  )
                }

                // Update index for updates to existing files
                if (existing?.remote_file_id) {
                  db.prepare(
                    "UPDATE backup_file_index SET content_hash = ?, encrypted_size = ?, last_backed_up_at = ? WHERE config_id = ? AND note_id = ?"
                  ).run(
                    contentHashVal,
                    encrypted.length,
                    new Date().toISOString(),
                    configId,
                    change.entityId
                  )
                }

                filesUploaded++
                bytesUploaded += encrypted.length
              }
            }
          }
        }

        currentSeq = change.seq
      }

      if (changes.length < 100) hasMore = false
    }

    // Upload manifest (encrypted metadata snapshot)
    const manifest = buildManifest(vaultId)
    const encryptedManifest = encryptFile(
      Buffer.from(JSON.stringify(manifest), "utf-8"),
      backupKey
    )
    const manifestName = `manifest-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`

    // Check for existing manifest
    const existingManifest = existingFolders.find(
      (f) => f.name === "manifest.enc"
    )
    if (existingManifest) {
      await provider.updateFile(accessToken, existingManifest.id, encryptedManifest)
    } else {
      await provider.uploadFile(
        accessToken,
        remoteFolderId,
        "manifest.enc",
        encryptedManifest
      )
    }

    // Also save a timestamped history copy
    let historyFolderId: string | null = null
    const histFolder = existingFolders.find(
      (f) => f.name === "history" && f.mimeType === "application/vnd.google-apps.folder"
    )
    if (histFolder) {
      historyFolderId = histFolder.id
    } else {
      const created = await provider.createFolder(accessToken, remoteFolderId, "history")
      historyFolderId = created.folderId
    }
    await provider.uploadFile(
      accessToken,
      historyFolderId,
      manifestName,
      encryptedManifest
    )

    bytesUploaded += encryptedManifest.length

    // Use current max seq as the watermark
    const finalSeq = getMaxSeq(vaultId)

    // Complete the run
    const completedAt = new Date().toISOString()
    db.prepare(
      `UPDATE backup_runs SET status = 'completed', completed_at = ?, files_uploaded = ?, files_deleted = ?, bytes_uploaded = ?, last_sync_log_seq = ?
       WHERE id = ?`
    ).run(completedAt, filesUploaded, filesDeleted, bytesUploaded, finalSeq, runId)

    // Prune old history manifests
    await pruneBackupHistory(
      accessToken,
      provider,
      historyFolderId,
      config.max_versions as number
    )

    return {
      id: runId,
      configId,
      status: "completed",
      startedAt,
      completedAt,
      filesUploaded,
      filesDeleted,
      bytesUploaded,
      errorMessage: null,
      lastSyncLogSeq: finalSeq,
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error"
    const completedAt = new Date().toISOString()
    db.prepare(
      `UPDATE backup_runs SET status = 'failed', completed_at = ?, error_message = ?, files_uploaded = ?, files_deleted = ?, bytes_uploaded = ?
       WHERE id = ?`
    ).run(completedAt, errorMessage, filesUploaded, filesDeleted, bytesUploaded, runId)

    return {
      id: runId,
      configId,
      status: "failed",
      startedAt,
      completedAt,
      filesUploaded,
      filesDeleted,
      bytesUploaded,
      errorMessage,
      lastSyncLogSeq: null,
    }
  }
}

/**
 * Build a manifest of all notes/folders/tags in a vault.
 */
function buildManifest(vaultId: string): Record<string, unknown> {
  const db = getDb()

  const notes = db
    .prepare(
      "SELECT id, title, file_path, parent_id, created_at, updated_at, is_favorite, is_trashed FROM notes WHERE vault_id = ? AND is_trashed = 0"
    )
    .all(vaultId) as Record<string, unknown>[]

  const folders = db
    .prepare("SELECT id, name, path, parent_id FROM folders WHERE vault_id = ?")
    .all(vaultId) as Record<string, unknown>[]

  const tags = db
    .prepare("SELECT id, name FROM tags WHERE vault_id = ?")
    .all(vaultId) as Record<string, unknown>[]

  const noteTags = db
    .prepare(
      `SELECT nt.note_id, nt.tag_id FROM note_tags nt
       JOIN notes n ON n.id = nt.note_id
       WHERE n.vault_id = ?`
    )
    .all(vaultId) as { note_id: string; tag_id: string }[]

  return {
    version: 1,
    vaultId,
    backedUpAt: new Date().toISOString(),
    notes,
    folders,
    tags,
    noteTags,
  }
}

/**
 * Prune old manifest history files, keeping only maxVersions.
 */
async function pruneBackupHistory(
  accessToken: string,
  provider: import("@/types").CloudStorageProvider,
  historyFolderId: string,
  maxVersions: number
): Promise<void> {
  const files = await provider.listFolder(accessToken, historyFolderId)
  const manifests = files
    .filter((f) => f.name.startsWith("manifest-") && f.name.endsWith(".enc"))
    .sort((a, b) => b.name.localeCompare(a.name)) // newest first

  if (manifests.length <= maxVersions) return

  const toDelete = manifests.slice(maxVersions)
  for (const file of toDelete) {
    await provider.deleteFile(accessToken, file.id)
  }
}

/**
 * Get backup run history for a config.
 */
export function getBackupHistory(
  configId: string,
  limit: number = 20
): BackupRun[] {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT * FROM backup_runs WHERE config_id = ? ORDER BY started_at DESC LIMIT ?"
    )
    .all(configId, limit) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    configId: r.config_id as string,
    status: r.status as BackupRun["status"],
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string) || null,
    filesUploaded: r.files_uploaded as number,
    filesDeleted: r.files_deleted as number,
    bytesUploaded: r.bytes_uploaded as number,
    errorMessage: (r.error_message as string) || null,
    lastSyncLogSeq: (r.last_sync_log_seq as number) || null,
  }))
}
