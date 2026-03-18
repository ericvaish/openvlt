"use client"

import {
  ShapeUtil,
  SVGContainer,
  TLBaseShape,
  Rectangle2d,
  type TLResizeInfo,
  type Geometry2d,
} from "tldraw"

// Augment the global shape props map
declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    handwrite: {
      w: number
      h: number
      color: string
      size: string
      points: string // JSON array of {x, y, z} — z is pressure
      isComplete: boolean
      penType: string // "pen" | "highlighter"
    }
  }
}

export type HandwriteShape = TLBaseShape<
  "handwrite",
  {
    w: number
    h: number
    color: string
    size: string
    points: string
    isComplete: boolean
    penType: string
  }
>

const SIZE_MAP: Record<string, number> = { xs: 0.75, s: 1.5, m: 3, l: 5, xl: 9 }

const COLOR_MAP: Record<string, string> = {
  black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
  violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
  yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
  "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
  white: "#FFFFFF",
}

/**
 * Build a smooth SVG path from raw points using quadratic bezier curves.
 * Same algorithm as the wet ink canvas overlay — ensures no visual "snap"
 * when transitioning from wet ink to final SVG shape.
 */
function buildSmoothPath(
  rawPoints: { x: number; y: number; z: number }[]
): string {
  if (rawPoints.length === 0) return ""
  if (rawPoints.length === 1) {
    const p = rawPoints[0]
    return `M ${p.x.toFixed(2)},${p.y.toFixed(2)} l 0.1,0`
  }
  if (rawPoints.length === 2) {
    return `M ${rawPoints[0].x.toFixed(2)},${rawPoints[0].y.toFixed(2)} L ${rawPoints[1].x.toFixed(2)},${rawPoints[1].y.toFixed(2)}`
  }

  let d = `M ${rawPoints[0].x.toFixed(2)},${rawPoints[0].y.toFixed(2)}`

  const mx1 = (rawPoints[0].x + rawPoints[1].x) / 2
  const my1 = (rawPoints[0].y + rawPoints[1].y) / 2
  d += ` L ${mx1.toFixed(2)},${my1.toFixed(2)}`

  for (let i = 1; i < rawPoints.length - 1; i++) {
    const mx = (rawPoints[i].x + rawPoints[i + 1].x) / 2
    const my = (rawPoints[i].y + rawPoints[i + 1].y) / 2
    d += ` Q ${rawPoints[i].x.toFixed(2)},${rawPoints[i].y.toFixed(2)} ${mx.toFixed(2)},${my.toFixed(2)}`
  }

  const last = rawPoints[rawPoints.length - 1]
  d += ` L ${last.x.toFixed(2)},${last.y.toFixed(2)}`

  return d
}

export class HandwriteShapeUtil extends ShapeUtil<HandwriteShape> {
  static override type = "handwrite" as const

  override getDefaultProps(): HandwriteShape["props"] {
    return {
      w: 1,
      h: 1,
      color: "black",
      size: "m",
      points: "[]",
      isComplete: false,
      penType: "pen",
    }
  }

  override getGeometry(shape: HandwriteShape): Geometry2d {
    return new Rectangle2d({
      width: Math.max(1, shape.props.w),
      height: Math.max(1, shape.props.h),
      isFilled: true,
    })
  }

  override canEdit() { return false }
  override canResize() { return false }
  override hideRotateHandle() { return true }
  override hideSelectionBoundsFg() { return true }

  override component(shape: HandwriteShape) {
    const rawPoints: { x: number; y: number; z: number }[] = JSON.parse(
      shape.props.points || "[]"
    )
    if (rawPoints.length === 0) return null

    const baseWidth = SIZE_MAP[shape.props.size] || SIZE_MAP.m
    const color = COLOR_MAP[shape.props.color] || COLOR_MAP.black
    const isHighlighter = shape.props.penType === "highlighter"
    const opacity = isHighlighter ? 0.35 : 1
    const strokeWidth = isHighlighter ? Math.max(baseWidth, 12) : baseWidth

    const d = buildSmoothPath(rawPoints)
    if (!d) return null

    return (
      <SVGContainer>
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      </SVGContainer>
    )
  }

  override indicator(shape: HandwriteShape) {
    const rawPoints: { x: number; y: number; z: number }[] = JSON.parse(
      shape.props.points || "[]"
    )
    if (rawPoints.length === 0) return null

    const d = buildSmoothPath(rawPoints)
    if (!d) return null
    return <path d={d} fill="none" />
  }

  override onResize(shape: HandwriteShape, info: TLResizeInfo<HandwriteShape>) {
    return { props: { w: shape.props.w, h: shape.props.h } }
  }
}
