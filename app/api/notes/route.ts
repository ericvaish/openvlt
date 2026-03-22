import { NextRequest, NextResponse } from "next/server"
import {
  createNote,
  listNotes,
  listAllNotes,
  listTrashedNotes,
  listFavoriteNotes,
  searchNotes,
} from "@/lib/notes"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

export async function GET(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { searchParams } = request.nextUrl
    const parentId = searchParams.get("parentId")
    const search = searchParams.get("search")
    const filter = searchParams.get("filter")
    const limit = Math.min(parseInt(searchParams.get("limit") || "200", 10) || 200, 500)
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0)

    if (search) {
      if (search.length > 500) {
        return NextResponse.json(
          { error: "Search query too long (max 500 characters)" },
          { status: 400 }
        )
      }
      const notes = searchNotes(search, user.id, vaultId)
      return NextResponse.json(notes)
    }

    if (filter === "trash") {
      return NextResponse.json(listTrashedNotes(user.id, vaultId))
    }

    if (filter === "favorites") {
      return NextResponse.json(listFavoriteNotes(user.id, vaultId))
    }

    if (filter === "all") {
      return NextResponse.json(listAllNotes(user.id, vaultId, false, limit, offset))
    }

    const notes = listNotes(user.id, vaultId, parentId, false, limit, offset)
    return NextResponse.json(notes)
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
    const { title, parentId, content, noteType } = body

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      )
    }

    if (title.length > 255) {
      return NextResponse.json(
        { error: "Title too long (max 255 characters)" },
        { status: 400 }
      )
    }

    const note = createNote(title.trim(), user.id, vaultId, parentId || null, content, noteType)
    return NextResponse.json(note, { status: 201 })
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
