"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import dynamic from "next/dynamic"
import { createShapeId } from "tldraw"
import { DefaultColorStyle, DefaultSizeStyle } from "@tldraw/tlschema"
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
import { LassoTool } from "@/lib/canvas/tools/lasso-tool"
import { PixelEraserTool } from "@/lib/canvas/tools/pixel-eraser-tool"
import { CanvasToolbarInline } from "@/components/canvas/canvas-toolbar-inline"
import { CanvasBackground } from "@/components/canvas/canvas-background"
import {
  type PageSizeId,
  type BackgroundPattern,
  type CanvasSettings,
  type RuleStyle,
  RULE_STYLES,
  PAGE_SIZES,
  PAGE_MARGIN_LEFT,
  PAGE_MARGIN_TOP,
  PAGE_GAP,
  getCanvasSettings,
  saveCanvasSettings,
} from "@/lib/canvas/page-config"

const customShapeUtils = [TextNoteShapeUtil, HandwriteShapeUtil]
const customTools = [TextNoteTool, HandwriteTool, LassoTool, PixelEraserTool]

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
  ruleStyle: RuleStyle
  customSpacing: number
  onRuleStyleChange: (style: RuleStyle) => void
  onCustomSpacingChange: (spacing: number) => void
  pressureSensitivity: boolean
  onPressureSensitivityChange: (enabled: boolean) => void
  drawWithFinger: boolean
  onDrawWithFingerChange: (enabled: boolean) => void
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

  // Parse initial data — extract document snapshot and settings
  const { snapshot, initialSettings } = React.useMemo(() => {
    try {
      const data = JSON.parse(initialData)
      const doc = data.document && Object.keys(data.document).length > 0 ? data.document : undefined
      const settings = data.settings as Partial<CanvasSettings> | undefined
      return { snapshot: doc, initialSettings: settings }
    } catch {
      return { snapshot: undefined, initialSettings: undefined }
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

      // Apply saved stroke defaults to tldraw style state
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        // DefaultColorStyle, DefaultSizeStyle imported at top level
        const saved = localStorage.getItem("openvlt:stroke-defaults")
        if (saved) {
          const { color, size } = JSON.parse(saved)
          if (color) editor.setStyleForNextShapes(DefaultColorStyle, color)
          if (size) editor.setStyleForNextShapes(DefaultSizeStyle, size)
        }
      } catch {}

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
        const container = editor.getContainer()
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

        // Inertial scrolling state
        let velocityX = 0
        let velocityY = 0
        let lastMoveTime = 0
        let lastMoveX = 0
        let lastMoveY = 0
        let inertiaRaf = 0

        // Track all active touch pointers for pinch detection
        const touchPointers = new Map<number, { x: number; y: number }>()
        let isPinching = false
        let pinchStartDist = 0
        let pinchStartZoom = 1
        let pinchMidX = 0
        let pinchMidY = 0
        let pinchSbX = 0
        let pinchSbY = 0

        // Block touch events from reaching tldraw — unless "draw with finger" is on
        container.addEventListener("pointerdown", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return

          // When "draw with finger" is enabled, let single-finger touches through to tldraw
          if (drawWithFingerRef.current) return

          e.stopImmediatePropagation()

          touchPointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY })
          activeTouchCount = touchPointers.size
          const cam = editor.getCamera()

          if (activeTouchCount === 1) {
            // Cancel any ongoing inertia
            if (inertiaRaf) { cancelAnimationFrame(inertiaRaf); inertiaRaf = 0 }
            velocityX = 0
            velocityY = 0

            isTouchPanning = true
            isPinching = false
            touchStartX = pe.clientX
            touchStartY = pe.clientY
            lastMoveX = pe.clientX
            lastMoveY = pe.clientY
            lastMoveTime = performance.now()
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
          if (drawWithFingerRef.current) return
          e.stopImmediatePropagation()

          touchPointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY })

          if (isTouchPanning && touchPointers.size === 1) {
            const zoom = editor.getZoomLevel()
            const dx = (pe.clientX - touchStartX) / zoom
            const dy = (pe.clientY - touchStartY) / zoom
            editor.setCamera({ x: cameraStartX + dx, y: cameraStartY + dy, z: zoom })


            // Track velocity for inertia
            const now = performance.now()
            const dt = now - lastMoveTime
            if (dt > 0 && dt < 100) {
              const vx = (pe.clientX - lastMoveX) / dt
              const vy = (pe.clientY - lastMoveY) / dt
              // Smooth velocity with exponential moving average
              velocityX = velocityX * 0.3 + vx * 0.7
              velocityY = velocityY * 0.3 + vy * 0.7
            }
            lastMoveX = pe.clientX
            lastMoveY = pe.clientY
            lastMoveTime = now
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

          }
        }, { capture: true, signal })

        container.addEventListener("pointerup", (e: Event) => {
          const pe = e as PointerEvent
          if (pe.pointerType !== "touch") return
          if (drawWithFingerRef.current) return
          e.stopImmediatePropagation()

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
                  // createShapeId imported at top level
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

            // Start inertial scrolling if finger was panning with enough velocity
            const moved = Math.hypot(pe.clientX - touchStartX, pe.clientY - touchStartY)
            const speed = Math.hypot(velocityX, velocityY)
            if (isTouchPanning && moved > 10 && speed > 0.15) {
              const friction = 0.95
              const startVx = velocityX * 1000 // convert from px/ms to px/s
              const startVy = velocityY * 1000
              let vx = startVx
              let vy = startVy
              let lastT = performance.now()

              const animate = () => {
                const now = performance.now()
                const dt = (now - lastT) / 1000
                lastT = now

                vx *= Math.pow(friction, dt * 60)
                vy *= Math.pow(friction, dt * 60)

                if (Math.abs(vx) < 5 && Math.abs(vy) < 5) {
                  inertiaRaf = 0
                  return
                }

                const zoom = editor.getZoomLevel()
                const curCam = editor.getCamera()
                editor.setCamera({
                  x: curCam.x + (vx * dt) / zoom,
                  y: curCam.y + (vy * dt) / zoom,
                  z: zoom,
                })
    
                inertiaRaf = requestAnimationFrame(animate)
              }
              inertiaRaf = requestAnimationFrame(animate)
            }

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
          if (drawWithFingerRef.current) return
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
          // createShapeId imported at top level
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
      const cs = getCanvasSettings()
      onEditorReady?.({
        editor,
        pageSize: cs.pageSize,
        background: cs.background,
        pageCount: cs.pageCount,
        onPageSizeChange: handlePageSizeChange,
        onBackgroundChange: handleBackgroundChange,
        onAddPage: handleAddPage,
        onRemovePage: handleRemovePage,
        strokeColor: getStrokeDefaults().color,
        strokeSize: getStrokeDefaults().size,
        onStrokeColorChange: updateStrokeColor,
        onStrokeSizeChange: updateStrokeSize,
        ruleStyle: cs.ruleStyle ?? "college",
        customSpacing: cs.customSpacing ?? 27,
        onRuleStyleChange: (s: RuleStyle) => setRuleStyle(s),
        onCustomSpacingChange: (v: number) => setCustomSpacing(v),
        pressureSensitivity: cs.pressureSensitivity ?? true,
        onPressureSensitivityChange: (v: boolean) => setPressureSensitivity(v),
        drawWithFinger: drawWithFingerRef.current,
        onDrawWithFingerChange: (v: boolean) => {
          setDrawWithFinger(v)
          localStorage.setItem("openvlt:draw-with-finger", String(v))
        },
      })

      // Track camera for page button overlay
      editor.store.listen(
        () => {
          const cam = editor.getCamera()
          setCamera({ x: cam.x, y: cam.y, z: cam.z ?? 1 })
          // Clear wet ink when camera moves and not drawing
          const tool = editor.root.getCurrent()?.getCurrent()
          const drawing = tool?.isDrawing === true
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
      let lastSavedData: string | null = null
      editor.store.listen(
        () => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
          }

          saveTimeoutRef.current = setTimeout(async () => {
            const storeSnapshot = editor.store.getStoreSnapshot()
            const data = JSON.stringify({
              type: "openvlt-canvas",
              version: 1,
              document: storeSnapshot,
              settings: {
                pageSize: pageSizeRef.current,
                background: backgroundRef.current,
                pageCount: pageCountRef.current,
                ruleStyle: ruleStyleRef.current,
                customSpacing: customSpacingRef.current,
                pressureSensitivity: pressureSensitivityRef.current,
              },
            })

            // Skip save if content hasn't changed
            if (data === lastSavedData) return

            setSaving(true)
            try {
              await fetch(`/api/notes/${noteId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: data }),
              })
              lastSavedData = data
              window.dispatchEvent(new Event("openvlt:note-saved"))
            } finally {
              setSaving(false)
            }
          }, 1000)
        },
        { source: "user", scope: "document" }
      )

      // Initial save to ensure settings are persisted in the document
      // (migrates old canvases that only had localStorage settings)
      setTimeout(async () => {
        const storeSnapshot = editor.store.getStoreSnapshot()
        const data = JSON.stringify({
          type: "openvlt-canvas",
          version: 2,
          document: storeSnapshot,
          settings: {
            pageSize: pageSizeRef.current,
            background: backgroundRef.current,
            pageCount: pageCountRef.current,
            ruleStyle: ruleStyleRef.current,
            customSpacing: customSpacingRef.current,
            pressureSensitivity: pressureSensitivityRef.current,
          },
        })
        await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: data }),
        })
      }, 2000)
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

  // Page and background settings — prefer document settings (synced), fall back to localStorage
  const [pageSize, setPageSize] = React.useState<PageSizeId>(() => initialSettings?.pageSize ?? getCanvasSettings().pageSize)
  const [background, setBackground] = React.useState<BackgroundPattern>(() => initialSettings?.background ?? getCanvasSettings().background)
  const [pageCount, setPageCount] = React.useState(() => initialSettings?.pageCount ?? getCanvasSettings().pageCount)
  const [ruleStyle, setRuleStyle] = React.useState<RuleStyle>(() => initialSettings?.ruleStyle ?? getCanvasSettings().ruleStyle ?? "college")
  const [customSpacing, setCustomSpacing] = React.useState(() => initialSettings?.customSpacing ?? getCanvasSettings().customSpacing ?? 27)
  const [pressureSensitivity, setPressureSensitivity] = React.useState(() => initialSettings?.pressureSensitivity ?? getCanvasSettings().pressureSensitivity ?? true)
  const [drawWithFinger, setDrawWithFinger] = React.useState(() => {
    try {
      const stored = localStorage.getItem("openvlt:draw-with-finger")
      return stored === "true"
    } catch { return false }
  })
  const drawWithFingerRef = React.useRef(drawWithFinger)
  React.useEffect(() => { drawWithFingerRef.current = drawWithFinger }, [drawWithFinger])

  // Refs for current settings so save callback always has latest values
  const pageSizeRef = React.useRef(pageSize)
  const backgroundRef = React.useRef(background)
  const pageCountRef = React.useRef(pageCount)
  const ruleStyleRef = React.useRef(ruleStyle)
  const customSpacingRef = React.useRef(customSpacing)
  const pressureSensitivityRef = React.useRef(pressureSensitivity)
  React.useEffect(() => { pageSizeRef.current = pageSize }, [pageSize])
  React.useEffect(() => { backgroundRef.current = background }, [background])
  React.useEffect(() => { pageCountRef.current = pageCount }, [pageCount])
  React.useEffect(() => { ruleStyleRef.current = ruleStyle }, [ruleStyle])
  React.useEffect(() => { customSpacingRef.current = customSpacing }, [customSpacing])
  React.useEffect(() => { pressureSensitivityRef.current = pressureSensitivity }, [pressureSensitivity])

  // Keyboard shortcuts for canvas zoom (Shift+= zoom in, Shift+- zoom out, Shift+0 reset)
  React.useEffect(() => {
    const zoomSteps = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8]

    function zoomToCenter(editor: /* eslint-disable-line @typescript-eslint/no-explicit-any */ any, newZoom: number) {
      const cam = editor.getCamera()
      const oldZoom = cam.z ?? 1
      const sb = editor.getViewportScreenBounds()
      // Centre of viewport in page coords
      const cx = sb.w / 2 / oldZoom - cam.x
      const cy = sb.h / 2 / oldZoom - cam.y
      // Keep that page point at the viewport centre under the new zoom
      editor.setCamera({
        x: sb.w / 2 / newZoom - cx,
        y: sb.h / 2 / newZoom - cy,
        z: newZoom,
      })
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const editor = editorRef.current
      if (!editor) return
      // Don't intercept when typing in an input or text-note
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      const isEditing = editor.getEditingShapeId()
      if (isEditing) return

      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault()
          const zoom = editor.getZoomLevel()
          const next = zoomSteps.find((s: number) => s > zoom + 0.01) ?? zoomSteps[zoomSteps.length - 1]
          zoomToCenter(editor, next)
        } else if (e.key === "_" || e.key === "-") {
          e.preventDefault()
          const zoom = editor.getZoomLevel()
          const prev = [...zoomSteps].reverse().find((s: number) => s < zoom - 0.01) ?? zoomSteps[0]
          zoomToCenter(editor, prev)
        } else if (e.key === ")" || e.key === "0") {
          e.preventDefault()
          zoomToCenter(editor, 1)
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Save when settings change (pageSize, background, pageCount)
  React.useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        const storeSnapshot = editor.store.getStoreSnapshot()
        const data = JSON.stringify({
          type: "openvlt-canvas",
          version: 1,
          document: storeSnapshot,
          settings: { pageSize, background, pageCount, ruleStyle, customSpacing, pressureSensitivity },
        })
        await fetch(`/api/notes/${noteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: data }),
        })
        window.dispatchEvent(new Event("openvlt:note-saved"))
      } finally {
        setSaving(false)
      }
    }, 1000)
  }, [pageSize, background, pageCount, ruleStyle, customSpacing, pressureSensitivity, noteId])

  const handlePageSizeChange = React.useCallback((size: PageSizeId) => {
    setPageSize(size)
    saveCanvasSettings({ pageSize: size, background, pageCount, ruleStyle, customSpacing, pressureSensitivity })

    // Update camera — no constraints, free scrolling (same as initial setup)
    if (editorRef.current) {
      editorRef.current.setCameraOptions({
        constraints: undefined,
        zoomSteps: [0.1, 0.25, 0.5, 1, 2, 4, 8],
      })
    }
  }, [background])

  const handleBackgroundChange = React.useCallback((bg: BackgroundPattern) => {
    setBackground(bg)
    saveCanvasSettings({ pageSize, background: bg, pageCount, ruleStyle, customSpacing, pressureSensitivity })
  }, [pageSize, pageCount])

  const handleAddPage = React.useCallback(() => {
    const newCount = pageCount + 1
    setPageCount(newCount)
    saveCanvasSettings({ pageSize, background, pageCount: newCount, ruleStyle, customSpacing, pressureSensitivity })
  }, [pageSize, background, pageCount])

  const handleAddPageAt = React.useCallback((index: number) => {
    const editor = editorRef.current
    const pd = PAGE_SIZES.find(p => p.id === pageSize)
    if (editor && pd && pd.width > 0) {
      // Shift all shapes on pages at or after `index` down by one page height + gap
      const shift = pd.height + PAGE_GAP
      const insertY = index * (pd.height + PAGE_GAP)
      const allShapes = editor.getCurrentPageShapes()
      for (const s of allShapes) {
        if (s.y >= insertY) {
          editor.updateShape({ id: s.id, type: s.type, y: s.y + shift })
        }
      }
    }
    const newCount = pageCount + 1
    setPageCount(newCount)
    saveCanvasSettings({ pageSize, background, pageCount: newCount, ruleStyle, customSpacing, pressureSensitivity })
  }, [pageSize, background, pageCount])

  const handleRemovePage = React.useCallback(() => {
    if (pageCount <= 1) return
    const newCount = pageCount - 1
    setPageCount(newCount)
    saveCanvasSettings({ pageSize, background, pageCount: newCount, ruleStyle, customSpacing, pressureSensitivity })
  }, [pageSize, background, pageCount])

  const handleDeletePageAt = React.useCallback((pageIndex: number) => {
    if (pageCount <= 1) return
    const editor = editorRef.current
    if (!editor) { handleRemovePage(); return }
    const pd = PAGE_SIZES.find(p => p.id === pageSize)
    if (!pd || pd.width === 0) { handleRemovePage(); return }

    // Delete all shapes on this page
    const pageTop = pageIndex * (pd.height + PAGE_GAP)
    const pageBottom = pageTop + pd.height
    const allShapes = editor.getCurrentPageShapes()
    const shapesToDelete = allShapes.filter((s: { x: number; y: number }) => {
      const cy = s.y
      return cy >= pageTop && cy < pageBottom
    })
    if (shapesToDelete.length > 0) {
      editor.deleteShapes(shapesToDelete.map((s: { id: string }) => s.id))
    }

    // Move shapes from pages below up by one page height + gap
    const shift = pd.height + PAGE_GAP
    const shapesBelow = allShapes.filter((s: { x: number; y: number }) => s.y >= pageBottom)
    for (const s of shapesBelow) {
      if (!shapesToDelete.includes(s)) {
        editor.updateShape({ id: s.id, type: s.type, y: s.y - shift })
      }
    }

    const newCount = pageCount - 1
    setPageCount(newCount)
    saveCanvasSettings({ pageSize, background, pageCount: newCount, ruleStyle, customSpacing, pressureSensitivity })
  }, [pageSize, background, pageCount, handleRemovePage])

  const handleClearPageAt = React.useCallback((pageIndex: number) => {
    const editor = editorRef.current
    if (!editor) return
    const pd = PAGE_SIZES.find(p => p.id === pageSize)
    if (!pd || pd.width === 0) return

    const pageTop = pageIndex * (pd.height + PAGE_GAP)
    const pageBottom = pageTop + pd.height
    const allShapes = editor.getCurrentPageShapes()
    const shapesToDelete = allShapes.filter((s: { x: number; y: number }) => {
      const cy = s.y
      return cy >= pageTop && cy < pageBottom
    })
    if (shapesToDelete.length > 0) {
      editor.deleteShapes(shapesToDelete.map((s: { id: string }) => s.id))
    }
  }, [pageSize])

  // Custom grid component that uses our page/background settings
  const components = React.useMemo(() => ({
    Grid: (props: { x: number; y: number; z: number; size: number }) => (
      <CanvasBackground {...props} pageSize={pageSize} background={background} pageCount={pageCount} lineSpacing={customSpacing} />
    ),
  }), [pageSize, background, pageCount, customSpacing])


  // Track selected text-note shape for the style bar
  const [selectedTextNote, setSelectedTextNote] =
    React.useState<TextNoteShape | null>(null)
  const [defaultSaved, setDefaultSaved] = React.useState(false)
  const [camera, setCamera] = React.useState({ x: 0, y: 0, z: 1 })
  const [confirmAction, setConfirmAction] = React.useState<{ type: "clear" | "delete"; pageIndex: number } | null>(null)
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
      // DefaultColorStyle imported at top level
      editorRef.current.setStyleForNextShapes(DefaultColorStyle, color)
    } catch {}
  }, [])

  const updateStrokeSize = React.useCallback((size: string) => {
    setStrokeSize(size)
    if (!editorRef.current) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      // DefaultSizeStyle imported at top level
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
        const buttons: { key: string; sx: number; sy: number; index: number }[] = []
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
            index: i,
          })
        }

        return buttons.map(btn => (
          <button
            key={btn.key}
            onClick={() => handleAddPageAt(btn.index)}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: btn.sx - Math.max(6, 14 * camera.z),
              top: btn.sy - Math.max(6, 14 * camera.z),
              width: Math.max(12, 28 * camera.z),
              height: Math.max(12, 28 * camera.z),
              borderRadius: "50%",
              border: `${Math.max(0.5, 1.5 * camera.z)}px solid #aaa`,
              background: "white",
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

      {/* Page action buttons — top-right of each page */}
      {pageSize !== "infinite" && (() => {
        const pd = PAGE_SIZES.find(p => p.id === pageSize)
        if (!pd || pd.width === 0) return null

        const actions: React.ReactNode[] = []
        const pad = 10

        for (let i = 0; i < pageCount; i++) {
          const pageTop = i * (pd.height + PAGE_GAP)
          const leftX = (pd.width + camera.x) * camera.z + pad
          const topY = (pageTop + camera.y) * camera.z + pad

          actions.push(
            <div
              key={`page-actions-${i}`}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: leftX,
                top: topY,
                transform: `scale(${camera.z})`,
                transformOrigin: "top left",
                display: "flex",
                flexDirection: "row",
                gap: 6,
                zIndex: 4,
              }}
            >
              <button
                onClick={() => setConfirmAction({ type: "clear", pageIndex: i })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "white",
                  color: "#6b7280",
                  fontSize: 11,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "color 0.15s, border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#374151"; e.currentTarget.style.borderColor = "#9ca3af"; e.currentTarget.style.background = "#f9fafb" }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.background = "white" }}
                title="Clear page"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                  <path d="M22 21H7" />
                  <path d="m5 11 9 9" />
                </svg>
                <span>Clear page</span>
              </button>
              <button
                onClick={() => { if (pageCount > 1) setConfirmAction({ type: "delete", pageIndex: i }) }}
                disabled={pageCount <= 1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "white",
                  color: "#6b7280",
                  fontSize: 11,
                  fontFamily: "inherit",
                  cursor: pageCount <= 1 ? "default" : "pointer",
                  opacity: pageCount <= 1 ? 0.4 : 1,
                  whiteSpace: "nowrap",
                  transition: "color 0.15s, border-color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => { if (pageCount > 1) { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#fca5a5"; e.currentTarget.style.background = "#fef2f2" } }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.background = "white" }}
                title={pageCount <= 1 ? "Cannot delete the only page" : "Delete page"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                <span>Delete page</span>
              </button>
            </div>
          )
        }
        return actions
      })()}

      {/* Confirm dialog for clear/delete page */}
      {confirmAction && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setConfirmAction(null)}
        >
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              background: "white",
              borderRadius: 12,
              padding: "20px 24px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
              border: "1px solid #e5e7eb",
              maxWidth: 320,
              width: "100%",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
              {confirmAction.type === "clear" ? "Clear page?" : "Delete page?"}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 16, lineHeight: 1.5 }}>
              {confirmAction.type === "clear"
                ? "This will remove all content on this page. The page itself will remain."
                : "This will remove the page and all its content. Shapes on pages below will shift up."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmAction(null)}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 6,
                  border: "1px solid #d1d5db",
                  background: "white",
                  color: "#374151",
                  fontSize: 12,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === "clear") {
                    handleClearPageAt(confirmAction.pageIndex)
                  } else {
                    handleDeletePageAt(confirmAction.pageIndex)
                  }
                  setConfirmAction(null)
                }}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 6,
                  border: "none",
                  background: confirmAction.type === "delete" ? "#ef4444" : "#111827",
                  color: "white",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = confirmAction.type === "delete" ? "#dc2626" : "#1f2937" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = confirmAction.type === "delete" ? "#ef4444" : "#111827" }}
              >
                {confirmAction.type === "clear" ? "Clear" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div className="absolute right-4 top-2 z-30 text-xs text-muted-foreground">
          Saving...
        </div>
      )}
      <style jsx global>{`
        .canvas-editor-wrapper .tl-shape[data-shape-type="handwrite"] {
          background: none !important;
          box-shadow: none !important;
        }
        .canvas-editor-wrapper .tl-shape[data-shape-type="handwrite"] > div {
          background: none !important;
        }
        .canvas-editor-wrapper .tl-shape[data-shape-type="text-note"] {
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
          const clampedTop = Math.max(0, gapTop)
          const clampedHeight = Math.max(0, gapBottom - clampedTop)
          overlays.push(
            <div key={`gap-${i}`} style={{
              position: "absolute",
              left: Math.max(0, pageLeftScreen),
              top: clampedTop,
              width: Math.max(0, pageRightScreen - pageLeftScreen),
              height: clampedHeight,
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
