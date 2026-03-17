import { StateNode, createShapeId } from "tldraw"
import "../shapes/handwrite-shape"

export class HandwriteTool extends StateNode {
  static override id = "handwrite"

  private shapeId = "" as ReturnType<typeof createShapeId>
  private points: { x: number; y: number; z: number }[] = []
  private originX = 0
  private originY = 0
  private minX = Infinity
  private minY = Infinity
  private maxX = -Infinity
  private maxY = -Infinity
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private color = "#1d1d1d"
  private strokeWidth = 3
  private lastScreenX = 0
  private lastScreenY = 0
  private prevScreenX = 0
  private prevScreenY = 0
  private pointCount = 0
  isDrawing = false

  clearWetInk() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  private readonly COLOR_MAP: Record<string, string> = {
    black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
    violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
    yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
    "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
    white: "#FFFFFF",
  }
  private readonly SIZE_MAP: Record<string, number> = { s: 1.5, m: 3, l: 5, xl: 9 }

  override onEnter() {
    this.editor.setCursor({ type: "cross", rotation: 0 })

    // Create wet ink canvas overlay
    const container = document.querySelector(".canvas-editor-wrapper .tl-container")
    if (container && !this.canvas) {
      this.canvas = document.createElement("canvas")
      this.canvas.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;"
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      this.canvas.width = rect.width * dpr
      this.canvas.height = rect.height * dpr
      this.ctx = this.canvas.getContext("2d")
      if (this.ctx) {
        this.ctx.scale(dpr, dpr)
      }
      container.appendChild(this.canvas)
    }
  }

  override onExit() {
    if (this.canvas) {
      this.canvas.remove()
      this.canvas = null
      this.ctx = null
    }
  }

  override onPointerDown() {
    const { x, y, z } = this.editor.inputs.currentPagePoint
    const pressure = z ?? 0.5
    this.shapeId = createShapeId()
    this.originX = x
    this.originY = y
    this.points = [{ x: 0, y: 0, z: pressure }]
    this.minX = 0
    this.minY = 0
    this.maxX = 0
    this.maxY = 0

    // Get style
    let colorName = "black"
    let sizeName = "m"
    try {
      const stored = localStorage.getItem("openvlt:stroke-defaults")
      if (stored) {
        const parsed = JSON.parse(stored)
        colorName = parsed.color || "black"
        sizeName = parsed.size || "m"
      }
    } catch {}
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefaultColorStyle, DefaultSizeStyle } = require("@tldraw/tlschema")
      const c = this.editor.getStyleForNextShape(DefaultColorStyle)
      const s = this.editor.getStyleForNextShape(DefaultSizeStyle)
      if (c) colorName = c as string
      if (s) sizeName = s as string
    } catch {}

    this.color = this.COLOR_MAP[colorName] || "#1d1d1d"
    this.strokeWidth = this.SIZE_MAP[sizeName] || 3

    // Clear previous wet ink and resize canvas
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
    if (this.canvas && this.ctx) {
      const dpr = window.devicePixelRatio || 1
      const rect = this.canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        this.canvas.width = rect.width * dpr
        this.canvas.height = rect.height * dpr
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }

    // Store screen position for wet ink drawing
    const screenPoint = this.editor.pageToScreen({ x, y })
    this.lastScreenX = screenPoint.x
    this.lastScreenY = screenPoint.y
    this.prevScreenX = screenPoint.x
    this.prevScreenY = screenPoint.y
    this.pointCount = 0
    this.isDrawing = true
  }

  override onPointerMove() {
    if (!this.shapeId) return

    const { x, y, z } = this.editor.inputs.currentPagePoint
    const pressure = z ?? 0.5
    const px = x - this.originX
    const py = y - this.originY

    this.points.push({ x: px, y: py, z: pressure })
    this.minX = Math.min(this.minX, px)
    this.minY = Math.min(this.minY, py)
    this.maxX = Math.max(this.maxX, px)
    this.maxY = Math.max(this.maxY, py)

    // Draw wet ink on canvas overlay — smooth curves, no React
    if (this.ctx) {
      const screenPoint = this.editor.pageToScreen({ x, y })
      const sb = this.editor.getViewportScreenBounds()
      const sx = screenPoint.x - sb.x
      const sy = screenPoint.y - sb.y
      const lx = this.lastScreenX - sb.x
      const ly = this.lastScreenY - sb.y

      const zoom = this.editor.getZoomLevel()
      const w = Math.max(0.5, this.strokeWidth * zoom)

      this.ctx.strokeStyle = this.color
      this.ctx.lineWidth = w
      this.ctx.lineCap = "round"
      this.ctx.lineJoin = "round"

      this.pointCount++

      if (this.pointCount < 3) {
        // First few points — straight line
        this.ctx.beginPath()
        this.ctx.moveTo(lx, ly)
        this.ctx.lineTo(sx, sy)
        this.ctx.stroke()
      } else {
        // Smooth curve: quadratic bezier from previous midpoint to current midpoint
        // with control point at the last point
        const px = this.prevScreenX - sb.x
        const py = this.prevScreenY - sb.y
        const midX = (lx + sx) / 2
        const midY = (ly + sy) / 2
        const prevMidX = (px + lx) / 2
        const prevMidY = (py + ly) / 2

        this.ctx.beginPath()
        this.ctx.moveTo(prevMidX, prevMidY)
        this.ctx.quadraticCurveTo(lx, ly, midX, midY)
        this.ctx.stroke()
      }

      this.prevScreenX = this.lastScreenX
      this.prevScreenY = this.lastScreenY
      this.lastScreenX = screenPoint.x
      this.lastScreenY = screenPoint.y
    }
  }

  override onPointerUp() {
    if (!this.shapeId) return

    this.isDrawing = false

    // Clear wet ink after a frame — gives InkLayer time to render first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.clearWetInk()
      })
    })

    // Get style names for the shape
    let colorName = "black"
    let sizeName = "m"
    try {
      const stored = localStorage.getItem("openvlt:stroke-defaults")
      if (stored) {
        const parsed = JSON.parse(stored)
        colorName = parsed.color || "black"
        sizeName = parsed.size || "m"
      }
    } catch {}
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { DefaultColorStyle, DefaultSizeStyle } = require("@tldraw/tlschema")
      const c = this.editor.getStyleForNextShape(DefaultColorStyle)
      const s = this.editor.getStyleForNextShape(DefaultSizeStyle)
      if (c) colorName = c as string
      if (s) sizeName = s as string
    } catch {}

    // Create the final shape
    this.editor.createShape({
      id: this.shapeId,
      type: "handwrite",
      x: this.originX,
      y: this.originY,
      props: {
        w: Math.max(1, this.maxX - this.minX),
        h: Math.max(1, this.maxY - this.minY),
        color: colorName,
        size: sizeName,
        points: JSON.stringify(this.points),
        isComplete: true,
      },
    })

    this.shapeId = "" as ReturnType<typeof createShapeId>
    this.points = []
  }

  override onCancel() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.shapeId = "" as ReturnType<typeof createShapeId>
    this.points = []
  }
}
