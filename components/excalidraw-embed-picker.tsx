"use client"

import * as React from "react"
import {
  SearchIcon,
  HashIcon,
  BoxIcon,
  ChevronLeftIcon,
  FileTextIcon,
} from "lucide-react"

interface Anchor {
  type: "heading" | "block-id"
  anchor: string
  label: string
  level?: number
}

interface NoteResult {
  id: string
  title: string
}

interface EmbedPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (noteId: string, noteTitle: string, anchor: string) => void
}

export function ExcalidrawEmbedPicker({
  open,
  onClose,
  onSelect,
}: EmbedPickerProps) {
  const [query, setQuery] = React.useState("")
  const [notes, setNotes] = React.useState<NoteResult[]>([])
  const [selectedNote, setSelectedNote] = React.useState<NoteResult | null>(
    null,
  )
  const [anchors, setAnchors] = React.useState<Anchor[]>([])
  const [loadingAnchors, setLoadingAnchors] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Focus input when opened
  React.useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedNote(null)
      setAnchors([])
      setPreview(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Search notes
  React.useEffect(() => {
    if (!open || selectedNote) return
    const controller = new AbortController()
    const search = async () => {
      try {
        const url = query.trim()
          ? `/api/notes/search?q=${encodeURIComponent(query.trim())}&limit=10`
          : `/api/notes?limit=10&sort=updatedAt`
        const res = await fetch(url, { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          // Normalize: search returns { results }, list returns array
          const items = Array.isArray(data) ? data : data.results ?? data
          setNotes(
            items
              .filter((n: { noteType?: string }) => !n.noteType || n.noteType === "markdown")
              .map((n: { id: string; title: string }) => ({
                id: n.id,
                title: n.title,
              })),
          )
        }
      } catch {
        // abort or network error
      }
    }
    const timeout = setTimeout(search, 200)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [open, query, selectedNote])

  // Fetch anchors when note is selected
  async function handleSelectNote(note: NoteResult) {
    setSelectedNote(note)
    setLoadingAnchors(true)
    try {
      const res = await fetch(
        `/api/notes/${note.id}/section?list=true`,
      )
      if (res.ok) {
        const data = await res.json()
        setAnchors(data.anchors ?? [])
      }
    } catch {
      // silently fail
    } finally {
      setLoadingAnchors(false)
    }
  }

  // Fetch preview when hovering an anchor
  async function handlePreviewAnchor(anchor: string) {
    if (!selectedNote) return
    try {
      const res = await fetch(
        `/api/notes/${selectedNote.id}/section?anchor=${encodeURIComponent(anchor)}`,
      )
      if (res.ok) {
        const data = await res.json()
        setPreview(data.markdown ?? null)
      }
    } catch {
      setPreview(null)
    }
  }

  function handlePickAnchor(anchor: string) {
    if (!selectedNote) return
    onSelect(selectedNote.id, selectedNote.title, anchor)
    onClose()
  }

  // Embed the entire note (no anchor)
  function handleEmbedWholeNote() {
    if (!selectedNote) return
    // Use first heading or empty anchor for whole note
    onSelect(selectedNote.id, selectedNote.title, "")
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 flex h-[480px] w-[640px] overflow-hidden rounded-xl border bg-popover shadow-2xl">
        {/* Left panel: note list or anchor list */}
        <div className="flex w-[280px] flex-col border-r">
          {/* Header */}
          <div className="flex h-10 items-center gap-2 border-b px-3">
            {selectedNote ? (
              <>
                <button
                  onClick={() => {
                    setSelectedNote(null)
                    setAnchors([])
                    setPreview(null)
                    setTimeout(() => inputRef.current?.focus(), 50)
                  }}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <span className="flex-1 truncate text-sm font-medium">
                  {selectedNote.title}
                </span>
              </>
            ) : (
              <>
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search notes..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {!selectedNote ? (
              // Note list
              notes.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No markdown notes found
                </p>
              ) : (
                notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => handleSelectNote(note)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground/50" />
                    <span className="truncate">{note.title}</span>
                  </button>
                ))
              )
            ) : loadingAnchors ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            ) : (
              <>
                {/* Embed whole note option */}
                <button
                  onClick={handleEmbedWholeNote}
                  className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <FileTextIcon className="size-3.5 shrink-0" />
                  <span>Embed entire note</span>
                </button>

                {anchors.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No headings or block IDs found
                  </p>
                ) : (
                  anchors.map((a, i) => (
                    <button
                      key={`${a.anchor}-${i}`}
                      onClick={() => handlePickAnchor(a.anchor)}
                      onMouseEnter={() => handlePreviewAnchor(a.anchor)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      {a.type === "heading" ? (
                        <HashIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
                      ) : (
                        <BoxIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
                      )}
                      <span
                        className="truncate"
                        style={{
                          paddingLeft: a.level ? `${(a.level - 1) * 12}px` : 0,
                        }}
                      >
                        {a.label}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground/40">
                        {a.type === "heading" ? `H${a.level}` : "block"}
                      </span>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </div>

        {/* Right panel: preview */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-10 items-center border-b px-3">
            <span className="text-xs font-medium text-muted-foreground">
              Preview
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {preview ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                {preview}
              </pre>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground/50">
                Hover a section to preview
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
