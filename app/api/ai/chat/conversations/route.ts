import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import {
  getActiveConversation,
  getConversation,
  getMessages,
  listConversations,
  clearConversations,
  updateConversationStatus,
} from "@/lib/ai/chat/conversations"
import { getGeneration } from "@/lib/ai/chat/active-generations"

export async function GET(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { searchParams } = request.nextUrl

    // If ?list=true, return all conversations (for history panel)
    if (searchParams.get("list") === "true") {
      const conversations = listConversations(user.id, vaultId)
      return NextResponse.json({ conversations })
    }

    // Default: return the most recent active conversation (for page load recovery)
    let conversation = getActiveConversation(user.id, vaultId)
    if (!conversation) {
      return NextResponse.json({ conversation: null, messages: [] })
    }

    // If status is "generating" but no in-memory generation exists (server restarted),
    // mark as error and re-query for clean data
    if (conversation.status === "generating") {
      const gen = getGeneration(conversation.id)
      if (!gen) {
        updateConversationStatus(
          conversation.id,
          "error",
          undefined,
          "Generation was interrupted by a server restart"
        )
        conversation = getConversation(conversation.id, user.id, vaultId)!
      }
    }

    const messages = getMessages(conversation.id, user.id, vaultId)

    return NextResponse.json({ conversation, messages })
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

export async function DELETE() {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    clearConversations(user.id, vaultId)
    return NextResponse.json({ success: true })
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
