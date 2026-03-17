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
  BookmarkCheckIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  ImageIcon,
  SmileIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTabStore } from "@/lib/stores/tab-store"
import { LockDialog } from "@/components/lock-dialog"
import { addBookmark } from "@/components/bookmarks-panel"
import { IconPicker } from "@/components/icon-picker"
import { toast } from "sonner"
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
  const [isBookmarked, setIsBookmarked] = React.useState(false)
  const [lockDialogOpen, setLockDialogOpen] = React.useState(false)
  const [icon, setIcon] = React.useState<string | null>(note.icon)
  const [coverImage, setCoverImage] = React.useState<string | null>(
    note.coverImage
  )
  const [coverHovered, setCoverHovered] = React.useState(false)
  const [moreOpen, setMoreOpen] = React.useState(false)
  const coverInputRef = React.useRef<HTMLInputElement>(null)
  const moreRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!moreOpen) return
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [moreOpen])

  React.useEffect(() => {
    fetch("/api/bookmarks")
      .then((r) => (r.ok ? r.json() : []))
      .then((bookmarks: { type: string; targetId: string | null }[]) => {
        setIsBookmarked(
          bookmarks.some((b) => b.type === "note" && b.targetId === note.id)
        )
      })
      .catch(() => {})
  }, [note.id])
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

  async function handleIconChange(newIcon: string | null) {
    setIcon(newIcon)
    await fetch(`/api/notes/${note.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icon: newIcon }),
    })
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch(`/api/attachments?noteId=${note.id}`, {
      method: "POST",
      body: formData,
    })
    if (res.ok) {
      const data = await res.json()
      const url = `/api/attachments/${data.id}`
      setCoverImage(url)
      await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: url }),
      })
      toast.success("Cover image added")
      window.dispatchEvent(new Event("openvlt:notes-refresh"))
    }
  }

  async function handleRemoveCover() {
    setCoverImage(null)
    await fetch(`/api/notes/${note.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImage: null }),
    })
    toast.success("Cover image removed")
    window.dispatchEvent(new Event("openvlt:notes-refresh"))
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
      window.dispatchEvent(new Event("openvlt:favorites-refresh"))
    }
  }

  async function handleDelete() {
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" })
    window.dispatchEvent(new Event("openvlt:tree-refresh"))
    closeTab(note.id)
  }

  const [lastUpdated, setLastUpdated] = React.useState(new Date(note.updatedAt))
  const timeAgo = getTimeAgo(lastUpdated)

  React.useEffect(() => {
    const handler = () => setLastUpdated(new Date())
    window.addEventListener("openvlt:note-saved", handler)
    return () => window.removeEventListener("openvlt:note-saved", handler)
  }, [])

  // Refresh timeAgo display periodically
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* Cover image */}
      {coverImage && (
        <div
          className="group/cover relative h-40 shrink-0 overflow-hidden bg-muted"
          onMouseEnter={() => setCoverHovered(true)}
          onMouseLeave={() => setCoverHovered(false)}
        >
          <img src={coverImage} alt="" className="h-full w-full object-cover" />
          {coverHovered && (
            <div className="absolute right-3 bottom-3 flex gap-1.5">
              <button
                onClick={() => coverInputRef.current?.click()}
                className="rounded-md bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90"
              >
                Change cover
              </button>
              <button
                onClick={handleRemoveCover}
                className="rounded-md bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}

      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
        {/* Page icon */}
        <IconPicker value={icon} onChange={handleIconChange}>
          <button
            className="flex shrink-0 items-center justify-center rounded-md hover:bg-accent"
            title={icon ? "Change icon" : "Add icon"}
          >
            {icon ? (
              <span className="text-lg leading-none">{icon}</span>
            ) : (
              <SmileIcon className="size-4 text-muted-foreground" />
            )}
          </button>
        </IconPicker>

        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          className="flex-1 bg-transparent text-sm font-medium outline-none"
          placeholder="Untitled"
        />

        {toolbarSlot}

        <span className="text-sm text-muted-foreground">{timeAgo}</span>

        <div ref={moreRef} className="relative">
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`flex size-7 items-center justify-center rounded transition-colors ${
              moreOpen
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            title="More actions"
          >
            <MoreHorizontalIcon className="size-3.5" />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 flex flex-col gap-0.5 rounded-lg border bg-background p-1 shadow-md" style={{ minWidth: 180 }}>
              {!coverImage && (
                <button
                  onClick={() => { coverInputRef.current?.click(); setMoreOpen(false) }}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ImageIcon className="size-3.5" />
                  Add cover image
                </button>
              )}
              <button
                onClick={() => {
                  if (splitNoteId === note.id) { closeSplit() } else { openSplit(note.id, title) }
                  setMoreOpen(false)
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PanelRightIcon className={`size-3.5 ${splitNoteId === note.id ? "text-primary" : ""}`} />
                {splitNoteId === note.id ? "Close split" : "Split view"}
              </button>
              <button
                onClick={() => { setLockDialogOpen(true); setMoreOpen(false) }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {isLocked ? <LockIcon className="size-3.5 text-yellow-500" /> : <UnlockIcon className="size-3.5" />}
                {isLocked ? "Unlock note" : "Lock note"}
              </button>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("openvlt:toggle-history", { detail: { noteId: note.id, folderId: note.parentId } }))
                  setMoreOpen(false)
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HistoryIcon className="size-3.5" />
                Version history
              </button>
              <button
                onClick={async () => {
                  await addBookmark("note", title, note.id)
                  setIsBookmarked((prev) => !prev)
                  setMoreOpen(false)
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {isBookmarked ? <BookmarkCheckIcon className="size-3.5 fill-primary text-primary" /> : <BookmarkPlusIcon className="size-3.5" />}
                {isBookmarked ? "Remove bookmark" : "Bookmark"}
              </button>
              <button
                onClick={() => { handleToggleFavorite(); setMoreOpen(false) }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <StarIcon className={`size-3.5 ${isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`} />
                {isFavorite ? "Remove favorite" : "Favorite"}
              </button>
              <button
                onClick={() => { handleDelete(); setMoreOpen(false) }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-accent"
              >
                <TrashIcon className="size-3.5" />
                Move to trash
              </button>
            </div>
          )}
        </div>

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

      {/* Hidden file input for cover image upload */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverUpload}
        className="hidden"
      />

      <LockDialog
        open={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        noteId={note.id}
        isLocked={isLocked}
        onLockChange={(locked) => {
          setIsLocked(locked)
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
