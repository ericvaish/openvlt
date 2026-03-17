import { NextResponse } from "next/server"
import { execSync } from "child_process"
import { requireAuth } from "@/lib/auth/middleware"

export async function GET() {
  try {
    await requireAuth()

    const appDir = process.cwd()

    // Check if this is a git installation
    try {
      execSync("git rev-parse --git-dir", { cwd: appDir, encoding: "utf-8" })
    } catch {
      return NextResponse.json({
        isGit: false,
        currentHash: process.env.NEXT_PUBLIC_COMMIT_HASH || "unknown",
        currentDate: process.env.NEXT_PUBLIC_COMMIT_DATE || "",
        updatesAvailable: false,
        commitsBehind: 0,
      })
    }

    // Fetch latest from remote
    try {
      execSync("git fetch --quiet origin", {
        cwd: appDir,
        encoding: "utf-8",
        timeout: 15000,
      })
    } catch {
      // Network error, can't check
      return NextResponse.json({
        isGit: true,
        currentHash: process.env.NEXT_PUBLIC_COMMIT_HASH || "unknown",
        currentDate: process.env.NEXT_PUBLIC_COMMIT_DATE || "",
        updatesAvailable: false,
        commitsBehind: 0,
        error: "Could not reach remote repository",
      })
    }

    const currentHash = execSync("git rev-parse --short HEAD", {
      cwd: appDir,
      encoding: "utf-8",
    }).trim()

    const commitsBehind = parseInt(
      execSync("git rev-list --count HEAD..origin/main", {
        cwd: appDir,
        encoding: "utf-8",
      }).trim(),
      10
    ) || 0

    let latestMessage = ""
    if (commitsBehind > 0) {
      try {
        latestMessage = execSync("git log --oneline -1 origin/main", {
          cwd: appDir,
          encoding: "utf-8",
        }).trim()
      } catch {}
    }

    return NextResponse.json({
      isGit: true,
      currentHash,
      currentDate: process.env.NEXT_PUBLIC_COMMIT_DATE || "",
      updatesAvailable: commitsBehind > 0,
      commitsBehind,
      latestMessage,
    })
  } catch {
    return NextResponse.json(
      { error: "Failed to check for updates" },
      { status: 500 }
    )
  }
}
