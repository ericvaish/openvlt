"use client"

import * as React from "react"
import {
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  BookmarkIcon,
  TableIcon,
  FolderIcon,
  ZapIcon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTabStore } from "@/lib/stores/tab-store"
import { VaultSelector } from "@/components/vault-selector"
import { CreateVaultDialog } from "@/components/create-vault-dialog"
import { CreateFolderDialog } from "@/components/create-folder-dialog"
import { SyncStatus } from "@/components/sync-status"
import { SidebarResizer } from "@/components/sidebar-resizer"
import { useShortcuts } from "@/lib/stores/shortcuts-store"
import { useSidebarData } from "@/hooks/use-sidebar-data"
import {
  type SidebarPanel,
  FilesPanel,
  SearchPanel,
  QuickAccessPanel,
  BookmarksSidebarPanel,
  DatabasePanel,
  SidebarUserFooter,
} from "@/components/sidebar-panels"

const PANEL_KEY = "openvlt:rail-active-panel"

function RailIcon({
  icon: Icon,
  id,
  tooltip,
  active,
  onClick,
}: {
  icon: React.FC<{ className?: string }>
  id: string
  tooltip: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`relative flex size-9 items-center justify-center rounded-md transition-colors ${
            active
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`}
        >
          {active && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />
          )}
          <Icon className="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

function NoVaultPlaceholder() {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        Create a vault to get started
      </p>
      {mounted && (
        <CreateVaultDialog
          trigger={
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
              <PlusIcon className="size-4" />
              Create Vault
            </button>
          }
        />
      )}
    </div>
  )
}

export function AppSidebarRail() {
  const { openTab, closeAllTabs } = useTabStore()
  const { getBinding } = useShortcuts()
  const data = useSidebarData()

  const [activePanel, setActivePanel] = React.useState<SidebarPanel>("files")

  React.useEffect(() => {
    const stored = localStorage.getItem(PANEL_KEY) as SidebarPanel | null
    if (stored) setActivePanel(stored)
  }, [])

  function switchPanel(panel: SidebarPanel) {
    setActivePanel(panel)
    localStorage.setItem(PANEL_KEY, panel)
  }

  const railItems: {
    id: SidebarPanel
    icon: React.FC<{ className?: string }>
    tooltip: string
  }[] = [
    { id: "files", icon: FolderIcon, tooltip: "Files" },
    { id: "search", icon: SearchIcon, tooltip: "Search" },
    { id: "quickAccess", icon: ZapIcon, tooltip: "Quick Access" },
    { id: "bookmarks", icon: BookmarkIcon, tooltip: "Bookmarks" },
    { id: "database", icon: TableIcon, tooltip: "Database Views" },
  ]

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <VaultSelector onVaultChange={data.handleVaultChange} />
        </SidebarHeader>

        <SidebarContent>
          {data.hasVault ? (
            <div className="flex min-h-0 flex-1">
              {/* Icon rail */}
              <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r px-1 pt-2">
                {railItems.map((item) => (
                  <RailIcon
                    key={item.id}
                    icon={item.icon}
                    id={item.id}
                    tooltip={item.tooltip}
                    active={activePanel === item.id}
                    onClick={() => switchPanel(item.id)}
                  />
                ))}
                <div className="mt-auto pb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => openTab("__settings__", "Settings")}
                        className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                      >
                        <SettingsIcon className="size-[18px]" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      Settings
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Panel area */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {activePanel === "files" && (
                  <FilesPanel data={data} />
                )}
                {activePanel === "search" && (
                  <SearchPanel />
                )}
                {activePanel === "quickAccess" && (
                  <QuickAccessPanel
                    openTab={openTab}
                    closeAllTabs={closeAllTabs}
                    getBinding={getBinding}
                  />
                )}
                {activePanel === "bookmarks" && (
                  <BookmarksSidebarPanel />
                )}
                {activePanel === "database" && (
                  <DatabasePanel
                    dbViews={data.dbViews}
                    openTab={openTab}
                    onCreateView={data.handleCreateDbView}
                  />
                )}
              </div>
            </div>
          ) : (
            <NoVaultPlaceholder />
          )}
        </SidebarContent>

        <SidebarFooter>
          <SyncStatus />
          <SidebarUserFooter user={data.user} openTab={openTab} />
        </SidebarFooter>
        <SidebarResizer />
      </Sidebar>

      <CreateFolderDialog
        open={data.folderDialogOpen}
        onOpenChange={data.setFolderDialogOpen}
        onCreated={data.handleFolderCreated}
      />
    </>
  )
}
