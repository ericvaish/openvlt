import crypto from "crypto"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { encryptToken, decryptToken } from "@/lib/backup/token-store"
import type { SyncPairing, SyncPeer } from "@/types"

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get or create this instance's peer identity (singleton).
 */
export function getLocalPeer(): SyncPeer {
  const db = getDb()
  const existing = db.prepare("SELECT * FROM sync_peers LIMIT 1").get() as {
    id: string
    display_name: string
    created_at: string
  } | undefined

  if (existing) {
    return {
      id: existing.id,
      displayName: existing.display_name,
      createdAt: existing.created_at,
    }
  }

  // Create a new peer identity
  const id = uuid()
  const now = new Date().toISOString()
  const displayName = `openvlt-${id.slice(0, 8)}`

  db.prepare(
    "INSERT INTO sync_peers (id, display_name, created_at) VALUES (?, ?, ?)"
  ).run(id, displayName, now)

  return { id, displayName, createdAt: now }
}

/**
 * Update this instance's display name.
 */
export function updatePeerName(name: string): void {
  const db = getDb()
  db.prepare("UPDATE sync_peers SET display_name = ?").run(name)
}

/**
 * Create a pairing from an accepted pairing request.
 * Returns the shared secret and pairing ID.
 */
export function createPairing(
  localVaultId: string,
  remotePeerId: string,
  remoteUrl: string,
  syncMode: "all" | "selected" = "all"
): { pairingId: string; sharedSecret: string } {
  const db = getDb()
  const pairingId = uuid()
  const sharedSecret = crypto.randomBytes(32).toString("hex")
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO sync_pairings (id, local_vault_id, remote_peer_id, remote_url, shared_secret, sync_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    pairingId,
    localVaultId,
    remotePeerId,
    remoteUrl,
    encryptToken(sharedSecret),
    syncMode,
    now
  )

  // Initialize cursor
  const cursorId = uuid()
  db.prepare(
    `INSERT INTO sync_cursors (id, pairing_id, remote_peer_id, last_received_seq, last_sent_seq, updated_at)
     VALUES (?, ?, ?, 0, 0, ?)`
  ).run(cursorId, pairingId, remotePeerId, now)

  return { pairingId, sharedSecret }
}

/**
 * Accept a pairing request from a remote peer and store it locally.
 * Used when this instance initiates the pairing and receives the response.
 */
export function storePairing(
  pairingId: string,
  localVaultId: string,
  remotePeerId: string,
  remoteUrl: string,
  sharedSecret: string,
  syncMode: "all" | "selected" = "all"
): void {
  const db = getDb()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO sync_pairings (id, local_vault_id, remote_peer_id, remote_url, shared_secret, sync_mode, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    pairingId,
    localVaultId,
    remotePeerId,
    remoteUrl,
    encryptToken(sharedSecret),
    syncMode,
    now
  )

  const cursorId = uuid()
  db.prepare(
    `INSERT INTO sync_cursors (id, pairing_id, remote_peer_id, last_received_seq, last_sent_seq, updated_at)
     VALUES (?, ?, ?, 0, 0, ?)`
  ).run(cursorId, pairingId, remotePeerId, now)
}

/**
 * List active pairings for a vault.
 */
export function getActivePairings(vaultId: string): SyncPairing[] {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT * FROM sync_pairings WHERE local_vault_id = ? AND is_active = 1"
    )
    .all(vaultId) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    localVaultId: r.local_vault_id as string,
    remotePeerId: r.remote_peer_id as string,
    remoteUrl: r.remote_url as string,
    syncMode: r.sync_mode as "all" | "selected",
    isActive: (r.is_active as number) === 1,
    lastSyncAt: (r.last_sync_at as string) || null,
    createdAt: r.created_at as string,
  }))
}

/**
 * List all pairings (active and inactive).
 */
export function listAllPairings(): SyncPairing[] {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM sync_pairings").all() as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    localVaultId: r.local_vault_id as string,
    remotePeerId: r.remote_peer_id as string,
    remoteUrl: r.remote_url as string,
    syncMode: r.sync_mode as "all" | "selected",
    isActive: (r.is_active as number) === 1,
    lastSyncAt: (r.last_sync_at as string) || null,
    createdAt: r.created_at as string,
  }))
}

/**
 * List pairings scoped to vaults owned by a specific user.
 */
export function listPairingsForUser(userId: string): SyncPairing[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT sp.* FROM sync_pairings sp
       JOIN vaults v ON v.id = sp.local_vault_id
       WHERE v.user_id = ?`
    )
    .all(userId) as Record<string, unknown>[]

  return rows.map((r) => ({
    id: r.id as string,
    localVaultId: r.local_vault_id as string,
    remotePeerId: r.remote_peer_id as string,
    remoteUrl: r.remote_url as string,
    syncMode: r.sync_mode as "all" | "selected",
    isActive: (r.is_active as number) === 1,
    lastSyncAt: (r.last_sync_at as string) || null,
    createdAt: r.created_at as string,
  }))
}

/**
 * Revoke (deactivate) a pairing.
 */
export function revokePairing(pairingId: string): void {
  const db = getDb()
  db.prepare("UPDATE sync_pairings SET is_active = 0 WHERE id = ?").run(
    pairingId
  )
}

/**
 * Get the shared secret for a pairing.
 */
export function getPairingSecret(pairingId: string): string {
  const db = getDb()
  const row = db
    .prepare("SELECT shared_secret FROM sync_pairings WHERE id = ?")
    .get(pairingId) as { shared_secret: string } | undefined

  if (!row) throw new Error("Pairing not found")
  return decryptToken(row.shared_secret)
}

/**
 * Sign a request with HMAC-SHA256 using the shared secret.
 */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  bodyHash: string
): string {
  const payload = `${method}\n${path}\n${timestamp}\n${bodyHash}`
  return crypto.createHmac("sha256", secret).update(payload).digest("hex")
}

/**
 * Verify an HMAC-signed request from a remote peer.
 */
export function verifyPeerRequest(
  pairingId: string,
  peerId: string,
  method: string,
  reqPath: string,
  timestamp: string,
  bodyHash: string,
  signature: string
): boolean {
  const db = getDb()
  const pairing = db
    .prepare(
      "SELECT shared_secret, remote_peer_id, is_active FROM sync_pairings WHERE id = ?"
    )
    .get(pairingId) as {
    shared_secret: string
    remote_peer_id: string
    is_active: number
  } | undefined

  if (!pairing || !pairing.is_active) return false
  if (pairing.remote_peer_id !== peerId) return false

  // Check timestamp freshness (replay protection)
  const ts = new Date(timestamp).getTime()
  if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) return false

  const secret = decryptToken(pairing.shared_secret)
  const expected = signRequest(secret, method, reqPath, timestamp, bodyHash)
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  )
}

/**
 * Get sync cursor for a pairing.
 */
export function getSyncCursor(
  pairingId: string
): { lastReceivedSeq: number; lastSentSeq: number } | null {
  const db = getDb()
  const row = db
    .prepare("SELECT last_received_seq, last_sent_seq FROM sync_cursors WHERE pairing_id = ?")
    .get(pairingId) as { last_received_seq: number; last_sent_seq: number } | undefined

  if (!row) return null
  return {
    lastReceivedSeq: row.last_received_seq,
    lastSentSeq: row.last_sent_seq,
  }
}

/**
 * Update sync cursor after receiving changes.
 */
export function updateSyncCursor(
  pairingId: string,
  updates: { lastReceivedSeq?: number; lastSentSeq?: number }
): void {
  const db = getDb()
  const now = new Date().toISOString()
  const sets: string[] = ["updated_at = ?"]
  const params: unknown[] = [now]

  if (updates.lastReceivedSeq !== undefined) {
    sets.push("last_received_seq = ?")
    params.push(updates.lastReceivedSeq)
  }
  if (updates.lastSentSeq !== undefined) {
    sets.push("last_sent_seq = ?")
    params.push(updates.lastSentSeq)
  }

  params.push(pairingId)
  db.prepare(
    `UPDATE sync_cursors SET ${sets.join(", ")} WHERE pairing_id = ?`
  ).run(...params)

  // Also update last_sync_at on the pairing
  db.prepare(
    "UPDATE sync_pairings SET last_sync_at = ? WHERE id = ?"
  ).run(now, pairingId)
}
