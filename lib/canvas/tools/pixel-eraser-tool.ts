import { StateNode, createShapeId, type TLShapeId } from "tldraw"

/**
 * Pixel Eraser Tool — erases parts of handwrite strokes where the eraser touches.
 * Splits strokes at erased sections, keeping remaining segments as new shapes.
 */
export class PixelEraserTool extends StateNode {
  static override id = "pixel-eraser"

  private isActive = false
  private eraserPath: { x: number; y: number }[] = []
  private eraserRadius = 10
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null

  override onEnter() {
    this.editor.setCursor({ type: "cross", rotation: 0 })
    this.initCanvas()
  }

  override onExit() {
    if (this.canvas) {
      this.canvas.remove()
      this.canvas = null
      this.ctx = null
    }
  }

  private initCanvas() {
    if (this.canvas) return
    const container = document.querySelector(".canvas-editor-wrapper .tl-container")
    if (container) {
      this.canvas = document.createElement("canvas")
      this.canvas.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:999;"
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      this.canvas.width = rect.width * dpr
      this.canvas.height = rect.height * dpr
      this.ctx = this.canvas.getContext("2d")
      if (this.ctx) this.ctx.scale(dpr, dpr)
      container.appendChild(this.canvas)
    } else {
      requestAnimationFrame(() => this.initCanvas())
    }
  }

  override onPointerDown() {
    if (!this.canvas) this.initCanvas()
    if (this.canvas && this.ctx) {
      const dpr = window.devicePixelRatio || 1
      const rect = this.canvas.parentElement?.getBoundingClientRect()
      if (rect) {
        this.canvas.width = rect.width * dpr
        this.canvas.height = rect.height * dpr
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    }

    const { x, y } = this.editor.inputs.currentPagePoint
    this.eraserPath = [{ x, y }]
    this.isActive = true
    this.drawEraserCursor()
  }

  override onPointerMove() {
    if (!this.isActive) return

    const { x, y } = this.editor.inputs.currentPagePoint
    this.eraserPath.push({ x, y })
    this.drawEraserCursor()
  }

  override onPointerUp() {
    if (!this.isActive) return
    this.isActive = false

    // Clear eraser visual
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }

    // Process all handwrite shapes — check for intersections with eraser path
    const shapes = this.editor.getCurrentPageShapes()
    const zoom = this.editor.getZoomLevel()
    const radius = this.eraserRadius / zoom // Convert screen radius to page coordinates

    const shapesToDelete: TLShapeId[] = []
    const shapesToCreate: Parameters<typeof this.editor.createShape>[0][] = []

    for (const shape of shapes) {
      // For non-handwrite shapes (text, geo, etc.), delete if eraser touches their bounds
      if (shape.type !== "handwrite") {
        try {
          const bounds = this.editor.getShapeGeometry(shape).bounds
          const shapeLeft = shape.x
          const shapeTop = shape.y
          const shapeRight = shape.x + bounds.w
          const shapeBottom = shape.y + bounds.h

          for (const ep of this.eraserPath) {
            if (ep.x >= shapeLeft - radius && ep.x <= shapeRight + radius &&
                ep.y >= shapeTop - radius && ep.y <= shapeBottom + radius) {
              shapesToDelete.push(shape.id)
              break
            }
          }
        } catch {}
        continue
      }

      let pts: { x: number; y: number; z: number }[]
      try {
        pts = JSON.parse(shape.props.points || "[]")
      } catch { continue }
      if (pts.length < 2) continue

      // Convert points to absolute coordinates
      const absPts = pts.map(p => ({
        x: shape.x + p.x,
        y: shape.y + p.y,
        z: p.z,
      }))

      // Find which points are inside the eraser path
      const erased = new Set<number>()
      for (let i = 0; i < absPts.length; i++) {
        for (const ep of this.eraserPath) {
          if (Math.hypot(absPts[i].x - ep.x, absPts[i].y - ep.y) < radius) {
            erased.add(i)
            break
          }
        }
      }

      if (erased.size === 0) continue

      // If all points erased, just delete the shape
      if (erased.size === absPts.length) {
        shapesToDelete.push(shape.id)
        continue
      }

      // Split into segments of non-erased points
      const segments: { x: number; y: number; z: number }[][] = []
      let currentSeg: { x: number; y: number; z: number }[] = []

      for (let i = 0; i < absPts.length; i++) {
        if (!erased.has(i)) {
          currentSeg.push(absPts[i])
        } else {
          if (currentSeg.length >= 2) {
            segments.push(currentSeg)
          }
          currentSeg = []
        }
      }
      if (currentSeg.length >= 2) {
        segments.push(currentSeg)
      }

      // Delete original shape
      shapesToDelete.push(shape.id)

      // Create new shapes for remaining segments
      for (const seg of segments) {
        const originX = seg[0].x
        const originY = seg[0].y
        let minX = 0, minY = 0, maxX = 0, maxY = 0

        const relPts = seg.map(p => {
          const rx = p.x - originX
          const ry = p.y - originY
          minX = Math.min(minX, rx)
          minY = Math.min(minY, ry)
          maxX = Math.max(maxX, rx)
          maxY = Math.max(maxY, ry)
          return { x: rx, y: ry, z: p.z }
        })

        shapesToCreate.push({
          id: createShapeId(),
          type: "handwrite",
          x: originX,
          y: originY,
          props: {
            w: Math.max(1, maxX - minX),
            h: Math.max(1, maxY - minY),
            color: shape.props.color,
            size: shape.props.size,
            points: JSON.stringify(relPts),
            isComplete: true,
            penType: shape.props.penType || "pen",
          },
        } as Parameters<typeof this.editor.createShape>[0])
      }
    }

    // Apply changes
    if (shapesToDelete.length > 0) {
      this.editor.deleteShapes(shapesToDelete)
    }
    for (const s of shapesToCreate) {
      this.editor.createShape(s)
    }

    this.eraserPath = []
  }

  override onCancel() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.eraserPath = []
    this.isActive = false
  }

  private drawEraserCursor() {
    if (!this.ctx || !this.canvas) return

    const sb = this.editor.getViewportScreenBounds()
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw eraser circle at current position
    const last = this.eraserPath[this.eraserPath.length - 1]
    if (!last) return

    const sp = this.editor.pageToScreen(last)
    const sx = sp.x - sb.x
    const sy = sp.y - sb.y

    ctx.strokeStyle = "rgba(100, 100, 100, 0.5)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(sx, sy, this.eraserRadius, 0, Math.PI * 2)
    ctx.stroke()

    // Draw eraser trail
    if (this.eraserPath.length > 1) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)"
      for (const p of this.eraserPath) {
        const screenP = this.editor.pageToScreen(p)
        ctx.beginPath()
        ctx.arc(screenP.x - sb.x, screenP.y - sb.y, this.eraserRadius, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
