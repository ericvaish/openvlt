"use client"

import * as React from "react"

const COLOR_MAP: Record<string, string> = {
  black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
  violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
  yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
  "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
  white: "#FFFFFF",
}

const SIZE_MAP: Record<string, number> = { xs: 0.75, s: 1.5, m: 3, l: 5, xl: 9 }

interface CanvasPreviewProps {
  content: string
  width?: number
  height?: number
}

/**
 * Read-only canvas preview — renders handwrite strokes from a canvas JSON snapshot.
 * Used in version history to preview canvas versions without loading tldraw.
 */
export function CanvasPreview({ content, width = 400, height = 300 }: CanvasPreviewProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // White background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    // Parse canvas data
    let doc: Record<string, unknown> = {}
    try {
      const data = JSON.parse(content)
      doc = (data.document?.store ?? data.document ?? {}) as Record<string, unknown>
    } catch {
      return
    }

    // Find all shapes and compute bounds for auto-fit
    const shapes: {
      x: number
      y: number
      type: string
      props: Record<string, unknown>
    }[] = []

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    for (const key of Object.keys(doc)) {
      const record = doc[key] as Record<string, unknown>
      if (record?.typeName !== "shape") continue

      const shape = record as typeof shapes[0]
      shapes.push(shape)

      if (shape.type === "handwrite") {
        try {
          const pts = JSON.parse((shape.props.points as string) || "[]") as { x: number; y: number }[]
          for (const p of pts) {
            minX = Math.min(minX, shape.x + p.x)
            minY = Math.min(minY, shape.y + p.y)
            maxX = Math.max(maxX, shape.x + p.x)
            maxY = Math.max(maxY, shape.y + p.y)
          }
        } catch {}
      } else {
        const w = (shape.props.w as number) || 100
        const h = (shape.props.h as number) || 30
        minX = Math.min(minX, shape.x)
        minY = Math.min(minY, shape.y)
        maxX = Math.max(maxX, shape.x + w)
        maxY = Math.max(maxY, shape.y + h)
      }
    }

    if (shapes.length === 0 || !isFinite(minX)) {
      ctx.fillStyle = "#9ca3af"
      ctx.font = "13px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("Empty canvas", width / 2, height / 2)
      return
    }

    // Calculate zoom to fit all content with padding
    const pad = 20
    const contentW = maxX - minX
    const contentH = maxY - minY
    const zoom = Math.min((width - pad * 2) / Math.max(contentW, 1), (height - pad * 2) / Math.max(contentH, 1), 2)
    const offsetX = (width - contentW * zoom) / 2 - minX * zoom
    const offsetY = (height - contentH * zoom) / 2 - minY * zoom

    // Render handwrite shapes
    for (const shape of shapes) {
      if (shape.type !== "handwrite") continue

      try {
        const pts = JSON.parse((shape.props.points as string) || "[]") as { x: number; y: number }[]
        if (pts.length < 2) continue

        const isHighlighter = shape.props.penType === "highlighter"
        const color = COLOR_MAP[shape.props.color as string] || (shape.props.color as string) || "#1d1d1d"
        const baseWidth = isHighlighter
          ? Math.max(SIZE_MAP[shape.props.size as string] || 5, 12)
          : (SIZE_MAP[shape.props.size as string] || 3)

        const toX = (px: number) => (shape.x + px) * zoom + offsetX
        const toY = (py: number) => (shape.y + py) * zoom + offsetY

        ctx.globalAlpha = isHighlighter ? 0.35 : 1
        ctx.strokeStyle = color
        ctx.lineWidth = baseWidth * zoom
        ctx.lineCap = "round"
        ctx.lineJoin = "round"

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
        ctx.globalAlpha = 1
      } catch {}
    }

    // Render text-note shapes as text
    for (const shape of shapes) {
      if (shape.type !== "text-note") continue

      const text = (shape.props.content as string) || ""
      if (!text.trim()) continue

      const sx = shape.x * zoom + offsetX
      const sy = shape.y * zoom + offsetY
      const fontSize = Math.max(8, 14 * zoom)

      ctx.fillStyle = "#1d1d1d"
      ctx.font = `${fontSize}px sans-serif`
      ctx.textAlign = "left"
      ctx.textBaseline = "top"

      // Simple text wrapping
      const maxW = ((shape.props.w as number) || 300) * zoom
      const lines = text.split("\n")
      let lineY = sy
      for (const line of lines) {
        ctx.fillText(line, sx, lineY, maxW)
        lineY += fontSize * 1.4
      }
    }

    // Render geo shapes as outlines
    for (const shape of shapes) {
      if (shape.type !== "geo") continue

      const w = ((shape.props.w as number) || 100) * zoom
      const h = ((shape.props.h as number) || 100) * zoom
      const sx = shape.x * zoom + offsetX
      const sy = shape.y * zoom + offsetY

      ctx.strokeStyle = "#1d1d1d"
      ctx.lineWidth = 1.5 * zoom
      ctx.beginPath()

      const geo = shape.props.geo as string
      if (geo === "ellipse") {
        ctx.ellipse(sx + w / 2, sy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      } else if (geo === "triangle") {
        ctx.moveTo(sx + w / 2, sy)
        ctx.lineTo(sx + w, sy + h)
        ctx.lineTo(sx, sy + h)
        ctx.closePath()
      } else {
        ctx.rect(sx, sy, w, h)
      }
      ctx.stroke()
    }
  }, [content, width, height])

  return (
    <canvas
      ref={canvasRef}
      className="rounded border"
      style={{ width, height }}
    />
  )
}
