import fs from "fs"
import path from "path"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { getProvider } from "@/lib/backup/provider"
import { decryptBackupKey, decryptFile } from "@/lib/backup/crypto"
import { getAccessToken } from "@/lib/backup/service"
import type { CloudProvider } from "@/types"

interface ManifestNote {
  id: string
  title: string
  file_path: string
  parent_id: string | null
  created_at: string
  updated_at: string
  is_favorite: number
}

interface Manifest {
  version: number
  vaultId: string
  backedUpAt: string
  notes: ManifestNote[]
  folders: { id: string; name: string; path: string; parent_id: string | null }[]
  tags: { id: string; name: string }[]
  noteTags: { note_id: string; tag_id: string }[]
}

/**
 * Download and decrypt the manifest to list restorable files.
 */
export async function listBackupContents(
  configId: string,
  backupPassword: string
): Promise<Manifest> {
  const db = getDb()
  const config = db
    .prepare(
      "SELECT provider_id, backup_key_enc, backup_key_salt, remote_folder_id FROM backup_configs WHERE id = ?"
    )
    .get(configId) as {
    provider_id: string
    backup_key_enc: string
    backup_key_salt: string
    remote_folder_id: string | null
  } | undefined

  if (!config) throw new Error("Backup config not found")
  if (!config.remote_folder_id) throw new Error("No backup exists yet")

  const backupKey = decryptBackupKey(
    config.backup_key_enc,
    backupPassword,
    config.backup_key_salt
  )

  const providerRow = db
    .prepare("SELECT provider FROM cloud_providers WHERE id = ?")
    .get(config.provider_id) as { provider: CloudProvider }
  const provider = getProvider(providerRow.provider)
  const accessToken = await getAccessToken(config.provider_id)

  // Find and download the manifest
  const files = await provider.listFolder(accessToken, config.remote_folder_id)
  const manifestFile = files.find((f) => f.name === "manifest.enc")
  if (!manifestFile) throw new Error("No manifest found in backup")

  const encryptedManifest = await provider.downloadFile(
    accessToken,
    manifestFile.id
  )
  const decryptedManifest = decryptFile(encryptedManifest, backupKey)

  return JSON.parse(decryptedManifest.toString("utf-8")) as Manifest
}

/**
 * Preview a backed-up note's content without writing to disk.
 */
export async function previewNote(
  configId: string,
  noteId: string,
  backupPassword: string
): Promise<{ title: string; content: string }> {
  const db = getDb()
  const config = db
    .prepare(
      "SELECT provider_id, backup_key_enc, backup_key_salt FROM backup_configs WHERE id = ?"
    )
    .get(configId) as {
    provider_id: string
    backup_key_enc: string
    backup_key_salt: string
  } | undefined

  if (!config) throw new Error("Backup config not found")

  const backupKey = decryptBackupKey(
    config.backup_key_enc,
    backupPassword,
    config.backup_key_salt
  )

  // Find the remote file for this note
  const fileEntry = db
    .prepare(
      "SELECT remote_file_id, local_path FROM backup_file_index WHERE config_id = ? AND note_id = ?"
    )
    .get(configId, noteId) as { remote_file_id: string; local_path: string } | undefined

  if (!fileEntry?.remote_file_id) {
    throw new Error("Note not found in backup")
  }

  const providerRow = db
    .prepare("SELECT provider FROM cloud_providers WHERE id = ?")
    .get(config.provider_id) as { provider: CloudProvider }
  const provider = getProvider(providerRow.provider)
  const accessToken = await getAccessToken(config.provider_id)

  const encrypted = await provider.downloadFile(
    accessToken,
    fileEntry.remote_file_id
  )
  const content = decryptFile(encrypted, backupKey).toString("utf-8")
  const title = path.basename(fileEntry.local_path, path.extname(fileEntry.local_path))

  return { title, content }
}

/**
 * Restore a single note from backup.
 * mode: "overwrite" replaces the current note, "new" creates a copy.
 */
export async function restoreNote(
  configId: string,
  noteId: string,
  backupPassword: string,
  vaultId: string,
  userId: string,
  mode: "overwrite" | "new" = "new"
): Promise<{ noteId: string; filePath: string }> {
  const { title, content } = await previewNote(configId, noteId, backupPassword)
  const vaultRoot = getVaultPath(vaultId)

  if (mode === "overwrite") {
    // Find the existing note and overwrite
    const db = getDb()
    const existing = db
      .prepare(
        "SELECT file_path FROM notes WHERE id = ? AND vault_id = ?"
      )
      .get(noteId, vaultId) as { file_path: string } | undefined

    if (existing) {
      const fullPath = safeResolvePath(vaultRoot, existing.file_path)
      fs.writeFileSync(fullPath, content, "utf-8")
      const now = new Date().toISOString()
      db.prepare(
        "UPDATE notes SET updated_at = ? WHERE id = ?"
      ).run(now, noteId)
      return { noteId, filePath: existing.file_path }
    }
  }

  // Create as a new note
  const { createNote } = require("@/lib/notes") as typeof import("@/lib/notes")
  const restoredTitle = mode === "new" ? `${title} (restored)` : title
  const note = createNote(restoredTitle, userId, vaultId, null, content)
  return { noteId: note.id, filePath: note.filePath }
}

/**
 * Restore all notes from backup.
 */
export async function restoreVault(
  configId: string,
  backupPassword: string,
  vaultId: string,
  userId: string
): Promise<{ restoredCount: number }> {
  const manifest = await listBackupContents(configId, backupPassword)
  let restoredCount = 0

  for (const note of manifest.notes) {
    try {
      await restoreNote(configId, note.id, backupPassword, vaultId, userId, "new")
      restoredCount++
    } catch {
      // Skip notes that fail to restore
    }
  }

  return { restoredCount }
}
