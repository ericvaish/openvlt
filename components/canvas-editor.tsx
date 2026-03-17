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
import { HandwriteShapeUtil } from "@/lib/canvas/shapes/handwrite-shape"
import { TextNoteTool } from "@/lib/canvas/tools/text-note-tool"
import { HandwriteTool } from "@/lib/canvas/tools/handwrite-tool"
import { CanvasToolbarInline } from "@/components/canvas/canvas-toolbar-inline"
import { CanvasBackground } from "@/components/canvas/canvas-background"
import { InkLayer, type InkLayerHandle } from "@/components/canvas/ink-layer"
import {
  type PageSizeId,
  type BackgroundPattern,
  PAGE_SIZES,
  PAGE_MARGIN_LEFT,
  PAGE_MARGIN_TOP,
  PAGE_GAP,
  getCanvasSettings,
  saveCanvasSettings,
} from "@/lib/canvas/page-config"

const customShapeUtils = [TextNoteShapeUtil, HandwriteShapeUtil]
const customTools = [TextNoteTool, HandwriteTool]

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

export interface CanvasEditorState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
  pageSize: PageSizeId
  background: BackgroundPattern
  pageCount: number
  onPageSizeChange: (size: PageSizeId) => void
  onBackgroundChange: (bg: BackgroundPattern) => void
  onAddPage: () => void
  onRemovePage: () => void
  strokeColor: string
  strokeSize: string
  onStrokeColorChange: (color: string) => void
  onStrokeSizeChange: (size: string) => void
}

interface CanvasEditorProps {
  noteId: string
  initialData: string
  onEditorReady?: (state: CanvasEditorState) => void
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

      // Enable grid so our custom background component renders
      editor.updateInstanceState({ isGridMode: true })

      // Default to handwrite tool — low smoothing for natural handwriting
      editor.setCurrentTool("handwrite")

      // Set initial camera bounds based on page size
      const settings = getCanvasSettings()
      const pageDef = PAGE_SIZES.find(p => p.id === settings.pageSize)
      if (pageDef && pageDef.width > 0) {
        // No camera constraints — free scrolling, wide zoom range
        editor.setCameraOptions({
          constraints: undefined,
          zoomSteps: [0.1, 0.25, 0.5, 1, 2, 4, 8],
        })
      } else {
        editor.setCameraOptions({
          constraints: undefined,
          zoomSteps: [0.1, 0.25, 0.5, 1, 2, 4, 8],
        })
      }

      // Auto-mode: finger = pan, pen = active tool
      // Intercept single-finger touch for manual panning.
      // Let multi-touch (pinch-to-zoom) pass through to tldraw.
      // Pen events always pass through to tldraw.
      // Clean up previous listeners if StrictMode re-mounts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevAc = (window as any).__canvasTouchAc as AbortController | undefined
      if (prevAc) prevAc.abort()
      const ac = new AbortController()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__canvasTouchAc = ac
      const signal = ac.signal

      requestAnimationFrame(() => {
        if (signal.aborted) return
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
        let pinchSbX = 0
        let pinchSbY = 0

        // Block ALL touch events from reaching tldraw — we handle them ourselves
        container.addEventListener("pointerdown", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          e.stopPropagation()

          touchPointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY })
          activeTouchCount = touchPointers.size
          const cam = editor.getCamera()

          if (activeTouchCount === 1) {
            isTouchPanning = true
            isPinching = false
            touchStartX = pe.clientX
            touchStartY = pe.clientY
            cameraStartX = cam.x
            cameraStartY = cam.y
            addDebugRef.current(`PAN n=1 cam=${cam.x.toFixed(0)},${cam.y.toFixed(0)} z=${(cam.z??1).toFixed(2)}`)
          } else if (activeTouchCount === 2) {
            isTouchPanning = false
            isPinching = true
            const pts = [...touchPointers.values()]
            pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
            pinchStartZoom = editor.getZoomLevel()
            pinchMidX = (pts[0].x + pts[1].x) / 2
            pinchMidY = (pts[0].y + pts[1].y) / 2
            // Save screenBounds at pinch start — use throughout the gesture
            const sb = editor.getViewportScreenBounds()
            pinchSbX = sb.x
            pinchSbY = sb.y
            cameraStartX = cam.x
            cameraStartY = cam.y
            addDebugRef.current(`PINCH dist=${pinchStartDist.toFixed(0)} z=${pinchStartZoom.toFixed(2)} sb=${sb.x.toFixed(0)},${sb.y.toFixed(0)}`)
          }
        }, { capture: true, signal })

        container.addEventListener("pointermove", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          e.stopPropagation()

          touchPointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY })

          if (isTouchPanning && touchPointers.size === 1) {
            const zoom = editor.getZoomLevel()
            const dx = (pe.clientX - touchStartX) / zoom
            const dy = (pe.clientY - touchStartY) / zoom
            editor.setCamera({ x: cameraStartX + dx, y: cameraStartY + dy, z: zoom })
            inkLayerRef.current?.redraw()
          } else if (isPinching && touchPointers.size === 2) {
            const pts = [...touchPointers.values()]
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
            const newZoom = Math.min(8, Math.max(0.1, pinchStartZoom * (dist / pinchStartDist)))
            const curMidX = (pts[0].x + pts[1].x) / 2
            const curMidY = (pts[0].y + pts[1].y) / 2

            // Anchor: page point under original pinch midpoint
            const anchorX = (pinchMidX - pinchSbX) / pinchStartZoom - cameraStartX
            const anchorY = (pinchMidY - pinchSbY) / pinchStartZoom - cameraStartY

            // New camera: keep anchor under current midpoint
            editor.setCamera({
              x: (curMidX - pinchSbX) / newZoom - anchorX,
              y: (curMidY - pinchSbY) / newZoom - anchorY,
              z: newZoom,
            })
            inkLayerRef.current?.redraw()
          }
        }, { capture: true, signal })

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
                // Single tap on empty canvas — deselect/close any editing shape
                const point = editor.screenToPage({ x: pe.clientX, y: pe.clientY })
                const hitShape = editor.getShapeAtPoint(point)
                if (!hitShape && editor.getEditingShapeId()) {
                  editor.setEditingShape(null)
                  editor.selectNone()
                  editor.setCurrentTool("draw")
                } else if (!hitShape) {
                  editor.selectNone()
                }
                lastTapTime = Date.now()
                lastTapX = pe.clientX
                lastTapY = pe.clientY
              }
            }
          }

          touchPointers.delete(pe.pointerId)
          activeTouchCount = touchPointers.size
          const cam = editor.getCamera()

          if (activeTouchCount === 0) {
            addDebugRef.current(`ALL UP cam=${cam.x.toFixed(0)},${cam.y.toFixed(0)} z=${(cam.z??1).toFixed(2)}`)
            isTouchPanning = false
            isPinching = false
          } else if (activeTouchCount === 1 && isPinching) {
            // Pinch ended, one finger remains — start panning from current state
            isPinching = false
            isTouchPanning = true
            const remaining = [...touchPointers.values()][0]
            touchStartX = remaining.x
            touchStartY = remaining.y
            cameraStartX = cam.x
            cameraStartY = cam.y
            addDebugRef.current(`PINCH→PAN cam=${cam.x.toFixed(0)},${cam.y.toFixed(0)} z=${(cam.z??1).toFixed(2)}`)
          }
        }, { capture: true, signal })

        container.addEventListener("pointercancel", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          touchPointers.delete(pe.pointerId)
          activeTouchCount = touchPointers.size
          if (activeTouchCount === 0) {
            isTouchPanning = false
            isPinching = false
          }
        }, { capture: true, signal })

        // Block Safari gesture events — prevent double-zoom from Safari's own gestures
        container.addEventListener("gesturestart", (e: Event) => {
          e.preventDefault()
          e.stopPropagation()
        }, { capture: true, signal })
        container.addEventListener("gesturechange", (e: Event) => {
          e.preventDefault()
          e.stopPropagation()
        }, { capture: true, signal })
        container.addEventListener("gestureend", (e: Event) => {
          e.preventDefault()
          e.stopPropagation()
        }, { capture: true, signal })
        // Block pinch-originated wheel events
        container.addEventListener("wheel", (e: Event) => {
          const we = e as WheelEvent
          if (we.ctrlKey) { e.preventDefault(); e.stopPropagation() }
        }, { capture: true, passive: false, signal } as AddEventListenerOptions)

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
            id, type: "text-note", x: point.x, y: point.y,
            props: { w: 300, h: 30, content: "", ...defaults },
          })
          editor.setCurrentTool("select")
          editor.select(id)
          editor.setEditingShape(id)
        }, { signal })
      })

      // Notify parent so toolbar can be rendered in the header
      onEditorReady?.({
        editor,
        pageSize: getCanvasSettings().pageSize,
        background: getCanvasSettings().background,
        pageCount: getCanvasSettings().pageCount,
        onPageSizeChange: handlePageSizeChange,
        onBackgroundChange: handleBackgroundChange,
        onAddPage: handleAddPage,
        onRemovePage: handleRemovePage,
        strokeColor: getStrokeDefaults().color,
        strokeSize: getStrokeDefaults().size,
        onStrokeColorChange: updateStrokeColor,
        onStrokeSizeChange: updateStrokeSize,
      })

      // Track camera for page button overlay and ink layer
      editor.store.listen(
        () => {
          const cam = editor.getCamera()
          setCamera({ x: cam.x, y: cam.y, z: cam.z ?? 1 })
          // Check if handwrite tool is actively drawing
          const tool = editor.root.getCurrent()?.getCurrent()
          const drawing = tool?.isDrawing === true
          setIsDrawing(drawing)
          // Clear wet ink when camera moves and not drawing
          if (!drawing && tool?.clearWetInk) {
            tool.clearWetInk()
          }
        },
        { source: "all", scope: "session" }
      )

      // Track text-note selection for the style bar
      function updateSelectedTextNote() {
        const tool = editor.getCurrentToolId()
        setCurrentToolId(tool)
        // Only show style bar when in select mode with a text-note selected
        if (tool !== "select") {
          setSelectedTextNote(null)
          return
        }
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
      // Watch tool changes (instance state includes currentToolId)
      editor.store.listen(updateSelectedTextNote, { source: "user", scope: "all" })

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

  // Page and background settings
  const [pageSize, setPageSize] = React.useState<PageSizeId>(() => getCanvasSettings().pageSize)
  const [background, setBackground] = React.useState<BackgroundPattern>(() => getCanvasSettings().background)
  const [pageCount, setPageCount] = React.useState(() => getCanvasSettings().pageCount)

  const handlePageSizeChange = React.useCallback((size: PageSizeId) => {
    setPageSize(size)
    saveCanvasSettings({ pageSize: size, background, pageCount })

    // Update camera bounds
    if (editorRef.current) {
      const pageDef = PAGE_SIZES.find(p => p.id === size)
      if (pageDef && pageDef.width > 0) {
        editorRef.current.setCameraOptions({
          constraints: {
            bounds: { x: 0, y: 0, w: pageDef.width, h: pageDef.height },
            behavior: { x: "inside", y: "inside" },
            padding: { x: 0, y: 0 },
            origin: { x: 0, y: 0 },
          },
        })
      } else {
        // Infinite: only restrict top-left
        editorRef.current.setCameraOptions({
          constraints: {
            bounds: { x: 0, y: 0, w: 10000, h: 10000 },
            behavior: { x: "inside", y: "inside" },
            padding: { x: 0, y: 0 },
            origin: { x: 0, y: 0 },
          },
        })
      }
    }
  }, [background])

  const handleBackgroundChange = React.useCallback((bg: BackgroundPattern) => {
    setBackground(bg)
    saveCanvasSettings({ pageSize, background: bg, pageCount })
  }, [pageSize, pageCount])

  const handleAddPage = React.useCallback(() => {
    const newCount = pageCount + 1
    setPageCount(newCount)
    saveCanvasSettings({ pageSize, background, pageCount: newCount })
  }, [pageSize, background, pageCount])

  const handleAddPageAt = React.useCallback((_index: number) => {
    // For now just add a page (position doesn't matter since pages are identical)
    const newCount = pageCount + 1
    setPageCount(newCount)
    saveCanvasSettings({ pageSize, background, pageCount: newCount })
  }, [pageSize, background, pageCount])

  const handleRemovePage = React.useCallback(() => {
    if (pageCount <= 1) return
    const newCount = pageCount - 1
    setPageCount(newCount)
    saveCanvasSettings({ pageSize, background, pageCount: newCount })
  }, [pageSize, background, pageCount])

  // Custom grid component that uses our page/background settings
  const components = React.useMemo(() => ({
    Grid: (props: { x: number; y: number; z: number; size: number }) => (
      <CanvasBackground {...props} pageSize={pageSize} background={background} pageCount={pageCount} />
    ),
  }), [pageSize, background, pageCount])


  // Track selected text-note shape for the style bar
  const [selectedTextNote, setSelectedTextNote] =
    React.useState<TextNoteShape | null>(null)
  const [defaultSaved, setDefaultSaved] = React.useState(false)
  const [camera, setCamera] = React.useState({ x: 0, y: 0, z: 1 })
  const [isDrawing, setIsDrawing] = React.useState(false)
  const inkLayerRef = React.useRef<InkLayerHandle>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addDebugRef = React.useRef((_msg: string) => {})

  // Track current tool for showing stroke style bar
  const [currentToolId, setCurrentToolId] = React.useState("draw")

  // Stroke style state (for draw/pen tool)
  const STROKE_DEFAULTS_KEY = "openvlt:stroke-defaults"
  const getStrokeDefaults = () => {
    if (typeof window === "undefined") return { color: "black", size: "m", width: 3.5 }
    try {
      const s = localStorage.getItem(STROKE_DEFAULTS_KEY)
      if (s) return JSON.parse(s)
    } catch {}
    return { color: "black", size: "m", width: 3.5 }
  }
  const [strokeColor, setStrokeColor] = React.useState(() => getStrokeDefaults().color)
  const [strokeSize, setStrokeSize] = React.useState(() => getStrokeDefaults().size)
  const [strokeBarOpen, setStrokeBarOpen] = React.useState(true)
  const [strokeDefaultSaved, setStrokeDefaultSaved] = React.useState(false)

  const updateStrokeColor = React.useCallback((color: string) => {
    setStrokeColor(color)
    if (!editorRef.current) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefaultColorStyle } = require("@tldraw/tlschema")
      editorRef.current.setStyleForNextShapes(DefaultColorStyle, color)
    } catch {}
  }, [])

  const updateStrokeSize = React.useCallback((size: string) => {
    setStrokeSize(size)
    if (!editorRef.current) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefaultSizeStyle } = require("@tldraw/tlschema")
      editorRef.current.setStyleForNextShapes(DefaultSizeStyle, size)
    } catch {}
  }, [])

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

      <div className="relative h-full w-full overflow-hidden">
      {/* Add page buttons — overlay for fixed-size pages */}
      {pageSize !== "infinite" && (() => {
        const pd = PAGE_SIZES.find(p => p.id === pageSize)
        if (!pd || pd.width === 0) return null
        const buttons: { key: string; sx: number; sy: number }[] = []
        const btnPageX = pd.width / 2

        for (let i = 0; i <= pageCount; i++) {
          let btnPageY: number
          if (i === 0) {
            // Before first page
            btnPageY = -PAGE_GAP / 2
          } else {
            // After page i-1 (in the gap, or after last page)
            btnPageY = i * pd.height + (i - 0.5) * PAGE_GAP
          }
          buttons.push({
            key: `add-${i}`,
            sx: (btnPageX + camera.x) * camera.z,
            sy: (btnPageY + camera.y) * camera.z,
          })
        }

        return buttons.map(btn => (
          <button
            key={btn.key}
            onClick={() => handleAddPage()}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: btn.sx - Math.max(6, 14 * camera.z),
              top: btn.sy - Math.max(6, 14 * camera.z),
              width: Math.max(12, 28 * camera.z),
              height: Math.max(12, 28 * camera.z),
              borderRadius: "50%",
              border: `${Math.max(0.5, 1.5 * camera.z)}px solid #aaa`,
              background: "transparent",
              color: "#aaa",
              fontSize: Math.max(8, 18 * camera.z),
              lineHeight: "1",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 3,
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#666"; e.currentTarget.style.borderColor = "#666" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#aaa"; e.currentTarget.style.borderColor = "#aaa" }}
            title="Add page"
          >
            +
          </button>
        ))
      })()}

      {saving && (
        <div className="absolute right-4 top-2 z-30 text-xs text-muted-foreground">
          Saving...
        </div>
      )}
      <style jsx global>{`
        .canvas-editor-wrapper .tl-shape[data-shape-type="handwrite"] {
          contain: none !important;
        }
        .canvas-editor-wrapper .tl-shape[data-shape-type="handwrite"] svg {
          overflow: visible !important;
        }
        .canvas-editor-wrapper .tl-shape[data-shape-type="text-note"] {
          contain: none !important;
        }
        .canvas-editor-wrapper .tl-grid {
          contain: none !important;
        }
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
        <TldrawComponent
          snapshot={snapshot}
          shapeUtils={customShapeUtils}
          tools={customTools}
          overrides={overrides}
          components={components}
          onMount={handleMount}
          hideUi
          inferDarkMode={false}
          forceMobile={false}
          initialState="select"
          options={{
            maxPages: 1,
            createTextOnCanvasDoubleClick: false,
          }}
        />
      {/* High-DPI ink layer — renders handwrite strokes at native screen resolution */}
      <InkLayer ref={inkLayerRef} editor={editorRef.current} isDrawing={isDrawing} />
      {/* Page mask overlay — covers areas outside pages to hide out-of-bounds content */}
      {pageSize !== "infinite" && (() => {
        const pd = PAGE_SIZES.find(p => p.id === pageSize)
        if (!pd || pd.width === 0) return null
        const z = camera.z
        const cx = camera.x
        const cy = camera.y

        // Large number to cover the whole screen in each direction
        const BIG = 10000

        // For each page gap and the areas above/below/left/right of pages,
        // render grey overlay divs
        const overlays: React.ReactNode[] = []

        // Left of pages
        const pageLeftScreen = (0 + cx) * z
        overlays.push(
          <div key="left" style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: Math.max(0, pageLeftScreen),
            background: "#f0f0f0", pointerEvents: "none", zIndex: 2,
          }} />
        )

        // Right of pages
        const pageRightScreen = (pd.width + cx) * z
        overlays.push(
          <div key="right" style={{
            position: "absolute", top: 0, right: 0, bottom: 0,
            left: Math.max(0, pageRightScreen),
            background: "#f0f0f0", pointerEvents: "none", zIndex: 2,
          }} />
        )

        // Above first page
        const firstPageTop = (0 + cy) * z
        overlays.push(
          <div key="top" style={{
            position: "absolute", top: 0, left: Math.max(0, pageLeftScreen), right: 0,
            height: Math.max(0, firstPageTop),
            width: Math.max(0, pageRightScreen - pageLeftScreen),
            background: "#f0f0f0", pointerEvents: "none", zIndex: 2,
          }} />
        )

        // Below last page
        const lastPageBottom = (pageCount * (pd.height + PAGE_GAP) - PAGE_GAP + cy) * z
        overlays.push(
          <div key="bottom" style={{
            position: "absolute", bottom: 0, left: Math.max(0, pageLeftScreen),
            top: Math.max(0, lastPageBottom),
            width: Math.max(0, pageRightScreen - pageLeftScreen),
            background: "#f0f0f0", pointerEvents: "none", zIndex: 2,
          }} />
        )

        // Gaps between pages
        for (let i = 0; i < pageCount - 1; i++) {
          const gapTop = ((i + 1) * pd.height + i * PAGE_GAP + cy) * z
          const gapBottom = ((i + 1) * (pd.height + PAGE_GAP) + cy) * z
          overlays.push(
            <div key={`gap-${i}`} style={{
              position: "absolute",
              left: Math.max(0, pageLeftScreen),
              top: Math.max(0, gapTop),
              width: Math.max(0, pageRightScreen - pageLeftScreen),
              height: Math.max(0, gapBottom - gapTop),
              background: "#f0f0f0", pointerEvents: "none", zIndex: 2,
            }} />
          )
        }

        return overlays
      })()}
      </div>
    </div>
  )
}
