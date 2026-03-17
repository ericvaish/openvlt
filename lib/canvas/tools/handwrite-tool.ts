import { StateNode, createShapeId } from "tldraw"
import { DefaultColorStyle, DefaultSizeStyle } from "@tldraw/tlschema"
import { recognizeShape } from "../shape-recognition"
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
  private opacity = 1
  private penType: "pen" | "highlighter" = "pen"
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
    this.initWetInkCanvas()
  }

  private initWetInkCanvas() {
    if (this.canvas) return

    const container = document.querySelector(".canvas-editor-wrapper .tl-container")
    if (container) {
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
    } else {
      // Container not ready yet — retry next frame
      requestAnimationFrame(() => this.initWetInkCanvas())
    }
  }

  override onExit() {
    if (this.canvas) {
      this.canvas.remove()
      this.canvas = null
      this.ctx = null
    }
  }

  private isSnapToShapeEnabled(): boolean {
    try {
      const stored = localStorage.getItem("openvlt:canvas-settings")
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed.snapToShape === true
      }
    } catch {}
    return false
  }

  private isPressureEnabled(): boolean {
    try {
      const stored = localStorage.getItem("openvlt:canvas-settings")
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed.pressureSensitivity !== false
      }
    } catch {}
    return true
  }

  override onPointerDown() {
    // Ensure wet ink canvas exists (fallback if onEnter rAF hasn't fired yet)
    if (!this.canvas) this.initWetInkCanvas()

    const { x, y, z } = this.editor.inputs.currentPagePoint
    const pressure = this.isPressureEnabled() ? (z ?? 0.5) : 0.5
    this.shapeId = createShapeId()
    this.originX = x
    this.originY = y
    this.points = [{ x: 0, y: 0, z: pressure }]
    this.minX = 0
    this.minY = 0
    this.maxX = 0
    this.maxY = 0

    // Read from active pen preset
    let colorName = "black"
    let sizeName = "m"
    let penType: "pen" | "highlighter" = "pen"
    try {
      const presets = JSON.parse(localStorage.getItem("openvlt:pen-presets") || "[]")
      const activeIdx = parseInt(localStorage.getItem("openvlt:active-pen") || "0") || 0
      const preset = presets[activeIdx]
      if (preset) {
        colorName = preset.color || "black"
        sizeName = preset.size || "m"
        penType = preset.type || "pen"
      }
    } catch {}
    // Fallback to old stroke defaults if no presets
    if (colorName === "black" && sizeName === "m") {
      try {
        const stored = localStorage.getItem("openvlt:stroke-defaults")
        if (stored) {
          const parsed = JSON.parse(stored)
          colorName = parsed.color || "black"
          sizeName = parsed.size || "m"
        }
      } catch {}
    }

    this.color = this.COLOR_MAP[colorName] || "#1d1d1d"
    this.strokeWidth = this.SIZE_MAP[sizeName] || 3
    this.penType = penType
    this.opacity = penType === "highlighter" ? 0.35 : 1

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
    const pressure = this.isPressureEnabled() ? (z ?? 0.5) : 0.5
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
      const pressureEnabled = this.isPressureEnabled()
      const pw = pressureEnabled ? (0.3 + pressure * 1.2) : 1
      const w = Math.max(0.5, this.strokeWidth * pw * zoom)

      this.ctx.globalAlpha = this.opacity
      this.ctx.strokeStyle = this.color
      this.ctx.lineWidth = this.penType === "highlighter" ? Math.max(w, 12 * zoom) : w
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

    // Read from active pen preset (same as onPointerDown)
    let colorName = "black"
    let sizeName = "m"
    try {
      const presets = JSON.parse(localStorage.getItem("openvlt:pen-presets") || "[]")
      const activeIdx = parseInt(localStorage.getItem("openvlt:active-pen") || "0") || 0
      const preset = presets[activeIdx]
      if (preset) {
        colorName = preset.color || "black"
        sizeName = preset.size || "m"
      }
    } catch {}
    if (colorName === "black" && sizeName === "m") {
      try {
        const stored = localStorage.getItem("openvlt:stroke-defaults")
        if (stored) {
          const parsed = JSON.parse(stored)
          colorName = parsed.color || "black"
          sizeName = parsed.size || "m"
        }
      } catch {}
    }

    // Try shape recognition if snap-to-shape is enabled (not for highlighter)
    if (this.isSnapToShapeEnabled() && this.penType !== "highlighter" && this.points.length >= 5) {
      const absPoints = this.points.map(p => ({ x: p.x + this.originX, y: p.y + this.originY }))
      const recognized = recognizeShape(absPoints)

      if (recognized) {
        // Apply active pen color to the recognized shape
        try {
          this.editor.setStyleForNextShapes(DefaultColorStyle, colorName)
        } catch {}
        const { type, bounds } = recognized

        if (type === "line") {
          const first = absPoints[0]
          const last = absPoints[absPoints.length - 1]
          this.editor.createShape({
            id: this.shapeId,
            type: "arrow",
            x: first.x,
            y: first.y,
            props: {
              start: { x: 0, y: 0 },
              end: { x: last.x - first.x, y: last.y - first.y },
              arrowheadStart: "none",
              arrowheadEnd: "none",
            },
          } as Parameters<typeof this.editor.createShape>[0])
        } else if (type === "arrow") {
          const start = recognized.arrowStart ?? absPoints[0]
          const end = recognized.arrowEnd ?? absPoints[absPoints.length - 1]
          this.editor.createShape({
            id: this.shapeId,
            type: "arrow",
            x: start.x,
            y: start.y,
            props: {
              start: { x: 0, y: 0 },
              end: { x: end.x - start.x, y: end.y - start.y },
              arrowheadStart: "none",
              arrowheadEnd: "arrow",
            },
          } as Parameters<typeof this.editor.createShape>[0])
        } else {
          const geoMap: Record<string, string> = {
            rectangle: "rectangle",
            ellipse: "ellipse",
            triangle: "triangle",
            diamond: "diamond",
            pentagon: "pentagon",
            hexagon: "hexagon",
          }
          const geo = geoMap[type] ?? "rectangle"
          try {
            const { GeoShapeGeoStyle } = require("@tldraw/tlschema")
            this.editor.setStyleForNextShapes(GeoShapeGeoStyle, geo)
          } catch {}
          this.editor.createShape({
            id: this.shapeId,
            type: "geo",
            x: bounds.x,
            y: bounds.y,
            props: {
              w: Math.max(20, bounds.w),
              h: Math.max(20, bounds.h),
              geo,
            },
          } as Parameters<typeof this.editor.createShape>[0])
        }

        this.shapeId = "" as ReturnType<typeof createShapeId>
        this.points = []
        return
      }
    }

    // Create the final handwrite shape (no recognition match)
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
        penType: this.penType,
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
