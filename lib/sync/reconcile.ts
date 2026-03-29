import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { getVaultPath } from "@/lib/vaults/service"
import { getMimeType } from "@/lib/folders"

// Throttle: only reconcile a given vault at most once per 2 seconds
const lastReconcile = new Map<string, number>()
const RECONCILE_COOLDOWN_MS = 2000

/**
 * Reconcile the database with what's actually on disk for a given vault.
 * - Remove DB records for files/folders that no longer exist on disk
 * - Add DB records for files/folders that exist on disk but not in DB
 *
 * Pass force=true to bypass the throttle (used by the file watcher).
 */
export function reconcileVault(vaultId: string, force = false): void {
  const now = Date.now()
  const last = lastReconcile.get(vaultId) ?? 0
  if (!force && now - last < RECONCILE_COOLDOWN_MS) return
  lastReconcile.set(vaultId, now)
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  // Get the userId for this vault
  const vault = db
    .prepare("SELECT user_id FROM vaults WHERE id = ?")
    .get(vaultId) as { user_id: string } | undefined
  if (!vault) return

  const userId = vault.user_id

  // --- Phase 1: Remove DB records for items missing from disk ---

  // Check folders
  const dbFolders = db
    .prepare(
      "SELECT id, path FROM folders WHERE user_id = ? AND vault_id = ?"
    )
    .all(userId, vaultId) as { id: string; path: string }[]

  for (const folder of dbFolders) {
    const fullPath = path.join(vaultRoot, folder.path)
    if (!fs.existsSync(fullPath)) {
      // Folder gone from disk — remove from DB (notes in it too)
      db.prepare(
        "DELETE FROM notes_fts WHERE rowid IN (SELECT rowid FROM notes WHERE file_path LIKE ? AND user_id = ? AND vault_id = ?)"
      ).run(`${folder.path}/%`, userId, vaultId)
      db.prepare(
        "DELETE FROM notes_fts WHERE rowid IN (SELECT rowid FROM notes WHERE file_path LIKE ? AND user_id = ? AND vault_id = ?)"
      ).run(`${folder.path}%`, userId, vaultId)
      db.prepare(
        "DELETE FROM attachments WHERE note_id IN (SELECT id FROM notes WHERE file_path LIKE ? AND user_id = ? AND vault_id = ?)"
      ).run(`${folder.path}%`, userId, vaultId)
      db.prepare(
        "DELETE FROM notes WHERE file_path LIKE ? AND user_id = ? AND vault_id = ?"
      ).run(`${folder.path}%`, userId, vaultId)
      db.prepare(
        "DELETE FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
      ).run(folder.id, userId, vaultId)
    }
  }

  // Check notes
  const dbNotes = db
    .prepare(
      "SELECT id, file_path FROM notes WHERE user_id = ? AND vault_id = ?"
    )
    .all(userId, vaultId) as { id: string; file_path: string }[]

  for (const note of dbNotes) {
    const fullPath = path.join(vaultRoot, note.file_path)
    if (!fs.existsSync(fullPath)) {
      // Note file gone from disk — remove from DB
      db.prepare(
        "DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)"
      ).run(note.id)
      db.prepare("DELETE FROM attachments WHERE note_id = ?").run(note.id)
      db.prepare(
        "DELETE FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?"
      ).run(note.id, userId, vaultId)
    }
  }

  // Check attachments
  const dbAttachments = db
    .prepare(
      `SELECT a.id, a.file_path FROM attachments a
       JOIN notes n ON n.id = a.note_id
       WHERE n.user_id = ? AND n.vault_id = ?`
    )
    .all(userId, vaultId) as { id: string; file_path: string }[]

  for (const att of dbAttachments) {
    const fullPath = path.join(vaultRoot, att.file_path)
    if (!fs.existsSync(fullPath)) {
      db.prepare("DELETE FROM attachments WHERE id = ?").run(att.id)
    }
  }

  // --- Phase 2: Add DB records for items on disk but not in DB ---

  // Build a set of known paths for quick lookup
  const knownFolderPaths = new Set(
    (
      db
        .prepare(
          "SELECT path FROM folders WHERE user_id = ? AND vault_id = ?"
        )
        .all(userId, vaultId) as { path: string }[]
    ).map((r) => r.path)
  )

  const knownNotePaths = new Set(
    (
      db
        .prepare(
          "SELECT file_path FROM notes WHERE user_id = ? AND vault_id = ?"
        )
        .all(userId, vaultId) as { file_path: string }[]
    ).map((r) => r.file_path)
  )

  const knownAttachmentPaths = new Set(
    (
      db
        .prepare(
          `SELECT a.file_path FROM attachments a
           JOIN notes n ON n.id = a.note_id
           WHERE n.user_id = ? AND n.vault_id = ?`
        )
        .all(userId, vaultId) as { file_path: string }[]
    ).map((r) => r.file_path)
  )

  // Build a map from note directory to note ID for attachment registration
  const noteDirToId = new Map<string, string>()
  const noteRows = db
    .prepare(
      "SELECT id, file_path FROM notes WHERE user_id = ? AND vault_id = ?"
    )
    .all(userId, vaultId) as { id: string; file_path: string }[]
  for (const row of noteRows) {
    noteDirToId.set(path.dirname(row.file_path), row.id)
  }

  // Recursively scan the vault directory
  scanDirectory(vaultRoot, "", userId, vaultId, knownFolderPaths, knownNotePaths, knownAttachmentPaths, noteDirToId)
}

/** Note file extensions — files matching these are notes, not attachments */
const NOTE_EXTS = new Set([".md", ".json", ".openvlt"])

function scanDirectory(
  vaultRoot: string,
  relativePath: string,
  userId: string,
  vaultId: string,
  knownFolderPaths: Set<string>,
  knownNotePaths: Set<string>,
  knownAttachmentPaths: Set<string>,
  noteDirToId: Map<string, string>
): void {
  const db = getDb()
  const fullPath = relativePath
    ? path.join(vaultRoot, relativePath)
    : vaultRoot

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(fullPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    // Skip hidden files/folders
    if (entry.name.startsWith(".")) continue

    const entryRelative = relativePath
      ? path.join(relativePath, entry.name)
      : entry.name

    if (entry.isDirectory()) {
      // Check if this directory is actually a note's container folder
      // (e.g. Purchase/paddle/ containing paddle.md) — skip folder creation if so
      const isNoteDir = noteDirToId.has(entryRelative) || (() => {
        try {
          const children = fs.readdirSync(path.join(fullPath, entry.name))
          return children.some((c) => {
            const base = path.parse(c).name.replace(/\.excalidraw$/, "")
            return base === entry.name && (c.endsWith(".md") || c.endsWith(".excalidraw.json") || c.endsWith(".openvlt"))
          })
        } catch {
          return false
        }
      })()

      if (!isNoteDir && !knownFolderPaths.has(entryRelative)) {
        // Find parent folder ID
        const parentPath = relativePath || null
        let parentId: string | null = null
        if (parentPath) {
          const parent = db
            .prepare(
              "SELECT id FROM folders WHERE path = ? AND user_id = ? AND vault_id = ?"
            )
            .get(parentPath, userId, vaultId) as { id: string } | undefined
          parentId = parent?.id ?? null
        }

        const folderId = uuid()
        const now = new Date().toISOString()
        db.prepare(
          `INSERT INTO folders (id, name, path, parent_id, user_id, vault_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(folderId, entry.name, entryRelative, parentId, userId, vaultId, now)
        knownFolderPaths.add(entryRelative)
      }

      // Recurse into subdirectory
      scanDirectory(vaultRoot, entryRelative, userId, vaultId, knownFolderPaths, knownNotePaths, knownAttachmentPaths, noteDirToId)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      const isNote =
        entry.name.endsWith(".md") ||
        entry.name.endsWith(".openvlt") ||
        entry.name.endsWith(".excalidraw.json")

      if (isNote && !knownNotePaths.has(entryRelative)) {
        // Register untracked note file
        // If this note is inside its own container dir (e.g. Purchase/paddle/paddle.md),
        // the parent should be the grandparent folder (Purchase), not the note dir
        let lookupPath = relativePath || null
        if (lookupPath && !knownFolderPaths.has(lookupPath)) {
          // Current dir isn't a folder — use its parent instead
          const grandparent = path.dirname(lookupPath)
          lookupPath = grandparent === "." ? null : grandparent
        }
        let parentId: string | null = null
        if (lookupPath) {
          const parent = db
            .prepare(
              "SELECT id FROM folders WHERE path = ? AND user_id = ? AND vault_id = ?"
            )
            .get(lookupPath, userId, vaultId) as { id: string } | undefined
          parentId = parent?.id ?? null
        }

        const noteId = uuid()
        let title: string
        let noteType: string = "markdown"
        if (entry.name.endsWith(".excalidraw.json")) {
          title = entry.name.replace(/\.excalidraw\.json$/, "")
          noteType = "excalidraw"
        } else if (entry.name.endsWith(".openvlt")) {
          title = entry.name.replace(/\.openvlt$/, "")
          noteType = "canvas"
        } else {
          title = entry.name.replace(/\.md$/, "")
        }
        const now = new Date().toISOString()

        let content = ""
        if (noteType === "markdown") {
          try {
            content = fs.readFileSync(path.join(fullPath, entry.name), "utf-8")
          } catch {}
        }

        db.prepare(
          `INSERT INTO notes (id, title, file_path, parent_id, user_id, vault_id, created_at, updated_at, note_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(noteId, title, entryRelative, parentId, userId, vaultId, now, now, noteType)

        db.prepare(
          `INSERT INTO notes_fts (rowid, title, content)
           VALUES ((SELECT rowid FROM notes WHERE id = ?), ?, ?)`
        ).run(noteId, title, content)

        knownNotePaths.add(entryRelative)
        // Track this new note's folder for attachment registration
        noteDirToId.set(relativePath || ".", noteId)
      } else if (
        !isNote &&
        !knownAttachmentPaths.has(entryRelative) &&
        !NOTE_EXTS.has(ext)
      ) {
        // Non-note file: register as attachment if it's inside a note's folder
        const noteId = noteDirToId.get(relativePath || ".")
        if (noteId) {
          const fileFull = path.join(fullPath, entry.name)
          try {
            const stats = fs.statSync(fileFull)
            const mimeType = getMimeType(entry.name)
            const id = uuid()
            const now = new Date().toISOString()

            db.prepare(
              `INSERT INTO attachments (id, note_id, file_name, file_path, mime_type, size_bytes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(id, noteId, entry.name, entryRelative, mimeType, stats.size, now)

            knownAttachmentPaths.add(entryRelative)
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }
}
