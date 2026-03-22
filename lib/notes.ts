import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import matter from "gray-matter"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { recordStructureEvent } from "@/lib/versions/structure-events"
import { appendSyncLog, hashContent } from "@/lib/sync/log"
import { readOpenvltFile, writeOpenvltFile, extractTextFromCanvas, isOpenvltFile } from "@/lib/canvas/openvlt-file"
import { parseFrontmatter, setFrontmatterField } from "@/lib/frontmatter"
import { syncNoteProperties } from "@/lib/properties"
import type { NoteMetadata, NoteType, NoteWithContent, VersionTrigger } from "@/types"

const TRASH_AUTO_PURGE_DAYS = 30

function parseAliases(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((a: unknown) => typeof a === "string" && a) : []
  } catch {
    return []
  }
}

function rowToMetadata(row: Record<string, unknown>, tags: string[] = []): NoteMetadata {
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
    tags,
    version: (row.version as number) ?? 1,
    noteType: (row.note_type as NoteType) ?? "markdown",
    icon: (row.icon as string) || null,
    coverImage: (row.cover_image as string) || null,
    aliases: parseAliases(row.aliases as string | null),
  }
}

/** Load tags for a single note (used for single-note fetches) */
function getTagsForNote(noteId: string): string[] {
  const db = getDb()
  const tagRows = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id
       WHERE nt.note_id = ?`
    )
    .all(noteId) as { name: string }[]
  return tagRows.map((t) => t.name)
}

/** Single note -> metadata (1 tag query) */
function toMetadata(row: Record<string, unknown>): NoteMetadata {
  return rowToMetadata(row, getTagsForNote(row.id as string))
}

/** Batch convert rows to metadata with a single tag query for all notes */
function toMetadataBatch(rows: Record<string, unknown>[]): NoteMetadata[] {
  if (rows.length === 0) return []
  const db = getDb()
  const noteIds = rows.map((r) => r.id as string)

  // Single query to fetch all tags for all notes in the batch
  const placeholders = noteIds.map(() => "?").join(",")
  const tagRows = db
    .prepare(
      `SELECT nt.note_id, t.name FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id
       WHERE nt.note_id IN (${placeholders})`
    )
    .all(...noteIds) as { note_id: string; name: string }[]

  // Group tags by note ID
  const tagMap = new Map<string, string[]>()
  for (const t of tagRows) {
    const arr = tagMap.get(t.note_id)
    if (arr) arr.push(t.name)
    else tagMap.set(t.note_id, [t.name])
  }

  return rows.map((row) =>
    rowToMetadata(row, tagMap.get(row.id as string) ?? [])
  )
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

  let safeTitle = title.replace(/[<>:"/\\|?*]/g, "_")
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
  const isExcalidraw = safeTitle.endsWith(".excalidraw") || noteType === "excalidraw"
  const isCanvas = noteType === "canvas"
  // Ensure excalidraw files have the .excalidraw suffix in the filename
  if (isExcalidraw && !safeTitle.endsWith(".excalidraw")) {
    safeTitle = `${safeTitle}.excalidraw`
  }
  const ext = isExcalidraw ? ".json" : isCanvas ? ".openvlt" : ".md"
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
    version: 2,
    document: {},
    settings: {},
  })
  const defaultExcalidrawContent = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "openvlt",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  })
  const fileContent = initialContent
    ?? (isExcalidraw ? defaultExcalidrawContent : isCanvas ? defaultCanvasContent : `# ${title}\n`)

  if (isCanvas) {
    // Write as .openvlt ZIP using adm-zip (synchronous)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require("adm-zip")
    const zip = new AdmZip()
    const data = JSON.parse(fileContent)
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({ type: "openvlt-canvas", version: 2, createdAt: new Date().toISOString() })))
    zip.addFile("document.json", Buffer.from(JSON.stringify(data.document ?? {})))
    zip.addFile("settings.json", Buffer.from(JSON.stringify(data.settings ?? {})))
    zip.addFile("content.md", Buffer.from(extractTextFromCanvas(fileContent)))
    zip.writeZip(fullPath)
  } else {
    fs.writeFileSync(fullPath, fileContent, "utf-8")
  }

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO notes (id, title, file_path, parent_id, user_id, vault_id, created_at, updated_at, note_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, filePath, parentId, userId, vaultId, now, now, resolvedNoteType)

  // Index for full-text search
  const ftsContent = isExcalidraw ? title : isCanvas ? (extractTextFromCanvas(fileContent) || title) : fileContent
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

  appendSyncLog(vaultId, "note", id, "create", {
    title,
    filePath,
    parentId,
  }, hashContent(fileContent))

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
  const filePath = row.file_path as string
  const fullPath = safeResolvePath(vaultRoot, filePath)
  const metadata = toMetadata(row)

  if (isOpenvltFile(filePath)) {
    // Canvas notes: read from .openvlt ZIP
    let content = ""
    try {
      const result = readOpenvltFile(fullPath)
      content = result.content
    } catch {
      // File may have been deleted externally
    }
    return { metadata, content }
  }

  // Markdown notes: read and parse frontmatter
  let rawContent = ""
  try {
    rawContent = fs.readFileSync(fullPath, "utf-8")
  } catch {
    // File may have been deleted externally
  }

  const { data: frontmatter, content } = parseFrontmatter(rawContent)

  // Frontmatter cover takes priority over SQLite (migration path)
  if (frontmatter.cover) {
    metadata.coverImage = frontmatter.cover as string
  }

  return {
    metadata,
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

  // Read existing frontmatter so we can preserve it when writing back.
  // The editor only sees content (no frontmatter), so we re-prepend it.
  let existingFrontmatter: Record<string, unknown> = {}
  if (!isCanvasOrExcalidraw) {
    try {
      const raw = fs.readFileSync(fullPath, "utf-8")
      existingFrontmatter = parseFrontmatter(raw).data
    } catch {}
  }

  // Helper: wrap editor content with existing frontmatter for disk writes
  function withFrontmatter(editorContent: string): string {
    if (Object.keys(existingFrontmatter).length === 0) return editorContent
    return matter.stringify(editorContent, existingFrontmatter)
  }

  // If baseVersion provided and doesn't match, attempt merge (skip for canvas/excalidraw — not text-mergeable)
  if (!isCanvasOrExcalidraw && baseVersion !== undefined && baseVersion < currentVersion) {
    const { threeWayMerge } =
      require("@/lib/sync/merge") as typeof import("@/lib/sync/merge")
    const { saveVersionGrouped } =
      require("@/lib/versions/grouping") as typeof import("@/lib/versions/grouping")

    // Read current server content (without frontmatter, for merge comparison)
    let serverContent = ""
    try {
      const raw = fs.readFileSync(fullPath, "utf-8")
      serverContent = parseFrontmatter(raw).content
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
      const rawForDisk = withFrontmatter(mergeResult.content)
      saveVersionGrouped(id, serverContent, row.title, userId, "merge")
      fs.writeFileSync(fullPath, rawForDisk, "utf-8")
      const newVersion = currentVersion + 1
      const now = new Date().toISOString()
      db.prepare(
        "UPDATE notes SET version = ?, updated_at = ? WHERE id = ?"
      ).run(newVersion, now, id)
      db.prepare(
        `UPDATE notes_fts SET title = ?, content = ?
         WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)`
      ).run(row.title, mergeResult.content, id)

      appendSyncLog(vaultId, "note", id, "update", {
        title: row.title,
      }, hashContent(rawForDisk))

      // Sync frontmatter properties to index
      try { syncNoteProperties(id, userId, vaultId) } catch {}

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
  const isOpenvlt = isOpenvltFile(row.file_path)
  let currentContent = ""
  try {
    if (isOpenvlt) {
      const result = readOpenvltFile(fullPath)
      currentContent = result.content
    } else {
      const raw = fs.readFileSync(fullPath, "utf-8")
      currentContent = parseFrontmatter(raw).content
    }
  } catch {}

  // Skip save entirely if content hasn't changed
  if (currentContent === content) {
    return { version: currentVersion, content, status: "saved" }
  }

  const { saveVersionGrouped } =
    require("@/lib/versions/grouping") as typeof import("@/lib/versions/grouping")
  saveVersionGrouped(id, currentContent, row.title, userId, trigger)

  let rawForDisk: string
  if (isOpenvlt) {
    // Write as .openvlt ZIP (synchronous via adm-zip)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require("adm-zip")
    const zip = new AdmZip()
    const data = JSON.parse(content)
    zip.addFile("manifest.json", Buffer.from(JSON.stringify({ type: "openvlt-canvas", version: 2, updatedAt: new Date().toISOString() })))
    zip.addFile("document.json", Buffer.from(JSON.stringify(data.document ?? {})))
    zip.addFile("settings.json", Buffer.from(JSON.stringify(data.settings ?? {})))
    zip.addFile("content.md", Buffer.from(extractTextFromCanvas(content)))
    zip.writeZip(fullPath)
    rawForDisk = content
  } else {
    rawForDisk = withFrontmatter(content)
    fs.writeFileSync(fullPath, rawForDisk, "utf-8")
  }
  // Atomic version increment in SQL to prevent race conditions
  const now = new Date().toISOString()
  db.prepare("UPDATE notes SET version = version + 1, updated_at = ? WHERE id = ?").run(
    now,
    id
  )
  const updatedRow = db.prepare("SELECT version FROM notes WHERE id = ?").get(id) as { version: number }
  const newVersion = updatedRow.version

  // Update FTS index — use extracted text for canvas notes, content only (no frontmatter) for markdown
  const ftsContent = isOpenvlt ? (extractTextFromCanvas(content) || row.title) : content
  db.prepare(
    `UPDATE notes_fts SET title = ?, content = ?
     WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)`
  ).run(row.title, ftsContent, id)

  appendSyncLog(vaultId, "note", id, "update", {
    title: row.title,
  }, hashContent(rawForDisk))

  // Sync frontmatter properties to index
  try { syncNoteProperties(id, userId, vaultId) } catch {}

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
  const isOpenvltCanvas = row.file_path.endsWith(".openvlt")
  const isCanvasFile = row.file_path.endsWith(".canvas.json")
  const isExcalidrawFile = row.file_path.endsWith(".excalidraw.json")
  const ext = isOpenvltCanvas ? ".openvlt" : isCanvasFile ? ".canvas.json" : isExcalidrawFile ? ".excalidraw.json" : ".md"
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

  recordStructureEvent(
    vaultId,
    userId,
    "note_renamed",
    "note",
    id,
    {
      title: oldTitle,
      filePath: row.file_path,
    },
    {
      title,
      filePath: newFilePath,
    }
  )

  appendSyncLog(vaultId, "note", id, "rename", {
    oldTitle,
    newTitle: title,
    oldFilePath: row.file_path,
    newFilePath,
  })
}

export function updateNoteIcon(
  id: string,
  icon: string | null,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  db.prepare(
    "UPDATE notes SET icon = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(icon, id, userId, vaultId)
}

export function updateNoteCover(
  id: string,
  coverImage: string | null,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT file_path FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as { file_path: string } | undefined

  if (!row) throw new Error("Note not found")

  // Write cover to frontmatter in the .md file (portable across apps)
  const vaultRoot = getVaultPath(vaultId)
  const fullPath = safeResolvePath(vaultRoot, row.file_path)
  try {
    const raw = fs.readFileSync(fullPath, "utf-8")
    const updated = setFrontmatterField(raw, "cover", coverImage)
    fs.writeFileSync(fullPath, updated, "utf-8")
  } catch {
    // File may not exist; silently skip file update
  }

  // Also update SQLite for backward compatibility and list views
  db.prepare(
    "UPDATE notes SET cover_image = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(coverImage, id, userId, vaultId)
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

    // Use transaction for atomic delete across FTS + notes tables
    const deleteTransaction = db.transaction(() => {
      db.prepare(
        "DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)"
      ).run(id)
      db.prepare(
        "DELETE FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
      ).run(id, userId, vaultId)
    })
    deleteTransaction()

    try {
      fs.unlinkSync(fullPath)
    } catch {
      // File already gone
    }

    recordStructureEvent(
      vaultId,
      userId,
      "note_deleted",
      "note",
      id,
      {
        title: noteInfo.title,
        filePath: row.file_path,
        parentId: noteInfo.parent_id,
      },
      null
    )

    appendSyncLog(vaultId, "note", id, "delete", {
      title: noteInfo.title,
      filePath: row.file_path,
      parentId: noteInfo.parent_id,
    })
  } else {
    const now = new Date().toISOString()
    db.prepare(
      "UPDATE notes SET is_trashed = 1, trashed_at = ? WHERE id = ? AND user_id = ? AND vault_id = ?"
    ).run(now, id, userId, vaultId)

    recordStructureEvent(
      vaultId,
      userId,
      "note_trashed",
      "note",
      id,
      {
        title: noteInfo.title,
        filePath: row.file_path,
        parentId: noteInfo.parent_id,
        isTrashed: false,
      },
      {
        isTrashed: true,
      }
    )

    appendSyncLog(vaultId, "note", id, "trash", {
      title: noteInfo.title,
      filePath: row.file_path,
    })
  }
}

export function restoreNote(id: string, userId: string, vaultId: string): void {
  const db = getDb()
  db.prepare(
    "UPDATE notes SET is_trashed = 0, trashed_at = NULL WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(id, userId, vaultId)

  recordStructureEvent(
    vaultId,
    userId,
    "note_restored",
    "note",
    id,
    {
      isTrashed: true,
    },
    {
      isTrashed: false,
    }
  )

  appendSyncLog(vaultId, "note", id, "restore", null)
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

  appendSyncLog(vaultId, "note", id, "favorite", {
    isFavorite: newValue === 1,
  })

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

  recordStructureEvent(
    vaultId,
    userId,
    "note_moved",
    "note",
    id,
    {
      parentId: oldParentId,
      filePath: oldFilePath,
    },
    {
      parentId: newParentId,
      filePath: newFilePath,
    }
  )

  appendSyncLog(vaultId, "note", id, "move", {
    oldParentId,
    newParentId,
    oldFilePath,
    newFilePath,
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
  includeTrash: boolean = false,
  limit: number = 200,
  offset: number = 0
): NoteMetadata[] {
  const db = getDb()
  let query: string
  let params: unknown[]

  if (parentId) {
    query = includeTrash
      ? "SELECT * FROM notes WHERE parent_id = ? AND user_id = ? AND vault_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
      : "SELECT * FROM notes WHERE parent_id = ? AND user_id = ? AND vault_id = ? AND is_trashed = 0 ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    params = [parentId, userId, vaultId, limit, offset]
  } else {
    query = includeTrash
      ? "SELECT * FROM notes WHERE parent_id IS NULL AND user_id = ? AND vault_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
      : "SELECT * FROM notes WHERE parent_id IS NULL AND user_id = ? AND vault_id = ? AND is_trashed = 0 ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    params = [userId, vaultId, limit, offset]
  }

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[]
  return toMetadataBatch(rows)
}

export function listAllNotes(
  userId: string,
  vaultId: string,
  includeTrash: boolean = false,
  limit: number = 200,
  offset: number = 0
): NoteMetadata[] {
  const db = getDb()
  const query = includeTrash
    ? "SELECT * FROM notes WHERE user_id = ? AND vault_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    : "SELECT * FROM notes WHERE user_id = ? AND vault_id = ? AND is_trashed = 0 ORDER BY updated_at DESC LIMIT ? OFFSET ?"

  const rows = db.prepare(query).all(userId, vaultId, limit, offset) as Record<
    string,
    unknown
  >[]
  return toMetadataBatch(rows)
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
  return toMetadataBatch(rows)
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
  return toMetadataBatch(rows)
}

export function searchNotes(
  query: string,
  userId: string,
  vaultId: string
): NoteMetadata[] {
  const ftsQuery = buildFtsQuery(query)
  if (!ftsQuery) return []
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT n.* FROM notes n
       JOIN notes_fts fts ON fts.rowid = n.rowid
       WHERE notes_fts MATCH ? AND n.is_trashed = 0 AND n.user_id = ? AND n.vault_id = ?
       ORDER BY bm25(notes_fts, 10.0, 1.0)`
    )
    .all(ftsQuery, userId, vaultId) as Record<string, unknown>[]
  return toMetadataBatch(rows)
}

export interface SearchResultWithSnippet {
  id: string
  title: string
  snippet: string
  matchType: "title" | "content"
}

export function searchNotesWithSnippets(
  query: string,
  userId: string,
  vaultId: string,
  limit = 10
): SearchResultWithSnippet[] {
  const ftsQuery = buildFtsQuery(query)
  if (!ftsQuery) return []
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT
         n.id,
         n.title,
         snippet(notes_fts, 1, '<<', '>>', '...', 40) as snippet
       FROM notes n
       JOIN notes_fts fts ON fts.rowid = n.rowid
       WHERE notes_fts MATCH ? AND n.is_trashed = 0 AND n.user_id = ? AND n.vault_id = ?
       ORDER BY bm25(notes_fts, 10.0, 1.0)
       LIMIT ?`
    )
    .all(ftsQuery, userId, vaultId, limit) as {
    id: string
    title: string
    snippet: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    matchType: "content" as const,
  }))
}

/** Build an FTS5 query with prefix matching from a user query string */
function buildFtsQuery(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  // Tokenize, strip FTS5 operators, add prefix * to last token for as-you-type matching
  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/[^\w\u00C0-\u024F]/g, ""))
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return ""
  // Quote each token for safety, add prefix to last
  const parts = tokens.map((t, i) =>
    i === tokens.length - 1 ? `"${t}"*` : `"${t}"`
  )
  return parts.join(" ")
}

/**
 * Find notes that link to the given note (linked) or mention its title (unlinked).
 * Uses FTS index for fast candidate filtering, then verifies with targeted file reads.
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
      "SELECT title, aliases FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(noteId, userId, vaultId) as { title: string; aliases: string | null } | undefined

  if (!target) return []

  const aliases = parseAliases(target.aliases)

  // Build FTS search terms: title, aliases, and note ID
  // Use FTS to find candidate notes instead of reading every file from disk
  const searchTerms = [target.title, noteId, ...aliases].filter((t) => t.length >= 3)
  if (searchTerms.length === 0) return []

  // Query FTS for candidates matching any of the search terms
  const candidateIds = new Set<string>()
  for (const term of searchTerms) {
    // Sanitize term for FTS: remove special chars, wrap in quotes
    const safeTerm = term.replace(/[^\w\u00C0-\u024F-]/g, " ").trim()
    if (!safeTerm) continue
    try {
      const ftsRows = db
        .prepare(
          `SELECT n.id FROM notes n
           JOIN notes_fts fts ON fts.rowid = n.rowid
           WHERE notes_fts MATCH ? AND n.id != ? AND n.is_trashed = 0 AND n.user_id = ? AND n.vault_id = ?
           LIMIT 200`
        )
        .all(`"${safeTerm}"`, noteId, userId, vaultId) as { id: string }[]
      for (const r of ftsRows) candidateIds.add(r.id)
    } catch {
      // FTS query may fail on certain inputs, fall through
    }
  }

  if (candidateIds.size === 0) return []

  // Only read files for candidates (not all notes)
  const results: { id: string; title: string; linked: boolean }[] = []
  const titleLower = target.title.toLowerCase()
  const aliasesLower = aliases.map((a) => a.toLowerCase())

  const placeholders = [...candidateIds].map(() => "?").join(",")
  const candidates = db
    .prepare(
      `SELECT id, title, file_path FROM notes WHERE id IN (${placeholders})`
    )
    .all(...candidateIds) as { id: string; title: string; file_path: string }[]

  for (const note of candidates) {
    try {
      const content = fs.readFileSync(
        safeResolvePath(vaultRoot, note.file_path),
        "utf-8"
      )
      const hasWikiLink =
        content.includes(`[[${target.title}]]`) ||
        content.includes(noteId) ||
        aliases.some((a) => content.includes(`[[${a}]]`))

      if (hasWikiLink) {
        results.push({ id: note.id, title: note.title, linked: true })
      } else {
        const contentLower = content.toLowerCase()
        const hasMention =
          (titleLower.length >= 3 && contentLower.includes(titleLower)) ||
          aliasesLower.some((a) => a.length >= 3 && contentLower.includes(a))
        if (hasMention) {
          results.push({ id: note.id, title: note.title, linked: false })
        }
      }
    } catch {}
  }

  return results
}

export function searchNotesByTitle(
  query: string,
  userId: string,
  vaultId: string
): { id: string; title: string }[] {
  const db = getDb()
  // Search by title or aliases
  const rows = db
    .prepare(
      `SELECT id, title FROM notes
       WHERE (title LIKE ? OR aliases LIKE ?) AND is_trashed = 0 AND user_id = ? AND vault_id = ?
       ORDER BY title
       LIMIT 15`
    )
    .all(`%${query}%`, `%${query}%`, userId, vaultId) as { id: string; title: string }[]
  return rows
}

export function resolveNoteByTitle(
  title: string,
  userId: string,
  vaultId: string
): { id: string; title: string } | null {
  const db = getDb()
  // First try exact title match
  const row = db
    .prepare(
      `SELECT id, title FROM notes
       WHERE title = ? COLLATE NOCASE AND is_trashed = 0 AND user_id = ? AND vault_id = ?`
    )
    .get(title, userId, vaultId) as { id: string; title: string } | undefined
  if (row) return row

  // Then check aliases (stored as JSON arrays)
  const allNotes = db
    .prepare(
      `SELECT id, title, aliases FROM notes
       WHERE aliases IS NOT NULL AND is_trashed = 0 AND user_id = ? AND vault_id = ?`
    )
    .all(userId, vaultId) as { id: string; title: string; aliases: string }[]

  const lowerTitle = title.toLowerCase()
  for (const note of allNotes) {
    const aliases = parseAliases(note.aliases)
    if (aliases.some((a) => a.toLowerCase() === lowerTitle)) {
      return { id: note.id, title: note.title }
    }
  }

  return null
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
