import type { ChatStreamEvent } from "./service"

export interface ActiveGeneration {
  conversationId: string
  userId: string
  assistantMessageId: string
  events: ChatStreamEvent[]
  done: boolean
  error?: string
  listeners: Set<(event: ChatStreamEvent) => void>
  startedAt: number
}

const generations = new Map<string, ActiveGeneration>()

// Cleanup stale generations every 30 seconds
let cleanupTimer: ReturnType<typeof setInterval> | null = null

function ensureCleanupTimer() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(cleanupStaleGenerations, 30_000)
  // Don't block Node.js exit
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref()
  }
}

export function startGeneration(
  conversationId: string,
  userId: string,
  assistantMessageId: string
): ActiveGeneration {
  const gen: ActiveGeneration = {
    conversationId,
    userId,
    assistantMessageId,
    events: [],
    done: false,
    listeners: new Set(),
    startedAt: Date.now(),
  }
  generations.set(conversationId, gen)
  ensureCleanupTimer()
  return gen
}

export function getGeneration(
  conversationId: string
): ActiveGeneration | undefined {
  return generations.get(conversationId)
}

export function addListener(
  conversationId: string,
  listener: (event: ChatStreamEvent) => void
): () => void {
  const gen = generations.get(conversationId)
  if (!gen) return () => {}

  gen.listeners.add(listener)
  return () => {
    gen.listeners.delete(listener)
  }
}

export function emitEvent(
  conversationId: string,
  event: ChatStreamEvent
): void {
  const gen = generations.get(conversationId)
  if (!gen) return

  gen.events.push(event)

  for (const listener of gen.listeners) {
    try {
      listener(event)
    } catch {
      // listener errored (stream closed), remove it
      gen.listeners.delete(listener)
    }
  }
}

export function completeGeneration(conversationId: string): void {
  const gen = generations.get(conversationId)
  if (!gen) return

  gen.done = true

  // Remove from map after 60 seconds (gives reconnecting clients time to catch up)
  setTimeout(() => {
    const g = generations.get(conversationId)
    if (g) {
      g.listeners.clear()
      g.events.length = 0
    }
    generations.delete(conversationId)
  }, 60_000)
}

export function failGeneration(
  conversationId: string,
  error: string
): void {
  const gen = generations.get(conversationId)
  if (!gen) return

  gen.done = true
  gen.error = error

  setTimeout(() => {
    const g = generations.get(conversationId)
    if (g) {
      g.listeners.clear()
      g.events.length = 0
    }
    generations.delete(conversationId)
  }, 60_000)
}

function cleanupStaleGenerations(): void {
  const now = Date.now()
  const maxAge = 5 * 60 * 1000 // 5 minutes for done generations

  for (const [id, gen] of generations) {
    if (gen.done && now - gen.startedAt > maxAge) {
      generations.delete(id)
    }
  }

  // Stop timer if no generations to track
  if (generations.size === 0 && cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
}
