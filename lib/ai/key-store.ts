import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import { encryptToken, decryptToken } from "@/lib/backup/token-store"
import type { AIProviderType, AIProviderKeyStatus } from "@/types"

export function saveProviderKey(
  userId: string,
  provider: AIProviderType,
  apiKey: string
): void {
  const db = getDb()
  const encrypted = encryptToken(apiKey)
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO ai_provider_keys (id, user_id, provider, api_key_enc, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET api_key_enc = excluded.api_key_enc, updated_at = excluded.updated_at`
  ).run(uuid(), userId, provider, encrypted, now, now)
}

export function getProviderKey(
  userId: string,
  provider: AIProviderType
): string | null {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT api_key_enc FROM ai_provider_keys WHERE user_id = ? AND provider = ?"
    )
    .get(userId, provider) as { api_key_enc: string } | undefined

  if (!row) return null
  return decryptToken(row.api_key_enc)
}

export function deleteProviderKey(
  userId: string,
  provider: AIProviderType
): void {
  const db = getDb()
  db.prepare(
    "DELETE FROM ai_provider_keys WHERE user_id = ? AND provider = ?"
  ).run(userId, provider)
}

export function listProviderKeys(userId: string): AIProviderKeyStatus[] {
  const db = getDb()
  const rows = db
    .prepare("SELECT provider FROM ai_provider_keys WHERE user_id = ?")
    .all(userId) as { provider: string }[]

  const configured = new Set(rows.map((r) => r.provider))
  const providers: AIProviderType[] = [
    "openai",
    "anthropic",
    "openrouter",
  ]

  return providers.map((p) => ({
    provider: p,
    configured: configured.has(p),
  }))
}
