"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  LogOutIcon,
  DownloadIcon,
  TrashIcon,
  UserIcon,
  KeyIcon,
  CloudIcon,
  RefreshCwIcon,
  ArrowDownCircleIcon,
  AlertTriangleIcon,
  TerminalIcon,
  LinkIcon,
  UnlinkIcon,
  CheckCircleIcon,
  XCircleIcon,
  LoaderIcon,
  PlayIcon,
  ServerIcon,
  SettingsIcon,
  CodeIcon,
  DatabaseIcon,
  KeyboardIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  FingerprintIcon,
  CopyIcon,
  SparklesIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  LayoutPanelLeftIcon,
  PanelTopIcon,
} from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useSidebarLayout } from "@/hooks/use-sidebar-layout"
import { useStickyTableHeader } from "@/hooks/use-sticky-table-header"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import {
  useShortcuts,
  ShortcutKeys,
  eventToBinding,
  bindingToString,
  getConflicts,
  formatShortcut,
  type ShortcutBinding,
} from "@/lib/stores/shortcuts-store"
import { confirmDialog, promptDialog } from "@/lib/dialogs"
import { useIsMobile } from "@/hooks/use-mobile"
import type { User, BackupFrequency, BackupRun, TwoFactorStatus } from "@/types"
import { AISettingsTab } from "@/components/ai-settings"
import { QRCodeSVG } from "qrcode.react"
import { startRegistration } from "@simplewebauthn/browser"

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  badge,
  variant = "default",
}: {
  title: string
  description?: string
  icon?: React.ElementType
  children: React.ReactNode
  badge?: string
  variant?: "default" | "destructive"
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div
            className={`flex size-8 items-center justify-center rounded-lg ${
              variant === "destructive" ? "bg-destructive/10" : "bg-muted"
            }`}
          >
            <Icon
              className={`size-4 ${
                variant === "destructive"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            />
          </div>
        )}
        <div>
          <h3
            className={`text-sm font-semibold ${
              variant === "destructive" ? "text-destructive" : ""
            }`}
          >
            {title}
            {badge && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {badge}
              </span>
            )}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div
        className={`rounded-lg border p-4 ${
          variant === "destructive" ? "border-destructive/30" : ""
        }`}
      >
        {children}
      </div>
    </section>
  )
}

// ── Instance Sync Section ──

interface SyncDevice {
  deviceId: string
  displayName: string
  lastSeenAt: string
  browser: string | null
  os: string | null
  isOnline: boolean
}

interface SyncConnectionStatus {
  role: "standalone" | "client" | "server"
  serverUrl: string | null
  username: string | null
  connectedAt: string | null
  lastSyncAt: string | null
  clientCount: number
  devices: SyncDevice[]
}

function InstanceSyncSection() {
  const [status, setStatus] = React.useState<SyncConnectionStatus>({
    role: "standalone",
    serverUrl: null,
    username: null,
    connectedAt: null,
    lastSyncAt: null,
    clientCount: 0,
    devices: [],
  })
  const [serverUrl, setServerUrl] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [serverLive, setServerLive] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/sync/server-connection")
        if (res.ok) {
          const data = await res.json()
          setStatus(data)
        }
      } catch {}

      // If client, ping the server to check if it's live
      const url = status.serverUrl
      if (status.role === "client" && url) {
        try {
          const res = await fetch(`${url}/api/sync/heartbeat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId: "ping", displayName: "ping" }),
            signal: AbortSignal.timeout(5000),
          })
          setServerLive(res.ok || res.status === 401)
        } catch {
          setServerLive(false)
        }
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.role, status.serverUrl])

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/sync/server-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl, username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Connection failed")
        return
      }
      setStatus(data)
      setServerUrl("")
      setUsername("")
      setPassword("")
      toast.success("Connected to server")
    } catch {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    const ok = await confirmDialog({
      title: "Disconnect from server",
      description:
        "Your local copy of all notes will be preserved. You can reconnect later.",
      confirmLabel: "Disconnect",
      destructive: true,
    })
    if (!ok) return

    const res = await fetch("/api/sync/server-connection", { method: "DELETE" })
    if (res.ok) {
      setStatus(await res.json())
      toast.success("Disconnected. This instance is now standalone.")
    }
  }

  async function handlePromote() {
    const ok = await confirmDialog({
      title: "Promote to server",
      description:
        "This will designate this instance as the primary server. Only do this if your original server is permanently unavailable.",
      confirmLabel: "Promote",
    })
    if (!ok) return

    const res = await fetch("/api/sync/server-connection/promote", {
      method: "POST",
    })
    if (res.ok) {
      setStatus(await res.json())
      toast.success("This instance is now the primary server")
    }
  }

  const roleBadge = {
    standalone: (
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Standalone
      </span>
    ),
    client: (
      <span className="rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
        Connected
      </span>
    ),
    server: (
      <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
        Server
      </span>
    ),
  }[status.role]

  // ── Visual diagram ──
  const diagram = (() => {
    if (status.role === "standalone") {
      return (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-6">
          <div className="flex size-14 items-center justify-center rounded-xl bg-muted">
            <ServerIcon className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">This instance</p>
            <p className="text-xs text-muted-foreground">
              Running independently
            </p>
          </div>
        </div>
      )
    }

    if (status.role === "client") {
      return (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6">
          <div className="relative flex size-12 items-center justify-center rounded-xl bg-muted">
            <MonitorIcon className="size-5 text-muted-foreground" />
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-background" />
          </div>
          <p className="text-xs font-medium">This instance</p>
          <div className="flex flex-col items-center gap-0.5">
            <div className="h-5 w-px bg-border" />
            <span className="text-[10px] text-muted-foreground">syncs to</span>
            <div className="h-5 w-px bg-border" />
          </div>
          <div className="relative flex size-12 items-center justify-center rounded-xl bg-blue-500/10">
            <ServerIcon className="size-5 text-blue-600 dark:text-blue-400" />
            {serverLive !== null && (
              <span
                className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-background ${
                  serverLive ? "bg-green-500" : "bg-red-500"
                }`}
              />
            )}
          </div>
          <div className="text-center">
            <p className="text-xs font-medium">{status.serverUrl}</p>
            <p className="text-[10px] text-muted-foreground">
              {serverLive === null
                ? "Checking..."
                : serverLive
                  ? "Online"
                  : "Offline"}
            </p>
          </div>
        </div>
      )
    }

    // Server mode
    const onlineDevices = status.devices.filter((d) => d.isOnline)
    const offlineDevices = status.devices.filter((d) => !d.isOnline)

    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-6">
        <div className="relative flex size-14 items-center justify-center rounded-xl bg-blue-500/10">
          <ServerIcon className="size-6 text-blue-600 dark:text-blue-400" />
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-green-500 ring-2 ring-background" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">This instance</p>
          <p className="text-xs text-muted-foreground">Primary server</p>
        </div>
        {status.devices.length > 0 && (
          <>
            <div className="h-5 w-px bg-border" />
            <div className="flex flex-wrap justify-center gap-3">
              {status.devices.map((device) => (
                <div
                  key={device.deviceId}
                  className="flex flex-col items-center gap-1"
                  title={`${device.displayName}\nLast seen: ${new Date(device.lastSeenAt).toLocaleString()}`}
                >
                  <div className="relative flex size-10 items-center justify-center rounded-lg bg-muted">
                    <MonitorIcon className="size-4 text-muted-foreground" />
                    <span
                      className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background ${
                        device.isOnline ? "bg-green-500" : "bg-muted-foreground/30"
                      }`}
                    />
                  </div>
                  <p className="max-w-[80px] truncate text-[10px] text-muted-foreground">
                    {device.displayName.split(" on ")[0]}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {onlineDevices.length} online
              {offlineDevices.length > 0 &&
                `, ${offlineDevices.length} offline`}
            </p>
          </>
        )}
      </div>
    )
  })()

  return (
    <SectionCard
      title="Instance Sync"
      description="Sync notes across devices"
      icon={ServerIcon}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Instance role</p>
          {roleBadge}
        </div>

        {diagram}

        {/* Standalone: show connect form */}
        {status.role === "standalone" && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Connect to a server</p>
            <p className="text-sm text-muted-foreground">
              Enter the URL and your login credentials for the primary server.
            </p>
            <div className="space-y-2">
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://your-server.openvlt.com"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                autoComplete="username"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              size="sm"
              disabled={!serverUrl || !username || !password || loading}
              onClick={handleConnect}
            >
              {loading ? (
                <LoaderIcon className="mr-2 size-3.5 animate-spin" />
              ) : (
                <LinkIcon className="mr-2 size-3.5" />
              )}
              Connect
            </Button>

            <div className="border-t pt-4">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePromote}
              >
                <AlertTriangleIcon className="mr-2 size-3.5" />
                Promote to Server
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Only use this if your primary server is permanently unavailable
                and you want this instance to become the new server.
              </p>
            </div>
          </div>
        )}

        {/* Client: show connection details + disconnect */}
        {status.role === "client" && (
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Server</span>
                <span className="font-medium">{status.serverUrl}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium">{status.username}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Connected since</span>
                <span>
                  {status.connectedAt
                    ? new Date(status.connectedAt).toLocaleDateString()
                    : "Unknown"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last sync</span>
                <span>
                  {status.lastSyncAt
                    ? new Date(status.lastSyncAt).toLocaleString()
                    : "Never"}
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDisconnect}
            >
              <UnlinkIcon className="mr-2 size-3.5" />
              Disconnect
            </Button>
          </div>
        )}

        {/* Server: info */}
        {status.role === "server" && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              This instance is the primary server. Other openvlt instances can
              connect to it by entering this server's URL in their settings.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

export function SettingsPanel() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const isMobile = useIsMobile()
  const { layout: sidebarLayout, setLayout: setSidebarLayout } =
    useSidebarLayout()
  const { enabled: stickyHeader, setEnabled: setStickyHeader } =
    useStickyTableHeader()
  const [user, setUser] = React.useState<User | null>(null)

  // Read active settings section from URL pathname (/settings/ai, /settings/data, etc.)
  const pathname = usePathname()
  const validTabs = ["general", "account", "data", "sync", "shortcuts", "ai", "appearance", "about", "update"]
  const sectionFromPath = React.useMemo(() => {
    // Extract section from /settings/[section] — also handle legacy #hash
    const segments = pathname.split("/")
    const lastSegment = segments[segments.length - 1]
    if (lastSegment !== "settings" && validTabs.includes(lastSegment)) {
      return lastSegment
    }
    // Fallback to hash for backwards compatibility
    if (typeof window !== "undefined") {
      const hash = window.location.hash.slice(1)
      if (validTabs.includes(hash)) return hash
    }
    return "general"
  }, [pathname])

  const [activeTab, setActiveTabState] = React.useState(sectionFromPath)

  // Sync when pathname changes (e.g. navigating from /settings/general to /settings/ai)
  React.useEffect(() => {
    setActiveTabState(sectionFromPath)
  }, [sectionFromPath])

  const setActiveTab = React.useCallback((tab: string) => {
    setActiveTabState(tab)
    router.replace(`/settings/${tab}`, { scroll: false })
  }, [router])

  const tabsScrollRef = React.useRef<HTMLDivElement>(null)

  // 2FA state
  const [twoFactorStatus, setTwoFactorStatus] =
    React.useState<TwoFactorStatus | null>(null)
  const [totpSetup, setTotpSetup] = React.useState<{
    secret: string
    uri: string
  } | null>(null)
  const [totpSetupCode, setTotpSetupCode] = React.useState("")
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(
    null
  )
  const [twoFALoading, setTwoFALoading] = React.useState(false)
  const [disablePassword, setDisablePassword] = React.useState("")
  const [passkeys, setPasskeys] = React.useState<
    { id: string; device_name: string; created_at: string }[]
  >([])
  const [passkeyName, setPasskeyName] = React.useState("")

  async function fetchTwoFactorStatus() {
    try {
      const res = await fetch("/api/auth/2fa/status")
      if (res.ok) setTwoFactorStatus(await res.json())
    } catch {}
  }

  async function fetchPasskeys() {
    try {
      const res = await fetch("/api/auth/webauthn/credentials")
      if (res.ok) setPasskeys(await res.json())
    } catch {}
  }

  React.useEffect(() => {
    fetchTwoFactorStatus()
    fetchPasskeys()
  }, [])

  async function handleTotpSetup() {
    setTwoFALoading(true)
    try {
      const res = await fetch("/api/auth/2fa/totp/setup")
      if (res.ok) {
        const data = await res.json()
        setTotpSetup(data)
        setTotpSetupCode("")
      }
    } catch {}
    setTwoFALoading(false)
  }

  async function handleTotpVerifySetup() {
    setTwoFALoading(true)
    try {
      const res = await fetch("/api/auth/2fa/totp/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpSetupCode }),
      })
      const data = await res.json()
      if (res.ok) {
        setRecoveryCodes(data.recoveryCodes)
        setTotpSetup(null)
        setTotpSetupCode("")
        fetchTwoFactorStatus()
        toast.success("Two-factor authentication enabled")
      } else {
        toast.error(data.error || "Invalid code")
      }
    } catch {
      toast.error("Failed to verify code")
    }
    setTwoFALoading(false)
  }

  async function handleTotpDisable() {
    if (!disablePassword) {
      toast.error("Password is required")
      return
    }
    setTwoFALoading(true)
    try {
      const res = await fetch("/api/auth/2fa/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      })
      const data = await res.json()
      if (res.ok) {
        setDisablePassword("")
        fetchTwoFactorStatus()
        toast.success("Two-factor authentication disabled")
      } else {
        toast.error(data.error || "Failed to disable 2FA")
      }
    } catch {
      toast.error("Failed to disable 2FA")
    }
    setTwoFALoading(false)
  }

  async function handleRegenerateRecoveryCodes() {
    const password = await promptDialog({
      title: "Regenerate recovery codes",
      description:
        "Enter your password to generate new recovery codes. This will invalidate all existing codes.",
      placeholder: "Enter your password",
      type: "password",
    })
    if (!password) return

    setTwoFALoading(true)
    try {
      const res = await fetch("/api/auth/2fa/recovery-codes/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok) {
        setRecoveryCodes(data.recoveryCodes)
        fetchTwoFactorStatus()
        toast.success("Recovery codes regenerated")
      } else {
        toast.error(data.error || "Failed to regenerate codes")
      }
    } catch {
      toast.error("Failed to regenerate codes")
    }
    setTwoFALoading(false)
  }

  async function handleRegisterPasskey() {
    setTwoFALoading(true)
    try {
      const optionsRes = await fetch("/api/auth/webauthn/register")
      if (!optionsRes.ok) {
        toast.error("Failed to start passkey registration")
        return
      }
      const options = await optionsRes.json()
      const registration = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch("/api/auth/webauthn/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: registration,
          deviceName: passkeyName || "Passkey",
        }),
      })

      if (verifyRes.ok) {
        setPasskeyName("")
        fetchPasskeys()
        fetchTwoFactorStatus()
        toast.success("Passkey registered")
      } else {
        const data = await verifyRes.json()
        toast.error(data.error || "Registration failed")
      }
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        toast.error("Passkey registration was cancelled")
      } else {
        toast.error("Passkey registration failed")
      }
    }
    setTwoFALoading(false)
  }

  async function handleDeletePasskey(id: string) {
    const ok = await confirmDialog({
      title: "Remove passkey",
      description:
        "This passkey will no longer be usable for login or two-factor authentication.",
      confirmLabel: "Remove",
      destructive: true,
    })
    if (!ok) return

    try {
      const res = await fetch(
        `/api/auth/webauthn/credentials?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        fetchPasskeys()
        fetchTwoFactorStatus()
        toast.success("Passkey removed")
      }
    } catch {
      toast.error("Failed to remove passkey")
    }
  }

  // Update check state
  const [updateInfo, setUpdateInfo] = React.useState<{
    isGit: boolean
    currentHash: string
    currentDate: string
    updatesAvailable: boolean
    commitsBehind: number
    latestMessage?: string
    error?: string
  } | null>(null)
  const [updateChecking, setUpdateChecking] = React.useState(false)
  const [updating, setUpdating] = React.useState(false)
  const [updateLogs, setUpdateLogs] = React.useState<string[]>([])

  React.useEffect(() => {
    checkForUpdates()
  }, [])

  React.useEffect(() => {
    if (!isMobile || !tabsScrollRef.current) return
    const container = tabsScrollRef.current
    const active = container.querySelector<HTMLElement>(
      '[data-state="active"]'
    )
    if (!active) return
    const scrollLeft =
      active.offsetLeft -
      container.offsetWidth / 2 +
      active.offsetWidth / 2
    container.scrollTo({ left: scrollLeft, behavior: "smooth" })
  }, [activeTab, isMobile])

  async function checkForUpdates() {
    setUpdateChecking(true)
    try {
      const res = await fetch("/api/system/update-check")
      if (res.ok) setUpdateInfo(await res.json())
    } catch {}
    setUpdateChecking(false)
  }

  async function performUpdate() {
    const confirmed = await confirmDialog({
      title: "Update openvlt",
      description:
        "This will pull the latest code, install dependencies, rebuild, and restart the server. The app will be briefly unavailable during the restart. Continue?",
      confirmLabel: "Update now",
    })
    if (!confirmed) return

    setUpdating(true)
    setUpdateLogs(["Starting update..."])
    try {
      const res = await fetch("/api/system/update", { method: "POST" })
      const data = await res.json()
      setUpdateLogs(data.logs || [])
      if (data.success) {
        toast.success("Update complete. Reloading...")
        setTimeout(() => window.location.reload(), 3000)
      } else {
        toast.error(data.error || "Update failed")
      }
    } catch {
      toast.error(
        "Update request failed. Try running 'openvlt update' from the terminal."
      )
    }
    setUpdating(false)
  }

  const [versionRetention, setVersionRetention] = React.useState("365")
  const [attachmentRetention, setAttachmentRetention] = React.useState("7")
  const shortcuts = useShortcuts()
  const [recordingId, setRecordingId] = React.useState<string | null>(null)

  // Listen for key presses while recording a new shortcut
  const [pendingBinding, setPendingBinding] =
    React.useState<ShortcutBinding | null>(null)
  const [pendingConflictMsg, setPendingConflictMsg] = React.useState<
    string | null
  >(null)

  React.useEffect(() => {
    if (!recordingId) return

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()

      // Escape cancels recording
      if (e.key === "Escape") {
        setRecordingId(null)
        setPendingBinding(null)
        setPendingConflictMsg(null)
        return
      }

      const binding = eventToBinding(e)
      if (!binding) return

      // Check for internal conflicts (already used by another openvlt action)
      for (const def of shortcuts.definitions) {
        if (def.id === recordingId) continue
        const existing = shortcuts.getBinding(def.id)
        if (
          existing &&
          bindingToString(existing) === bindingToString(binding)
        ) {
          toast.error(
            `Already used by "${def.label}". Choose a different shortcut.`
          )
          return
        }
      }

      // Check for external conflicts (browser, Excalidraw, tldraw)
      const conflicts = getConflicts(binding)
      if (conflicts.length > 0) {
        const unoverridable = conflicts.find((c) => c.unoverridable)
        if (unoverridable) {
          toast.error(
            `${formatShortcut(binding)} is reserved by your browser (${unoverridable.action}) and cannot be intercepted.`
          )
          return
        }
        // Show warning but let user confirm
        const lines = conflicts.map(
          (c) =>
            `${c.app === "browser" ? "Browser" : c.app === "excalidraw" ? "Excalidraw" : "tldraw"}: ${c.action}`
        )
        setPendingBinding(binding)
        setPendingConflictMsg(lines.join(", "))
        return
      }

      // No conflicts, save directly
      shortcuts.setOverride(recordingId!, binding)
      setRecordingId(null)
      setPendingBinding(null)
      setPendingConflictMsg(null)
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [recordingId, shortcuts])

  function confirmPendingShortcut() {
    if (pendingBinding && recordingId) {
      shortcuts.setOverride(recordingId, pendingBinding)
    }
    setRecordingId(null)
    setPendingBinding(null)
    setPendingConflictMsg(null)
  }

  function cancelPendingShortcut() {
    setPendingBinding(null)
    setPendingConflictMsg(null)
  }

  // Cloud Backup state
  const [backupProvider, setBackupProvider] = React.useState<{
    id: string
    provider: string
    displayName: string | null
  } | null>(null)
  const [backupConfig, setBackupConfig] = React.useState<{
    id: string
    enabled: boolean
    frequency: BackupFrequency
    maxVersions: number
  } | null>(null)
  const [backupHistory, setBackupHistory] = React.useState<BackupRun[]>([])
  const [backupLoading, setBackupLoading] = React.useState(false)
  const [backupPassword, setBackupPassword] = React.useState("")
  const [backupFrequency, setBackupFrequency] =
    React.useState<BackupFrequency>("daily")
  const [backupMaxVersions, setBackupMaxVersions] = React.useState("10")

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => {})
  }, [])

  // Load backup state
  React.useEffect(() => {
    fetch("/api/backup/providers")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          providers: {
            id: string
            provider: string
            displayName: string | null
          }[]
        ) => {
          if (providers.length > 0) setBackupProvider(providers[0])
        }
      )
      .catch(() => {})

    fetch("/api/backup/config")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          config: {
            id: string
            enabled: boolean
            frequency: BackupFrequency
            maxVersions: number
          } | null
        ) => {
          if (config) {
            setBackupConfig(config)
            setBackupFrequency(config.frequency)
            setBackupMaxVersions(String(config.maxVersions))
          }
        }
      )
      .catch(() => {})

    fetch("/api/backup/history")
      .then((r) => (r.ok ? r.json() : []))
      .then(setBackupHistory)
      .catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  async function handleExport() {
    window.location.href = "/api/export"
  }

  async function handleChangePassword() {
    const current = await promptDialog({
      title: "Change password",
      description: "Current password:",
      type: "password",
    })
    if (!current) return
    const newPass = await promptDialog({
      title: "Change password",
      description: "New password:",
      type: "password",
    })
    if (!newPass) return
    const confirmPass = await promptDialog({
      title: "Change password",
      description: "Confirm new password:",
      type: "password",
    })
    if (newPass !== confirmPass) {
      toast.error("Passwords don't match")
      return
    }
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: newPass }),
    })
    if (res.ok) {
      alert("Password changed successfully")
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || "Failed to change password")
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            orientation={isMobile ? "horizontal" : "vertical"}
            className="flex-col gap-4 md:flex-row md:items-start md:gap-10"
          >
            <div className="sticky top-0 z-10 -mx-6 shrink-0 bg-background md:mx-0 md:w-35">
              <div className="hidden items-center gap-2.5 pb-4 md:flex">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <SettingsIcon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-none">Settings</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    @{user?.username || "..."}
                  </p>
                </div>
              </div>
              <div ref={tabsScrollRef} className="hide-scrollbar overflow-x-auto overflow-y-hidden md:overflow-visible">
                <TabsList
                  variant="line"
                  className="inline-flex h-auto w-max gap-0.5 bg-transparent px-6 md:w-full md:flex-col md:items-stretch md:p-0.5"
                >
                  {(
                    [
                      { value: "general", icon: UserIcon, label: "Account" },
                      { value: "data", icon: DatabaseIcon, label: "Data" },
                      { value: "sync", icon: CloudIcon, label: "Sync" },
                      {
                        value: "shortcuts",
                        icon: KeyboardIcon,
                        label: "Shortcuts",
                      },
                      {
                        value: "ai",
                        icon: SparklesIcon,
                        label: "AI",
                      },
                      {
                        value: "update",
                        icon: ArrowDownCircleIcon,
                        label: "Update",
                      },
                    ] as const
                  ).map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="relative shrink-0 flex-none justify-start gap-2.5 rounded-lg px-3 pb-3.5 pt-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/50 hover:text-foreground focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:bg-primary data-[state=active]:after:rounded-full after:bottom-0 md:shrink md:flex-initial md:pb-2 md:after:bottom-auto md:w-full"
                    >
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-md">
                        <tab.icon className="size-4" />
                      </div>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <div className="mt-4 hidden border-t pt-4 md:block">
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <div className="size-1.5 rounded-full bg-green-500" />
                  <span className="text-xs text-muted-foreground">
                    Build{" "}
                    <code className="font-mono">
                      {(
                        process.env.NEXT_PUBLIC_COMMIT_HASH || "dev"
                      ).slice(0, 7)}
                    </code>
                  </span>
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
            {/* ── Account Tab ── */}
            <TabsContent value="general" className="space-y-6">
              {/* Account */}
              <SectionCard
                title="Account"
                description="Manage your profile and authentication"
                icon={UserIcon}
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <UserIcon className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {user?.displayName || user?.username || "Loading..."}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        @{user?.username || "..."}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleChangePassword}
                    >
                      <KeyIcon className="mr-2 size-3.5" />
                      Change Password
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLogout}
                    >
                      <LogOutIcon className="mr-2 size-3.5" />
                      Log Out
                    </Button>
                  </div>
                </div>
              </SectionCard>

              {/* Appearance */}
              <SectionCard
                title="Appearance"
                description="Theme and layout preferences"
                icon={SunIcon}
              >
                <div className="space-y-4">
                  <div className="space-y-3">
                    <label className="text-sm text-muted-foreground">
                      Theme
                    </label>
                    <div className="flex gap-2">
                      {(
                        [
                          { value: "light", icon: SunIcon, label: "Light" },
                          { value: "dark", icon: MoonIcon, label: "Dark" },
                          {
                            value: "system",
                            icon: MonitorIcon,
                            label: "System",
                          },
                        ] as const
                      ).map((opt) => (
                        <Button
                          key={opt.value}
                          variant={
                            theme === opt.value ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setTheme(opt.value)}
                        >
                          <opt.icon className="mr-2 size-3.5" />
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 border-t pt-4">
                    <label className="text-sm text-muted-foreground">
                      Sidebar Layout
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant={
                          sidebarLayout === "rail" ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSidebarLayout("rail")}
                      >
                        <LayoutPanelLeftIcon className="mr-2 size-3.5" />
                        Rail
                      </Button>
                      <Button
                        variant={
                          sidebarLayout === "horizontal"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => setSidebarLayout("horizontal")}
                      >
                        <PanelTopIcon className="mr-2 size-3.5" />
                        Horizontal
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t pt-4">
                    <div>
                      <p className="text-sm font-medium">
                        Sticky table headers
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Keep the header row visible when scrolling long tables
                      </p>
                    </div>
                    <Switch
                      checked={stickyHeader}
                      onCheckedChange={setStickyHeader}
                    />
                  </div>
                </div>
              </SectionCard>

              {/* Security / 2FA */}
              <SectionCard
                title="Security"
                description="Two-factor authentication"
                icon={ShieldCheckIcon}
              >
                <div className="space-y-4">
                  {/* Status badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`size-2 rounded-full ${twoFactorStatus?.enabled ? "bg-green-500" : "bg-muted-foreground/30"}`}
                      />
                      <span className="text-sm font-medium">
                        Two-factor authentication
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        twoFactorStatus?.enabled
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {twoFactorStatus?.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>

                  {/* Recovery codes modal */}
                  {recoveryCodes && (
                    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-start gap-2">
                        <KeyIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div>
                          <p className="text-sm font-medium">
                            Save your recovery codes
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Store these codes in a safe place. Each code can
                            only be used once.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 rounded-md bg-muted p-3">
                        {recoveryCodes.map((code, i) => (
                          <code
                            key={i}
                            className="font-mono text-sm tracking-wider"
                          >
                            {code}
                          </code>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              recoveryCodes.join("\n")
                            )
                            toast.success("Copied to clipboard")
                          }}
                        >
                          <CopyIcon className="mr-2 size-3.5" />
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const blob = new Blob(
                              [
                                `openvlt Recovery Codes\n${"=".repeat(30)}\n\n${recoveryCodes.join("\n")}\n\nEach code can only be used once.\n`,
                              ],
                              { type: "text/plain" }
                            )
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement("a")
                            a.href = url
                            a.download = "openvlt-recovery-codes.txt"
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                        >
                          <DownloadIcon className="mr-2 size-3.5" />
                          Download
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setRecoveryCodes(null)}
                      >
                        I have saved these codes
                      </Button>
                    </div>
                  )}

                  {/* TOTP setup flow */}
                  {!twoFactorStatus?.hasTotp && !totpSetup && (
                    <div className="flex items-center justify-between border-t pt-4">
                      <div className="flex items-center gap-2">
                        <SmartphoneIcon className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            Authenticator app
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Use Google Authenticator, Apple Passwords, or
                            similar
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleTotpSetup}
                        disabled={twoFALoading}
                      >
                        {twoFALoading ? (
                          <LoaderIcon className="mr-2 size-3.5 animate-spin" />
                        ) : (
                          <SmartphoneIcon className="mr-2 size-3.5" />
                        )}
                        Set up
                      </Button>
                    </div>
                  )}

                  {/* TOTP QR code setup */}
                  {totpSetup && (
                    <div className="space-y-4 border-t pt-4">
                      <p className="text-sm font-medium">
                        Scan this QR code with your authenticator app
                      </p>
                      <div className="flex justify-center rounded-lg bg-white p-4">
                        <QRCodeSVG
                          value={totpSetup.uri}
                          size={180}
                          level="M"
                        />
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Manual setup key
                        </summary>
                        <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                          {totpSetup.secret}
                        </code>
                      </details>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Enter the 6-digit code to verify
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={totpSetupCode}
                            onChange={(e) =>
                              setTotpSetupCode(
                                e.target.value.replace(/\D/g, "")
                              )
                            }
                            placeholder="000000"
                            className="h-9 w-32 rounded-md border bg-background px-3 text-center font-mono text-sm tracking-widest placeholder:text-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                          />
                          <Button
                            size="sm"
                            onClick={handleTotpVerifySetup}
                            disabled={
                              twoFALoading || totpSetupCode.length !== 6
                            }
                          >
                            {twoFALoading ? (
                              <LoaderIcon className="mr-2 size-3.5 animate-spin" />
                            ) : (
                              <CheckCircleIcon className="mr-2 size-3.5" />
                            )}
                            Verify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTotpSetup(null)
                              setTotpSetupCode("")
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TOTP enabled state */}
                  {twoFactorStatus?.hasTotp && !totpSetup && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <SmartphoneIcon className="size-4 text-green-500" />
                          <div>
                            <p className="text-sm font-medium">
                              Authenticator app
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Enabled
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Disable TOTP */}
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={disablePassword}
                            onChange={(e) =>
                              setDisablePassword(e.target.value)
                            }
                            placeholder="Enter password to disable"
                            className="h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleTotpDisable}
                            disabled={twoFALoading || !disablePassword}
                          >
                            Disable 2FA
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Passkeys */}
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FingerprintIcon className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Passkeys</p>
                          <p className="text-xs text-muted-foreground">
                            Use biometrics or a security key to sign in
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Existing passkeys */}
                    {passkeys.length > 0 && (
                      <div className="space-y-1.5">
                        {passkeys.map((pk) => (
                          <div
                            key={pk.id}
                            className="flex items-center justify-between rounded-md border px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <FingerprintIcon className="size-3.5 text-muted-foreground" />
                              <div>
                                <p className="text-sm">{pk.device_name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Added{" "}
                                  {new Date(
                                    pk.created_at
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDeletePasskey(pk.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Register new passkey */}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={passkeyName}
                        onChange={(e) => setPasskeyName(e.target.value)}
                        placeholder="Passkey name (e.g. MacBook)"
                        className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={handleRegisterPasskey}
                        disabled={twoFALoading}
                      >
                        {twoFALoading ? (
                          <LoaderIcon className="mr-2 size-3.5 animate-spin" />
                        ) : (
                          <FingerprintIcon className="mr-2 size-3.5" />
                        )}
                        Add passkey
                      </Button>
                    </div>

                    {twoFactorStatus?.enabled &&
                      twoFactorStatus?.hasWebauthn && (
                        <p className="text-xs text-muted-foreground">
                          Registered passkeys can also be used as a second
                          factor during login.
                        </p>
                      )}
                  </div>

                  {/* Recovery codes */}
                  {twoFactorStatus?.enabled && !recoveryCodes && (
                    <div className="flex items-center justify-between border-t pt-4">
                      <div>
                        <p className="text-sm font-medium">Recovery codes</p>
                        <p className="text-xs text-muted-foreground">
                          {twoFactorStatus.recoveryCodesRemaining} of 10 codes
                          remaining
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRegenerateRecoveryCodes}
                        disabled={twoFALoading}
                      >
                        <RefreshCwIcon className="mr-2 size-3.5" />
                        Regenerate
                      </Button>
                    </div>
                  )}
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── Shortcuts Tab ── */}
            <TabsContent value="shortcuts" className="space-y-6">
              <SectionCard
                title="Keyboard Shortcuts"
                description="Customize shortcuts for common actions"
                icon={KeyboardIcon}
              >
                <div className="space-y-1">
                  {(["general", "navigation", "editor"] as const).map(
                    (category) => {
                      const defs = shortcuts.definitions.filter(
                        (d) => d.category === category
                      )
                      if (defs.length === 0) return null
                      return (
                        <div
                          key={category}
                          className="space-y-0.5 first:pt-0 [&:not(:first-child)]:pt-1"
                        >
                          <h3 className="flex items-center gap-2 pb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                            {category}
                            <span className="h-px flex-1 bg-border" />
                          </h3>
                          {defs.map((def) => {
                            const binding = shortcuts.getBinding(def.id)
                            const isOverridden = def.id in shortcuts.overrides
                            const isRecording = recordingId === def.id
                            const showConflictWarning =
                              isRecording &&
                              pendingBinding &&
                              pendingConflictMsg
                            const existingConflicts = binding
                              ? getConflicts(binding)
                              : []

                            return (
                              <div key={def.id} className="space-y-1">
                                <div className="flex items-center justify-between rounded-md px-2 py-1.5">
                                  <span className="text-sm">{def.label}</span>
                                  <div className="flex items-center gap-2">
                                    {isRecording ? (
                                      showConflictWarning ? (
                                        <div className="flex items-center gap-2">
                                          <span className="rounded border border-yellow-500/50 bg-yellow-500/10 px-2.5 py-1 font-mono text-xs text-yellow-500">
                                            <ShortcutKeys
                                              binding={pendingBinding}
                                            />
                                          </span>
                                          <button
                                            onClick={confirmPendingShortcut}
                                            className="rounded bg-yellow-600 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-500"
                                          >
                                            Use anyway
                                          </button>
                                          <button
                                            onClick={cancelPendingShortcut}
                                            className="text-xs text-muted-foreground hover:text-foreground"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="animate-pulse rounded border border-primary bg-primary/5 px-2.5 py-1 font-mono text-xs text-primary">
                                          Press shortcut...
                                        </span>
                                      )
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setRecordingId(def.id)
                                          setPendingBinding(null)
                                          setPendingConflictMsg(null)
                                        }}
                                        className={`rounded border px-2.5 py-1 font-mono text-xs transition-colors hover:bg-accent ${
                                          existingConflicts.length > 0
                                            ? "border-yellow-500/30 bg-yellow-500/5"
                                            : "bg-muted"
                                        }`}
                                        title={
                                          existingConflicts.length > 0
                                            ? `Conflicts with: ${existingConflicts.map((c) => `${c.app} (${c.action})`).join(", ")}`
                                            : "Click to change shortcut"
                                        }
                                      >
                                        {binding ? (
                                          <ShortcutKeys binding={binding} />
                                        ) : (
                                          "Not set"
                                        )}
                                      </button>
                                    )}
                                    {isOverridden && !isRecording && (
                                      <button
                                        onClick={() =>
                                          shortcuts.resetOverride(def.id)
                                        }
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                        title="Reset to default"
                                      >
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {/* Conflict warning banner */}
                                {isRecording &&
                                  showConflictWarning &&
                                  pendingConflictMsg && (
                                    <div className="mx-2 rounded border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
                                      This shortcut conflicts with:{" "}
                                      {pendingConflictMsg}. It will be
                                      overridden when those editors are open.
                                    </div>
                                  )}
                                {/* Existing conflict indicator */}
                                {!isRecording &&
                                  existingConflicts.length > 0 && (
                                    <div className="mx-2 rounded border border-yellow-500/20 bg-yellow-500/5 px-3 py-1.5 text-xs text-yellow-600 dark:text-yellow-400">
                                      Also used by{" "}
                                      {existingConflicts
                                        .map(
                                          (c) =>
                                            `${c.app === "browser" ? "Browser" : c.app === "excalidraw" ? "Excalidraw" : "tldraw"} (${c.action})`
                                        )
                                        .join(", ")}
                                    </div>
                                  )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }
                  )}
                  {Object.keys(shortcuts.overrides).length > 0 && (
                    <div className="border-t pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={shortcuts.resetAll}
                      >
                        Reset All to Defaults
                      </Button>
                    </div>
                  )}
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── Data Tab ── */}
            <TabsContent value="data" className="space-y-6">
              {/* Export */}
              <SectionCard
                title="Export"
                description="Download your notes"
                icon={DownloadIcon}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Download all your notes and attachments as a ZIP file
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={handleExport}
                  >
                    <DownloadIcon className="mr-2 size-3.5" />
                    Export ZIP
                  </Button>
                </div>
              </SectionCard>

              {/* Purge Trash */}
              <SectionCard
                title="Purge Trash"
                description="Permanently delete all trashed notes"
                icon={TrashIcon}
                variant="destructive"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    This will permanently delete all notes in your trash. This
                    action cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Purge trash",
                        description:
                          "Permanently delete ALL trashed notes? This cannot be undone.",
                        confirmLabel: "Delete all",
                        destructive: true,
                      })
                      if (!ok) return
                      await fetch("/api/notes?action=purgeTrash", {
                        method: "DELETE",
                      })
                      toast.success("Trash purged")
                    }}
                  >
                    <TrashIcon className="mr-2 size-3.5" />
                    Purge Trash
                  </Button>
                </div>
              </SectionCard>
            </TabsContent>

            {/* ── Sync Tab ── */}
            <TabsContent value="sync" className="space-y-6">
              {/* Instance Sync */}
              <InstanceSyncSection />

              {/* Version Retention */}
              <SectionCard
                title="Version History"
                description="Configure how long note and attachment versions are kept"
                icon={CodeIcon}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">
                        Version History Retention
                      </label>
                      <p className="text-sm text-muted-foreground">
                        How long to keep note version history
                      </p>
                    </div>
                    <select
                      value={versionRetention}
                      onChange={(e) => setVersionRetention(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                      <option value="365">365 days</option>
                      <option value="0">Forever</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">
                        Attachment Version Retention
                      </label>
                      <p className="text-sm text-muted-foreground">
                        How long to keep old attachment versions
                      </p>
                    </div>
                    <select
                      value={attachmentRetention}
                      onChange={(e) => setAttachmentRetention(e.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">365 days</option>
                      <option value="0">Forever</option>
                    </select>
                  </div>
                </div>
              </SectionCard>

              {/* Cloud Backup */}
              <SectionCard
                title="Cloud Backup"
                description="Automatic encrypted backups to Google Drive"
                icon={CloudIcon}
              >
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <CloudIcon className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Google Drive</p>
                        <p className="text-sm text-muted-foreground">
                          {backupProvider ? "Connected" : "Not connected"}
                        </p>
                      </div>
                    </div>
                    {backupProvider ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await fetch(
                            `/api/backup/providers/${backupProvider.id}`,
                            { method: "DELETE" }
                          )
                          setBackupProvider(null)
                          setBackupConfig(null)
                        }}
                      >
                        <UnlinkIcon className="mr-2 size-3.5" />
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const res = await fetch("/api/backup/providers", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              provider: "google_drive",
                            }),
                          })
                          if (res.ok) {
                            const { authUrl } = await res.json()
                            window.location.href = authUrl
                          }
                        }}
                      >
                        <LinkIcon className="mr-2 size-3.5" />
                        Connect Google Drive
                      </Button>
                    )}
                  </div>

                  {backupProvider && !backupConfig && (
                    <div className="space-y-3 border-t pt-4">
                      <p className="text-sm font-medium">
                        Set up automatic backups
                      </p>
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-muted-foreground">
                          Frequency
                        </label>
                        <select
                          value={backupFrequency}
                          onChange={(e) =>
                            setBackupFrequency(
                              e.target.value as BackupFrequency
                            )
                          }
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="hourly">Every hour</option>
                          <option value="every_6h">Every 6 hours</option>
                          <option value="every_12h">Every 12 hours</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-muted-foreground">
                          History versions to keep
                        </label>
                        <select
                          value={backupMaxVersions}
                          onChange={(e) =>
                            setBackupMaxVersions(e.target.value)
                          }
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="5">5</option>
                          <option value="10">10</option>
                          <option value="25">25</option>
                          <option value="50">50</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">
                          Backup password (needed to restore)
                        </label>
                        <input
                          type="password"
                          value={backupPassword}
                          onChange={(e) => setBackupPassword(e.target.value)}
                          placeholder="Enter a backup password"
                          className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          All backups are encrypted. You will need this
                          password to restore notes.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={!backupPassword}
                        onClick={async () => {
                          const res = await fetch("/api/backup/config", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              providerId: backupProvider.id,
                              frequency: backupFrequency,
                              backupPassword,
                              maxVersions: parseInt(backupMaxVersions, 10),
                            }),
                          })
                          if (res.ok) {
                            const config = await res.json()
                            setBackupConfig(config)
                            setBackupPassword("")
                          }
                        }}
                      >
                        Enable Backup
                      </Button>
                    </div>
                  )}

                  {backupProvider && backupConfig && (
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          Automatic backups{" "}
                          <span
                            className={
                              backupConfig.enabled
                                ? "text-green-600"
                                : "text-muted-foreground"
                            }
                          >
                            {backupConfig.enabled ? "enabled" : "paused"}
                          </span>
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const res = await fetch("/api/backup/config", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                enabled: !backupConfig.enabled,
                              }),
                            })
                            if (res.ok) {
                              setBackupConfig({
                                ...backupConfig,
                                enabled: !backupConfig.enabled,
                              })
                            }
                          }}
                        >
                          {backupConfig.enabled ? "Pause" : "Resume"}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm text-muted-foreground">
                          Frequency
                        </label>
                        <select
                          value={backupConfig.frequency}
                          onChange={async (e) => {
                            const freq = e.target.value as BackupFrequency
                            await fetch("/api/backup/config", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({ frequency: freq }),
                            })
                            setBackupConfig({
                              ...backupConfig,
                              frequency: freq,
                            })
                          }}
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="hourly">Every hour</option>
                          <option value="every_6h">Every 6 hours</option>
                          <option value="every_12h">Every 12 hours</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={backupLoading}
                        onClick={async () => {
                          setBackupLoading(true)
                          try {
                            await fetch("/api/backup/run", {
                              method: "POST",
                            })
                            const histRes =
                              await fetch("/api/backup/history")
                            if (histRes.ok)
                              setBackupHistory(await histRes.json())
                          } finally {
                            setBackupLoading(false)
                          }
                        }}
                      >
                        {backupLoading ? (
                          <LoaderIcon className="mr-2 size-3.5 animate-spin" />
                        ) : (
                          <PlayIcon className="mr-2 size-3.5" />
                        )}
                        Backup Now
                      </Button>
                      {backupHistory.length > 0 && (
                        <div className="space-y-2 border-t pt-3">
                          <p className="text-sm font-medium">
                            Recent backups
                          </p>
                          <div className="space-y-1">
                            {backupHistory.slice(0, 5).map((run) => (
                              <div
                                key={run.id}
                                className="flex items-center justify-between text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  {run.status === "completed" ? (
                                    <CheckCircleIcon className="size-3.5 text-green-600" />
                                  ) : run.status === "failed" ? (
                                    <XCircleIcon className="size-3.5 text-destructive" />
                                  ) : (
                                    <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
                                  )}
                                  <span className="text-muted-foreground">
                                    {new Date(
                                      run.startedAt
                                    ).toLocaleDateString()}{" "}
                                    {new Date(
                                      run.startedAt
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {run.filesUploaded} files
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </SectionCard>

            </TabsContent>

            {/* ── AI Tab ── */}
            <TabsContent value="ai" className="space-y-6">
              <AISettingsTab />
            </TabsContent>

            {/* ── Update Tab ── */}
            <TabsContent value="update" className="space-y-6">
              <SectionCard
                title="About"
                description="Version info and updates"
                icon={RefreshCwIcon}
              >
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">openvlt</p>
                      <p className="text-xs text-muted-foreground">
                        Build{" "}
                        <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                          {process.env.NEXT_PUBLIC_COMMIT_HASH || "dev"}
                        </code>
                        {process.env.NEXT_PUBLIC_COMMIT_DATE && (
                          <span>
                            {" "}
                            {new Date(
                              process.env.NEXT_PUBLIC_COMMIT_DATE
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 self-start sm:self-auto"
                      onClick={checkForUpdates}
                      disabled={updateChecking}
                    >
                      {updateChecking ? (
                        <LoaderIcon className="mr-2 size-3.5 animate-spin" />
                      ) : (
                        <RefreshCwIcon className="mr-2 size-3.5" />
                      )}
                      Check for updates
                    </Button>
                  </div>

                  {updateInfo && updateInfo.updatesAvailable && (
                    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-start gap-2">
                        <ArrowDownCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div>
                          <p className="text-sm font-medium">
                            Update available ({updateInfo.commitsBehind} commit
                            {updateInfo.commitsBehind !== 1 ? "s" : ""} behind)
                          </p>
                          {updateInfo.latestMessage && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Latest: {updateInfo.latestMessage}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          size="sm"
                          onClick={performUpdate}
                          disabled={updating}
                        >
                          {updating ? (
                            <LoaderIcon className="mr-2 size-3.5 animate-spin" />
                          ) : (
                            <ArrowDownCircleIcon className="mr-2 size-3.5" />
                          )}
                          {updating ? "Updating..." : "Update now"}
                        </Button>

                        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2">
                          <TerminalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">
                              You can also update from the terminal:
                            </p>
                            <code className="mt-0.5 block rounded bg-muted px-2 py-1 font-mono text-xs">
                              openvlt update
                            </code>
                          </div>
                        </div>

                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                          <span>
                            Web update will briefly restart the server. If it
                            fails, run{" "}
                            <code className="rounded bg-muted px-1 font-mono">
                              openvlt update
                            </code>{" "}
                            from the terminal to recover.
                          </span>
                        </div>
                      </div>

                      {updateLogs.length > 0 && (
                        <div className="rounded-md bg-muted p-2">
                          <pre className="max-h-32 overflow-y-auto font-mono text-xs text-muted-foreground">
                            {updateLogs.join("\n")}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {updateInfo &&
                    !updateInfo.updatesAvailable &&
                    !updateInfo.error && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircleIcon className="size-3.5 text-green-500" />
                        You are on the latest version.
                      </div>
                    )}

                  {updateInfo?.error && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <XCircleIcon className="size-3.5" />
                      {updateInfo.error}
                    </div>
                  )}

                  {updateInfo && !updateInfo.isGit && (
                    <p className="text-xs text-muted-foreground">
                      This installation was not set up via git. Updates must be
                      applied manually.
                    </p>
                  )}
                </div>
              </SectionCard>
            </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
