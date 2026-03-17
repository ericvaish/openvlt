"use client"

import * as React from "react"
import {
  FileTextIcon,
  StarIcon,
  FolderIcon,
  LockIcon,
  SearchIcon,
  LayoutListIcon,
  LayoutGridIcon,
} from "lucide-react"
import { useTabStore } from "@/lib/stores/tab-store"
import type { NoteMetadata } from "@/types"

type SortKey = "updated" | "created" | "title"
type ViewMode = "list" | "grid"

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getFolderPath(filePath: string): string | null {
  const parts = filePath.split("/")
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join(" / ")
}

interface NotesListPanelProps {
  filter: "all" | "favorites"
}

export function NotesListPanel({ filter }: NotesListPanelProps) {
  const { openTab } = useTabStore()
  const [notes, setNotes] = React.useState<NoteMetadata[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [sort, setSort] = React.useState<SortKey>("updated")
  const [view, setView] = React.useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("openvlt:notes-view") as ViewMode) || "list"
    }
    return "list"
  })

  function handleViewChange(mode: ViewMode) {
    setView(mode)
    localStorage.setItem("openvlt:notes-view", mode)
  }

  const fetchNotes = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/notes?filter=${filter}`)
      if (res.ok) {
        setNotes(await res.json())
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [filter])

  React.useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  React.useEffect(() => {
    const handler = () => fetchNotes()
    window.addEventListener("openvlt:tree-refresh", handler)
    window.addEventListener("openvlt:favorites-refresh", handler)
    window.addEventListener("openvlt:notes-refresh", handler)
    return () => {
      window.removeEventListener("openvlt:tree-refresh", handler)
      window.removeEventListener("openvlt:favorites-refresh", handler)
      window.removeEventListener("openvlt:notes-refresh", handler)
    }
  }, [fetchNotes])

  const filtered = React.useMemo(() => {
    let result = notes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.filePath.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return result.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title)
      if (sort === "created")
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [notes, search, sort])

  const isAll = filter === "all"
  const Icon = isAll ? FileTextIcon : StarIcon
  const label = isAll ? "All Notes" : "Favorites"
  const emptyText = isAll ? "No notes yet" : "No favorite notes"

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          ({filtered.length})
        </span>
      </div>

      {/* Search + Sort + View toggle */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Search ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border bg-transparent pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 rounded-md border bg-transparent px-2 text-xs text-muted-foreground outline-none"
        >
          <option value="updated">Last edited</option>
          <option value="created">Created</option>
          <option value="title">Title</option>
        </select>
        <div className="flex rounded-md border">
          <button
            onClick={() => handleViewChange("list")}
            className={`inline-flex size-8 items-center justify-center transition-colors ${view === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="List view"
          >
            <LayoutListIcon className="size-3.5" />
          </button>
          <button
            onClick={() => handleViewChange("grid")}
            className={`inline-flex size-8 items-center justify-center transition-colors ${view === "grid" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Card view"
          >
            <LayoutGridIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Icon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search.trim() ? "No matching notes" : emptyText}
            </p>
          </div>
        ) : view === "list" ? (
          /* List view */
          <div className="divide-y">
            {filtered.map((note) => {
              const folder = getFolderPath(note.filePath)
              return (
                <button
                  key={note.id}
                  className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  onClick={() => openTab(note.id, note.title)}
                >
                  <div className="flex items-center gap-2">
                    {note.icon && (
                      <span className="shrink-0 text-sm">{note.icon}</span>
                    )}
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {note.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {note.isLocked && (
                        <LockIcon className="size-3 text-muted-foreground" />
                      )}
                      {note.isFavorite && isAll && (
                        <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {folder && (
                      <>
                        <span className="flex items-center gap-1 truncate">
                          <FolderIcon className="size-3 shrink-0" />
                          {folder}
                        </span>
                        <span>&middot;</span>
                      </>
                    )}
                    <span className="shrink-0">
                      {formatRelativeTime(note.updatedAt)}
                    </span>
                    {note.tags.length > 0 && (
                      <>
                        <span>&middot;</span>
                        <span className="truncate">
                          {note.tags.slice(0, 3).join(", ")}
                        </span>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          /* Card/Grid view */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3 p-4">
            {filtered.map((note) => {
              const folder = getFolderPath(note.filePath)
              return (
                <button
                  key={note.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border text-left transition-all hover:border-border/80 hover:bg-muted/30"
                  onClick={() => openTab(note.id, note.title)}
                >
                  {/* Cover image or placeholder */}
                  <div className="relative h-28 w-full shrink-0 overflow-hidden bg-muted/30">
                    {note.coverImage ? (
                      <img
                        src={note.coverImage}
                        alt=""
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        {note.icon ? (
                          <span className="text-3xl">{note.icon}</span>
                        ) : (
                          <FileTextIcon className="size-8 text-muted-foreground/30" />
                        )}
                      </div>
                    )}
                    {/* Badges overlay */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {note.isLocked && (
                        <span className="rounded-md bg-background/80 p-1 backdrop-blur-sm">
                          <LockIcon className="size-3 text-muted-foreground" />
                        </span>
                      )}
                      {note.isFavorite && isAll && (
                        <span className="rounded-md bg-background/80 p-1 backdrop-blur-sm">
                          <StarIcon className="size-3 fill-amber-400 text-amber-400" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col gap-1.5 p-3">
                    <div className="flex items-center gap-1.5">
                      {note.icon && (
                        <span className="shrink-0 text-sm">{note.icon}</span>
                      )}
                      <p className="truncate text-sm font-medium">
                        {note.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {folder && (
                        <>
                          <span className="flex items-center gap-1 truncate">
                            <FolderIcon className="size-3 shrink-0" />
                            {folder}
                          </span>
                          <span>&middot;</span>
                        </>
                      )}
                      <span className="shrink-0">
                        {formatRelativeTime(note.updatedAt)}
                      </span>
                    </div>
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {note.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
