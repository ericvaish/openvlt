import { NextRequest, NextResponse } from "next/server"
import { searchNotesByTitle } from "@/lib/notes"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

export async function GET(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const q = request.nextUrl.searchParams.get("q")

    if (!q || typeof q !== "string") {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      )
    }

    const results = searchNotesByTitle(q, user.id, vaultId)
    return NextResponse.json(results)
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
