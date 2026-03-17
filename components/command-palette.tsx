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
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useNoteCache } from "@/hooks/use-note-cache"
import { useTabStore } from "@/lib/stores/tab-store"
import { addBookmark } from "@/components/bookmarks-panel"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
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

  React.useEffect(() => {
    setMounted(true)
  }, [])
  const [query, setQuery] = React.useState("")

  // Build fuse index from cached notes
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

  const results = React.useMemo(() => {
    if (!query.trim()) return []
    return fuse
      .search(query)
      .map((r) => r.item)
      .slice(0, 10)
  }, [query, fuse])

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

  useKeyboardShortcuts(
    React.useMemo(
      () => [
        {
          key: "k",
          modifiers: ["meta"] as const,
          action: () => setOpen((prev) => !prev),
          description: "Toggle command palette",
        },
        {
          key: "o",
          modifiers: ["meta"] as const,
          action: handleNewNote,
          description: "New note",
        },
        {
          key: "b",
          modifiers: ["meta"] as const,
          action: () => toggleSidebar(),
          description: "Toggle sidebar",
        },
        {
          key: "o",
          modifiers: ["meta", "shift"] as const,
          action: handleNewFolder,
          description: "New folder",
        },
        {
          key: ",",
          modifiers: ["meta"] as const,
          action: () => openTab("__settings__", "Settings"),
          description: "Open settings",
        },
        {
          key: "f",
          modifiers: ["meta", "shift"] as const,
          action: () => router.push("/search"),
          description: "Advanced search",
        },
        {
          key: "g",
          modifiers: ["meta", "shift"] as const,
          action: handleOpenGraph,
          description: "Graph view",
        },
        {
          key: "d",
          modifiers: ["meta", "shift"] as const,
          action: handleDailyNote,
          description: "Daily note",
        },
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [toggleSidebar, router]
    )
  )

  if (!mounted) return null

  return (
  <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search notes or type a command..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {results.length > 0 && (
            <CommandGroup heading="Notes">
              {results.map((note) => (
                <CommandItem key={note.id} onSelect={() => handleSelect(note)}>
                  <FileTextIcon className="size-4 text-muted-foreground" />
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

          {!query && recent.length > 0 && (
            <CommandGroup heading="Recent Notes">
              {recent.map((note) => (
                <CommandItem key={note.id} onSelect={() => handleSelect(note)}>
                  <FileTextIcon className="size-4 text-muted-foreground" />
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
              <CommandShortcut>&#8984;O</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={handleDailyNote}>
              <CalendarIcon className="size-4 text-muted-foreground" />
              <span>Daily Note</span>
              <CommandShortcut>&#8984;&#8679;D</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={handleNewFolder}>
              <FolderPlusIcon className="size-4 text-muted-foreground" />
              <span>New Folder</span>
              <CommandShortcut>&#8984;&#8679;O</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={handleOpenGraph}>
              <NetworkIcon className="size-4 text-muted-foreground" />
              <span>Graph View</span>
              <CommandShortcut>&#8984;&#8679;G</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false)
                router.push("/search")
              }}
            >
              <SearchIcon className="size-4 text-muted-foreground" />
              <span>Advanced Search</span>
              <CommandShortcut>&#8984;&#8679;F</CommandShortcut>
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
              <CommandShortcut>&#8984;B</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setOpen(false)
                openTab("__settings__", "Settings")
              }}
            >
              <SettingsIcon className="size-4 text-muted-foreground" />
              <span>Settings</span>
              <CommandShortcut>&#8984;,</CommandShortcut>
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
  </>
  )
}
