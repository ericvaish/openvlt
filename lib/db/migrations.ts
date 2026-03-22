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
  {
    version: 8,
    description:
      "Add sync log, cloud backup, and peer sync tables",
    up: (db) => {
      // Sync log: shared change log for cloud backup and peer sync
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_log (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          vault_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('note', 'folder', 'attachment', 'metadata')),
          entity_id TEXT NOT NULL,
          change_type TEXT NOT NULL CHECK(change_type IN ('create', 'update', 'delete', 'move', 'rename', 'trash', 'restore', 'favorite')),
          payload TEXT,
          content_hash TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          peer_origin TEXT,
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sync_log_vault_seq ON sync_log(vault_id, seq);
        CREATE INDEX IF NOT EXISTS idx_sync_log_entity ON sync_log(entity_id, vault_id);
      `)

      // Cloud provider OAuth credentials
      db.exec(`
        CREATE TABLE IF NOT EXISTS cloud_providers (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL CHECK(provider IN ('google_drive', 'dropbox', 's3', 'webdav')),
          display_name TEXT,
          access_token_enc TEXT,
          refresh_token_enc TEXT,
          token_expires_at TEXT,
          provider_metadata TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, provider)
        );
      `)

      // Backup configuration per vault
      db.exec(`
        CREATE TABLE IF NOT EXISTS backup_configs (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          frequency TEXT NOT NULL DEFAULT 'daily' CHECK(frequency IN ('hourly', 'every_6h', 'every_12h', 'daily', 'weekly')),
          max_versions INTEGER NOT NULL DEFAULT 10,
          backup_key_enc TEXT NOT NULL,
          backup_key_salt TEXT NOT NULL,
          backup_key_server_enc TEXT,
          remote_folder_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (provider_id) REFERENCES cloud_providers(id) ON DELETE CASCADE,
          UNIQUE(vault_id, provider_id)
        );
      `)

      // Backup run history
      db.exec(`
        CREATE TABLE IF NOT EXISTS backup_runs (
          id TEXT PRIMARY KEY,
          config_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed', 'partial')),
          started_at TEXT NOT NULL,
          completed_at TEXT,
          files_uploaded INTEGER NOT NULL DEFAULT 0,
          files_deleted INTEGER NOT NULL DEFAULT 0,
          bytes_uploaded INTEGER NOT NULL DEFAULT 0,
          error_message TEXT,
          last_sync_log_seq INTEGER,
          FOREIGN KEY (config_id) REFERENCES backup_configs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_backup_runs_config ON backup_runs(config_id, started_at);
      `)

      // Backup file index for incremental backups
      db.exec(`
        CREATE TABLE IF NOT EXISTS backup_file_index (
          id TEXT PRIMARY KEY,
          config_id TEXT NOT NULL,
          note_id TEXT,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('note', 'attachment', 'manifest')),
          local_path TEXT NOT NULL,
          remote_file_id TEXT,
          content_hash TEXT NOT NULL,
          encrypted_size INTEGER,
          last_backed_up_at TEXT NOT NULL,
          FOREIGN KEY (config_id) REFERENCES backup_configs(id) ON DELETE CASCADE,
          UNIQUE(config_id, local_path)
        );
        CREATE INDEX IF NOT EXISTS idx_backup_file_index_note ON backup_file_index(config_id, note_id);
      `)

      // Peer sync: this instance's identity (singleton)
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_peers (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)

      // Peer sync: vault pairings with remote instances
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_pairings (
          id TEXT PRIMARY KEY,
          local_vault_id TEXT NOT NULL,
          remote_peer_id TEXT NOT NULL,
          remote_url TEXT NOT NULL,
          shared_secret TEXT NOT NULL,
          sync_mode TEXT NOT NULL DEFAULT 'all' CHECK(sync_mode IN ('all', 'selected')),
          is_active INTEGER NOT NULL DEFAULT 1,
          last_sync_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (local_vault_id) REFERENCES vaults(id) ON DELETE CASCADE
        );
      `)

      // Peer sync: cursor tracking per pairing
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_cursors (
          id TEXT PRIMARY KEY,
          pairing_id TEXT NOT NULL,
          remote_peer_id TEXT NOT NULL,
          last_received_seq INTEGER NOT NULL DEFAULT 0,
          last_sent_seq INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (pairing_id) REFERENCES sync_pairings(id) ON DELETE CASCADE
        );
      `)

      // Peer sync: UUID mapping between instances
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_id_map (
          pairing_id TEXT NOT NULL,
          local_id TEXT NOT NULL,
          remote_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('note', 'folder', 'attachment', 'metadata')),
          PRIMARY KEY (pairing_id, local_id),
          FOREIGN KEY (pairing_id) REFERENCES sync_pairings(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_id_map_remote ON sync_id_map(pairing_id, remote_id);
      `)

      // Peer sync: selective sync choices
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_selections (
          id TEXT PRIMARY KEY,
          pairing_id TEXT NOT NULL,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('folder', 'note')),
          entity_id TEXT NOT NULL,
          FOREIGN KEY (pairing_id) REFERENCES sync_pairings(id) ON DELETE CASCADE
        );
      `)
    },
  },
  {
    version: 9,
    description: "Add page icon and cover image to notes",
    up: (db) => {
      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }
      if (!hasColumn("notes", "icon")) {
        db.exec("ALTER TABLE notes ADD COLUMN icon TEXT")
      }
      if (!hasColumn("notes", "cover_image")) {
        db.exec("ALTER TABLE notes ADD COLUMN cover_image TEXT")
      }
    },
  },
  {
    version: 10,
    description: "Migrate canvas notes from .canvas.json to .openvlt ZIP format",
    up: (db) => {
      const fs = require("fs") as typeof import("fs")
      const path = require("path") as typeof import("path")
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AdmZip = require("adm-zip")

      // Find all canvas notes still using .canvas.json
      const rows = db
        .prepare("SELECT id, file_path, vault_id FROM notes WHERE note_type = 'canvas' AND file_path LIKE '%.canvas.json'")
        .all() as { id: string; file_path: string; vault_id: string }[]

      for (const row of rows) {
        try {
          // Resolve vault path
          const vault = db
            .prepare("SELECT path FROM vaults WHERE id = ?")
            .get(row.vault_id) as { path: string } | undefined
          if (!vault) continue

          const vaultRoot = vault.path
          const oldFullPath = path.resolve(vaultRoot, row.file_path)
          if (!fs.existsSync(oldFullPath)) continue

          // Read old JSON content
          const jsonContent = fs.readFileSync(oldFullPath, "utf-8")
          let data: { document?: object; settings?: object } = {}
          try { data = JSON.parse(jsonContent) } catch { continue }

          // Extract text for FTS
          let textContent = ""
          const store = (data.document as Record<string, unknown>)?.store ?? data.document ?? {}
          if (typeof store === "object" && store !== null) {
            const texts: string[] = []
            for (const key of Object.keys(store)) {
              const record = (store as Record<string, Record<string, unknown>>)[key]
              if (record?.typeName === "shape" && record?.type === "text-note") {
                const props = record.props as Record<string, unknown> | undefined
                const content = props?.content
                if (typeof content === "string" && content.trim()) {
                  texts.push(content.trim())
                }
              }
            }
            textContent = texts.join("\n\n")
          }

          // Create .openvlt ZIP
          const zip = new AdmZip()
          zip.addFile("manifest.json", Buffer.from(JSON.stringify({
            type: "openvlt-canvas",
            version: 2,
            createdAt: new Date().toISOString(),
          })))
          zip.addFile("document.json", Buffer.from(JSON.stringify(data.document ?? {})))
          zip.addFile("settings.json", Buffer.from(JSON.stringify(data.settings ?? {})))
          zip.addFile("content.md", Buffer.from(textContent))

          // New file path
          const newFilePath = row.file_path.replace(/\.canvas\.json$/, ".openvlt")
          const newFullPath = path.resolve(vaultRoot, newFilePath)

          // Write new file first, then remove old
          zip.writeZip(newFullPath)
          fs.unlinkSync(oldFullPath)

          // Update DB
          db.prepare("UPDATE notes SET file_path = ? WHERE id = ?").run(newFilePath, row.id)

          // Update FTS with extracted text
          const noteTitle = (db.prepare("SELECT title FROM notes WHERE id = ?").get(row.id) as { title: string } | undefined)?.title ?? ""
          db.prepare(
            `UPDATE notes_fts SET content = ?
             WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)`
          ).run(textContent || noteTitle, row.id)
        } catch {
          // Skip individual note failures — don't block migration
        }
      }
    },
  },
  {
    version: 11,
    description: "Add database views: property definitions, note properties, view definitions",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS property_definitions (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('text','number','date','select','multi_select','checkbox','url')),
          options TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
          UNIQUE(vault_id, name)
        );

        CREATE TABLE IF NOT EXISTS note_properties (
          note_id TEXT NOT NULL,
          property_id TEXT NOT NULL,
          value_text TEXT,
          value_number REAL,
          PRIMARY KEY (note_id, property_id),
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (property_id) REFERENCES property_definitions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_note_properties_prop ON note_properties(property_id, value_text);
        CREATE INDEX IF NOT EXISTS idx_note_properties_num ON note_properties(property_id, value_number);

        CREATE TABLE IF NOT EXISTS database_views (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          folder_id TEXT,
          view_type TEXT NOT NULL DEFAULT 'table' CHECK(view_type IN ('table','kanban','calendar')),
          config TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );
      `)
    },
  },
  {
    version: 12,
    description: "Add note aliases",
    up: (db) => {
      try {
        db.exec("ALTER TABLE notes ADD COLUMN aliases TEXT")
      } catch {
        // Column may already exist
      }
    },
  },
  {
    version: 13,
    description: "Add synced blocks and inline database support",
    up: (db) => {
      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }

      // Inline databases: link views to their source note
      if (!hasColumn("database_views", "source_note_id")) {
        db.exec("ALTER TABLE database_views ADD COLUMN source_note_id TEXT")
      }

      // Synced blocks: content fragments shared across notes
      db.exec(`
        CREATE TABLE IF NOT EXISTS synced_blocks (
          id TEXT PRIMARY KEY,
          vault_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_synced_blocks_vault ON synced_blocks(vault_id);
      `)

      // Track which notes reference each synced block
      db.exec(`
        CREATE TABLE IF NOT EXISTS synced_block_refs (
          synced_block_id TEXT NOT NULL,
          note_id TEXT NOT NULL,
          PRIMARY KEY (synced_block_id, note_id),
          FOREIGN KEY (synced_block_id) REFERENCES synced_blocks(id) ON DELETE CASCADE,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );
      `)
    },
  },
  {
    version: 14,
    description: "Add two-factor authentication tables",
    up: (db) => {
      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }

      if (!hasColumn("users", "two_factor_enabled")) {
        db.exec(
          "ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0"
        )
      }
      if (!hasColumn("users", "two_factor_methods")) {
        db.exec("ALTER TABLE users ADD COLUMN two_factor_methods TEXT")
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS user_totp (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL UNIQUE,
          secret_enc TEXT NOT NULL,
          verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS recovery_codes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON recovery_codes(user_id);

        CREATE TABLE IF NOT EXISTS pending_2fa_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pending_2fa_user ON pending_2fa_tokens(user_id);
      `)
    },
  },
  {
    version: 15,
    description: "Add device heartbeat tracking",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_heartbeats (
          device_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          browser TEXT,
          os TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_device_heartbeats_user ON device_heartbeats(user_id);
      `)
    },
  },
  {
    version: 16,
    description: "Add AI integration tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_api_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          vault_id TEXT NOT NULL,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          token_prefix TEXT NOT NULL,
          last_used_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_api_tokens_user ON ai_api_tokens(user_id);

        CREATE TABLE IF NOT EXISTS ai_provider_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          api_key_enc TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, provider)
        );

        CREATE TABLE IF NOT EXISTS ai_config (
          user_id TEXT PRIMARY KEY,
          mcp_enabled INTEGER NOT NULL DEFAULT 0,
          chat_enabled INTEGER NOT NULL DEFAULT 0,
          chat_provider TEXT,
          chat_model TEXT,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `)
    },
  },
  {
    version: 17,
    description: "Add note view state table for viewport persistence",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS note_view_state (
          user_id TEXT NOT NULL,
          note_id TEXT NOT NULL,
          scroll_x REAL NOT NULL DEFAULT 0,
          scroll_y REAL NOT NULL DEFAULT 0,
          zoom REAL NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, note_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );
      `)
    },
  },
  {
    version: 18,
    description: "Add AI chat conversations and messages tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          vault_id TEXT NOT NULL,
          title TEXT,
          provider TEXT,
          model TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'generating', 'completed', 'error')),
          usage_input_tokens INTEGER,
          usage_output_tokens INTEGER,
          usage_reasoning_tokens INTEGER,
          usage_cached_tokens INTEGER,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_vault ON ai_conversations(user_id, vault_id, updated_at DESC);

        CREATE TABLE IF NOT EXISTS ai_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
          content TEXT NOT NULL DEFAULT '',
          reasoning TEXT,
          tool_calls TEXT,
          tool_call_id TEXT,
          attachments TEXT,
          seq INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, seq);
      `)
    },
  },
  {
    version: 19,
    description: "Add admin system and instance config",
    up: (db) => {
      const hasColumn = (table: string, column: string) => {
        const cols = db.pragma(`table_info(${table})`) as { name: string }[]
        return cols.some((c) => c.name === column)
      }

      // Add is_admin column to users
      if (!hasColumn("users", "is_admin")) {
        db.exec(
          "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"
        )
      }

      // Create instance_config table
      db.exec(`
        CREATE TABLE IF NOT EXISTS instance_config (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)

      // Handle existing instances: if users already exist, promote the first user
      // and mark setup as complete to preserve current behavior
      const userCount = (
        db
          .prepare("SELECT COUNT(*) as count FROM users")
          .get() as { count: number }
      ).count

      if (userCount > 0) {
        // Set the first user (by created_at) as admin
        db.exec(
          `UPDATE users SET is_admin = 1 WHERE id = (
            SELECT id FROM users ORDER BY created_at ASC LIMIT 1
          )`
        )

        // Mark setup as complete since instance is already in use
        db.prepare(
          "INSERT OR IGNORE INTO instance_config (key, value) VALUES (?, ?)"
        ).run("setup_completed", "true")

        // Preserve current open registration behavior
        db.prepare(
          "INSERT OR IGNORE INTO instance_config (key, value) VALUES (?, ?)"
        ).run("registration_open", "true")
      }
    },
  },
  {
    version: 20,
    description: "Add performance indexes for hot query paths",
    up: (db) => {
      db.exec(`
        -- Notes: queried by (user_id, vault_id) on every list/search call
        CREATE INDEX IF NOT EXISTS idx_notes_user_vault ON notes(user_id, vault_id);
        -- Notes: filtered by is_trashed, sorted by updated_at
        CREATE INDEX IF NOT EXISTS idx_notes_user_vault_active ON notes(user_id, vault_id, is_trashed, updated_at DESC);
        -- Notes: parent folder listing
        CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id, user_id, vault_id);
        -- Notes: favorites listing
        CREATE INDEX IF NOT EXISTS idx_notes_favorites ON notes(user_id, vault_id, is_favorite) WHERE is_favorite = 1 AND is_trashed = 0;
        -- Notes: trash listing
        CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(user_id, vault_id, trashed_at DESC) WHERE is_trashed = 1;

        -- Sessions: token lookup on every API request
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

        -- Note tags: join table queried per note
        CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

        -- Folders: queried by vault
        CREATE INDEX IF NOT EXISTS idx_folders_user_vault ON folders(user_id, vault_id);

        -- Attachments: queried by note
        CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id);

        -- Note versions: queried by note for history
        CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, version_number DESC);

        -- Bookmarks: queried by user + vault
        CREATE INDEX IF NOT EXISTS idx_bookmarks_user_vault ON bookmarks(user_id, vault_id);
      `)
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
