"use client"

import * as React from "react"
import { TrashIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useTabStore } from "@/lib/stores/tab-store"
import type { NoteMetadata } from "@/types"

export function TrashPanel() {
  const { openTab, closeTab } = useTabStore()
  const [notes, setNotes] = React.useState<NoteMetadata[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null)
  const [deleteAllOpen, setDeleteAllOpen] = React.useState(false)

  const fetchTrashed = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notes?filter=trash")
      if (res.ok) {
        setNotes(await res.json())
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchTrashed()
  }, [fetchTrashed])

  async function handleRestore(noteId: string) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      })
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId))
        window.dispatchEvent(new Event("openvlt:tree-refresh"))
      }
    } catch {
      // silently fail
    }
  }

  async function handlePermanentDelete(noteId: string) {
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId))
        closeTab(noteId)
      }
    } catch {
      // silently fail
    }
  }

  async function handleDeleteAll() {
    const toDelete = [...notes]
    for (const note of toDelete) {
      try {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: "DELETE",
        })
        if (res.ok) {
          closeTab(note.id)
        }
      } catch {
        // silently fail
      }
    }
    setNotes([])
    window.dispatchEvent(new Event("openvlt:tree-refresh"))
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <TrashIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Trash</span>
        <span className="text-sm text-muted-foreground">
          ({notes.length})
        </span>
        {notes.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => setDeleteAllOpen(true)}
          >
            <Trash2Icon className="size-3.5" />
            Delete All
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <TrashIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Trash is empty</p>
          </div>
        ) : (
          <div className="divide-y">
            {notes.map((note) => (
              <div
                key={note.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openTab(note.id, note.title)}
                >
                  <p className="truncate text-sm font-medium">{note.title}</p>
                  {note.trashedAt && (
                    <p className="text-sm text-muted-foreground">
                      Deleted{" "}
                      {new Date(note.trashedAt).toLocaleDateString()}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => handleRestore(note.id)}
                    title="Restore"
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <RotateCcwIcon className="size-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(note.id)}
                    title="Delete permanently"
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Single note delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The note and all its data will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) handlePermanentDelete(deleteTarget)
                setDeleteTarget(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all confirmation */}
      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all trashed notes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {notes.length}{" "}
              {notes.length === 1 ? "note" : "notes"}. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                handleDeleteAll()
                setDeleteAllOpen(false)
              }}
            >
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
