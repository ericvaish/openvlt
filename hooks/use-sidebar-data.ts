"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTabStore } from "@/lib/stores/tab-store"
import { useFsWatch } from "@/hooks/use-fs-watch"
import { useCardModeStore } from "@/lib/stores/card-mode-store"
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

  const [dbViews, setDbViews] = React.useState<
    { id: string; name: string; viewType: string }[]
  >([])
  const [user, setUser] = React.useState<{
    username: string
    displayName: string
  } | null>(null)
  const [sidebarMode, setSidebarMode] = React.useState<
    "advanced" | "card"
  >(() => {
    if (typeof window === "undefined") return "advanced"
    const stored = localStorage.getItem("openvlt:sidebar-mode")
    if (stored === "card") return "card"
    return "advanced"
  })
  const { setPanels: setCardPanels, reset: resetCardPanels } =
    useCardModeStore()

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    if (sidebarMode === "card") {
      const cardState = localStorage.getItem("openvlt:card-mode-panels")
      if (!cardState || JSON.parse(cardState).panels?.length === 0) {
        setCardPanels([
          { folderId: "__root__", folderName: "Sections", selectedId: null },
        ])
      }
    }
  }, [setCardPanels, sidebarMode])

  const fetchTree = React.useCallback(async () => {
    try {
      const url = "/api/folders?mode=advanced"
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
    const mode = value as "advanced" | "card"
    setSidebarMode(mode)
    localStorage.setItem("openvlt:sidebar-mode", mode)
    fetchTree()

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

  // Unified create helpers.
  // parentId === undefined  → use activeFolderId (toolbar buttons)
  // parentId === null       → root (right-click empty space)
  // parentId === "some-id"  → that specific folder
  function resolveParent(parentId?: string | null): string | null {
    if (parentId === undefined) return activeFolderId
    return parentId
  }

  async function handleCreateNote(parentId?: string | null) {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled", parentId: resolveParent(parentId) }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {}
  }

  async function handleCreateCanvas(parentId?: string | null) {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Canvas",
          noteType: "canvas",
          parentId: resolveParent(parentId),
        }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {}
  }

  async function handleCreateExcalidraw(parentId?: string | null) {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Drawing",
          noteType: "excalidraw",
          parentId: resolveParent(parentId),
        }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {}
  }

  const createFolderParentRef = React.useRef<string | null | undefined>(undefined)

  function handleCreateFolder(parentId?: string | null) {
    if (!hasVault) return
    createFolderParentRef.current = parentId
    setFolderDialogOpen(true)
  }

  async function handleFolderCreated(name: string) {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: resolveParent(createFolderParentRef.current) }),
    })
    createFolderParentRef.current = undefined
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
  }
}
