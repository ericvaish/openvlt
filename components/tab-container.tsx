"use client"

import * as React from "react"
import { useTabStore } from "@/lib/stores/tab-store"
import { TabBar, getDraggedTab } from "@/components/tab-bar"
import { TabPanel } from "@/components/tab-panel"
import { GraphView } from "@/components/graph-view"
import { SettingsPanel } from "@/components/settings-panel"
import { TrashPanel } from "@/components/trash-panel"
import { NotesListPanel } from "@/components/notes-list-panel"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { FileTextIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useModifierKey } from "@/hooks/use-platform"

export function TabContainer() {
  const store = useTabStore()
  const {
    tabs,
    activeTabId,
    setActiveTab,
    splitNoteId,
    splitTitle,
    closeSplit,
    openSplit,
    openTab,
  } = store
  const mod = useModifierKey()
  const storeRef = React.useRef(store)
  storeRef.current = store

  const [dropSide, setDropSide] = React.useState<"left" | "right" | null>(null)
  const [isDraggingTab, setIsDraggingTab] = React.useState(false)

  // Listen for drag events from tab bar only
  React.useEffect(() => {
    function onDragStart() {
      // Only activate split drop zones when an actual tab is being dragged
      if (getDraggedTab()) {
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
  React.useEffect(() => {
    if (activeTabId && !activeTabId.startsWith("__")) {
      const current = window.location.pathname
      const target = `/notes/${activeTabId}`
      if (current !== target) {
        window.history.replaceState(null, "", target)
      }
    }
  }, [activeTabId])

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

  // Cmd+W to close active tab, Cmd+\ to close split
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault()
        if (storeRef.current.activeTabId) {
          storeRef.current.closeTab(storeRef.current.activeTabId)
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault()
        if (storeRef.current.splitNoteId) {
          storeRef.current.closeSplit()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  function handleDrop(e: React.DragEvent, side: "left" | "right") {
    e.preventDefault()
    setDropSide(null)
    const tab = getDraggedTab()
    if (!tab) return

    if (side === "right") {
      openSplit(tab.noteId, tab.title)
    } else {
      // Dropped on left — make it active, current active goes to split
      const currentActive = tabs.find((t) => t.noteId === activeTabId)
      if (currentActive && currentActive.noteId !== tab.noteId) {
        openSplit(currentActive.noteId, currentActive.title)
      }
      openTab(tab.noteId, tab.title)
    }
  }

  if (tabs.length === 0) {
    return (
      <div className="flex h-svh min-w-0 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center border-b bg-background px-2">
          <SidebarTrigger className="-ml-1" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <FileTextIcon className="size-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-medium">No note selected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a note from the sidebar or create a new one
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                {mod}
              </kbd>
              <span>+</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                O
              </kbd>
              <span>new note</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                {mod}
              </kbd>
              <span>+</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                K
              </kbd>
              <span>command palette</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh min-w-0 flex-col overflow-hidden">
      <TabBar />
      <div className="relative flex flex-1 overflow-hidden">
        {/* Drop zone overlays — only visible during tab drag */}
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
                <NotesListPanel filter="all" />
              </div>
            ) : tab.noteId === "__favorites__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <NotesListPanel filter="favorites" />
              </div>
            ) : tab.noteId === "__trash__" ? (
              <div
                key={tab.noteId}
                className={tab.noteId === activeTabId ? "h-full" : "hidden"}
              >
                <TrashPanel />
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
                <NotesListPanel filter="all" />
              ) : splitNoteId === "__favorites__" ? (
                <NotesListPanel filter="favorites" />
              ) : splitNoteId === "__trash__" ? (
                <TrashPanel />
              ) : (
                <TabPanel noteId={splitNoteId} active isSplit />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
