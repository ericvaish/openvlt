"use client"

import * as React from "react"

const STORAGE_KEY = "openvlt:keyboard-shortcuts"

// ── Types ──────────────────────────────────────────────────────────────

type ModifierKey = "meta" | "shift" | "alt"

export interface ShortcutBinding {
  key: string
  modifiers: ModifierKey[]
}

export interface ShortcutDefinition {
  id: string
  label: string
  category: "general" | "navigation" | "editor"
  defaultBinding: ShortcutBinding
  /** Whether this shortcut fires even when the user is typing in an input/editor */
  allowInEditor: boolean
}

// ── Conflict database ──────────────────────────────────────────────────
// Maps serialized shortcut keys (e.g. "meta+k") to known conflicts.
// Used to warn users when they pick a shortcut that clashes with
// the browser, Excalidraw, or tldraw.

export interface ShortcutConflict {
  app: "browser" | "excalidraw" | "tldraw"
  action: string
  /** Whether the browser completely blocks interception */
  unoverridable?: boolean
}

export const KNOWN_CONFLICTS: Record<string, ShortcutConflict[]> = {
  // ── Browser (Mac Cmd / Windows Ctrl) ─────────────────────────────
  // These are generally impossible or inadvisable to override
  "meta+t": [{ app: "browser", action: "New Tab", unoverridable: true }],
  "meta+n": [{ app: "browser", action: "New Window", unoverridable: true }],
  "meta+w": [{ app: "browser", action: "Close Tab", unoverridable: true }],
  "meta+q": [{ app: "browser", action: "Quit Browser", unoverridable: true }],
  "meta+l": [{ app: "browser", action: "Focus Address Bar", unoverridable: true }],
  "meta+r": [{ app: "browser", action: "Reload Page", unoverridable: true }],
  "meta+shift+t": [{ app: "browser", action: "Reopen Closed Tab", unoverridable: true }],
  "meta+shift+n": [{ app: "browser", action: "New Incognito Window", unoverridable: true }],
  "meta+shift+r": [{ app: "browser", action: "Hard Reload", unoverridable: true }],
  "meta+[": [{ app: "browser", action: "Back", unoverridable: true }],
  "meta+]": [{ app: "browser", action: "Forward", unoverridable: true }],
  "meta+shift+i": [{ app: "browser", action: "Developer Tools", unoverridable: true }],
  "meta+alt+i": [{ app: "browser", action: "Developer Tools", unoverridable: true }],
  "meta+shift+j": [{ app: "browser", action: "Console", unoverridable: true }],
  "meta+,": [{ app: "browser", action: "Browser Settings", unoverridable: true }],
  "meta+h": [{ app: "browser", action: "Hide Window" }],
  "meta+m": [{ app: "browser", action: "Minimize Window" }],
  "meta+p": [{ app: "browser", action: "Print" }],
  "meta+f": [{ app: "browser", action: "Find in Page" }],
  "meta+g": [{ app: "browser", action: "Find Next" }],
  "meta+shift+g": [{ app: "browser", action: "Find Previous" }],

  // ── Excalidraw ───────────────────────────────────────────────────
  "meta+k": [{ app: "excalidraw", action: "Insert Link" }],
  "meta+a": [{ app: "excalidraw", action: "Select All" }],
  "meta+d": [{ app: "excalidraw", action: "Duplicate" }],
  "meta+z": [{ app: "excalidraw", action: "Undo" }],
  "meta+shift+z": [{ app: "excalidraw", action: "Redo" }],
  "meta+y": [{ app: "excalidraw", action: "Redo" }],
  "meta+c": [{ app: "excalidraw", action: "Copy" }],
  "meta+v": [{ app: "excalidraw", action: "Paste" }],
  "meta+x": [{ app: "excalidraw", action: "Cut" }],
  "meta+shift+e": [{ app: "excalidraw", action: "Export" }],
  "meta+shift+s": [{ app: "excalidraw", action: "Save As" }],
  "meta+shift+a": [{ app: "excalidraw", action: "Bring to Front" }],
  "meta+shift+f": [{ app: "excalidraw", action: "Send to Back" }],
  "meta+e": [{ app: "excalidraw", action: "Export Image" }],
  "meta+shift+l": [{ app: "excalidraw", action: "Toggle Lock" }],

  // ── tldraw ───────────────────────────────────────────────────────
  "meta+shift+c": [{ app: "tldraw", action: "Copy as SVG" }],
  "meta+shift+d": [{ app: "tldraw", action: "Duplicate Page" }],
  "meta+shift+k": [{ app: "tldraw", action: "Toggle Transparent" }],
  "meta+.": [{ app: "tldraw", action: "Toggle Grid" }],
  "meta+shift+p": [{ app: "tldraw", action: "Toggle Print Mode" }],
  "meta+enter": [{ app: "tldraw", action: "Edit Shape" }],
}

// Merge entries where multiple apps claim the same key
;(function mergeDuplicates() {
  // Excalidraw and tldraw share many standard shortcuts
  const shared: Record<string, ShortcutConflict> = {
    "meta+a": { app: "tldraw", action: "Select All" },
    "meta+d": { app: "tldraw", action: "Duplicate" },
    "meta+z": { app: "tldraw", action: "Undo" },
    "meta+shift+z": { app: "tldraw", action: "Redo" },
    "meta+c": { app: "tldraw", action: "Copy" },
    "meta+v": { app: "tldraw", action: "Paste" },
    "meta+x": { app: "tldraw", action: "Cut" },
    "meta+e": { app: "tldraw", action: "Export Image" },
  }
  for (const [key, conflict] of Object.entries(shared)) {
    if (KNOWN_CONFLICTS[key]) {
      KNOWN_CONFLICTS[key].push(conflict)
    } else {
      KNOWN_CONFLICTS[key] = [conflict]
    }
  }
})()

/** Check a binding against the conflict database */
export function getConflicts(binding: ShortcutBinding): ShortcutConflict[] {
  const key = bindingToString(binding)
  return KNOWN_CONFLICTS[key] ?? []
}

// ── Definitions ────────────────────────────────────────────────────────
// Default bindings are chosen to avoid browser, Excalidraw, and tldraw
// conflicts. Where a previous default conflicted, it has been remapped.

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // General
  {
    id: "toggleCommandPalette",
    label: "Command Palette",
    category: "general",
    defaultBinding: { key: "/", modifiers: ["meta"] },
    allowInEditor: true,
  },
  {
    id: "newNote",
    label: "New Note",
    category: "general",
    defaultBinding: { key: "o", modifiers: ["meta"] },
    allowInEditor: true,
  },
  {
    id: "newFolder",
    label: "New Folder",
    category: "general",
    defaultBinding: { key: "o", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "toggleSidebar",
    label: "Toggle Sidebar",
    category: "general",
    defaultBinding: { key: "b", modifiers: ["meta"] },
    allowInEditor: true,
  },
  {
    id: "openSettings",
    label: "Settings",
    category: "general",
    defaultBinding: { key: ",", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },

  // Navigation
  {
    id: "advancedSearch",
    label: "Advanced Search",
    category: "navigation",
    defaultBinding: { key: "u", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "graphView",
    label: "Graph View",
    category: "navigation",
    defaultBinding: { key: "m", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "dailyNote",
    label: "Daily Note",
    category: "navigation",
    defaultBinding: { key: "y", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "allNotes",
    label: "All Notes",
    category: "navigation",
    defaultBinding: { key: ";", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "favorites",
    label: "Favorites",
    category: "navigation",
    defaultBinding: { key: "'", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "trash",
    label: "Trash",
    category: "navigation",
    defaultBinding: { key: "x", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    category: "navigation",
    defaultBinding: { key: "b", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "closeTab",
    label: "Close Tab",
    category: "navigation",
    defaultBinding: { key: "w", modifiers: ["alt"] },
    allowInEditor: false,
  },
  {
    id: "closeSplitPane",
    label: "Close Split Pane",
    category: "navigation",
    defaultBinding: { key: "\\", modifiers: ["meta"] },
    allowInEditor: false,
  },

  // Editor
  {
    id: "save",
    label: "Save",
    category: "editor",
    defaultBinding: { key: "s", modifiers: ["meta"] },
    allowInEditor: true,
  },
  {
    id: "toggleHistory",
    label: "Version History",
    category: "editor",
    defaultBinding: { key: "h", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
  {
    id: "toggleAIChat",
    label: "AI Chat",
    category: "general",
    defaultBinding: { key: "l", modifiers: ["meta", "shift"] },
    allowInEditor: true,
  },
]

const definitionMap = new Map(SHORTCUT_DEFINITIONS.map((d) => [d.id, d]))

// ── Helpers ────────────────────────────────────────────────────────────

function isMac(): boolean {
  if (typeof navigator === "undefined") return false
  return navigator.platform?.includes("Mac") ?? false
}

const KEY_DISPLAY: Record<string, string> = {
  ",": ",",
  ".": ".",
  "/": "/",
  "\\": "\\",
  "[": "[",
  "]": "]",
  ";": ";",
  "'": "'",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  enter: "↵",
  backspace: "⌫",
  delete: "⌦",
  escape: "Esc",
  tab: "Tab",
  " ": "Space",
}

function getKeyDisplay(key: string): string {
  return KEY_DISPLAY[key.toLowerCase()] || key.toUpperCase()
}

/** Format a binding as a plain string (for tooltips, settings recording display) */
export function formatShortcut(binding: ShortcutBinding | null): string {
  if (!binding) return ""
  const mac = isMac()
  const parts: string[] = []
  const modOrder: ModifierKey[] = ["meta", "shift", "alt"]
  for (const mod of modOrder) {
    if (binding.modifiers.includes(mod)) {
      parts.push(
        mac
          ? mod === "meta"
            ? "⌘"
            : mod === "shift"
              ? "⇧"
              : "⌥"
          : mod === "meta"
            ? "Ctrl"
            : mod === "shift"
              ? "Shift"
              : "Alt"
      )
    }
  }
  parts.push(getKeyDisplay(binding.key))
  return mac ? parts.join("") : parts.join("+")
}

// ── Shortcut display component ─────────────────────────────────────────

const MAC_MODIFIER_GLYPHS: Record<ModifierKey, string> = {
  meta: "⌘",
  shift: "⇧",
  alt: "⌥",
}

/**
 * Renders a shortcut binding as uniformly-sized inline glyphs.
 * Every glyph (modifiers + key) uses the same font, size, and weight
 * so they look visually consistent. On Mac, uses SF-style symbols via
 * system-ui which renders ⌘/⇧/⌥ at native quality.
 */
export function ShortcutKeys({
  binding,
  className,
}: {
  binding: ShortcutBinding | null
  className?: string
}) {
  if (!binding) return null
  const mac = isMac()

  if (!mac) {
    return (
      <kbd className={`text-xs text-muted-foreground ${className ?? ""}`}>
        {formatShortcut(binding)}
      </kbd>
    )
  }

  const modOrder: ModifierKey[] = ["meta", "shift", "alt"]
  const parts: string[] = []
  for (const mod of modOrder) {
    if (binding.modifiers.includes(mod)) {
      parts.push(MAC_MODIFIER_GLYPHS[mod])
    }
  }
  parts.push(getKeyDisplay(binding.key))

  return (
    <kbd
      className={`inline-flex items-baseline gap-px text-muted-foreground ${className ?? ""}`}
      style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "12px", lineHeight: 1, letterSpacing: "0.5px" }}
    >
      {parts.map((glyph, i) => (
        <span key={i} style={{ fontSize: "12px", lineHeight: 1 }}>
          {glyph}
        </span>
      ))}
    </kbd>
  )
}

/** Test whether a KeyboardEvent matches a binding */
export function matchesKeyEvent(
  binding: ShortcutBinding,
  event: KeyboardEvent
): boolean {
  const keyMatch =
    event.key.toLowerCase() === binding.key.toLowerCase() ||
    (event.code && event.code.toLowerCase() === binding.key.toLowerCase())
  if (!keyMatch) return false

  const mac = isMac()
  const wantsMeta = binding.modifiers.includes("meta")
  const wantsShift = binding.modifiers.includes("shift")
  const wantsAlt = binding.modifiers.includes("alt")

  const metaPressed = mac ? event.metaKey : event.ctrlKey
  const shiftPressed = event.shiftKey
  const altPressed = event.altKey

  return (
    metaPressed === wantsMeta &&
    shiftPressed === wantsShift &&
    altPressed === wantsAlt
  )
}

/** Serialize a binding for comparison/storage */
export function bindingToString(binding: ShortcutBinding): string {
  const sorted = [...binding.modifiers].sort()
  return [...sorted, binding.key.toLowerCase()].join("+")
}

/** Parse a KeyboardEvent into a ShortcutBinding (for recording) */
export function eventToBinding(event: KeyboardEvent): ShortcutBinding | null {
  // Ignore modifier-only key presses
  if (["Meta", "Control", "Shift", "Alt"].includes(event.key)) return null

  const modifiers: ModifierKey[] = []
  const mac = isMac()
  if (mac ? event.metaKey : event.ctrlKey) modifiers.push("meta")
  if (event.shiftKey) modifiers.push("shift")
  if (event.altKey) modifiers.push("alt")

  return { key: event.key.toLowerCase(), modifiers }
}

// ── Store ──────────────────────────────────────────────────────────────

interface ShortcutsStore {
  getBinding: (actionId: string) => ShortcutBinding | null
  getDefinition: (actionId: string) => ShortcutDefinition | undefined
  setOverride: (actionId: string, binding: ShortcutBinding) => void
  resetOverride: (actionId: string) => void
  resetAll: () => void
  definitions: ShortcutDefinition[]
  overrides: Record<string, ShortcutBinding>
}

const ShortcutsContext = React.createContext<ShortcutsStore | null>(null)

function loadOverrides(): Record<string, ShortcutBinding> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

function persistOverrides(overrides: Record<string, ShortcutBinding>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

export function ShortcutsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [overrides, setOverrides] = React.useState<
    Record<string, ShortcutBinding>
  >({})
  const hydratedRef = React.useRef(false)

  React.useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      setOverrides(loadOverrides())
    }
  }, [])

  React.useEffect(() => {
    if (hydratedRef.current) {
      persistOverrides(overrides)
    }
  }, [overrides])

  const getBinding = React.useCallback(
    (actionId: string): ShortcutBinding | null => {
      if (overrides[actionId]) return overrides[actionId]
      return definitionMap.get(actionId)?.defaultBinding ?? null
    },
    [overrides]
  )

  const getDefinition = React.useCallback(
    (actionId: string) => definitionMap.get(actionId),
    []
  )

  const setOverride = React.useCallback(
    (actionId: string, binding: ShortcutBinding) => {
      setOverrides((prev) => ({ ...prev, [actionId]: binding }))
    },
    []
  )

  const resetOverride = React.useCallback((actionId: string) => {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[actionId]
      return next
    })
  }, [])

  const resetAll = React.useCallback(() => {
    setOverrides({})
  }, [])

  const store = React.useMemo<ShortcutsStore>(
    () => ({
      getBinding,
      getDefinition,
      setOverride,
      resetOverride,
      resetAll,
      definitions: SHORTCUT_DEFINITIONS,
      overrides,
    }),
    [getBinding, getDefinition, setOverride, resetOverride, resetAll, overrides]
  )

  return (
    <ShortcutsContext.Provider value={store}>
      {children}
    </ShortcutsContext.Provider>
  )
}

export function useShortcuts(): ShortcutsStore {
  const ctx = React.useContext(ShortcutsContext)
  if (!ctx)
    throw new Error("useShortcuts must be used within ShortcutsProvider")
  return ctx
}

// ── Action Hook ────────────────────────────────────────────────────────

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

/**
 * Register a keyboard shortcut for a specific action ID.
 * Uses capture-phase listeners so shortcuts fire before Excalidraw/tldraw
 * or any other embedded app can intercept them.
 */
export function useShortcutAction(
  actionId: string,
  action: () => void
): void {
  const { getBinding, getDefinition } = useShortcuts()
  const binding = getBinding(actionId)
  const def = getDefinition(actionId)
  const actionRef = React.useRef(action)
  actionRef.current = action

  React.useEffect(() => {
    if (!binding) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return
      if (!event.key) return
      if (!matchesKeyEvent(binding!, event)) return

      // Check if we should skip for typing targets
      if (isTypingTarget(event.target) && !def?.allowInEditor) return

      event.preventDefault()
      event.stopPropagation()
      actionRef.current()
    }

    // Capture phase: fires before any child component (Excalidraw, tldraw, etc.)
    // can intercept and stopPropagation on the event
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [binding, def])
}
