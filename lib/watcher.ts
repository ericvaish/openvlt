import { watch, type FSWatcher } from "chokidar"
import { getDb } from "@/lib/db"
import { reconcileVault } from "@/lib/sync/reconcile"

type ChangeListener = (vaultId: string) => void

let watcher: FSWatcher | null = null
const listeners = new Set<ChangeListener>()
const watchedVaults = new Map<string, string>() // vaultPath -> vaultId
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingVaultIds = new Set<string>()

export function onVaultChange(listener: ChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyListeners(vaultId: string) {
  for (const listener of listeners) {
    listener(vaultId)
  }
}

function handleChange(filePath: string) {
  // Find which vault this file belongs to
  let matchedVaultId: string | null = null
  for (const [vaultPath, vaultId] of watchedVaults) {
    if (filePath.startsWith(vaultPath)) {
      matchedVaultId = vaultId
      break
    }
  }
  if (!matchedVaultId) return

  // Debounce: batch rapid changes (e.g. deleting a folder with many files)
  pendingVaultIds.add(matchedVaultId)
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const vaultIds = [...pendingVaultIds]
    pendingVaultIds = new Set()
    for (const vaultId of vaultIds) {
      try {
        reconcileVault(vaultId, true)
        notifyListeners(vaultId)
      } catch (err) {
        console.error(`[watcher] reconcile error for vault ${vaultId}:`, err)
      }
    }
  }, 500)
}

export function watchVault(vaultId: string, vaultPath: string): void {
  if (watchedVaults.has(vaultPath)) return

  watchedVaults.set(vaultPath, vaultId)

  if (!watcher) {
    watcher = watch([], {
      ignoreInitial: true,
      // Ignore dotfiles/directories and common noise
      ignored: [/(^|[/\\])\../, /node_modules/],
      persistent: true,
      // Small delay to let bulk operations settle
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    })

    watcher.on("add", handleChange)
    watcher.on("unlink", handleChange)
    watcher.on("unlinkDir", handleChange)
    watcher.on("addDir", handleChange)
    watcher.on("change", handleChange)
  }

  watcher.add(vaultPath)
}

export function unwatchVault(vaultPath: string): void {
  if (!watcher || !watchedVaults.has(vaultPath)) return
  watcher.unwatch(vaultPath)
  watchedVaults.delete(vaultPath)
}

/** Start watching all vaults for all users */
export function startWatchingAllVaults(): void {
  const db = getDb()
  const vaults = db
    .prepare("SELECT id, path FROM vaults")
    .all() as { id: string; path: string }[]

  for (const vault of vaults) {
    watchVault(vault.id, vault.path)
  }
}
