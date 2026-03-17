"use client"

import { jsPDF } from "jspdf"

const COLOR_MAP: Record<string, string> = {
  black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
  violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
  yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
  "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
  white: "#FFFFFF",
}

const SIZE_MAP: Record<string, number> = { s: 1.5, m: 3, l: 5, xl: 9 }

interface Shape {
  x: number
  y: number
  type: string
  props: Record<string, unknown>
}

/**
 * Export a canvas note as PDF.
 * Renders all strokes, text, and shapes onto a high-res canvas per page,
 * then adds each page to a PDF document.
 */
export function exportCanvasToPdf(
  content: string,
  title: string,
  pageWidth = 794,
  pageHeight = 1123,
  pageGap = 40,
  pageCount = 1,
  background: "blank" | "ruled" | "grid" | "dot-grid" = "blank",
  lineSpacing = 27
) {
  // Parse canvas data
  let doc: Record<string, unknown> = {}
  let settings: Record<string, unknown> = {}
  try {
    const data = JSON.parse(content)
    doc = (data.document?.store ?? data.document ?? {}) as Record<string, unknown>
    settings = (data.settings ?? {}) as Record<string, unknown>
  } catch {
    return
  }

  // Read settings
  const pCount = (settings.pageCount as number) || pageCount
  const pWidth = pageWidth
  const pHeight = pageHeight

  // Collect all shapes
  const shapes: Shape[] = []
  for (const key of Object.keys(doc)) {
    const record = doc[key] as Record<string, unknown>
    if (record?.typeName !== "shape") continue
    shapes.push(record as unknown as Shape)
  }

  // Create PDF (A4 portrait)
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [pWidth, pHeight],
  })

  const scale = 2 // High-res rendering

  for (let page = 0; page < pCount; page++) {
    if (page > 0) pdf.addPage([pWidth, pHeight])

    const pageTop = page * (pHeight + pageGap)
    const pageBottom = pageTop + pHeight

    // Create offscreen canvas for this page
    const canvas = document.createElement("canvas")
    canvas.width = pWidth * scale
    canvas.height = pHeight * scale
    const ctx = canvas.getContext("2d")
    if (!ctx) continue

    ctx.scale(scale, scale)

    // White background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, pWidth, pHeight)

    // Draw background pattern
    const marginLeft = 60
    const marginTop = 60
    const lineColor = "rgba(140, 160, 200, 0.35)"
    const marginColor = "rgba(255, 100, 100, 0.3)"

    if (background === "ruled") {
      // Red margin line
      ctx.fillStyle = marginColor
      ctx.fillRect(marginLeft, marginTop, 1, pHeight - marginTop)

      // Horizontal ruled lines
      ctx.fillStyle = lineColor
      const startY = Math.ceil(marginTop / lineSpacing) * lineSpacing
      for (let y = startY; y < pHeight; y += lineSpacing) {
        ctx.fillRect(0, y, pWidth, 1)
      }
    } else if (background === "grid") {
      ctx.fillStyle = lineColor
      const startY = Math.ceil(marginTop / lineSpacing) * lineSpacing
      // Vertical lines
      for (let x = 0; x <= pWidth; x += lineSpacing) {
        ctx.fillRect(x, marginTop, 1, pHeight - marginTop)
      }
      // Horizontal lines
      for (let y = startY; y < pHeight; y += lineSpacing) {
        ctx.fillRect(0, y, pWidth, 1)
      }
    } else if (background === "dot-grid") {
      ctx.fillStyle = "rgba(140, 160, 200, 0.45)"
      const startY = Math.ceil(marginTop / lineSpacing) * lineSpacing
      for (let x = 0; x <= pWidth; x += lineSpacing) {
        for (let y = startY; y < pHeight; y += lineSpacing) {
          ctx.fillRect(x - 1, y - 1, 2, 2)
        }
      }
    }

    // Render handwrite strokes on this page
    for (const shape of shapes) {
      if (shape.type !== "handwrite") continue

      try {
        const pts = JSON.parse((shape.props.points as string) || "[]") as { x: number; y: number; z?: number }[]
        if (pts.length < 2) continue

        // Check if shape is on this page (any point within page bounds)
        const shapeY = shape.y
        if (shapeY > pageBottom + 50 || shapeY < pageTop - 200) continue

        const isHighlighter = shape.props.penType === "highlighter"
        const color = COLOR_MAP[shape.props.color as string] || (shape.props.color as string) || "#1d1d1d"
        const baseWidth = isHighlighter
          ? Math.max(SIZE_MAP[shape.props.size as string] || 5, 12)
          : (SIZE_MAP[shape.props.size as string] || 3)

        const toX = (px: number) => shape.x + px
        const toY = (py: number) => shape.y + py - pageTop

        ctx.globalAlpha = isHighlighter ? 0.35 : 1
        ctx.strokeStyle = color
        ctx.lineWidth = baseWidth
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

    // Render text-note shapes on this page
    for (const shape of shapes) {
      if (shape.type !== "text-note") continue

      const text = (shape.props.content as string) || ""
      if (!text.trim()) continue
      if (shape.y > pageBottom + 50 || shape.y < pageTop - 200) continue

      const sx = shape.x
      const sy = shape.y - pageTop
      const fontSize = 14

      ctx.fillStyle = "#1d1d1d"
      ctx.font = `${fontSize}px sans-serif`
      ctx.textAlign = "left"
      ctx.textBaseline = "top"

      const maxW = (shape.props.w as number) || 300
      const lines = text.split("\n")
      let lineY = sy
      for (const line of lines) {
        ctx.fillText(line, sx, lineY, maxW)
        lineY += fontSize * 1.4
      }
    }

    // Render geo shapes on this page
    for (const shape of shapes) {
      if (shape.type !== "geo") continue
      if (shape.y > pageBottom + 50 || shape.y < pageTop - 200) continue

      const w = (shape.props.w as number) || 100
      const h = (shape.props.h as number) || 100
      const sx = shape.x
      const sy = shape.y - pageTop

      ctx.strokeStyle = "#1d1d1d"
      ctx.lineWidth = 1.5

      const geo = shape.props.geo as string
      ctx.beginPath()
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

    // Add canvas image to PDF
    const imgData = canvas.toDataURL("image/png")
    pdf.addImage(imgData, "PNG", 0, 0, pWidth, pHeight)
  }

  // Save
  pdf.save(`${title || "canvas"}.pdf`)
}
