import { NextResponse } from "next/server"
import { execSync } from "child_process"
import { requireAuth } from "@/lib/auth/middleware"

export async function POST() {
  try {
    await requireAuth()

    const appDir = process.cwd()

    // Verify git installation
    try {
      execSync("git rev-parse --git-dir", { cwd: appDir, encoding: "utf-8" })
    } catch {
      return NextResponse.json(
        { error: "Not a git installation. Cannot update from web." },
        { status: 400 }
      )
    }

    // Check if there are actually updates
    execSync("git fetch --quiet origin", {
      cwd: appDir,
      encoding: "utf-8",
      timeout: 15000,
    })

    const behind = parseInt(
      execSync("git rev-list --count HEAD..origin/main", {
        cwd: appDir,
        encoding: "utf-8",
      }).trim(),
      10
    ) || 0

    if (behind === 0) {
      return NextResponse.json({ message: "Already up to date", success: true })
    }

    // Run update steps
    const logs: string[] = []

    try {
      logs.push("Pulling latest changes...")
      execSync("git pull --ff-only origin main", {
        cwd: appDir,
        encoding: "utf-8",
        timeout: 30000,
      })
      logs.push("Pull complete.")

      logs.push("Installing dependencies...")
      execSync("bun install", {
        cwd: appDir,
        encoding: "utf-8",
        timeout: 120000,
      })
      logs.push("Dependencies installed.")

      logs.push("Building application...")
      execSync("bun run build", {
        cwd: appDir,
        encoding: "utf-8",
        timeout: 300000,
      })
      logs.push("Build complete.")

      // Copy standalone output if it exists
      try {
        execSync(
          'if [ -d ".next/standalone" ]; then cp -r .next/standalone/* . && cp -r .next/static .next/standalone/.next/static 2>/dev/null; cp -r public .next/standalone/public 2>/dev/null; fi',
          { cwd: appDir, encoding: "utf-8" }
        )
      } catch {}

      logs.push("Restarting server...")
      try {
        execSync("pm2 restart openvlt", {
          cwd: appDir,
          encoding: "utf-8",
          timeout: 10000,
        })
        logs.push("Server restarted.")
      } catch {
        logs.push(
          "Could not restart automatically. Please restart manually with: openvlt restart"
        )
      }

      return NextResponse.json({
        success: true,
        message: "Update complete. The page will reload shortly.",
        logs,
      })
    } catch (error) {
      logs.push(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      )
      return NextResponse.json(
        {
          success: false,
          error: "Update failed. You may need to run 'openvlt update' from the terminal to recover.",
          logs,
        },
        { status: 500 }
      )
    }
  } catch {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }
}
