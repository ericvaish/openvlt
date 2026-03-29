import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { recordStructureEvent } from "@/lib/versions/structure-events"
import { appendSyncLog, hashContent } from "@/lib/sync/log"
import { versionAttachment } from "@/lib/versions/attachment-versions"

export interface AttachmentMeta {
  id: string
  noteId: string
  fileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export function saveAttachment(
  noteId: string,
  userId: string,
  vaultId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): AttachmentMeta {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  const note = db
    .prepare(
      "SELECT file_path FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(noteId, userId, vaultId) as { file_path: string } | undefined

  if (!note) throw new Error("Note not found")

  const noteDir = safeResolvePath(vaultRoot, path.dirname(note.file_path))
  fs.mkdirSync(noteDir, { recursive: true })

  // Avoid name collisions by prefixing with a short id
  const safeName = fileName.replace(/[<>:"/\\|?*]/g, "_")
  const diskPath = path.join(noteDir, safeName)

  // Check if this is replacing an existing attachment with the same filename
  const existing = db
    .prepare(
      "SELECT id, file_path, mime_type, size_bytes FROM attachments WHERE note_id = ? AND file_name = ?"
    )
    .get(noteId, safeName) as
    | { id: string; file_path: string; mime_type: string; size_bytes: number }
    | undefined

  if (existing) {
    // Version the old attachment before overwriting
    versionAttachment(
      existing.id,
      noteId,
      vaultId,
      existing.file_path,
      safeName,
      existing.mime_type,
      existing.size_bytes
    )

    // Overwrite the file
    fs.writeFileSync(diskPath, buffer)

    const now = new Date().toISOString()
    db.prepare(
      "UPDATE attachments SET size_bytes = ?, mime_type = ?, created_at = ? WHERE id = ?"
    ).run(buffer.length, mimeType, now, existing.id)

    const relativePath = path.relative(vaultRoot, diskPath)

    recordStructureEvent(vaultId, userId, "attachment_added", "attachment", existing.id, null, {
      noteId,
      fileName: safeName,
      filePath: relativePath,
    })

    appendSyncLog(vaultId, "attachment", existing.id, "update", {
      noteId,
      fileName: safeName,
      filePath: relativePath,
    }, hashContent(buffer))

    return {
      id: existing.id,
      noteId,
      fileName: safeName,
      filePath: relativePath,
      mimeType,
      sizeBytes: buffer.length,
      createdAt: now,
    }
  }

  // If file already exists on disk but not tracked (edge case), add uuid prefix
  let finalDiskPath = diskPath
  let finalName = safeName
  if (fs.existsSync(diskPath)) {
    const ext = path.extname(safeName)
    const base = path.basename(safeName, ext)
    finalName = `${base}-${uuid().slice(0, 8)}${ext}`
    finalDiskPath = path.join(noteDir, finalName)
  }

  fs.writeFileSync(finalDiskPath, buffer)

  const id = uuid()
  const now = new Date().toISOString()
  const relativePath = path.relative(vaultRoot, finalDiskPath)
  const sizeBytes = buffer.length

  db.prepare(
    `INSERT INTO attachments (id, note_id, file_name, file_path, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, noteId, finalName, relativePath, mimeType, sizeBytes, now)

  recordStructureEvent(vaultId, userId, "attachment_added", "attachment", id, null, {
    noteId,
    fileName: finalName,
    filePath: relativePath,
  })

  appendSyncLog(vaultId, "attachment", id, "create", {
    noteId,
    fileName: finalName,
    filePath: relativePath,
  }, hashContent(buffer))

  return {
    id,
    noteId,
    fileName: finalName,
    filePath: relativePath,
    mimeType,
    sizeBytes,
    createdAt: now,
  }
}

export function deleteAttachment(
  attachmentId: string,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  const row = db
    .prepare(
      `SELECT a.file_path FROM attachments a
       JOIN notes n ON n.id = a.note_id
       WHERE a.id = ? AND n.user_id = ? AND n.vault_id = ?`
    )
    .get(attachmentId, userId, vaultId) as { file_path: string } | undefined

  if (!row) throw new Error("Attachment not found")

  const fullPath = safeResolvePath(vaultRoot, row.file_path)
  try {
    fs.unlinkSync(fullPath)
  } catch {
    // File already gone
  }

  // Get note info for the structure event
  const noteInfo = db
    .prepare(
      `SELECT a.note_id, n.vault_id FROM attachments a
       JOIN notes n ON n.id = a.note_id
       WHERE a.id = ?`
    )
    .get(attachmentId) as { note_id: string; vault_id: string } | undefined

  db.prepare("DELETE FROM attachments WHERE id = ?").run(attachmentId)

  if (noteInfo) {
    recordStructureEvent(noteInfo.vault_id, userId, "attachment_removed", "attachment", attachmentId, {
      filePath: row.file_path,
    }, null)

    appendSyncLog(noteInfo.vault_id, "attachment", attachmentId, "delete", {
      noteId: noteInfo.note_id,
      filePath: row.file_path,
    })
  }
}

export function listAttachments(
  noteId: string,
  userId: string,
  vaultId: string
): AttachmentMeta[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT a.id, a.note_id, a.file_name, a.file_path, a.mime_type, a.size_bytes, a.created_at
       FROM attachments a
       JOIN notes n ON n.id = a.note_id
       WHERE a.note_id = ? AND n.user_id = ? AND n.vault_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(noteId, userId, vaultId) as {
    id: string
    note_id: string
    file_name: string
    file_path: string
    mime_type: string
    size_bytes: number
    created_at: string
  }[]

  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    fileName: r.file_name,
    filePath: r.file_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  }))
}

/**
 * Delete attachments for a note that are no longer referenced in the content.
 * Extracts attachment IDs from `data-attachment-id="..."` in the saved markdown
 * and removes any DB/disk attachments not in that set.
 */
export function cleanupOrphanedAttachments(
  noteId: string,
  content: string,
  userId: string,
  vaultId: string
): number {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  // Extract all attachment IDs referenced in the content
  const referenced = new Set<string>()
  const regex = /data-attachment-id="([^"]+)"/g
  let match
  while ((match = regex.exec(content)) !== null) {
    referenced.add(match[1])
  }

  // Also match old-style /api/attachments/{id} links and image srcs
  const linkRegex = /\/api\/attachments\/([a-f0-9-]{36})/g
  while ((match = linkRegex.exec(content)) !== null) {
    referenced.add(match[1])
  }

  // Get all attachments for this note
  const rows = db
    .prepare(
      `SELECT a.id, a.file_path FROM attachments a
       JOIN notes n ON n.id = a.note_id
       WHERE a.note_id = ? AND n.user_id = ? AND n.vault_id = ?`
    )
    .all(noteId, userId, vaultId) as { id: string; file_path: string }[]

  // Delete orphans
  let deleted = 0
  for (const row of rows) {
    if (!referenced.has(row.id)) {
      const fullPath = safeResolvePath(vaultRoot, row.file_path)
      try {
        fs.unlinkSync(fullPath)
      } catch {
        // file already gone
      }
      db.prepare("DELETE FROM attachments WHERE id = ?").run(row.id)
      deleted++
    }
  }
  return deleted
}

export function getAttachmentPath(
  attachmentId: string,
  userId: string,
  vaultId: string
): string | null {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  const row = db
    .prepare(
      `SELECT a.file_path FROM attachments a
       JOIN notes n ON n.id = a.note_id
       WHERE a.id = ? AND n.user_id = ? AND n.vault_id = ?`
    )
    .get(attachmentId, userId, vaultId) as { file_path: string } | undefined

  if (!row) return null

  return safeResolvePath(vaultRoot, row.file_path)
}

