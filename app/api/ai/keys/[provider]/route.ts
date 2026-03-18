import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { deleteProviderKey } from "@/lib/ai/key-store"
import type { AIProviderType } from "@/types"

const VALID_PROVIDERS: AIProviderType[] = [
  "openai",
  "anthropic",
  "openrouter",
]

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { user } = await requireAuthWithVault()
    const { provider } = await params

    if (!VALID_PROVIDERS.includes(provider as AIProviderType)) {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      )
    }

    deleteProviderKey(user.id, provider as AIProviderType)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
