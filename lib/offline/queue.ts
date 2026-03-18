import { idbPut, idbGetAll, idbDelete, idbCount } from "./db"

export interface QueuedMutation {
  id?: number // auto-incremented
  type:
    | "create"
    | "update"
    | "delete"
    | "move"
    | "rename"
    | "trash"
    | "restore"
    | "favorite"
  entityType: "note" | "folder"
  entityId: string
  method: string
  url: string
  payload: Record<string, unknown> | null
  createdAt: string
  retryCount: number
  status: "pending" | "in_flight" | "failed"
}

export async function enqueue(
  mutation: Omit<QueuedMutation, "id" | "createdAt" | "retryCount" | "status">
): Promise<void> {
  await idbPut("mutation_queue", {
    ...mutation,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: "pending",
  } as QueuedMutation)
}

export async function getQueue(): Promise<QueuedMutation[]> {
  const all = await idbGetAll<QueuedMutation>("mutation_queue")
  return all.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

export async function getPendingQueue(): Promise<QueuedMutation[]> {
  const all = await getQueue()
  return all.filter((m) => m.status === "pending" || m.status === "failed")
}

export async function getQueueLength(): Promise<number> {
  return idbCount("mutation_queue")
}

export async function markInFlight(id: number): Promise<void> {
  const all = await idbGetAll<QueuedMutation>("mutation_queue")
  const item = all.find((m) => m.id === id)
  if (item) {
    item.status = "in_flight"
    await idbPut("mutation_queue", item)
  }
}

export async function markFailed(id: number): Promise<void> {
  const all = await idbGetAll<QueuedMutation>("mutation_queue")
  const item = all.find((m) => m.id === id)
  if (item) {
    item.status = "failed"
    item.retryCount += 1
    await idbPut("mutation_queue", item)
  }
}

export async function removeMutation(id: number): Promise<void> {
  await idbDelete("mutation_queue", id)
}

export async function clearQueue(): Promise<void> {
  const all = await idbGetAll<QueuedMutation>("mutation_queue")
  for (const item of all) {
    if (item.id !== undefined) await idbDelete("mutation_queue", item.id)
  }
}
