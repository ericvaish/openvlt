import type { AIProviderType, AIChatMessage } from "@/types"
import type { ToolDefinition } from "@/lib/ai/tool-types"

export interface ChatProviderParams {
  messages: AIChatMessage[]
  model: string
  tools: ToolDefinition[]
  /** User/vault context for providers that need it (e.g. Claude Code MCP) */
  context?: { userId: string; vaultId: string }
  onText: (chunk: string) => void
  onReasoning: (chunk: string) => void
  onToolCall: (
    id: string,
    name: string,
    args: Record<string, unknown>
  ) => void
  onToolResult: (id: string, name: string, result: unknown) => void
  onUsage: (usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    reasoningTokens?: number
    cachedTokens?: number
  }) => void
  onDone: () => void
  onError: (error: string) => void
  executeToolCall: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<unknown>
}

export interface ChatProvider {
  id: AIProviderType
  name: string
  models: { id: string; name: string }[]
  chat(apiKey: string, params: ChatProviderParams): Promise<void>
}

const registry = new Map<AIProviderType, () => Promise<ChatProvider>>()

registry.set("openai", async () => {
  const { OpenAIChatProvider } = await import("./openai")
  return OpenAIChatProvider
})

registry.set("anthropic", async () => {
  const { AnthropicChatProvider } = await import("./anthropic")
  return AnthropicChatProvider
})

registry.set("openrouter", async () => {
  const { OpenRouterChatProvider } = await import("./openrouter")
  return OpenRouterChatProvider
})

registry.set("codex", async () => {
  const { CodexChatProvider } = await import("./codex")
  return CodexChatProvider
})

registry.set("claude-code", async () => {
  const { ClaudeCodeChatProvider } = await import("./claude-code")
  return ClaudeCodeChatProvider
})

export async function getProvider(
  type: AIProviderType
): Promise<ChatProvider> {
  const loader = registry.get(type)
  if (!loader) {
    throw new Error(`Unknown AI provider: ${type}`)
  }
  return loader()
}

export function getAvailableProviders(): AIProviderType[] {
  return Array.from(registry.keys())
}
