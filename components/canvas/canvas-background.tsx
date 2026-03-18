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
  lineSpacing?: number
}

interface BgData {
  bgRect: { w: number; h: number } | null
  pageRects: { x: number; y: number; w: number; h: number }[]
  linesPath: string
  linesColor: string
  marginPath: string
  marginColor: string
  dotsPath: string
  dotsColor: string
}

function computeBgData(
  x: number, y: number, z: number,
  pageSize: PageSizeId, background: BackgroundPattern,
  pageCount: number, lineSpacingProp: number | undefined,
  w: number, h: number, isDark: boolean,
): BgData {
  const pageDef = PAGE_SIZES.find((p) => p.id === pageSize)
  const isInfinite = !pageDef || pageDef.width === 0
  const pages = Math.max(1, pageCount)

  const lineColor = isDark ? "rgba(140,160,200,0.25)" : "rgba(140,160,200,0.35)"
  const mColor = isDark ? "rgba(255,100,100,0.25)" : "rgba(255,100,100,0.3)"

  const data: BgData = {
    bgRect: null,
    pageRects: [],
    linesPath: "",
    linesColor: lineColor,
    marginPath: "",
    marginColor: mColor,
    dotsPath: "",
    dotsColor: isDark ? "rgba(140,160,200,0.3)" : "rgba(140,160,200,0.45)",
  }

  // Page boundaries
  if (!isInfinite && pageDef) {
    data.bgRect = { w, h }
    for (let i = 0; i < pages; i++) {
      const pageOffsetY = i * (pageDef.height + PAGE_GAP)
      data.pageRects.push({
        x: x * z,
        y: (pageOffsetY + y) * z,
        w: pageDef.width * z,
        h: pageDef.height * z,
      })
    }
  }

  if (background === "blank") return data

  const viewLeft = -x
  const viewTop = -y
  const viewRight = viewLeft + w / z
  const viewBottom = viewTop + h / z
  const drawLeft = Math.max(0, isInfinite ? viewLeft : 0)
  const drawRight = isInfinite ? viewRight : (pageDef?.width ?? viewRight)

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

  let linesPath = ""
  let marginPath = ""
  let dotsPath = ""

  for (const region of pageRegions) {
    if (background === "ruled") {
      const spacing = lineSpacingProp ?? RULED_SPACING
      const startY = Math.ceil(region.top / spacing) * spacing

      // Red margin line
      const mx = (PAGE_MARGIN_LEFT + x) * z
      const t = Math.max(0, (region.top + y) * z)
      const b = Math.min(h, (region.bottom + y) * z)
      if (t < h && b > 0) {
        marginPath += `M${mx},${t}L${mx},${b}`
      }

      // Horizontal ruled lines
      for (let py = startY; py <= region.bottom; py += spacing) {
        const sy = (py + y) * z
        if (sy >= 0 && sy <= h) {
          const left = Math.max(0, (drawLeft + x) * z)
          const right = isInfinite ? w : (drawRight + x) * z
          linesPath += `M${left},${sy}L${right},${sy}`
        }
      }
    }

    if (background === "grid") {
      const spacing = lineSpacingProp ?? GRID_SPACING
      const startX = Math.ceil(drawLeft / spacing) * spacing
      const startY = Math.ceil(region.top / spacing) * spacing

      for (let px = startX; px <= drawRight; px += spacing) {
        const sx = (px + x) * z
        if (sx >= 0 && sx <= w) {
          const t = Math.max(0, (region.top + y) * z)
          const b = Math.min(h, (region.bottom + y) * z)
          if (t < h && b > 0) {
            linesPath += `M${sx},${t}L${sx},${b}`
          }
        }
      }
      for (let py = startY; py <= region.bottom; py += spacing) {
        const sy = (py + y) * z
        if (sy >= 0 && sy <= h) {
          const left = Math.max(0, (drawLeft + x) * z)
          const right = isInfinite ? w : Math.min(w, (drawRight + x) * z)
          linesPath += `M${left},${sy}L${right},${sy}`
        }
      }
    }

    if (background === "dot-grid") {
      const spacing = lineSpacingProp ?? DOT_SPACING
      const dotSize = Math.max(1.5, 2 * z)
      const startX = Math.ceil(drawLeft / spacing) * spacing
      const startY = Math.ceil(region.top / spacing) * spacing

      for (let px = startX; px <= drawRight; px += spacing) {
        for (let py = startY; py <= region.bottom; py += spacing) {
          const sx = (px + x) * z
          const sy = (py + y) * z
          if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) {
            dotsPath += `M${sx - dotSize / 2},${sy - dotSize / 2}h${dotSize}v${dotSize}h${-dotSize}z`
          }
        }
      }
    }
  }

  data.linesPath = linesPath
  data.marginPath = marginPath
  data.dotsPath = dotsPath
  return data
}

export function CanvasBackground({
  x,
  y,
  z,
  pageSize,
  background,
  pageCount,
  lineSpacing: lineSpacingProp,
}: CanvasBackgroundProps) {
  const editor = useEditor()

  const screenBounds = editor.getViewportScreenBounds()
  const w = screenBounds.w || window.innerWidth
  const h = screenBounds.h || window.innerHeight
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")

  const data = computeBgData(x, y, z, pageSize, background, pageCount, lineSpacingProp, w, h, isDark)

  return (
    <svg className="tl-grid" aria-hidden="true" style={{ pointerEvents: "none" }}>
      {data.bgRect && (
        <rect x={0} y={0} width={data.bgRect.w} height={data.bgRect.h} fill="#f0f0f0" />
      )}
      {data.pageRects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#ffffff" stroke="#d1d5db" strokeWidth={1} />
      ))}
      {data.marginPath && (
        <path d={data.marginPath} stroke={data.marginColor} strokeWidth={1} fill="none" />
      )}
      {data.linesPath && (
        <path d={data.linesPath} stroke={data.linesColor} strokeWidth={1} fill="none" />
      )}
      {data.dotsPath && (
        <path d={data.dotsPath} fill={data.dotsColor} />
      )}
    </svg>
  )
}
