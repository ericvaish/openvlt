/**
 * Codex CLI token reuse provider.
 *
 * Uses the OAuth token from the Codex CLI (~/.codex/auth.json) to make
 * requests to chatgpt.com/backend-api/codex/responses (Responses API).
 * Billed against the user's ChatGPT subscription.
 *
 * This is NOT officially supported by OpenAI and may break at any time.
 * To remove: delete this file, remove "codex" from the provider registry
 * in index.ts, and remove the Codex option from the settings UI.
 */

import fs from "fs"
import path from "path"
import os from "os"
import type { ChatProvider, ChatProviderParams } from "./index"
import type { AIChatMessage } from "@/types"
import type { ToolDefinition } from "@/lib/ai/tool-types"

const CODEX_AUTH_PATH = path.join(os.homedir(), ".codex", "auth.json")
const CODEX_RESPONSES_URL =
  "https://chatgpt.com/backend-api/codex/responses"

interface CodexAuth {
  access_token: string
  refresh_token?: string
  expires_at?: number
  account_id?: string
}

export function getCodexToken(): CodexAuth | null {
  try {
    if (!fs.existsSync(CODEX_AUTH_PATH)) return null
    const raw = fs.readFileSync(CODEX_AUTH_PATH, "utf-8")
    const data = JSON.parse(raw)
    if (!data.access_token) return null
    return data as CodexAuth
  } catch {
    return null
  }
}

export function isCodexAvailable(): boolean {
  return getCodexToken() !== null
}

/**
 * Convert our chat messages into the Responses API `input` format.
 * System messages become the `instructions` field (handled separately).
 */
function buildResponsesInput(
  messages: AIChatMessage[]
): Record<string, unknown>[] {
  const input: Record<string, unknown>[] = []

  for (const m of messages) {
    if (m.role === "system") continue

    if (m.role === "user") {
      const contentParts: Record<string, unknown>[] = []

      // Add text content
      contentParts.push({ type: "input_text", text: m.content })

      // Add attachments
      if (m.attachments?.length) {
        for (const att of m.attachments) {
          if (att.type === "image" && att.dataUrl) {
            // Extract base64 data from data URL
            const match = att.dataUrl.match(
              /^data:([^;]+);base64,(.+)$/
            )
            if (match) {
              contentParts.push({
                type: "input_image",
                image_url: att.dataUrl,
              })
            }
          } else if (att.textContent) {
            // Notes and text files: inject as context text
            const header = att.noteId
              ? `Attached note: "${att.filename}" (noteId: ${att.noteId})`
              : `Attached file: ${att.filename}`
            contentParts.push({
              type: "input_text",
              text: `\n---\n${header}\n${att.textContent}\n---`,
            })
          }
        }
      }

      input.push({
        type: "message",
        role: "user",
        content: contentParts,
      })
    } else if (m.role === "assistant") {
      if (m.toolCalls?.length) {
        // Add function call outputs for each tool call
        for (const tc of m.toolCalls) {
          input.push({
            type: "function_call",
            id: tc.id,
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.parameters),
          })
        }
      }
      if (m.content) {
        input.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: m.content }],
        })
      }
    } else if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.toolCallId || "",
        output: m.content,
      })
    }
  }

  return input
}

function buildResponsesTools(
  tools: ToolDefinition[]
): Record<string, unknown>[] {
  return tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

function getSystemInstructions(messages: AIChatMessage[]): string {
  const systemMsgs = messages.filter((m) => m.role === "system")
  return (
    systemMsgs.map((m) => m.content).join("\n") ||
    "You are a helpful assistant."
  )
}

async function parseSSEStream(
  response: Response,
  onEvent: (eventType: string, data: Record<string, unknown>) => void
) {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ""
  let currentEventType = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim()
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6).trim()
        if (data === "[DONE]") continue
        try {
          onEvent(currentEventType, JSON.parse(data))
        } catch {
          // skip malformed
        }
      }
    }
  }
}

export const CodexChatProvider: ChatProvider = {
  id: "codex",
  name: "ChatGPT (via Codex)",
  models: [
    { id: "gpt-5.4", name: "GPT-5.4" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
    { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { id: "gpt-5.2", name: "GPT-5.2" },
    { id: "gpt-5.1", name: "GPT-5.1" },
    { id: "gpt-5", name: "GPT-5" },
  ],
  chat: async (_apiKey, params) => {
    const auth = getCodexToken()
    if (!auth) {
      params.onError(
        "ChatGPT not connected. Go to Settings > AI and sign in."
      )
      return
    }

    const instructions = getSystemInstructions(params.messages)
    const tools = buildResponsesTools(params.tools)

    // Build conversation input from all messages
    let input = buildResponsesInput(params.messages)

    let continueLoop = true

    while (continueLoop) {
      continueLoop = false

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.access_token}`,
      }
      if (auth.account_id) {
        headers["ChatGPT-Account-Id"] = auth.account_id
      }

      const body: Record<string, unknown> = {
        model: params.model,
        instructions,
        input,
        store: false,
        stream: true,
        reasoning: { summary: "auto" },
      }

      // Always include web_search alongside our custom tools
      const allTools: Record<string, unknown>[] = [
        { type: "web_search" },
        ...tools,
      ]
      if (allTools.length > 0) {
        body.tools = allTools
      }

      const response = await fetch(CODEX_RESPONSES_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errText = await response.text()
        params.onError(
          `ChatGPT API error (${response.status}): ${errText.slice(0, 200)}`
        )
        return
      }

      // Track function calls from the stream
      const functionCalls: Map<
        string,
        { id: string; callId: string; name: string; args: string }
      > = new Map()

      await parseSSEStream(
        response,
        (eventType: string, data: Record<string, unknown>) => {
          switch (eventType) {
            case "response.output_text.delta": {
              const delta = data.delta as string | undefined
              if (delta) {
                params.onText(delta)
              }
              break
            }

            case "response.reasoning_summary_text.delta": {
              const delta = data.delta as string | undefined
              if (delta) {
                params.onReasoning(delta)
              }
              break
            }

            case "response.web_search_call.searching": {
              const itemId = data.item_id as string | undefined
              if (itemId) {
                params.onToolCall(itemId, "web_search", {})
              }
              break
            }

            case "response.web_search_call.completed": {
              const itemId = data.item_id as string | undefined
              if (itemId) {
                params.onToolResult(itemId, "web_search", { status: "completed" })
              }
              break
            }

            case "response.output_item.added": {
              const item = data.item as {
                type?: string
                id?: string
                call_id?: string
                name?: string
              } | undefined
              if (item?.type === "function_call" && item.id) {
                functionCalls.set(item.id, {
                  id: item.id,
                  callId: item.call_id || item.id,
                  name: item.name || "",
                  args: "",
                })
              }
              break
            }

            case "response.function_call_arguments.delta": {
              const itemId = data.item_id as string | undefined
              const delta = data.delta as string | undefined
              if (itemId && delta) {
                const fc = functionCalls.get(itemId)
                if (fc) {
                  fc.args += delta
                }
              }
              break
            }

            case "response.output_item.done": {
              const item = data.item as {
                type?: string
                id?: string
                call_id?: string
                name?: string
                arguments?: string
              } | undefined
              if (item?.type === "function_call" && item.id) {
                const fc = functionCalls.get(item.id)
                if (fc && item.arguments) {
                  fc.args = item.arguments
                }
              }
              break
            }

            case "response.completed": {
              const resp = data.response as {
                usage?: {
                  input_tokens?: number
                  output_tokens?: number
                  total_tokens?: number
                  output_tokens_details?: {
                    reasoning_tokens?: number
                  }
                  input_tokens_details?: {
                    cached_tokens?: number
                  }
                }
              } | undefined
              if (resp?.usage) {
                const u = resp.usage
                params.onUsage({
                  inputTokens: u.input_tokens ?? 0,
                  outputTokens: u.output_tokens ?? 0,
                  totalTokens: u.total_tokens ?? 0,
                  reasoningTokens: u.output_tokens_details?.reasoning_tokens,
                  cachedTokens: u.input_tokens_details?.cached_tokens,
                })
              }
              break
            }
          }
        }
      )

      // Process any function calls
      if (functionCalls.size > 0) {
        for (const fc of functionCalls.values()) {
          let parsedArgs: Record<string, unknown> = {}
          try {
            parsedArgs = JSON.parse(fc.args)
          } catch {
            // empty
          }

          params.onToolCall(fc.callId, fc.name, parsedArgs)
          const result = await params.executeToolCall(fc.name, parsedArgs)
          params.onToolResult(fc.callId, fc.name, result)

          // Add the function call and result to input for the next turn
          input.push({
            type: "function_call",
            id: fc.id,
            call_id: fc.callId,
            name: fc.name,
            arguments: fc.args,
          })
          input.push({
            type: "function_call_output",
            call_id: fc.callId,
            output: JSON.stringify(result),
          })
        }

        continueLoop = true
      }
    }

    params.onDone()
  },
}
