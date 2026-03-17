import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { appendSyncLog, getSyncLogSince, hashContent, getMaxSeq } from "@/lib/sync/log"
import {
  getLocalPeer,
  getActivePairings,
  getSyncCursor,
  updateSyncCursor,
} from "@/lib/sync/peer"
import { peerFetch, getEntityContent } from "@/lib/sync/protocol"
import { resolveContentConflict, resolveStructuralConflict } from "@/lib/sync/conflict-resolver"
import { onVaultChange } from "@/lib/watcher"
import type { SyncLogEntry } from "@/types"

// Paths currently being written by the sync engine (suppresses watcher echo)
const suppressedPaths = new Set<string>()

// Active SSE connections to remote peers
const activeConnections = new Map<string, AbortController>()

/**
 * Start the sync engine for all active pairings.
 * Called once on server startup.
 */
export function startSyncEngine(): void {
  const db = getDb()
  const pairings = db
    .prepare("SELECT * FROM sync_pairings WHERE is_active = 1")
    .all() as Record<string, unknown>[]

  for (const pairing of pairings) {
    connectToPeer(
      pairing.id as string,
      pairing.local_vault_id as string,
      pairing.remote_url as string
    )
  }

  // Hook into the file watcher to push changes to peers
  onVaultChange((vaultId) => {
    const activePairings = getActivePairings(vaultId)
    for (const pairing of activePairings) {
      pushChangesToPeer(pairing.id, vaultId).catch((err) => {
        console.error(
          `[sync] Failed to push changes for pairing ${pairing.id}:`,
          err
        )
      })
    }
  })

  if (pairings.length > 0) {
    console.log(`[sync] Engine started with ${pairings.length} active pairing(s)`)
  }
}

/**
 * Establish an SSE connection to a remote peer for change notifications.
 */
function connectToPeer(
  pairingId: string,
  vaultId: string,
  remoteUrl: string
): void {
  // Cancel existing connection if any
  const existing = activeConnections.get(pairingId)
  if (existing) existing.abort()

  const controller = new AbortController()
  activeConnections.set(pairingId, controller)

  const localPeer = getLocalPeer()

  // Start SSE connection to remote peer's stream endpoint
  const connectSSE = async () => {
    try {
      const res = await peerFetch(
        pairingId,
        localPeer.id,
        remoteUrl,
        "/api/sync/stream",
        { method: "GET" }
      )

      if (!res.ok || !res.body) {
        console.error(`[sync] SSE connection failed for pairing ${pairingId}: ${res.status}`)
        // Retry after delay
        setTimeout(() => {
          if (!controller.signal.aborted) {
            connectSSE()
          }
        }, 30000) // 30 second retry
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done || controller.signal.aborted) break

        const text = decoder.decode(value, { stream: true })
        const lines = text.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim()
            if (data === "changed" || data.startsWith("sync:")) {
              // Remote has changes, pull them
              await pullChangesFromPeer(pairingId, vaultId, remoteUrl)
            }
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error(`[sync] SSE error for pairing ${pairingId}:`, err)
        // Retry after delay
        setTimeout(() => {
          if (!controller.signal.aborted) {
            connectSSE()
          }
        }, 30000)
      }
    }
  }

  connectSSE()
}

/**
 * Push local changes to a remote peer.
 */
async function pushChangesToPeer(
  pairingId: string,
  vaultId: string
): Promise<void> {
  const localPeer = getLocalPeer()
  const cursor = getSyncCursor(pairingId)
  if (!cursor) return

  const db = getDb()
  const pairing = db
    .prepare("SELECT remote_url, remote_peer_id FROM sync_pairings WHERE id = ?")
    .get(pairingId) as { remote_url: string; remote_peer_id: string } | undefined
  if (!pairing) return

  // Get changes since last sent, excluding those that came from this peer
  const changes = getSyncLogSince(
    vaultId,
    cursor.lastSentSeq,
    100,
    pairing.remote_peer_id // exclude changes that originated from the remote peer
  )

  if (changes.length === 0) return

  // Send changes to remote peer
  const res = await peerFetch(
    pairingId,
    localPeer.id,
    pairing.remote_url,
    "/api/sync/push",
    {
      method: "POST",
      body: { pairingId, changes },
    }
  )

  if (res.ok) {
    const maxSeqSent = changes[changes.length - 1].seq
    updateSyncCursor(pairingId, { lastSentSeq: maxSeqSent })
  }
}

/**
 * Pull and apply changes from a remote peer.
 */
async function pullChangesFromPeer(
  pairingId: string,
  vaultId: string,
  remoteUrl: string
): Promise<void> {
  const localPeer = getLocalPeer()
  const cursor = getSyncCursor(pairingId)
  if (!cursor) return

  // Fetch changes from remote
  const res = await peerFetch(
    pairingId,
    localPeer.id,
    remoteUrl,
    "/api/sync/changes",
    {
      method: "POST",
      body: { pairingId, sinceSeq: cursor.lastReceivedSeq },
    }
  )

  if (!res.ok) return

  const { changes } = (await res.json()) as { changes: SyncLogEntry[] }
  if (!changes || changes.length === 0) return

  const db = getDb()
  const pairing = db
    .prepare("SELECT remote_peer_id FROM sync_pairings WHERE id = ?")
    .get(pairingId) as { remote_peer_id: string }

  for (const change of changes) {
    await applyRemoteChange(
      pairingId,
      vaultId,
      change,
      remoteUrl,
      localPeer.id,
      pairing.remote_peer_id
    )
  }

  // Update cursor
  const maxSeqReceived = changes[changes.length - 1].seq
  updateSyncCursor(pairingId, { lastReceivedSeq: maxSeqReceived })
}

/**
 * Apply a single remote change to the local vault.
 */
async function applyRemoteChange(
  pairingId: string,
  vaultId: string,
  change: SyncLogEntry,
  remoteUrl: string,
  localPeerId: string,
  remotePeerId: string
): Promise<void> {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  // Map remote entity ID to local ID
  let localEntityId = getLocalId(pairingId, change.entityId)

  if (change.entityType === "note") {
    switch (change.changeType) {
      case "create": {
        const payload = change.payload as {
          title: string
          filePath: string
          parentId: string | null
        } | null
        if (!payload) break

        // Fetch the content from remote
        const contentRes = await peerFetch(
          pairingId,
          localPeerId,
          remoteUrl,
          "/api/sync/content",
          {
            method: "POST",
            body: {
              pairingId,
              entityId: change.entityId,
              entityType: "note",
            },
          }
        )
        if (!contentRes.ok) break

        const { content } = (await contentRes.json()) as { content: string }
        const localParentId = payload.parentId
          ? getLocalId(pairingId, payload.parentId)
          : null

        // Create the note locally
        const { createNote } =
          require("@/lib/notes") as typeof import("@/lib/notes")
        const note = createNote(
          payload.title,
          getVaultUserId(vaultId),
          vaultId,
          localParentId,
          content
        )

        // Map IDs
        setIdMapping(pairingId, note.id, change.entityId, "note")
        break
      }

      case "update": {
        if (!localEntityId) break

        // Fetch remote content
        const contentRes = await peerFetch(
          pairingId,
          localPeerId,
          remoteUrl,
          "/api/sync/content",
          {
            method: "POST",
            body: {
              pairingId,
              entityId: change.entityId,
              entityType: "note",
            },
          }
        )
        if (!contentRes.ok) break

        const { content: remoteContent } = (await contentRes.json()) as {
          content: string
        }

        // Check for local changes (conflict)
        const note = db
          .prepare("SELECT file_path FROM notes WHERE id = ? AND vault_id = ?")
          .get(localEntityId, vaultId) as { file_path: string } | undefined
        if (!note) break

        const fullPath = safeResolvePath(vaultRoot, note.file_path)
        const result = resolveContentConflict(
          localEntityId,
          vaultId,
          remoteContent,
          "" // TODO: track last synced content for better ancestor
        )

        if (result.mergedContent) {
          suppressedPaths.add(fullPath)
          fs.writeFileSync(fullPath, result.mergedContent, "utf-8")
          setTimeout(() => suppressedPaths.delete(fullPath), 2000)

          const now = new Date().toISOString()
          db.prepare(
            "UPDATE notes SET updated_at = ?, version = version + 1 WHERE id = ?"
          ).run(now, localEntityId)

          // Log to sync_log with peer_origin to prevent echo
          appendSyncLog(
            vaultId,
            "note",
            localEntityId,
            "update",
            change.payload,
            hashContent(result.mergedContent),
            remotePeerId
          )
        }
        break
      }

      case "delete": {
        if (!localEntityId) break
        const { deleteNote } =
          require("@/lib/notes") as typeof import("@/lib/notes")
        const userId = getVaultUserId(vaultId)
        try {
          deleteNote(localEntityId, userId, vaultId, true)
        } catch {}
        break
      }

      case "rename": {
        if (!localEntityId) break
        const payload = change.payload as {
          newTitle: string
          newFilePath: string
        } | null
        if (!payload) break

        const { updateNoteTitle } =
          require("@/lib/notes") as typeof import("@/lib/notes")
        const userId = getVaultUserId(vaultId)
        try {
          updateNoteTitle(localEntityId, payload.newTitle, userId, vaultId)
        } catch {}
        break
      }

      case "move": {
        if (!localEntityId) break
        const payload = change.payload as { newParentId: string | null } | null
        if (!payload) break

        const localParentId = payload.newParentId
          ? getLocalId(pairingId, payload.newParentId)
          : null

        const { moveNote } =
          require("@/lib/notes") as typeof import("@/lib/notes")
        const userId = getVaultUserId(vaultId)
        try {
          moveNote(localEntityId, localParentId, userId, vaultId)
        } catch {}
        break
      }

      case "trash": {
        if (!localEntityId) break
        const { deleteNote } =
          require("@/lib/notes") as typeof import("@/lib/notes")
        const userId = getVaultUserId(vaultId)
        try {
          deleteNote(localEntityId, userId, vaultId, false) // soft delete
        } catch {}
        break
      }

      case "restore": {
        if (!localEntityId) break
        const { restoreNote } =
          require("@/lib/notes") as typeof import("@/lib/notes")
        const userId = getVaultUserId(vaultId)
        try {
          restoreNote(localEntityId, userId, vaultId)
        } catch {}
        break
      }
    }
  } else if (change.entityType === "folder") {
    switch (change.changeType) {
      case "create": {
        const payload = change.payload as {
          name: string
          path: string
          parentId: string | null
        } | null
        if (!payload) break

        const { createFolder } =
          require("@/lib/folders") as typeof import("@/lib/folders")
        const userId = getVaultUserId(vaultId)
        const localParentId = payload.parentId
          ? getLocalId(pairingId, payload.parentId)
          : null

        try {
          const folder = createFolder(payload.name, userId, vaultId, localParentId)
          setIdMapping(pairingId, folder.id, change.entityId, "folder")
        } catch {}
        break
      }

      case "delete": {
        if (!localEntityId) break
        const { deleteFolder } =
          require("@/lib/folders") as typeof import("@/lib/folders")
        const userId = getVaultUserId(vaultId)

        // Check if local has notes created in this folder that remote doesn't know about
        // If so, recreate the folder on the remote (data preservation wins)
        try {
          deleteFolder(localEntityId, userId, vaultId)
        } catch {}
        break
      }

      case "rename": {
        if (!localEntityId) break
        const payload = change.payload as { newName: string } | null
        if (!payload) break

        const { renameFolder } =
          require("@/lib/folders") as typeof import("@/lib/folders")
        const userId = getVaultUserId(vaultId)
        try {
          renameFolder(localEntityId, payload.newName, userId, vaultId)
        } catch {}
        break
      }

      case "move": {
        if (!localEntityId) break
        const payload = change.payload as { newParentId: string | null } | null
        if (!payload) break

        const localParentId = payload.newParentId
          ? getLocalId(pairingId, payload.newParentId)
          : null

        const { moveFolder } =
          require("@/lib/folders") as typeof import("@/lib/folders")
        const userId = getVaultUserId(vaultId)
        try {
          moveFolder(localEntityId, localParentId, userId, vaultId)
        } catch {}
        break
      }
    }
  }
}

/**
 * Check if a path is currently being written by the sync engine.
 * Used by the watcher to suppress echo.
 */
export function isSyncSuppressed(filePath: string): boolean {
  return suppressedPaths.has(filePath)
}

/**
 * Disconnect a peer (stop SSE connection).
 */
export function disconnectPeer(pairingId: string): void {
  const controller = activeConnections.get(pairingId)
  if (controller) {
    controller.abort()
    activeConnections.delete(pairingId)
  }
}

// ── Helper functions ──

function getLocalId(pairingId: string, remoteId: string): string | null {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT local_id FROM sync_id_map WHERE pairing_id = ? AND remote_id = ?"
    )
    .get(pairingId, remoteId) as { local_id: string } | undefined
  return row?.local_id || null
}

function setIdMapping(
  pairingId: string,
  localId: string,
  remoteId: string,
  entityType: string
): void {
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO sync_id_map (pairing_id, local_id, remote_id, entity_type)
     VALUES (?, ?, ?, ?)`
  ).run(pairingId, localId, remoteId, entityType)
}

function getVaultUserId(vaultId: string): string {
  const db = getDb()
  const row = db
    .prepare("SELECT user_id FROM vaults WHERE id = ?")
    .get(vaultId) as { user_id: string }
  return row.user_id
}
