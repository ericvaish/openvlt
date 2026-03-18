import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import {
  createApiToken,
  listApiTokens,
} from "@/lib/ai/mcp/auth"

export async function GET() {
  try {
    const { user } = await requireAuthWithVault()
    const tokens = listApiTokens(user.id)
    return NextResponse.json(tokens)
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
    const { user, vaultId } = await requireAuthWithVault()
    const body = await request.json()

    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json(
        { error: "Token name is required" },
        { status: 400 }
      )
    }

    const result = createApiToken(user.id, vaultId, body.name.trim())
    return NextResponse.json(result, { status: 201 })
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
