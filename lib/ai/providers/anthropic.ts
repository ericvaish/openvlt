import Anthropic from "@anthropic-ai/sdk"
import type { ChatProvider, ChatProviderParams } from "./index"
import type { AIChatMessage } from "@/types"
import type { ToolDefinition } from "@/lib/ai/tool-types"

function toAnthropicMessages(
  messages: AIChatMessage[]
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = []

  for (const m of messages) {
    if (m.role === "system") continue

    if (m.role === "tool") {
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId || "",
            content: m.content,
          },
        ],
      })
      continue
    }

    if (m.role === "assistant" && m.toolCalls?.length) {
      const content: Anthropic.ContentBlockParam[] = []
      if (m.content) {
        content.push({ type: "text", text: m.content })
      }
      for (const tc of m.toolCalls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.parameters,
        })
      }
      result.push({ role: "assistant", content })
      continue
    }

    result.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    })
  }

  return result
}

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }))
}

function getSystemPrompt(messages: AIChatMessage[]): string | undefined {
  const systemMsg = messages.find((m) => m.role === "system")
  return systemMsg?.content
}

export const AnthropicChatProvider: ChatProvider = {
  id: "anthropic",
  name: "Anthropic",
  models: [
    { id: "claude-sonnet-4-5-20250514", name: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { id: "claude-opus-4-6-20250619", name: "Claude Opus 4.6" },
    { id: "claude-sonnet-4-6-20250514", name: "Claude Sonnet 4.6" },
  ],
  chat: async (apiKey, params) => {
    const client = new Anthropic({ apiKey })

    const system = getSystemPrompt(params.messages)
    const messages = toAnthropicMessages(params.messages)
    const tools = toAnthropicTools(params.tools)

    let continueLoop = true

    while (continueLoop) {
      continueLoop = false

      const stream = client.messages.stream({
        model: params.model,
        max_tokens: 4096,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        ...(system ? { system } : {}),
      })

      const pendingToolUses: {
        id: string
        name: string
        input: string
      }[] = []
      let currentToolName = ""
      let currentToolId = ""

      stream.on("text", (text) => {
        params.onText(text)
      })

      stream.on("inputJson", (json) => {
        const last = pendingToolUses[pendingToolUses.length - 1]
        if (last) {
          last.input += json
        }
      })

      stream.on("contentBlock", (block) => {
        if (block.type === "tool_use") {
          currentToolId = block.id
          currentToolName = block.name
          pendingToolUses.push({
            id: block.id,
            name: block.name,
            input: "",
          })
        }
      })

      const finalMessage = await stream.finalMessage()

      if (finalMessage.stop_reason === "tool_use") {
        const assistantContent: Anthropic.ContentBlockParam[] = []
        for (const block of finalMessage.content) {
          if (block.type === "text") {
            assistantContent.push({ type: "text", text: block.text })
          } else if (block.type === "tool_use") {
            assistantContent.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            })
          }
        }
        messages.push({ role: "assistant", content: assistantContent })

        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of finalMessage.content) {
          if (block.type !== "tool_use") continue

          const args = block.input as Record<string, unknown>
          params.onToolCall(block.id, block.name, args)
          const result = await params.executeToolCall(block.name, args)
          params.onToolResult(block.id, block.name, result)

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }

        messages.push({ role: "user", content: toolResults })
        continueLoop = true
      }
    }

    params.onDone()
  },
}
