"use client"

import * as React from "react"
import {
  FolderOpenIcon,
  TrashIcon,
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  CalendarIcon,
  LoaderIcon,
  PencilIcon,
  XIcon,
  CheckCheckIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CreateVaultDialog } from "@/components/create-vault-dialog"
import type { Vault } from "@/types"

interface VaultStats {
  noteCount: number
  folderCount: number
}

interface ManageVaultsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVaultChange?: () => void
}

export function ManageVaultsDialog({
  open,
  onOpenChange,
  onVaultChange,
}: ManageVaultsDialogProps) {
  const [vaults, setVaults] = React.useState<Vault[]>([])
  const [stats, setStats] = React.useState<Record<string, VaultStats>>({})
  const [loading, setLoading] = React.useState(true)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)

  const fetchVaults = React.useCallback(async () => {
    try {
      const res = await fetch("/api/vaults")
      if (res.ok) {
        const data: Vault[] = await res.json()
        setVaults(data)

        const statsMap: Record<string, VaultStats> = {}
        await Promise.all(
          data.map(async (vault) => {
            try {
              const notesRes = await fetch(
                `/api/notes?filter=all&vaultId=${vault.id}`
              )
              const foldersRes = await fetch(`/api/folders?vaultId=${vault.id}`)
              const notes = notesRes.ok ? await notesRes.json() : []
              const folders = foldersRes.ok ? await foldersRes.json() : []
              statsMap[vault.id] = {
                noteCount: Array.isArray(notes) ? notes.length : 0,
                folderCount: Array.isArray(folders) ? folders.length : 0,
              }
            } catch {
              statsMap[vault.id] = { noteCount: 0, folderCount: 0 }
            }
          })
        )
        setStats(statsMap)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (open) {
      setLoading(true)
      setRenamingId(null)
      fetchVaults()
    }
  }, [open, fetchVaults])

  async function handleSwitch(vaultId: string) {
    const active = vaults.find((v) => v.isActive)
    if (active?.id === vaultId) return

    try {
      const res = await fetch(`/api/vaults/${vaultId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive" }),
      })
      if (res.ok) {
        onOpenChange(false)
        onVaultChange?.()
        window.location.reload()
      }
    } catch {
      // silently fail
    }
  }

  async function handleDelete(vault: Vault) {
    const isActive = vault.isActive
    const message = isActive
      ? `Delete "${vault.name}"? This is your active vault. Your files on disk will not be deleted.`
      : `Delete "${vault.name}"? Your files on disk will not be deleted.`

    if (!confirm(message)) return

    setDeletingId(vault.id)
    try {
      const res = await fetch(`/api/vaults/${vault.id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        if (isActive) {
          onOpenChange(false)
          window.location.reload()
        } else {
          setVaults((prev) => prev.filter((v) => v.id !== vault.id))
        }
      }
    } catch {
      // silently fail
    } finally {
      setDeletingId(null)
    }
  }

  function startRename(vault: Vault) {
    setRenamingId(vault.id)
    setRenameValue(vault.name)
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue("")
  }

  async function handleRename(vaultId: string) {
    const trimmed = renameValue.trim()
    if (!trimmed) return

    try {
      const res = await fetch(`/api/vaults/${vaultId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", name: trimmed }),
      })
      if (res.ok) {
        setVaults((prev) =>
          prev.map((v) => (v.id === vaultId ? { ...v, name: trimmed } : v))
        )
        setRenamingId(null)
        setRenameValue("")
      }
    } catch {
      // silently fail
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Image
              src="/flower.svg"
              alt=""
              width={64}
              height={64}
              className="shrink-0"
            />
            <div>
              <DialogTitle>Manage Vaults</DialogTitle>
              <DialogDescription>
                Switch between vaults, rename them, or remove ones you no longer
                need. Deleting a vault only removes it from openvlt. Your files
                stay on disk.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          ) : vaults.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <FolderOpenIcon className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No vaults yet. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {vaults.map((vault) => {
                const vaultStats = stats[vault.id]
                const isRenaming = renamingId === vault.id
                return (
                  <div
                    key={vault.id}
                    className={`rounded-xl border p-4 transition-colors ${vault.isActive ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex flex-1 flex-col gap-1.5">
                        {/* Name / rename */}
                        <div className="flex items-center gap-2">
                          {isRenaming ? (
                            <div className="flex flex-1 items-center gap-1.5">
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRename(vault.id)
                                  if (e.key === "Escape") cancelRename()
                                }}
                                className="h-7 text-sm"
                                autoFocus
                              />
                              <button
                                onClick={() => handleRename(vault.id)}
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
                                title="Save"
                              >
                                <CheckCheckIcon className="size-3.5" />
                              </button>
                              <button
                                onClick={cancelRename}
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
                                title="Cancel"
                              >
                                <XIcon className="size-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-semibold">
                                {vault.name}
                              </span>
                              {vault.isActive && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  <CheckIcon className="size-3" />
                                  Active
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Path */}
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {vault.path}
                        </p>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {vaultStats && (
                            <>
                              <span className="flex items-center gap-1">
                                <FileTextIcon className="size-3" />
                                {vaultStats.noteCount} notes
                              </span>
                              <span className="flex items-center gap-1">
                                <FolderIcon className="size-3" />
                                {vaultStats.folderCount} folders
                              </span>
                            </>
                          )}
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="size-3" />
                            {new Date(vault.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      {!isRenaming && (
                        <div className="flex shrink-0 items-center gap-1">
                          {!vault.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSwitch(vault.id)}
                            >
                              Switch
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startRename(vault)}
                            title="Rename vault"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(vault)}
                            disabled={deletingId === vault.id}
                            title="Delete vault"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {deletingId === vault.id ? (
                              <LoaderIcon className="size-4 animate-spin" />
                            ) : (
                              <TrashIcon className="size-4" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Create new vault button */}
        <div className="border-t pt-4">
          <CreateVaultDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={() => {
              setCreateOpen(false)
              onOpenChange(false)
              window.location.reload()
            }}
            trigger={
              <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 py-3 text-sm font-medium text-emerald-500 transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/10">
                <FolderOpenIcon className="size-4" />
                Create New Vault
              </button>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
