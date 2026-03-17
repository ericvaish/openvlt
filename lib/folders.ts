import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"
import { recordStructureEvent } from "@/lib/versions/structure-events"
import { appendSyncLog } from "@/lib/sync/log"
import type { FolderNode, TreeNode } from "@/types"

export function createFolder(
  name: string,
  userId: string,
  vaultId: string,
  parentId: string | null = null
): FolderNode {
  const db = getDb()
  const id = uuid()
  const vaultRoot = getVaultPath(vaultId)

  let folderPath: string
  if (parentId) {
    const parent = db
      .prepare(
        "SELECT path FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
      )
      .get(parentId, userId, vaultId) as { path: string } | undefined
    if (!parent) throw new Error("Parent folder not found")
    folderPath = path.join(parent.path, name)
  } else {
    folderPath = name
  }

  const fullPath = safeResolvePath(vaultRoot, folderPath)
  fs.mkdirSync(fullPath, { recursive: true })

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO folders (id, name, path, parent_id, user_id, vault_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, folderPath, parentId, userId, vaultId, now)

  recordStructureEvent(vaultId, userId, "folder_created", "folder", id, null, {
    name,
    path: folderPath,
    parentId,
  })

  appendSyncLog(vaultId, "folder", id, "create", {
    name,
    path: folderPath,
    parentId,
  })

  return { id, name, path: folderPath, parentId, vaultId, createdAt: now }
}

export function renameFolder(
  id: string,
  newName: string,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  const folder = db
    .prepare(
      "SELECT * FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as
    | {
        id: string
        name: string
        path: string
        parent_id: string | null
      }
    | undefined

  if (!folder) throw new Error("Folder not found")

  const vaultRoot = getVaultPath(vaultId)
  const oldFullPath = safeResolvePath(vaultRoot, folder.path)
  const parentDir = path.dirname(folder.path)
  const newPath = parentDir === "." ? newName : path.join(parentDir, newName)
  const newFullPath = safeResolvePath(vaultRoot, newPath)

  if (fs.existsSync(oldFullPath)) {
    fs.renameSync(oldFullPath, newFullPath)
  }

  // Update this folder and all children paths
  const oldPrefix = folder.path
  const allFolders = db
    .prepare(
      "SELECT id, path FROM folders WHERE path LIKE ? AND user_id = ? AND vault_id = ?"
    )
    .all(`${oldPrefix}%`, userId, vaultId) as { id: string; path: string }[]

  for (const f of allFolders) {
    const updated = newPath + f.path.slice(oldPrefix.length)
    db.prepare(
      "UPDATE folders SET path = ?, name = CASE WHEN id = ? THEN ? ELSE name END WHERE id = ?"
    ).run(updated, id, newName, f.id)
  }

  // Update note file paths
  const allNotes = db
    .prepare(
      "SELECT id, file_path FROM notes WHERE file_path LIKE ? AND user_id = ? AND vault_id = ?"
    )
    .all(`${oldPrefix}%`, userId, vaultId) as {
    id: string
    file_path: string
  }[]

  for (const n of allNotes) {
    const updated = newPath + n.file_path.slice(oldPrefix.length)
    db.prepare("UPDATE notes SET file_path = ? WHERE id = ?").run(
      updated,
      n.id
    )
  }

  recordStructureEvent(vaultId, userId, "folder_renamed", "folder", id, {
    name: folder.name,
    path: folder.path,
  }, {
    name: newName,
    path: newPath,
  })

  appendSyncLog(vaultId, "folder", id, "rename", {
    oldName: folder.name,
    newName,
    oldPath: folder.path,
    newPath,
  })
}

export function moveFolder(
  id: string,
  newParentId: string | null,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  const folder = db
    .prepare(
      "SELECT * FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as
    | { id: string; name: string; path: string; parent_id: string | null }
    | undefined

  if (!folder) throw new Error("Folder not found")

  // Prevent moving into self or a descendant
  if (newParentId) {
    const target = db
      .prepare(
        "SELECT path FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
      )
      .get(newParentId, userId, vaultId) as { path: string } | undefined
    if (!target) throw new Error("Target folder not found")
    if (target.path.startsWith(folder.path + "/") || target.path === folder.path) {
      throw new Error("Cannot move folder into itself")
    }
  }

  const vaultRoot = getVaultPath(vaultId)
  const oldPath = folder.path
  const oldFullPath = safeResolvePath(vaultRoot, oldPath)

  let newPath: string
  if (newParentId) {
    const parent = db
      .prepare(
        "SELECT path FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
      )
      .get(newParentId, userId, vaultId) as { path: string }
    newPath = path.join(parent.path, folder.name)
  } else {
    newPath = folder.name
  }

  const newFullPath = safeResolvePath(vaultRoot, newPath)

  if (oldFullPath !== newFullPath) {
    fs.mkdirSync(path.dirname(newFullPath), { recursive: true })
    fs.renameSync(oldFullPath, newFullPath)
  }

  // Update this folder and all descendant folders
  const allFolders = db
    .prepare(
      "SELECT id, path FROM folders WHERE (path LIKE ? OR id = ?) AND user_id = ? AND vault_id = ?"
    )
    .all(`${oldPath}/%`, id, userId, vaultId) as {
    id: string
    path: string
  }[]

  for (const f of allFolders) {
    const updated = newPath + f.path.slice(oldPath.length)
    db.prepare("UPDATE folders SET path = ? WHERE id = ?").run(updated, f.id)
  }

  const oldParentId = folder.parent_id

  // Update parent_id for the moved folder itself
  db.prepare("UPDATE folders SET parent_id = ?, path = ? WHERE id = ?").run(
    newParentId,
    newPath,
    id
  )

  // Update note file paths
  const allNotes = db
    .prepare(
      "SELECT id, file_path FROM notes WHERE file_path LIKE ? AND user_id = ? AND vault_id = ?"
    )
    .all(`${oldPath}/%`, userId, vaultId) as {
    id: string
    file_path: string
  }[]

  for (const n of allNotes) {
    const updated = newPath + n.file_path.slice(oldPath.length)
    db.prepare("UPDATE notes SET file_path = ? WHERE id = ?").run(updated, n.id)
  }

  recordStructureEvent(vaultId, userId, "folder_moved", "folder", id, {
    parentId: oldParentId,
    path: oldPath,
  }, {
    parentId: newParentId,
    path: newPath,
  })

  appendSyncLog(vaultId, "folder", id, "move", {
    oldParentId,
    newParentId,
    oldPath,
    newPath,
  })
}

export function deleteFolder(
  id: string,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  const folder = db
    .prepare(
      "SELECT path FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as { path: string } | undefined

  if (!folder) throw new Error("Folder not found")

  const vaultRoot = getVaultPath(vaultId)
  const fullPath = safeResolvePath(vaultRoot, folder.path)
  try {
    fs.rmSync(fullPath, { recursive: true })
  } catch {
    // Directory already gone
  }

  // Delete notes in this folder and subfolders
  db.prepare(
    "DELETE FROM notes WHERE file_path LIKE ? AND user_id = ? AND vault_id = ?"
  ).run(`${folder.path}%`, userId, vaultId)

  recordStructureEvent(vaultId, userId, "folder_deleted", "folder", id, {
    name: path.basename(folder.path),
    path: folder.path,
  }, null)

  appendSyncLog(vaultId, "folder", id, "delete", {
    name: path.basename(folder.path),
    path: folder.path,
  })

  // Delete this folder and subfolders
  db.prepare(
    "DELETE FROM folders WHERE path LIKE ? AND user_id = ? AND vault_id = ?"
  ).run(`${folder.path}%`, userId, vaultId)
  db.prepare(
    "DELETE FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(id, userId, vaultId)
}

export function getFolderTree(
  userId: string,
  vaultId: string,
  advanced = false
): TreeNode[] {
  const db = getDb()

  const folders = db
    .prepare(
      "SELECT * FROM folders WHERE user_id = ? AND vault_id = ? ORDER BY path"
    )
    .all(userId, vaultId) as {
    id: string
    name: string
    path: string
    parent_id: string | null
  }[]

  const notes = db
    .prepare(
      "SELECT id, title, file_path, parent_id FROM notes WHERE is_trashed = 0 AND user_id = ? AND vault_id = ? ORDER BY title"
    )
    .all(userId, vaultId) as {
    id: string
    title: string
    file_path: string
    parent_id: string | null
  }[]

  // In advanced mode, fetch attachments grouped by note
  const attachmentsByNote = new Map<string, TreeNode[]>()
  if (advanced) {
    const attachments = db
      .prepare(
        `SELECT a.id, a.note_id, a.file_name, a.file_path, a.mime_type
         FROM attachments a
         JOIN notes n ON n.id = a.note_id
         WHERE n.user_id = ? AND n.vault_id = ?
         ORDER BY a.file_name`
      )
      .all(userId, vaultId) as {
      id: string
      note_id: string
      file_name: string
      file_path: string
      mime_type: string
    }[]

    for (const att of attachments) {
      if (!attachmentsByNote.has(att.note_id)) {
        attachmentsByNote.set(att.note_id, [])
      }
      attachmentsByNote.get(att.note_id)!.push({
        id: att.id,
        name: att.file_name,
        path: att.file_path,
        type: "attachment",
        mimeType: att.mime_type,
      })
    }
  }

  // Build tree from flat lists
  const nodeMap = new Map<string | null, TreeNode[]>()

  // Group folders by parent
  for (const folder of folders) {
    const node: TreeNode = {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      type: "folder",
      children: [],
    }
    const parentKey = folder.parent_id
    if (!nodeMap.has(parentKey)) nodeMap.set(parentKey, [])
    nodeMap.get(parentKey)!.push(node)
  }

  // Group notes by parent
  for (const note of notes) {
    const children: TreeNode[] | undefined = advanced
      ? [
          {
            id: `${note.id}:md`,
            name: `${note.title}.md`,
            path: note.file_path,
            type: "file" as const,
          },
          ...(attachmentsByNote.get(note.id) || []),
        ]
      : undefined

    const node: TreeNode = {
      id: note.id,
      name: note.title,
      path: note.file_path,
      type: "file",
      children: advanced ? children : undefined,
    }
    const parentKey = note.parent_id
    if (!nodeMap.has(parentKey)) nodeMap.set(parentKey, [])
    nodeMap.get(parentKey)!.push(node)
  }

  // Recursively build tree
  function buildChildren(parentId: string | null): TreeNode[] {
    const children = nodeMap.get(parentId) || []
    for (const child of children) {
      if (child.type === "folder") {
        child.children = buildChildren(child.id)
      }
    }
    // Sort: folders first, then files
    return children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  return buildChildren(null)
}

export function getFolder(
  id: string,
  userId: string,
  vaultId: string
): FolderNode | null {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT * FROM folders WHERE id = ? AND user_id = ? AND vault_id = ?"
    )
    .get(id, userId, vaultId) as
    | {
        id: string
        name: string
        path: string
        parent_id: string | null
        vault_id: string
        created_at: string
      }
    | undefined

  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    parentId: row.parent_id,
    vaultId: row.vault_id,
    createdAt: row.created_at,
  }
}
