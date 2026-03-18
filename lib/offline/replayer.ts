import {
  getPendingQueue,
  markInFlight,
  markFailed,
  removeMutation,
  type QueuedMutation,
} from "./queue"

const MAX_RETRIES = 3

export type ReplayResult = {
  total: number
  succeeded: number
  failed: number
  conflicts: number
}

let isReplaying = false

export function getIsReplaying(): boolean {
  return isReplaying
}

export async function replayQueue(
  onProgress?: (result: Partial<ReplayResult>) => void
): Promise<ReplayResult> {
  if (isReplaying) return { total: 0, succeeded: 0, failed: 0, conflicts: 0 }

  isReplaying = true
  const result: ReplayResult = { total: 0, succeeded: 0, failed: 0, conflicts: 0 }

  try {
    const queue = await getPendingQueue()
    result.total = queue.length

    for (const mutation of queue) {
      if (mutation.id === undefined) continue
      if (mutation.retryCount >= MAX_RETRIES) {
        await removeMutation(mutation.id)
        result.failed++
        continue
      }

      await markInFlight(mutation.id)

      try {
        const res = await replayMutation(mutation)

        if (res.ok) {
          await removeMutation(mutation.id)
          result.succeeded++
        } else if (res.status === 409) {
          // Conflict: remove from queue, user needs to resolve manually
          await removeMutation(mutation.id)
          result.conflicts++
        } else if (res.status >= 400 && res.status < 500) {
          // Client error (e.g., 404 note deleted): discard
          await removeMutation(mutation.id)
          result.failed++
        } else {
          // Server error: retry later
          await markFailed(mutation.id)
          result.failed++
        }
      } catch {
        // Network error: stop replaying, we're likely offline again
        await markFailed(mutation.id)
        result.failed++
        break
      }

      onProgress?.(result)
    }
  } finally {
    isReplaying = false
  }

  // Trigger tree refresh after replay
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("openvlt:tree-refresh"))
  }

  return result
}

async function replayMutation(mutation: QueuedMutation): Promise<Response> {
  const options: RequestInit = {
    method: mutation.method,
    headers: { "Content-Type": "application/json" },
  }

  if (mutation.payload && mutation.method !== "GET" && mutation.method !== "DELETE") {
    options.body = JSON.stringify(mutation.payload)
  }

  return fetch(mutation.url, options)
}
