import { NextRequest, NextResponse } from "next/server"
import {
  getNote,
  updateNoteContent,
  updateNoteTitle,
  updateNoteIcon,
  updateNoteCover,
  deleteNote,
  restoreNote,
  toggleFavorite,
  moveNote,
  duplicateNote,
  getBacklinks,
} from "@/lib/notes"
import { cleanupOrphanedAttachments } from "@/lib/attachments"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { noteId } = await params
    const note = getNote(noteId, user.id, vaultId)
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    // Don't expose trashed notes via direct access (use trash filter instead)
    if (note.metadata.isTrashed) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 })
    }

    // Include backlinks if requested
    const includeBacklinks =
      request.nextUrl.searchParams.get("backlinks") === "true"
    if (includeBacklinks) {
      note.metadata.backlinks = getBacklinks(noteId, user.id, vaultId).map(
        (b) => b.id
      )
    }

    return NextResponse.json(note)
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { noteId } = await params
    const body = await request.json()

    if (body.content !== undefined) {
      const result = updateNoteContent(
        noteId,
        body.content,
        user.id,
        vaultId,
        body.baseVersion,
        body.trigger ?? "autosave"
      )

      if (result.status === "conflict") {
        return NextResponse.json(
          {
            status: "conflict",
            version: result.version,
            serverContent: result.serverContent,
            conflicts: result.conflicts,
          },
          { status: 409 }
        )
      }

      const removedAttachments = cleanupOrphanedAttachments(noteId, result.content, user.id, vaultId)

      return NextResponse.json({
        status: result.status,
        version: result.version,
        content: result.content,
        removedAttachments,
      })
    }

    if (body.title !== undefined) {
      updateNoteTitle(noteId, body.title, user.id, vaultId)
    }

    if (body.icon !== undefined) {
      updateNoteIcon(noteId, body.icon || null, user.id, vaultId)
    }

    if (body.coverImage !== undefined) {
      updateNoteCover(noteId, body.coverImage || null, user.id, vaultId)
    }

    if (body.aliases !== undefined) {
      const aliases = Array.isArray(body.aliases)
        ? body.aliases.filter((a: unknown) => typeof a === "string" && a)
        : []
      const db = (await import("@/lib/db")).getDb()
      db.prepare("UPDATE notes SET aliases = ? WHERE id = ? AND user_id = ? AND vault_id = ?")
        .run(aliases.length > 0 ? JSON.stringify(aliases) : null, noteId, user.id, vaultId)
    }

    if (body.parentId !== undefined && body.action === "move") {
      const moved = moveNote(noteId, body.parentId, user.id, vaultId)
      return NextResponse.json(moved)
    }

    if (body.action === "duplicate") {
      const dup = duplicateNote(noteId, user.id, vaultId)
      return NextResponse.json(dup, { status: 201 })
    }

    if (body.action === "restore") {
      restoreNote(noteId, user.id, vaultId)
    }

    if (body.action === "toggleFavorite") {
      const isFavorite = toggleFavorite(noteId, user.id, vaultId)
      return NextResponse.json({ isFavorite })
    }

    const note = getNote(noteId, user.id, vaultId)
    return NextResponse.json(note)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error("[PUT /api/notes] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { noteId } = await params
    const { searchParams } = request.nextUrl
    const hard = searchParams.get("hard") === "true"

    deleteNote(noteId, user.id, vaultId, hard)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    const status = message === "Note not found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
