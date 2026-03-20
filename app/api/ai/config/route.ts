import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAdmin, requireAuthWithVault } from "@/lib/auth/middleware"
import { getDb } from "@/lib/db"
import type { AIConfig, AIProviderType } from "@/types"

const VALID_PROVIDERS: AIProviderType[] = [
  "codex",
  "openai",
  "anthropic",
  "openrouter",
  "claude-code",
]

/**
 * Parse the chat_provider column which can be:
 *   - null
 *   - a single provider string (legacy): "openai"
 *   - a JSON array string: '["openai","anthropic"]'
 */
function parseChatProviders(raw: string | null): AIProviderType[] {
  if (!raw) return []
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.filter((p: string) => VALID_PROVIDERS.includes(p as AIProviderType))
    } catch {
      return []
    }
  }
  // Legacy single string
  if (VALID_PROVIDERS.includes(raw as AIProviderType)) {
    return [raw as AIProviderType]
  }
  return []
}

function getAIConfig(userId: string): AIConfig {
  const db = getDb()
  const row = db
    .prepare("SELECT * FROM ai_config WHERE user_id = ?")
    .get(userId) as
    | {
        mcp_enabled: number
        chat_enabled: number
        chat_provider: string | null
        chat_model: string | null
      }
    | undefined

  if (!row) {
    return {
      mcpEnabled: false,
      chatEnabled: false,
      chatProvider: null,
      chatProviders: [],
      chatModel: null,
    }
  }

  const providers = parseChatProviders(row.chat_provider)

  return {
    mcpEnabled: row.mcp_enabled === 1,
    chatEnabled: row.chat_enabled === 1,
    chatProvider: providers[0] ?? null,
    chatProviders: providers,
    chatModel: row.chat_model,
  }
}

export async function GET() {
  try {
    const { user } = await requireAuthWithVault()
    const config = getAIConfig(user.id)
    return NextResponse.json(config)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const body = await request.json()
    const db = getDb()
    const now = new Date().toISOString()

    // Validate chatProviders array if provided
    if (body.chatProviders !== undefined) {
      if (!Array.isArray(body.chatProviders)) {
        return NextResponse.json(
          { error: "chatProviders must be an array" },
          { status: 400 }
        )
      }
      for (const p of body.chatProviders) {
        if (!VALID_PROVIDERS.includes(p)) {
          return NextResponse.json(
            { error: `Invalid provider: ${p}` },
            { status: 400 }
          )
        }
      }
    }

    // Legacy: also accept single chatProvider
    if (
      body.chatProvider !== undefined &&
      body.chatProvider !== null &&
      !VALID_PROVIDERS.includes(body.chatProvider)
    ) {
      return NextResponse.json(
        { error: "Invalid chat provider" },
        { status: 400 }
      )
    }

    const mcpEnabled =
      body.mcpEnabled !== undefined ? (body.mcpEnabled ? 1 : 0) : undefined
    const chatEnabled =
      body.chatEnabled !== undefined ? (body.chatEnabled ? 1 : 0) : undefined
    const chatModel =
      body.chatModel !== undefined ? body.chatModel : undefined

    // Resolve providers: prefer chatProviders array, fall back to legacy single
    let chatProviderValue: string | undefined
    if (body.chatProviders !== undefined) {
      chatProviderValue = JSON.stringify(body.chatProviders)
    } else if (body.chatProvider !== undefined) {
      // Legacy: convert single to array for storage
      chatProviderValue = body.chatProvider
        ? JSON.stringify([body.chatProvider])
        : undefined
    }

    const existing = db
      .prepare("SELECT user_id FROM ai_config WHERE user_id = ?")
      .get(user.id)

    if (existing) {
      const sets: string[] = []
      const values: unknown[] = []

      if (mcpEnabled !== undefined) {
        sets.push("mcp_enabled = ?")
        values.push(mcpEnabled)
      }
      if (chatEnabled !== undefined) {
        sets.push("chat_enabled = ?")
        values.push(chatEnabled)
      }
      if (chatProviderValue !== undefined) {
        sets.push("chat_provider = ?")
        values.push(chatProviderValue)
      }
      if (chatModel !== undefined) {
        sets.push("chat_model = ?")
        values.push(chatModel)
      }

      if (sets.length > 0) {
        sets.push("updated_at = ?")
        values.push(now)
        values.push(user.id)
        db.prepare(
          `UPDATE ai_config SET ${sets.join(", ")} WHERE user_id = ?`
        ).run(...values)
      }
    } else {
      db.prepare(
        `INSERT INTO ai_config (user_id, mcp_enabled, chat_enabled, chat_provider, chat_model, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        user.id,
        mcpEnabled ?? 0,
        chatEnabled ?? 0,
        chatProviderValue ?? null,
        chatModel ?? null,
        now
      )
    }

    const config = getAIConfig(user.id)
    return NextResponse.json(config)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
