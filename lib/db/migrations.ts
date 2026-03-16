import type Database from "better-sqlite3"

interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema",
    up: () => {
      // Schema is created via initSchema — this is a placeholder
      // for the initial version baseline
    },
  },
  {
    version: 2,
    description: "Add multi-vault support",
    up: (db) => {
      // Only alter tables if the columns don't already exist
      // (fresh DBs already have these from initSchema)
      db.exec(`
        CREATE TABLE IF NOT EXISTS vaults (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(path, user_id)
        );
      `)

      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }

      if (!hasColumn("users", "active_vault_id")) {
        db.exec("ALTER TABLE users ADD COLUMN active_vault_id TEXT")
      }
      if (!hasColumn("folders", "vault_id")) {
        db.exec(
          "ALTER TABLE folders ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE CASCADE"
        )
      }
      if (!hasColumn("notes", "vault_id")) {
        db.exec(
          "ALTER TABLE notes ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE CASCADE"
        )
      }
      if (!hasColumn("tags", "vault_id")) {
        db.exec(
          "ALTER TABLE tags ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE CASCADE"
        )
      }
    },
  },
  {
    version: 3,
    description: "Add version counter to notes for conflict resolution",
    up: (db) => {
      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }
      if (!hasColumn("notes", "version")) {
        db.exec(
          "ALTER TABLE notes ADD COLUMN version INTEGER NOT NULL DEFAULT 1"
        )
      }
    },
  },
  {
    version: 4,
    description: "Add WebAuthn credentials and note templates tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS webauthn_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          credential_id TEXT NOT NULL UNIQUE,
          public_key TEXT NOT NULL,
          counter INTEGER NOT NULL DEFAULT 0,
          device_name TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS note_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `)
    },
  },
  {
    version: 5,
    description: "Add bookmarks table",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS bookmarks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          vault_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('note', 'heading', 'search')),
          target_id TEXT,
          label TEXT NOT NULL,
          data TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );
      `)
    },
  },
  {
    version: 6,
    description: "Add version control system: grouping, structure events, attachment versions",
    up: (db) => {
      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }

      // Extend note_versions with session/grouping metadata
      if (!hasColumn("note_versions", "session_id")) {
        db.exec("ALTER TABLE note_versions ADD COLUMN session_id TEXT")
      }
      if (!hasColumn("note_versions", "is_snapshot")) {
        db.exec(
          "ALTER TABLE note_versions ADD COLUMN is_snapshot INTEGER NOT NULL DEFAULT 1"
        )
      }
      if (!hasColumn("note_versions", "trigger")) {
        db.exec(
          "ALTER TABLE note_versions ADD COLUMN trigger TEXT NOT NULL DEFAULT 'autosave'"
        )
      }

      // Edit session tracking
      db.exec(`
        CREATE TABLE IF NOT EXISTS edit_sessions (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          last_edit_at TEXT NOT NULL,
          ended_at TEXT,
          version_id TEXT,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_edit_sessions_note ON edit_sessions(note_id, started_at);
      `)

      // Structure event log
      db.exec(`
        CREATE TABLE IF NOT EXISTS structure_events (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('note', 'folder', 'attachment')),
          entity_id TEXT NOT NULL,
          from_state TEXT,
          to_state TEXT,
          metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_structure_events_vault_time ON structure_events(vault_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_structure_events_entity ON structure_events(entity_type, entity_id, created_at);
      `)

      // Attachment version history
      db.exec(`
        CREATE TABLE IF NOT EXISTS attachment_versions (
          id TEXT PRIMARY KEY,
          attachment_id TEXT,
          note_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          version_path TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_attachment_versions_att ON attachment_versions(attachment_id, created_at);
      `)

      // User retention settings
      if (!hasColumn("users", "attachment_retention_days")) {
        db.exec(
          "ALTER TABLE users ADD COLUMN attachment_retention_days INTEGER NOT NULL DEFAULT 7"
        )
      }
      if (!hasColumn("users", "version_retention_days")) {
        db.exec(
          "ALTER TABLE users ADD COLUMN version_retention_days INTEGER NOT NULL DEFAULT 365"
        )
      }

      // Backfill: create synthetic structure events for existing notes and folders
      const notes = db
        .prepare("SELECT id, title, file_path, parent_id, vault_id, user_id, created_at FROM notes")
        .all() as {
        id: string
        title: string
        file_path: string
        parent_id: string | null
        vault_id: string
        user_id: string
        created_at: string
      }[]

      const insertEvent = db.prepare(
        `INSERT OR IGNORE INTO structure_events (id, vault_id, user_id, event_type, entity_type, entity_id, from_state, to_state, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )

      const { v4: uuidv4 } = require("uuid")

      for (const note of notes) {
        insertEvent.run(
          uuidv4(),
          note.vault_id,
          note.user_id,
          "note_created",
          "note",
          note.id,
          null,
          JSON.stringify({
            title: note.title,
            filePath: note.file_path,
            parentId: note.parent_id,
          }),
          null,
          note.created_at
        )
      }

      const folders = db
        .prepare("SELECT id, name, path, parent_id, vault_id, user_id, created_at FROM folders")
        .all() as {
        id: string
        name: string
        path: string
        parent_id: string | null
        vault_id: string
        user_id: string
        created_at: string
      }[]

      for (const folder of folders) {
        insertEvent.run(
          uuidv4(),
          folder.vault_id,
          folder.user_id,
          "folder_created",
          "folder",
          folder.id,
          null,
          JSON.stringify({
            name: folder.name,
            path: folder.path,
            parentId: folder.parent_id,
          }),
          null,
          folder.created_at
        )
      }
    },
  },
  {
    version: 7,
    description: "Add note_type column for canvas notes",
    up: (db) => {
      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }
      if (!hasColumn("notes", "note_type")) {
        db.exec(
          "ALTER TABLE notes ADD COLUMN note_type TEXT NOT NULL DEFAULT 'markdown'"
        )
        // Backfill existing Excalidraw notes
        db.exec(
          "UPDATE notes SET note_type = 'excalidraw' WHERE file_path LIKE '%.excalidraw.json'"
        )
      }
    },
  },
]

export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const currentVersion =
    (
      db
        .prepare("SELECT MAX(version) as version FROM schema_version")
        .get() as { version: number | null }
    ).version ?? 0

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      migration.up(db)
      db.prepare(
        "INSERT INTO schema_version (version, description) VALUES (?, ?)"
      ).run(migration.version, migration.description)
    }
  }
}
