import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { isBlockedPath } from "@/lib/paths"
import { createWelcomeNote } from "@/lib/welcome-note"
import type { Vault } from "@/types"

export function validateVaultPath(dirPath: string): {
  valid: boolean
  error?: string
} {
  if (!path.isAbsolute(dirPath)) {
    return { valid: false, error: "Path must be absolute" }
  }

  const resolved = path.resolve(dirPath)

  // Block the root filesystem
  if (resolved === "/") {
    return { valid: false, error: "Cannot use the root filesystem as a vault" }
  }

  // Block sensitive system paths (allowed paths take precedence)
  if (isBlockedPath(resolved)) {
    return { valid: false, error: "This path is not allowed for security reasons" }
  }

  try {
    if (fs.existsSync(resolved)) {
      const stats = fs.statSync(resolved)
      if (!stats.isDirectory()) {
        return { valid: false, error: "Path exists but is not a directory" }
      }
      // Check writable
      fs.accessSync(resolved, fs.constants.W_OK)
      return { valid: true }
    }

    // Try to create the directory to check if writable
    const parent = path.dirname(resolved)
    if (!fs.existsSync(parent)) {
      return {
        valid: false,
        error: "Parent directory does not exist",
      }
    }
    fs.accessSync(parent, fs.constants.W_OK)
    return { valid: true }
  } catch {
    return { valid: false, error: "Path is not writable" }
  }
}

export function createVault(
  userId: string,
  name: string,
  dirPath: string
): Vault {
  const db = getDb()

  const validation = validateVaultPath(dirPath)
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid vault path")
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }

  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO vaults (id, name, path, user_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, name.trim(), dirPath, userId, now)

  // If user has no active vault, set this one as active
  const user = db
    .prepare("SELECT active_vault_id FROM users WHERE id = ?")
    .get(userId) as { active_vault_id: string | null } | undefined

  const isFirst = !user?.active_vault_id
  if (isFirst) {
    db.prepare("UPDATE users SET active_vault_id = ? WHERE id = ?").run(
      id,
      userId
    )
  }

  // Create a welcome note in the user's first vault
  if (isFirst) {
    try {
      createWelcomeNote(userId, id)
    } catch {
      // Don't fail vault creation if welcome note fails
    }
  }

  return {
    id,
    name: name.trim(),
    path: dirPath,
    userId,
    isActive: isFirst,
    createdAt: now,
  }
}

export function listVaults(userId: string): Vault[] {
  const db = getDb()
  const user = db
    .prepare("SELECT active_vault_id FROM users WHERE id = ?")
    .get(userId) as { active_vault_id: string | null } | undefined

  const activeId = user?.active_vault_id ?? null

  const rows = db
    .prepare(
      "SELECT id, name, path, user_id, created_at FROM vaults WHERE user_id = ? ORDER BY created_at"
    )
    .all(userId) as {
    id: string
    name: string
    path: string
    user_id: string
    created_at: string
  }[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    path: r.path,
    userId: r.user_id,
    isActive: r.id === activeId,
    createdAt: r.created_at,
  }))
}

export function getVault(vaultId: string, userId: string): Vault | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT v.id, v.name, v.path, v.user_id, v.created_at,
              CASE WHEN u.active_vault_id = v.id THEN 1 ELSE 0 END as is_active
       FROM vaults v
       JOIN users u ON u.id = v.user_id
       WHERE v.id = ? AND v.user_id = ?`
    )
    .get(vaultId, userId) as
    | {
        id: string
        name: string
        path: string
        user_id: string
        created_at: string
        is_active: number
      }
    | undefined

  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    userId: row.user_id,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }
}

export function deleteVault(vaultId: string, userId: string): void {
  const db = getDb()

  const result = db
    .prepare("DELETE FROM vaults WHERE id = ? AND user_id = ?")
    .run(vaultId, userId)

  if (result.changes === 0) throw new Error("Vault not found")

  // If this was the active vault, clear it
  const user = db
    .prepare("SELECT active_vault_id FROM users WHERE id = ?")
    .get(userId) as { active_vault_id: string | null } | undefined

  if (user?.active_vault_id === vaultId) {
    db.prepare("UPDATE users SET active_vault_id = NULL WHERE id = ?").run(
      userId
    )
  }
}

export function renameVault(
  vaultId: string,
  userId: string,
  name: string
): void {
  const db = getDb()
  const result = db
    .prepare("UPDATE vaults SET name = ? WHERE id = ? AND user_id = ?")
    .run(name, vaultId, userId)
  if (result.changes === 0) throw new Error("Vault not found")
}

export function setActiveVault(userId: string, vaultId: string): void {
  const db = getDb()

  const vault = db
    .prepare("SELECT id FROM vaults WHERE id = ? AND user_id = ?")
    .get(vaultId, userId)

  if (!vault) throw new Error("Vault not found")

  db.prepare("UPDATE users SET active_vault_id = ? WHERE id = ?").run(
    vaultId,
    userId
  )
}

export function getActiveVault(userId: string): Vault | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT v.id, v.name, v.path, v.user_id, v.created_at
       FROM vaults v
       JOIN users u ON u.active_vault_id = v.id
       WHERE u.id = ?`
    )
    .get(userId) as
    | {
        id: string
        name: string
        path: string
        user_id: string
        created_at: string
      }
    | undefined

  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    path: row.path,
    userId: row.user_id,
    isActive: true,
    createdAt: row.created_at,
  }
}

export function getVaultPath(vaultId: string): string {
  const db = getDb()
  const row = db
    .prepare("SELECT path FROM vaults WHERE id = ?")
    .get(vaultId) as { path: string } | undefined

  if (!row) throw new Error("Vault not found")

  return row.path
}

/**
 * Resolve a relative file path within a vault root, preventing path traversal.
 * Throws if the resolved path escapes the vault directory.
 */
export function safeResolvePath(
  vaultRoot: string,
  relativePath: string
): string {
  const resolved = path.resolve(vaultRoot, relativePath)
  if (!resolved.startsWith(vaultRoot + path.sep) && resolved !== vaultRoot) {
    throw new Error("Path traversal detected")
  }
  return resolved
}
