"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ArrowLeftIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  LogOutIcon,
  DownloadIcon,
  TrashIcon,
  UserIcon,
  KeyIcon,
  PaletteIcon,
  CloudIcon,
  RefreshCwIcon,
  LinkIcon,
  UnlinkIcon,
  CheckCircleIcon,
  XCircleIcon,
  LoaderIcon,
  PlayIcon,
  ServerIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { getCustomCss, setCustomCss } from "@/components/custom-css-injector"
import type { User, BackupFrequency, BackupRun, SyncPairing } from "@/types"

export default function SettingsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [user, setUser] = React.useState<User | null>(null)
  const [versionRetention, setVersionRetention] = React.useState("365")
  const [customCss, setCustomCssState] = React.useState("")
  const [cssSaved, setCssSaved] = React.useState(false)

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

  // Peer Sync state
  const [syncPeer, setSyncPeer] = React.useState<{
    id: string
    displayName: string
  } | null>(null)
  const [syncPairings, setSyncPairings] = React.useState<SyncPairing[]>([])
  const [pairUrl, setPairUrl] = React.useState("")
  const [pairUsername, setPairUsername] = React.useState("")
  const [pairPassword, setPairPassword] = React.useState("")
  const [pairingLoading, setPairingLoading] = React.useState(false)

  React.useEffect(() => {
    setCustomCssState(getCustomCss())
  }, [])

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => {})
  }, [])

  // Load backup state
  React.useEffect(() => {
    fetch("/api/backup/providers")
      .then((r) => (r.ok ? r.json() : []))
      .then((providers: { id: string; provider: string; displayName: string | null }[]) => {
        if (providers.length > 0) setBackupProvider(providers[0])
      })
      .catch(() => {})

    fetch("/api/backup/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((config: { id: string; enabled: boolean; frequency: BackupFrequency; maxVersions: number } | null) => {
        if (config) {
          setBackupConfig(config)
          setBackupFrequency(config.frequency)
          setBackupMaxVersions(String(config.maxVersions))
        }
      })
      .catch(() => {})

    fetch("/api/backup/history")
      .then((r) => (r.ok ? r.json() : []))
      .then(setBackupHistory)
      .catch(() => {})
  }, [])

  // Load sync state
  React.useEffect(() => {
    fetch("/api/sync/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { peer: { id: string; displayName: string }; pairings: SyncPairing[] } | null) => {
        if (data) {
          setSyncPeer(data.peer)
          setSyncPairings(data.pairings)
        }
      })
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
    const current = prompt("Current password:")
    if (!current) return
    const newPass = prompt("New password:")
    if (!newPass) return
    const confirm = prompt("Confirm new password:")
    if (newPass !== confirm) {
      alert("Passwords don't match")
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
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="text-sm font-medium">Settings</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-8 p-6">
          {/* Account */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Account</h2>
            <div className="space-y-3 rounded-lg border p-4">
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
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOutIcon className="mr-2 size-3.5" />
                  Log Out
                </Button>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Appearance</h2>
            <div className="space-y-3 rounded-lg border p-4">
              <label className="text-sm text-muted-foreground">Theme</label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "light", icon: SunIcon, label: "Light" },
                    { value: "dark", icon: MoonIcon, label: "Dark" },
                    { value: "system", icon: MonitorIcon, label: "System" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.value}
                    variant={theme === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTheme(opt.value)}
                  >
                    <opt.icon className="mr-2 size-3.5" />
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          {/* Custom CSS */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Custom CSS</h2>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <PaletteIcon className="size-4 text-muted-foreground" />
                <label className="text-sm text-muted-foreground">
                  Add custom CSS to personalize your vault appearance
                </label>
              </div>
              <textarea
                value={customCss}
                onChange={(e) => {
                  setCustomCssState(e.target.value)
                  setCssSaved(false)
                }}
                placeholder={`.tiptap {\n  font-family: 'Georgia', serif;\n}\n\n/* Style headings, links, etc. */`}
                className="h-40 w-full rounded-md border bg-muted/30 p-3 font-mono text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                spellCheck={false}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCustomCss(customCss)
                    setCssSaved(true)
                    setTimeout(() => setCssSaved(false), 2000)
                  }}
                >
                  Apply CSS
                </Button>
                {customCss && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomCssState("")
                      setCustomCss("")
                    }}
                  >
                    Clear
                  </Button>
                )}
                {cssSaved && (
                  <span className="text-sm text-muted-foreground">
                    Applied!
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Editor */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Editor</h2>
            <div className="space-y-3 rounded-lg border p-4">
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
            </div>
          </section>

          {/* Data */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Data</h2>
            <div className="space-y-3 rounded-lg border p-4">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <DownloadIcon className="mr-2 size-3.5" />
                Export All Notes (ZIP)
              </Button>
            </div>
          </section>

          {/* Cloud Backup */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Cloud Backup</h2>
            <div className="space-y-4 rounded-lg border p-4">
              {/* Provider connection */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                    <CloudIcon className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Google Drive</p>
                    <p className="text-sm text-muted-foreground">
                      {backupProvider
                        ? "Connected"
                        : "Not connected"}
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
                        body: JSON.stringify({ provider: "google_drive" }),
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

              {backupProvider && (
                <>
                  {/* Backup configuration */}
                  {!backupConfig ? (
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
                            headers: {
                              "Content-Type": "application/json",
                            },
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
                  ) : (
                    <div className="space-y-3 border-t pt-4">
                      {/* Active backup config */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            Automatic backups{" "}
                            <span
                              className={
                                backupConfig.enabled
                                  ? "text-green-600"
                                  : "text-muted-foreground"
                              }
                            >
                              {backupConfig.enabled
                                ? "enabled"
                                : "paused"}
                            </span>
                          </p>
                        </div>
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
                            const freq = e.target
                              .value as BackupFrequency
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
                          <option value="every_12h">
                            Every 12 hours
                          </option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                      </div>

                      <div className="flex gap-2">
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
                              const histRes = await fetch(
                                "/api/backup/history"
                              )
                              if (histRes.ok) {
                                setBackupHistory(await histRes.json())
                              }
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
                      </div>

                      {/* Recent backup history */}
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
                </>
              )}
            </div>
          </section>

          {/* Peer Sync */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Peer Sync</h2>
            <div className="space-y-4 rounded-lg border p-4">
              {/* This instance identity */}
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                  <ServerIcon className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {syncPeer?.displayName || "This instance"}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {syncPeer?.id
                      ? `ID: ${syncPeer.id.slice(0, 12)}...`
                      : "Loading..."}
                  </p>
                </div>
              </div>

              {/* Active pairings */}
              {syncPairings.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Paired instances</p>
                  {syncPairings.map((pairing) => (
                    <div
                      key={pairing.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {pairing.remoteUrl}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pairing.isActive ? (
                            <span className="text-green-600">
                              Active
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Inactive
                            </span>
                          )}
                          {pairing.lastSyncAt && (
                            <>
                              {" "}
                              -- Last sync:{" "}
                              {new Date(
                                pairing.lastSyncAt
                              ).toLocaleString()}
                            </>
                          )}
                          {" "}-- Mode: {pairing.syncMode}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await fetch("/api/sync/settings", {
                            method: "PUT",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              revokePairingId: pairing.id,
                            }),
                          })
                          setSyncPairings(
                            syncPairings.filter(
                              (p) => p.id !== pairing.id
                            )
                          )
                        }}
                      >
                        <UnlinkIcon className="mr-2 size-3.5" />
                        Unpair
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pair with new instance */}
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm font-medium">
                  Pair with another instance
                </p>
                <p className="text-sm text-muted-foreground">
                  Enter the URL and credentials of the remote openvlt
                  instance to sync with.
                </p>
                <div className="space-y-2">
                  <input
                    type="url"
                    value={pairUrl}
                    onChange={(e) => setPairUrl(e.target.value)}
                    placeholder="https://other-instance.example.com:3456"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={pairUsername}
                      onChange={(e) => setPairUsername(e.target.value)}
                      placeholder="Username on remote"
                      className="h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    />
                    <input
                      type="password"
                      value={pairPassword}
                      onChange={(e) => setPairPassword(e.target.value)}
                      placeholder="Password on remote"
                      className="h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={
                    !pairUrl || !pairUsername || !pairPassword || pairingLoading
                  }
                  onClick={async () => {
                    setPairingLoading(true)
                    try {
                      // Step 1: Login to remote to get session
                      const loginRes = await fetch(
                        `${pairUrl}/api/auth/login`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            username: pairUsername,
                            password: pairPassword,
                          }),
                          credentials: "include",
                        }
                      )
                      if (!loginRes.ok) {
                        alert("Failed to authenticate with remote instance")
                        return
                      }

                      // Step 2: Send pairing request
                      const reqRes = await fetch(
                        `${pairUrl}/api/sync/pair/request`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            peerName: syncPeer?.displayName || "Unknown",
                            peerId: syncPeer?.id || "",
                            vaultName: "Vault",
                          }),
                          credentials: "include",
                        }
                      )
                      if (!reqRes.ok) {
                        alert("Pairing request failed")
                        return
                      }

                      const {
                        pairingId,
                        peerId: remotePeerId,
                        sharedSecret,
                        vaultId: remoteVaultId,
                      } = await reqRes.json()

                      // Step 3: Store pairing locally
                      // We call our own sync settings to register
                      // For now, reload the page to pick up new pairing
                      alert(
                        `Pairing established with ${pairUrl}. Pairing ID: ${pairingId.slice(0, 8)}...`
                      )

                      // Refresh pairings list
                      const settingsRes = await fetch(
                        "/api/sync/settings"
                      )
                      if (settingsRes.ok) {
                        const data = await settingsRes.json()
                        setSyncPairings(data.pairings)
                      }

                      setPairUrl("")
                      setPairUsername("")
                      setPairPassword("")
                    } catch (err) {
                      alert(
                        `Failed to pair: ${err instanceof Error ? err.message : "Unknown error"}`
                      )
                    } finally {
                      setPairingLoading(false)
                    }
                  }}
                >
                  {pairingLoading ? (
                    <LoaderIcon className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="mr-2 size-3.5" />
                  )}
                  Start Pairing
                </Button>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-destructive">
              Danger Zone
            </h2>
            <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Purge Trash</label>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete all trashed notes
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Permanently delete ALL trashed notes? This cannot be undone."
                      )
                    )
                      return
                    await fetch("/api/notes?action=purgeTrash", {
                      method: "DELETE",
                    })
                    alert("Trash purged")
                  }}
                >
                  <TrashIcon className="mr-2 size-3.5" />
                  Purge Trash
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
