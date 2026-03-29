import type Database from "better-sqlite3"

export function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      recovery_key_hash TEXT,
      active_vault_id TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      two_factor_methods TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(path, user_id)
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      parent_id TEXT,
      user_id TEXT NOT NULL,
      vault_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
      UNIQUE(path, vault_id)
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      parent_id TEXT,
      user_id TEXT NOT NULL,
      vault_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_trashed INTEGER NOT NULL DEFAULT 0,
      trashed_at TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_locked INTEGER NOT NULL DEFAULT 0,
      lock_salt TEXT,
      lock_iv TEXT,
      lock_tag TEXT,
      icon TEXT,
      cover_image TEXT,
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
      UNIQUE(file_path, vault_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL,
      vault_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
      UNIQUE(name, vault_id)
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      content TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      version_number INTEGER NOT NULL,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      title,
      content,
      content_rowid='rowid'
    );

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

    -- Sync log: shared change log for cloud backup and peer sync
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

    -- Cloud provider OAuth credentials
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

    -- Backup configuration per vault
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

    -- Backup run history
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

    -- Backup file index for incremental backups
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

    -- Peer sync: this instance's identity
    CREATE TABLE IF NOT EXISTS sync_peers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Peer sync: vault pairings with remote instances
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

    -- Peer sync: cursor tracking per pairing
    CREATE TABLE IF NOT EXISTS sync_cursors (
      id TEXT PRIMARY KEY,
      pairing_id TEXT NOT NULL,
      remote_peer_id TEXT NOT NULL,
      last_received_seq INTEGER NOT NULL DEFAULT 0,
      last_sent_seq INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (pairing_id) REFERENCES sync_pairings(id) ON DELETE CASCADE
    );

    -- Peer sync: UUID mapping between instances
    CREATE TABLE IF NOT EXISTS sync_id_map (
      pairing_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      remote_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('note', 'folder', 'attachment', 'metadata')),
      PRIMARY KEY (pairing_id, local_id),
      FOREIGN KEY (pairing_id) REFERENCES sync_pairings(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_id_map_remote ON sync_id_map(pairing_id, remote_id);

    -- Peer sync: selective sync choices
    CREATE TABLE IF NOT EXISTS sync_selections (
      id TEXT PRIMARY KEY,
      pairing_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('folder', 'note')),
      entity_id TEXT NOT NULL,
      FOREIGN KEY (pairing_id) REFERENCES sync_pairings(id) ON DELETE CASCADE
    );

    -- Database views: property definitions per vault
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

    -- Database views: indexed property values per note
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

    -- Database views: view definitions
    CREATE TABLE IF NOT EXISTS database_views (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      folder_id TEXT,
      view_type TEXT NOT NULL DEFAULT 'table' CHECK(view_type IN ('table','kanban','calendar')),
      config TEXT NOT NULL DEFAULT '{}',
      source_note_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );

    -- Two-factor authentication
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

    -- Device heartbeats for presence tracking
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

    -- Sync clients: registered openvlt instances that sync with this server
    CREATE TABLE IF NOT EXISTS sync_clients (
      id TEXT PRIMARY KEY,
      instance_name TEXT NOT NULL,
      username TEXT NOT NULL,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Synced blocks: content fragments shared across notes
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

    -- Track which notes reference each synced block
    CREATE TABLE IF NOT EXISTS synced_block_refs (
      synced_block_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      PRIMARY KEY (synced_block_id, note_id),
      FOREIGN KEY (synced_block_id) REFERENCES synced_blocks(id) ON DELETE CASCADE,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );

    -- Instance configuration key-value store
    CREATE TABLE IF NOT EXISTS instance_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}
