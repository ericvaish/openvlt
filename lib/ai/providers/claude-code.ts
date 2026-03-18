/**
 * Claude Code provider.
 *
 * Spawns `claude --print` as a subprocess with openvlt's MCP server connected
 * via `--mcp-config`. The CLI gets access to note tools (search_notes,
 * create_note, draw_excalidraw, etc.) through MCP and is restricted to ONLY
 * those tools via `--allowedTools`.
 *
 * Tool definitions come from `lib/ai/tools.ts` (single source of truth).
 * The MCP server (`lib/ai/mcp/server.ts`) wraps those same tools.
 * Adding a tool to `tools.ts` automatically makes it available here AND
 * in all other providers (OpenAI, Anthropic, OpenRouter, Codex).
 *
 * Authentication: Claude Code's own login (Max subscription via OS keychain).
 * See /docs/claude-code-integration.md for full details on why we use the CLI
 * instead of direct API calls.
 */

import { spawn, execSync, type ChildProcess } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import type { ChatProvider } from "./index"
import type { AIChatMessage } from "@/types"
import { getToolDefinitions } from "@/lib/ai/tools"
import { createApiToken, revokeApiToken } from "@/lib/ai/mcp/auth"
import { DB_PATH } from "@/lib/constants"

// ── Prompt builder ──

function buildPromptFromMessages(messages: AIChatMessage[]): string {
  const parts: string[] = []

  for (const m of messages) {
    if (m.role === "system") {
      parts.push(`[System]\n${m.content}`)
    } else if (m.role === "user") {
      let text = m.content
      if (m.attachments?.length) {
        const attachmentTexts = m.attachments
          .filter((a) => a.textContent)
          .map((a) => `--- ${a.filename} ---\n${a.textContent}`)
        if (attachmentTexts.length > 0) {
          text = `${attachmentTexts.join("\n\n")}\n\n${text}`
        }
      }
      parts.push(text)
    } else if (m.role === "assistant") {
      parts.push(`[Assistant]\n${m.content}`)
    }
  }

  return parts.join("\n\n")
}

// ── Paths ──

function getClaudeBinaryPath(): string {
  return path.join(process.cwd(), "node_modules", ".bin", "claude")
}

function getMcpBinaryPath(): string {
  return path.join(process.cwd(), "bin", "openvlt-mcp.ts")
}

// ── MCP config ──

/**
 * Build the `--allowedTools` value dynamically from the tool definitions.
 * Tools are prefixed with `mcp__openvlt__` by Claude Code's MCP integration.
 */
function buildAllowedToolsList(): string {
  const toolDefs = getToolDefinitions()
  return toolDefs.map((t) => `mcp__openvlt__${t.name}`).join(",")
}

/**
 * Build the system prompt that tells Claude Code to use MCP tools.
 * Tool names are listed dynamically from the tool definitions.
 */
function buildMcpSystemPrompt(): string {
  const toolDefs = getToolDefinitions()
  const toolList = toolDefs
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n")

  return `You are integrated into openvlt, a note-taking application. You have access to openvlt tools via MCP that let you manage the user's notes and drawings.

IMPORTANT: Always use the openvlt MCP tools for note operations. Do NOT use Bash, Read, Write, or other file system tools to access notes.

Available openvlt MCP tools:
${toolList}

Rules:
- To edit an existing note, use update_note with the note's ID. Never create a new note when the user wants to edit an existing one.
- When a note is attached, its noteId is provided. Use that noteId directly.
- Only use create_note when explicitly asked to create a NEW note.
- When updating, first read the note with get_note, then send the complete updated content.
- For excalidraw drawings, use draw_excalidraw with skeleton elements. It supports colors, labels, arrows, and all shapes.`
}

/**
 * Create a temporary MCP config file for the Claude Code subprocess.
 * The MCP server is run via `npx tsx` since it's TypeScript with path aliases
 * and uses `better-sqlite3` (which requires Node, not Bun).
 */
function createMcpConfig(apiToken: string): {
  configPath: string
  cleanup: () => void
} {
  const config = {
    mcpServers: {
      openvlt: {
        command: "npx",
        args: ["tsx", getMcpBinaryPath()],
        env: {
          OPENVLT_API_TOKEN: apiToken,
          OPENVLT_DB_PATH: DB_PATH,
        },
      },
    },
  }

  const configPath = path.join(
    os.tmpdir(),
    `openvlt-mcp-${Date.now()}.json`
  )
  fs.writeFileSync(configPath, JSON.stringify(config))

  return {
    configPath,
    cleanup: () => {
      try {
        fs.unlinkSync(configPath)
      } catch {
        // ignore
      }
    },
  }
}

// ── Auth check ──

/** Check if Claude Code CLI is available and authenticated */
export async function isClaudeCodeAvailable(): Promise<{
  installed: boolean
  authenticated: boolean
}> {
  try {
    const raw = execSync(
      `${getClaudeBinaryPath()} auth status 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim()
    const status = JSON.parse(raw)
    return {
      installed: true,
      authenticated: status.loggedIn === true,
    }
  } catch {
    return { installed: false, authenticated: false }
  }
}

// ── Provider ──

export const ClaudeCodeChatProvider: ChatProvider = {
  id: "claude-code",
  name: "Claude Code",
  models: [
    { id: "sonnet", name: "Claude Sonnet (latest)" },
    { id: "opus", name: "Claude Opus (latest)" },
    { id: "haiku", name: "Claude Haiku (latest)" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  ],
  chat: async (_apiKey, params) => {
    const prompt = buildPromptFromMessages(params.messages)

    // Create a temporary MCP token for this session
    let mcpToken: { id: string; token: string; prefix: string } | null =
      null
    let mcpConfig: { configPath: string; cleanup: () => void } | null = null

    if (params.context) {
      try {
        mcpToken = createApiToken(
          params.context.userId,
          params.context.vaultId,
          `claude-code-session-${Date.now()}`
        )
        mcpConfig = createMcpConfig(mcpToken.token)
      } catch {
        params.onError(
          "Failed to create MCP session. Check that MCP is enabled in settings."
        )
        params.onDone()
        return
      }
    } else {
      params.onError("Missing user context for Claude Code session.")
      params.onDone()
      return
    }

    const systemPrompt = buildMcpSystemPrompt()
    const allowedTools = buildAllowedToolsList()

    const args = [
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--model",
      params.model,
      "--no-session-persistence",
      "--dangerously-skip-permissions",
      "--append-system-prompt",
      systemPrompt,
      "--mcp-config",
      mcpConfig.configPath,
      // allowedTools is variadic so it MUST be last before stdin prompt
      "--allowedTools",
      allowedTools,
    ]

    const env: NodeJS.ProcessEnv = { ...process.env }

    const cleanup = () => {
      mcpConfig?.cleanup()
      if (mcpToken && params.context) {
        try {
          revokeApiToken(mcpToken.id, params.context.userId)
        } catch {
          // ignore
        }
      }
    }

    return new Promise<void>((resolve) => {
      const proc: ChildProcess = spawn(getClaudeBinaryPath(), args, {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      })

      let stderr = ""
      let buffer = ""
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let finished = false
      let hasEmittedText = false // Track if we've already emitted text (for newline separation)
      // Track tool_use IDs to their names for matching results
      const toolIdToName = new Map<string, string>()

      const finish = () => {
        if (finished) return
        finished = true
        params.onDone()
        resolve()
      }

      // 5 minute timeout
      const timer = setTimeout(() => {
        proc.kill()
        cleanup()
        params.onError("Claude Code timed out after 5 minutes")
        finish()
      }, 300_000)

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString()
      })

      proc.stdout?.on("data", (data: Buffer) => {
        buffer += data.toString()

        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const event = JSON.parse(trimmed)

            switch (event.type) {
              // Assistant message: contains text and tool_use blocks
              case "assistant": {
                if (Array.isArray(event.message?.content)) {
                  for (const block of event.message.content) {
                    if (block.type === "text") {
                      // Claude Code interleaves text between tool calls.
                      // Add paragraph break between separate assistant turns.
                      if (hasEmittedText && block.text) {
                        params.onText("\n\n")
                      }
                      params.onText(block.text)
                      if (block.text) hasEmittedText = true
                    } else if (block.type === "tool_use") {
                      const toolName = (block.name as string).replace(
                        /^mcp__openvlt__/,
                        ""
                      )
                      // Track tool ID → name for result matching
                      toolIdToName.set(block.id, toolName)
                      params.onToolCall(
                        block.id,
                        toolName,
                        block.input || {}
                      )
                    }
                  }
                }
                if (event.message?.usage) {
                  totalInputTokens +=
                    event.message.usage.input_tokens || 0
                  totalOutputTokens +=
                    event.message.usage.output_tokens || 0
                }
                break
              }

              // User message: contains tool_result blocks (MCP tool results)
              case "user": {
                if (Array.isArray(event.message?.content)) {
                  for (const block of event.message.content) {
                    if (
                      block.type === "tool_result" &&
                      block.tool_use_id
                    ) {
                      const toolName =
                        toolIdToName.get(block.tool_use_id) || ""
                      // Parse the tool result content
                      let resultData: unknown = block.content
                      if (Array.isArray(block.content)) {
                        const textBlock = block.content.find(
                          (c: { type: string }) => c.type === "text"
                        )
                        if (textBlock?.text) {
                          try {
                            resultData = JSON.parse(textBlock.text)
                          } catch {
                            resultData = textBlock.text
                          }
                        }
                      }
                      params.onToolResult(
                        block.tool_use_id,
                        toolName,
                        resultData
                      )
                    }
                  }
                }
                break
              }

              // Final result: usage stats only (text already streamed)
              case "result": {
                if (event.usage) {
                  totalInputTokens =
                    event.usage.input_tokens || totalInputTokens
                  totalOutputTokens =
                    event.usage.output_tokens || totalOutputTokens
                }
                break
              }

              case "system":
              case "rate_limit_event":
                break

              default:
                break
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      })

      proc.on("close", (code: number | null) => {
        clearTimeout(timer)
        cleanup()

        if (totalInputTokens > 0 || totalOutputTokens > 0) {
          params.onUsage({
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
          })
        }

        if (code !== 0 && stderr.trim()) {
          params.onError(
            `Claude Code exited with code ${code}: ${stderr.trim().slice(0, 500)}`
          )
        }
        finish()
      })

      proc.on("error", (err: Error) => {
        clearTimeout(timer)
        cleanup()
        params.onError(`Failed to start Claude Code: ${err.message}`)
        finish()
      })

      // Write prompt via stdin (not positional arg) because
      // --allowedTools is variadic and would consume it
      proc.stdin?.write(prompt)
      proc.stdin?.end()
    })
  },
}
