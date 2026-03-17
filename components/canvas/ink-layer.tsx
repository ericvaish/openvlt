"use client"

import * as React from "react"

interface InkPoint {
  x: number
  y: number
  z: number
}

interface InkStroke {
  id: string
  originX: number
  originY: number
  points: InkPoint[]
  color: string
  size: number
}

const COLOR_MAP: Record<string, string> = {
  black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
  violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
  yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
  "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
  white: "#FFFFFF",
}

const SIZE_MAP: Record<string, number> = { s: 1.5, m: 3, l: 5, xl: 9 }

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: InkStroke,
  camX: number,
  camY: number,
  zoom: number,
  sbX: number,
  sbY: number
) {
  const pts = stroke.points
  if (pts.length < 2) return

  const color = COLOR_MAP[stroke.color] || stroke.color || "#1d1d1d"
  const baseWidth = SIZE_MAP[stroke.size] || parseFloat(String(stroke.size)) || 3

  ctx.strokeStyle = color
  ctx.lineWidth = baseWidth * zoom
  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  const toScreenX = (px: number) => (stroke.originX + px + camX) * zoom
  const toScreenY = (py: number) => (stroke.originY + py + camY) * zoom

  ctx.beginPath()
  ctx.moveTo(toScreenX(pts[0].x), toScreenY(pts[0].y))

  if (pts.length === 2) {
    ctx.lineTo(toScreenX(pts[1].x), toScreenY(pts[1].y))
  } else {
    const mx1 = (pts[0].x + pts[1].x) / 2
    const my1 = (pts[0].y + pts[1].y) / 2
    ctx.lineTo(toScreenX(mx1), toScreenY(my1))

    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2
      const my = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(
        toScreenX(pts[i].x), toScreenY(pts[i].y),
        toScreenX(mx), toScreenY(my)
      )
    }

    const last = pts[pts.length - 1]
    ctx.lineTo(toScreenX(last.x), toScreenY(last.y))
  }
  ctx.stroke()
}

interface InkLayerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
  camera: { x: number; y: number; z: number }
  isDrawing?: boolean
}

export function InkLayer({ editor, camera, isDrawing }: InkLayerProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !editor) return
    // Don't redraw while actively drawing — wet ink canvas handles that
    if (isDrawing) return

    const dpr = window.devicePixelRatio || 1
    const parent = canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // Get all handwrite shapes from tldraw store
    const shapes = editor.getCurrentPageShapes()
    const sb = editor.getViewportScreenBounds()

    for (const shape of shapes) {
      if (shape.type !== "handwrite") continue
      try {
        const pts = JSON.parse(shape.props.points || "[]")
        if (pts.length < 2) continue
        drawStroke(ctx, {
          id: shape.id,
          originX: shape.x,
          originY: shape.y,
          points: pts,
          color: shape.props.color,
          size: shape.props.size,
        }, camera.x, camera.y, camera.z, sb.x, sb.y)
      } catch {}
    }
  }, [editor, camera, isDrawing])

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
