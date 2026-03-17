import crypto from "crypto"
import { getDb } from "@/lib/db"
import type { SyncChangeType, SyncEntityType, SyncLogEntry } from "@/types"

/**
 * Append a change to the sync log.
 * Every vault mutation (create, update, delete, move, rename, trash, restore, favorite)
 * should call this alongside recordStructureEvent.
 *
 * The sync log drives both cloud backup (incremental) and peer sync (cursor-based).
 */
export function appendSyncLog(
  vaultId: string,
  entityType: SyncEntityType,
  entityId: string,
  changeType: SyncChangeType,
  payload: Record<string, unknown> | null = null,
  contentHash: string | null = null,
  peerOrigin: string | null = null
): number {
  const db = getDb()
  const now = new Date().toISOString()

  const result = db
    .prepare(
      `INSERT INTO sync_log (vault_id, entity_type, entity_id, change_type, payload, content_hash, created_at, peer_origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      vaultId,
      entityType,
      entityId,
      changeType,
      payload ? JSON.stringify(payload) : null,
      contentHash,
      now,
      peerOrigin
    )

  return result.lastInsertRowid as number
}

/**
 * Get sync log entries for a vault since a given sequence number.
 * Used by both cloud backup and peer sync to fetch incremental changes.
 */
export function getSyncLogSince(
  vaultId: string,
  sinceSeq: number,
  limit: number = 100,
  excludePeerOrigin?: string
): SyncLogEntry[] {
  const db = getDb()

  let query = `SELECT * FROM sync_log WHERE vault_id = ? AND seq > ?`
  const params: unknown[] = [vaultId, sinceSeq]

  if (excludePeerOrigin) {
    query += ` AND (peer_origin IS NULL OR peer_origin != ?)`
    params.push(excludePeerOrigin)
  }

  query += ` ORDER BY seq ASC LIMIT ?`
  params.push(limit)

  const rows = db.prepare(query).all(...params) as {
    seq: number
    vault_id: string
    entity_type: string
    entity_id: string
    change_type: string
    payload: string | null
    content_hash: string | null
    created_at: string
    peer_origin: string | null
  }[]

  return rows.map((r) => ({
    seq: r.seq,
    vaultId: r.vault_id,
    entityType: r.entity_type as SyncEntityType,
    entityId: r.entity_id,
    changeType: r.change_type as SyncChangeType,
    payload: r.payload ? JSON.parse(r.payload) : null,
    contentHash: r.content_hash,
    createdAt: r.created_at,
    peerOrigin: r.peer_origin,
  }))
}

/**
 * Get the current max sequence number for a vault.
 */
export function getMaxSeq(vaultId: string): number {
  const db = getDb()
  const row = db
    .prepare("SELECT MAX(seq) as max_seq FROM sync_log WHERE vault_id = ?")
    .get(vaultId) as { max_seq: number | null }
  return row.max_seq ?? 0
}

/**
 * Compute SHA-256 hash of content for change detection.
 */
export function hashContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

/**
 * Prune old sync log entries. Keeps the last `keepCount` entries per vault.
 */
export function pruneSyncLog(
  vaultId: string,
  keepCount: number = 10000
): number {
  const db = getDb()
  const result = db
    .prepare(
      `DELETE FROM sync_log WHERE vault_id = ? AND seq <= (
        SELECT seq FROM sync_log WHERE vault_id = ?
        ORDER BY seq DESC LIMIT 1 OFFSET ?
      )`
    )
    .run(vaultId, vaultId, keepCount)
  return result.changes
}
