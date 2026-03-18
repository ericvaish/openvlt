import { idbPut, idbGet, idbGetAllByIndex, idbClear, idbDelete } from "./db"
import type { TreeNode } from "@/types"

// ── Cached Note Shape ──

export interface CachedNote {
  id: string
  title: string
  content: string
  filePath: string
  parentId: string | null
  vaultId: string
  version: number
  updatedAt: string
  isTrashed: boolean
  isFavorite: boolean
  isLocked: boolean
  noteType: string
  icon: string | null
  coverImage: string | null
  tags: string[]
  cachedAt: string
}

export interface CachedFolder {
  id: string
  name: string
  path: string
  parentId: string | null
  vaultId: string
  cachedAt: string
}

interface TreeCacheEntry {
  vaultId: string
  tree: TreeNode[]
  cachedAt: string
}

// ── Note Cache ──

export async function cacheNote(
  noteId: string,
  metadata: Record<string, unknown>,
  content: string
): Promise<void> {
  const entry: CachedNote = {
    id: noteId,
    title: (metadata.title as string) || "",
    content,
    filePath: (metadata.filePath as string) || "",
    parentId: (metadata.parentId as string | null) ?? null,
    vaultId: (metadata.vaultId as string) || "",
    version: (metadata.version as number) || 1,
    updatedAt: (metadata.updatedAt as string) || new Date().toISOString(),
    isTrashed: Boolean(metadata.isTrashed),
    isFavorite: Boolean(metadata.isFavorite),
    isLocked: Boolean(metadata.isLocked),
    noteType: (metadata.noteType as string) || "markdown",
    icon: (metadata.icon as string | null) ?? null,
    coverImage: (metadata.coverImage as string | null) ?? null,
    tags: (metadata.tags as string[]) || [],
    cachedAt: new Date().toISOString(),
  }
  await idbPut("notes", entry)
}

export async function getCachedNote(
  noteId: string
): Promise<CachedNote | undefined> {
  return idbGet<CachedNote>("notes", noteId)
}

export async function updateCachedNoteContent(
  noteId: string,
  content: string,
  version?: number
): Promise<void> {
  const existing = await getCachedNote(noteId)
  if (!existing) return
  existing.content = content
  existing.updatedAt = new Date().toISOString()
  existing.cachedAt = new Date().toISOString()
  if (version !== undefined) existing.version = version
  await idbPut("notes", existing)
}

export async function removeCachedNote(noteId: string): Promise<void> {
  await idbDelete("notes", noteId)
}

export async function getCachedNotesByVault(
  vaultId: string
): Promise<CachedNote[]> {
  return idbGetAllByIndex<CachedNote>("notes", "by-vault", vaultId)
}

// ── Folder Cache ──

export async function cacheFolder(folder: {
  id: string
  name: string
  path: string
  parentId: string | null
  vaultId: string
}): Promise<void> {
  await idbPut("folders", {
    ...folder,
    cachedAt: new Date().toISOString(),
  })
}

export async function getCachedFoldersByVault(
  vaultId: string
): Promise<CachedFolder[]> {
  return idbGetAllByIndex<CachedFolder>("folders", "by-vault", vaultId)
}

// ── Tree Cache ──

export async function cacheTree(
  vaultId: string,
  tree: TreeNode[]
): Promise<void> {
  await idbPut("tree_cache", {
    vaultId,
    tree,
    cachedAt: new Date().toISOString(),
  } as TreeCacheEntry)
}

export async function getCachedTree(
  vaultId: string
): Promise<TreeNode[] | null> {
  const entry = await idbGet<TreeCacheEntry>("tree_cache", vaultId)
  return entry?.tree ?? null
}

// ── Clear All ──

export async function clearAllCaches(): Promise<void> {
  await Promise.all([
    idbClear("notes"),
    idbClear("folders"),
    idbClear("tree_cache"),
    idbClear("mutation_queue"),
    idbClear("sync_state"),
  ])
}
