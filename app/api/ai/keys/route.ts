import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAdmin, requireAuthWithVault } from "@/lib/auth/middleware"
import {
  saveProviderKey,
  listProviderKeys,
} from "@/lib/ai/key-store"
import type { AIProviderType } from "@/types"

const VALID_PROVIDERS: AIProviderType[] = [
  "openai",
  "anthropic",
  "openrouter",
]

export async function GET() {
  try {
    const user = await requireAdmin()
    const keys = listProviderKeys(user.id)
    return NextResponse.json(keys)
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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin()
    const body = await request.json()

    const provider = body.provider as AIProviderType
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider. Must be: openai, anthropic, or openrouter" },
        { status: 400 }
      )
    }

    if (!body.apiKey || typeof body.apiKey !== "string") {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      )
    }

    saveProviderKey(user.id, provider, body.apiKey.trim())
    return NextResponse.json({ success: true }, { status: 201 })
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
