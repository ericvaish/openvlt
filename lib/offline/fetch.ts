import { enqueue } from "./queue"
import {
  cacheNote,
  getCachedNote,
  updateCachedNoteContent,
  cacheTree,
  getCachedTree,
} from "./cache"

/**
 * Offline-aware fetch wrapper.
 *
 * For GET requests: tries network first, caches successful responses in
 * IndexedDB, falls back to IndexedDB cache when offline.
 *
 * For mutation requests (POST/PUT/DELETE): if offline, queues the mutation
 * in IndexedDB and returns an optimistic response. If online, sends
 * normally and caches the result.
 */
export async function offlineFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const method = options?.method?.toUpperCase() || "GET"
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true

  // ── GET requests ──
  if (method === "GET") {
    if (isOnline) {
      try {
        const res = await fetch(url, options)
        if (res.ok) {
          // Cache note content in IndexedDB for offline access
          await cacheGetResponse(url, res.clone())
        }
        return res
      } catch {
        // Network error, fall through to cache
      }
    }

    // Offline or network error: try IndexedDB cache
    const cached = await getCachedGetResponse(url)
    if (cached) return cached

    // No cache available
    return new Response(
      JSON.stringify({ error: "You are offline and this content is not cached" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── Mutation requests (POST/PUT/DELETE) ──
  if (isOnline) {
    try {
      const res = await fetch(url, options)
      if (res.ok) {
        await cacheMutationResponse(url, method, options, res.clone())
      }
      return res
    } catch {
      // Network error during mutation, queue it
    }
  }

  // Offline: queue the mutation
  const payload = options?.body ? JSON.parse(options.body as string) : null
  const { entityType, entityId, type } = parseMutationInfo(url, method, payload)

  await enqueue({
    type,
    entityType,
    entityId,
    method,
    url,
    payload,
  })

  // Apply optimistic update to IndexedDB
  await applyOptimisticUpdate(url, method, payload, entityId)

  // Return a synthetic success response
  return new Response(
    JSON.stringify({ queued: true, offline: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  )
}

// ── Cache helpers ──

async function cacheGetResponse(url: string, response: Response): Promise<void> {
  try {
    const parsedUrl = new URL(url, window.location.origin)

    // Cache individual note content
    const noteMatch = parsedUrl.pathname.match(/^\/api\/notes\/([^/]+)$/)
    if (noteMatch && !parsedUrl.searchParams.has("action")) {
      const data = await response.json()
      if (data.metadata && data.content !== undefined) {
        await cacheNote(data.metadata.id, data.metadata, data.content)
      }
      return
    }

    // Cache folder tree
    if (parsedUrl.pathname === "/api/folders" && parsedUrl.searchParams.has("vaultId")) {
      const vaultId = parsedUrl.searchParams.get("vaultId")!
      const data = await response.json()
      if (data.tree) {
        await cacheTree(vaultId, data.tree)
      }
    }
  } catch {
    // Caching failure should not block the response
  }
}

async function getCachedGetResponse(url: string): Promise<Response | null> {
  try {
    const parsedUrl = new URL(url, window.location.origin)

    // Serve cached note
    const noteMatch = parsedUrl.pathname.match(/^\/api\/notes\/([^/]+)$/)
    if (noteMatch) {
      const noteId = noteMatch[1]
      const cached = await getCachedNote(noteId)
      if (cached) {
        return new Response(
          JSON.stringify({
            metadata: {
              id: cached.id,
              title: cached.title,
              filePath: cached.filePath,
              parentId: cached.parentId,
              vaultId: cached.vaultId,
              version: cached.version,
              updatedAt: cached.updatedAt,
              isTrashed: cached.isTrashed,
              isFavorite: cached.isFavorite,
              isLocked: cached.isLocked,
              noteType: cached.noteType,
              icon: cached.icon,
              coverImage: cached.coverImage,
              tags: cached.tags,
              createdAt: cached.updatedAt,
              aliases: [],
            },
            content: cached.content,
            _offline: true,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }
    }

    // Serve cached tree
    if (parsedUrl.pathname === "/api/folders" && parsedUrl.searchParams.has("vaultId")) {
      const vaultId = parsedUrl.searchParams.get("vaultId")!
      const tree = await getCachedTree(vaultId)
      if (tree) {
        return new Response(
          JSON.stringify({ tree, _offline: true }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }
    }
  } catch {
    // Cache read failure
  }

  return null
}

async function cacheMutationResponse(
  _url: string,
  _method: string,
  _options: RequestInit | undefined,
  _response: Response
): Promise<void> {
  // After a successful save, update the IndexedDB cache
  try {
    const parsedUrl = new URL(_url, window.location.origin)
    const noteMatch = parsedUrl.pathname.match(/^\/api\/notes\/([^/]+)$/)
    if (noteMatch && _method === "PUT") {
      const data = await _response.json()
      if (data.version !== undefined && _options?.body) {
        const payload = JSON.parse(_options.body as string)
        if (payload.content !== undefined) {
          await updateCachedNoteContent(noteMatch[1], payload.content, data.version)
        }
      }
    }
  } catch {}
}

function parseMutationInfo(
  url: string,
  method: string,
  payload: Record<string, unknown> | null
): {
  entityType: "note" | "folder"
  entityId: string
  type: "create" | "update" | "delete" | "move" | "rename" | "trash" | "restore" | "favorite"
} {
  const parsedUrl = new URL(url, window.location.origin)
  const isFolder = parsedUrl.pathname.includes("/api/folders")
  const entityType = isFolder ? "folder" : "note"

  const idMatch = parsedUrl.pathname.match(
    /\/api\/(notes|folders)\/([^/]+)/
  )
  const entityId = idMatch?.[2] || payload?.id as string || "unknown"

  let type: "create" | "update" | "delete" | "move" | "rename" | "trash" | "restore" | "favorite" = "update"
  if (method === "POST") type = "create"
  else if (method === "DELETE") type = "delete"
  else if (method === "PUT") {
    const action = payload?.action as string | undefined
    if (action === "move") type = "move"
    else if (action === "restore") type = "restore"
    else if (action === "toggleFavorite") type = "favorite"
    else type = "update"
  }

  return { entityType, entityId, type }
}

async function applyOptimisticUpdate(
  url: string,
  method: string,
  payload: Record<string, unknown> | null,
  _entityId: string
): Promise<void> {
  try {
    const parsedUrl = new URL(url, window.location.origin)
    const noteMatch = parsedUrl.pathname.match(/^\/api\/notes\/([^/]+)$/)

    if (noteMatch && method === "PUT" && payload?.content !== undefined) {
      await updateCachedNoteContent(
        noteMatch[1],
        payload.content as string
      )
    }
  } catch {}
}
