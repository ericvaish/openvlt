import { StateNode, createShapeId, type TLShapeId } from "tldraw"

/**
 * Pixel Eraser Tool — erases the parts of strokes the eraser touches,
 * splitting them into remaining segments. Non-handwrite shapes are
 * deleted whole if the eraser hits their bounds.
 */
export class PixelEraserTool extends StateNode {
  static override id = "pixel-eraser"

  private isActive = false
  private eraserRadius = 8
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
    const container = this.editor.getContainer()
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

    this.isActive = true
    this.eraseAt(this.editor.inputs.currentPagePoint)
    this.drawCursor()
  }

  override onPointerMove() {
    if (!this.isActive) return
    this.eraseAt(this.editor.inputs.currentPagePoint)
    this.drawCursor()
  }

  override onPointerUp() {
    if (!this.isActive) return
    this.isActive = false
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  private eraseAt(ep: { x: number; y: number }) {
    const shapes = this.editor.getCurrentPageShapes()
    const zoom = this.editor.getZoomLevel()
    const radius = this.eraserRadius / zoom

    const toDelete: TLShapeId[] = []
    const toCreate: Parameters<typeof this.editor.createShape>[0][] = []

    for (const shape of shapes) {
      if (shape.type !== "handwrite") {
        // Non-handwrite: delete whole shape if eraser hits bounds
        const hits = this.editor.getShapesAtPoint(ep, { hitInside: true, margin: radius })
        if (hits.some(h => h.id === shape.id)) {
          toDelete.push(shape.id)
        }
        continue
      }

      let pts: { x: number; y: number; z: number }[]
      try {
        pts = JSON.parse(shape.props.points || "[]")
      } catch { continue }
      if (pts.length < 2) continue

      // Check each point: is it within eraser radius?
      const erased = new Set<number>()
      for (let i = 0; i < pts.length; i++) {
        const ax = shape.x + pts[i].x
        const ay = shape.y + pts[i].y
        if (Math.hypot(ax - ep.x, ay - ep.y) < radius) {
          erased.add(i)
          continue
        }
        // Also check segment to next point
        if (i < pts.length - 1) {
          const bx = shape.x + pts[i + 1].x
          const by = shape.y + pts[i + 1].y
          if (distToSegment(ep, ax, ay, bx, by) < radius) {
            erased.add(i)
            erased.add(i + 1)
          }
        }
      }

      if (erased.size === 0) continue

      // All erased — just delete
      if (erased.size >= pts.length) {
        toDelete.push(shape.id)
        continue
      }

      // Split into contiguous non-erased segments
      const segments: { x: number; y: number; z: number }[][] = []
      let seg: { x: number; y: number; z: number }[] = []
      for (let i = 0; i < pts.length; i++) {
        if (!erased.has(i)) {
          seg.push(pts[i])
        } else {
          if (seg.length >= 2) segments.push(seg)
          seg = []
        }
      }
      if (seg.length >= 2) segments.push(seg)

      toDelete.push(shape.id)

      // Create new shapes from remaining segments
      for (const s of segments) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const p of s) {
          if (p.x < minX) minX = p.x
          if (p.y < minY) minY = p.y
          if (p.x > maxX) maxX = p.x
          if (p.y > maxY) maxY = p.y
        }
        // Normalize points so origin is at top-left of segment bounds
        const normPts = s.map(p => ({
          x: p.x - minX,
          y: p.y - minY,
          z: p.z,
        }))
        toCreate.push({
          id: createShapeId(),
          type: "handwrite",
          x: shape.x + minX,
          y: shape.y + minY,
          props: {
            w: Math.max(1, maxX - minX),
            h: Math.max(1, maxY - minY),
            color: shape.props.color,
            size: shape.props.size,
            points: JSON.stringify(normPts),
            isComplete: true,
            penType: shape.props.penType || "pen",
          },
        } as Parameters<typeof this.editor.createShape>[0])
      }
    }

    if (toDelete.length > 0) this.editor.deleteShapes(toDelete)
    const highlighterIds: ReturnType<typeof createShapeId>[] = []
    for (const s of toCreate) {
      this.editor.createShape(s)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((s as any).props?.penType === "highlighter") {
        highlighterIds.push(s.id as ReturnType<typeof createShapeId>)
      }
    }
    if (highlighterIds.length > 0) {
      this.editor.sendToBack(highlighterIds)
    }
  }

  override onCancel() {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.isActive = false
  }

  private drawCursor() {
    if (!this.ctx || !this.canvas) return
    const sb = this.editor.getViewportScreenBounds()
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    const point = this.editor.inputs.currentPagePoint
    const sp = this.editor.pageToScreen(point)

    ctx.strokeStyle = "rgba(100, 100, 100, 0.5)"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(sp.x - sb.x, sp.y - sb.y, this.eraserRadius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function distToSegment(
  p: { x: number; y: number },
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - ax, p.y - ay)
  let t = ((p.x - ax) * dx + (p.y - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy))
}
