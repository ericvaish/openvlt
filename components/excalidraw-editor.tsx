"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import dynamic from "next/dynamic"
import { FileTextIcon } from "lucide-react"
import { ExcalidrawMdEmbed } from "@/components/excalidraw-md-embed"
import { ExcalidrawEmbedPicker } from "@/components/excalidraw-embed-picker"
import "@excalidraw/excalidraw/index.css"

const ExcalidrawComponent = dynamic(
  () => import("@excalidraw/excalidraw").then((mod) => mod.Excalidraw),
  { ssr: false, loading: () => <ExcalidrawSkeleton /> },
)

// Lazy module loader — only triggers on first call, avoids SSR issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _excalidrawMod: Promise<any> | null = null
function getExcalidrawModule() {
  if (!_excalidrawMod) {
    _excalidrawMod = import("@excalidraw/excalidraw")
  }
  return _excalidrawMod
}

async function getSyncInvalidIndices() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await getExcalidrawModule()
  return mod.syncInvalidIndices as
    | ((elements: unknown[]) => unknown[])
    | undefined
}

async function getConvertToExcalidrawElements() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await getExcalidrawModule()
  return mod.convertToExcalidrawElements as (elements: unknown[]) => unknown[]
}

const OPENVLT_EMBED_PREFIX = "openvlt://embed/"
const VIEWPORT_STORAGE_PREFIX = "openvlt:excalidraw-viewport:"

interface ViewportState {
  scrollX: number
  scrollY: number
  zoom: number
}

function loadViewportLocal(noteId: string): ViewportState | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_STORAGE_PREFIX + noteId)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveViewportLocal(noteId: string, state: ViewportState) {
  try {
    localStorage.setItem(
      VIEWPORT_STORAGE_PREFIX + noteId,
      JSON.stringify(state)
    )
  } catch {
    // storage full
  }
}

async function loadViewportServer(noteId: string): Promise<ViewportState | null> {
  try {
    const res = await fetch(`/api/notes/${noteId}/view-state`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data.scrollX !== "number") return null
    return data
  } catch {
    return null
  }
}

let _saveServerTimeout: ReturnType<typeof setTimeout> | null = null

function saveViewportServer(noteId: string, state: ViewportState) {
  if (_saveServerTimeout) clearTimeout(_saveServerTimeout)
  _saveServerTimeout = setTimeout(() => {
    fetch(`/api/notes/${noteId}/view-state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).catch(() => {})
  }, 2000)
}

function parseEmbedLink(link: string): {
  noteId: string
  anchor: string
  noteTitle?: string
} | null {
  if (!link.startsWith(OPENVLT_EMBED_PREFIX)) return null
  const rest = link.slice(OPENVLT_EMBED_PREFIX.length)
  const hashIdx = rest.indexOf("#")
  if (hashIdx === -1) {
    return { noteId: rest, anchor: "" }
  }
  return {
    noteId: rest.slice(0, hashIdx),
    anchor: rest.slice(hashIdx + 1),
  }
}

function ExcalidrawSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  )
}

interface ExcalidrawEditorProps {
  noteId: string
  initialData: string // JSON string of the .excalidraw.json content
}

export function ExcalidrawEditor({ noteId, initialData }: ExcalidrawEditorProps) {
  const { resolvedTheme } = useTheme()
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = React.useRef<any>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  // Listen for embed trigger from header bar
  React.useEffect(() => {
    const handler = () => setPickerOpen(true)
    window.addEventListener("openvlt:excalidraw-embed", handler)
    return () => window.removeEventListener("openvlt:excalidraw-embed", handler)
  }, [])

  // Listen for external updates (e.g. AI agent updating this note via JSON)
  React.useEffect(() => {
    async function handleExternalUpdate(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.noteId !== noteId) return
      const api = apiRef.current
      if (!api) return

      try {
        const res = await fetch(`/api/notes/${noteId}`)
        if (!res.ok) return
        const data = await res.json()
        const parsed = JSON.parse(data.content)
        let elements = parsed.elements || []

        const syncInvalidIndices = await getSyncInvalidIndices()
        if (syncInvalidIndices) {
          elements = syncInvalidIndices(elements)
        }

        api.updateScene({ elements })
        lastSavedHashRef.current = null
      } catch {
        // ignore
      }
    }
    window.addEventListener("openvlt:note-content-updated", handleExternalUpdate)
    return () => window.removeEventListener("openvlt:note-content-updated", handleExternalUpdate)
  }, [noteId])

  // Listen for skeleton element additions from AI draw_excalidraw tool
  React.useEffect(() => {
    async function handleSkeletonElements(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.noteId !== noteId || !detail?.skeletonElements) return
      const api = apiRef.current
      if (!api) return

      try {
        const excalidrawMod = await getExcalidrawModule()
        const convertToExcalidrawElements =
          excalidrawMod.convertToExcalidrawElements
        if (!convertToExcalidrawElements) return

        // Convert skeleton elements with regenerateIds: false so that
        // arrow start/end bindings can reference shape IDs defined in
        // the same skeleton batch (e.g. start: {id: "elem_1"}).
        const newElements = convertToExcalidrawElements(
          detail.skeletonElements,
          { regenerateIds: false }
        )

        // Filter out any elements that failed to get valid dimensions
        const validElements = newElements.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (el: any) => {
            if (["arrow", "line"].includes(el.type)) {
              return Array.isArray(el.points)
            }
            return true
          }
        )

        const existingElements = api.getSceneElements()
        const allElements = [...existingElements, ...validElements]

        api.updateScene({ elements: allElements })

        // Save to server
        const files = api.getFiles()
        const appState = api.getAppState()
        const saveData = JSON.stringify({
          type: "excalidraw",
          version: 2,
          source: "openvlt",
          elements: allElements,
          appState: {
            gridSize: appState.gridSize,
            viewBackgroundColor: appState.viewBackgroundColor,
          },
          files,
        })

        await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: saveData }),
        })

        lastSavedHashRef.current = null
        window.dispatchEvent(new Event("openvlt:tree-refresh"))
      } catch (err) {
        console.error("Skeleton element conversion failed:", err)
      }
    }
    window.addEventListener("openvlt:excalidraw-skeleton", handleSkeletonElements)
    return () => window.removeEventListener("openvlt:excalidraw-skeleton", handleSkeletonElements)
  }, [noteId])

  // Set asset path for fonts
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).EXCALIDRAW_ASSET_PATH = "/"
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parsedInitial, setParsedInitial] = React.useState<any>(null)

  React.useEffect(() => {
    async function parse() {
      try {
        const data = JSON.parse(initialData)
        // Filter out elements with missing required properties that crash
        // Excalidraw's restore/sizeHelpers (e.g. undefined `points`)
        let elements = (data.elements || []).filter((el: any) => {
          if (!el || typeof el !== "object") return false
          const needsPoints = ["line", "arrow", "freedraw"]
          if (needsPoints.includes(el.type) && !Array.isArray(el.points)) {
            return false
          }
          return true
        })

        // Repair corrupted fractional indices to prevent Excalidraw crash
        try {
          const syncInvalidIndices = await getSyncInvalidIndices()
          if (syncInvalidIndices) {
            elements = syncInvalidIndices(elements)
          }
        } catch {
          // If sync fails, use elements as-is
        }

        // Restore saved viewport: try localStorage first (instant), then server
        let viewport = loadViewportLocal(noteId)
        const serverViewport = await loadViewportServer(noteId)
        if (serverViewport) {
          viewport = serverViewport
          // Sync server state to localStorage for next instant load
          saveViewportLocal(noteId, serverViewport)
        }

        setParsedInitial({
          elements,
          appState: {
            ...data.appState,
            collaborators: new Map(),
            ...(viewport
              ? {
                  scrollX: viewport.scrollX,
                  scrollY: viewport.scrollY,
                  zoom: { value: viewport.zoom },
                }
              : {}),
          },
          files: data.files || undefined,
        })
      } catch {
        setParsedInitial({ elements: [], appState: {} })
      }
    }
    parse()
  }, [initialData])

  const lastSavedHashRef = React.useRef<string | null>(null)
  const viewportTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleChange(elements: any, appState: any, files: any) {
    // Persist viewport to localStorage (fast) and server (cross-device)
    if (viewportTimeoutRef.current) clearTimeout(viewportTimeoutRef.current)
    viewportTimeoutRef.current = setTimeout(() => {
      const vp: ViewportState = {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom?.value ?? appState.zoom ?? 1,
      }
      saveViewportLocal(noteId, vp)
      saveViewportServer(noteId, vp)
    }, 300)
    // Build a lightweight fingerprint of elements + persistent appState to
    // detect whether anything worth saving has actually changed.  This avoids
    // firing PUT requests on selection changes, viewport pans, cursor moves,
    // etc. which all trigger Excalidraw's onChange.
    const persistentState = {
      elements: elements.map((el: any) => ({
        id: el.id,
        type: el.type,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        angle: el.angle,
        isDeleted: el.isDeleted,
        version: el.version,
      })),
      gridSize: appState.gridSize,
      viewBackgroundColor: appState.viewBackgroundColor,
      fileKeys: files ? Object.keys(files).sort() : [],
    }
    const hash = JSON.stringify(persistentState)
    if (hash === lastSavedHashRef.current) return

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const data = JSON.stringify({
          type: "excalidraw",
          version: 2,
          source: "openvlt",
          elements,
          appState: {
            gridSize: appState.gridSize,
            viewBackgroundColor: appState.viewBackgroundColor,
          },
          files,
        })

        await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: data }),
        })
        lastSavedHashRef.current = hash
      } finally {
        setSaving(false)
      }
    }, 1000)
  }

  async function handleInsertEmbed(
    embedNoteId: string,
    embedNoteTitle: string,
    anchor: string,
  ) {
    const api = apiRef.current
    if (!api) return

    const convertToExcalidrawElements =
      await getConvertToExcalidrawElements()
    if (!convertToExcalidrawElements) return

    const link = anchor
      ? `${OPENVLT_EMBED_PREFIX}${embedNoteId}#${anchor}`
      : `${OPENVLT_EMBED_PREFIX}${embedNoteId}`

    const { scrollX, scrollY, width, height } = api.getAppState()
    const centerX = -scrollX + width / 2 - 200
    const centerY = -scrollY + height / 2 - 150

    const newElements = convertToExcalidrawElements([
      {
        type: "embeddable",
        x: centerX,
        y: centerY,
        width: 400,
        height: 300,
        link,
        backgroundColor: "transparent",
        strokeColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        roughness: 0,
        opacity: 100,
        customData: {
          openvltEmbed: {
            noteId: embedNoteId,
            anchor,
            noteTitle: embedNoteTitle,
            anchorType: anchor.startsWith("^") ? "block-id" : "heading",
          },
        },
      },
    ])

    api.updateScene({
      elements: [...api.getSceneElements(), ...newElements],
    })

    // Force Excalidraw to re-validate embeddable elements
    // Without this, the embed won't render until page refresh
    setTimeout(() => api.refresh(), 50)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function renderEmbeddable(element: any, _appState: any) {
    const link = element.link
    if (!link || !link.startsWith(OPENVLT_EMBED_PREFIX)) return null

    const parsed = parseEmbedLink(link)
    if (!parsed) return null

    const customTitle = element.customData?.openvltEmbed?.noteTitle

    return (
      <ExcalidrawMdEmbed
        noteId={parsed.noteId}
        anchor={parsed.anchor}
        noteTitle={customTitle}
      />
    )
  }

  if (!parsedInitial) {
    return <ExcalidrawSkeleton />
  }

  return (
    <div className="relative min-h-0 flex-1">
      {saving && (
        <div className="absolute right-4 top-2 z-30 text-xs text-muted-foreground">
          Saving...
        </div>
      )}
      <div className="h-full w-full">
        <ExcalidrawComponent
          excalidrawAPI={(api: unknown) => {
            apiRef.current = api
          }}
          initialData={parsedInitial}
          onChange={handleChange}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          validateEmbeddable={(link: string) => {
            if (link.startsWith(OPENVLT_EMBED_PREFIX)) return true
            return undefined
          }}
          renderEmbeddable={renderEmbeddable}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
            },
          }}
        />
      </div>
      <ExcalidrawEmbedPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleInsertEmbed}
      />
    </div>
  )
}
