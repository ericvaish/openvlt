/**
 * Claude Code login session manager.
 *
 * Spawns `claude auth login` as a subprocess and captures output.
 * The CLI gracefully falls back to static text output when there's no TTY,
 * printing the auth URL to stdout. No PTY wrapper needed.
 *
 * Works on macOS, Linux, and Windows without native dependencies.
 */

import { spawn, type ChildProcess } from "child_process"
import path from "path"
import { randomUUID } from "crypto"

// ── Types ──

export type LoginEventType = "output" | "url" | "status" | "done"

export interface LoginEvent {
  type: LoginEventType
  text?: string
  url?: string
  status?: "starting" | "waiting" | "success" | "error" | "cancelled"
  message?: string
}

interface LoginSession {
  id: string
  process: ChildProcess | null
  output: string[]
  authUrl: string | null
  status: "running" | "success" | "error" | "cancelled"
  error?: string
  listeners: Set<(event: LoginEvent) => void>
  createdAt: number
  timeoutId: ReturnType<typeof setTimeout> | null
}

// ── Session store ──

const sessions = new Map<string, LoginSession>()

// ── Helpers ──

function stripAnsi(text: string): string {
  // Strip ANSI escape sequences, OSC sequences, and control characters
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[()][A-Z0-9]/g, "")
    .replace(/\x1b\[[\d;]*[Hf]/g, "")
    .replace(/\x1b\[\?[\d;]*[a-zA-Z]/g, "")
    .replace(/\r/g, "")
}

function extractAuthUrl(text: string): string | null {
  // Look for Anthropic/Claude auth URLs
  const urlRegex = /https?:\/\/[^\s\x1b\x07"'<>\])+,]+/g
  const matches = text.match(urlRegex)
  if (!matches) return null

  for (const url of matches) {
    if (
      url.includes("anthropic.com") ||
      url.includes("claude.ai") ||
      url.includes("oauth") ||
      url.includes("authorize") ||
      url.includes("login") ||
      url.includes("auth")
    ) {
      // Clean trailing punctuation that got included
      return url.replace(/[.,;:!?)]+$/, "")
    }
  }

  return null
}

function getClaudeBinaryPath(): string {
  return path.join(process.cwd(), "node_modules", ".bin", "claude")
}

function emit(session: LoginSession, event: LoginEvent) {
  for (const listener of session.listeners) {
    try {
      listener(event)
    } catch {
      // Listener errors shouldn't crash the session
    }
  }
}

// ── Spawn ──

function spawnClaudeLogin(): ChildProcess {
  const claudePath = getClaudeBinaryPath()

  // Disable colors/formatting for clean text output.
  // The Ink-based CLI gracefully falls back to static output without a TTY.
  const env = {
    ...process.env,
    TERM: "dumb",
    NO_COLOR: "1",
  }

  return spawn(claudePath, ["auth", "login"], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  })
}

// ── Public API ──

/** Start a new Claude login session. Returns the session ID. */
export function startLoginSession(): { sessionId: string } {
  // Only allow one active session at a time
  for (const [id, session] of sessions) {
    if (session.status === "running") {
      cancelLoginSession(id)
    }
  }

  const id = randomUUID()

  const session: LoginSession = {
    id,
    process: null,
    output: [],
    authUrl: null,
    status: "running",
    listeners: new Set(),
    createdAt: Date.now(),
    timeoutId: null,
  }

  sessions.set(id, session)

  // Emit starting status
  emit(session, { type: "status", status: "starting", message: "Starting Claude login..." })
  emit(session, { type: "output", text: "$ claude auth login" })

  try {
    const proc = spawnClaudeLogin()
    session.process = proc

    const handleData = (data: Buffer) => {
      const raw = data.toString()
      const cleaned = stripAnsi(raw)

      // Split into lines and emit non-empty ones
      const lines = cleaned.split("\n").filter((l) => l.trim())
      for (const line of lines) {
        session.output.push(line)
        emit(session, { type: "output", text: line })
      }

      // Check for auth URL in the raw output (before stripping)
      if (!session.authUrl) {
        const url = extractAuthUrl(raw)
        if (url) {
          session.authUrl = url
          emit(session, { type: "url", url })
          emit(session, {
            type: "status",
            status: "waiting",
            message: "Authentication URL ready. Click to sign in.",
          })

          // Auto-press Enter after a short delay in case the CLI is waiting
          // for a keypress to open the browser
          setTimeout(() => {
            try {
              proc.stdin?.write("\n")
            } catch {
              // Process may have already exited
            }
          }, 500)
        }
      }
    }

    proc.stdout?.on("data", handleData)
    proc.stderr?.on("data", handleData)

    proc.on("close", (code) => {
      if (session.status === "cancelled") return

      if (session.timeoutId) {
        clearTimeout(session.timeoutId)
        session.timeoutId = null
      }

      session.status = code === 0 ? "success" : "error"

      if (code === 0) {
        emit(session, {
          type: "status",
          status: "success",
          message: "Successfully connected to Claude!",
        })
        emit(session, { type: "output", text: "Authentication complete." })
      } else {
        session.error = `Login process exited with code ${code}`
        emit(session, {
          type: "status",
          status: "error",
          message: session.error,
        })
      }

      emit(session, { type: "done" })

      // Cleanup session after 60 seconds
      setTimeout(() => sessions.delete(id), 60_000)
    })

    proc.on("error", (err) => {
      if (session.status === "cancelled") return

      session.status = "error"
      session.error = err.message
      emit(session, {
        type: "status",
        status: "error",
        message: `Failed to start login: ${err.message}`,
      })
      emit(session, { type: "done" })

      setTimeout(() => sessions.delete(id), 60_000)
    })

    // Auto-timeout after 5 minutes
    session.timeoutId = setTimeout(() => {
      if (session.status === "running") {
        session.status = "error"
        session.error = "Login timed out after 5 minutes"
        emit(session, {
          type: "status",
          status: "error",
          message: session.error,
        })
        emit(session, { type: "done" })
        try {
          proc.kill()
        } catch {
          // ignore
        }
      }
    }, 5 * 60 * 1000)
  } catch (err) {
    session.status = "error"
    session.error = err instanceof Error ? err.message : "Unknown error"
    emit(session, {
      type: "status",
      status: "error",
      message: `Failed to start login: ${session.error}`,
    })
    emit(session, { type: "done" })
  }

  return { sessionId: id }
}

/** Cancel an active login session. */
export function cancelLoginSession(id: string) {
  const session = sessions.get(id)
  if (!session) return

  session.status = "cancelled"

  if (session.timeoutId) {
    clearTimeout(session.timeoutId)
    session.timeoutId = null
  }

  try {
    session.process?.kill()
  } catch {
    // ignore
  }

  emit(session, { type: "status", status: "cancelled", message: "Login cancelled." })
  emit(session, { type: "done" })

  // Clean up immediately
  sessions.delete(id)
}

/** Send a keypress to the login process (e.g. Enter). */
export function sendKeypress(id: string, key: string) {
  const session = sessions.get(id)
  if (!session?.process) return

  try {
    session.process.stdin?.write(key)
  } catch {
    // Process may have exited
  }
}

/** Get the current state of a login session. */
export function getLoginSession(id: string) {
  const session = sessions.get(id)
  if (!session) return null

  return {
    id: session.id,
    status: session.status,
    authUrl: session.authUrl,
    output: session.output,
    error: session.error,
  }
}

/** Register a listener for login events. Returns an unsubscribe function. */
export function addLoginListener(
  id: string,
  listener: (event: LoginEvent) => void
): () => void {
  const session = sessions.get(id)
  if (!session) {
    // Session not found, immediately send done
    listener({ type: "done" })
    return () => {}
  }

  session.listeners.add(listener)

  // Replay existing state to the new listener (handles late SSE connections)
  for (const line of session.output) {
    listener({ type: "output", text: line })
  }
  if (session.authUrl) {
    listener({ type: "url", url: session.authUrl })
  }
  if (session.status !== "running") {
    listener({
      type: "status",
      status: session.status === "success" ? "success" : "error",
      message: session.error,
    })
    listener({ type: "done" })
  }

  return () => {
    session.listeners.delete(listener)
  }
}
