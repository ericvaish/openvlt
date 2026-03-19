import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { getAttachmentPath, deleteAttachment } from "@/lib/attachments"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { attachmentId } = await params
    const filePath = getAttachmentPath(attachmentId, user.id, vaultId)

    if (!filePath) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      )
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "File not found on disk" },
        { status: 404 }
      )
    }

    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || "application/octet-stream"

    // Sanitize filename for Content-Disposition header (must be ASCII-safe)
    const rawName = path.basename(filePath)
    const safeName = rawName.replace(/[^\x20-\x7E]/g, "_")

    // Force download for potentially dangerous file types to prevent XSS
    const DANGEROUS_EXTENSIONS = [".svg", ".html", ".htm", ".js", ".mjs", ".xml", ".xhtml", ".php"]
    const forceDownload = DANGEROUS_EXTENSIONS.includes(ext)
    const disposition = forceDownload ? "attachment" : "inline"

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": forceDownload ? "application/octet-stream" : contentType,
        "Content-Disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("Attachment GET error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { attachmentId } = await params
    deleteAttachment(attachmentId, user.id, vaultId)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    const status = message === "Attachment not found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
