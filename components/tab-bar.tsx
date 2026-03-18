"use client"

import * as React from "react"
import { XIcon, PlusIcon, ChevronDownIcon, SparklesIcon } from "lucide-react"
import { useTabStore, type Tab } from "@/lib/stores/tab-store"
import { useAIChat } from "@/lib/stores/ai-chat-store"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { TabSearchPanel } from "@/components/tab-search-panel"

// Module-level drag state so tab-container can read it
let draggedTab: Tab | null = null
export function getDraggedTab() {
  return draggedTab
}

/** SVG curve that sits at the bottom-left or bottom-right of the active tab */
function TabCurve({ side }: { side: "left" | "right" }) {
  const flip = side === "right"
  return (
    <svg
      className="absolute bottom-0 size-2 fill-background"
      style={{ [side]: -8 }}
      viewBox="0 0 8 8"
      preserveAspectRatio="none"
    >
      <path d={flip ? "M 8 8 A 8 8 0 0 1 0 0 L 0 8 Z" : "M 0 8 A 8 8 0 0 0 8 0 L 8 8 Z"} />
    </svg>
  )
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, openTab, reorderTab } =
    useTabStore()
  const { isOpen: aiChatOpen, toggle: toggleAIChat } = useAIChat()
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [dropTargetIndex, setDropTargetIndex] = React.useState<number | null>(
    null
  )
  const [dropSide, setDropSide] = React.useState<"left" | "right" | null>(null)
  const dragSourceIndex = React.useRef<number | null>(null)

  if (tabs.length === 0) return null

  function handleMouseDown(e: React.MouseEvent, noteId: string) {
    if (e.button === 1) {
      e.preventDefault()
      closeTab(noteId)
    }
  }

  function handleDragStart(e: React.DragEvent, tab: Tab, index: number) {
    draggedTab = tab
    dragSourceIndex.current = index
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", tab.noteId)
    e.dataTransfer.setData(
      "application/openvlt-note",
      JSON.stringify({ noteId: tab.noteId, title: tab.title })
    )
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5"
    }
  }

  function handleDragEnd(e: React.DragEvent) {
    draggedTab = null
    dragSourceIndex.current = null
    setDropTargetIndex(null)
    setDropSide(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1"
    }
  }

  function handleDragOverTab(e: React.DragEvent, index: number) {
    if (dragSourceIndex.current === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    const side = e.clientX < midX ? "left" : "right"
    setDropTargetIndex(index)
    setDropSide(side)
  }

  function handleDropOnTab(e: React.DragEvent, index: number) {
    e.preventDefault()
    const fromIndex = dragSourceIndex.current
    if (fromIndex === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const midX = rect.left + rect.width / 2
    let toIndex = e.clientX < midX ? index : index + 1
    if (toIndex > fromIndex) toIndex--
    reorderTab(fromIndex, toIndex)
    setDropTargetIndex(null)
    setDropSide(null)
  }

  return (
    <div className="flex h-10 shrink-0 items-end bg-muted">
      <SidebarTrigger className="mb-1.5 ml-3 mr-2 shrink-0" />
      <div className="flex min-w-0 flex-1 items-end overflow-x-auto pl-2 scrollbar-none [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab, index) => {
          const isActive = tab.noteId === activeTabId
          const prevIsActive = index > 0 && tabs[index - 1].noteId === activeTabId
          // Show separator between two inactive tabs (hide next to active tab)
          const showSeparator = !isActive && !prevIsActive && index > 0
          const showDropLeft = dropTargetIndex === index && dropSide === "left"
          const showDropRight = dropTargetIndex === index && dropSide === "right"
          return (
            <React.Fragment key={tab.noteId}>
              {showSeparator && !showDropLeft && (
                <span className="self-center h-4 w-px shrink-0 bg-foreground/8" />
              )}
              {showDropLeft && (
                <span className="self-stretch w-0.5 shrink-0 rounded-full bg-primary" />
              )}
              <button
                draggable
                onClick={() => setActiveTab(tab.noteId)}
                onMouseDown={(e) => handleMouseDown(e, tab.noteId)}
                onDragStart={(e) => handleDragStart(e, tab, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOverTab(e, index)}
                onDragLeave={() => {
                  setDropTargetIndex(null)
                  setDropSide(null)
                }}
                onDrop={(e) => handleDropOnTab(e, index)}
                className={`group/tab relative flex min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 px-3 text-sm transition-all ${
                  isActive
                    ? "z-10 h-9 rounded-t-lg bg-background text-foreground"
                    : "h-8 rounded-t-md bg-transparent text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <span className="truncate">{tab.title}</span>
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.noteId)
                  }}
                  className="ml-auto flex size-4.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-muted-foreground"
                >
                  <XIcon className="size-2.5" />
                </span>
                {isActive && (
                  <>
                    <TabCurve side="left" />
                    <TabCurve side="right" />
                  </>
                )}
              </button>
              {showDropRight && (
                <span className="self-stretch w-0.5 shrink-0 rounded-full bg-primary" />
              )}
            </React.Fragment>
          )
        })}
        <button
          onClick={() => {
            fetch("/api/notes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: "Untitled" }),
            })
              .then((r) => r.json())
              .then((note) => {
                openTab(note.id, note.title)
                window.history.replaceState(null, "", `/notes/${note.id}`)
                window.dispatchEvent(new Event("openvlt:tree-refresh"))
              })
          }}
          className="mb-1.5 ml-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="New tab"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
      <Popover open={panelOpen} onOpenChange={setPanelOpen}>
        <PopoverTrigger asChild>
          <button
            className="mb-1.5 ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Search tabs"
          >
            <ChevronDownIcon className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={4}
          className="w-auto p-0"
        >
          <TabSearchPanel onClose={() => setPanelOpen(false)} />
        </PopoverContent>
      </Popover>
      <button
        onClick={toggleAIChat}
        className={`mb-1.5 ml-1 mr-3 shrink-0 rounded p-1 transition-colors ${
          aiChatOpen
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        title="Toggle AI Chat"
      >
        <SparklesIcon className="size-3.5" />
      </button>
    </div>
  )
}
