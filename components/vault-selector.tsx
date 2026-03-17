"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ChevronsUpDownIcon,
  CheckIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react"
import Image from "next/image"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { CreateVaultDialog } from "@/components/create-vault-dialog"
import { ManageVaultsDialog } from "@/components/manage-vaults-dialog"
import type { Vault } from "@/types"

interface VaultSelectorProps {
  onVaultChange?: () => void
}

export function VaultSelector({ onVaultChange }: VaultSelectorProps) {
  const router = useRouter()
  const [vaults, setVaults] = React.useState<Vault[]>([])
  const [createOpen, setCreateOpen] = React.useState(false)
  const [manageOpen, setManageOpen] = React.useState(false)

  const activeVault = vaults.find((v) => v.isActive)

  const fetchVaults = React.useCallback(async () => {
    try {
      const res = await fetch("/api/vaults")
      if (res.ok) {
        const data = await res.json()
        setVaults(data)
      }
    } catch {
      // silently fail
    }
  }, [])

  React.useEffect(() => {
    fetchVaults()
  }, [fetchVaults])

  async function handleSwitch(vaultId: string) {
    if (vaultId === activeVault?.id) return

    try {
      const res = await fetch(`/api/vaults/${vaultId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setActive" }),
      })
      if (res.ok) {
        await fetchVaults()
        onVaultChange?.()
        router.push("/notes")
      }
    } catch {
      // silently fail
    }
  }

  function handleCreated() {
    window.location.reload()
  }

  if (vaults.length === 0) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" className="cursor-default gap-3">
            <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
              <Image
                src="/logo.svg"
                alt="openvlt"
                width={32}
                height={32}
                className="size-8"
              />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-semibold">openvlt</span>
              <span className="text-sm text-muted-foreground">
                No vault selected
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" className="cursor-pointer gap-3">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                  <Image
                    src="/logo.svg"
                    alt="openvlt"
                    width={32}
                    height={32}
                    className="size-8"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-0.5 leading-none">
                  <span className="font-semibold">
                    {activeVault?.name ?? "openvlt"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {activeVault ? "Active vault" : "Select a vault"}
                  </span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="start"
              sideOffset={4}
              className="min-w-(--radix-dropdown-menu-trigger-width) bg-[#2f2f2f]! shadow-2xl ring-1 ring-white/[0.08] rounded-xl! p-1.5"
            >
              {vaults.map((vault) => (
                <DropdownMenuItem
                  key={vault.id}
                  onClick={() => handleSwitch(vault.id)}
                  className="flex items-center gap-2 py-2 px-2 rounded-lg"
                >
                  <Image
                    src="/logo.svg"
                    alt=""
                    width={16}
                    height={16}
                    className="size-4 shrink-0"
                  />
                  <span className="flex-1 truncate">{vault.name}</span>
                  {vault.isActive && (
                    <CheckIcon className="size-4 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOpen(true)} className="py-2 px-2 rounded-lg">
                <PlusIcon className="size-4 shrink-0" />
                <span>Create new vault</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setManageOpen(true)} className="py-2 px-2 rounded-lg">
                <SettingsIcon className="size-4 shrink-0" />
                <span>Manage vaults</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateVaultDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />

      <ManageVaultsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onVaultChange={onVaultChange}
      />
    </>
  )
}
