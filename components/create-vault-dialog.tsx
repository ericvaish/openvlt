"use client"

import * as React from "react"
import { AlertCircleIcon, LoaderIcon, FolderOpenIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FolderPicker } from "@/components/folder-picker"

interface CreateVaultDialogProps {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCreated?: () => void
}

export function CreateVaultDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: CreateVaultDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const [name, setName] = React.useState("")
  const [selectedPath, setSelectedPath] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState("")

  function resetForm() {
    setName("")
    setSelectedPath("")
    setError("")
  }

  async function handleCreate() {
    if (!name.trim() || !selectedPath.trim()) return
    setCreating(true)
    setError("")

    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), path: selectedPath.trim() }),
      })
      if (res.ok) {
        resetForm()
        setOpen(false)
        if (onCreated) {
          onCreated()
        } else {
          window.location.reload()
        }
      } else {
        const data = await res.json()
        setError(data.error || "Failed to create vault")
      }
    } catch {
      setError("Failed to create vault")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) resetForm()
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Vault</DialogTitle>
          <DialogDescription>
            Choose a folder on your computer to store your notes. You can create
            a new folder or pick an existing one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="vault-name" className="text-sm font-medium">
              Vault name
            </label>
            <Input
              id="vault-name"
              placeholder="e.g. Work Notes, Personal, Research"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Choose folder</label>
            <FolderPicker
              value={selectedPath}
              onChange={setSelectedPath}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !selectedPath.trim() || creating}
          >
            {creating ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <FolderOpenIcon className="size-4" />
            )}
            Create Vault
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
