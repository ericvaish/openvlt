"use client"

import * as React from "react"

const STORAGE_KEY = "openvlt:open-tabs"
const RECENTLY_CLOSED_KEY = "openvlt:recently-closed-tabs"
const MAX_RECENTLY_CLOSED = 20

export interface Tab {
  noteId: string
  title: string
}

export interface ClosedTab {
  noteId: string
  title: string
  closedAt: number // Date.now()
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  splitNoteId: string | null
  splitTitle: string | null
}

interface TabStore extends TabState {
  hydrated: boolean
  recentlyClosed: ClosedTab[]
  openTab: (noteId: string, title: string, activate?: boolean) => void
  closeTab: (noteId: string) => void
  closeAllTabs: () => void
  closeOtherTabs: (noteId: string) => void
  reopenClosedTab: (noteId: string) => void
  setActiveTab: (noteId: string) => void
  updateTabTitle: (noteId: string, title: string) => void
  reorderTab: (fromIndex: number, toIndex: number) => void
  openSplit: (noteId: string, title: string) => void
  closeSplit: () => void
  closeMainAndPromoteSplit: () => void
}

const TabContext = React.createContext<TabStore | null>(null)

function loadState(): TabState {
  if (typeof window === "undefined")
    return { tabs: [], activeTabId: null, splitNoteId: null, splitTitle: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as TabState
      if (Array.isArray(parsed.tabs)) return parsed
    }
  } catch {}
  return { tabs: [], activeTabId: null, splitNoteId: null, splitTitle: null }
}

function persist(state: TabState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function loadRecentlyClosed(): ClosedTab[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENTLY_CLOSED_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as ClosedTab[]
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

function persistRecentlyClosed(items: ClosedTab[]) {
  localStorage.setItem(RECENTLY_CLOSED_KEY, JSON.stringify(items))
}

function addToRecentlyClosed(
  current: ClosedTab[],
  tabs: Tab[]
): ClosedTab[] {
  if (tabs.length === 0) return current
  // Filter out special tabs (settings, trash, etc.)
  const closable = tabs.filter((t) => !t.noteId.startsWith("__"))
  if (closable.length === 0) return current
  const now = Date.now()
  const newEntries: ClosedTab[] = closable.map((t) => ({
    noteId: t.noteId,
    title: t.title,
    closedAt: now,
  }))
  // Remove duplicates (if re-closing a previously closed tab)
  const ids = new Set(newEntries.map((e) => e.noteId))
  const filtered = current.filter((c) => !ids.has(c.noteId))
  return [...newEntries, ...filtered].slice(0, MAX_RECENTLY_CLOSED)
}

export function TabProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<TabState>({
    tabs: [],
    activeTabId: null,
    splitNoteId: null,
    splitTitle: null,
  })
  const [recentlyClosed, setRecentlyClosed] = React.useState<ClosedTab[]>([])
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    if (!hydrated) {
      const saved = loadState()
      if (saved.tabs.length > 0) {
        setState(saved)
      }
      setRecentlyClosed(loadRecentlyClosed())
      setHydrated(true)
    }
  }, [hydrated])

  React.useEffect(() => {
    if (hydrated) {
      persist(state)
    }
  }, [state, hydrated])

  React.useEffect(() => {
    if (hydrated) {
      persistRecentlyClosed(recentlyClosed)
    }
  }, [recentlyClosed, hydrated])

  const openTab = React.useCallback(
    (noteId: string, title: string, activate = true) => {
      setState((prev) => {
        const existing = prev.tabs.find((t) => t.noteId === noteId)
        if (existing) {
          const titleChanged = existing.title !== title
          if (!titleChanged && (!activate || prev.activeTabId === noteId)) {
            return prev
          }
          return {
            ...prev,
            tabs: titleChanged
              ? prev.tabs.map((t) =>
                  t.noteId === noteId ? { ...t, title } : t
                )
              : prev.tabs,
            activeTabId: activate ? noteId : prev.activeTabId,
          }
        }
        return {
          ...prev,
          tabs: [...prev.tabs, { noteId, title }],
          activeTabId: activate ? noteId : prev.activeTabId,
        }
      })
    },
    []
  )

  const closeTab = React.useCallback((noteId: string) => {
    setState((prev) => {
      const idx = prev.tabs.findIndex((t) => t.noteId === noteId)
      if (idx === -1) return prev
      const closedTab = prev.tabs[idx]
      setRecentlyClosed((rc) => addToRecentlyClosed(rc, [closedTab]))
      const tabs = prev.tabs.filter((t) => t.noteId !== noteId)
      let activeTabId = prev.activeTabId
      if (activeTabId === noteId) {
        const nextIdx = Math.min(idx, tabs.length - 1)
        activeTabId = tabs[nextIdx]?.noteId ?? null
      }
      const splitNoteId = prev.splitNoteId === noteId ? null : prev.splitNoteId
      const splitTitle = splitNoteId ? prev.splitTitle : null
      return { tabs, activeTabId, splitNoteId, splitTitle }
    })
  }, [])

  const closeAllTabs = React.useCallback(() => {
    setState((prev) => {
      setRecentlyClosed((rc) => addToRecentlyClosed(rc, prev.tabs))
      return {
        tabs: [],
        activeTabId: null,
        splitNoteId: null,
        splitTitle: null,
      }
    })
  }, [])

  const closeOtherTabs = React.useCallback((noteId: string) => {
    setState((prev) => {
      const tab = prev.tabs.find((t) => t.noteId === noteId)
      if (!tab) return prev
      const others = prev.tabs.filter((t) => t.noteId !== noteId)
      setRecentlyClosed((rc) => addToRecentlyClosed(rc, others))
      return {
        tabs: [tab],
        activeTabId: noteId,
        splitNoteId: prev.splitNoteId === noteId ? prev.splitNoteId : null,
        splitTitle: prev.splitNoteId === noteId ? prev.splitTitle : null,
      }
    })
  }, [])

  const reopenClosedTab = React.useCallback((noteId: string) => {
    setRecentlyClosed((prev) => {
      const entry = prev.find((c) => c.noteId === noteId)
      if (!entry) return prev
      openTab(entry.noteId, entry.title)
      return prev.filter((c) => c.noteId !== noteId)
    })
  }, [openTab])

  const setActiveTab = React.useCallback((noteId: string) => {
    setState((prev) =>
      prev.activeTabId === noteId ? prev : { ...prev, activeTabId: noteId }
    )
  }, [])

  const updateTabTitle = React.useCallback(
    (noteId: string, title: string) => {
      setState((prev) => {
        const tab = prev.tabs.find((t) => t.noteId === noteId)
        if (!tab || tab.title === title) return prev
        const splitTitle =
          prev.splitNoteId === noteId ? title : prev.splitTitle
        return {
          ...prev,
          tabs: prev.tabs.map((t) =>
            t.noteId === noteId ? { ...t, title } : t
          ),
          splitTitle,
        }
      })
    },
    []
  )

  const reorderTab = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      setState((prev) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prev.tabs.length ||
          toIndex >= prev.tabs.length
        )
          return prev
        const tabs = [...prev.tabs]
        const [moved] = tabs.splice(fromIndex, 1)
        tabs.splice(toIndex, 0, moved)
        return { ...prev, tabs }
      })
    },
    []
  )

  const openSplit = React.useCallback((noteId: string, title: string) => {
    setState((prev) => ({ ...prev, splitNoteId: noteId, splitTitle: title }))
  }, [])

  const closeSplit = React.useCallback(() => {
    setState((prev) => ({ ...prev, splitNoteId: null, splitTitle: null }))
  }, [])

  // Close the main (left) pane and promote the split (right) pane to main
  const closeMainAndPromoteSplit = React.useCallback(() => {
    setState((prev) => {
      if (!prev.splitNoteId) return prev
      return {
        ...prev,
        activeTabId: prev.splitNoteId,
        splitNoteId: null,
        splitTitle: null,
      }
    })
  }, [])

  const store = React.useMemo<TabStore>(
    () => ({
      ...state,
      hydrated,
      recentlyClosed,
      openTab,
      closeTab,
      closeAllTabs,
      closeOtherTabs,
      reopenClosedTab,
      setActiveTab,
      updateTabTitle,
      reorderTab,
      openSplit,
      closeSplit,
      closeMainAndPromoteSplit,
    }),
    [state, hydrated, recentlyClosed, openTab, closeTab, closeAllTabs, closeOtherTabs, reopenClosedTab, setActiveTab, updateTabTitle, reorderTab, openSplit, closeSplit, closeMainAndPromoteSplit]
  )

  return <TabContext.Provider value={store}>{children}</TabContext.Provider>
}

export function useTabStore(): TabStore {
  const ctx = React.useContext(TabContext)
  if (!ctx) throw new Error("useTabStore must be used within TabProvider")
  return ctx
}
