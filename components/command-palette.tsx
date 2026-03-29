"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import Fuse from "fuse.js"
import {
  FileTextIcon,
  FilePlusIcon,
  FolderPlusIcon,
  MoonIcon,
  SunIcon,
  PanelLeftIcon,
  SettingsIcon,
  DownloadIcon,
  NetworkIcon,
  SearchIcon,
  CalendarIcon,
  BookmarkPlusIcon,
  ShuffleIcon,
  SparklesIcon,
  LayoutTemplateIcon,
  TextSearchIcon,
} from "lucide-react"
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command"
import { useSidebar } from "@/components/ui/sidebar"
import { useNoteCache } from "@/hooks/use-note-cache"
import { useTabStore } from "@/lib/stores/tab-store"
import {
  useShortcuts,
  useShortcutAction,
  ShortcutKeys,
} from "@/lib/stores/shortcuts-store"
import { addBookmark } from "@/components/bookmarks-panel"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
import { TemplatePicker } from "@/components/template-picker"
import type { NoteMetadata } from "@/types/note"

export function CommandPalette() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { toggleSidebar } = useSidebar()
  const { openTab } = useTabStore()
  const { notes } = useNoteCache()
  const [open, setOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false)
  const [templatePickerOpen, setTemplatePickerOpen] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Allow opening from sidebar search button
  React.useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener("openvlt:open-command-palette", handler)
    return () =>
      window.removeEventListener("openvlt:open-command-palette", handler)
  }, [])

  const [query, setQuery] = React.useState("")

  // Build fuse index from cached notes (fuzzy title + tag search)
  const fuse = React.useMemo(
    () =>
      new Fuse(notes, {
        keys: [
          { name: "title", weight: 2 },
          { name: "tags", weight: 1 },
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [notes]
  )

  const titleResults = React.useMemo(() => {
    if (!query.trim()) return []
    return fuse
      .search(query)
      .map((r) => r.item)
      .slice(0, 8)
  }, [query, fuse])

  // Debounced content search via FTS5
  interface ContentResult {
    id: string
    title: string
    snippet: string
    matchType: "title" | "content"
  }
  const [contentResults, setContentResults] = React.useState<ContentResult[]>(
    []
  )
  const [contentSearching, setContentSearching] = React.useState(false)
  const contentAbort = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    // Clear results when query is empty or dialog closes
    if (!query.trim() || !open) {
      setContentResults([])
      setContentSearching(false)
      return
    }

    setContentSearching(true)
    const timer = setTimeout(async () => {
      contentAbort.current?.abort()
      const controller = new AbortController()
      contentAbort.current = controller
      try {
        const res = await fetch(
          `/api/notes/search-content?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        )
        if (res.ok) {
          const data = await res.json()
          setContentResults(data)
        }
      } catch {
        // aborted or failed, ignore
      } finally {
        if (!controller.signal.aborted) {
          setContentSearching(false)
        }
      }
    }, 200)

    return () => {
      clearTimeout(timer)
      contentAbort.current?.abort()
    }
  }, [query, open])

  // Filter content results to only show notes not already in title results
  const titleResultIds = React.useMemo(
    () => new Set(titleResults.map((n) => n.id)),
    [titleResults]
  )
  const extraContentResults = React.useMemo(
    () => contentResults.filter((r) => !titleResultIds.has(r.id)),
    [contentResults, titleResultIds]
  )

  const recent = React.useMemo(() => notes.slice(0, 5), [notes])

  function handleSelect(note: NoteMetadata) {
    setOpen(false)
    setQuery("")
    openTab(note.id, note.title)
  }

  async function handleNewNote() {
    setOpen(false)
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        window.dispatchEvent(new Event("openvlt:tree-refresh"))
      }
    } catch {}
  }

  function handleNewFolder() {
    setOpen(false)
    setFolderDialogOpen(true)
  }

  async function handleFolderCreated(name: string) {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    window.dispatchEvent(new Event("openvlt:tree-refresh"))
  }

  function handleOpenGraph() {
    setOpen(false)
    openTab("__graph__", "Graph View")
  }

  async function handleDailyNote() {
    setOpen(false)
    try {
      const res = await fetch("/api/notes/daily")
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        window.dispatchEvent(new Event("openvlt:tree-refresh"))
      }
    } catch {}
  }

  async function handleWelcomeNote() {
    setOpen(false)
    try {
      const res = await fetch("/api/notes/welcome", { method: "POST" })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        window.dispatchEvent(new Event("openvlt:tree-refresh"))
      }
    } catch {}
  }

  async function handleBookmarkSearch() {
    if (!query.trim()) return
    setOpen(false)
    await addBookmark("search", query.trim(), null, query.trim())
  }

  async function handleRandomNote() {
    setOpen(false)
    try {
      const res = await fetch("/api/notes/random")
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
      }
    } catch {}
  }

  const { getBinding } = useShortcuts()

  useShortcutAction("toggleCommandPalette", () => setOpen((prev) => !prev))
  useShortcutAction("newNote", handleNewNote)
  useShortcutAction("toggleSidebar", () => toggleSidebar())
  useShortcutAction("newFolder", handleNewFolder)
  useShortcutAction("openSettings", () => openTab("__settings__", "Settings"))
  useShortcutAction("advancedSearch", () => {
    setOpen(false)
    openTab("__search__", "Search")
  })
  useShortcutAction("graphView", handleOpenGraph)
  useShortcutAction("dailyNote", handleDailyNote)
  useShortcutAction("allNotes", () => openTab("__all__", "All Notes"))
  useShortcutAction("favorites", () => {
    openTab("__all__", "All Notes")
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("openvlt:notes-filter", { detail: { favorites: true } })
      )
    }, 0)
  })
  useShortcutAction("trash", () => openTab("__trash__", "Trash"))
  useShortcutAction("bookmarks", () => openTab("__bookmarks__", "Bookmarks"))

  if (!mounted) return null

  return (
  <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} className="[&_[data-slot=command-input-wrapper]]:border-b-0 [&_[cmdk-separator]]:hidden">
        <CommandInput
          placeholder="Search notes or type a command..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.trim() &&
            titleResults.length === 0 &&
            extraContentResults.length === 0 &&
            !contentSearching && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}

          {titleResults.length > 0 && (
            <CommandGroup heading="Notes">
              {titleResults.map((note) => (
                <CommandItem key={note.id} onSelect={() => handleSelect(note)}>
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{note.title}</span>
                  {note.tags.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {note.tags.map((t) => `#${t}`).join(" ")}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {extraContentResults.length > 0 && (
            <CommandGroup heading="Found in content">
              {extraContentResults.map((result) => (
                <CommandItem
                  key={result.id}
                  onSelect={() => {
                    setOpen(false)
                    setQuery("")
                    openTab(result.id, result.title)
                  }}
                >
                  <TextSearchIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span>{result.title}</span>
                    <SnippetPreview snippet={result.snippet} />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {contentSearching && query.trim() && (
            <div className="px-4 py-2 text-xs text-muted-foreground">
              Searching content...
            </div>
          )}

          {!query && recent.length > 0 && (
            <CommandGroup heading="Recent Notes">
              {recent.map((note) => (
                <CommandItem key={note.id} onSelect={() => handleSelect(note)}>
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{note.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem onSelect={handleNewNote}>
              <FilePlusIcon className="size-4 text-muted-foreground" />
              <span>New Note</span>
              <CommandShortcut><ShortcutKeys binding={getBinding("newNote")} /></CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={handleDailyNote}>
              <CalendarIcon className="size-4 text-muted-foreground" />
              <span>Daily Note</span>
              <CommandShortcut><ShortcutKeys binding={getBinding("dailyNote")} /></CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={handleNewFolder}>
              <FolderPlusIcon className="size-4 text-muted-foreground" />
              <span>New Folder</span>
              <CommandShortcut><ShortcutKeys binding={getBinding("newFolder")} /></CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => { setOpen(false); setTemplatePickerOpen(true) }}>
              <LayoutTemplateIcon className="size-4 text-muted-foreground" />
              <span>New from Template</span>
            </CommandItem>
            <CommandItem onSelect={handleOpenGraph}>
              <NetworkIcon className="size-4 text-muted-foreground" />
              <span>Graph View</span>
              <CommandShortcut><ShortcutKeys binding={getBinding("graphView")} /></CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false)
                openTab("__search__", "Search")
              }}
            >
              <SearchIcon className="size-4 text-muted-foreground" />
              <span>Advanced Search</span>
              <CommandShortcut><ShortcutKeys binding={getBinding("advancedSearch")} /></CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={handleRandomNote}>
              <ShuffleIcon className="size-4 text-muted-foreground" />
              <span>Random Note</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
                setOpen(false)
              }}
            >
              {resolvedTheme === "dark" ? (
                <SunIcon className="size-4 text-muted-foreground" />
              ) : (
                <MoonIcon className="size-4 text-muted-foreground" />
              )}
              <span>Toggle Dark Mode</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                toggleSidebar()
                setOpen(false)
              }}
            >
              <PanelLeftIcon className="size-4 text-muted-foreground" />
              <span>Toggle Sidebar</span>
              <CommandShortcut><ShortcutKeys binding={getBinding("toggleSidebar")} /></CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false)
                openTab("__settings__", "Settings")
              }}
            >
              <SettingsIcon className="size-4 text-muted-foreground" />
              <span>Settings</span>
              <CommandShortcut><ShortcutKeys binding={getBinding("openSettings")} /></CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false)
                window.location.href = "/api/export"
              }}
            >
              <DownloadIcon className="size-4 text-muted-foreground" />
              <span>Export All Notes</span>
            </CommandItem>
            <CommandItem onSelect={handleWelcomeNote}>
              <SparklesIcon className="size-4 text-muted-foreground" />
              <span>Create Welcome Note</span>
            </CommandItem>
            {query.trim() && (
              <CommandItem onSelect={handleBookmarkSearch}>
                <BookmarkPlusIcon className="size-4 text-muted-foreground" />
                <span>Bookmark this search</span>
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>

    <CreateFolderDialog
      open={folderDialogOpen}
      onOpenChange={setFolderDialogOpen}
      onCreated={handleFolderCreated}
    />

    <TemplatePicker
      open={templatePickerOpen}
      onClose={() => setTemplatePickerOpen(false)}
    />
  </>
  )
}

/** Renders an FTS5 snippet with <<matched>> terms highlighted */
function SnippetPreview({ snippet }: { snippet: string }) {
  if (!snippet) return null
  // FTS5 wraps matches in << and >>
  const parts = snippet.split(/(<<.*?>>)/g)
  return (
    <span className="truncate text-xs text-muted-foreground">
      {parts.map((part, i) =>
        part.startsWith("<<") && part.endsWith(">>") ? (
          <span key={i} className="font-medium text-foreground">
            {part.slice(2, -2)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}
