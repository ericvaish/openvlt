"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTabStore } from "@/lib/stores/tab-store"
import { useCardModeStore } from "@/lib/stores/card-mode-store"
import { useFsWatch } from "@/hooks/use-fs-watch"
import type { TreeNode } from "@/types/note"

/** Walk tree to find the parent folder ID of a given note ID */
function findParentFolderId(
  nodes: TreeNode[],
  noteId: string,
  parentId: string | null = null
): string | null {
  for (const node of nodes) {
    if (node.id === noteId) return parentId
    if (node.children) {
      const found = findParentFolderId(
        node.children,
        noteId,
        node.type === "folder" ? node.id : parentId
      )
      if (found !== null) return found
    }
  }
  return null
}

export function useSidebarData() {
  const router = useRouter()
  const { openTab, activeTabId } = useTabStore()
  useFsWatch()

  const [tree, setTree] = React.useState<TreeNode[]>([])
  const [hasVault, setHasVault] = React.useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false)
  const [activeFolderId, setActiveFolderId] = React.useState<string | null>(
    null
  )
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null)

  // Derive active folder and active item from the currently active tab
  React.useEffect(() => {
    if (!activeTabId || activeTabId.startsWith("__") || tree.length === 0)
      return
    setActiveItemId(activeTabId)
    const parentId = findParentFolderId(tree, activeTabId)
    if (parentId !== null) {
      setActiveFolderId(parentId)
    }
  }, [activeTabId, tree])

  const SHOW_ALL_KEY = "openvlt:show-all-files"
  const [showAllFiles, setShowAllFiles] = React.useState(true)
  React.useEffect(() => {
    // Default to showing all files unless explicitly turned off
    const stored = localStorage.getItem(SHOW_ALL_KEY)
    setShowAllFiles(stored !== "false")
  }, [])
  const showAllRef = React.useRef(showAllFiles)
  showAllRef.current = showAllFiles
  const [dbViews, setDbViews] = React.useState<
    { id: string; name: string; viewType: string }[]
  >([])
  const [user, setUser] = React.useState<{
    username: string
    displayName: string
  } | null>(null)
  const [sidebarMode, setSidebarMode] = React.useState<
    "simple" | "advanced" | "card"
  >("simple")
  const { setPanels: setCardPanels, reset: resetCardPanels } =
    useCardModeStore()

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    const stored = localStorage.getItem("openvlt:sidebar-mode") as
      | "simple"
      | "advanced"
      | "card"
      | null
    if (stored === "advanced" || stored === "card") {
      setSidebarMode(stored)
    }
    if (stored === "card") {
      const cardState = localStorage.getItem("openvlt:card-mode-panels")
      if (!cardState || JSON.parse(cardState).panels?.length === 0) {
        setCardPanels([
          { folderId: "__root__", folderName: "Sections", selectedId: null },
        ])
      }
    }
  }, [setCardPanels])

  const sidebarModeRef = React.useRef(sidebarMode)
  sidebarModeRef.current = sidebarMode

  const fetchTree = React.useCallback(async (mode?: string) => {
    const currentMode = mode ?? sidebarModeRef.current
    try {
      let url: string
      if (showAllRef.current) {
        url = "/api/folders?showAll=true"
      } else if (currentMode === "advanced") {
        url = "/api/folders?mode=advanced"
      } else {
        url = "/api/folders"
      }
      const res = await fetch(url)
      if (res.ok) {
        setHasVault(true)
        const data = await res.json()
        setTree(data)
      } else if (res.status === 400) {
        setHasVault(false)
        setTree([])
      }
    } catch {}
  }, [])

  function handleModeChange(value: string) {
    const mode = value as "simple" | "advanced" | "card"
    setSidebarMode(mode)
    localStorage.setItem("openvlt:sidebar-mode", mode)
    fetchTree(mode)

    if (mode === "card") {
      setCardPanels([
        { folderId: "__root__", folderName: "Sections", selectedId: null },
      ])
    } else {
      resetCardPanels()
    }

    window.dispatchEvent(new Event("openvlt:mode-change"))
  }

  React.useEffect(() => {
    const handler = () => fetchTree()
    window.addEventListener("openvlt:tree-refresh", handler)
    return () => window.removeEventListener("openvlt:tree-refresh", handler)
  }, [fetchTree])

  React.useEffect(() => {
    async function checkVault() {
      try {
        const res = await fetch("/api/vaults")
        if (res.ok) {
          const vaults = await res.json()
          const active = vaults.some((v: { isActive: boolean }) => v.isActive)
          setHasVault(active)
          if (active) {
            fetchTree()
            fetchDbViews()
          }
        }
      } catch {}
    }
    checkVault()
  }, [fetchTree])

  const fetchDbViews = React.useCallback(async () => {
    try {
      const res = await fetch("/api/database-views")
      if (res.ok) setDbViews(await res.json())
    } catch {}
  }, [])

  function handleVaultChange() {
    setHasVault(true)
    fetchTree()
    fetchDbViews()
    router.push("/notes")
  }

  async function handleCreateNote() {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled", parentId: activeFolderId }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {}
  }

  async function handleCreateCanvas() {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Canvas",
          noteType: "canvas",
          parentId: activeFolderId,
        }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {}
  }

  async function handleCreateExcalidraw() {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Drawing",
          noteType: "excalidraw",
          parentId: activeFolderId,
        }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {}
  }

  function handleCreateFolder() {
    if (!hasVault) return
    setFolderDialogOpen(true)
  }

  async function handleFolderCreated(name: string) {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: activeFolderId }),
    })
    fetchTree()
  }

  async function handleCreateDbView() {
    if (!hasVault) return
    try {
      const res = await fetch("/api/database-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Untitled View", viewType: "table" }),
      })
      if (res.ok) {
        const view = await res.json()
        openTab(`__dbview_${view.id}__`, view.name)
        fetchDbViews()
      }
    } catch {}
  }

  return {
    router,
    openTab,
    tree,
    hasVault,
    folderDialogOpen,
    setFolderDialogOpen,
    activeFolderId,
    setActiveFolderId,
    activeItemId,
    setActiveItemId,
    dbViews,
    user,
    sidebarMode,
    fetchTree,
    handleModeChange,
    handleVaultChange,
    handleCreateNote,
    handleCreateCanvas,
    handleCreateExcalidraw,
    handleCreateFolder,
    handleFolderCreated,
    handleCreateDbView,
    showAllFiles,
    toggleShowAllFiles() {
      const next = !showAllRef.current
      setShowAllFiles(next)
      localStorage.setItem(SHOW_ALL_KEY, String(next))
      showAllRef.current = next
      fetchTree()
    },
  }
}
