"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import dynamic from "next/dynamic"
import "tldraw/tldraw.css"

import {
  TextNoteShapeUtil,
  FONT_CSS,
  COLOR_VALUES,
  type TextNoteFont,
  type TextNoteSize,
  type TextNoteColor,
  type TextNoteShape,
} from "@/lib/canvas/shapes/text-note-shape"
import { TextNoteTool } from "@/lib/canvas/tools/text-note-tool"
import { CanvasToolbarInline } from "@/components/canvas/canvas-toolbar-inline"

const customShapeUtils = [TextNoteShapeUtil]
const customTools = [TextNoteTool]

const TEXT_NOTE_DEFAULTS_KEY = "openvlt:text-note-defaults"

function getTextNoteDefaults(): {
  font: TextNoteFont
  size: TextNoteSize
  color: TextNoteColor
} {
  if (typeof window === "undefined")
    return { font: "sans", size: "m", color: "black" }
  try {
    const stored = localStorage.getItem(TEXT_NOTE_DEFAULTS_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { font: "sans", size: "m", color: "black" }
}

function saveTextNoteDefaults(defaults: {
  font: TextNoteFont
  size: TextNoteSize
  color: TextNoteColor
}) {
  localStorage.setItem(TEXT_NOTE_DEFAULTS_KEY, JSON.stringify(defaults))
}

// Dynamic import of tldraw (no SSR) with all needed exports
const TldrawComponent = dynamic(
  () =>
    import("tldraw").then((mod) => {
      const { Tldraw } = mod
      return function TldrawWrapper(
        props: React.ComponentProps<typeof Tldraw>
      ) {
        return <Tldraw {...props} />
      }
    }),
  { ssr: false, loading: () => <CanvasSkeleton /> }
)

function CanvasSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  )
}

interface CanvasEditorProps {
  noteId: string
  initialData: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEditorReady?: (editor: any) => void
}

export function CanvasEditor({ noteId, initialData, onEditorReady }: CanvasEditorProps) {
  const { resolvedTheme } = useTheme()
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const [saving, setSaving] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = React.useRef<any>(null)

  const snapshot = React.useMemo(() => {
    try {
      const data = JSON.parse(initialData)
      if (data.document && Object.keys(data.document).length > 0) {
        return data.document
      }
      return undefined
    } catch {
      return undefined
    }
  }, [initialData])

  const handleMount = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor: any) => {
      editorRef.current = editor

      // Default to draw tool — finger auto-switches to hand for panning
      editor.setCurrentTool("draw")

      // Auto-mode: finger = pan, pen = active tool
      // Intercept single-finger touch for manual panning.
      // Let multi-touch (pinch-to-zoom) pass through to tldraw.
      // Pen events always pass through to tldraw.
      requestAnimationFrame(() => {
        const container = document.querySelector(".canvas-editor-wrapper .tl-container")
        if (!container) return

        let touchStartX = 0
        let touchStartY = 0
        let cameraStartX = 0
        let cameraStartY = 0
        let isTouchPanning = false
        let activeTouchCount = 0
        let lastTapTime = 0
        let lastTapX = 0
        let lastTapY = 0

        // Track all active touch pointers for pinch detection
        const touchPointers = new Map<number, { x: number; y: number }>()
        let isPinching = false
        let pinchStartDist = 0
        let pinchStartZoom = 1
        let pinchMidX = 0
        let pinchMidY = 0

        // Block ALL touch events from reaching tldraw — we handle them ourselves
        container.addEventListener("pointerdown", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          e.stopPropagation()

          touchPointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY })
          activeTouchCount = touchPointers.size

          if (activeTouchCount === 1) {
            isTouchPanning = true
            isPinching = false
            touchStartX = pe.clientX
            touchStartY = pe.clientY
            const cam = editor.getCamera()
            cameraStartX = cam.x
            cameraStartY = cam.y
          } else if (activeTouchCount === 2) {
            // Start pinch-to-zoom
            isTouchPanning = false
            isPinching = true
            const pts = [...touchPointers.values()]
            pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
            pinchStartZoom = editor.getZoomLevel()
            pinchMidX = (pts[0].x + pts[1].x) / 2
            pinchMidY = (pts[0].y + pts[1].y) / 2
            const cam = editor.getCamera()
            cameraStartX = cam.x
            cameraStartY = cam.y
          }
        }, { capture: true })

        container.addEventListener("pointermove", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          e.stopPropagation()

          touchPointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY })

          if (isTouchPanning && touchPointers.size === 1) {
            const zoom = editor.getZoomLevel()
            const dx = (pe.clientX - touchStartX) / zoom
            const dy = (pe.clientY - touchStartY) / zoom
            editor.setCamera({ x: cameraStartX + dx, y: cameraStartY + dy })
          } else if (isPinching && touchPointers.size === 2) {
            const pts = [...touchPointers.values()]
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
            const newZoom = Math.min(8, Math.max(0.1, pinchStartZoom * (dist / pinchStartDist)))
            const currentMidX = (pts[0].x + pts[1].x) / 2
            const currentMidY = (pts[0].y + pts[1].y) / 2

            // tldraw camera model:
            //   pageX = (screenX - screenBounds.x) / zoom - camera.x
            //   camera.x = (screenX - screenBounds.x) / zoom - pageX
            //
            // The page point under the original pinch midpoint must stay
            // under the current midpoint after zoom changes.
            const sb = editor.getViewportScreenBounds()
            const anchorPageX = (pinchMidX - sb.x) / pinchStartZoom - cameraStartX
            const anchorPageY = (pinchMidY - sb.y) / pinchStartZoom - cameraStartY

            editor.setCamera({
              x: (currentMidX - sb.x) / newZoom - anchorPageX,
              y: (currentMidY - sb.y) / newZoom - anchorPageY,
              z: newZoom,
            })
          }
        }, { capture: true })

        container.addEventListener("pointerup", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          e.stopPropagation()

          // Double-tap detection (only on single-finger tap with minimal movement)
          if (isTouchPanning) {
            const moved = Math.hypot(pe.clientX - touchStartX, pe.clientY - touchStartY)
            if (moved < 10) {
              const now = Date.now()
              const dist = Math.hypot(pe.clientX - lastTapX, pe.clientY - lastTapY)
              if (now - lastTapTime < 400 && dist < 30) {
                const point = editor.screenToPage({ x: pe.clientX, y: pe.clientY })
                const hitShape = editor.getShapeAtPoint(point)
                if (!hitShape) {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const { createShapeId } = require("tldraw")
                  const id = createShapeId()
                  const defaults = getTextNoteDefaults()
                  editor.createShape({
                    id, type: "text-note", x: point.x, y: point.y,
                    props: { w: 300, h: 30, content: "", ...defaults },
                  })
                  editor.setCurrentTool("select")
                  editor.select(id)
                  editor.setEditingShape(id)
                }
                lastTapTime = 0
              } else {
                lastTapTime = Date.now()
                lastTapX = pe.clientX
                lastTapY = pe.clientY
              }
            }
          }

          touchPointers.delete(pe.pointerId)
          activeTouchCount = touchPointers.size
          if (activeTouchCount === 0) {
            isTouchPanning = false
            isPinching = false
          }
        }, { capture: true })

        container.addEventListener("pointercancel", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          touchPointers.delete(pe.pointerId)
          activeTouchCount = touchPointers.size
          if (activeTouchCount === 0) {
            isTouchPanning = false
            isPinching = false
          }
        }, { capture: true })

        // Double-click with mouse/pen → create text-note
        container.addEventListener("dblclick", (e: Event) => {
          const me = e as MouseEvent
          const point = editor.screenToPage({ x: me.clientX, y: me.clientY })
          const hitShape = editor.getShapeAtPoint(point)
          if (hitShape) return

          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { createShapeId } = require("tldraw")
          const id = createShapeId()
          const defaults = getTextNoteDefaults()
          editor.createShape({
            id,
            type: "text-note",
            x: point.x,
            y: point.y,
            props: { w: 300, h: 30, content: "", ...defaults },
          })
          editor.setCurrentTool("select")
          editor.select(id)
          editor.setEditingShape(id)
        })
      })

      // Notify parent so toolbar can be rendered in the header
      onEditorReady?.(editor)

      // Track text-note selection for the style bar
      function updateSelectedTextNote() {
        const selected = editor.getSelectedShapes()
        if (selected.length === 1 && selected[0].type === "text-note") {
          setSelectedTextNote({ ...selected[0] } as TextNoteShape)
        } else {
          setSelectedTextNote(null)
        }
      }
      // Watch selection changes
      editor.store.listen(updateSelectedTextNote, { source: "user", scope: "session" })
      // Watch shape prop changes (font/size/color updates)
      editor.store.listen(updateSelectedTextNote, { source: "user", scope: "document" })

      // Double-click/double-tap handled at DOM level (see below in requestAnimationFrame)

      // Listen for changes and auto-save
      editor.store.listen(
        () => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
          }

          saveTimeoutRef.current = setTimeout(async () => {
            setSaving(true)
            try {
              const storeSnapshot = editor.store.getStoreSnapshot()
              const data = JSON.stringify({
                type: "openvlt-canvas",
                version: 1,
                document: storeSnapshot,
              })

              await fetch(`/api/notes/${noteId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: data }),
              })
            } finally {
              setSaving(false)
            }
          }, 1000)
        },
        { source: "user", scope: "document" }
      )
    },
    [noteId]
  )

  // Override: remove tldraw's built-in text tool, add our text-note tool
  const overrides = React.useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools(editor: any, tools: any) {
        // Remove the built-in text tool (per tldraw docs: use delete)
        delete tools.text

        // Add our text-note tool
        tools["text-note"] = {
          id: "text-note",
          icon: "text",
          label: "Text Block",
          kbd: "t",
          onSelect() {
            editor.setCurrentTool("text-note")
          },
        }
        return tools
      },
    }),
    []
  )

  // Track selected text-note shape for the style bar
  const [selectedTextNote, setSelectedTextNote] =
    React.useState<TextNoteShape | null>(null)
  const [defaultSaved, setDefaultSaved] = React.useState(false)

  const updateTextNoteStyle = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      if (!editorRef.current || !selectedTextNote) return
      editorRef.current.updateShape({
        id: selectedTextNote.id,
        type: "text-note",
        props,
      })
    },
    [selectedTextNote]
  )

  return (
    <div className="relative flex flex-1 flex-col canvas-editor-wrapper">
      {/* Text note style bar — rendered outside tldraw so events work */}
      {selectedTextNote && (
        <div
          className="absolute left-0 right-0 flex items-center gap-2 border-b bg-background/95 px-3 py-1.5 backdrop-blur-sm"
          style={{ zIndex: 9999, top: 0 }}
        >
          {/* Fonts */}
          {(["draw", "sans", "serif", "mono"] as TextNoteFont[]).map((f) => (
            <button
              key={f}
              onClick={() => updateTextNoteStyle({ font: f })}
              className="rounded px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              style={{
                fontFamily: FONT_CSS[f],
                background:
                  selectedTextNote.props.font === f
                    ? "var(--color-primary, #3b82f6)"
                    : undefined,
                color:
                  selectedTextNote.props.font === f ? "#fff" : undefined,
              }}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Sizes */}
          {(
            [
              ["s", "S"],
              ["m", "M"],
              ["l", "L"],
              ["xl", "XL"],
            ] as [TextNoteSize, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => updateTextNoteStyle({ size: id })}
              className="rounded px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              style={{
                background:
                  selectedTextNote.props.size === id
                    ? "var(--color-primary, #3b82f6)"
                    : undefined,
                color:
                  selectedTextNote.props.size === id ? "#fff" : undefined,
              }}
            >
              {label}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Colors */}
          {(
            [
              "black", "grey", "blue", "light-blue", "violet",
              "light-violet", "red", "light-red", "orange", "yellow",
              "green", "light-green", "white",
            ] as TextNoteColor[]
          ).map((c) => (
            <button
              key={c}
              onClick={() => updateTextNoteStyle({ color: c })}
              className="rounded-full"
              style={{
                width: 18,
                height: 18,
                background: COLOR_VALUES[c],
                border:
                  selectedTextNote.props.color === c
                    ? "2px solid var(--color-primary, #3b82f6)"
                    : "1px solid #d1d5db",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Save as default */}
          <button
            onClick={() => {
              if (!selectedTextNote) return
              saveTextNoteDefaults({
                font: selectedTextNote.props.font,
                size: selectedTextNote.props.size,
                color: selectedTextNote.props.color,
              })
              setDefaultSaved(true)
              setTimeout(() => setDefaultSaved(false), 1500)
            }}
            className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
              defaultSaved
                ? "bg-green-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            title="New text boxes will use these settings"
          >
            {defaultSaved ? "Saved!" : "Set as default"}
          </button>
        </div>
      )}

      {saving && (
        <div className="absolute right-4 top-2 z-30 text-xs text-muted-foreground">
          Saving...
        </div>
      )}
      <style jsx global>{`
        .canvas-editor-wrapper .tlui-debug-panel {
          display: none !important;
        }
        .canvas-editor-wrapper .tlui-style-panel__wrapper {
          max-height: 70vh;
          overflow-y: auto;
        }
        /* Text note shape: ensure the container and editor fill the shape bounds */
        .canvas-editor-wrapper .text-note-container {
          width: 100%;
          height: 100%;
        }
        .canvas-editor-wrapper .text-note-editor {
          width: 100%;
          height: 100%;
        }
        .canvas-editor-wrapper .text-note-editor,
        .canvas-editor-wrapper .text-note-editor > div {
          padding: 0 !important;
          margin: 0 !important;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap,
        .canvas-editor-wrapper .text-note-editor .ProseMirror {
          outline: none !important;
          width: 100% !important;
          height: 100%;
          padding: 0 !important;
          margin: 0 !important;
          white-space: pre-wrap !important;
          word-break: break-word !important;
          -webkit-user-select: text !important;
          user-select: text !important;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap p:first-child,
        .canvas-editor-wrapper .text-note-editor .ProseMirror p:first-child {
          margin-top: 0 !important;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap h1 {
          font-size: 1.75em;
          font-weight: 700;
          margin: 0.25em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap h2 {
          font-size: 1.4em;
          font-weight: 600;
          margin: 0.25em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap h3 {
          font-size: 1.15em;
          font-weight: 600;
          margin: 0.2em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap p {
          margin: 0.15em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap ul,
        .canvas-editor-wrapper .text-note-editor .tiptap ol {
          padding-left: 1.5em;
          margin: 0.15em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 0.75em;
          margin: 0.25em 0;
          color: #6b7280;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap code {
          background: rgba(0, 0, 0, 0.06);
          border-radius: 3px;
          padding: 0.15em 0.3em;
          font-size: 0.9em;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap pre {
          background: rgba(0, 0, 0, 0.06);
          border-radius: 6px;
          padding: 0.5em 0.75em;
          margin: 0.25em 0;
          overflow-x: auto;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap pre code {
          background: none;
          padding: 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap strong {
          font-weight: 700;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap em {
          font-style: italic;
        }
      `}</style>
      <div className="h-full w-full">
        <TldrawComponent
          snapshot={snapshot}
          shapeUtils={customShapeUtils}
          tools={customTools}
          overrides={overrides}
          onMount={handleMount}
          hideUi
          inferDarkMode={false}
          forceMobile={false}
          options={{
            maxPages: 1,
            createTextOnCanvasDoubleClick: false,
          }}
        />
      </div>
    </div>
  )
}
