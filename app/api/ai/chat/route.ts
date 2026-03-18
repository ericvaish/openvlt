import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import {
  validateChatConfig,
  startChat,
  createChatStream,
} from "@/lib/ai/chat/service"
import type { ChatStreamEvent } from "@/lib/ai/chat/service"
import {
  createConversation,
  addMessage,
  updateConversationStatus,
} from "@/lib/ai/chat/conversations"
import { startGeneration } from "@/lib/ai/chat/active-generations"
import type { AIProviderType } from "@/types"

export async function POST(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = await request.json()

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      )
    }

    const provider = body.provider as AIProviderType | undefined
    const model = body.model as string | undefined

    // Validate provider config before creating DB records
    const configError = await validateChatConfig(user.id, provider, model)
    if (configError) {
      return NextResponse.json({ error: configError }, { status: 400 })
    }

    // Create or reuse conversation
    let conversationId = body.conversationId as string | undefined
    if (!conversationId) {
      // Use the first user message as the conversation title
      const firstUserMsg = body.messages.find(
        (m: { role: string }) => m.role === "user"
      )
      const title = firstUserMsg?.content
        ? firstUserMsg.content.slice(0, 100).trim()
        : null
      conversationId = createConversation(
        user.id,
        vaultId,
        provider,
        model,
        title
      )
    }

    // Add user message to DB (the last message in the array is the new one)
    const lastMsg = body.messages[body.messages.length - 1]
    if (lastMsg) {
      addMessage(conversationId, {
        role: lastMsg.role,
        content: lastMsg.content,
        attachments: lastMsg.attachments,
      })
    }

    // Create empty assistant message placeholder in DB
    const assistantMessageId = addMessage(conversationId, {
      role: "assistant",
      content: "",
    })

    // Start generation (fire-and-forget, runs independently of this HTTP connection)
    startGeneration(conversationId, user.id, assistantMessageId)
    startChat(
      user.id,
      vaultId,
      conversationId,
      assistantMessageId,
      body.messages,
      provider,
      model
    )

    // Create SSE stream that tails the generation
    const stream = createChatStream(conversationId)

    // Prepend conversation ID event
    const convEvent: ChatStreamEvent = {
      type: "conversation",
      conversationId,
    }
    const prefix = `data: ${JSON.stringify(convEvent)}\n\n`

    const prefixedStream = new ReadableStream<string>({
      async start(controller) {
        controller.enqueue(prefix)

        const reader = stream.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
          controller.close()
        } catch {
          try {
            controller.close()
          } catch {
            // Already closed
          }
        }
      },
      cancel() {
        // Client disconnected; generation continues in background
      },
    })

    return new Response(prefixedStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Conversation-Id": conversationId,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
