"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  PlusIcon,
  TrashIcon,
  CopyIcon,
  CheckIcon,
  ServerIcon,
  MessageSquareIcon,
  EyeIcon,
  EyeOffIcon,
  CircleCheckIcon,
  LoaderIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
} from "lucide-react"
import type {
  AIApiToken,
  AIConfig,
  AIProviderType,
  AIProviderKeyStatus,
} from "@/types"
import {
  OpenIn,
  OpenInTrigger,
  OpenInContent,
  OpenInLabel,
  OpenInSeparator,
  OpenInClaude,
  OpenInChatGPT,
  OpenInCursor,
} from "@/components/ai/open-in-chat"
// Custom tabs removed - using inline implementation below

function SectionCard({
  title,
  description,
  icon: Icon,
  badge,
  children,
}: {
  title: string
  description?: string
  icon?: React.ElementType
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {badge && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="rounded-lg border p-4">{children}</div>
    </section>
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  openrouter: "OpenRouter",
  codex: "ChatGPT (via Codex CLI)",
  "claude-code": "Claude Code",
}

const PROVIDER_DESCRIPTIONS: Record<string, string> = {
  codex: "Use your ChatGPT Plus/Pro subscription. No per-token cost.",
  openai: "Pay-per-token via OpenAI API.",
  anthropic: "Pay-per-token via Anthropic API.",
  openrouter: "Access 300+ models. Pay-per-token via OpenRouter.",
  "claude-code":
    "Use your Claude Pro, Max, or Team subscription. No per-token cost.",
}

const PROVIDER_PLACEHOLDERS: Record<string, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  openrouter: "sk-or-...",
}

interface CodexStatus {
  installed: boolean
  authenticated: boolean
  hasAccountId: boolean
}

function CodexSetupGuide({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = React.useState<CodexStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [authUrl, setAuthUrl] = React.useState<string | null>(null)
  const [generatingUrl, setGeneratingUrl] = React.useState(false)
  const [copiedUrl, setCopiedUrl] = React.useState(false)
  const [polling, setPolling] = React.useState(false)

  const checkStatus = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/codex-status")
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        if (data.authenticated) {
          onReady()
          setAuthUrl(null)
          setPolling(false)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [onReady])

  React.useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Poll for auth completion while waiting for the user to sign in
  React.useEffect(() => {
    if (!polling) return
    const interval = setInterval(() => {
      checkStatus()
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, checkStatus])

  const handleGenerateLink = async () => {
    setGeneratingUrl(true)
    try {
      const res = await fetch("/api/ai/codex-auth", { method: "POST" })
      if (!res.ok) {
        setGeneratingUrl(false)
        return
      }
      const data = await res.json()
      setAuthUrl(data.authUrl)
      setPolling(true)
      // Auto-open in browser
      window.open(data.authUrl, "_blank", "noopener")
    } catch {
      // ignore
    } finally {
      setGeneratingUrl(false)
    }
  }

  const copyAuthUrl = () => {
    if (!authUrl) return
    navigator.clipboard.writeText(authUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const [disconnecting, setDisconnecting] = React.useState(false)

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await fetch("/api/ai/codex-logout", { method: "POST" })
      if (res.ok) {
        setStatus({ installed: false, authenticated: false, hasAccountId: false })
      }
    } catch {
      // ignore
    } finally {
      setDisconnecting(false)
    }
  }

  const isAuthenticated = status?.authenticated ?? false

  return (
    <div className="space-y-4">
      {isAuthenticated ? (
        // Connected state
        <div className="rounded-md border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CircleCheckIcon className="size-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  Connected to ChatGPT
                </p>
                <p className="text-xs text-green-600/70 dark:text-green-400/60">
                  Using your ChatGPT subscription. No per-token charges.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={checkStatus}
                disabled={loading || disconnecting}
              >
                {loading ? (
                  <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <RefreshCwIcon className="mr-1.5 size-3.5" />
                )}
                Refresh
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleDisconnect}
                disabled={disconnecting || loading}
              >
                {disconnecting ? (
                  <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // Not connected state
        <div className="space-y-4">
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
              Use your ChatGPT subscription
            </p>
            <p className="mt-1 text-xs text-blue-600/80 dark:text-blue-400/70">
              Sign in with your ChatGPT Plus or Pro account to use AI chat
              at no extra cost. Your subscription covers usage.
            </p>
          </div>

          {!authUrl ? (
            <>
              <Button
                onClick={handleGenerateLink}
                disabled={generatingUrl || loading}
                className="gap-2"
              >
                {generatingUrl ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <ExternalLinkIcon className="size-4" />
                )}
                {generatingUrl
                  ? "Generating sign-in link..."
                  : "Log in to ChatGPT"}
              </Button>

              <p className="text-xs text-muted-foreground">
                Requires an active ChatGPT Plus or Pro subscription.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              {polling && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderIcon className="size-3.5 animate-spin" />
                  Waiting for you to sign in... This page will update
                  automatically.
                </div>
              )}

              <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  A sign-in page should have opened in your browser. If not,
                  copy this link and open it in the browser where you are signed
                  in to ChatGPT:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-muted px-2 py-1.5 text-xs">
                    {authUrl.slice(0, 80)}...
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={copyAuthUrl}
                  >
                    {copiedUrl ? (
                      <CheckIcon className="size-3.5 text-green-500" />
                    ) : (
                      <CopyIcon className="size-3.5" />
                    )}
                    {copiedUrl ? "Copied" : "Copy link"}
                  </Button>
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAuthUrl(null)
                  setPolling(false)
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ClaudeCodeStatus {
  installed: boolean
  authenticated: boolean
}

type ClaudeLoginState =
  | "idle"
  | "starting"
  | "url_ready"
  | "waiting"
  | "success"
  | "error"

function ClaudeCodeSetupGuide({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = React.useState<ClaudeCodeStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loginState, setLoginState] = React.useState<ClaudeLoginState>("idle")
  const [authUrl, setAuthUrl] = React.useState<string | null>(null)
  const [terminalOutput, setTerminalOutput] = React.useState<string[]>([])
  const [showDetails, setShowDetails] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const sessionRef = React.useRef<string | null>(null)
  const eventSourceRef = React.useRef<EventSource | null>(null)
  const terminalEndRef = React.useRef<HTMLDivElement>(null)
  const [polling, setPolling] = React.useState(false)

  const checkStatus = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/ai/claude-code-status")
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
        if (data.authenticated) {
          onReady()
          setLoginState("idle")
          setPolling(false)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [onReady])

  React.useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Poll for auth completion after user opens the auth URL
  React.useEffect(() => {
    if (!polling) return
    const interval = setInterval(() => {
      checkStatus()
    }, 3000)
    return () => clearInterval(interval)
  }, [polling, checkStatus])

  // Auto-scroll terminal output
  React.useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [terminalOutput])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  const startLogin = async () => {
    setLoginState("starting")
    setTerminalOutput([])
    setAuthUrl(null)
    setErrorMessage(null)

    try {
      const res = await fetch("/api/ai/claude-code-login", { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setLoginState("error")
        setErrorMessage(data.error || "Failed to start login")
        return
      }

      const { sessionId } = await res.json()
      sessionRef.current = sessionId

      // Connect to SSE stream
      const es = new EventSource(
        `/api/ai/claude-code-login/stream?session=${sessionId}`
      )
      eventSourceRef.current = es

      es.addEventListener("output", (e) => {
        try {
          const { text } = JSON.parse(e.data)
          if (text) {
            setTerminalOutput((prev) => [...prev, text])
          }
        } catch {
          // ignore parse errors
        }
      })

      es.addEventListener("url", (e) => {
        try {
          const { url } = JSON.parse(e.data)
          setAuthUrl(url)
          setLoginState("url_ready")
        } catch {
          // ignore
        }
      })

      es.addEventListener("status", (e) => {
        try {
          const { status: s, message } = JSON.parse(e.data)
          if (s === "success") {
            setLoginState("success")
            setPolling(false)
            checkStatus()
          } else if (s === "error") {
            setLoginState("error")
            setErrorMessage(message || "Login failed")
            setPolling(false)
          }
        } catch {
          // ignore
        }
      })

      es.addEventListener("done", () => {
        es.close()
        eventSourceRef.current = null
      })

      es.onerror = () => {
        // SSE connection lost, check if auth succeeded
        es.close()
        eventSourceRef.current = null
        // Always check status when SSE drops - the login may have succeeded
        checkStatus()
      }
    } catch {
      setLoginState("error")
      setErrorMessage("Failed to connect to login service")
    }
  }

  const cancelLogin = async () => {
    if (sessionRef.current) {
      await fetch(
        `/api/ai/claude-code-login?session=${sessionRef.current}`,
        { method: "DELETE" }
      ).catch(() => {})
    }
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    sessionRef.current = null
    setLoginState("idle")
    setAuthUrl(null)
    setTerminalOutput([])
    setPolling(false)
  }

  const [copiedUrl, setCopiedUrl] = React.useState(false)

  const openAuthUrl = () => {
    if (authUrl) {
      window.open(authUrl, "_blank", "noopener")
      setLoginState("waiting")
      setPolling(true)
    }
  }

  const copyAuthUrl = () => {
    if (!authUrl) return
    navigator.clipboard.writeText(authUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const [disconnecting, setDisconnecting] = React.useState(false)

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await fetch("/api/ai/claude-code-logout", { method: "POST" })
      if (res.ok) {
        setStatus({ installed: status?.installed ?? true, authenticated: false })
        setLoginState("idle")
      }
    } catch {
      // ignore
    } finally {
      setDisconnecting(false)
    }
  }

  const isAuthenticated = status?.authenticated ?? false
  const isInProgress =
    loginState === "starting" ||
    loginState === "url_ready" ||
    loginState === "waiting"

  return (
    <div className="space-y-4">
      {isAuthenticated ? (
        // ── Connected state ──
        <div className="rounded-md border border-green-500/20 bg-green-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CircleCheckIcon className="size-5 text-green-500" />
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  Connected to Claude
                </p>
                <p className="text-xs text-green-600/70 dark:text-green-400/60">
                  Using your Claude subscription. No per-token charges.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={checkStatus}
                disabled={loading || disconnecting}
              >
                {loading ? (
                  <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <RefreshCwIcon className="mr-1.5 size-3.5" />
                )}
                Refresh
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleDisconnect}
                disabled={disconnecting || loading}
              >
                {disconnecting ? (
                  <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // ── Not connected ──
        <div className="space-y-4">
          {/* Not connected — idle */}
          {loginState === "idle" && (
            <>
              <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  Use your Claude subscription
                </p>
                <p className="mt-1 text-xs text-blue-600/80 dark:text-blue-400/70">
                  Sign in with your Anthropic account to use AI chat at no extra
                  cost. Your subscription covers usage.
                </p>
              </div>

              <Button onClick={startLogin} disabled={loading} className="gap-2">
                {loading ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <ExternalLinkIcon className="size-4" />
                )}
                Connect Claude
              </Button>

              <p className="text-xs text-muted-foreground">
                Requires an active Claude Pro, Max, or Team subscription.
              </p>
            </>
          )}

          {/* Login in progress */}
          {isInProgress && (
            <div className="space-y-3">
              {/* Step indicators */}
              <div className="space-y-2">
                {/* Step 1: Starting */}
                <div className="flex items-center gap-2.5">
                  {loginState === "starting" ? (
                    <LoaderIcon className="size-4 shrink-0 animate-spin text-blue-500" />
                  ) : (
                    <CircleCheckIcon className="size-4 shrink-0 text-green-500" />
                  )}
                  <span
                    className={`text-sm ${
                      loginState === "starting"
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    Starting login...
                  </span>
                </div>

                {/* Step 2: Authenticate */}
                {(loginState === "url_ready" || loginState === "waiting") && (
                  <div className="flex items-center gap-2.5">
                    {loginState === "url_ready" ? (
                      <div className="size-4 shrink-0 rounded-full border-2 border-blue-500" />
                    ) : (
                      <CircleCheckIcon className="size-4 shrink-0 text-green-500" />
                    )}
                    <span
                      className={`text-sm ${
                        loginState === "url_ready"
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      Authenticate with Anthropic
                    </span>
                  </div>
                )}

                {/* Step 3: Waiting */}
                {loginState === "waiting" && (
                  <div className="flex items-center gap-2.5">
                    <LoaderIcon className="size-4 shrink-0 animate-spin text-blue-500" />
                    <span className="text-sm text-foreground">
                      Waiting for you to sign in...
                    </span>
                  </div>
                )}
              </div>

              {/* Auth URL button */}
              {loginState === "url_ready" && authUrl && (
                <Button onClick={openAuthUrl} className="gap-2">
                  <ExternalLinkIcon className="size-4" />
                  Open authentication page
                </Button>
              )}

              {/* Waiting message */}
              {loginState === "waiting" && (
                <p className="text-xs text-muted-foreground">
                  Complete the sign-in in your browser. This page will update
                  automatically once connected.
                </p>
              )}

              {/* Show auth URL for copying */}
              {authUrl && (loginState === "url_ready" || loginState === "waiting") && (
                <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    {loginState === "url_ready"
                      ? "Or copy this link to open in a different browser:"
                      : "If the page didn't open, copy this link and open it manually:"}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-muted px-2 py-1.5 text-xs">
                      {authUrl.slice(0, 80)}...
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5"
                      onClick={copyAuthUrl}
                    >
                      {copiedUrl ? (
                        <CheckIcon className="size-3.5 text-green-500" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                      {copiedUrl ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Terminal output */}
              <div>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showDetails ? "Hide" : "Show"} details
                </button>
                {showDetails && terminalOutput.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-400">
                    {terminalOutput.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap break-all">
                        {line}
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                )}
              </div>

              {/* Cancel button */}
              <Button size="sm" variant="ghost" onClick={cancelLogin}>
                Cancel
              </Button>
            </div>
          )}

          {/* Error state */}
          {loginState === "error" && (
            <div className="space-y-3">
              <div className="rounded-md border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  Login failed
                </p>
                <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/70">
                  {errorMessage || "An unknown error occurred."}
                </p>
              </div>

              {/* Show terminal output on error for debugging */}
              {terminalOutput.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-400">
                  {terminalOutput.map((line, i) => (
                    <div key={i} className="whitespace-pre-wrap break-all">
                      {line}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setLoginState("idle")
                    setErrorMessage(null)
                    setTerminalOutput([])
                  }}
                >
                  Try again
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={checkStatus}
                  disabled={loading}
                >
                  {loading ? (
                    <LoaderIcon className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="mr-1.5 size-3.5" />
                  )}
                  Check status
                </Button>
              </div>

            </div>
          )}

          {/* Success state (brief, before status check refreshes to connected) */}
          {loginState === "success" && (
            <div className="rounded-md border border-green-500/20 bg-green-500/5 p-4">
              <div className="flex items-center gap-2.5">
                <CircleCheckIcon className="size-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Successfully connected!
                  </p>
                  <p className="text-xs text-green-600/70 dark:text-green-400/60">
                    Claude is now ready to use.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Providers that need API keys (not Codex or Claude Code which have their own auth) */
const API_KEY_PROVIDERS: AIProviderType[] = [
  "openai",
  "anthropic",
  "openrouter",
]

export function AISettingsTab() {
  const [config, setConfig] = React.useState<AIConfig>({
    mcpEnabled: false,
    chatEnabled: false,
    chatProvider: null,
    chatProviders: [],
    chatModel: null,
  })
  const [tokens, setTokens] = React.useState<AIApiToken[]>([])
  const [keys, setKeys] = React.useState<AIProviderKeyStatus[]>([])
  const [newTokenName, setNewTokenName] = React.useState("")
  const [createdToken, setCreatedToken] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [keyInputs, setKeyInputs] = React.useState<Record<string, string>>({})
  const [keyVisibility, setKeyVisibility] = React.useState<
    Record<string, boolean>
  >({})
  const [showSetup, setShowSetup] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/ai/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {})
    fetch("/api/ai/tokens")
      .then((r) => r.json())
      .then(setTokens)
      .catch(() => {})
    fetch("/api/ai/keys")
      .then((r) => r.json())
      .then(setKeys)
      .catch(() => {})
  }, [])

  const updateConfig = async (updates: Partial<AIConfig>) => {
    const res = await fetch("/api/ai/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const data = await res.json()
      setConfig(data)
    }
  }

  const toggleProvider = (provider: AIProviderType) => {
    const current = config.chatProviders || []
    const next = current.includes(provider)
      ? current.filter((p) => p !== provider)
      : [...current, provider]
    updateConfig({ chatProviders: next })
  }

  const createToken = async () => {
    if (!newTokenName.trim()) return
    const res = await fetch("/api/ai/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTokenName.trim() }),
    })
    if (res.ok) {
      const data = await res.json()
      setCreatedToken(data.token)
      setNewTokenName("")
      const tokensRes = await fetch("/api/ai/tokens")
      if (tokensRes.ok) setTokens(await tokensRes.json())
    }
  }

  const revokeToken = async (id: string) => {
    await fetch(`/api/ai/tokens/${id}`, { method: "DELETE" })
    setTokens((t) => t.filter((tk) => tk.id !== id))
  }

  const saveKey = async (provider: AIProviderType) => {
    const apiKey = keyInputs[provider]
    if (!apiKey?.trim()) return
    const res = await fetch("/api/ai/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
    })
    if (res.ok) {
      setKeyInputs((k) => ({ ...k, [provider]: "" }))
      const keysRes = await fetch("/api/ai/keys")
      if (keysRes.ok) setKeys(await keysRes.json())
    }
  }

  const removeKey = async (provider: AIProviderType) => {
    await fetch(`/api/ai/keys/${provider}`, { method: "DELETE" })
    const keysRes = await fetch("/api/ai/keys")
    if (keysRes.ok) setKeys(await keysRes.json())
  }

  const copyToken = () => {
    if (!createdToken) return
    navigator.clipboard.writeText(createdToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isKeyConfigured = (provider: string) =>
    keys.find((k) => k.provider === provider)?.configured ?? false

  const enabledProviders = config.chatProviders || []

  // Persist AI sub-tab in localStorage
  const [activeTab, setActiveTab] = React.useState(() => {
    if (typeof window === "undefined") return "chat"
    return localStorage.getItem("openvlt:ai-settings-tab") || "chat"
  })
  const setActiveTabPersist = React.useCallback((tab: string) => {
    setActiveTab(tab)
    localStorage.setItem("openvlt:ai-settings-tab", tab)
  }, [])

  const tabs = [
    { value: "chat", label: "Chat" },
    { value: "subscriptions", label: "Subscriptions" },
    { value: "api-keys", label: "API Keys" },
    { value: "mcp", label: "MCP" },
    { value: "tools", label: "Tools" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex h-8 items-stretch overflow-x-auto rounded-md border border-border/60 bg-background/40">
        {tabs.map((tab, i) => {
          const active = activeTab === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTabPersist(tab.value)}
              className={`relative shrink-0 px-3 text-xs font-medium tracking-wide transition-colors sm:flex-1 sm:px-0 ${
                i > 0 ? "border-l border-border/40" : ""
              } ${
                active
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground/80"
              }`}
            >
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              )}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Chat Tab ── */}
      {activeTab === "chat" && (
        <SectionCard
          title="AI Chat"
          description="Chat with AI about your notes from the right sidebar."
          icon={MessageSquareIcon}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable AI chat</span>
              <Button
                variant={config.chatEnabled ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  updateConfig({ chatEnabled: !config.chatEnabled })
                }
              >
                {config.chatEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
            {config.chatEnabled && (
              <p className="text-xs text-muted-foreground">
                Configure providers in the Subscriptions or API Keys tabs, then select a model in the chat sidebar.
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Subscriptions Tab ── */}
      {activeTab === "subscriptions" && (
        <>
        <SectionCard
          title="Subscriptions"
          description="Use your existing AI subscriptions. No per-token cost."
          badge="Recommended"
        >
          <div className="space-y-3">
            {/* ChatGPT (Codex CLI) */}
            {(() => {
              const isEnabled = enabledProviders.includes("codex")
              return (
                <div
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    isEnabled ? "border-green-500/20" : "border-border"
                  }`}
                >
                  <div
                    className={`flex items-center gap-3 px-3.5 py-3 ${
                      isEnabled ? "bg-green-500/5" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium">ChatGPT</span>
                      <p className="text-xs text-muted-foreground">
                        ChatGPT Plus or Pro subscription
                      </p>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleProvider("codex")}
                    />
                  </div>
                  {isEnabled && (
                    <div className="border-t border-green-500/10 px-3.5 py-3">
                      <CodexSetupGuide onReady={() => {}} />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Claude Code */}
            {(() => {
              const isEnabled = enabledProviders.includes("claude-code")
              return (
                <div
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    isEnabled ? "border-green-500/20" : "border-border"
                  }`}
                >
                  <div
                    className={`flex items-center gap-3 px-3.5 py-3 ${
                      isEnabled ? "bg-green-500/5" : ""
                    }`}
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium">Claude</span>
                      <p className="text-xs text-muted-foreground">
                        Claude Pro, Max, or Team subscription
                      </p>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleProvider("claude-code")}
                    />
                  </div>
                  {isEnabled && (
                    <div className="border-t border-green-500/10 px-3.5 py-3">
                      <ClaudeCodeSetupGuide onReady={() => {}} />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </SectionCard>
        <p className="text-xs text-muted-foreground">
          Facing problems?{" "}
          <a
            href="https://openvlt.com/docs/ai-setup"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            View setup guide
          </a>
        </p>
        </>
      )}

      {/* ── API Keys Tab ── */}
      {activeTab === "api-keys" && (
        <SectionCard
          title="API Keys"
          description="Pay-per-token. You are billed directly by the provider."
        >
          <div className="space-y-3">
            {(
              ["openai", "anthropic", "openrouter"] as AIProviderType[]
            ).map((provider) => {
              const isEnabled = enabledProviders.includes(provider)
              const hasKey = isKeyConfigured(provider)
              return (
                <div
                  key={provider}
                  className={`overflow-hidden rounded-lg border transition-colors ${
                    isEnabled
                      ? hasKey
                        ? "border-green-500/20"
                        : "border-primary/20"
                      : "border-border"
                  }`}
                >
                  <div
                    className={`flex items-center gap-3 px-3.5 py-3 ${
                      isEnabled
                        ? hasKey
                          ? "bg-green-500/5"
                          : "bg-primary/5"
                        : ""
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {PROVIDER_LABELS[provider]}
                        </span>
                        {hasKey ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-1.5 py-0.5 text-xs text-green-600 dark:text-green-400">
                            <CircleCheckIcon className="size-3" />
                            Connected
                          </span>
                        ) : (
                          isEnabled && (
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                              Needs key
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {PROVIDER_DESCRIPTIONS[provider]}
                      </p>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleProvider(provider)}
                    />
                  </div>
                  {isEnabled && (
                    <div className="border-t px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={
                              keyVisibility[provider] ? "text" : "password"
                            }
                            value={keyInputs[provider] || ""}
                            onChange={(e) =>
                              setKeyInputs((k) => ({
                                ...k,
                                [provider]: e.target.value,
                              }))
                            }
                            placeholder={
                              hasKey
                                ? "Key saved. Enter new key to replace."
                                : PROVIDER_PLACEHOLDERS[provider] ||
                                  "Enter API key"
                            }
                            className="pr-8 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setKeyVisibility((v) => ({
                                ...v,
                                [provider]: !v[provider],
                              }))
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {keyVisibility[provider] ? (
                              <EyeOffIcon className="size-3.5" />
                            ) : (
                              <EyeIcon className="size-3.5" />
                            )}
                          </button>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => saveKey(provider)}
                          disabled={!keyInputs[provider]?.trim()}
                        >
                          Save
                        </Button>
                        {hasKey && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeKey(provider)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* ── MCP Tab ── */}
      {activeTab === "mcp" && (
        <SectionCard
          title="MCP Server"
          description="Connect AI agents like Claude Code, Claude Desktop, or ChatGPT to your notes."
          icon={ServerIcon}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable MCP access</span>
              <Button
                variant={config.mcpEnabled ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  updateConfig({ mcpEnabled: !config.mcpEnabled })
                }
              >
                {config.mcpEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>

            {config.mcpEnabled && (
              <>
                {/* Token management */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      placeholder="Token name (e.g. Claude Code)"
                      className="text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") createToken()
                      }}
                    />
                    <Button size="sm" onClick={createToken}>
                      <PlusIcon className="mr-1 size-3.5" />
                      Create
                    </Button>
                  </div>

                  {createdToken && (
                    <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3">
                      <p className="mb-2 text-xs font-medium text-green-600 dark:text-green-400">
                        Token created. Copy it now; it will not be shown again.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">
                          {createdToken}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={copyToken}
                        >
                          {copied ? (
                            <CheckIcon className="size-3.5 text-green-500" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {tokens.length > 0 && (
                    <div className="space-y-2">
                      {tokens.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div>
                            <span className="text-sm font-medium">
                              {t.name}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t.tokenPrefix}...
                            </span>
                            {t.lastUsedAt && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                Last used:{" "}
                                {new Date(t.lastUsedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => revokeToken(t.id)}
                          >
                            <TrashIcon className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Setup instructions */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowSetup(!showSetup)}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      {showSetup ? "Hide" : "Show"} setup instructions
                    </button>
                    <OpenIn
                      query={`Set up the openvlt MCP server for me. Run this command:\n\nclaude mcp add openvlt -- node ${typeof window !== "undefined" ? window.location.origin : ""}/bin/openvlt-mcp\n\nThen set the environment variable OPENVLT_API_TOKEN to connect to my openvlt instance at ${typeof window !== "undefined" ? window.location.origin : ""}`}
                    >
                      <OpenInTrigger>
                        <Button variant="outline" size="sm">
                          <ExternalLinkIcon className="mr-1 size-3.5" />
                          Set up with AI
                        </Button>
                      </OpenInTrigger>
                      <OpenInContent>
                        <OpenInLabel>Set up MCP with...</OpenInLabel>
                        <OpenInSeparator />
                        <OpenInClaude />
                        <OpenInChatGPT />
                        <OpenInCursor />
                      </OpenInContent>
                    </OpenIn>
                  </div>
                  {showSetup && (
                    <div className="mt-3 space-y-4 text-sm">
                      <div>
                        <p className="mb-1 font-medium">Claude Desktop</p>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Add to ~/.claude/claude_desktop_config.json:
                        </p>
                        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`{
  "mcpServers": {
    "openvlt": {
      "command": "node",
      "args": ["<path-to-openvlt>/bin/openvlt-mcp"],
      "env": {
        "OPENVLT_API_TOKEN": "<your-token>",
        "OPENVLT_DB_PATH": "<path-to-data>/.openvlt/openvlt.db"
      }
    }
  }
}`}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 font-medium">Claude Code</p>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Run in your terminal:
                        </p>
                        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`claude mcp add openvlt -- node <path-to-openvlt>/bin/openvlt-mcp`}
                        </pre>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Then set the OPENVLT_API_TOKEN environment variable.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* ── Tools Tab ── */}
      {activeTab === "tools" && (
        <SectionCard
          title="Tools"
          description="Manage which tools the AI agent can use."
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The AI agent has access to the following tools when chatting with your notes:
            </p>
            <div className="space-y-2">
              {[
                { name: "search_notes", desc: "Full-text search across all notes" },
                { name: "list_notes", desc: "List all notes in the vault" },
                { name: "get_note", desc: "Read a note's content" },
                { name: "create_note", desc: "Create a new note" },
                { name: "update_note", desc: "Edit an existing note" },
                { name: "delete_note", desc: "Move a note to trash" },
                { name: "get_excalidraw", desc: "Read an excalidraw drawing" },
                { name: "draw_excalidraw", desc: "Add shapes to a drawing" },
                { name: "list_folders", desc: "List folder structure" },
                { name: "list_tags", desc: "List all tags" },
                { name: "web_search", desc: "Search the web (provider-dependent)" },
              ].map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <span className="font-mono text-sm">{tool.name}</span>
                    <p className="text-xs text-muted-foreground">{tool.desc}</p>
                  </div>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
