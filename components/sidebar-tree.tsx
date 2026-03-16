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
import type { TreeNode } from "@/types/note"

// ── Helpers ──

function getNoteIcon(path: string) {
  if (path.endsWith(".canvas.json")) return LayoutDashboardIcon
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
}>({ expandedIds: new Set(), toggle: () => {}, expand: () => {} })

// ── Drag-and-drop context ──

const DragContext = React.createContext<{
  draggedNode: TreeNode | null
  setDraggedNode: (n: TreeNode | null) => void
}>({ draggedNode: null, setDraggedNode: () => {} })

// ── Root ──

interface SidebarTreeProps {
  nodes: TreeNode[]
  onRefresh: () => void
}

export function SidebarTree({ nodes, onRefresh }: SidebarTreeProps) {
  const [draggedNode, setDraggedNode] = React.useState<TreeNode | null>(null)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(loadExpanded)

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
    }),
    [expandedIds]
  )

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
    <ExpandedContext.Provider value={expandedCtx}>
      <DragContext.Provider value={{ draggedNode, setDraggedNode }}>
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
            <TreeItem key={node.id} node={node} onRefresh={onRefresh} parentId={null} />
          ))}
        </SidebarMenu>
      </DragContext.Provider>
    </ExpandedContext.Provider>
  )
}

// ── Folder / Note tree item ──

function TreeItem({
  node,
  onRefresh,
  nested = false,
  parentId = null,
}: {
  node: TreeNode
  onRefresh: () => void
  nested?: boolean
  parentId?: string | null
}) {
  const router = useRouter()
  const { openTab, closeTab, activeTabId } = useTabStore()
  const [dropTarget, setDropTarget] = React.useState(false)
  const { draggedNode, setDraggedNode } = React.useContext(DragContext)
  const { expandedIds, toggle, expand } = React.useContext(ExpandedContext)

  const expanded = expandedIds.has(node.id)
  const isActive = activeTabId === node.id

  function openNote() {
    openTab(node.id, node.name)
  }

  // ── Actions ──

  async function handleCreateSiblingNote() {
    const title = prompt("Note title:")
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

  async function handleCreateSiblingFolder() {
    const name = prompt("Folder name:")
    if (!name?.trim()) return
    try {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentId }),
      })
      onRefresh()
    } catch {}
  }

  async function handleCreateNote(folderId: string) {
    const title = prompt("Note title:")
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
    const title = prompt("Drawing name:", "Untitled")
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
    const title = prompt("Canvas name:", "Untitled Canvas")
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

  async function handleCreateSubfolder(parentId: string) {
    const name = prompt("Folder name:")
    if (!name?.trim()) return
    try {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parentId }),
      })
      expand(node.id)
      onRefresh()
    } catch {}
  }

  async function handleDelete() {
    if (node.type === "folder") {
      if (!confirm(`Delete folder "${node.name}" and all its contents?`))
        return
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
      await fetch(`/api/notes/${node.id}`, { method: "DELETE" })
      closeTab(node.id)
    }
    onRefresh()
  }

  async function handleRename() {
    const newName = prompt(`Rename "${node.name}" to:`, node.name)
    if (!newName?.trim() || newName.trim() === node.name) return
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

  function handleMoveToPrompt() {
    const target = prompt(
      "Move to folder (enter folder name, or leave empty for root):"
    )
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
        New drawing
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
      <ContextMenuItem onClick={handleDelete} className="text-destructive">
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
      <ContextMenuItem onClick={handleDelete} className="text-destructive">
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

  const dropClass = dropTarget ? "ring-2 ring-primary/50 rounded-md" : ""

  // ── Shared: wrapper + button based on nesting ──

  const Wrapper = nested ? React.Fragment : SidebarMenuItem
  const Btn = nested ? SidebarMenuSubButton : SidebarMenuButton
  const NoteIcon = node.type === "file" ? getNoteIcon(node.path) : FileTextIcon

  // ── Folder rendering ──

  if (node.type === "folder") {
    const folderContent = (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Btn
              onClick={() => toggle(node.id)}
              className={dropClass}
              {...dragProps}
              {...dropProps}
            >
              <ChevronRightIcon
                className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              />
              {expanded ? (
                <FolderOpenIcon className="size-4 shrink-0" />
              ) : (
                <FolderIcon className="size-4 shrink-0" />
              )}
              <span>{node.name}</span>
            </Btn>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {folderContextMenu}
          </ContextMenuContent>
        </ContextMenu>

        {expanded && node.children && node.children.length > 0 && (
          <SidebarMenuSub>
            {node.children.map((child) => (
              <SidebarMenuSubItem key={child.id}>
                {child.type === "attachment" ? (
                  <AttachmentItem node={child} onRefresh={onRefresh} />
                ) : (
                  <TreeItem node={child} onRefresh={onRefresh} nested parentId={node.id} />
                )}
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        )}
      </>
    )

    return <Wrapper>{folderContent}</Wrapper>
  }

  // ── Note with children (advanced mode) ──

  const hasChildren = node.children && node.children.length > 0

  if (hasChildren) {
    const noteContent = (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Btn
              isActive={isActive}
              onClick={() => {
                openNote()
                toggle(node.id)
              }}
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
            {noteContextMenu}
          </ContextMenuContent>
        </ContextMenu>

        {expanded && (
          <SidebarMenuSub>
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

    return <Wrapper>{noteContent}</Wrapper>
  }

  // ── Simple note (no children) ──

  const simpleContent = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Btn
          isActive={isActive}
          onClick={() => openNote()}
          {...dragProps}
        >
          <NoteIcon className="size-4 shrink-0" />
          <span>{node.name}</span>
        </Btn>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {noteContextMenu}
      </ContextMenuContent>
    </ContextMenu>
  )

  return <Wrapper>{simpleContent}</Wrapper>
}

// ── Attachment sub-item (advanced mode) ──

function AttachmentItem({
  node,
  onRefresh,
}: {
  node: TreeNode
  onRefresh: () => void
}) {
  const Icon = getAttachmentIcon(node.mimeType)
  const url = `/api/attachments/${node.id}`

  async function handleDelete() {
    if (!confirm(`Delete "${node.name}"?`)) return
    await fetch(url, { method: "DELETE" })
    onRefresh()
  }

  function handleView() {
    window.open(url, "_blank")
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
                className="text-destructive"
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
        <ContextMenuItem onClick={handleDelete} className="text-destructive">
          <TrashIcon className="mr-2 size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
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
