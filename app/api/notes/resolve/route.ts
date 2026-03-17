import { NextRequest, NextResponse } from "next/server"
import { resolveNoteByTitle } from "@/lib/notes"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

export async function GET(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const title = request.nextUrl.searchParams.get("title")

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Query parameter 'title' is required" },
        { status: 400 }
      )
    }

    const result = resolveNoteByTitle(title, user.id, vaultId)
    return NextResponse.json(result ?? { id: null })
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
