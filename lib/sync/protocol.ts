import fs from "fs"
import path from "path"
import crypto from "crypto"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { signRequest, getPairingSecret } from "@/lib/sync/peer"
import { hashContent } from "@/lib/sync/log"

/**
 * Build a full vault manifest for initial sync.
 */
export function buildVaultManifest(
  vaultId: string
): {
  folders: { id: string; name: string; path: string; parentId: string | null }[]
  notes: { id: string; title: string; filePath: string; contentHash: string; updatedAt: string }[]
  attachments: { id: string; noteId: string; fileName: string; filePath: string; contentHash: string; sizeBytes: number }[]
} {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  const folders = db
    .prepare("SELECT id, name, path, parent_id FROM folders WHERE vault_id = ?")
    .all(vaultId) as { id: string; name: string; path: string; parent_id: string | null }[]

  const notes = db
    .prepare(
      "SELECT id, title, file_path, updated_at FROM notes WHERE vault_id = ? AND is_trashed = 0"
    )
    .all(vaultId) as { id: string; title: string; file_path: string; updated_at: string }[]

  const notesWithHash = notes.map((n) => {
    let contentHashVal = ""
    try {
      const content = fs.readFileSync(safeResolvePath(vaultRoot, n.file_path))
      contentHashVal = hashContent(content)
    } catch {}
    return {
      id: n.id,
      title: n.title,
      filePath: n.file_path,
      contentHash: contentHashVal,
      updatedAt: n.updated_at,
    }
  })

  const attachments = db
    .prepare(
      `SELECT a.id, a.note_id, a.file_name, a.file_path, a.size_bytes
       FROM attachments a JOIN notes n ON n.id = a.note_id
       WHERE n.vault_id = ? AND n.is_trashed = 0`
    )
    .all(vaultId) as { id: string; note_id: string; file_name: string; file_path: string; size_bytes: number }[]

  const attachmentsWithHash = attachments.map((a) => {
    let contentHashVal = ""
    try {
      const content = fs.readFileSync(safeResolvePath(vaultRoot, a.file_path))
      contentHashVal = hashContent(content)
    } catch {}
    return {
      id: a.id,
      noteId: a.note_id,
      fileName: a.file_name,
      filePath: a.file_path,
      contentHash: contentHashVal,
      sizeBytes: a.size_bytes,
    }
  })

  return {
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      path: f.path,
      parentId: f.parent_id,
    })),
    notes: notesWithHash,
    attachments: attachmentsWithHash,
  }
}

/**
 * Read file content for a specific entity (note or attachment).
 */
export function getEntityContent(
  vaultId: string,
  entityId: string,
  entityType: "note" | "attachment"
): Buffer | null {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  if (entityType === "note") {
    const row = db
      .prepare("SELECT file_path FROM notes WHERE id = ? AND vault_id = ?")
      .get(entityId, vaultId) as { file_path: string } | undefined
    if (!row) return null
    try {
      return fs.readFileSync(safeResolvePath(vaultRoot, row.file_path))
    } catch {
      return null
    }
  }

  if (entityType === "attachment") {
    const row = db
      .prepare(
        `SELECT a.file_path FROM attachments a
         JOIN notes n ON n.id = a.note_id
         WHERE a.id = ? AND n.vault_id = ?`
      )
      .get(entityId, vaultId) as { file_path: string } | undefined
    if (!row) return null
    try {
      return fs.readFileSync(safeResolvePath(vaultRoot, row.file_path))
    } catch {
      return null
    }
  }

  return null
}

/**
 * Make a signed HTTP request to a remote peer.
 */
export async function peerFetch(
  pairingId: string,
  localPeerId: string,
  remoteUrl: string,
  reqPath: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const method = options.method || "GET"
  const bodyStr = options.body ? JSON.stringify(options.body) : ""
  const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("hex")
  const timestamp = new Date().toISOString()
  const secret = getPairingSecret(pairingId)
  const signature = signRequest(secret, method, reqPath, timestamp, bodyHash)

  const url = `${remoteUrl}${reqPath}`
  const headers: Record<string, string> = {
    "X-Peer-Id": localPeerId,
    "X-Peer-Pairing-Id": pairingId,
    "X-Peer-Timestamp": timestamp,
    "X-Peer-Signature": signature,
    "Content-Type": "application/json",
  }

  return fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
  })
}
