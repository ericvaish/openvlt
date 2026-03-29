"use client"

import * as React from "react"
import { useTabStore } from "@/lib/stores/tab-store"
import { TabBar, getDraggedTab } from "@/components/tab-bar"
import { TabPanel } from "@/components/tab-panel"
import { GraphView } from "@/components/graph-view"
import { SettingsPanel } from "@/components/settings-panel"
import { TrashPanel } from "@/components/trash-panel"
import { NotesListPanel } from "@/components/notes-list-panel"
import { DatabaseViewPanel } from "@/components/database/database-view-panel"
import { BookmarksListPanel } from "@/components/bookmarks-list-panel"
import { SearchPanel } from "@/components/search-panel"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAIChat } from "@/lib/stores/ai-chat-store"
import { AIChatSidebar } from "@/components/ai-chat-sidebar"
import { FileTextIcon, XIcon, RotateCcwIcon, SparklesIcon } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  useShortcutAction,
  useShortcuts,
  ShortcutKeys,
} from "@/lib/stores/shortcuts-store"

const mascotQuotes = {
  morning: [
    "Fresh page, fresh thoughts. Let's go!",
    "Your ideas had all night to marinate.",
    "Coffee and creativity, name a better duo.",
    "The best notes are written before noon.",
    "What's on your mind this morning?",
    "A blank page is just a thought waiting to happen.",
    "Early words stick the longest.",
  ],
  afternoon: [
    "Midday momentum, keep it rolling!",
    "Your vault missed you.",
    "Quick thought? Jot it down before it vanishes.",
    "Afternoon brain dump in 3... 2... 1...",
    "The best ideas hide in the middle of the day.",
    "Still time to write something you'll thank yourself for.",
    "Your future self will appreciate these notes.",
  ],
  evening: [
    "Winding down? Your notes aren't going anywhere.",
    "Evening reflection time.",
    "Capture today before it fades.",
    "The quiet hours are the best for writing.",
    "One last thought before the day ends?",
    "Night owl notes hit different.",
    "Tomorrow you will be glad you wrote this down.",
  ],
  lateNight: [
    "The vault never sleeps. Neither do you, apparently.",
    "Late night inspiration is the best kind.",
    "Shhh... just you and your thoughts now.",
    "Midnight thoughts deserve to be written down.",
    "The best secrets are written after midnight.",
    "Can't sleep? Might as well be productive.",
    "Your 3am ideas might actually be genius.",
  ],
}

function getMascotQuote(hour: number): string {
  const period =
    hour < 5 ? "lateNight" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "lateNight"
  const quotes = mascotQuotes[period]
  // Use date as seed so the quote stays consistent within a session
  // but changes each day
  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60)) % quotes.length
  return quotes[dayIndex]
}

function formatClosedTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function AIChatTrigger() {
  const { isOpen, toggle } = useAIChat()
  return (
    <button
      onClick={toggle}
      className={`-mr-1 rounded p-1 transition-colors ${
        isOpen
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
      title="Toggle AI Chat"
    >
      <SparklesIcon className="size-3.5" />
    </button>
  )
}

export function TabContainer() {
  const store = useTabStore()
  const {
    tabs,
    activeTabId,
    hydrated,
    setActiveTab,
    splitNoteId,
    splitTitle,
    closeSplit,
    openSplit,
    openTab,
    recentlyClosed,
    reopenClosedTab,
  } = store
  const { getBinding } = useShortcuts()
  const storeRef = React.useRef(store)
  storeRef.current = store

  const [dropSide, setDropSide] = React.useState<"left" | "right" | null>(null)
  const [isDraggingTab, setIsDraggingTab] = React.useState(false)
  const contentAreaRef = React.useRef<HTMLDivElement>(null)
  const [userName, setUserName] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const name = data?.user?.displayName || data?.user?.username || null
        setUserName(name ? name.split(" ")[0] : null)
      })
      .catch(() => {})
  }, [])

  // Listen for drag events — activate drop zones when a note is being dragged
  // from the tab bar, sidebar, or card mode panels
  React.useEffect(() => {
    function onDragStart(e: DragEvent) {
      if (
        getDraggedTab() ||
        e.dataTransfer?.types.includes("application/openvlt-note")
      ) {
        setIsDraggingTab(true)
      }
    }
    function onDragEnd() {
      setIsDraggingTab(false)
      setDropSide(null)
    }
    window.addEventListener("dragstart", onDragStart)
    window.addEventListener("dragend", onDragEnd)
    return () => {
      window.removeEventListener("dragstart", onDragStart)
      window.removeEventListener("dragend", onDragEnd)
    }
  }, [])

  // Sync URL when active tab changes
  // Use native replaceState to avoid Next.js intercepting and triggering
  // soft navigations (RSC refetches) which cause an infinite request loop.
  const nativeReplaceState = React.useCallback(
    (...args: Parameters<typeof window.history.replaceState>) => {
      History.prototype.replaceState.apply(window.history, args)
    },
    []
  )

  const specialTabRoutes: Record<string, string> = {
    __all__: "/notes",
    __trash__: "/notes?view=trash",
    __bookmarks__: "/notes?view=bookmarks",
    __settings__: "/settings",
    __graph__: "/notes?view=graph",
    __search__: "/search",
  }

  React.useEffect(() => {
    // Don't sync URL until tab store has hydrated from localStorage,
    // otherwise the initial null activeTabId pushes us to /notes
    // before the real active tab is restored.
    if (!hydrated) return
    if (!activeTabId) {
      // No tabs open — go to /notes (empty state)
      const current = window.location.pathname + window.location.search
      if (current !== "/notes") {
        nativeReplaceState(null, "", "/notes")
      }
      return
    }
    const current = window.location.pathname + window.location.search
    // For settings, preserve /settings/[section] if already on a settings subpath
    if (activeTabId === "__settings__" && current.startsWith("/settings/")) {
      return
    }
    const target = activeTabId.startsWith("__dbview_")
      ? `/notes?view=database&id=${activeTabId.slice(9, -2)}`
      : specialTabRoutes[activeTabId] ?? `/notes/${activeTabId}`
    if (current !== target) {
      nativeReplaceState(null, "", target)
    }
  }, [activeTabId, hydrated, nativeReplaceState])

  // Listen for popstate (browser back/forward)
  React.useEffect(() => {
    function handlePopState() {
      const match = window.location.pathname.match(/^\/notes\/(.+)$/)
      if (match) {
        const noteId = match[1]
        const exists = tabs.find((t) => t.noteId === noteId)
        if (exists) {
          setActiveTab(noteId)
        }
      }
    }
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [tabs, setActiveTab])

  useShortcutAction("closeTab", () => {
    if (storeRef.current.activeTabId) {
      storeRef.current.closeTab(storeRef.current.activeTabId)
    }
  })
  useShortcutAction("closeSplitPane", () => {
    if (storeRef.current.splitNoteId) {
      storeRef.current.closeSplit()
    }
  })

  function resolveDraggedNote(e: React.DragEvent) {
    let noteId: string | null = null
    let title: string | null = null

    const tab = getDraggedTab()
    if (tab) {
      noteId = tab.noteId
      title = tab.title
    } else {
      const raw = e.dataTransfer.getData("application/openvlt-note")
      if (raw) {
        try {
          const data = JSON.parse(raw)
          noteId = data.noteId
          title = data.title
        } catch {}
      }
    }

    return noteId && title ? { noteId, title } : null
  }

  function handleDrop(e: React.DragEvent, side: "left" | "right") {
    e.preventDefault()
    setDropSide(null)

    const note = resolveDraggedNote(e)
    if (!note) return

    if (side === "right") {
      openSplit(note.noteId, note.title)
    } else {
      // Dropped on left — make it active, current active goes to split
      const currentActive = tabs.find((t) => t.noteId === activeTabId)
      if (currentActive && currentActive.noteId !== note.noteId) {
        openSplit(currentActive.noteId, currentActive.title)
      }
      openTab(note.noteId, note.title)
    }
  }

  function handleEmptyDrop(e: React.DragEvent) {
    e.preventDefault()
    setDropSide(null)
    setIsDraggingTab(false)

    const note = resolveDraggedNote(e)
    if (!note) return

    openTab(note.noteId, note.title)
  }

  if (tabs.length === 0) {
    const hour = new Date().getHours()
    const greeting =
      hour < 5
        ? "Burning the midnight oil?"
        : hour < 12
          ? "Good morning"
          : hour < 17
            ? "Good afternoon"
            : hour < 21
              ? "Good evening"
              : "Winding down?"
    const mascot =
      hour < 5 || hour >= 21 ? "/sleep.svg" : hour < 12 ? "/flower.svg" : "/celebrate.svg"
    const quote = getMascotQuote(hour)
    const recentNotes = recentlyClosed
      .filter((t) => !t.noteId.startsWith("__"))
      .slice(0, 5)

    return (
      <div
        className="flex h-svh min-w-0 flex-col overflow-hidden"
        onDragOver={(e) => {
          if (
            getDraggedTab() ||
            e.dataTransfer.types.includes("application/openvlt-note")
          ) {
            e.preventDefault()
            setDropSide("left")
          }
        }}
        onDragLeave={() => setDropSide(null)}
        onDrop={handleEmptyDrop}
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b bg-background px-2">
          <SidebarTrigger className="-ml-1" />
          <AIChatTrigger />
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`flex flex-1 flex-col items-center justify-center gap-6 text-center transition-colors ${
            dropSide
              ? "border-2 border-dashed border-primary/50 bg-primary/5"
              : ""
          }`}
        >
          {dropSide ? (
            <>
              <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <FileTextIcon className="size-8 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-medium">Drop to open</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Release to open this note
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Hero: mascot + greeting */}
              <div className="flex flex-col items-center gap-3">
                <Image
                  src={mascot}
                  alt=""
                  width={80}
                  height={80}
                  className="animate-[bounce_3s_ease-in-out_infinite] opacity-80 dark:invert"
                  priority
                />
                <div className="text-center">
                  <h2 className="text-lg font-medium">
                    {userName
                      ? `${greeting.replace(/\?$/, "")}, ${userName}${greeting.endsWith("?") ? "?" : ""}`
                      : greeting}
                  </h2>
                  <p className="mt-1 text-sm italic text-muted-foreground">
                    &ldquo;{quote}&rdquo;
                  </p>
                </div>
              </div>

              {/* Action row: shortcuts as clickable pills */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new KeyboardEvent("keydown", {
                        key: "o",
                        metaKey: true,
                      }),
                    )
                  }
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ShortcutKeys binding={getBinding("newNote")} />
                  <span>New note</span>
                </button>
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new Event("openvlt:open-command-palette"),
                    )
                  }
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ShortcutKeys binding={getBinding("toggleCommandPalette")} />
                  <span>Command palette</span>
                </button>
              </div>

              {/* Recently closed */}
              {recentNotes.length > 0 && (
                <div className="mt-4 w-full max-w-xs">
                  <table className="w-full">
                    <tbody>
                      {recentNotes.map((note) => (
                        <tr
                          key={note.noteId}
                          onClick={() => reopenClosedTab(note.noteId)}
                          className="group cursor-pointer border-b border-border/30 last:border-b-0"
                        >
                          <td className="py-2.5 pr-3 text-sm text-muted-foreground/60 transition-colors group-hover:text-foreground">
                            <span className="truncate block max-w-[200px]">
                              {note.title}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-xs text-muted-foreground/30 transition-colors group-hover:text-muted-foreground">
                            {formatClosedTime(note.closedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        <AIChatSidebar />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <TabBar />
      {/* min-w-0: required so split panes shrink to fit available width
           instead of overflowing. Do not remove. */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Content area (main panel + split pane) — drop zones are scoped to this */}
        <div ref={contentAreaRef} className="relative flex min-w-0 flex-1 overflow-hidden">
          {/* Drop zone overlays — only visible during tab drag, scoped to content area */}
          {isDraggingTab && (
            <>
              <div
                className="absolute inset-y-0 left-0 z-20 w-1/2"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropSide("left")
                }}
                onDragLeave={() => setDropSide(null)}
                onDrop={(e) => handleDrop(e, "left")}
              >
                {dropSide === "left" && (
                  <div className="flex h-full items-center justify-center border-2 border-dashed border-primary/50 bg-primary/5">
                    <span className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                      Open on left
                    </span>
                  </div>
                )}
              </div>
              <div
                className="absolute inset-y-0 right-0 z-20 w-1/2"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropSide("right")
                }}
                onDragLeave={() => setDropSide(null)}
                onDrop={(e) => handleDrop(e, "right")}
              >
                {dropSide === "right" && (
                  <div className="flex h-full items-center justify-center border-2 border-dashed border-primary/50 bg-primary/5">
                    <span className="rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
                      Open on right
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Main panel */}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {tabs.map((tab) =>
            tab.noteId === "__graph__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <GraphView />
              </div>
            ) : tab.noteId === "__settings__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <SettingsPanel />
              </div>
            ) : tab.noteId === "__all__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <NotesListPanel />
              </div>
            ) : tab.noteId === "__trash__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <TrashPanel />
              </div>
            ) : tab.noteId === "__bookmarks__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <BookmarksListPanel />
              </div>
            ) : tab.noteId === "__search__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <SearchPanel />
              </div>
            ) : tab.noteId.startsWith("__dbview_") ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <DatabaseViewPanel viewId={tab.noteId.slice(9, -2)} />
              </div>
            ) : (
              <TabPanel
                key={tab.noteId}
                noteId={tab.noteId}
                active={tab.noteId === activeTabId}
              />
            )
          )}
        </div>

        {/* Split pane */}
        {splitNoteId && (
          <>
            <div className="w-px shrink-0 bg-border" />
            <div className="relative min-w-0 flex-1 overflow-hidden">
              {splitNoteId.startsWith("__") && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={closeSplit}
                  title="Close split pane"
                  className="absolute right-2 top-2 z-10"
                >
                  <XIcon className="size-4" />
                </Button>
              )}
              {splitNoteId === "__graph__" ? (
                <GraphView />
              ) : splitNoteId === "__settings__" ? (
                <SettingsPanel />
              ) : splitNoteId === "__all__" ? (
                <NotesListPanel />
              ) : splitNoteId === "__trash__" ? (
                <TrashPanel />
              ) : splitNoteId === "__bookmarks__" ? (
                <BookmarksListPanel />
              ) : splitNoteId === "__search__" ? (
                <SearchPanel />
              ) : splitNoteId.startsWith("__dbview_") ? (
                <DatabaseViewPanel viewId={splitNoteId.slice(9, -2)} />
              ) : (
                <TabPanel noteId={splitNoteId} active isSplit />
              )}
            </div>
          </>
        )}

        </div>

        {/* AI Chat sidebar - outside content area so drop zones don't overlap */}
        <AIChatSidebar />
      </div>
    </div>
  )
}
