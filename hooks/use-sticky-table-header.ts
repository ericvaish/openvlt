"use client"

import { useCallback, useSyncExternalStore } from "react"

const STORAGE_KEY = "openvlt:sticky-table-header"

let listeners: (() => void)[] = []

function emitChange() {
  for (const listener of listeners) listener()
}

function read(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(STORAGE_KEY) === "true"
  } catch {}
  return false
}

let snapshot = read()

function getSnapshot() {
  return snapshot
}

function getServerSnapshot() {
  return false
}

function subscribe(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export function useStickyTableHeader() {
  const enabled = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  const setEnabled = useCallback((value: boolean) => {
    localStorage.setItem(STORAGE_KEY, String(value))
    snapshot = value
    emitChange()
  }, [])

  return { enabled, setEnabled }
}
