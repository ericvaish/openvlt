import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { recordStructureEvent } from "@/lib/versions/structure-events"
import type { NoteMetadata, NoteType, NoteWithContent, VersionTrigger } from "@/types"

const TRASH_AUTO_PURGE_DAYS = 30

function toMetadata(row: Record<string, unknown>): NoteMetadata {
  const db = getDb()
  const tagRows = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id
       WHERE nt.note_id = ?`
    )
    .all(row.id as string) as { name: string }[]

  return {
    id: row.id as string,
    title: row.title as string,
    filePath: row.file_path as string,
    parentId: (row.parent_id as string) || null,
    vaultId: (row.vault_id as string) || "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    isTrashed: (row.is_trashed as number) === 1,
    trashedAt: (row.trashed_at as string) || null,
    isFavorite: (row.is_favorite as number) === 1,
    isLocked: (row.is_locked as number) === 1,
    tags: tagRows.map((t) => t.name),
    version: (row.version as number) ?? 1,
    noteType: (row.note_type as NoteType) ?? "markdown",
  }
}

export function createNote(
  title: string,
  userId: string,
  vaultId: string,
  parentId: string | null = null,
  initialContent?: string,
  noteType?: NoteType
): NoteMetadata {
  const db = getDb()
  const id = uuid()
  const vaultRoot = getVaultPath(vaultId)

  let dirPath = vaultRoot
  if (parentId) {
    const folder = db
      .prepare(
        "SELECT path FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
      )
      .get(parentId, userId, vaultId) as { path: string } | undefined
    if (folder) {
      dirPath = safeResolvePath(vaultRoot, folder.path)
    }
  }

  fs.mkdirSync(dirPath, { recursive: true })

  const safeTitle = title.replace(/[<>:"/\\|?*]/g, "_")
  const folderPrefix = parentId
    ? (
        db
          .prepare(
            "SELECT path FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
          )
          .get(parentId, userId, vaultId) as { path: string }
      ).path
    : null

  // Determine file extension and note type based on title or explicit noteType
  const isExcalidraw = safeTitle.endsWith(".excalidraw")
  const isCanvas = noteType === "canvas"
  const ext = isExcalidraw ? ".json" : isCanvas ? ".canvas.json" : ".md"
  const resolvedNoteType: NoteType = isExcalidraw
    ? "excalidraw"
    : isCanvas
      ? "canvas"
      : "markdown"

  // Find a unique filename (append counter if needed)
  let fileName = `${safeTitle}${ext}`
  let filePath = folderPrefix ? path.join(folderPrefix, fileName) : fileName
  let counter = 1
  while (
    db
      .prepare("SELECT 1 FROM notes WHERE file_path = ? AND vault_id = ?")
      .get(filePath, vaultId)
  ) {
    const base = isExcalidraw
      ? `${safeTitle.slice(0, -".excalidraw".length)} ${counter}.excalidraw`
      : isCanvas
        ? `${safeTitle} ${counter}`
        : `${safeTitle} ${counter}`
    fileName = `${base}${ext}`
    filePath = folderPrefix ? path.join(folderPrefix, fileName) : fileName
    counter++
  }

  const fullPath = safeResolvePath(vaultRoot, filePath)
  const defaultCanvasContent = JSON.stringify({
    type: "openvlt-canvas",
    version: 1,
    document: {},
  })
  const fileContent = initialContent ?? (isCanvas ? defaultCanvasContent : `# ${title}\n`)
  fs.writeFileSync(fullPath, fileContent, "utf-8")

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO notes (id, title, file_path, parent_id, user_id, vault_id, created_at, updated_at, note_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, filePath, parentId, userId, vaultId, now, now, resolvedNoteType)

  // Index for full-text search
  const ftsContent = isExcalidraw || isCanvas ? title : fileContent
  db.prepare(
    `INSERT INTO notes_fts (rowid, title, content)
     VALUES ((SELECT rowid FROM notes WHERE id = ?), ?, ?)`
  ).run(id, title, ftsContent)

  const metadata = toMetadata(
    db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Record<
      string,
      unknown
    >
  )

  recordStructureEvent(vaultId, userId, "note_created", "note", id, null, {
    title,
    filePath: filePath,
    parentId,
  })

  return metadata
}

export function getNote(
  id: string,
  userId: string,
  vaultId: string
): NoteWithContent | null {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT * FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as Record<string, unknown> | undefined

  if (!row) return null

  const vaultRoot = getVaultPath(vaultId)
  const fullPath = safeResolvePath(vaultRoot, row.file_path as string)
  let content = ""
  try {
    content = fs.readFileSync(fullPath, "utf-8")
  } catch {
    // File may have been deleted externally
  }

  return {
    metadata: toMetadata(row),
    content,
  }
}

export function updateNoteContent(
  id: string,
  content: string,
  userId: string,
  vaultId: string,
  baseVersion?: number,
  trigger: VersionTrigger = "autosave"
): import("@/types").SaveResult {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT file_path, title, version, note_type FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as
    | { file_path: string; title: string; version: number; note_type: string }
    | undefined

  if (!row) throw new Error("Note not found")

  const vaultRoot = getVaultPath(vaultId)
  const fullPath = safeResolvePath(vaultRoot, row.file_path)
  const currentVersion = row.version ?? 1
  const isCanvasOrExcalidraw = row.note_type === "canvas" || row.note_type === "excalidraw"

  // If baseVersion provided and doesn't match, attempt merge (skip for canvas/excalidraw — not text-mergeable)
  if (!isCanvasOrExcalidraw && baseVersion !== undefined && baseVersion < currentVersion) {
    const { threeWayMerge } =
      require("@/lib/sync/merge") as typeof import("@/lib/sync/merge")
    const { saveVersionGrouped } =
      require("@/lib/versions/grouping") as typeof import("@/lib/versions/grouping")

    // Read current server content
    let serverContent = ""
    try {
      serverContent = fs.readFileSync(fullPath, "utf-8")
    } catch {}

    // Find ancestor: the version snapshot at baseVersion
    const ancestorRow = db
      .prepare(
        `SELECT content FROM note_versions
         WHERE note_id = ? AND version_number <= ?
         ORDER BY version_number DESC LIMIT 1`
      )
      .get(id, baseVersion) as { content: string } | undefined

    const ancestor = ancestorRow?.content ?? serverContent

    const mergeResult = threeWayMerge(ancestor, serverContent, content)

    if (mergeResult.success) {
      // Auto-merge succeeded
      saveVersionGrouped(id, serverContent, row.title, userId, "merge")
      fs.writeFileSync(fullPath, mergeResult.content, "utf-8")
      const newVersion = currentVersion + 1
      const now = new Date().toISOString()
      db.prepare(
        "UPDATE notes SET version = ?, updated_at = ? WHERE id = ?"
      ).run(newVersion, now, id)
      db.prepare(
        `UPDATE notes_fts SET title = ?, content = ?
         WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)`
      ).run(row.title, mergeResult.content, id)

      return {
        version: newVersion,
        content: mergeResult.content,
        status: "merged",
      }
    } else {
      // Conflict — don't save, return both versions
      return {
        version: currentVersion,
        content: serverContent,
        status: "conflict",
        conflicts: mergeResult.conflicts,
        serverContent,
      }
    }
  }

  // Normal save (no conflict)
  const { saveVersionGrouped } =
    require("@/lib/versions/grouping") as typeof import("@/lib/versions/grouping")
  let currentContent = ""
  try {
    currentContent = fs.readFileSync(fullPath, "utf-8")
  } catch {}
  if (currentContent !== content) {
    saveVersionGrouped(id, currentContent, row.title, userId, trigger)
  }

  fs.writeFileSync(fullPath, content, "utf-8")
  const newVersion = currentVersion + 1
  const now = new Date().toISOString()
  db.prepare("UPDATE notes SET version = ?, updated_at = ? WHERE id = ?").run(
    newVersion,
    now,
    id
  )

  // Update FTS index
  db.prepare(
    `UPDATE notes_fts SET title = ?, content = ?
     WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)`
  ).run(row.title, content, id)

  return { version: newVersion, content, status: "saved" }
}

export function updateNoteTitle(
  id: string,
  title: string,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT file_path, parent_id FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as
    | { file_path: string; parent_id: string | null }
    | undefined

  if (!row) throw new Error("Note not found")

  const vaultRoot = getVaultPath(vaultId)
  const oldFullPath = safeResolvePath(vaultRoot, row.file_path)
  const dir = path.dirname(row.file_path)

  // Preserve the original file extension
  const isCanvasFile = row.file_path.endsWith(".canvas.json")
  const isExcalidrawFile = row.file_path.endsWith(".excalidraw.json")
  const ext = isCanvasFile ? ".canvas.json" : isExcalidrawFile ? ".excalidraw.json" : ".md"
  const safeNewTitle = title.replace(/[<>:"/\\|?*]/g, "_")
  const newFileName = `${safeNewTitle}${ext}`
  const newFilePath = dir === "." ? newFileName : path.join(dir, newFileName)
  const newFullPath = safeResolvePath(vaultRoot, newFilePath)

  if (oldFullPath !== newFullPath && fs.existsSync(oldFullPath)) {
    fs.renameSync(oldFullPath, newFullPath)
  }

  const oldTitle = row.file_path
    ? path.basename(row.file_path, path.extname(row.file_path))
    : ""

  const now = new Date().toISOString()
  db.prepare(
    "UPDATE notes SET title = ?, file_path = ?, updated_at = ? WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(title, newFilePath, now, id, userId, vaultId)

  recordStructureEvent(vaultId, userId, "note_renamed", "note", id, {
    title: oldTitle,
    filePath: row.file_path,
  }, {
    title,
    filePath: newFilePath,
  })
}

export function deleteNote(
  id: string,
  userId: string,
  vaultId: string,
  hard: boolean = false
): void {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT file_path FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as { file_path: string } | undefined

  if (!row) throw new Error("Note not found")

  // Get note metadata before deletion for event tracking
  const noteInfo = db
    .prepare(
      "SELECT title, parent_id FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as { title: string; parent_id: string | null }

  if (hard) {
    const vaultRoot = getVaultPath(vaultId)
    const fullPath = safeResolvePath(vaultRoot, row.file_path)
    try {
      fs.unlinkSync(fullPath)
    } catch {
      // File already gone
    }
    db.prepare(
      "DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)"
    ).run(id)
    db.prepare(
      "DELETE FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    ).run(id, userId, vaultId)

    recordStructureEvent(vaultId, userId, "note_deleted", "note", id, {
      title: noteInfo.title,
      filePath: row.file_path,
      parentId: noteInfo.parent_id,
    }, null)
  } else {
    const now = new Date().toISOString()
    db.prepare(
      "UPDATE notes SET is_trashed = 1, trashed_at = ? WHERE id = ? AND user_id = ? AND vault_id = ?"
    ).run(now, id, userId, vaultId)

    recordStructureEvent(vaultId, userId, "note_trashed", "note", id, {
      title: noteInfo.title,
      filePath: row.file_path,
      parentId: noteInfo.parent_id,
      isTrashed: false,
    }, {
      isTrashed: true,
    })
  }
}

export function restoreNote(id: string, userId: string, vaultId: string): void {
  const db = getDb()
  db.prepare(
    "UPDATE notes SET is_trashed = 0, trashed_at = NULL WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(id, userId, vaultId)

  recordStructureEvent(vaultId, userId, "note_restored", "note", id, {
    isTrashed: true,
  }, {
    isTrashed: false,
  })
}

export function toggleFavorite(
  id: string,
  userId: string,
  vaultId: string
): boolean {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT is_favorite FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as { is_favorite: number } | undefined

  if (!row) throw new Error("Note not found")

  const newValue = row.is_favorite === 1 ? 0 : 1
  db.prepare(
    "UPDATE notes SET is_favorite = ? WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(newValue, id, userId, vaultId)
  return newValue === 1
}

export function moveNote(
  id: string,
  newParentId: string | null,
  userId: string,
  vaultId: string
): NoteMetadata {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT * FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as Record<string, unknown> | undefined

  if (!row) throw new Error("Note not found")

  const vaultRoot = getVaultPath(vaultId)
  const oldFilePath = row.file_path as string
  const oldFullPath = safeResolvePath(vaultRoot, oldFilePath)
  const fileName = path.basename(oldFilePath)

  let newDir = ""
  if (newParentId) {
    const folder = db
      .prepare(
        "SELECT path FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
      )
      .get(newParentId, userId, vaultId) as { path: string } | undefined
    if (!folder) throw new Error("Target folder not found")
    newDir = folder.path
  }

  const newFilePath = newDir ? path.join(newDir, fileName) : fileName
  const newFullPath = safeResolvePath(vaultRoot, newFilePath)

  if (oldFullPath !== newFullPath) {
    fs.mkdirSync(path.dirname(newFullPath), { recursive: true })
    fs.renameSync(oldFullPath, newFullPath)

    // Also move attachments on disk
    const attachments = db
      .prepare("SELECT id, file_path FROM attachments WHERE note_id = ?")
      .all(id) as { id: string; file_path: string }[]

    for (const att of attachments) {
      const attFileName = path.basename(att.file_path)
      const newAttDir = newDir || ""
      const newAttPath = newAttDir
        ? path.join(newAttDir, attFileName)
        : attFileName
      const oldAttFull = safeResolvePath(vaultRoot, att.file_path)
      const newAttFull = safeResolvePath(vaultRoot, newAttPath)
      if (oldAttFull !== newAttFull && fs.existsSync(oldAttFull)) {
        fs.renameSync(oldAttFull, newAttFull)
        db.prepare("UPDATE attachments SET file_path = ? WHERE id = ?").run(
          newAttPath,
          att.id
        )
      }
    }
  }

  const oldParentId = (row.parent_id as string) || null

  const now = new Date().toISOString()
  db.prepare(
    "UPDATE notes SET parent_id = ?, file_path = ?, updated_at = ? WHERE id = ?"
  ).run(newParentId, newFilePath, now, id)

  recordStructureEvent(vaultId, userId, "note_moved", "note", id, {
    parentId: oldParentId,
    filePath: oldFilePath,
  }, {
    parentId: newParentId,
    filePath: newFilePath,
  })

  return toMetadata(
    db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Record<
      string,
      unknown
    >
  )
}

export function duplicateNote(
  id: string,
  userId: string,
  vaultId: string
): NoteMetadata {
  const note = getNote(id, userId, vaultId)
  if (!note) throw new Error("Note not found")

  const newTitle = `${note.metadata.title} (copy)`
  return createNote(newTitle, userId, vaultId, note.metadata.parentId)
}

export function listNotes(
  userId: string,
  vaultId: string,
  parentId: string | null = null,
  includeTrash: boolean = false
): NoteMetadata[] {
  const db = getDb()
  let query: string
  let params: unknown[]

  if (parentId) {
    query = includeTrash
      ? "SELECT * FROM notes WHERE parent_id = ? AND user_id = ? AND vault_id = ? ORDER BY updated_at DESC"
      : "SELECT * FROM notes WHERE parent_id = ? AND user_id = ? AND vault_id = ? AND is_trashed = 0 ORDER BY updated_at DESC"
    params = [parentId, userId, vaultId]
  } else {
    query = includeTrash
      ? "SELECT * FROM notes WHERE parent_id IS NULL AND user_id = ? AND vault_id = ? ORDER BY updated_at DESC"
      : "SELECT * FROM notes WHERE parent_id IS NULL AND user_id = ? AND vault_id = ? AND is_trashed = 0 ORDER BY updated_at DESC"
    params = [userId, vaultId]
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[]
  return rows.map(toMetadata)
}

export function listAllNotes(
  userId: string,
  vaultId: string,
  includeTrash: boolean = false
): NoteMetadata[] {
  const db = getDb()
  const query = includeTrash
    ? "SELECT * FROM notes WHERE user_id = ? AND vault_id = ? ORDER BY updated_at DESC"
    : "SELECT * FROM notes WHERE user_id = ? AND vault_id = ? AND is_trashed = 0 ORDER BY updated_at DESC"

  const rows = db.prepare(query).all(userId, vaultId) as Record<
    string,
    unknown
  >[]
  return rows.map(toMetadata)
}

export function listTrashedNotes(
  userId: string,
  vaultId: string
): NoteMetadata[] {
  // Auto-purge notes trashed more than 30 days ago
  purgeOldTrashedNotes(userId, vaultId)

  const db = getDb()
  const rows = db
    .prepare(
      "SELECT * FROM notes WHERE is_trashed = 1 AND user_id = ? AND vault_id = ? ORDER BY trashed_at DESC"
    )
    .all(userId, vaultId) as Record<string, unknown>[]
  return rows.map(toMetadata)
}

export function listFavoriteNotes(
  userId: string,
  vaultId: string
): NoteMetadata[] {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT * FROM notes WHERE is_favorite = 1 AND is_trashed = 0 AND user_id = ? AND vault_id = ? ORDER BY updated_at DESC"
    )
    .all(userId, vaultId) as Record<string, unknown>[]
  return rows.map(toMetadata)
}

export function searchNotes(
  query: string,
  userId: string,
  vaultId: string
): NoteMetadata[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT n.* FROM notes n
       JOIN notes_fts fts ON fts.rowid = n.rowid
       WHERE notes_fts MATCH ? AND n.is_trashed = 0 AND n.user_id = ? AND n.vault_id = ?
       ORDER BY rank`
    )
    .all(query, userId, vaultId) as Record<string, unknown>[]
  return rows.map(toMetadata)
}

/**
 * Find notes that link to the given note (linked) or mention its title (unlinked).
 * Scans note content for [[title]] wiki-links, /notes/{id} references, and plain title mentions.
 */
export function getBacklinks(
  noteId: string,
  userId: string,
  vaultId: string
): { id: string; title: string; linked: boolean }[] {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  const target = db
    .prepare(
      "SELECT title FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(noteId, userId, vaultId) as { title: string } | undefined

  if (!target) return []

  const allNotes = db
    .prepare(
      "SELECT id, title, file_path FROM notes WHERE id != ? AND is_trashed = 0 AND user_id = ? AND vault_id = ?"
    )
    .all(noteId, userId, vaultId) as {
    id: string
    title: string
    file_path: string
  }[]

  const results: { id: string; title: string; linked: boolean }[] = []
  const titleLower = target.title.toLowerCase()

  for (const note of allNotes) {
    try {
      const content = fs.readFileSync(
        safeResolvePath(vaultRoot, note.file_path),
        "utf-8"
      )
      const hasWikiLink =
        content.includes(`[[${target.title}]]`) || content.includes(noteId)

      if (hasWikiLink) {
        results.push({ id: note.id, title: note.title, linked: true })
      } else if (
        titleLower.length >= 3 &&
        content.toLowerCase().includes(titleLower)
      ) {
        results.push({ id: note.id, title: note.title, linked: false })
      }
    } catch {}
  }

  return results
}

/**
 * Permanently delete notes that have been in trash for more than TRASH_AUTO_PURGE_DAYS.
 * Called automatically when listing trashed notes.
 */
export function purgeOldTrashedNotes(userId: string, vaultId: string): number {
  const db = getDb()
  const cutoff = new Date(
    Date.now() - TRASH_AUTO_PURGE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const old = db
    .prepare(
      "SELECT id, file_path FROM notes WHERE is_trashed = 1 AND trashed_at < ? AND user_id = ? AND vault_id = ?"
    )
    .all(cutoff, userId, vaultId) as { id: string; file_path: string }[]

  if (old.length === 0) return 0

  const vaultRoot = getVaultPath(vaultId)
  for (const note of old) {
    try {
      fs.unlinkSync(safeResolvePath(vaultRoot, note.file_path))
    } catch {}
    db.prepare(
      "DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)"
    ).run(note.id)
    db.prepare("DELETE FROM notes WHERE id = ?").run(note.id)
  }

  return old.length
}
