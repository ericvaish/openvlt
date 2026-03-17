"use client"

import * as React from "react"

const STORAGE_KEY = "openvlt:open-tabs"

export interface Tab {
  noteId: string
  title: string
}

interface TabState {
  tabs: Tab[]
  activeTabId: string | null
  splitNoteId: string | null
  splitTitle: string | null
}

interface TabStore extends TabState {
  openTab: (noteId: string, title: string, activate?: boolean) => void
  closeTab: (noteId: string) => void
  setActiveTab: (noteId: string) => void
  updateTabTitle: (noteId: string, title: string) => void
  reorderTab: (fromIndex: number, toIndex: number) => void
  openSplit: (noteId: string, title: string) => void
  closeSplit: () => void
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

export function TabProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<TabState>({
    tabs: [],
    activeTabId: null,
    splitNoteId: null,
    splitTitle: null,
  })
  const hydratedRef = React.useRef(false)

  React.useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      const saved = loadState()
      if (saved.tabs.length > 0) {
        setState(saved)
      }
    }
  }, [])

  React.useEffect(() => {
    if (hydratedRef.current) {
      persist(state)
    }
  }, [state])

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

  const store = React.useMemo<TabStore>(
    () => ({
      ...state,
      openTab,
      closeTab,
      setActiveTab,
      updateTabTitle,
      reorderTab,
      openSplit,
      closeSplit,
    }),
    [state, openTab, closeTab, setActiveTab, updateTabTitle, reorderTab, openSplit, closeSplit]
  )

  return <TabContext.Provider value={store}>{children}</TabContext.Provider>
}

export function useTabStore(): TabStore {
  const ctx = React.useContext(TabContext)
  if (!ctx) throw new Error("useTabStore must be used within TabProvider")
  return ctx
}
