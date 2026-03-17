import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import type { Bookmark } from "@/types"

function toBookmark(row: Record<string, unknown>): Bookmark {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    vaultId: row.vault_id as string,
    type: row.type as Bookmark["type"],
    targetId: (row.target_id as string) || null,
    label: row.label as string,
    data: (row.data as string) || null,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
  }
}

export function listBookmarks(userId: string, vaultId: string): Bookmark[] {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT * FROM bookmarks WHERE user_id = ? AND vault_id = ? ORDER BY sort_order ASC, created_at ASC"
    )
    .all(userId, vaultId) as Record<string, unknown>[]
  return rows.map(toBookmark)
}

export function createBookmark(
  userId: string,
  vaultId: string,
  type: Bookmark["type"],
  label: string,
  targetId?: string | null,
  data?: string | null
): Bookmark {
  const db = getDb()
  const id = uuid()
  const now = new Date().toISOString()

  // Get next sort order
  const maxRow = db
    .prepare(
      "SELECT MAX(sort_order) as max_order FROM bookmarks WHERE user_id = ? AND vault_id = ?"
    )
    .get(userId, vaultId) as { max_order: number | null }
  const sortOrder = (maxRow.max_order ?? -1) + 1

  db.prepare(
    `INSERT INTO bookmarks (id, user_id, vault_id, type, target_id, label, data, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    vaultId,
    type,
    targetId ?? null,
    label,
    data ?? null,
    sortOrder,
    now
  )

  return {
    id,
    userId,
    vaultId,
    type,
    targetId: targetId ?? null,
    label,
    data: data ?? null,
    sortOrder,
    createdAt: now,
  }
}

export function findExistingBookmark(
  userId: string,
  vaultId: string,
  type: Bookmark["type"],
  targetId?: string | null,
  data?: string | null
): Bookmark | null {
  const db = getDb()
  let row: Record<string, unknown> | undefined

  if (type === "note" && targetId) {
    row = db
      .prepare(
        "SELECT * FROM bookmarks WHERE user_id = ? AND vault_id = ? AND type = ? AND target_id = ?"
      )
      .get(userId, vaultId, type, targetId) as
      | Record<string, unknown>
      | undefined
  } else if (type === "heading" && targetId && data) {
    row = db
      .prepare(
        "SELECT * FROM bookmarks WHERE user_id = ? AND vault_id = ? AND type = ? AND target_id = ? AND data = ?"
      )
      .get(userId, vaultId, type, targetId, data) as
      | Record<string, unknown>
      | undefined
  } else if (type === "search" && data) {
    row = db
      .prepare(
        "SELECT * FROM bookmarks WHERE user_id = ? AND vault_id = ? AND type = ? AND data = ?"
      )
      .get(userId, vaultId, type, data) as
      | Record<string, unknown>
      | undefined
  }

  return row ? toBookmark(row) : null
}

export function deleteBookmark(
  id: string,
  userId: string,
  vaultId: string
): void {
  const db = getDb()
  db.prepare(
    "DELETE FROM bookmarks WHERE id = ? AND user_id = ? AND vault_id = ?"
  ).run(id, userId, vaultId)
}

export function updateBookmarkOrder(
  userId: string,
  vaultId: string,
  orderedIds: string[]
): void {
  const db = getDb()
  const stmt = db.prepare(
    "UPDATE bookmarks SET sort_order = ? WHERE id = ? AND user_id = ? AND vault_id = ?"
  )

  const update = db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      stmt.run(i, orderedIds[i], userId, vaultId)
    }
  })
  update()
}
