const DB_NAME = "openvlt-offline"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

export function getOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      // Notes with full content
      if (!db.objectStoreNames.contains("notes")) {
        const notes = db.createObjectStore("notes", { keyPath: "id" })
        notes.createIndex("by-vault", "vaultId", { unique: false })
        notes.createIndex("by-parent", "parentId", { unique: false })
        notes.createIndex("by-updated", "updatedAt", { unique: false })
      }

      // Folders
      if (!db.objectStoreNames.contains("folders")) {
        const folders = db.createObjectStore("folders", { keyPath: "id" })
        folders.createIndex("by-vault", "vaultId", { unique: false })
        folders.createIndex("by-parent", "parentId", { unique: false })
      }

      // Tree cache (one entry per vault)
      if (!db.objectStoreNames.contains("tree_cache")) {
        db.createObjectStore("tree_cache", { keyPath: "vaultId" })
      }

      // Offline mutation queue
      if (!db.objectStoreNames.contains("mutation_queue")) {
        const queue = db.createObjectStore("mutation_queue", {
          keyPath: "id",
          autoIncrement: true,
        })
        queue.createIndex("by-status", "status", { unique: false })
        queue.createIndex("by-created", "createdAt", { unique: false })
      }

      // Key-value store for sync state
      if (!db.objectStoreNames.contains("sync_state")) {
        db.createObjectStore("sync_state", { keyPath: "key" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })

  return dbPromise
}

// Generic helpers

export async function idbGet<T>(
  storeName: string,
  key: IDBValidKey
): Promise<T | undefined> {
  const db = await getOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await getOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    tx.objectStore(storeName).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDelete(
  storeName: string,
  key: IDBValidKey
): Promise<void> {
  const db = await getOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await getOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

export async function idbGetAllByIndex<T>(
  storeName: string,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  const db = await getOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const req = tx.objectStore(storeName).index(indexName).getAll(key)
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

export async function idbClear(storeName: string): Promise<void> {
  const db = await getOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbCount(storeName: string): Promise<number> {
  const db = await getOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const req = tx.objectStore(storeName).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
