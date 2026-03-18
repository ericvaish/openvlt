import { v4 as uuid } from "uuid"
import { getDb } from "@/lib/db"
import type {
  AIConversation,
  AIConversationStatus,
  AIMessageRecord,
  AIChatMessage,
  AIToolCall,
  AIChatAttachment,
  AIProviderType,
} from "@/types"
import type { TokenUsage } from "./service"

function rowToConversation(row: Record<string, unknown>): AIConversation {
  const hasUsage =
    row.usage_input_tokens != null || row.usage_output_tokens != null
  return {
    id: row.id as string,
    userId: row.user_id as string,
    vaultId: row.vault_id as string,
    title: (row.title as string) || null,
    provider: (row.provider as AIProviderType) || null,
    model: (row.model as string) || null,
    status: row.status as AIConversationStatus,
    usage: hasUsage
      ? {
          inputTokens: (row.usage_input_tokens as number) ?? 0,
          outputTokens: (row.usage_output_tokens as number) ?? 0,
          reasoningTokens: (row.usage_reasoning_tokens as number) || undefined,
          cachedTokens: (row.usage_cached_tokens as number) || undefined,
        }
      : null,
    error: (row.error as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function rowToMessage(row: Record<string, unknown>): AIMessageRecord {
  let toolCalls: AIToolCall[] | undefined
  if (row.tool_calls) {
    try {
      toolCalls = JSON.parse(row.tool_calls as string)
    } catch {
      toolCalls = undefined
    }
  }

  let attachments: AIChatAttachment[] | undefined
  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments as string)
    } catch {
      attachments = undefined
    }
  }

  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as AIChatMessage["role"],
    content: row.content as string,
    reasoning: (row.reasoning as string) || undefined,
    toolCalls,
    toolCallId: (row.tool_call_id as string) || undefined,
    attachments,
    seq: row.seq as number,
    createdAt: row.created_at as string,
  }
}

export function createConversation(
  userId: string,
  vaultId: string,
  provider?: string,
  model?: string,
  title?: string | null
): string {
  const db = getDb()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO ai_conversations (id, user_id, vault_id, title, provider, model, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(id, userId, vaultId, title || null, provider || null, model || null, now, now)

  return id
}

export function getConversation(
  conversationId: string,
  userId: string,
  vaultId?: string
): AIConversation | null {
  const db = getDb()
  const row = vaultId
    ? (db
        .prepare(
          "SELECT * FROM ai_conversations WHERE id = ? AND user_id = ? AND vault_id = ?"
        )
        .get(conversationId, userId, vaultId) as Record<string, unknown> | undefined)
    : (db
        .prepare(
          "SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?"
        )
        .get(conversationId, userId) as Record<string, unknown> | undefined)

  return row ? rowToConversation(row) : null
}

export function getActiveConversation(
  userId: string,
  vaultId: string
): AIConversation | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT * FROM ai_conversations
       WHERE user_id = ? AND vault_id = ? AND status IN ('active', 'generating', 'completed')
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(userId, vaultId) as Record<string, unknown> | undefined

  return row ? rowToConversation(row) : null
}

export function listConversations(
  userId: string,
  vaultId: string,
  limit = 50
): AIConversation[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM ai_conversations
       WHERE user_id = ? AND vault_id = ?
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(userId, vaultId, limit) as Record<string, unknown>[]

  return rows.map(rowToConversation)
}

export function addMessage(
  conversationId: string,
  msg: {
    role: AIChatMessage["role"]
    content: string
    reasoning?: string
    toolCalls?: AIToolCall[]
    toolCallId?: string
    attachments?: AIChatAttachment[]
  }
): string {
  const db = getDb()
  const id = uuid()

  const maxSeq = db
    .prepare(
      "SELECT MAX(seq) as max_seq FROM ai_messages WHERE conversation_id = ?"
    )
    .get(conversationId) as { max_seq: number | null }
  const seq = (maxSeq.max_seq ?? -1) + 1

  db.prepare(
    `INSERT INTO ai_messages (id, conversation_id, role, content, reasoning, tool_calls, tool_call_id, attachments, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    conversationId,
    msg.role,
    msg.content,
    msg.reasoning || null,
    msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
    msg.toolCallId || null,
    msg.attachments ? JSON.stringify(msg.attachments) : null,
    seq
  )

  return id
}

export function updateAssistantMessage(
  messageId: string,
  updates: {
    content?: string
    reasoning?: string
    toolCalls?: AIToolCall[]
  }
): void {
  const db = getDb()
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.content !== undefined) {
    sets.push("content = ?")
    values.push(updates.content)
  }
  if (updates.reasoning !== undefined) {
    sets.push("reasoning = ?")
    values.push(updates.reasoning)
  }
  if (updates.toolCalls !== undefined) {
    sets.push("tool_calls = ?")
    values.push(JSON.stringify(updates.toolCalls))
  }

  if (sets.length === 0) return

  values.push(messageId)
  db.prepare(
    `UPDATE ai_messages SET ${sets.join(", ")} WHERE id = ?`
  ).run(...values)
}

export function updateConversationStatus(
  conversationId: string,
  status: AIConversationStatus,
  usage?: TokenUsage,
  error?: string
): void {
  const db = getDb()
  const now = new Date().toISOString()

  if (usage) {
    db.prepare(
      `UPDATE ai_conversations
       SET status = ?, usage_input_tokens = ?, usage_output_tokens = ?,
           usage_reasoning_tokens = ?, usage_cached_tokens = ?,
           error = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      status,
      usage.inputTokens,
      usage.outputTokens,
      usage.reasoningTokens || null,
      usage.cachedTokens || null,
      error || null,
      now,
      conversationId
    )
  } else {
    db.prepare(
      `UPDATE ai_conversations SET status = ?, error = ?, updated_at = ? WHERE id = ?`
    ).run(status, error || null, now, conversationId)
  }
}

export function getMessages(
  conversationId: string,
  userId: string,
  vaultId?: string
): AIMessageRecord[] {
  const db = getDb()

  // Verify ownership
  const conv = vaultId
    ? db
        .prepare(
          "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ? AND vault_id = ?"
        )
        .get(conversationId, userId, vaultId)
    : db
        .prepare(
          "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?"
        )
        .get(conversationId, userId)
  if (!conv) return []

  const rows = db
    .prepare(
      "SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY seq"
    )
    .all(conversationId) as Record<string, unknown>[]

  return rows.map(rowToMessage)
}

export function deleteConversation(
  conversationId: string,
  userId: string,
  vaultId?: string
): void {
  const db = getDb()
  if (vaultId) {
    db.prepare(
      "DELETE FROM ai_conversations WHERE id = ? AND user_id = ? AND vault_id = ?"
    ).run(conversationId, userId, vaultId)
  } else {
    db.prepare(
      "DELETE FROM ai_conversations WHERE id = ? AND user_id = ?"
    ).run(conversationId, userId)
  }
}

export function clearConversations(userId: string, vaultId: string): void {
  const db = getDb()
  db.prepare(
    "DELETE FROM ai_conversations WHERE user_id = ? AND vault_id = ?"
  ).run(userId, vaultId)
}
