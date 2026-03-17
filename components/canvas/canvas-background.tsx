"use client"

import * as React from "react"
import { useEditor } from "tldraw"
import {
  type BackgroundPattern,
  type PageSizeId,
  PAGE_SIZES,
  PAGE_MARGIN_LEFT,
  PAGE_MARGIN_TOP,
  PAGE_GAP,
  RULED_SPACING,
  GRID_SPACING,
  DOT_SPACING,
} from "@/lib/canvas/page-config"

interface CanvasBackgroundProps {
  x: number
  y: number
  z: number
  size: number
  pageSize: PageSizeId
  background: BackgroundPattern
  pageCount: number
}

export function CanvasBackground({
  x,
  y,
  z,
  pageSize,
  background,
  pageCount,
}: CanvasBackgroundProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const editor = useEditor()

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const maybeCtx = canvas.getContext("2d")
    if (!maybeCtx) return
    const ctx = maybeCtx

    const dpr = window.devicePixelRatio || 1
    const screenBounds = editor.getViewportScreenBounds()
    const w = screenBounds.w || canvas.parentElement?.clientWidth || window.innerWidth
    const h = screenBounds.h || canvas.parentElement?.clientHeight || window.innerHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const pageDef = PAGE_SIZES.find((p) => p.id === pageSize)
    const isInfinite = !pageDef || pageDef.width === 0
    const pages = Math.max(1, pageCount)

    // Draw page boundaries for fixed-size pages
    if (!isInfinite && pageDef) {
      // Grey background for area outside pages
      ctx.fillStyle = "#f0f0f0"
      ctx.fillRect(0, 0, w, h)

      for (let i = 0; i < pages; i++) {
        const pageOffsetY = i * (pageDef.height + PAGE_GAP)
        const pageLeft = (0 + x) * z
        const pageTop = (pageOffsetY + y) * z
        const pageRight = (pageDef.width + x) * z
        const pageBottom = (pageOffsetY + pageDef.height + y) * z

        // White page
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(pageLeft, pageTop, pageRight - pageLeft, pageBottom - pageTop)

        // Page border
        ctx.strokeStyle = "#d1d5db"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.rect(pageLeft, pageTop, pageRight - pageLeft, pageBottom - pageTop)
        ctx.stroke()
      }
    }

    if (background === "blank") return

    // Calculate visible area in page space
    const viewLeft = -x
    const viewTop = -y
    const viewRight = viewLeft + w / z
    const viewBottom = viewTop + h / z

    // For infinite mode, draw one continuous set of lines
    // For fixed pages, draw lines per page
    const totalHeight = isInfinite
      ? viewBottom
      : pages * (pageDef!.height + PAGE_GAP) - PAGE_GAP
    const drawLeft = Math.max(0, isInfinite ? viewLeft : 0)
    const drawRight = isInfinite ? viewRight : (pageDef?.width ?? viewRight)

    const isDark = document.documentElement.classList.contains("dark")

    // Helper: draw a horizontal line using fillRect (works reliably on all browsers)
    function hLine(sx: number, sy: number, ex: number, color: string, thickness = 1) {
      ctx.fillStyle = color
      ctx.fillRect(sx, sy - thickness / 2, ex - sx, thickness)
    }

    // Helper: draw a vertical line using fillRect
    function vLine(sx: number, sy: number, ey: number, color: string, thickness = 1) {
      ctx.fillStyle = color
      ctx.fillRect(sx - thickness / 2, sy, thickness, ey - sy)
    }

    const lineColor = isDark ? "rgba(140,160,200,0.25)" : "rgba(140,160,200,0.35)"
    const marginColor = isDark ? "rgba(255,100,100,0.25)" : "rgba(255,100,100,0.3)"

    // For fixed pages, draw lines per page. For infinite, draw one continuous set.
    const pageRegions: { top: number; bottom: number }[] = []
    if (isInfinite) {
      pageRegions.push({ top: PAGE_MARGIN_TOP, bottom: viewBottom })
    } else {
      for (let i = 0; i < pages; i++) {
        const offset = i * (pageDef!.height + PAGE_GAP)
        pageRegions.push({
          top: offset + PAGE_MARGIN_TOP,
          bottom: offset + pageDef!.height,
        })
      }
    }

    for (const region of pageRegions) {
      if (background === "ruled") {
        const spacing = RULED_SPACING
        const startY = Math.ceil(region.top / spacing) * spacing

        // Red margin line
        const marginScreenX = (PAGE_MARGIN_LEFT + x) * z
        const topScreen = Math.max(0, (region.top + y) * z)
        const bottomScreen = Math.min(h, (region.bottom + y) * z)
        if (topScreen < h && bottomScreen > 0) {
          vLine(marginScreenX, topScreen, bottomScreen, marginColor)
        }

        // Horizontal ruled lines
        for (let py = startY; py <= region.bottom; py += spacing) {
          const screenY = (py + y) * z
          if (screenY >= 0 && screenY <= h) {
            const left = Math.max(0, (drawLeft + x) * z)
            const right = isInfinite ? w : (drawRight + x) * z
            hLine(left, screenY, right, lineColor)
          }
        }
      }

      if (background === "grid") {
        const spacing = GRID_SPACING
        const startX = Math.ceil(drawLeft / spacing) * spacing
        const startY = Math.ceil(region.top / spacing) * spacing

        for (let px = startX; px <= drawRight; px += spacing) {
          const screenX = (px + x) * z
          if (screenX >= 0 && screenX <= w) {
            const top = Math.max(0, (region.top + y) * z)
            const bottom = Math.min(h, (region.bottom + y) * z)
            if (top < h && bottom > 0) {
              vLine(screenX, top, bottom, lineColor)
            }
          }
        }
        for (let py = startY; py <= region.bottom; py += spacing) {
          const screenY = (py + y) * z
          if (screenY >= 0 && screenY <= h) {
            const left = Math.max(0, (drawLeft + x) * z)
            const right = isInfinite ? w : Math.min(w, (drawRight + x) * z)
            hLine(left, screenY, right, lineColor)
          }
        }
      }

      if (background === "dot-grid") {
        const spacing = DOT_SPACING
        const dotSize = Math.max(1.5, 2 * z)
        const dotColor = isDark ? "rgba(140,160,200,0.3)" : "rgba(140,160,200,0.45)"

        const startX = Math.ceil(drawLeft / spacing) * spacing
        const startY = Math.ceil(region.top / spacing) * spacing

        ctx.fillStyle = dotColor
        for (let px = startX; px <= drawRight; px += spacing) {
          for (let py = startY; py <= region.bottom; py += spacing) {
            const screenX = (px + x) * z
            const screenY = (py + y) * z
            if (screenX >= 0 && screenX <= w && screenY >= 0 && screenY <= h) {
              ctx.fillRect(screenX - dotSize / 2, screenY - dotSize / 2, dotSize, dotSize)
            }
          }
        }
      }
    }
  }, [x, y, z, pageSize, background, editor])

  return <canvas ref={canvasRef} className="tl-grid" />
}
