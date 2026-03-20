import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { requireAuthWithVault } from "@/lib/auth/middleware"
import { getVaultPath, safeResolvePath } from "@/lib/vaults/service"

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".json": "application/json",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".xml": "text/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".md": "text/markdown",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

export async function GET(request: NextRequest) {
  try {
    const { vaultId } = await requireAuthWithVault()
    const filePath = request.nextUrl.searchParams.get("path")

    if (!filePath) {
      return NextResponse.json({ error: "path is required" }, { status: 400 })
    }

    const vaultRoot = getVaultPath(vaultId)
    const fullPath = safeResolvePath(vaultRoot, filePath)

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const stat = fs.statSync(fullPath)
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 })
    }

    const ext = path.extname(fullPath).toLowerCase()
    const contentType = MIME_MAP[ext] || "application/octet-stream"
    const fileName = path.basename(fullPath)

    const buffer = fs.readFileSync(fullPath)

    // Force download for potentially dangerous file types to prevent XSS
    const DANGEROUS_EXTENSIONS = [".svg", ".html", ".htm", ".js", ".mjs", ".xml", ".xhtml", ".php"]
    const isDangerous = DANGEROUS_EXTENSIONS.includes(ext)

    // Inline-viewable types open in browser; others download
    const inlineTypes = [
      "image/",
      "text/",
      "application/pdf",
      "application/json",
      "video/",
      "audio/",
    ]
    const isInline = !isDangerous && inlineTypes.some((t) => contentType.startsWith(t))

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": isDangerous ? "application/octet-stream" : contentType,
        "Content-Disposition": isInline
          ? `inline; filename="${fileName}"`
          : `attachment; filename="${fileName}"`,
        "Content-Length": String(stat.size),
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
