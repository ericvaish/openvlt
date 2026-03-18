import crypto from "crypto"
import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import type { AIApiToken } from "@/types"

const TOKEN_PREFIX_LENGTH = 8

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function createApiToken(
  userId: string,
  vaultId: string,
  name: string
): { id: string; token: string; prefix: string } {
  const db = getDb()
  const id = uuid()
  const rawToken = `ovlt_${crypto.randomBytes(32).toString("hex")}`
  const prefix = rawToken.slice(0, TOKEN_PREFIX_LENGTH)
  const tokenHash = hashToken(rawToken)
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO ai_api_tokens (id, user_id, vault_id, name, token_hash, token_prefix, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, vaultId, name, tokenHash, prefix, now)

  return { id, token: rawToken, prefix }
}

export function validateApiToken(
  token: string
): { userId: string; vaultId: string } | null {
  const db = getDb()
  const tokenHash = hashToken(token)

  const row = db
    .prepare(
      "SELECT user_id, vault_id FROM ai_api_tokens WHERE token_hash = ?"
    )
    .get(tokenHash) as
    | { user_id: string; vault_id: string }
    | undefined

  if (!row) return null

  db.prepare(
    "UPDATE ai_api_tokens SET last_used_at = datetime('now') WHERE token_hash = ?"
  ).run(tokenHash)

  return { userId: row.user_id, vaultId: row.vault_id }
}

export function listApiTokens(userId: string): AIApiToken[] {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT id, name, token_prefix, last_used_at, created_at FROM ai_api_tokens WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as {
    id: string
    name: string
    token_prefix: string
    last_used_at: string | null
    created_at: string
  }[]

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    tokenPrefix: r.token_prefix,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at,
  }))
}

export function revokeApiToken(id: string, userId: string): boolean {
  const db = getDb()
  const result = db
    .prepare("DELETE FROM ai_api_tokens WHERE id = ? AND user_id = ?")
    .run(id, userId)
  return result.changes > 0
}
