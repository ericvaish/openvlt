"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTabStore } from "@/lib/stores/tab-store"
import { MiddleTruncate } from "@/components/middle-truncate"
import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  ImageIcon,
  FileIcon,
  FileVideoIcon,
  FileAudioIcon,
  FileArchiveIcon,
  FileSpreadsheetIcon,
  DownloadIcon,
  EyeIcon,
  MoreHorizontalIcon,
  CopyIcon,
  ClipboardIcon,
  FolderInputIcon,
  SearchIcon,
  StarIcon,
  ExternalLinkIcon,
  PenLineIcon,
  LayoutDashboardIcon,
  XIcon,
} from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
import { confirmDialog, promptDialog } from "@/lib/dialogs"
import type { TreeNode } from "@/types/note"

// ── Multi-select context ──

interface MultiSelectState {
  selectedIds: Set<string>
  lastClickedId: string | null
  /** Handle click with modifier keys for multi-select */
  handleSelect: (
    nodeId: string,
    e: React.MouseEvent,
    flatOrder: string[]
  ) => boolean
  clearSelection: () => void
  selectAll: (ids: string[]) => void
  isSelected: (id: string) => boolean
}

const MultiSelectContext = React.createContext<MultiSelectState>({
  selectedIds: new Set(),
  lastClickedId: null,
  handleSelect: () => false,
  clearSelection: () => {},
  selectAll: () => {},
  isSelected: () => false,
})

export function useMultiSelect() {
  return React.useContext(MultiSelectContext)
}

/** Flatten the visible tree into an ordered list of node IDs (respects expanded state) */
function flattenVisibleTree(
  nodes: TreeNode[],
  expandedIds: Set<string>
): string[] {
  const result: string[] = []
  for (const node of nodes) {
    result.push(node.id)
    if (node.children && expandedIds.has(node.id)) {
      result.push(...flattenVisibleTree(node.children, expandedIds))
    }
  }
  return result
}

/** Find a node by ID in the tree */
function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

/** Find the parent ID of a node */
function findParentId(
  nodes: TreeNode[],
  targetId: string,
  parentId: string | null = null
): string | null | undefined {
  for (const node of nodes) {
    if (node.id === targetId) return parentId
    if (node.children) {
      const found = findParentId(node.children, targetId, node.id)
      if (found !== undefined) return found
    }
  }
  return undefined // not found
}

/** Collect all descendant IDs (notes + folders) under a node */
function collectDescendantIds(node: TreeNode): string[] {
  const ids: string[] = []
  if (node.children) {
    for (const child of node.children) {
      if (child.type === "attachment") continue
      ids.push(child.id)
      ids.push(...collectDescendantIds(child))
    }
  }
  return ids
}

// ── Helpers ──

function getNoteIcon(path: string) {
  if (path.endsWith(".canvas.json") || path.endsWith(".openvlt")) return LayoutDashboardIcon
  if (path.endsWith(".excalidraw.json")) return PenLineIcon
  return FileTextIcon
}

function getAttachmentIcon(mimeType?: string) {
  if (!mimeType) return FileIcon
  if (mimeType.startsWith("image/")) return ImageIcon
  if (mimeType.startsWith("video/")) return FileVideoIcon
  if (mimeType.startsWith("audio/")) return FileAudioIcon
  if (mimeType === "application/zip") return FileArchiveIcon
  if (mimeType === "text/csv" || mimeType === "application/json")
    return FileSpreadsheetIcon
  return FileIcon
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

/** Walk tree to collect all ancestor folder IDs for a given node ID */
function findAncestorFolderIds(
  nodes: TreeNode[],
  targetId: string,
  ancestors: string[] = []
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return ancestors
    if (node.children) {
      const nextAncestors =
        node.type === "folder" ? [...ancestors, node.id] : ancestors
      const found = findAncestorFolderIds(node.children, targetId, nextAncestors)
      if (found !== null) return found
    }
  }
  return null
}

// ── Expanded state (persisted to localStorage) ──

const EXPANDED_KEY = "openvlt:sidebar-expanded"

function loadExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveExpanded(set: Set<string>) {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]))
}

const ExpandedContext = React.createContext<{
  expandedIds: Set<string>
  toggle: (id: string) => void
  expand: (id: string) => void
  activeFolderId: string | null
  setActiveFolderId: (id: string | null) => void
  activeItemId: string | null
  setActiveItemId: (id: string | null) => void
}>({
  expandedIds: new Set(),
  toggle: () => {},
  expand: () => {},
  activeFolderId: null,
  setActiveFolderId: () => {},
  activeItemId: null,
  setActiveItemId: () => {},
})

// ── Drag-and-drop context ──

const DragContext = React.createContext<{
  draggedNode: TreeNode | null
  setDraggedNode: (n: TreeNode | null) => void
}>({ draggedNode: null, setDraggedNode: () => {} })

// ── Root ──

interface SidebarTreeProps {
  nodes: TreeNode[]
  onRefresh: () => void
  activeFolderId?: string | null
  onFolderActivate?: (id: string | null) => void
  activeItemId?: string | null
  onItemActivate?: (id: string | null) => void
}

export function SidebarTree({
  nodes,
  onRefresh,
  activeFolderId = null,
  onFolderActivate,
  activeItemId = null,
  onItemActivate,
}: SidebarTreeProps) {
  const { openTab } = useTabStore()
  const [draggedNode, setDraggedNode] = React.useState<TreeNode | null>(null)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(loadExpanded)

  // ── Multi-select state ──
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const lastClickedIdRef = React.useRef<string | null>(null)

  const multiSelectCtx = React.useMemo<MultiSelectState>(() => {
    function handleSelect(
      nodeId: string,
      e: React.MouseEvent,
      flatOrder: string[]
    ): boolean {
      const isMeta = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey

      if (!isMeta && !isShift) {
        // Regular click — clear selection, let normal behavior happen
        setSelectedIds(new Set())
        lastClickedIdRef.current = nodeId
        return false // did NOT handle multi-select
      }

      if (isMeta) {
        // Cmd/Ctrl+Click — toggle individual item
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(nodeId)) next.delete(nodeId)
          else next.add(nodeId)
          return next
        })
        lastClickedIdRef.current = nodeId
        return true // handled
      }

      if (isShift && lastClickedIdRef.current) {
        // Shift+Click — range selection
        const lastIdx = flatOrder.indexOf(lastClickedIdRef.current)
        const currIdx = flatOrder.indexOf(nodeId)
        if (lastIdx === -1 || currIdx === -1) {
          setSelectedIds(new Set([nodeId]))
          lastClickedIdRef.current = nodeId
          return true
        }
        const start = Math.min(lastIdx, currIdx)
        const end = Math.max(lastIdx, currIdx)
        const rangeIds = flatOrder.slice(start, end + 1)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (const id of rangeIds) next.add(id)
          return next
        })
        return true // handled
      }

      lastClickedIdRef.current = nodeId
      return false
    }

    return {
      selectedIds,
      lastClickedId: lastClickedIdRef.current,
      handleSelect,
      clearSelection: () => {
        setSelectedIds(new Set())
        lastClickedIdRef.current = null
      },
      selectAll: (ids: string[]) => {
        setSelectedIds(new Set(ids))
      },
      isSelected: (id: string) => selectedIds.has(id),
    }
  }, [selectedIds])

  // ── Keyboard navigation (arrow keys, Enter, Escape, Home/End) ──
  const treeContainerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape clears selection
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set())
        lastClickedIdRef.current = null
        return
      }

      // Only handle arrow keys when the sidebar tree area is focused
      // Check if focus is inside the tree or the sidebar
      const sidebarEl = treeContainerRef.current?.closest("[data-sidebar]")
      if (!sidebarEl?.contains(document.activeElement) && document.activeElement !== document.body) return

      // Ignore if user is typing in an input
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (!activeItemId && !["ArrowDown", "Home"].includes(e.key)) return

      const flat = flattenVisibleTree(nodes, expandedIds)
      if (flat.length === 0) return

      const setActive = onItemActivate ?? (() => {})

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault()
          if (!activeItemId) {
            setActive(flat[0])
            return
          }
          const idx = flat.indexOf(activeItemId)
          if (idx < flat.length - 1) setActive(flat[idx + 1])
          break
        }
        case "ArrowUp": {
          e.preventDefault()
          if (!activeItemId) return
          const idx = flat.indexOf(activeItemId)
          if (idx > 0) setActive(flat[idx - 1])
          break
        }
        case "ArrowRight": {
          e.preventDefault()
          if (!activeItemId) return
          const node = findNodeById(nodes, activeItemId)
          if (!node) return
          if (node.type === "folder") {
            if (!expandedIds.has(node.id)) {
              // Expand the folder
              setExpandedIds((prev) => {
                const next = new Set(prev)
                next.add(node.id)
                saveExpanded(next)
                return next
              })
            } else if (node.children && node.children.length > 0) {
              // Already expanded — move to first child
              const firstChild = node.children.find((c) => c.type !== "attachment")
              if (firstChild) setActive(firstChild.id)
            }
          }
          break
        }
        case "ArrowLeft": {
          e.preventDefault()
          if (!activeItemId) return
          const node = findNodeById(nodes, activeItemId)
          if (!node) return
          if (node.type === "folder" && expandedIds.has(node.id)) {
            // Collapse the folder
            setExpandedIds((prev) => {
              const next = new Set(prev)
              next.delete(node.id)
              saveExpanded(next)
              return next
            })
          } else {
            // Move to parent
            const pid = findParentId(nodes, activeItemId)
            if (pid) setActive(pid)
          }
          break
        }
        case "Home": {
          e.preventDefault()
          if (flat.length > 0) setActive(flat[0])
          break
        }
        case "End": {
          e.preventDefault()
          if (flat.length > 0) setActive(flat[flat.length - 1])
          break
        }
        case "Enter": {
          e.preventDefault()
          if (!activeItemId) return
          const node = findNodeById(nodes, activeItemId)
          if (!node) return
          if (node.type === "folder") {
            // Toggle folder
            setExpandedIds((prev) => {
              const next = new Set(prev)
              if (next.has(node.id)) next.delete(node.id)
              else next.add(node.id)
              saveExpanded(next)
              return next
            })
          } else {
            // Open note directly
            openTab(node.id, node.name)
          }
          break
        }
        default:
          return // Don't prevent default for other keys
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedIds.size, activeItemId, nodes, expandedIds, onItemActivate])

  // Auto-expand ancestor folders to reveal the active note (e.g. on refresh)
  React.useEffect(() => {
    if (!activeItemId || nodes.length === 0) return
    const ancestors = findAncestorFolderIds(nodes, activeItemId)
    if (!ancestors || ancestors.length === 0) return

    setExpandedIds((prev) => {
      const missing = ancestors.filter((id) => !prev.has(id))
      if (missing.length === 0) return prev
      const next = new Set(prev)
      for (const id of missing) next.add(id)
      saveExpanded(next)
      return next
    })
  }, [activeItemId, nodes])

  const expandedCtx = React.useMemo(
    () => ({
      expandedIds,
      toggle: (id: string) => {
        setExpandedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          saveExpanded(next)
          return next
        })
      },
      expand: (id: string) => {
        setExpandedIds((prev) => {
          if (prev.has(id)) return prev
          const next = new Set(prev)
          next.add(id)
          saveExpanded(next)
          return next
        })
      },
      activeFolderId,
      setActiveFolderId: onFolderActivate ?? (() => {}),
      activeItemId,
      setActiveItemId: onItemActivate ?? (() => {}),
    }),
    [expandedIds, activeFolderId, onFolderActivate, activeItemId, onItemActivate]
  )

  // Memoize flat order for shift-click range selection
  const flatOrder = React.useMemo(
    () => flattenVisibleTree(nodes, expandedIds),
    [nodes, expandedIds]
  )

  // Scroll active item into view when navigating with keyboard
  React.useEffect(() => {
    if (!activeItemId || !treeContainerRef.current) return
    const el = treeContainerRef.current.querySelector(
      `[data-tree-id="${CSS.escape(activeItemId)}"]`
    )
    el?.scrollIntoView({ block: "nearest" })
  }, [activeItemId])

  if (nodes.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
        No files yet. Create a note to get started.
      </div>
    )
  }

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault()
    e.currentTarget.classList.remove("bg-accent/30")
    if (!draggedNode) return

    const endpoint =
      draggedNode.type === "folder"
        ? `/api/folders/${draggedNode.id}`
        : `/api/notes/${draggedNode.id}`

    fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", parentId: null }),
    }).then(() => {
      setDraggedNode(null)
      onRefresh()
    })
  }

  return (
    <MultiSelectContext.Provider value={multiSelectCtx}>
      <ExpandedContext.Provider value={expandedCtx}>
        <DragContext.Provider value={{ draggedNode, setDraggedNode }}>
          <div
            ref={treeContainerRef}
            tabIndex={-1}
            className="min-h-full outline-none"
            onClick={(e) => {
              // Click on empty space → deselect folder/item
              const target = e.target as HTMLElement
              if (!target.closest("[data-tree-id]")) {
                onFolderActivate?.(null)
                onItemActivate?.(null)
                multiSelectCtx.clearSelection()
              }
            }}
          >
          {selectedIds.size > 1 && (
            <SelectionBar
              nodes={nodes}
              selectedIds={selectedIds}
              onRefresh={onRefresh}
              onClearSelection={multiSelectCtx.clearSelection}
            />
          )}
          <SidebarMenu
            onDragOver={(e) => {
              e.preventDefault()
              e.currentTarget.classList.add("bg-accent/30")
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("bg-accent/30")
            }}
            onDrop={handleRootDrop}
          >
            {nodes.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                onRefresh={onRefresh}
                parentId={null}
                flatOrder={flatOrder}
                siblingNames={nodes.map((n) => n.name)}
              />
            ))}
          </SidebarMenu>
          </div>
        </DragContext.Provider>
      </ExpandedContext.Provider>
    </MultiSelectContext.Provider>
  )
}

// ── Folder / Note tree item ──

function TreeItem({
  node,
  onRefresh,
  nested = false,
  parentId = null,
  flatOrder,
  siblingNames = [],
}: {
  node: TreeNode
  onRefresh: () => void
  nested?: boolean
  parentId?: string | null
  flatOrder: string[]
  siblingNames?: string[]
}) {
  const router = useRouter()
  const { openTab, closeTab, activeTabId } = useTabStore()
  const [dropTarget, setDropTarget] = React.useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false)
  const [folderDialogParentId, setFolderDialogParentId] = React.useState<
    string | null
  >(null)
  const { draggedNode, setDraggedNode } = React.useContext(DragContext)
  const {
    expandedIds,
    toggle,
    expand,
    activeFolderId,
    setActiveFolderId,
    activeItemId,
    setActiveItemId,
  } = React.useContext(ExpandedContext)
  const { handleSelect, isSelected, selectedIds } = React.useContext(MultiSelectContext)

  const expanded = expandedIds.has(node.id)
  const isActive = activeTabId === node.id
  const isItemActive = activeItemId === node.id
  const isNodeSelected = isSelected(node.id)
  const hasMultiSelection = selectedIds.size > 1

  function openNote() {
    // Non-note files (from "show all files" mode) - download them
    if (node.id.startsWith("file:")) {
      const filePath = node.id.slice(5)
      window.open(`/api/attachments/vault-file?path=${encodeURIComponent(filePath)}`, "_blank")
      return
    }
    openTab(node.id, node.name)
    setActiveItemId(node.id)
    if (parentId) setActiveFolderId(parentId)
  }

  // ── Actions ──

  async function handleCreateSiblingNote() {
    const title = await promptDialog({ title: "New note", description: "Note title:", suffix: ".md" })
    if (!title?.trim()) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), parentId }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        onRefresh()
      }
    } catch {}
  }

  function handleCreateSiblingFolder() {
    setFolderDialogParentId(parentId)
    setFolderDialogOpen(true)
  }

  async function handleCreateNote(folderId: string) {
    const title = await promptDialog({ title: "New note", description: "Note title:", suffix: ".md" })
    if (!title?.trim()) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), parentId: folderId }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        expand(node.id)
        onRefresh()
      }
    } catch {}
  }

  async function handleCreateDrawing(folderId: string) {
    const title = await promptDialog({ title: "New Excalidraw", description: "Name:", defaultValue: "Untitled" })
    if (!title?.trim()) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${title.trim()}.excalidraw`,
          parentId: folderId,
          content: JSON.stringify({
            type: "excalidraw",
            version: 2,
            source: "openvlt",
            elements: [],
            appState: { viewBackgroundColor: "#ffffff" },
            files: {},
          }),
        }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        expand(node.id)
        onRefresh()
      }
    } catch {}
  }

  async function handleCreateCanvas(folderId: string) {
    const title = await promptDialog({ title: "New canvas", description: "Canvas name:", defaultValue: "Untitled Canvas" })
    if (!title?.trim()) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          parentId: folderId,
          noteType: "canvas",
        }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        expand(node.id)
        onRefresh()
      }
    } catch {}
  }

  function handleCreateSubfolder(folderId: string) {
    setFolderDialogParentId(folderId)
    setFolderDialogOpen(true)
  }

  async function handleFolderCreated(name: string) {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: folderDialogParentId }),
    })
    if (folderDialogParentId === node.id) expand(node.id)
    onRefresh()
  }

  async function handleDelete() {
    if (node.type === "folder") {
      const confirmed = await confirmDialog({
        title: "Delete folder",
        description: `Delete folder "${node.name}" and all its contents?`,
        confirmLabel: "Delete",
        destructive: true,
      })
      if (!confirmed) return
      await fetch(`/api/folders/${node.id}`, { method: "DELETE" })
      // Close tabs for any notes inside the deleted folder
      if (node.children) {
        const closeNotes = (children: typeof node.children) => {
          for (const child of children ?? []) {
            if (child.type === "file") closeTab(child.id)
            if (child.children) closeNotes(child.children)
          }
        }
        closeNotes(node.children)
      }
    } else {
      const confirmed = await confirmDialog({
        title: "Move to trash",
        description: `Move "${node.name}" to trash?`,
        confirmLabel: "Move to trash",
        destructive: true,
      })
      if (!confirmed) return
      if (node.id.startsWith("file:")) {
        // Orphaned file on disk with no DB record — delete via vault-file endpoint
        const filePath = node.id.slice(5)
        await fetch(`/api/attachments/vault-file?path=${encodeURIComponent(filePath)}`, { method: "DELETE" })
      } else {
        await fetch(`/api/notes/${node.id}`, { method: "DELETE" })
        closeTab(node.id)
      }
    }
    onRefresh()
  }

  async function handleRename() {
    // Determine file extension suffix for notes (not folders)
    const noteExtensions = [".excalidraw", ".canvas", ".md"]
    let suffix: string | undefined
    let baseName = node.name
    if (node.type !== "folder") {
      for (const ext of noteExtensions) {
        if (node.name.endsWith(ext)) {
          suffix = ext
          baseName = node.name.slice(0, -ext.length)
          break
        }
      }
      // If no known extension was found on the name, default to .md for notes
      if (!suffix) {
        suffix = ".md"
      }
    }

    const otherNames = new Set(
      siblingNames
        .filter((n) => n !== node.name)
        .map((n) => n.toLowerCase())
    )
    const newName = await promptDialog({
      title: "Rename",
      description: `Rename "${node.name}" to:`,
      defaultValue: baseName,
      suffix,
      validate: (value) => {
        const trimmed = value.trim()
        if (!trimmed) return "Name cannot be empty"
        const fullName = suffix ? trimmed + suffix : trimmed
        if (otherNames.has(fullName.toLowerCase()) || otherNames.has(trimmed.toLowerCase()))
          return "An item with this name already exists"
        return null
      },
    })
    if (!newName?.trim() || newName.trim() === baseName) return
    if (node.type === "folder") {
      await fetch(`/api/folders/${node.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      })
    } else {
      await fetch(`/api/notes/${node.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newName.trim() }),
      })
    }
    onRefresh()
  }

  async function handleDuplicate() {
    await fetch(`/api/notes/${node.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate" }),
    })
    onRefresh()
  }

  async function handleToggleFavorite() {
    await fetch(`/api/notes/${node.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleFavorite" }),
    })
    onRefresh()
  }

  async function handleMoveToPrompt() {
    const target = await promptDialog({
      title: "Move to folder",
      description: "Enter folder name, or leave empty for root:",
    })
    if (target === null) return

    // If empty, move to root
    if (!target.trim()) {
      const endpoint =
        node.type === "folder"
          ? `/api/folders/${node.id}`
          : `/api/notes/${node.id}`
      fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", parentId: null }),
      }).then(() => onRefresh())
      return
    }

    // Search for folder by name — use the tree API
    fetch("/api/folders")
      .then((r) => r.json())
      .then((tree: TreeNode[]) => {
        const found = findFolderByName(tree, target.trim())
        if (!found) {
          alert(`Folder "${target}" not found`)
          return
        }
        const endpoint =
          node.type === "folder"
            ? `/api/folders/${node.id}`
            : `/api/notes/${node.id}`
        return fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "move", parentId: found.id }),
        })
      })
      .then(() => onRefresh())
  }

  function handleSearch() {
    if (node.type === "folder") {
      router.push(`/notes?search=&filter=all`)
    }
  }

  function handleRevealInFinder() {
    // Copy the path so user can navigate
    copyToClipboard(node.path)
    alert(`Path copied: ${node.path}`)
  }

  // ── Drag and drop ──

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = "move"
    setDraggedNode(node)
    // Set custom type so notes can be dropped into split panes
    if (node.type === "file") {
      e.dataTransfer.setData(
        "application/openvlt-note",
        JSON.stringify({ noteId: node.id, title: node.name })
      )
    }
  }

  function handleDragOver(e: React.DragEvent) {
    if (node.type !== "folder") return
    if (draggedNode?.id === node.id) return
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(true)
  }

  function handleDragLeave() {
    setDropTarget(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(false)
    if (!draggedNode || draggedNode.id === node.id) return
    if (node.type !== "folder") return

    const endpoint =
      draggedNode.type === "folder"
        ? `/api/folders/${draggedNode.id}`
        : `/api/notes/${draggedNode.id}`

    fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move", parentId: node.id }),
    }).then(() => {
      setDraggedNode(null)
      expand(node.id)
      onRefresh()
    })
  }

  function handleDragEnd() {
    setDraggedNode(null)
  }

  // ── Context menu contents ──

  const folderContextMenu = (
    <>
      <ContextMenuItem onClick={() => handleCreateNote(node.id)}>
        <FilePlusIcon className="mr-2 size-4" />
        New note
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleCreateSubfolder(node.id)}>
        <FolderPlusIcon className="mr-2 size-4" />
        New folder
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleCreateDrawing(node.id)}>
        <PenLineIcon className="mr-2 size-4" />
        New Excalidraw
      </ContextMenuItem>
      <ContextMenuItem onClick={() => handleCreateCanvas(node.id)}>
        <PenLineIcon className="mr-2 size-4" />
        New canvas
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleMoveToPrompt}>
        <FolderInputIcon className="mr-2 size-4" />
        Move folder to...
      </ContextMenuItem>
      <ContextMenuItem onClick={handleSearch}>
        <SearchIcon className="mr-2 size-4" />
        Search in folder
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => copyToClipboard(node.path)}>
        <CopyIcon className="mr-2 size-4" />
        Copy path
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => copyToClipboard(node.path)}
      >
        <ClipboardIcon className="mr-2 size-4" />
        Copy relative path
      </ContextMenuItem>
      <ContextMenuItem onClick={handleRevealInFinder}>
        <ExternalLinkIcon className="mr-2 size-4" />
        Reveal in Finder
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRename}>
        <PencilIcon className="mr-2 size-4" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDelete} variant="destructive">
        <TrashIcon className="mr-2 size-4" />
        Delete
      </ContextMenuItem>
    </>
  )

  const noteContextMenu = (
    <>
      <ContextMenuItem onClick={handleCreateSiblingNote}>
        <FilePlusIcon className="mr-2 size-4" />
        New note
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCreateSiblingFolder}>
        <FolderPlusIcon className="mr-2 size-4" />
        New folder
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleDuplicate}>
        <CopyIcon className="mr-2 size-4" />
        Duplicate
      </ContextMenuItem>
      <ContextMenuItem onClick={handleMoveToPrompt}>
        <FolderInputIcon className="mr-2 size-4" />
        Move to...
      </ContextMenuItem>
      <ContextMenuItem onClick={handleToggleFavorite}>
        <StarIcon className="mr-2 size-4" />
        Toggle favorite
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => copyToClipboard(node.path)}>
        <CopyIcon className="mr-2 size-4" />
        Copy path
      </ContextMenuItem>
      <ContextMenuItem onClick={() => copyToClipboard(node.path)}>
        <ClipboardIcon className="mr-2 size-4" />
        Copy relative path
      </ContextMenuItem>
      <ContextMenuItem onClick={handleRevealInFinder}>
        <ExternalLinkIcon className="mr-2 size-4" />
        Reveal in Finder
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRename}>
        <PencilIcon className="mr-2 size-4" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDelete} variant="destructive">
        <TrashIcon className="mr-2 size-4" />
        Delete
      </ContextMenuItem>
    </>
  )

  const dragProps = {
    draggable: true,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  }

  const dropProps =
    node.type === "folder"
      ? {
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        }
      : {}

  const dropClass = dropTarget ? "ring-2 ring-inset ring-primary/50 rounded-md" : ""

  // Unified highlight props for selected items AND the single active item.
  // Both folders and notes use these same props so styling is consistent.
  // Ring comes from className; background comes from the sidebar component's
  // data-active + our global CSS rule [data-active][data-sidebar-selected].
  const isHighlighted = isNodeSelected || isItemActive
  const highlightClass = isHighlighted
    ? "ring-1 ring-inset ring-primary/30 dark:ring-primary/50 rounded-md"
    : ""
  const highlightProps = {
    isActive: isActive || isHighlighted,
    "data-sidebar-selected": isHighlighted || undefined,
  }

  // ── Shared: wrapper + button based on nesting ──

  const Wrapper = nested ? React.Fragment : SidebarMenuItem
  const Btn = nested ? SidebarMenuSubButton : SidebarMenuButton
  const NoteIcon = node.type === "file" ? getNoteIcon(node.path) : FileTextIcon

  // Determine which context menu to use: bulk or single
  const contextMenuContent = hasMultiSelection && isNodeSelected

  // ── Folder rendering ──

  if (node.type === "folder") {
    const folderContent = (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Btn
              data-tree-id={node.id}
              {...highlightProps}
              onClick={(e: React.MouseEvent) => {
                const handled = handleSelect(node.id, e, flatOrder)
                if (!handled) {
                  toggle(node.id)
                  setActiveFolderId(node.id)
                  setActiveItemId(node.id)
                }
              }}
              className={`${dropClass} ${highlightClass}`}
              {...dragProps}
              {...dropProps}
            >
              <ChevronRightIcon
                className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
              {expanded ? (
                <FolderOpenIcon
                  className={`size-4 shrink-0 ${isItemActive ? "text-primary" : ""}`}
                />
              ) : (
                <FolderIcon
                  className={`size-4 shrink-0 ${isItemActive ? "text-primary" : ""}`}
                />
              )}
              <span>{node.name}</span>
            </Btn>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {contextMenuContent ? (
              <BulkContextMenu
                selectedIds={selectedIds}
                onRefresh={onRefresh}
                nodes={[]}
              />
            ) : (
              folderContextMenu
            )}
          </ContextMenuContent>
        </ContextMenu>

        {expanded && node.children && node.children.length > 0 && (
          <SidebarMenuSub className="border-l-sidebar-foreground/15">
            {node.children.map((child) => (
              <SidebarMenuSubItem key={child.id}>
                {child.type === "attachment" ? (
                  <AttachmentItem node={child} onRefresh={onRefresh} />
                ) : (
                  <TreeItem node={child} onRefresh={onRefresh} nested parentId={node.id} flatOrder={flatOrder} siblingNames={node.children!.map((c) => c.name)} />
                )}
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        )}
      </>
    )

    return (
      <>
        <Wrapper>{folderContent}</Wrapper>
        <CreateFolderDialog
          open={folderDialogOpen}
          onOpenChange={setFolderDialogOpen}
          onCreated={handleFolderCreated}
        />
      </>
    )
  }

  // ── Note with children (advanced mode) ──

  const hasChildren = node.children && node.children.length > 0

  if (hasChildren) {
    const noteContent = (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Btn
              data-tree-id={node.id}
              {...highlightProps}
              onClick={(e: React.MouseEvent) => {
                const handled = handleSelect(node.id, e, flatOrder)
                if (!handled) {
                  openNote()
                  toggle(node.id)
                }
              }}
              className={highlightClass}
              {...dragProps}
            >
              <ChevronRightIcon
                className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
              <NoteIcon className="size-4 shrink-0" />
              <span>{node.name}</span>
            </Btn>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {contextMenuContent ? (
              <BulkContextMenu
                selectedIds={selectedIds}
                onRefresh={onRefresh}
                nodes={[]}
              />
            ) : (
              noteContextMenu
            )}
          </ContextMenuContent>
        </ContextMenu>

        {expanded && (
          <SidebarMenuSub className="border-l-sidebar-foreground/15">
            {node.children!.map((child) => (
              <SidebarMenuSubItem key={child.id}>
                {child.type === "attachment" ? (
                  <AttachmentItem node={child} onRefresh={onRefresh} />
                ) : (
                  <SidebarMenuSubButton className="pointer-events-none opacity-60">
                    {React.createElement(getNoteIcon(child.path), { className: "size-4 shrink-0" })}
                    <span>{child.name}</span>
                  </SidebarMenuSubButton>
                )}
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        )}
      </>
    )

    return (
      <>
        <Wrapper>{noteContent}</Wrapper>
        <CreateFolderDialog
          open={folderDialogOpen}
          onOpenChange={setFolderDialogOpen}
          onCreated={handleFolderCreated}
        />
      </>
    )
  }

  // ── Simple note (no children) ──

  const simpleContent = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Btn
          data-tree-id={node.id}
          {...highlightProps}
          onClick={(e: React.MouseEvent) => {
            const handled = handleSelect(node.id, e, flatOrder)
            if (!handled) openNote()
          }}
          className={highlightClass}
          {...dragProps}
        >
          <NoteIcon className="size-4 shrink-0" />
          <span>{node.name}</span>
        </Btn>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {contextMenuContent ? (
          <BulkContextMenu
            selectedIds={selectedIds}
            onRefresh={onRefresh}
            nodes={[]}
          />
        ) : (
          noteContextMenu
        )}
      </ContextMenuContent>
    </ContextMenu>
  )

  return (
    <>
      <Wrapper>{simpleContent}</Wrapper>
      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onCreated={handleFolderCreated}
      />
    </>
  )
}

// ── Attachment sub-item (advanced mode) ──

function AttachmentItem({
  node,
  onRefresh,
}: {
  node: TreeNode
  onRefresh: () => void
}) {
  const { openTab } = useTabStore()
  const Icon = getAttachmentIcon(node.mimeType)
  const url = `/api/attachments/${node.id}`

  async function handleDelete() {
    const confirmed = await confirmDialog({
      title: "Delete note",
      description: `Delete "${node.name}"?`,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!confirmed) return
    await fetch(url, { method: "DELETE" })
    onRefresh()
  }

  function handleView() {
    openTab(`__attachment_${node.id}__`, node.name)
  }

  function handleDownload() {
    const a = document.createElement("a")
    a.href = url
    a.download = node.name
    a.click()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group/att relative flex w-full items-center">
          <SidebarMenuSubButton
            onClick={handleView}
            className="min-w-0 flex-1 cursor-pointer pr-6"
            title={node.name}
          >
            <Icon className="size-4 shrink-0" />
            <MiddleTruncate text={node.name} />
          </SidebarMenuSubButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="absolute right-1 flex size-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover/att:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontalIcon className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              <DropdownMenuItem onClick={handleView}>
                <EyeIcon className="mr-2 size-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <DownloadIcon className="mr-2 size-4" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDelete}
                variant="destructive"
              >
                <TrashIcon className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleView}>
          <EyeIcon className="mr-2 size-4" />
          View
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDownload}>
          <DownloadIcon className="mr-2 size-4" />
          Download
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDelete} variant="destructive">
          <TrashIcon className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ── Bulk selection bar ──

function SelectionBar({
  nodes,
  selectedIds,
  onRefresh,
  onClearSelection,
}: {
  nodes: TreeNode[]
  selectedIds: Set<string>
  onRefresh: () => void
  onClearSelection: () => void
}) {
  const { closeTab } = useTabStore()

  /** Find a node in the tree by ID */
  function findNode(id: string, tree: TreeNode[]): TreeNode | null {
    for (const n of tree) {
      if (n.id === id) return n
      if (n.children) {
        const found = findNode(id, n.children)
        if (found) return found
      }
    }
    return null
  }

  async function handleBulkTrash() {
    // Separate folders and notes
    const folders: string[] = []
    const noteIds: string[] = []
    for (const id of selectedIds) {
      const node = findNode(id, nodes)
      if (!node) continue
      if (node.type === "folder") folders.push(id)
      else noteIds.push(id)
    }

    const totalCount = folders.length + noteIds.length
    const description =
      folders.length > 0 && noteIds.length > 0
        ? `Move ${noteIds.length} note${noteIds.length !== 1 ? "s" : ""} to trash and delete ${folders.length} folder${folders.length !== 1 ? "s" : ""}?`
        : folders.length > 0
          ? `Delete ${folders.length} folder${folders.length !== 1 ? "s" : ""} and all their contents?`
          : `Move ${noteIds.length} note${noteIds.length !== 1 ? "s" : ""} to trash?`

    const confirmed = await confirmDialog({
      title: `Delete ${totalCount} item${totalCount !== 1 ? "s" : ""}`,
      description,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!confirmed) return

    // Delete folders first, then notes
    const promises: Promise<Response>[] = []
    for (const id of folders) {
      promises.push(fetch(`/api/folders/${id}`, { method: "DELETE" }))
      // Close tabs for notes inside deleted folders
      const folderNode = findNode(id, nodes)
      if (folderNode) {
        const descendantIds = collectDescendantIds(folderNode)
        for (const did of descendantIds) closeTab(did)
      }
    }
    for (const id of noteIds) {
      promises.push(fetch(`/api/notes/${id}`, { method: "DELETE" }))
      closeTab(id)
    }

    await Promise.all(promises)
    onClearSelection()
    onRefresh()
  }

  async function handleBulkMove() {
    const target = await promptDialog({
      title: `Move ${selectedIds.size} items`,
      description: "Enter folder name, or leave empty for root:",
    })
    if (target === null) return

    let parentId: string | null = null
    if (target.trim()) {
      const res = await fetch("/api/folders")
      const tree: TreeNode[] = await res.json()
      const found = findFolderByName(tree, target.trim())
      if (!found) {
        alert(`Folder "${target}" not found`)
        return
      }
      parentId = found.id
    }

    const promises: Promise<Response>[] = []
    for (const id of selectedIds) {
      const node = findNode(id, nodes)
      if (!node) continue
      const endpoint =
        node.type === "folder" ? `/api/folders/${id}` : `/api/notes/${id}`
      promises.push(
        fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "move", parentId }),
        })
      )
    }

    await Promise.all(promises)
    onClearSelection()
    onRefresh()
  }

  return (
    <div className="flex items-center gap-1 border-b border-border/60 bg-primary/5 px-2 py-1.5">
      <button
        onClick={onClearSelection}
        className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        title="Clear selection"
      >
        <XIcon className="size-3.5" />
      </button>
      <span className="flex-1 text-xs font-medium text-foreground">
        {selectedIds.size} selected
      </span>
      <button
        onClick={handleBulkMove}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        title="Move selected items"
      >
        <FolderInputIcon className="size-3.5" />
      </button>
      <button
        onClick={handleBulkTrash}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
        title="Delete selected items"
      >
        <TrashIcon className="size-3.5" />
      </button>
    </div>
  )
}

// ── Bulk context menu (shown when right-clicking with multi-selection) ──

function BulkContextMenu({
  selectedIds,
  onRefresh,
}: {
  selectedIds: Set<string>
  onRefresh: () => void
  nodes: TreeNode[]
}) {
  const { closeTab } = useTabStore()
  const { clearSelection } = React.useContext(MultiSelectContext)

  async function handleBulkTrash() {
    const confirmed = await confirmDialog({
      title: `Delete ${selectedIds.size} items`,
      description: `Move ${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} to trash?`,
      confirmLabel: "Delete",
      destructive: true,
    })
    if (!confirmed) return

    const promises: Promise<Response>[] = []
    for (const id of selectedIds) {
      // Try as note first (folders would need different handling in a full impl)
      promises.push(fetch(`/api/notes/${id}`, { method: "DELETE" }))
      closeTab(id)
    }
    await Promise.all(promises)
    clearSelection()
    onRefresh()
  }

  async function handleBulkMove() {
    const target = await promptDialog({
      title: `Move ${selectedIds.size} items`,
      description: "Enter folder name, or leave empty for root:",
    })
    if (target === null) return

    let parentId: string | null = null
    if (target.trim()) {
      const res = await fetch("/api/folders")
      const tree: TreeNode[] = await res.json()
      const found = findFolderByName(tree, target.trim())
      if (!found) {
        alert(`Folder "${target}" not found`)
        return
      }
      parentId = found.id
    }

    const promises: Promise<Response>[] = []
    for (const id of selectedIds) {
      promises.push(
        fetch(`/api/notes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "move", parentId }),
        })
      )
    }
    await Promise.all(promises)
    clearSelection()
    onRefresh()
  }

  return (
    <>
      <ContextMenuItem disabled className="text-xs font-medium text-muted-foreground">
        {selectedIds.size} items selected
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleBulkMove}>
        <FolderInputIcon className="mr-2 size-4" />
        Move to...
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleBulkTrash} variant="destructive">
        <TrashIcon className="mr-2 size-4" />
        Delete
      </ContextMenuItem>
    </>
  )
}

// ── Utility ──

function findFolderByName(
  nodes: TreeNode[],
  name: string
): TreeNode | null {
  for (const node of nodes) {
    if (node.type === "folder" && node.name.toLowerCase() === name.toLowerCase()) {
      return node
    }
    if (node.children) {
      const found = findFolderByName(node.children, name)
      if (found) return found
    }
  }
  return null
}
