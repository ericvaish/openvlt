"use client"

import * as React from "react"
import { Streamdown } from "streamdown"
import { cn } from "@/lib/utils"
import type { AIChatMessage, AIToolCall } from "@/types"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai/reasoning"
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from "@/components/ai/chain-of-thought"
import { Actions, Action } from "@/components/ai/actions"
import {
  Commit,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
  CommitContent,
  CommitFiles,
  CommitFile,
  CommitFileInfo,
  CommitFileStatus,
  CommitFileIcon,
  CommitFilePath,
  CommitFileChanges,
  CommitFileAdditions,
  CommitFileDeletions,
} from "@/components/ai/commit"
import {
  SearchIcon,
  GlobeIcon,
  WrenchIcon,
  ListIcon,
  FileTextIcon,
  FilePlusIcon,
  FileEditIcon,
  Trash2Icon,
  FolderIcon,
  TagIcon,
  PencilIcon,
  CopyIcon,
  RefreshCcwIcon,
  ImageIcon,
  TerminalIcon,
  CodeIcon,
  EyeIcon,
  SquarePenIcon,
  FileSearchIcon,
  BotIcon,
} from "lucide-react"

import type { LucideIcon } from "lucide-react"

// Tool metadata for display
const TOOL_CONFIG: Record<
  string,
  {
    icon: LucideIcon
    label: (params: Record<string, unknown>) => string
  }
> = {
  web_search: {
    icon: GlobeIcon,
    label: () => "Searching the web",
  },
  search_notes: {
    icon: SearchIcon,
    label: (p) => `Searching for "${p.query || "..."}"`,
  },
  list_notes: {
    icon: ListIcon,
    label: () => "Listing notes",
  },
  get_note: {
    icon: FileTextIcon,
    label: () => "Reading note",
  },
  create_note: {
    icon: FilePlusIcon,
    label: (p) => (p.title ? `Creating "${p.title}"` : "Creating note"),
  },
  update_note: {
    icon: FileEditIcon,
    label: () => "Updating note",
  },
  delete_note: {
    icon: Trash2Icon,
    label: () => "Moving to trash",
  },
  list_folders: {
    icon: FolderIcon,
    label: () => "Listing folders",
  },
  list_tags: {
    icon: TagIcon,
    label: () => "Listing tags",
  },
  get_excalidraw: {
    icon: PencilIcon,
    label: () => "Reading canvas",
  },
  update_excalidraw: {
    icon: PencilIcon,
    label: () => "Updating canvas",
  },
  // Claude Code SDK tools
  Bash: {
    icon: TerminalIcon,
    label: (p) => {
      const cmd = (p.command as string) || ""
      const short = cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd
      return short ? `Running \`${short}\`` : "Running command"
    },
  },
  Grep: {
    icon: FileSearchIcon,
    label: (p) => (p.pattern ? `Searching for "${p.pattern}"` : "Searching files"),
  },
  Glob: {
    icon: FileSearchIcon,
    label: (p) => (p.pattern ? `Finding files: ${p.pattern}` : "Finding files"),
  },
  Read: {
    icon: EyeIcon,
    label: (p) => {
      const fp = (p.file_path as string) || ""
      const name = fp.split("/").pop() || fp
      return name ? `Reading ${name}` : "Reading file"
    },
  },
  Write: {
    icon: SquarePenIcon,
    label: (p) => {
      const fp = (p.file_path as string) || ""
      const name = fp.split("/").pop() || fp
      return name ? `Writing ${name}` : "Writing file"
    },
  },
  Edit: {
    icon: FileEditIcon,
    label: (p) => {
      const fp = (p.file_path as string) || ""
      const name = fp.split("/").pop() || fp
      return name ? `Editing ${name}` : "Editing file"
    },
  },
  Agent: {
    icon: BotIcon,
    label: (p) => (p.description as string) || "Running agent",
  },
  WebFetch: {
    icon: GlobeIcon,
    label: (p) => {
      const url = (p.url as string) || ""
      try {
        return `Fetching ${new URL(url).hostname}`
      } catch {
        return "Fetching URL"
      }
    },
  },
  WebSearch: {
    icon: SearchIcon,
    label: (p) => (p.query ? `Searching "${p.query}"` : "Searching the web"),
  },
  LSP: {
    icon: CodeIcon,
    label: () => "Analyzing code",
  },
  ToolSearch: {
    icon: SearchIcon,
    label: (p) => (p.query ? `Looking up tool: ${p.query}` : "Searching for tools"),
  },
  draw_excalidraw: {
    icon: PencilIcon,
    label: () => "Drawing on canvas",
  },
}

// Auto-pick an icon based on tool name patterns
function inferToolIcon(name: string): LucideIcon {
  const n = name.toLowerCase()
  if (n.includes("search") || n.includes("find") || n.includes("grep") || n.includes("glob")) return SearchIcon
  if (n.includes("read") || n.includes("get") || n.includes("view") || n.includes("list")) return EyeIcon
  if (n.includes("write") || n.includes("create") || n.includes("add")) return FilePlusIcon
  if (n.includes("edit") || n.includes("update") || n.includes("modify")) return FileEditIcon
  if (n.includes("delete") || n.includes("remove") || n.includes("trash")) return Trash2Icon
  if (n.includes("bash") || n.includes("exec") || n.includes("run") || n.includes("command") || n.includes("shell")) return TerminalIcon
  if (n.includes("web") || n.includes("fetch") || n.includes("http") || n.includes("url")) return GlobeIcon
  if (n.includes("draw") || n.includes("canvas") || n.includes("excalidraw") || n.includes("diagram")) return PencilIcon
  if (n.includes("folder") || n.includes("dir")) return FolderIcon
  if (n.includes("tag") || n.includes("label")) return TagIcon
  if (n.includes("code") || n.includes("lsp") || n.includes("analyze")) return CodeIcon
  if (n.includes("agent") || n.includes("bot")) return BotIcon
  if (n.includes("file") || n.includes("note") || n.includes("doc")) return FileTextIcon
  return WrenchIcon
}

// Auto-generate a human-readable label from a tool name
function inferToolLabel(name: string, params: Record<string, unknown>): string {
  // Try to extract a meaningful parameter to include in the label
  const meaningfulParam =
    (params.query as string) ||
    (params.pattern as string) ||
    (params.file_path as string)?.split("/").pop() ||
    (params.title as string) ||
    (params.description as string) ||
    (params.command as string)

  // Convert tool name to readable form: "search_notes" -> "Searching notes"
  // PascalCase: "ToolSearch" -> "Tool search"
  const readable = name
    .replace(/([a-z])([A-Z])/g, "$1 $2") // PascalCase -> spaces
    .replace(/_/g, " ") // snake_case -> spaces
    .toLowerCase()

  // Try to make it a gerund (verb-ing form)
  const words = readable.split(" ")
  if (words.length > 0) {
    const verb = words[0]
    const rest = words.slice(1).join(" ")
    // Simple gerund: add -ing
    const gerund =
      verb.endsWith("e") ? verb.slice(0, -1) + "ing" :
      verb.endsWith("ch") || verb.endsWith("sh") ? verb + "ing" :
      verb + "ing"
    const label = rest ? `${gerund.charAt(0).toUpperCase() + gerund.slice(1)} ${rest}` : gerund.charAt(0).toUpperCase() + gerund.slice(1)

    if (meaningfulParam) {
      const short = meaningfulParam.length > 30 ? meaningfulParam.slice(0, 30) + "..." : meaningfulParam
      return `${label}: ${short}`
    }
    return label
  }

  return name
}

function getToolConfig(name: string): {
  icon: LucideIcon
  label: (params: Record<string, unknown>) => string
} {
  if (TOOL_CONFIG[name]) return TOOL_CONFIG[name]

  // Auto-generate config for any unknown tool
  const icon = inferToolIcon(name)
  return {
    icon,
    label: (params) => inferToolLabel(name, params),
  }
}

function getStepStatus(
  tc: AIToolCall
): "complete" | "active" | "pending" {
  if (tc.status === "completed" || tc.status === "error") return "complete"
  if (tc.status === "executing") return "active"
  return "pending"
}

// Mutative tool names that change documents
const MUTATIVE_TOOLS = new Set([
  "create_note",
  "update_note",
  "delete_note",
  "update_excalidraw",
  "draw_excalidraw",
])

interface ChangedFile {
  name: string
  status: "added" | "modified" | "deleted"
  additions: number
  deletions: number
}

function extractChangedFiles(toolCalls: AIToolCall[]): ChangedFile[] {
  const files: ChangedFile[] = []
  const seen = new Set<string>()

  for (const tc of toolCalls) {
    if (!MUTATIVE_TOOLS.has(tc.name) || tc.status !== "completed") continue

    const title =
      (tc.parameters.title as string) ||
      (tc.parameters.noteId as string)?.slice(0, 8) ||
      "Untitled"
    const filename =
      tc.name === "update_excalidraw"
        ? `${title}.excalidraw`
        : `${title}.md`

    if (seen.has(filename)) continue
    seen.add(filename)

    const content = (tc.parameters.content as string) || ""
    const lines = content ? content.split("\n").length : 0

    if (tc.name === "create_note") {
      files.push({ name: filename, status: "added", additions: lines, deletions: 0 })
    } else if (tc.name === "delete_note") {
      files.push({ name: filename, status: "deleted", additions: 0, deletions: 1 })
    } else {
      files.push({ name: filename, status: "modified", additions: lines, deletions: 0 })
    }
  }

  return files
}

// Extract note titles from search_notes / list_notes results
function extractNoteTitles(result: unknown): string[] {
  if (!result) return []
  if (Array.isArray(result)) {
    return result
      .filter((r) => r && typeof r === "object" && "title" in r)
      .map((r) => (r as { title: string }).title)
      .slice(0, 6)
  }
  return []
}

// Extract a one-line summary from a tool call result
function getToolResultDescription(tc: AIToolCall): string | undefined {
  if (tc.status !== "completed" || !tc.result) return undefined
  const r = tc.result as Record<string, unknown>

  switch (tc.name) {
    case "search_notes": {
      const results = Array.isArray(tc.result) ? tc.result : []
      if (results.length === 0) return "No results found"
      return `Found ${results.length} matching note${results.length > 1 ? "s" : ""}`
    }
    case "list_notes": {
      const notes = Array.isArray(tc.result) ? tc.result : []
      return `${notes.length} note${notes.length !== 1 ? "s" : ""} in vault`
    }
    case "get_note":
      return r.title ? `Read "${r.title}"` : "Note loaded"
    case "get_excalidraw": {
      const scene = r.scene as Record<string, unknown> | undefined
      return (scene?.description as string) || "Canvas loaded"
    }
    case "create_note":
      return r.title ? `Created "${r.title}"` : "Note created"
    case "update_note":
      return r.titleUpdated ? "Title and content updated" : "Content updated"
    case "update_excalidraw":
      return "Canvas saved"
    case "draw_excalidraw":
      return r.pendingConversion ? "Diagram added to canvas" : "Canvas updated"
    case "delete_note":
      return "Moved to trash"
    case "list_folders": {
      const tree = r.tree as unknown[] | undefined
      return tree ? `${tree.length} folder${tree.length !== 1 ? "s" : ""}` : "Folders loaded"
    }
    case "list_tags": {
      const tags = Array.isArray(tc.result) ? tc.result : []
      return `${tags.length} tag${tags.length !== 1 ? "s" : ""}`
    }
    case "web_search":
    case "WebSearch":
      return "Web results retrieved"
    case "Bash": {
      const exitCode = r.exitCode ?? r.exit_code
      return exitCode === 0 ? "Command succeeded" : `Exited with code ${exitCode}`
    }
    case "Grep": {
      const output = (r.output as string) || ""
      const lines = output.split("\n").filter(Boolean)
      return lines.length > 0
        ? `Found ${lines.length} match${lines.length > 1 ? "es" : ""}`
        : "No matches found"
    }
    case "Glob": {
      const files = Array.isArray(r) ? r : (r.files as string[]) || []
      return files.length > 0
        ? `Found ${files.length} file${files.length > 1 ? "s" : ""}`
        : "No files found"
    }
    case "Read":
      return "File contents loaded"
    case "Write":
      return "File written"
    case "Edit":
      return "File edited"
    case "Agent":
      return "Agent completed"
    case "WebFetch":
      return "Page fetched"
    case "LSP":
      return "Analysis complete"
    case "ToolSearch":
      return "Tools loaded"
    default:
      if (r.error) return `Error: ${r.error}`
      if (r.success) return "Completed"
      return undefined
  }
}

function formatToolOutput(result: unknown): string {
  if (result === undefined || result === null) return ""
  if (typeof result === "string") return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}

function ToolCallStep({ toolCall }: { toolCall: AIToolCall }) {
  const config = getToolConfig(toolCall.name)
  const label = config.label(toolCall.parameters)
  const status = getStepStatus(toolCall)
  const description = getToolResultDescription(toolCall)
  const [showOutput, setShowOutput] = React.useState(false)

  // Show search results as badges for search/list tools
  const showResultBadges =
    (toolCall.name === "search_notes" || toolCall.name === "list_notes") &&
    toolCall.result !== undefined
  const resultTitles = showResultBadges
    ? extractNoteTitles(toolCall.result)
    : []

  const hasOutput = toolCall.result !== undefined && toolCall.status === "completed"
  const rawOutput = hasOutput ? formatToolOutput(toolCall.result) : ""

  return (
    <ChainOfThoughtStep
      icon={config.icon}
      label={label}
      description={
        description ? (
          <span>
            {description}
            {hasOutput && rawOutput.length > 0 && (
              <>
                {" "}
                <button
                  onClick={() => setShowOutput(!showOutput)}
                  className="text-xs text-primary/70 hover:text-primary underline-offset-2 hover:underline"
                >
                  {showOutput ? "hide" : "show output"}
                </button>
              </>
            )}
          </span>
        ) : hasOutput && rawOutput.length > 0 ? (
          <button
            onClick={() => setShowOutput(!showOutput)}
            className="text-xs text-primary/70 hover:text-primary underline-offset-2 hover:underline"
          >
            {showOutput ? "hide output" : "show output"}
          </button>
        ) : undefined
      }
      status={status}
    >
      {showOutput && rawOutput && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-xs text-muted-foreground">
          {rawOutput}
        </pre>
      )}
      {resultTitles.length > 0 && (
        <ChainOfThoughtSearchResults>
          {resultTitles.map((title) => (
            <ChainOfThoughtSearchResult key={title}>
              {title}
            </ChainOfThoughtSearchResult>
          ))}
        </ChainOfThoughtSearchResults>
      )}
    </ChainOfThoughtStep>
  )
}

function ToolCallsChain({ toolCalls }: { toolCalls: AIToolCall[] }) {
  const allComplete = toolCalls.every(
    (tc) => tc.status === "completed" || tc.status === "error"
  )
  const stepCount = toolCalls.length

  return (
    <ChainOfThought
      defaultOpen={!allComplete}
      open={allComplete ? undefined : true}
    >
      <ChainOfThoughtHeader>
        {allComplete
          ? `Used ${stepCount} tool${stepCount > 1 ? "s" : ""}`
          : "Working..."}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {toolCalls.map((tc) => (
          <ToolCallStep key={tc.id} toolCall={tc} />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}

export function AIChatMessageBubble({
  message,
  isStreaming = false,
}: {
  message: AIChatMessage
  isStreaming?: boolean
}) {
  const isUser = message.role === "user"
  const hasContent = !!message.content?.trim()
  const hasToolCalls = !!message.toolCalls?.length
  const hasReasoning = !!message.reasoning

  // Don't render empty assistant messages with no tool calls or reasoning
  if (!isUser && !hasContent && !hasToolCalls && !hasReasoning) return null

  // User messages: right-aligned bubble
  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-2">
        <div className="max-w-[85%] space-y-1">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1">
              {message.attachments.map((att) => (
                <span
                  key={att.id}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {att.type === "image" ? (
                    <ImageIcon className="size-3" />
                  ) : (
                    <FileTextIcon className="size-3" />
                  )}
                  {att.filename}
                </span>
              ))}
            </div>
          )}
          <div className="inline-block rounded-xl bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
            <p className="whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Assistant messages: render a generic timeline of segments
  // This handles any combination of reasoning, tool calls, and text in any order.
  return (
    <div className="min-w-0 px-4 py-2">
      <div className="min-w-0 space-y-2">
        {/* Reasoning shown first if present */}
        {hasReasoning && (
          <Reasoning isStreaming={isStreaming && !hasContent}>
            <ReasoningTrigger />
            <ReasoningContent>{message.reasoning!}</ReasoningContent>
          </Reasoning>
        )}

        {/* Tool calls as chain of thought */}
        {hasToolCalls && (
          <ToolCallsChain toolCalls={message.toolCalls!} />
        )}

        {/* Response text */}
        {hasContent && (
          <div className="overflow-hidden rounded-xl bg-muted px-3.5 py-2.5 text-sm text-foreground">
            <Streamdown
              mode={isStreaming ? "streaming" : "static"}
              className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-pre:overflow-x-auto prose-headings:my-2"
            >
              {message.content}
            </Streamdown>
          </div>
        )}

        {/* Action buttons */}
        {hasContent && !isStreaming && (
          <Actions>
            <Action
              tooltip="Copy"
              onClick={() => navigator.clipboard.writeText(message.content)}
            >
              <CopyIcon className="size-4" />
            </Action>
            <Action tooltip="Retry">
              <RefreshCcwIcon className="size-4" />
            </Action>
          </Actions>
        )}

        {/* Document changes summary - shown last as a recap */}
        {hasToolCalls && !isStreaming && (() => {
          const changedFiles = extractChangedFiles(message.toolCalls!)
          if (changedFiles.length === 0) return null
          const totalFiles = changedFiles.length
          const totalAdds = changedFiles.reduce((s, f) => s + f.additions, 0)
          const totalDels = changedFiles.reduce((s, f) => s + f.deletions, 0)
          return (
            <Commit>
              <CommitHeader>
                <CommitInfo>
                  <CommitMessage>
                    {totalFiles === 1
                      ? `Updated ${changedFiles[0].name}`
                      : `Updated ${totalFiles} documents`}
                  </CommitMessage>
                  <CommitMetadata>
                    <span>
                      {totalAdds > 0 && <span className="text-green-600">+{totalAdds}</span>}
                      {totalAdds > 0 && totalDels > 0 && " "}
                      {totalDels > 0 && <span className="text-red-600">-{totalDels}</span>}
                      {totalAdds === 0 && totalDels === 0 && "no line changes"}
                    </span>
                  </CommitMetadata>
                </CommitInfo>
              </CommitHeader>
              <CommitContent>
                <CommitFiles>
                  {changedFiles.map((f) => (
                    <CommitFile key={f.name}>
                      <CommitFileInfo>
                        <CommitFileStatus status={f.status} />
                        <CommitFileIcon />
                        <CommitFilePath>{f.name}</CommitFilePath>
                      </CommitFileInfo>
                      <CommitFileChanges>
                        <CommitFileAdditions count={f.additions} />
                        <CommitFileDeletions count={f.deletions} />
                      </CommitFileChanges>
                    </CommitFile>
                  ))}
                </CommitFiles>
              </CommitContent>
            </Commit>
          )
        })()}
      </div>
    </div>
  )
}
