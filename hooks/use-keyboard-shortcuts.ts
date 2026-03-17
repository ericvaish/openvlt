"use client"

import { useEffect } from "react"

export interface KeyboardShortcut {
  key: string
  modifiers?: ("meta" | "ctrl" | "shift" | "alt")[]
  action: () => void
  description?: string
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function matchesModifiers(
  event: KeyboardEvent,
  modifiers: ("meta" | "ctrl" | "shift" | "alt")[] = []
): boolean {
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac")

  const wantsMeta = modifiers.includes("meta") || modifiers.includes("ctrl")
  const wantsShift = modifiers.includes("shift")
  const wantsAlt = modifiers.includes("alt")

  const metaPressed = isMac ? event.metaKey : event.ctrlKey
  const shiftPressed = event.shiftKey
  const altPressed = event.altKey

  return (
    metaPressed === wantsMeta &&
    shiftPressed === wantsShift &&
    altPressed === wantsAlt
  )
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return
      if (!event.key) return

      for (const shortcut of shortcuts) {
        const keyMatch =
          event.key.toLowerCase() === shortcut.key.toLowerCase() ||
          (event.code && event.code.toLowerCase() === shortcut.key.toLowerCase())

        if (!keyMatch) continue
        if (!matchesModifiers(event, shortcut.modifiers)) continue

        // Allow Cmd+K even when typing — it opens the command palette
        const hasModifier =
          shortcut.modifiers && shortcut.modifiers.length > 0
        if (!hasModifier && isTypingTarget(event.target)) continue

        // For shortcuts with modifiers, still skip for typing targets
        // unless it's a common app-level shortcut (Cmd+K, Cmd+B, etc.)
        if (hasModifier && isTypingTarget(event.target)) {
          const isCmdOnly =
            shortcut.modifiers?.length === 1 &&
            (shortcut.modifiers[0] === "meta" ||
              shortcut.modifiers[0] === "ctrl")
          const isAppShortcut =
            isCmdOnly &&
            ["k", "b", "o", ","].includes(shortcut.key.toLowerCase())
          const isCmdShift =
            shortcut.modifiers?.includes("meta") &&
            shortcut.modifiers?.includes("shift")

          if (!isAppShortcut && !isCmdShift) continue
        }

        event.preventDefault()
        shortcut.action()
        return
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [shortcuts])
}
