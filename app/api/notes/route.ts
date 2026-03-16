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

    if (search) {
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
      return NextResponse.json(listAllNotes(user.id, vaultId))
    }

    const notes = listNotes(user.id, vaultId, parentId)
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
