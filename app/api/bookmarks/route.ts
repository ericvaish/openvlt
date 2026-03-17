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

    if (!type || !label) {
      return NextResponse.json(
        { error: "Type and label are required" },
        { status: 400 }
      )
    }

    if (!["note", "heading", "search"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid bookmark type" },
        { status: 400 }
      )
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
      label,
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
