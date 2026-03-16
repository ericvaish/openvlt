"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  FileTextIcon,
  FilePlusIcon,
  FolderPlusIcon,
  PlusIcon,
  InfoIcon,
  StarIcon,
  TrashIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  LogOutIcon,
  ChevronsUpDownIcon,
  CalendarIcon,
  BookmarkIcon,
  PenLineIcon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SidebarTree } from "@/components/sidebar-tree"
import { useTabStore } from "@/lib/stores/tab-store"
import { VaultSelector } from "@/components/vault-selector"
import { useFsWatch } from "@/hooks/use-fs-watch"
import { BookmarksPanel } from "@/components/bookmarks-panel"
import { CreateVaultDialog } from "@/components/create-vault-dialog"
import type { TreeNode } from "@/types/note"

const quickAccessItems = [
  { title: "All Notes", icon: FileTextIcon, filter: "all" },
  { title: "Favorites", icon: StarIcon, filter: "favorites" },
  { title: "Trash", icon: TrashIcon, filter: "trash" },
]

async function openDailyNote(openTab: (id: string, title: string) => void) {
  try {
    const res = await fetch("/api/notes/daily")
    if (res.ok) {
      const note = await res.json()
      openTab(note.id, note.title)
      window.dispatchEvent(new Event("openvlt:tree-refresh"))
    }
  } catch {
    // silently fail
  }
}

export function AppSidebar() {
  const router = useRouter()
  const { openTab } = useTabStore()
  useFsWatch()
  const [tree, setTree] = React.useState<TreeNode[]>([])
  const [hasVault, setHasVault] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [user, setUser] = React.useState<{
    username: string
    displayName: string
  } | null>(null)

  React.useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => {})
  }, [])
  const [advancedMode, setAdvancedMode] = React.useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("openvlt:sidebar-mode") === "advanced"
  })

  // Use a ref so fetchTree always reads the latest mode without re-creating
  const advancedModeRef = React.useRef(advancedMode)
  advancedModeRef.current = advancedMode

  const fetchTree = React.useCallback(async (advanced?: boolean) => {
    const mode = advanced ?? advancedModeRef.current
    try {
      const url = mode ? "/api/folders?mode=advanced" : "/api/folders"
      const res = await fetch(url)
      if (res.ok) {
        setHasVault(true)
        const data = await res.json()
        setTree(data)
      } else if (res.status === 400) {
        // No active vault
        setHasVault(false)
        setTree([])
      }
    } catch {
      // silently fail
    }
  }, [])

  function handleModeChange(value: string) {
    const isAdvanced = value === "advanced"
    setAdvancedMode(isAdvanced)
    localStorage.setItem(
      "openvlt:sidebar-mode",
      isAdvanced ? "advanced" : "simple"
    )
    fetchTree(isAdvanced)
  }

  // Listen for tree refresh events from other components
  React.useEffect(() => {
    const handler = () => fetchTree()
    window.addEventListener("openvlt:tree-refresh", handler)
    return () => window.removeEventListener("openvlt:tree-refresh", handler)
  }, [fetchTree])

  // Check vault status on mount
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
          }
        }
      } catch {
        // silently fail
      }
    }
    checkVault()
  }, [fetchTree])

  function handleVaultChange() {
    setHasVault(true)
    fetchTree()
    router.push("/notes")
  }

  async function handleCreateNote() {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {
      // silently fail
    }
  }

  async function handleCreateCanvas() {
    if (!hasVault) return
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Canvas", noteType: "canvas" }),
      })
      if (res.ok) {
        const note = await res.json()
        openTab(note.id, note.title)
        fetchTree()
      }
    } catch {
      // silently fail
    }
  }

  async function handleCreateFolder() {
    if (!hasVault) return
    const name = prompt("Folder name:")
    if (!name?.trim()) return

    try {
      await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      fetchTree()
    } catch {
      // silently fail
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/notes?search=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <VaultSelector onVaultChange={handleVaultChange} />
        <form onSubmit={handleSearch}>
          <div className="relative">
            <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-8 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
        </form>
      </SidebarHeader>

      <SidebarContent>
        {hasVault ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Quick Access</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={() => openDailyNote(openTab)}>
                      <CalendarIcon className="size-4" />
                      <span>Daily Note</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {quickAccessItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() =>
                          openTab(`__${item.filter}__`, item.title)
                        }
                      >
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>
                <BookmarkIcon className="mr-1 size-3.5" />
                Bookmarks
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <BookmarksPanel />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator />

            <ContextMenu>
              <ContextMenuTrigger asChild>
                <SidebarGroup className="flex-1">
                  <SidebarGroupLabel className="pr-1">
                    Files
                    <span className="ml-auto flex items-center gap-0.5">
                      <button
                        onClick={handleCreateNote}
                        title="New Note"
                        className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                      <button
                        onClick={handleCreateCanvas}
                        title="New Canvas"
                        className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        <PenLineIcon className="size-3.5" />
                      </button>
                      <button
                        onClick={handleCreateFolder}
                        title="New Folder"
                        className="inline-flex size-5 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      >
                        <FolderPlusIcon className="size-3.5" />
                      </button>
                    </span>
                  </SidebarGroupLabel>
                  <div className="flex items-center gap-1.5 px-2 pb-2">
                    <Tabs
                      value={advancedMode ? "advanced" : "simple"}
                      onValueChange={handleModeChange}
                      className="flex-1"
                    >
                      <TabsList className="h-7 w-full rounded-full p-1">
                        <TabsTrigger
                          value="simple"
                          className="h-full rounded-full text-xs"
                        >
                          Simple
                        </TabsTrigger>
                        <TabsTrigger
                          value="advanced"
                          className="h-full rounded-full text-xs"
                        >
                          Advanced
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <button
                      onClick={() => router.push("/docs")}
                      title="How view modes work"
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <InfoIcon className="size-3.5" />
                    </button>
                  </div>
                  <SidebarGroupContent>
                    <SidebarTree nodes={tree} onRefresh={fetchTree} />
                  </SidebarGroupContent>
                </SidebarGroup>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-48">
                <ContextMenuItem onClick={handleCreateNote}>
                  <FilePlusIcon className="mr-2 size-4" />
                  New Note
                </ContextMenuItem>
                <ContextMenuItem onClick={handleCreateCanvas}>
                  <PenLineIcon className="mr-2 size-4" />
                  New Canvas
                </ContextMenuItem>
                <ContextMenuItem onClick={handleCreateFolder}>
                  <FolderPlusIcon className="mr-2 size-4" />
                  New Folder
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Create a vault to get started
            </p>
            <CreateVaultDialog
              trigger={
                <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                  <PlusIcon className="size-4" />
                  Create Vault
                </button>
              }
            />
          </div>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="cursor-pointer gap-3"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserIcon className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-sm font-medium">
                      {user?.displayName || user?.username || "Account"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      @{user?.username || "..."}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                className="w-[--radix-dropdown-menu-trigger-width]"
              >
                <DropdownMenuItem
                  onClick={() => openTab("__settings__", "Settings")}
                >
                  <SettingsIcon className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" })
                    router.push("/login")
                  }}
                >
                  <LogOutIcon className="mr-2 size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
