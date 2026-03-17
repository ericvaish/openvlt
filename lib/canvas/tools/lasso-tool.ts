import { StateNode, type TLShapeId } from "tldraw"

/**
 * Lasso Select Tool — draw a freeform loop to select shapes inside it.
 * Works across all shape types (handwrite, text-note, geo, etc.)
 */
export class LassoTool extends StateNode {
  static override id = "lasso"

  private points: { x: number; y: number }[] = []
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private isActive = false

  override onEnter() {
    this.editor.setCursor({ type: "cross", rotation: 0 })
    this.initCanvas()
  }

  override onExit() {
    this.cleanup()
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

  private cleanup() {
    if (this.canvas) {
      this.canvas.remove()
      this.canvas = null
      this.ctx = null
    }
    this.points = []
    this.isActive = false
  }

  override onPointerDown() {
    if (!this.canvas) this.initCanvas()

    // Resize canvas
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
    this.points = [{ x, y }]
    this.isActive = true
  }

  override onPointerMove() {
    if (!this.isActive) return

    const { x, y } = this.editor.inputs.currentPagePoint
    this.points.push({ x, y })
    this.drawLasso()
  }

  override onPointerUp() {
    if (!this.isActive) return
    this.isActive = false

    // Close the loop
    if (this.points.length > 2) {
      this.points.push(this.points[0])
    }

    // Find shapes inside the lasso polygon
    const selectedIds: TLShapeId[] = []
    try {
      const shapes = this.editor.getCurrentPageShapes()
      for (const shape of shapes) {
        try {
          const bounds = this.editor.getShapeGeometry(shape).bounds
          const centerX = shape.x + bounds.w / 2
          const centerY = shape.y + bounds.h / 2

          if (this.isPointInPolygon(centerX, centerY, this.points)) {
            selectedIds.push(shape.id)
          }
        } catch {
          // Skip shapes that fail geometry lookup
        }
      }
    } catch {}

    // Clear lasso visual
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }

    // Select and switch to select tool so user can manipulate
    if (selectedIds.length > 0) {
      this.editor.setCurrentTool("select")
      this.editor.select(...selectedIds)
    }
    this.points = []
  }

  override onCancel() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.points = []
    this.isActive = false
  }

  private drawLasso() {
    if (!this.ctx || !this.canvas || this.points.length < 2) return

    const sb = this.editor.getViewportScreenBounds()
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Convert page coords to screen coords
    const screenPts = this.points.map(p => {
      const sp = this.editor.pageToScreen(p)
      return { x: sp.x - sb.x, y: sp.y - sb.y }
    })

    // Draw filled lasso area
    ctx.fillStyle = "rgba(59, 130, 246, 0.08)"
    ctx.beginPath()
    ctx.moveTo(screenPts[0].x, screenPts[0].y)
    for (let i = 1; i < screenPts.length; i++) {
      ctx.lineTo(screenPts[i].x, screenPts[i].y)
    }
    ctx.closePath()
    ctx.fill()

    // Draw lasso outline
    ctx.strokeStyle = "rgba(59, 130, 246, 0.6)"
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(screenPts[0].x, screenPts[0].y)
    for (let i = 1; i < screenPts.length; i++) {
      ctx.lineTo(screenPts[i].x, screenPts[i].y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])
  }

  /**
   * Ray casting algorithm for point-in-polygon test.
   */
  private isPointInPolygon(
    px: number,
    py: number,
    polygon: { x: number; y: number }[]
  ): boolean {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y
      const xj = polygon[j].x, yj = polygon[j].y

      if (
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
      ) {
        inside = !inside
      }
    }
    return inside
  }
}
