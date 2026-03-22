import fs from "fs"
import path from "path"
import os from "os"
import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAuth } from "@/lib/auth/middleware"
import { isBlockedPath } from "@/lib/paths"

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = request.nextUrl
    const dirPath = searchParams.get("path") || os.homedir()

    const resolved = path.resolve(dirPath)

    if (resolved === "/" || isBlockedPath(resolved)) {
      return NextResponse.json(
        { error: "Access to this path is not allowed" },
        { status: 403 }
      )
    }

    if (!fs.existsSync(resolved)) {
      return NextResponse.json(
        { error: "Directory not found" },
        { status: 404 }
      )
    }

    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { error: "Path is not a directory" },
        { status: 400 }
      )
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    const folders = entries
      .filter((e) => {
        if (!e.isDirectory()) return false
        // Hide hidden folders (starting with .)
        if (e.name.startsWith(".")) return false
        // Hide system folders
        const skip = [
          "node_modules",
          "__pycache__",
          "Library",
          "$RECYCLE.BIN",
          "System Volume Information",
        ]
        if (skip.includes(e.name)) return false
        // Hide blocked destination paths
        const childPath = path.join(resolved, e.name)
        if (isBlockedPath(childPath)) return false
        return true
      })
      .map((e) => ({
        name: e.name,
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      current: resolved,
      parent:
        path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
      folders,
    })
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
    await requireAuth()
    const body = await request.json()
    const { path: dirPath, name } = body

    if (!dirPath || !name) {
      return NextResponse.json(
        { error: "Path and name are required" },
        { status: 400 }
      )
    }

    const safeName = name.replace(/[<>:"/\\|?*]/g, "_").trim()
    if (!safeName) {
      return NextResponse.json(
        { error: "Invalid folder name" },
        { status: 400 }
      )
    }

    const newPath = path.join(path.resolve(dirPath), safeName)

    if (isBlockedPath(newPath)) {
      return NextResponse.json(
        { error: "Cannot create folders in this location" },
        { status: 403 }
      )
    }

    if (fs.existsSync(newPath)) {
      return NextResponse.json(
        { error: "Folder already exists" },
        { status: 409 }
      )
    }

    fs.mkdirSync(newPath, { recursive: true })

    return NextResponse.json(
      {
        name: safeName,
        path: newPath,
      },
      { status: 201 }
    )
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
