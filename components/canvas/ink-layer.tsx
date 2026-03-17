"use client"

import * as React from "react"

const COLOR_MAP: Record<string, string> = {
  black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
  violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
  yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
  "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
  white: "#FFFFFF",
}

const SIZE_MAP: Record<string, number> = { s: 1.5, m: 3, l: 5, xl: 9 }

export interface InkLayerHandle {
  redraw: () => void
}

interface InkLayerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
  isDrawing?: boolean
}

export const InkLayer = React.forwardRef<InkLayerHandle, InkLayerProps>(
  function InkLayer({ editor, isDrawing }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null)

    const redraw = React.useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas || !editor) return

      const dpr = window.devicePixelRatio || 1
      const parent = canvas.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const cam = editor.getCamera()
      const zoom = cam.z ?? 1
      const camX = cam.x
      const camY = cam.y

      const shapes = editor.getCurrentPageShapes()

      for (const shape of shapes) {
        if (shape.type !== "handwrite") continue
        try {
          const pts = JSON.parse(shape.props.points || "[]")
          if (pts.length < 2) continue

          const color = COLOR_MAP[shape.props.color] || shape.props.color || "#1d1d1d"
          const baseWidth = SIZE_MAP[shape.props.size] || parseFloat(String(shape.props.size)) || 3

          const toX = (px: number) => (shape.x + px + camX) * zoom
          const toY = (py: number) => (shape.y + py + camY) * zoom

          // Check if points have varying pressure (z != 0.5 constant)
          const hasPressure = pts.some((p: { z?: number }) => p.z !== undefined && p.z !== 0.5)

          ctx.strokeStyle = color
          ctx.lineCap = "round"
          ctx.lineJoin = "round"

          if (!hasPressure) {
            // Uniform width — draw as single path for performance
            ctx.lineWidth = baseWidth * zoom
            ctx.beginPath()
            ctx.moveTo(toX(pts[0].x), toY(pts[0].y))

            if (pts.length === 2) {
              ctx.lineTo(toX(pts[1].x), toY(pts[1].y))
            } else {
              const mx1 = (pts[0].x + pts[1].x) / 2
              const my1 = (pts[0].y + pts[1].y) / 2
              ctx.lineTo(toX(mx1), toY(my1))

              for (let i = 1; i < pts.length - 1; i++) {
                const mx = (pts[i].x + pts[i + 1].x) / 2
                const my = (pts[i].y + pts[i + 1].y) / 2
                ctx.quadraticCurveTo(toX(pts[i].x), toY(pts[i].y), toX(mx), toY(my))
              }

              const last = pts[pts.length - 1]
              ctx.lineTo(toX(last.x), toY(last.y))
            }
            ctx.stroke()
          } else {
            // Pressure-sensitive — draw segment by segment with varying width
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i]
              const p1 = pts[i + 1]
              const pressure = ((p0.z ?? 0.5) + (p1.z ?? 0.5)) / 2
              // Map pressure 0–1 to width 0.3x–1.5x of base
              const w = baseWidth * (0.3 + pressure * 1.2) * zoom

              ctx.lineWidth = w
              ctx.beginPath()

              if (i === 0) {
                ctx.moveTo(toX(p0.x), toY(p0.y))
                if (pts.length === 2) {
                  ctx.lineTo(toX(p1.x), toY(p1.y))
                } else {
                  const mx = (p0.x + p1.x) / 2
                  const my = (p0.y + p1.y) / 2
                  ctx.lineTo(toX(mx), toY(my))
                }
              } else if (i < pts.length - 2) {
                const prevMx = (pts[i - 1].x + p0.x) / 2
                const prevMy = (pts[i - 1].y + p0.y) / 2
                const mx = (p0.x + p1.x) / 2
                const my = (p0.y + p1.y) / 2
                ctx.moveTo(toX(prevMx), toY(prevMy))
                ctx.quadraticCurveTo(toX(p0.x), toY(p0.y), toX(mx), toY(my))
              } else {
                const prevMx = (pts[i - 1].x + p0.x) / 2
                const prevMy = (pts[i - 1].y + p0.y) / 2
                ctx.moveTo(toX(prevMx), toY(prevMy))
                ctx.quadraticCurveTo(toX(p0.x), toY(p0.y), toX(p1.x), toY(p1.y))
              }
              ctx.stroke()
            }
          }
        } catch {}
      }
    }, [editor])

    // Expose redraw to parent via ref
    React.useImperativeHandle(ref, () => ({ redraw }), [redraw])

    // Redraw when shapes change (new stroke added/deleted)
    React.useEffect(() => {
      if (!editor) return
      const unsub = editor.store.listen(
        () => { if (!isDrawing) redraw() },
        { source: "all", scope: "document" }
      )
      redraw()
      return unsub
    }, [editor, redraw, isDrawing])

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    )
  }
)
