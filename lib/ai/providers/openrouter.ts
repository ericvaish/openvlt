import OpenAI from "openai"
import type { ChatProvider, ChatProviderParams } from "./index"
import type { AIChatMessage } from "@/types"
import type { ToolDefinition } from "@/lib/ai/tool-types"

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

function toOpenAIMessages(
  messages: AIChatMessage[]
): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        content: m.content,
        tool_call_id: m.toolCallId || "",
      }
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant" as const,
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.parameters),
          },
        })),
      }
    }
    return {
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }
  })
}

function toOpenAITools(
  tools: ToolDefinition[]
): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as unknown as Record<string, unknown>,
    },
  }))
}

export const OpenRouterChatProvider: ChatProvider = {
  id: "openrouter",
  name: "OpenRouter",
  models: [
    { id: "openai/gpt-5.4", name: "GPT-5.4" },
    { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini" },
    { id: "anthropic/claude-sonnet-4-5-20250514", name: "Claude Sonnet 4.5" },
    { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
  ],
  chat: async (apiKey, params) => {
    const client = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        "HTTP-Referer": "https://openvlt.com",
        "X-Title": "openvlt",
      },
    })

    const messages = toOpenAIMessages(params.messages)
    const tools = toOpenAITools(params.tools)

    let continueLoop = true

    while (continueLoop) {
      continueLoop = false

      const stream = await client.chat.completions.create({
        model: params.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
      })

      let currentToolCalls: Map<
        number,
        { id: string; name: string; args: string }
      > = new Map()

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta

        if (delta?.content) {
          params.onText(delta.content)
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = currentToolCalls.get(tc.index)
            if (!existing) {
              currentToolCalls.set(tc.index, {
                id: tc.id || "",
                name: tc.function?.name || "",
                args: tc.function?.arguments || "",
              })
            } else {
              if (tc.id) existing.id = tc.id
              if (tc.function?.name) existing.name += tc.function.name
              if (tc.function?.arguments)
                existing.args += tc.function.arguments
            }
          }
        }

        if (chunk.choices[0]?.finish_reason === "tool_calls") {
          const assistantToolCalls = Array.from(currentToolCalls.values())

          messages.push({
            role: "assistant",
            content: null,
            tool_calls: assistantToolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.args },
            })),
          })

          for (const tc of assistantToolCalls) {
            let parsedArgs: Record<string, unknown> = {}
            try {
              parsedArgs = JSON.parse(tc.args)
            } catch {
              // empty
            }

            params.onToolCall(tc.id, tc.name, parsedArgs)
            const result = await params.executeToolCall(tc.name, parsedArgs)
            params.onToolResult(tc.id, tc.name, result)

            messages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: tc.id,
            })
          }

          currentToolCalls = new Map()
          continueLoop = true
        }
      }
    }

    params.onDone()
  },
}
