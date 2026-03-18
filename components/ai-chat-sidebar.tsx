"use client"

import * as React from "react"
import { useAIChat } from "@/lib/stores/ai-chat-store"
import { AIChatMessageBubble } from "./ai-chat-message"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "@/components/ai/prompt-input"
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorName,
  ModelSelectorLogo,
} from "@/components/ai/model-selector"
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
} from "@/components/ai/attachments"
import type { AttachmentData } from "@/components/ai/attachments"
import type { AIChatAttachment, AIProviderType } from "@/types"
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  EllipsisVertical,
  Loader2,
  PaperclipIcon,
  PlusIcon,
  Sparkles,
  Trash2,
  ArrowLeftIcon,
  MessageSquareIcon,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextCacheUsage,
} from "@/components/ai/context"
import { useShortcutAction } from "@/lib/stores/shortcuts-store"

const WIDTH_STORAGE_KEY = "openvlt:ai-chat-width"
const STATE_STORAGE_KEY = "openvlt:ai-chat-open"
const DEFAULT_WIDTH = 380
const MIN_WIDTH = 280
const MAX_WIDTH = 600

function useAIChatWidth() {
  const [width, setWidth] = React.useState(DEFAULT_WIDTH)

  React.useEffect(() => {
    const saved = localStorage.getItem(WIDTH_STORAGE_KEY)
    if (saved) {
      const w = Number(saved)
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w)
    }
  }, [])

  const saveWidth = React.useCallback((w: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w))
    setWidth(clamped)
    localStorage.setItem(WIDTH_STORAGE_KEY, String(clamped))
  }, [])

  return { width, setWidth, saveWidth }
}

function AIChatResizeHandle({
  onResize,
  onResizeEnd,
}: {
  onResize: (width: number) => void
  onResizeEnd: (width: number) => void
}) {
  const dragging = React.useRef(false)
  const startX = React.useRef(0)
  const startWidth = React.useRef(0)

  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    dragging.current = true
    startX.current = e.clientX
    // Get the current width of the AI chat container
    const container = (e.target as HTMLElement).closest("[data-ai-chat]")
    startWidth.current = container?.getBoundingClientRect().width ?? 380
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    function onPointerMove(ev: PointerEvent) {
      if (!dragging.current) return
      // Dragging left (negative delta) = increase width
      const delta = startX.current - ev.clientX
      const width = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth.current + delta)
      )
      onResize(width)
    }

    function onPointerUp(ev: PointerEvent) {
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("pointerup", onPointerUp)

      const delta = startX.current - ev.clientX
      const width = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth.current + delta)
      )
      onResizeEnd(width)
    }

    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", onPointerUp)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute left-0 top-0 bottom-0 z-40 w-1 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/50"
    />
  )
}

interface ModelInfo {
  id: string
  name: string
  contextWindow?: number
  provider?: AIProviderType
  providerName?: string
  providerSlug?: string
}

interface ModelSelection {
  modelId: string
  provider: AIProviderType
}

function ChatModelSelector({
  selectedModel,
  onSelect,
  onModelsLoaded,
}: {
  selectedModel: ModelSelection | null
  onSelect: (selection: ModelSelection) => void
  onModelsLoaded?: (models: ModelInfo[]) => void
}) {
  const [models, setModels] = React.useState<ModelInfo[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setModels(data)
          onModelsLoaded?.(data)
          if (!selectedModel && data[0].provider) {
            onSelect({
              modelId: data[0].id,
              provider: data[0].provider,
            })
          }
        }
      })
      .catch(() => {})
  }, [])

  if (models.length === 0) return null

  const selected = models.find(
    (m) =>
      m.id === selectedModel?.modelId &&
      m.provider === selectedModel?.provider
  )

  // Group models by providerName
  const groups: { name: string; slug: string; models: ModelInfo[] }[] = []
  const seen = new Set<string>()
  for (const m of models) {
    const key = m.providerName || "Models"
    if (!seen.has(key)) {
      seen.add(key)
      groups.push({
        name: key,
        slug: m.providerSlug || "openai",
        models: models.filter((x) => (x.providerName || "Models") === key),
      })
    }
  }

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        >
          {selected?.providerSlug && (
            <ModelSelectorLogo provider={selected.providerSlug} />
          )}
          <ModelSelectorName className="max-w-[120px]">
            {selected?.name || "Select model"}
          </ModelSelectorName>
          <ChevronDownIcon className="size-3 opacity-50" />
        </Button>
      </ModelSelectorTrigger>
      <ModelSelectorContent>
        <ModelSelectorInput placeholder="Search models..." />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {groups.map((group) => (
            <ModelSelectorGroup key={group.name} heading={group.name}>
              {group.models.map((m) => {
                const isSelected =
                  selectedModel?.modelId === m.id &&
                  selectedModel?.provider === m.provider
                return (
                  <ModelSelectorItem
                    key={`${m.provider}:${m.id}`}
                    value={`${m.provider}:${m.id}`}
                    onSelect={() => {
                      onSelect({
                        modelId: m.id,
                        provider: m.provider!,
                      })
                      setOpen(false)
                    }}
                  >
                    <ModelSelectorLogo
                      provider={m.providerSlug || "openai"}
                    />
                    <ModelSelectorName>{m.name}</ModelSelectorName>
                    {isSelected ? (
                      <CheckIcon className="ml-auto size-4" />
                    ) : (
                      <div className="ml-auto size-4" />
                    )}
                  </ModelSelectorItem>
                )
              })}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  )
}

// Convert our attachment type to the shadcn AttachmentData type for display
function toAttachmentData(att: AIChatAttachment): AttachmentData {
  return {
    id: att.id,
    type: "file",
    filename: att.filename,
    mediaType: att.mediaType,
    url: att.dataUrl,
  }
}

// Supported image MIME types for direct model upload
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

// Text-based MIME types we can read content from
function isTextType(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript"
  )
}

function fileToAttachment(file: File): Promise<AIChatAttachment> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID()
    const base: AIChatAttachment = {
      id,
      type: IMAGE_TYPES.has(file.type) ? "image" : "file",
      filename: file.name,
      mediaType: file.type || "application/octet-stream",
    }

    if (IMAGE_TYPES.has(file.type)) {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({ ...base, dataUrl: reader.result as string })
      }
      reader.readAsDataURL(file)
    } else if (isTextType(file.type) || file.name.endsWith(".md")) {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({ ...base, type: "file", textContent: reader.result as string })
      }
      reader.readAsText(file)
    } else {
      resolve(base)
    }
  })
}

async function noteIdToAttachment(
  noteId: string,
  title: string
): Promise<AIChatAttachment> {
  // Fetch note content from the API
  try {
    const res = await fetch(`/api/notes/${noteId}`)
    if (res.ok) {
      const data = await res.json()
      return {
        id: noteId,
        type: "note",
        filename: title || data.title || "Untitled",
        mediaType: "text/markdown",
        noteId,
        textContent: data.content || "",
      }
    }
  } catch {
    // fallback
  }
  return {
    id: noteId,
    type: "note",
    filename: title || "Untitled",
    mediaType: "text/markdown",
    noteId,
  }
}

interface ConversationListItem {
  id: string
  title: string | null
  status: string
  updatedAt: string
  createdAt: string
}

function ChatHistory({
  onSelect,
  onBack,
}: {
  onSelect: (id: string) => void
  onBack: () => void
}) {
  const [conversations, setConversations] = React.useState<
    ConversationListItem[]
  >([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch("/api/ai/chat/conversations?list=true")
      .then((r) => r.json())
      .then((data) => {
        setConversations(data.conversations || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-sidebar-foreground"
          onClick={onBack}
        >
          <ArrowLeftIcon className="size-3.5" />
        </Button>
        <span className="text-sm font-medium text-sidebar-foreground">
          History
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground/40" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <MessageSquareIcon className="size-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          <div className="py-1">
            {conversations.map((conv) => {
              const date = new Date(conv.updatedAt || conv.createdAt)
              const timeStr = date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
              return (
                <button
                  key={conv.id}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sidebar-accent"
                  onClick={() => onSelect(conv.id)}
                >
                  <MessageSquareIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-sidebar-foreground">
                      {conv.title || "Untitled conversation"}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {timeStr}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function AIChatPanel() {
  const {
    messages,
    isStreaming,
    isReconnecting,
    error,
    usage,
    pendingAttachments,
    sendMessage,
    clearMessages,
    newChat,
    loadConversation,
    addAttachment,
    removeAttachment,
  } = useAIChat()

  const { width, setWidth, saveWidth } = useAIChatWidth()
  const [selectedModel, setSelectedModel] =
    React.useState<ModelSelection | null>(null)
  const [contextWindow, setContextWindow] = React.useState(272_000)
  const modelsRef = React.useRef<ModelInfo[]>([])
  const [isDragOver, setIsDragOver] = React.useState(false)
  const [showHistory, setShowHistory] = React.useState(false)
  const scrollAreaRef = React.useRef<HTMLDivElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const userScrolledUp = React.useRef(false)
  const prevMessagesLen = React.useRef(messages.length)

  // Get the actual scrollable viewport element from ScrollArea
  const getViewport = React.useCallback(() => {
    return scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    )
  }, [])

  const isAtBottom = React.useCallback(
    (el: HTMLElement) => {
      // Consider "at bottom" if within 30px of the bottom
      return el.scrollHeight - el.scrollTop - el.clientHeight < 30
    },
    []
  )

  const scrollToBottom = React.useCallback(() => {
    const viewport = getViewport()
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [getViewport])

  // When user sends a new message, always scroll to bottom and re-enable auto-scroll
  React.useEffect(() => {
    if (messages.length > prevMessagesLen.current) {
      const lastNew = messages[messages.length - 1]
      if (lastNew?.role === "user") {
        userScrolledUp.current = false
        // Use rAF to ensure DOM has updated
        requestAnimationFrame(scrollToBottom)
      }
    }
    prevMessagesLen.current = messages.length
  }, [messages.length, messages, scrollToBottom])

  // Auto-scroll as content streams in (message content changes)
  React.useEffect(() => {
    if (!userScrolledUp.current) {
      requestAnimationFrame(scrollToBottom)
    }
  }, [messages, scrollToBottom])

  // Listen for user scroll events to toggle auto-scroll
  React.useEffect(() => {
    const viewport = getViewport()
    if (!viewport) return

    const handleScroll = () => {
      userScrolledUp.current = !isAtBottom(viewport)
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [getViewport, isAtBottom])

  const handlePromptSubmit = React.useCallback(
    (message: { text: string }) => {
      if (!message.text.trim() || isStreaming) return
      sendMessage(
        message.text.trim(),
        selectedModel?.modelId,
        selectedModel?.provider
      )
    },
    [isStreaming, sendMessage, selectedModel]
  )

  const handleDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      // Handle notes dragged from the sidebar
      const noteData = e.dataTransfer.getData("application/openvlt-note")
      if (noteData) {
        try {
          const { noteId, title } = JSON.parse(noteData)
          const att = await noteIdToAttachment(noteId, title)
          addAttachment(att)
        } catch {
          // ignore malformed data
        }
        return
      }

      // Handle files dropped from the OS
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        const att = await fileToAttachment(file)
        addAttachment(att)
      }
    },
    [addAttachment]
  )

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = React.useCallback((e: React.DragEvent) => {
    // Only set false if leaving the container (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleFileSelect = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      for (const file of files) {
        const att = await fileToAttachment(file)
        addAttachment(att)
      }
      // Reset input so the same file can be selected again
      e.target.value = ""
    },
    [addAttachment]
  )

  return (
    <div
      data-ai-chat
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l bg-sidebar"
      style={{ width }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <AIChatResizeHandle
        onResize={setWidth}
        onResizeEnd={saveWidth}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/50 bg-primary/5">
          <div className="flex flex-col items-center gap-2 text-primary">
            <PaperclipIcon className="size-8" />
            <p className="text-sm font-medium">Drop to attach</p>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium text-sidebar-foreground">AI Chat</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-sidebar-foreground"
            onClick={() => {
              newChat()
              setShowHistory(false)
            }}
            title="New chat"
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-sidebar-foreground"
            onClick={() => setShowHistory((v) => !v)}
            title="Chat history"
          >
            <ClockIcon className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-sidebar-foreground"
              >
                <EllipsisVertical className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                variant="destructive"
                onClick={clearMessages}
              >
                <Trash2 className="size-3.5" />
                Delete conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {showHistory && (
        <div className="min-h-0 flex-1">
          <ChatHistory
            onSelect={(id) => {
              loadConversation(id)
              setShowHistory(false)
            }}
            onBack={() => setShowHistory(false)}
          />
        </div>
      )}

      {/* Messages area - min-h-0 is critical for flex shrink within h-svh */}
      <ScrollArea ref={scrollAreaRef} className={`min-h-0 flex-1 ${showHistory ? "hidden" : ""}`}>
        <div className="w-0 min-w-full">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-24 text-center">
              {isReconnecting ? (
                <>
                  <Loader2 className="size-6 animate-spin text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Loading conversation...
                  </p>
                </>
              ) : (
                <>
                  <Sparkles className="size-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Ask about your notes
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      The AI can search, read, create, and edit your notes.
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="py-2">
              {messages
                .filter((m) => m.role !== "system" && m.role !== "tool")
                .map((msg, i, arr) => (
                  <AIChatMessageBubble
                    key={i}
                    message={msg}
                    isStreaming={isStreaming && i === arr.length - 1}
                  />
                ))}
              {isStreaming && (() => {
                const visible = messages.filter(
                  (m) => m.role !== "system" && m.role !== "tool"
                )
                const last = visible[visible.length - 1]

                // Build a dynamic status label based on what's happening
                let statusLabel = ""
                if (last?.role === "assistant" && last.toolCalls?.length) {
                  const activeTc = last.toolCalls.find(
                    (tc) => tc.status === "executing"
                  )
                  if (activeTc) {
                    const readable = activeTc.name
                      .replace(/([a-z])([A-Z])/g, "$1 $2")
                      .replace(/_/g, " ")
                      .toLowerCase()
                    statusLabel = `Running ${readable}...`
                  }
                }

                // Always show spinner while isStreaming is true.
                // isStreaming only becomes false when the SSE stream
                // sends a "done" event, which is the definitive signal
                // that the agent has finished all work.
                return (
                  <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    {statusLabel && (
                      <span className="text-xs">{statusLabel}</span>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
          {error && (
            <div className="mx-4 mb-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input pinned to bottom */}
      <div className={`shrink-0 border-t p-3 ${showHistory ? "hidden" : ""}`}>
        {/* Pending attachments */}
        {pendingAttachments.length > 0 && (
          <div className="mb-2">
            <Attachments variant="inline">
              {pendingAttachments.map((att) => (
                <Attachment
                  key={att.id}
                  data={toAttachmentData(att)}
                  onRemove={() => removeAttachment(att.id)}
                >
                  <AttachmentPreview />
                  <AttachmentInfo />
                  <AttachmentRemove />
                </Attachment>
              ))}
            </Attachments>
          </div>
        )}
        <PromptInput
          onSubmit={handlePromptSubmit}
          className="rounded-lg border"
        >
          <PromptInputTextarea
            placeholder="Ask about your notes..."
            className="min-h-[40px] max-h-[120px] text-sm"
          />
          <PromptInputFooter>
            <PromptInputTools>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file"
                type="button"
              >
                <PaperclipIcon className="size-3.5" />
              </Button>
              <ChatModelSelector
                selectedModel={selectedModel}
                onSelect={(sel) => {
                  setSelectedModel(sel)
                  const model = modelsRef.current.find(
                    (m) =>
                      m.id === sel.modelId && m.provider === sel.provider
                  )
                  if (model?.contextWindow)
                    setContextWindow(model.contextWindow)
                }}
                onModelsLoaded={(loaded) => {
                  modelsRef.current = loaded
                  const first = loaded[0]
                  if (first?.contextWindow)
                    setContextWindow(first.contextWindow)
                }}
              />
            </PromptInputTools>
            <div className="flex items-center gap-1">
              {usage && (
                <Context
                  usedTokens={usage.inputTokens}
                  maxTokens={contextWindow}
                  usage={{
                    inputTokens: usage.inputTokens,
                    outputTokens: usage.outputTokens,
                    totalTokens: usage.totalTokens,
                    reasoningTokens: usage.reasoningTokens ?? 0,
                    cachedInputTokens: usage.cachedTokens ?? 0,
                    inputTokenDetails: {
                      noCacheTokens: undefined,
                      cacheReadTokens: undefined,
                      cacheWriteTokens: undefined,
                    },
                    outputTokenDetails: {
                      textTokens: undefined,
                      reasoningTokens: undefined,
                    },
                  }}
                >
                  <ContextTrigger className="h-7 px-1.5 text-xs" />
                  <ContextContent>
                    <ContextContentHeader />
                    <ContextContentBody>
                      <ContextInputUsage />
                      <ContextOutputUsage />
                      <ContextReasoningUsage />
                      <ContextCacheUsage />
                    </ContextContentBody>
                  </ContextContent>
                </Context>
              )}
              <PromptInputSubmit
                disabled={isStreaming}
                status={isStreaming ? "streaming" : undefined}
              />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}

export function AIChatSidebar() {
  const { isOpen, toggle } = useAIChat()
  const { width } = useAIChatWidth()
  const [shouldRender, setShouldRender] = React.useState(isOpen)
  const [isAnimating, setIsAnimating] = React.useState(false)
  const [targetOpen, setTargetOpen] = React.useState(isOpen)

  useShortcutAction("toggleAIChat", toggle)

  React.useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setIsAnimating(true)
      setTargetOpen(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTargetOpen(true)
        })
      })
      const timer = setTimeout(() => setIsAnimating(false), 200)
      return () => clearTimeout(timer)
    } else {
      setIsAnimating(true)
      setTargetOpen(false)
      const timer = setTimeout(() => {
        setShouldRender(false)
        setIsAnimating(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  if (!shouldRender) return null

  const wrapperStyle: React.CSSProperties = isAnimating
    ? { width: targetOpen ? width : 0 }
    : {}

  return (
    <div
      className={`shrink-0 overflow-hidden ${
        isAnimating ? "transition-[width] duration-200 ease-in-out" : ""
      }`}
      style={wrapperStyle}
    >
      <AIChatPanel />
    </div>
  )
}
