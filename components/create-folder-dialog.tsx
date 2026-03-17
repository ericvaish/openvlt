"use client"

import * as React from "react"
import { FolderPlusIcon, LoaderIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CreateFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (name: string) => void | Promise<void>
  description?: string
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  onCreated,
  description = "Enter a name for the new folder.",
}: CreateFolderDialogProps) {
  const [name, setName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function handleClose() {
    setName("")
    setCreating(false)
    onOpenChange(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await onCreated(name.trim())
      handleClose()
    } catch {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose()
        else onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Input
              ref={inputRef}
              placeholder="Folder name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <FolderPlusIcon className="size-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
