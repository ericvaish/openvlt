"use client"

import * as React from "react"
import type {
  AIChatMessage,
  AIChatAttachment,
  AIToolCall,
  AIProviderType,
  AIMessageRecord,
} from "@/types"
import type { ChatStreamEvent, TokenUsage } from "@/lib/ai/chat/service"

interface AIChatState {
  isOpen: boolean
  messages: AIChatMessage[]
  isStreaming: boolean
  error: string | null
  usage: TokenUsage | null
  pendingAttachments: AIChatAttachment[]
  conversationId: string | null
  isReconnecting: boolean
}

interface AIChatStore extends AIChatState {
  toggle: () => void
  open: () => void
  close: () => void
  sendMessage: (
    content: string,
    model?: string,
    provider?: AIProviderType
  ) => Promise<void>
  clearMessages: () => void
  newChat: () => void
  loadConversation: (conversationId: string) => Promise<void>
  addAttachment: (attachment: AIChatAttachment) => void
  removeAttachment: (id: string) => void
  clearAttachments: () => void
}

const OPEN_STATE_KEY = "openvlt:ai-chat-open"
const CONVERSATION_KEY = "openvlt:ai-conversation-id"

function dbMsgToAIChatMessage(record: AIMessageRecord): AIChatMessage {
  return {
    role: record.role,
    content: record.content,
    reasoning: record.reasoning,
    toolCalls: record.toolCalls,
    toolCallId: record.toolCallId,
    attachments: record.attachments,
  }
}

const AIChatContext = React.createContext<AIChatStore | null>(null)

export function AIChatProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AIChatState>({
    isOpen: false,
    messages: [],
    isStreaming: false,
    error: null,
    usage: null,
    pendingAttachments: [],
    conversationId: null,
    isReconnecting: false,
  })

  const abortRef = React.useRef<AbortController | null>(null)
  const mountedRef = React.useRef(true)

  // Restore persisted open state + load conversation from DB on mount
  React.useEffect(() => {
    mountedRef.current = true

    try {
      const openRaw = localStorage.getItem(OPEN_STATE_KEY)
      if (openRaw === "true") {
        setState((s) => ({ ...s, isOpen: true }))
      }
    } catch {}

    // Load active conversation from server
    loadConversation()

    return () => {
      mountedRef.current = false
    }
  }, [])

  // Persist isOpen
  React.useEffect(() => {
    try {
      localStorage.setItem(OPEN_STATE_KEY, String(state.isOpen))
    } catch {}
  }, [state.isOpen])

  // Persist conversationId
  React.useEffect(() => {
    try {
      if (state.conversationId) {
        localStorage.setItem(CONVERSATION_KEY, state.conversationId)
      } else {
        localStorage.removeItem(CONVERSATION_KEY)
      }
    } catch {}
  }, [state.conversationId])

  async function loadConversation() {
    try {
      setState((s) => ({ ...s, isReconnecting: true }))
      const res = await fetch("/api/ai/chat/conversations")
      if (!res.ok) {
        setState((s) => ({ ...s, isReconnecting: false }))
        return
      }

      const data = await res.json()
      if (!data.conversation) {
        setState((s) => ({ ...s, isReconnecting: false }))
        return
      }

      const conv = data.conversation
      const messages = (data.messages as AIMessageRecord[]).map(
        dbMsgToAIChatMessage
      )

      if (!mountedRef.current) return

      // Don't overwrite state if the user started a new action while we were loading
      setState((s) => {
        if (s.isStreaming || s.error) {
          return { ...s, isReconnecting: false }
        }
        return {
          ...s,
          conversationId: conv.id,
          messages,
          usage: conv.usage,
          error: conv.error,
          isReconnecting: conv.status === "generating",
        }
      })

      // If still generating, reconnect to the SSE stream
      if (conv.status === "generating") {
        reconnectToStream(conv.id)
      } else {
        setState((s) => ({ ...s, isReconnecting: false }))
      }
    } catch {
      if (mountedRef.current) {
        setState((s) => ({ ...s, isReconnecting: false }))
      }
    }
  }

  async function reconnectToStream(conversationId: string) {
    try {
      abortRef.current = new AbortController()

      const response = await fetch(
        `/api/ai/chat/conversations/${conversationId}/stream`,
        { signal: abortRef.current.signal }
      )

      if (!response.ok || !response.body) {
        setState((s) => ({ ...s, isStreaming: false, isReconnecting: false }))
        return
      }

      if (!mountedRef.current) return

      setState((s) => ({ ...s, isStreaming: true, isReconnecting: false }))

      await processSSEStream(response, conversationId)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setState((s) => ({ ...s, isStreaming: false, isReconnecting: false }))
        return
      }
      if (mountedRef.current) {
        setState((s) => ({ ...s, isStreaming: false, isReconnecting: false }))
      }
    }
  }

  async function processSSEStream(
    response: Response,
    _conversationId?: string
  ) {
    const reader = response.body?.getReader()
    if (!reader) return

    const decoder = new TextDecoder()
    let buffer = ""
    let currentContent = ""
    let currentReasoning = ""
    let currentToolCalls: AIToolCall[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (!data) continue

        try {
          const event = JSON.parse(data) as ChatStreamEvent

          switch (event.type) {
            case "conversation":
              // Conversation ID event (sent at start of new conversations)
              if (event.conversationId && mountedRef.current) {
                setState((s) => ({
                  ...s,
                  conversationId: event.conversationId!,
                }))
              }
              break

            case "text":
              currentContent += event.content || ""
              if (mountedRef.current) {
                setState((s) => {
                  const msgs = [...s.messages]
                  const last = msgs[msgs.length - 1]
                  if (last?.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      content: currentContent,
                      reasoning: currentReasoning || undefined,
                      toolCalls: currentToolCalls,
                    }
                  }
                  return { ...s, messages: msgs }
                })
              }
              break

            case "reasoning":
              currentReasoning += event.content || ""
              if (mountedRef.current) {
                setState((s) => {
                  const msgs = [...s.messages]
                  const last = msgs[msgs.length - 1]
                  if (last?.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      content: currentContent,
                      reasoning: currentReasoning,
                      toolCalls: currentToolCalls,
                    }
                  }
                  return { ...s, messages: msgs }
                })
              }
              break

            case "tool_call":
              currentToolCalls = [
                ...currentToolCalls,
                {
                  id: event.toolCallId || "",
                  name: event.name || "",
                  parameters: event.parameters || {},
                  status: "executing",
                },
              ]
              if (mountedRef.current) {
                setState((s) => {
                  const msgs = [...s.messages]
                  const last = msgs[msgs.length - 1]
                  if (last?.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      content: currentContent,
                      toolCalls: currentToolCalls,
                    }
                  }
                  return { ...s, messages: msgs }
                })
              }
              break

            case "tool_result": {
              const completedTc = currentToolCalls.find(
                (tc) => tc.id === event.toolCallId
              )
              currentToolCalls = currentToolCalls.map((tc) =>
                tc.id === event.toolCallId
                  ? {
                      ...tc,
                      result: event.result,
                      status: "completed" as const,
                    }
                  : tc
              )
              // Dispatch live-reload events for note modifications
              if (completedTc) {
                const result = event.result as
                  | Record<string, unknown>
                  | undefined

                if (
                  completedTc.name === "draw_excalidraw" &&
                  result?.pendingConversion &&
                  result?.skeletonElements
                ) {
                  window.dispatchEvent(
                    new CustomEvent("openvlt:excalidraw-skeleton", {
                      detail: {
                        noteId: result.noteId,
                        skeletonElements: result.skeletonElements,
                      },
                    })
                  )
                }

                if (
                  completedTc.name === "update_excalidraw" ||
                  completedTc.name === "update_note" ||
                  completedTc.name === "create_note"
                ) {
                  const noteId =
                    (completedTc.parameters.noteId as string) ||
                    (result?.id as string)
                  if (noteId) {
                    window.dispatchEvent(
                      new CustomEvent("openvlt:note-content-updated", {
                        detail: { noteId },
                      })
                    )
                    window.dispatchEvent(new Event("openvlt:tree-refresh"))
                  }
                }
              }
              if (mountedRef.current) {
                setState((s) => {
                  const msgs = [...s.messages]
                  const last = msgs[msgs.length - 1]
                  if (last?.role === "assistant") {
                    msgs[msgs.length - 1] = {
                      ...last,
                      content: currentContent,
                      toolCalls: currentToolCalls,
                    }
                  }
                  return { ...s, messages: msgs }
                })
              }
              break
            }

            case "done":
              if (event.usage && mountedRef.current) {
                const u = event.usage
                setState((s) => ({
                  ...s,
                  isStreaming: false,
                  usage: {
                    inputTokens: u.inputTokens,
                    outputTokens: u.outputTokens,
                    totalTokens: u.inputTokens + u.outputTokens,
                    reasoningTokens: u.reasoningTokens,
                    cachedTokens: u.cachedTokens,
                  },
                }))
              } else if (mountedRef.current) {
                setState((s) => ({ ...s, isStreaming: false }))
              }
              break

            case "error":
              if (mountedRef.current) {
                setState((s) => ({
                  ...s,
                  isStreaming: false,
                  error: event.content || "Unknown error",
                }))
              }
              break
          }
        } catch {
          // skip malformed events
        }
      }
    }

    if (mountedRef.current) {
      setState((s) => ({ ...s, isStreaming: false }))
    }
  }

  const toggle = React.useCallback(() => {
    setState((s) => ({ ...s, isOpen: !s.isOpen }))
  }, [])

  const open = React.useCallback(() => {
    setState((s) => ({ ...s, isOpen: true }))
  }, [])

  const close = React.useCallback(() => {
    setState((s) => ({ ...s, isOpen: false }))
  }, [])

  const clearMessages = React.useCallback(() => {
    // Delete conversation from server
    const convId = state.conversationId
    if (convId) {
      fetch(`/api/ai/chat/conversations/${convId}`, {
        method: "DELETE",
      }).catch(() => {})
    }

    setState((s) => ({
      ...s,
      messages: [],
      error: null,
      usage: null,
      pendingAttachments: [],
      conversationId: null,
    }))
  }, [state.conversationId])

  const newChat = React.useCallback(() => {
    setState((s) => ({
      ...s,
      messages: [],
      error: null,
      usage: null,
      pendingAttachments: [],
      conversationId: null,
    }))
  }, [])

  const loadConversationById = React.useCallback(
    async (conversationId: string) => {
      try {
        setState((s) => ({ ...s, isReconnecting: true }))
        const res = await fetch(
          `/api/ai/chat/conversations/${conversationId}`
        )
        if (!res.ok) {
          setState((s) => ({ ...s, isReconnecting: false }))
          return
        }

        const data = await res.json()
        if (!data.conversation) {
          setState((s) => ({ ...s, isReconnecting: false }))
          return
        }

        const conv = data.conversation
        const messages = (data.messages as AIMessageRecord[]).map(
          dbMsgToAIChatMessage
        )

        setState((s) => ({
          ...s,
          conversationId: conv.id,
          messages,
          usage: conv.usage,
          error: conv.error,
          isReconnecting: conv.status === "generating",
          isStreaming: false,
        }))

        if (conv.status === "generating") {
          reconnectToStream(conv.id)
        } else {
          setState((s) => ({ ...s, isReconnecting: false }))
        }
      } catch {
        setState((s) => ({ ...s, isReconnecting: false }))
      }
    },
    []
  )

  const addAttachment = React.useCallback(
    (attachment: AIChatAttachment) => {
      setState((s) => {
        if (s.pendingAttachments.some((a) => a.id === attachment.id)) return s
        return {
          ...s,
          pendingAttachments: [...s.pendingAttachments, attachment],
        }
      })
    },
    []
  )

  const removeAttachment = React.useCallback((id: string) => {
    setState((s) => ({
      ...s,
      pendingAttachments: s.pendingAttachments.filter((a) => a.id !== id),
    }))
  }, [])

  const clearAttachments = React.useCallback(() => {
    setState((s) => ({ ...s, pendingAttachments: [] }))
  }, [])

  const sendMessage = React.useCallback(
    async (
      content: string,
      model?: string,
      provider?: AIProviderType
    ) => {
      if (!content.trim()) return

      const attachments = state.pendingAttachments
      const userMessage: AIChatMessage = {
        role: "user",
        content,
        attachments: attachments.length > 0 ? attachments : undefined,
      }

      setState((s) => ({
        ...s,
        messages: [...s.messages, userMessage],
        isStreaming: true,
        error: null,
        pendingAttachments: [],
      }))

      const assistantMessage: AIChatMessage = {
        role: "assistant",
        content: "",
        toolCalls: [],
      }

      setState((s) => ({
        ...s,
        messages: [...s.messages, assistantMessage],
      }))

      try {
        abortRef.current = new AbortController()

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...state.messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
              ...(m.attachments?.length
                ? { attachments: m.attachments }
                : {}),
            })),
            conversationId: state.conversationId,
            ...(model ? { model } : {}),
            ...(provider ? { provider } : {}),
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          let errorMsg = "Request failed"
          try {
            const err = await response.json()
            errorMsg = err.error || `Request failed (${response.status})`
          } catch {
            errorMsg = `Request failed (${response.status})`
          }
          setState((s) => ({
            ...s,
            isStreaming: false,
            error: errorMsg,
            // Remove the empty assistant placeholder
            messages: s.messages.filter(
              (m, i) =>
                !(
                  i === s.messages.length - 1 &&
                  m.role === "assistant" &&
                  !m.content
                )
            ),
          }))
          return
        }

        await processSSEStream(response)
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          setState((s) => ({ ...s, isStreaming: false }))
          return
        }
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error"
        setState((s) => ({
          ...s,
          isStreaming: false,
          error: errorMsg,
        }))
      }
    },
    [state.messages, state.pendingAttachments, state.conversationId]
  )

  const store: AIChatStore = {
    ...state,
    toggle,
    open,
    close,
    sendMessage,
    clearMessages,
    newChat,
    loadConversation: loadConversationById,
    addAttachment,
    removeAttachment,
    clearAttachments,
  }

  return (
    <AIChatContext.Provider value={store}>{children}</AIChatContext.Provider>
  )
}

export function useAIChat(): AIChatStore {
  const ctx = React.useContext(AIChatContext)
  if (!ctx) {
    throw new Error("useAIChat must be used within an AIChatProvider")
  }
  return ctx
}
