import { NextRequest, NextResponse } from "next/server"
import { saveAttachment, listAttachments } from "@/lib/attachments"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { noteId } = await params
    const attachments = listAttachments(noteId, user.id, vaultId)
    return NextResponse.json(attachments)
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { noteId } = await params
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      )
    }

    // Enforce file size limit (default 300MB, configurable via OPENVLT_MAX_UPLOAD_MB)
    const maxMb = parseInt(process.env.OPENVLT_MAX_UPLOAD_MB || "300", 10) || 300
    const MAX_FILE_SIZE = maxMb * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${maxMb}MB)` },
        { status: 413 }
      )
    }

    // Sanitize filename: strip null bytes and control characters
    const sanitizedName = file.name
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/\.\./g, "_")
      .trim() || "unnamed"

    const buffer = Buffer.from(await file.arrayBuffer())
    const attachment = saveAttachment(
      noteId,
      user.id,
      vaultId,
      sanitizedName,
      buffer,
      file.type || "application/octet-stream"
    )

    return NextResponse.json(attachment, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    const status = message === "Note not found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
