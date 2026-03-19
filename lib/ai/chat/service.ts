import { getProvider } from "@/lib/ai/providers"
import { getProviderKey } from "@/lib/ai/key-store"
import { getToolDefinitions, executeTool } from "@/lib/ai/tools"
import type { ToolContext } from "@/lib/ai/tool-types"
import type { AIProviderType, AIChatMessage, AIConfig, AIToolCall } from "@/types"
import { getDb } from "@/lib/db"
import {
  updateAssistantMessage,
  updateConversationStatus,
} from "./conversations"
import {
  startGeneration,
  getGeneration,
  addListener,
  emitEvent,
  completeGeneration,
  failGeneration,
} from "./active-generations"

const VALID_PROVIDERS: AIProviderType[] = [
  "codex",
  "openai",
  "anthropic",
  "openrouter",
  "claude-code",
]

function parseChatProviders(raw: string | null): AIProviderType[] {
  if (!raw) return []
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr))
        return arr.filter((p: string) =>
          VALID_PROVIDERS.includes(p as AIProviderType)
        )
    } catch {
      return []
    }
  }
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

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens?: number
  cachedTokens?: number
}

export interface ChatStreamEvent {
  type:
    | "text"
    | "reasoning"
    | "tool_call"
    | "tool_result"
    | "done"
    | "error"
    | "conversation"
  content?: string
  conversationId?: string
  name?: string
  toolCallId?: string
  parameters?: Record<string, unknown>
  result?: unknown
  usage?: TokenUsage
}

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated into openvlt, a note-taking application. You have access to tools that let you read, create, search, and manage the user's notes and drawings. Be concise and helpful.

Rules:
- To edit an existing note, use update_note with the note's ID. Never create a new note when the user wants to edit an existing one.
- When a note is attached, its noteId is provided. Use that noteId directly.
- Only use create_note when explicitly asked to create a NEW note.
- When updating, first read the note, then send the complete updated content.
- For excalidraw drawings, use draw_excalidraw with skeleton elements. It supports colors, labels, arrows, and all shapes.`

/**
 * Resolve provider, API key, and model from config + overrides.
 * Returns null with an error string if something is missing.
 */
async function resolveProvider(
  userId: string,
  providerOverride?: AIProviderType,
  modelOverride?: string
) {
  const config = getAIConfig(userId)
  const providerType = providerOverride || config.chatProvider

  if (!providerType) {
    return { error: "No AI provider configured. Set one in Settings > AI." }
  }

  const provider = await getProvider(providerType)

  let apiKey = ""
  if (providerType === "codex") {
    apiKey = "codex"
  } else if (providerType === "claude-code") {
    apiKey = "claude-code"
  } else {
    const key = getProviderKey(userId, providerType)
    if (!key) {
      return {
        error: `No API key configured for ${provider.name}. Add one in Settings > AI.`,
      }
    }
    apiKey = key
  }

  const model = modelOverride || config.chatModel || provider.models[0]?.id
  if (!model) {
    return { error: "No model selected." }
  }

  return { provider, providerType, apiKey, model }
}

/**
 * Start a chat generation that runs independently of any HTTP connection.
 * Writes events to the active-generations registry and periodically flushes to DB.
 * This function is fire-and-forget: it catches its own errors.
 */
export function startChat(
  userId: string,
  vaultId: string,
  conversationId: string,
  assistantMessageId: string,
  messages: AIChatMessage[],
  providerOverride?: AIProviderType,
  modelOverride?: string
): void {
  // Fire-and-forget: run the generation and catch all errors
  void runGeneration(
    userId,
    vaultId,
    conversationId,
    assistantMessageId,
    messages,
    providerOverride,
    modelOverride
  )
}

async function runGeneration(
  userId: string,
  vaultId: string,
  conversationId: string,
  assistantMessageId: string,
  messages: AIChatMessage[],
  providerOverride?: AIProviderType,
  modelOverride?: string
): Promise<void> {
  let resolved: Awaited<ReturnType<typeof resolveProvider>>
  try {
    resolved = await resolveProvider(userId, providerOverride, modelOverride)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to resolve AI provider"
    emitEvent(conversationId, { type: "error", content: msg })
    emitEvent(conversationId, { type: "done" })
    failGeneration(conversationId, msg)
    updateConversationStatus(conversationId, "error", undefined, msg)
    return
  }

  if ("error" in resolved) {
    const errMsg = resolved.error as string
    emitEvent(conversationId, { type: "error", content: errMsg })
    emitEvent(conversationId, { type: "done" })
    failGeneration(conversationId, errMsg)
    updateConversationStatus(conversationId, "error", undefined, errMsg)
    return
  }

  const { provider, apiKey, model } = resolved
  const toolDefs = getToolDefinitions()
  const toolCtx: ToolContext = { userId, vaultId }

  const systemMessage: AIChatMessage = {
    role: "system",
    content: SYSTEM_PROMPT,
  }
  const fullMessages = [systemMessage, ...messages]

  // Accumulated state for DB flushes
  let currentContent = ""
  let currentReasoning = ""
  let lastUsage: TokenUsage | undefined
  let currentToolCalls: AIToolCall[] = []
  let lastFlush = Date.now()
  const FLUSH_INTERVAL = 500 // ms

  function flushToDb() {
    try {
      updateAssistantMessage(assistantMessageId, {
        content: currentContent,
        reasoning: currentReasoning || undefined,
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
      })
    } catch {
      // DB write failed, not critical for streaming
    }
    lastFlush = Date.now()
  }

  function maybeFlush() {
    if (Date.now() - lastFlush >= FLUSH_INTERVAL) {
      flushToDb()
    }
  }

  // 5-minute timeout
  const timeoutId = setTimeout(() => {
    emitEvent(conversationId, {
      type: "error",
      content: "Generation timed out after 5 minutes",
    })
    emitEvent(conversationId, { type: "done" })
    flushToDb()
    failGeneration(conversationId, "Generation timed out after 5 minutes")
    updateConversationStatus(
      conversationId,
      "error",
      undefined,
      "Generation timed out after 5 minutes"
    )
  }, 5 * 60 * 1000)

  try {
    updateConversationStatus(conversationId, "generating")

    await provider.chat(apiKey, {
      messages: fullMessages,
      model,
      tools: toolDefs,
      context: toolCtx,
      onText: (chunk) => {
        currentContent += chunk
        emitEvent(conversationId, { type: "text", content: chunk })
        maybeFlush()
      },
      onReasoning: (chunk) => {
        currentReasoning += chunk
        emitEvent(conversationId, { type: "reasoning", content: chunk })
        maybeFlush()
      },
      onToolCall: (id, name, args) => {
        currentToolCalls = [
          ...currentToolCalls,
          { id, name, parameters: args, status: "executing" as const },
        ]
        emitEvent(conversationId, {
          type: "tool_call",
          toolCallId: id,
          name,
          parameters: args,
        })
        flushToDb()
      },
      onToolResult: (id, name, result) => {
        currentToolCalls = currentToolCalls.map((tc) =>
          tc.id === id
            ? { ...tc, result, status: "completed" as const }
            : tc
        )
        emitEvent(conversationId, {
          type: "tool_result",
          toolCallId: id,
          name,
          result,
        })
        flushToDb()
      },
      onUsage: (usage) => {
        lastUsage = usage
        const event: ChatStreamEvent = { type: "done", usage }
        emitEvent(conversationId, event)
      },
      onDone: () => {
        // Final flush + complete
        clearTimeout(timeoutId)
        flushToDb()
        emitEvent(conversationId, { type: "done" })
        completeGeneration(conversationId)
        updateConversationStatus(conversationId, "completed", lastUsage)
      },
      onError: (error) => {
        clearTimeout(timeoutId)
        flushToDb()
        emitEvent(conversationId, { type: "error", content: error })
        emitEvent(conversationId, { type: "done" })
        failGeneration(conversationId, error)
        updateConversationStatus(conversationId, "error", undefined, error)
      },
      executeToolCall: async (name, args) => {
        return executeTool(name, args, toolCtx)
      },
    })

    // If provider.chat resolved without calling onDone (shouldn't happen, but safety)
    clearTimeout(timeoutId)
    const gen = getGeneration(conversationId)
    if (gen && !gen.done) {
      flushToDb()
      emitEvent(conversationId, { type: "done" })
      completeGeneration(conversationId)
      updateConversationStatus(conversationId, "completed")
    }
  } catch (error) {
    clearTimeout(timeoutId)
    const msg = error instanceof Error ? error.message : "Unknown error"
    flushToDb()
    emitEvent(conversationId, { type: "error", content: msg })
    emitEvent(conversationId, { type: "done" })
    failGeneration(conversationId, msg)
    updateConversationStatus(conversationId, "error", undefined, msg)
  }
}

/**
 * Create an SSE ReadableStream that tails an active generation.
 * Replays any events that have already occurred (for reconnection),
 * then subscribes for new events.
 * If the generation is already done, replays all events and closes.
 */
export function createChatStream(
  conversationId: string
): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      const gen = getGeneration(conversationId)

      if (!gen) {
        // Generation not found (already cleaned up or never existed)
        const event: ChatStreamEvent = { type: "done" }
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        controller.close()
        return
      }

      // Replay buffered events
      for (const event of gen.events) {
        try {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        } catch {
          return // Stream closed during replay
        }
      }

      if (gen.done) {
        // Generation already completed during replay
        try {
          controller.close()
        } catch {
          // Already closed
        }
        return
      }

      // Subscribe for new events
      const unsubscribe = addListener(conversationId, (event) => {
        try {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
          if (event.type === "done") {
            unsubscribe()
            try {
              controller.close()
            } catch {
              // Already closed
            }
          }
        } catch {
          // Stream closed by client disconnect, just unsubscribe
          unsubscribe()
        }
      })
    },
    cancel() {
      // Client disconnected. The generation continues; we just stop sending.
    },
  })
}

/**
 * Legacy wrapper: resolves provider and returns an error stream if config is bad.
 * Used by the chat route for initial validation before starting the generation.
 */
export async function validateChatConfig(
  userId: string,
  providerOverride?: AIProviderType,
  modelOverride?: string
): Promise<string | null> {
  const resolved = await resolveProvider(userId, providerOverride, modelOverride)
  if ("error" in resolved) return resolved.error as string
  return null
}

function createErrorStream(message: string): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      const event: ChatStreamEvent = { type: "error", content: message }
      controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
      controller.close()
    },
  })
}

/**
 * Kept for backwards compatibility. Wraps startChat + createChatStream.
 */
export async function streamChat(
  userId: string,
  vaultId: string,
  messages: AIChatMessage[],
  providerOverride?: AIProviderType,
  modelOverride?: string,
  conversationId?: string,
  assistantMessageId?: string
): Promise<ReadableStream<string>> {
  // If no conversationId provided, fall back to non-persistent mode
  if (!conversationId || !assistantMessageId) {
    const error = await validateChatConfig(userId, providerOverride, modelOverride)
    if (error) return createErrorStream(error)

    // Legacy: create a temporary generation that isn't DB-backed
    const tempConvId = `temp-${Date.now()}`
    const tempMsgId = `temp-msg-${Date.now()}`
    startGeneration(tempConvId, userId, tempMsgId)
    startChat(userId, vaultId, tempConvId, tempMsgId, messages, providerOverride, modelOverride)
    return createChatStream(tempConvId)
  }

  // Persistent mode
  startGeneration(conversationId, userId, assistantMessageId)
  startChat(
    userId,
    vaultId,
    conversationId,
    assistantMessageId,
    messages,
    providerOverride,
    modelOverride
  )
  return createChatStream(conversationId)
}
