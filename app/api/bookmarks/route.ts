import { NextRequest, NextResponse } from "next/server"
import {
  listBookmarks,
  createBookmark,
  deleteBookmark,
  findExistingBookmark,
  updateBookmarkOrder,
} from "@/lib/bookmarks"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

export async function GET() {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const bookmarks = listBookmarks(user.id, vaultId)
    return NextResponse.json(bookmarks)
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

export async function POST(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = await request.json()
    const { type, label, targetId, data } = body

    if (!type || !label || typeof label !== "string") {
      return NextResponse.json(
        { error: "Type and label are required" },
        { status: 400 }
      )
    }

    // Sanitize label to prevent XSS — strip HTML tags
    const sanitizedLabel = label.replace(/<[^>]*>/g, "").slice(0, 200)
    if (!sanitizedLabel.trim()) {
      return NextResponse.json(
        { error: "Label cannot be empty" },
        { status: 400 }
      )
    }

    if (!["note", "heading", "search"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid bookmark type" },
        { status: 400 }
      )
    }

    // Validate targetId exists for note bookmarks
    if (type === "note" && targetId) {
      const db = (await import("@/lib/db")).getDb()
      const noteExists = db
        .prepare("SELECT 1 FROM notes WHERE id = ? AND user_id = ? AND vault_id = ?")
        .get(targetId, user.id, vaultId)
      if (!noteExists) {
        return NextResponse.json(
          { error: "Target note not found" },
          { status: 404 }
        )
      }
    }

    // Toggle: if bookmark already exists, remove it
    const existing = findExistingBookmark(
      user.id,
      vaultId,
      type,
      targetId,
      data
    )
    if (existing) {
      deleteBookmark(existing.id, user.id, vaultId)
      return NextResponse.json({ removed: true, id: existing.id })
    }

    const bookmark = createBookmark(
      user.id,
      vaultId,
      type,
      sanitizedLabel,
      targetId,
      data
    )
    return NextResponse.json(bookmark, { status: 201 })
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

export async function PUT(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = await request.json()
    const { orderedIds } = body

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: "orderedIds array is required" },
        { status: 400 }
      )
    }

    updateBookmarkOrder(user.id, vaultId, orderedIds)
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
