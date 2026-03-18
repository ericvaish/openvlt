import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { getConversation, updateConversationStatus } from "@/lib/ai/chat/conversations"
import { getGeneration } from "@/lib/ai/chat/active-generations"
import { createChatStream } from "@/lib/ai/chat/service"
import type { ChatStreamEvent } from "@/lib/ai/chat/service"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { conversationId } = await params

    const conversation = getConversation(conversationId, user.id, vaultId)
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    const generation = getGeneration(conversationId)

    if (!generation) {
      // No in-memory generation. If DB says "generating", server restarted mid-stream.
      if (conversation.status === "generating") {
        updateConversationStatus(
          conversationId,
          "error",
          undefined,
          "Generation was interrupted by a server restart"
        )
      }

      // Return a done-only stream so client knows to read from DB
      const doneStream = new ReadableStream<string>({
        start(controller) {
          const event: ChatStreamEvent = { type: "done" }
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
          controller.close()
        },
      })

      return new Response(doneStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    // Generation is active, create a tailing stream (replays + subscribes)
    const stream = createChatStream(conversationId)

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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
