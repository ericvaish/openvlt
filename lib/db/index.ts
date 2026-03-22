import Database from "better-sqlite3"
import fs from "fs"
import path from "path"
import { DB_PATH } from "@/lib/constants"
import { initSchema } from "@/lib/db/schema"
import { runMigrations } from "@/lib/db/migrations"

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    db = new Database(DB_PATH)
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
    db.pragma("busy_timeout = 5000")
    db.pragma("synchronous = NORMAL")
    db.pragma("cache_size = -20000") // 20MB cache
    db.pragma("temp_store = MEMORY")
    db.pragma("mmap_size = 268435456") // 256MB mmap
    initSchema(db)
    runMigrations(db)
    autoCleanup(db)
  }
  return db
}

/** Purge trashed notes older than 30 days and prune old versions on startup */
function autoCleanup(database: Database.Database) {
  try {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString()

    // Hard-delete notes trashed more than 30 days ago
    const trashed = database
      .prepare(
        "SELECT id, file_path, vault_id FROM notes WHERE is_trashed = 1 AND trashed_at < ?"
      )
      .all(cutoffStr) as { id: string; file_path: string; vault_id: string }[]

    for (const note of trashed) {
      database
        .prepare(
          "DELETE FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)"
        )
        .run(note.id)
      database.prepare("DELETE FROM attachments WHERE note_id = ?").run(note.id)
      database.prepare("DELETE FROM note_versions WHERE note_id = ?").run(note.id)
      database.prepare("DELETE FROM notes WHERE id = ?").run(note.id)
    }

    // Prune version history older than 365 days
    const versionCutoff = new Date()
    versionCutoff.setDate(versionCutoff.getDate() - 365)
    database
      .prepare("DELETE FROM note_versions WHERE created_at < ?")
      .run(versionCutoff.toISOString())

    // Prune old attachment versions (default 7 days)
    try {
      const { pruneAttachmentVersions } = require("@/lib/versions/attachment-versions")
      pruneAttachmentVersions(7)
    } catch {
      // Table may not exist yet on first run
    }
  } catch {
    // Non-critical — don't block startup
  }
}
