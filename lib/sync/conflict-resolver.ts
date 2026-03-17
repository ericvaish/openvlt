import fs from "fs"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { threeWayMerge } from "@/lib/sync/merge"
import type { SyncLogEntry } from "@/types"

export interface ConflictResult {
  resolved: boolean
  action: "merged" | "local_wins" | "remote_wins" | "conflict_file" | "recreate" | "preserve"
  mergedContent?: string
}

/**
 * Resolve a content conflict on a note.
 * Uses three-way merge with the last synced version as the ancestor.
 */
export function resolveContentConflict(
  noteId: string,
  vaultId: string,
  remoteContent: string,
  lastSyncedContent: string
): ConflictResult {
  const db = getDb()
  const vaultRoot = getVaultPath(vaultId)

  const note = db
    .prepare("SELECT file_path, is_locked FROM notes WHERE id = ? AND vault_id = ?")
    .get(noteId, vaultId) as { file_path: string; is_locked: number } | undefined

  if (!note) {
    return { resolved: true, action: "remote_wins", mergedContent: remoteContent }
  }

  // Locked notes cannot be three-way merged (encrypted content)
  if (note.is_locked) {
    // Take the remote version (last-writer-wins for encrypted notes)
    return { resolved: true, action: "remote_wins", mergedContent: remoteContent }
  }

  let localContent = ""
  try {
    localContent = fs.readFileSync(safeResolvePath(vaultRoot, note.file_path), "utf-8")
  } catch {
    // Local file missing, take remote
    return { resolved: true, action: "remote_wins", mergedContent: remoteContent }
  }

  // If local and remote are identical, no conflict
  if (localContent === remoteContent) {
    return { resolved: true, action: "merged", mergedContent: localContent }
  }

  const ancestor = lastSyncedContent || ""
  const mergeResult = threeWayMerge(ancestor, remoteContent, localContent)

  if (mergeResult.success) {
    return { resolved: true, action: "merged", mergedContent: mergeResult.content }
  }

  // True conflict: create a .conflict.md file with the remote version
  const conflictPath = note.file_path.replace(/\.md$/, ".conflict.md")
  try {
    const fullConflictPath = safeResolvePath(vaultRoot, conflictPath)
    fs.writeFileSync(fullConflictPath, remoteContent, "utf-8")
  } catch {
    // Could not write conflict file
  }

  return { resolved: false, action: "conflict_file" }
}

/**
 * Resolve structural conflicts (delete vs edit, move vs move, etc.)
 */
export function resolveStructuralConflict(
  localChange: SyncLogEntry | null,
  remoteChange: SyncLogEntry
): ConflictResult {
  // Delete on remote, edit locally -> preserve local (edits represent intent to keep)
  if (remoteChange.changeType === "delete" && localChange?.changeType === "update") {
    return { resolved: true, action: "preserve" }
  }

  // Delete locally, edit on remote -> accept remote edit, "un-delete"
  if (localChange?.changeType === "delete" && remoteChange.changeType === "update") {
    return { resolved: true, action: "remote_wins" }
  }

  // Folder deleted on remote, but a note was created in it locally -> recreate folder
  if (
    remoteChange.changeType === "delete" &&
    remoteChange.entityType === "folder" &&
    localChange?.changeType === "create"
  ) {
    return { resolved: true, action: "recreate" }
  }

  // Both moved to different targets -> last writer wins (by timestamp)
  if (localChange?.changeType === "move" && remoteChange.changeType === "move") {
    const localTime = new Date(localChange.createdAt).getTime()
    const remoteTime = new Date(remoteChange.createdAt).getTime()
    return {
      resolved: true,
      action: remoteTime >= localTime ? "remote_wins" : "local_wins",
    }
  }

  // Default: accept remote change
  return { resolved: true, action: "remote_wins" }
}
