import fs from "fs"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { buildVaultManifest, peerFetch, getEntityContent } from "@/lib/sync/protocol"
import { getLocalPeer, updateSyncCursor } from "@/lib/sync/peer"
import { getMaxSeq, hashContent } from "@/lib/sync/log"

interface RemoteManifest {
  folders: { id: string; name: string; path: string; parentId: string | null }[]
  notes: { id: string; title: string; filePath: string; contentHash: string; updatedAt: string }[]
  attachments: { id: string; noteId: string; fileName: string; filePath: string; contentHash: string; sizeBytes: number }[]
}

/**
 * Perform initial sync between two vaults when a new pairing is established.
 * Compares manifests, transfers missing items, and builds the ID mapping.
 */
export async function performInitialSync(
  pairingId: string,
  vaultId: string,
  remoteUrl: string
): Promise<{ sent: number; received: number; conflicts: number }> {
  const localPeer = getLocalPeer()
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  // Get local manifest
  const localManifest = buildVaultManifest(vaultId)

  // Get remote manifest
  const res = await peerFetch(
    pairingId,
    localPeer.id,
    remoteUrl,
    "/api/sync/manifest",
    { method: "POST", body: { pairingId } }
  )

  if (!res.ok) {
    throw new Error(`Failed to get remote manifest: ${res.status}`)
  }

  const remoteManifest = (await res.json()) as RemoteManifest

  let sent = 0
  let received = 0
  let conflicts = 0

  // Build path-based maps for matching
  const localNotesByPath = new Map(localManifest.notes.map((n) => [n.filePath, n]))
  const remoteNotesByPath = new Map(remoteManifest.notes.map((n) => [n.filePath, n]))
  const localFoldersByPath = new Map(localManifest.folders.map((f) => [f.path, f]))
  const remoteFoldersByPath = new Map(remoteManifest.folders.map((f) => [f.path, f]))

  // 1. Process folders first (create missing ones)
  // Remote-only folders: create locally
  for (const [folderPath, remoteFolder] of remoteFoldersByPath) {
    if (!localFoldersByPath.has(folderPath)) {
      const { createFolder } =
        require("@/lib/folders") as typeof import("@/lib/folders")
      const userId = getVaultUserId(vaultId)
      const localParentId = remoteFolder.parentId
        ? getLocalFolderIdByPath(
            vaultId,
            remoteFoldersByPath.get(
              remoteFoldersByPath.get(remoteFolder.parentId)?.path || ""
            )?.path || ""
          )
        : null

      try {
        const folder = createFolder(remoteFolder.name, userId, vaultId, localParentId)
        setIdMapping(pairingId, folder.id, remoteFolder.id, "folder")
        received++
      } catch {
        // Folder may already exist
      }
    } else {
      // Both have this folder, map their IDs
      const localFolder = localFoldersByPath.get(folderPath)!
      setIdMapping(pairingId, localFolder.id, remoteFolder.id, "folder")
    }
  }

  // 2. Process notes
  // Remote-only notes: pull from remote
  for (const [filePath, remoteNote] of remoteNotesByPath) {
    if (!localNotesByPath.has(filePath)) {
      // Fetch content from remote
      const contentRes = await peerFetch(
        pairingId,
        localPeer.id,
        remoteUrl,
        "/api/sync/content",
        {
          method: "POST",
          body: { pairingId, entityId: remoteNote.id, entityType: "note" },
        }
      )

      if (contentRes.ok) {
        const { content } = (await contentRes.json()) as { content: string }
        const { createNote } =
          require("@/lib/notes") as typeof import("@/lib/notes")
        const userId = getVaultUserId(vaultId)

        // Find local parent folder by matching path
        const noteDir = filePath.includes("/")
          ? filePath.substring(0, filePath.lastIndexOf("/"))
          : null
        const localParentId = noteDir
          ? getLocalFolderIdByPath(vaultId, noteDir)
          : null

        try {
          const note = createNote(
            remoteNote.title,
            userId,
            vaultId,
            localParentId,
            content
          )
          setIdMapping(pairingId, note.id, remoteNote.id, "note")
          received++
        } catch {}
      }
    } else {
      const localNote = localNotesByPath.get(filePath)!
      setIdMapping(pairingId, localNote.id, remoteNote.id, "note")

      // Both have this note - check if content differs
      if (localNote.contentHash !== remoteNote.contentHash) {
        // Content differs: keep local as-is, create remote version as a
        // separate note with "(synced)" suffix so nothing is lost.
        const contentRes = await peerFetch(
          pairingId,
          localPeer.id,
          remoteUrl,
          "/api/sync/content",
          {
            method: "POST",
            body: { pairingId, entityId: remoteNote.id, entityType: "note" },
          }
        )

        if (contentRes.ok) {
          const { content: remoteContent } = (await contentRes.json()) as {
            content: string
          }
          const { createNote } =
            require("@/lib/notes") as typeof import("@/lib/notes")
          const userId = getVaultUserId(vaultId)
          const noteDir = filePath.includes("/")
            ? filePath.substring(0, filePath.lastIndexOf("/"))
            : null
          const localParentId = noteDir
            ? getLocalFolderIdByPath(vaultId, noteDir)
            : null

          try {
            // createNote auto-deduplicates the filename if it already exists
            createNote(
              `${remoteNote.title} (synced)`,
              userId,
              vaultId,
              localParentId,
              remoteContent
            )
            received++
          } catch {}
        }
      }
    }
  }

  // 3. Local-only notes: push to remote
  for (const [filePath, localNote] of localNotesByPath) {
    if (!remoteNotesByPath.has(filePath)) {
      const content = getEntityContent(vaultId, localNote.id, "note")
      if (content) {
        await peerFetch(
          pairingId,
          localPeer.id,
          remoteUrl,
          "/api/sync/push",
          {
            method: "POST",
            body: {
              pairingId,
              changes: [
                {
                  seq: 0,
                  vaultId,
                  entityType: "note",
                  entityId: localNote.id,
                  changeType: "create",
                  payload: {
                    title: localNote.title,
                    filePath: localNote.filePath,
                    parentId: null,
                    content: content.toString("utf-8"),
                  },
                  contentHash: localNote.contentHash,
                  createdAt: new Date().toISOString(),
                  peerOrigin: null,
                },
              ],
            },
          }
        )
        sent++
      }
    }
  }

  // Set cursors to current max seq on both sides
  const localMaxSeq = getMaxSeq(vaultId)
  updateSyncCursor(pairingId, {
    lastSentSeq: localMaxSeq,
    lastReceivedSeq: localMaxSeq, // Will be updated when remote confirms
  })

  return { sent, received, conflicts }
}

// ── Helpers ──

function getVaultUserId(vaultId: string): string {
  const db = getDb()
  const row = db
    .prepare("SELECT user_id FROM vaults WHERE id = ?")
    .get(vaultId) as { user_id: string }
  return row.user_id
}

function getLocalFolderIdByPath(
  vaultId: string,
  folderPath: string
): string | null {
  if (!folderPath) return null
  const db = getDb()
  const row = db
    .prepare("SELECT id FROM folders WHERE path = ? AND vault_id = ?")
    .get(folderPath, vaultId) as { id: string } | undefined
  return row?.id || null
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
