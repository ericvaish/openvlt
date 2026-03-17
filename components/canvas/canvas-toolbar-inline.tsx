"use client"

import * as React from "react"
import {
  MousePointerIcon,
  HandIcon,
  PenToolIcon,
  EraserIcon,
  SquareIcon,
  CircleIcon,
  TriangleIcon,
  MinusIcon,
  ArrowUpRightIcon,
  TypeIcon,
  Undo2Icon,
  Redo2Icon,
  ChevronDownIcon,
  GridIcon,
} from "lucide-react"
import {
  PAGE_SIZES,
  BACKGROUND_PATTERNS,
  type PageSizeId,
  type BackgroundPattern,
} from "@/lib/canvas/page-config"

const shapeTools = [
  { id: "geo-rectangle", geo: "rectangle", icon: SquareIcon, label: "Rectangle" },
  { id: "geo-ellipse", geo: "ellipse", icon: CircleIcon, label: "Ellipse" },
  { id: "geo-triangle", geo: "triangle", icon: TriangleIcon, label: "Triangle" },
  { id: "line", geo: null, icon: MinusIcon, label: "Line" },
  { id: "arrow", geo: null, icon: ArrowUpRightIcon, label: "Arrow" },
]

interface CanvasToolbarInlineProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
  pageSize: PageSizeId
  background: BackgroundPattern
  pageCount: number
  onPageSizeChange: (size: PageSizeId) => void
  onBackgroundChange: (bg: BackgroundPattern) => void
  onAddPage: () => void
  onRemovePage: () => void
}

export function CanvasToolbarInline({ editor, pageSize: initialPageSize, background: initialBackground, pageCount, onPageSizeChange, onBackgroundChange, onAddPage, onRemovePage }: CanvasToolbarInlineProps) {
  const [currentTool, setCurrentTool] = React.useState("hand")
  const [shapesOpen, setShapesOpen] = React.useState(false)
  const [pageMenuOpen, setPageMenuOpen] = React.useState(false)
  const pageMenuRef = React.useRef<HTMLDivElement>(null)
  const [currentPageSize, setCurrentPageSize] = React.useState(initialPageSize)
  const [currentBackground, setCurrentBackground] = React.useState(initialBackground)
  const [activeGeo, setActiveGeo] = React.useState("rectangle")
  const shapesRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!editor) return
    const interval = setInterval(() => {
      setCurrentTool(editor.getCurrentToolId())
    }, 100)
    return () => clearInterval(interval)
  }, [editor])

  React.useEffect(() => {
    if (!shapesOpen && !pageMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (shapesOpen && shapesRef.current && !shapesRef.current.contains(e.target as Node)) {
        setShapesOpen(false)
      }
      if (pageMenuOpen && pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
        setPageMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [shapesOpen, pageMenuOpen])

  if (!editor) return null

  function selectTool(toolId: string) {
    if (toolId.startsWith("geo-")) {
      const geo = toolId.replace("geo-", "")
      setActiveGeo(geo)
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { GeoShapeGeoStyle } = require("@tldraw/tlschema")
        editor.setStyleForNextShapes(GeoShapeGeoStyle, geo)
      } catch {}
      editor.setCurrentTool("geo")
    } else if (toolId === "line") {
      editor.setCurrentTool("line")
    } else if (toolId === "arrow") {
      editor.setCurrentTool("arrow")
    } else {
      editor.setCurrentTool(toolId)
    }
    setShapesOpen(false)
  }

  const ActiveShapeIcon =
    shapeTools.find((s) => s.geo === activeGeo)?.icon ?? SquareIcon
  const isGeoActive = currentTool === "geo"

  const btn = (active: boolean) =>
    `flex size-7 items-center justify-center rounded transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`

  return (
    <div className="flex items-center gap-0.5">
      <button onClick={() => selectTool("select")} className={btn(currentTool === "select")} title="Select (V)">
        <MousePointerIcon className="size-3.5" />
      </button>
      <button onClick={() => selectTool("hand")} className={btn(currentTool === "hand")} title="Hand (H)">
        <HandIcon className="size-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-border" />

      <button onClick={() => selectTool("draw")} className={btn(currentTool === "draw")} title="Pen (D)">
        <PenToolIcon className="size-3.5" />
      </button>
      <button onClick={() => selectTool("eraser")} className={btn(currentTool === "eraser")} title="Eraser (E)">
        <EraserIcon className="size-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-border" />

      {/* Shapes */}
      <div ref={shapesRef} className="relative">
        <button
          onClick={() => isGeoActive ? setShapesOpen(!shapesOpen) : selectTool(`geo-${activeGeo}`)}
          className={btn(isGeoActive)}
          title="Shapes"
        >
          <ActiveShapeIcon className="size-3.5" />
        </button>
        <button
          onClick={() => setShapesOpen(!shapesOpen)}
          className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center text-muted-foreground"
        >
          <ChevronDownIcon className="size-2" />
        </button>
        {shapesOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex gap-0.5 rounded-lg border bg-background p-1 shadow-md">
            {shapeTools.map((s) => (
              <button
                key={s.id}
                onClick={() => selectTool(s.id)}
                className={`flex size-7 items-center justify-center rounded transition-colors ${
                  isGeoActive && activeGeo === (s.geo ?? s.id)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={s.label}
              >
                <s.icon className="size-3.5" />
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => selectTool("text-note")} className={btn(currentTool === "text-note")} title="Text (T)">
        <TypeIcon className="size-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-border" />

      <button onClick={() => editor.undo()} className={btn(false)} title="Undo" disabled={!editor.getCanUndo()} style={{ opacity: editor.getCanUndo() ? 1 : 0.3 }}>
        <Undo2Icon className="size-3.5" />
      </button>
      <button onClick={() => editor.redo()} className={btn(false)} title="Redo" disabled={!editor.getCanRedo()} style={{ opacity: editor.getCanRedo() ? 1 : 0.3 }}>
        <Redo2Icon className="size-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-border" />

      {/* Page & Background */}
      <div ref={pageMenuRef} className="relative">
        <button
          onClick={() => setPageMenuOpen(!pageMenuOpen)}
          className={btn(pageMenuOpen)}
          title="Page & Background"
        >
          <GridIcon className="size-3.5" />
        </button>
        {pageMenuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-md" style={{ minWidth: 180 }}>
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Page Size</div>
              <div className="flex flex-wrap gap-1">
                {PAGE_SIZES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setCurrentPageSize(p.id); onPageSizeChange(p.id); }}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      currentPageSize === p.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Background</div>
              <div className="flex flex-wrap gap-1">
                {BACKGROUND_PATTERNS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => { setCurrentBackground(b.id); onBackgroundChange(b.id); }}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      currentBackground === b.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
