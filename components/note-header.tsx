"use client"

import * as React from "react"
import {
  StarIcon,
  TrashIcon,
  LockIcon,
  UnlockIcon,
  PanelRightIcon,
  XIcon,
  BookmarkPlusIcon,
  HistoryIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTabStore } from "@/lib/stores/tab-store"
import { LockDialog } from "@/components/lock-dialog"
import { addBookmark } from "@/components/bookmarks-panel"
import type { NoteMetadata } from "@/types/note"

interface NoteHeaderProps {
  note: NoteMetadata
  isSplit?: boolean
  toolbarSlot?: React.ReactNode
}

export function NoteHeader({ note, isSplit = false, toolbarSlot }: NoteHeaderProps) {
  const { closeTab, updateTabTitle, openSplit, splitNoteId, closeSplit } =
    useTabStore()
  const [title, setTitle] = React.useState(note.title)
  const [isFavorite, setIsFavorite] = React.useState(note.isFavorite)
  const [isLocked, setIsLocked] = React.useState(note.isLocked)
  const [lockDialogOpen, setLockDialogOpen] = React.useState(false)
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newTitle = e.target.value
    setTitle(newTitle)
    updateTabTitle(note.id, newTitle || "Untitled")

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(async () => {
      if (newTitle.trim()) {
        await fetch(`/api/notes/${note.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim() }),
        })
        window.dispatchEvent(new Event("openvlt:tree-refresh"))
      }
    }, 800)
  }

  async function handleToggleFavorite() {
    const res = await fetch(`/api/notes/${note.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleFavorite" }),
    })
    if (res.ok) {
      const data = await res.json()
      setIsFavorite(data.isFavorite)
    }
  }

  async function handleDelete() {
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" })
    window.dispatchEvent(new Event("openvlt:tree-refresh"))
    closeTab(note.id)
  }

  const updatedDate = new Date(note.updatedAt)
  const timeAgo = getTimeAgo(updatedDate)

  return (
    <>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          className="flex-1 bg-transparent text-sm font-medium outline-none"
          placeholder="Untitled"
        />

        {toolbarSlot}

        <span className="text-sm text-muted-foreground">{timeAgo}</span>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            if (splitNoteId === note.id) {
              closeSplit()
            } else {
              openSplit(note.id, title)
            }
          }}
          title={splitNoteId === note.id ? "Close split" : "Open in split view"}
        >
          <PanelRightIcon
            className={`size-4 ${splitNoteId === note.id ? "text-primary" : ""}`}
          />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setLockDialogOpen(true)}
          title={isLocked ? "Unlock note" : "Lock note"}
        >
          {isLocked ? (
            <LockIcon className="size-4 text-yellow-500" />
          ) : (
            <UnlockIcon className="size-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("openvlt:toggle-history", {
                detail: { noteId: note.id, folderId: note.parentId },
              })
            )
          }
          title="Version history (Cmd+Shift+H)"
        >
          <HistoryIcon className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => addBookmark("note", title, note.id)}
          title="Add to bookmarks"
        >
          <BookmarkPlusIcon className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleToggleFavorite}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <StarIcon
            className={`size-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`}
          />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDelete}
          title="Move to trash"
        >
          <TrashIcon className="size-4" />
        </Button>

        {isSplit && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={closeSplit}
            title="Close split pane"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </header>

      <LockDialog
        open={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        noteId={note.id}
        isLocked={isLocked}
        onLockChange={(locked) => {
          setIsLocked(locked)
          // Reload the tab to show locked/unlocked state
          window.location.reload()
        }}
      />
    </>
  )
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}
