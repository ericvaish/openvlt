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
  ChevronUpIcon,
  PanelTopCloseIcon,
} from "lucide-react"

interface CanvasToolbarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
  collapsed: boolean
  onToggleCollapse: () => void
  compact: boolean
  onToggleCompact: () => void
}

const shapeTools = [
  { id: "geo-rectangle", geo: "rectangle", icon: SquareIcon, label: "Rectangle", kbd: "R" },
  { id: "geo-ellipse", geo: "ellipse", icon: CircleIcon, label: "Ellipse" },
  { id: "geo-triangle", geo: "triangle", icon: TriangleIcon, label: "Triangle" },
  { id: "line", geo: null, icon: MinusIcon, label: "Line", kbd: "L" },
  { id: "arrow", geo: null, icon: ArrowUpRightIcon, label: "Arrow", kbd: "A" },
]

export function CanvasToolbar({
  editor,
  collapsed,
  onToggleCollapse,
  compact,
  onToggleCompact,
}: CanvasToolbarProps) {
  const [currentTool, setCurrentTool] = React.useState("select")
  const [shapesOpen, setShapesOpen] = React.useState(false)
  const [activeGeo, setActiveGeo] = React.useState("rectangle")
  const shapesRef = React.useRef<HTMLDivElement>(null)

  // Sync current tool from editor
  React.useEffect(() => {
    if (!editor) return
    const interval = setInterval(() => {
      setCurrentTool(editor.getCurrentToolId())
    }, 100)
    return () => clearInterval(interval)
  }, [editor])

  // Close shapes dropdown when clicking outside
  React.useEffect(() => {
    if (!shapesOpen) return
    const handler = (e: MouseEvent) => {
      if (shapesRef.current && !shapesRef.current.contains(e.target as Node)) {
        setShapesOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [shapesOpen])

  if (!editor) return null

  function selectTool(toolId: string) {
    if (toolId.startsWith("geo-")) {
      const geo = toolId.replace("geo-", "")
      setActiveGeo(geo)
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { GeoShapeGeoStyle } = require("@tldraw/tlschema")
        editor.setStyleForNextShapes(GeoShapeGeoStyle, geo)
      } catch {
        // Fallback if import fails
      }
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

  if (collapsed) {
    return (
      <div className="flex items-center justify-center border-b bg-background py-1">
        <button
          onClick={onToggleCollapse}
          className="text-xs text-muted-foreground hover:text-foreground"
          title="Show toolbar"
        >
          <ChevronDownIcon className="size-4" />
        </button>
      </div>
    )
  }

  const btnClass = (active: boolean) =>
    `flex items-center justify-center rounded-md transition-colors ${
      compact ? "size-7" : "size-8"
    } ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`

  return (
    <div className="flex items-center gap-1 border-b bg-background px-2 py-1">
      {/* Select */}
      <button
        onClick={() => selectTool("select")}
        className={btnClass(currentTool === "select")}
        title="Select (V)"
      >
        <MousePointerIcon className={compact ? "size-3.5" : "size-4"} />
      </button>

      {/* Hand / Pan */}
      <button
        onClick={() => selectTool("hand")}
        className={btnClass(currentTool === "hand")}
        title="Hand / Pan (H)"
      >
        <HandIcon className={compact ? "size-3.5" : "size-4"} />
      </button>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Draw / Pen */}
      <button
        onClick={() => selectTool("draw")}
        className={btnClass(currentTool === "draw")}
        title="Pen (D)"
      >
        <PenToolIcon className={compact ? "size-3.5" : "size-4"} />
      </button>

      {/* Eraser */}
      <button
        onClick={() => selectTool("eraser")}
        className={btnClass(currentTool === "eraser")}
        title="Eraser (E)"
      >
        <EraserIcon className={compact ? "size-3.5" : "size-4"} />
      </button>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Shapes dropdown */}
      <div ref={shapesRef} className="relative">
        <button
          onClick={() => {
            if (isGeoActive) {
              setShapesOpen(!shapesOpen)
            } else {
              selectTool(`geo-${activeGeo}`)
            }
          }}
          className={btnClass(isGeoActive)}
          title="Shapes"
        >
          <ActiveShapeIcon className={compact ? "size-3.5" : "size-4"} />
        </button>
        {/* Dropdown arrow */}
        <button
          onClick={() => setShapesOpen(!shapesOpen)}
          className="absolute -bottom-0.5 -right-0.5 flex size-3 items-center justify-center rounded-sm bg-background text-muted-foreground"
        >
          <ChevronDownIcon className="size-2.5" />
        </button>

        {shapesOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border bg-background p-1.5 shadow-md">
            {shapeTools.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  selectTool(s.id)
                  setShapesOpen(false)
                }}
                className={`flex size-8 items-center justify-center rounded-md transition-colors ${
                  isGeoActive && activeGeo === (s.geo ?? s.id)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                title={s.label + (s.kbd ? ` (${s.kbd})` : "")}
              >
                <s.icon className="size-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Text */}
      <button
        onClick={() => selectTool("text-note")}
        className={btnClass(currentTool === "text-note")}
        title="Text (T)"
      >
        <TypeIcon className={compact ? "size-3.5" : "size-4"} />
      </button>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Undo / Redo */}
      <button
        onClick={() => editor.undo()}
        className={`${btnClass(false)} ${!editor.getCanUndo() ? "opacity-30" : ""}`}
        title="Undo (Ctrl+Z)"
        disabled={!editor.getCanUndo()}
      >
        <Undo2Icon className={compact ? "size-3.5" : "size-4"} />
      </button>
      <button
        onClick={() => editor.redo()}
        className={`${btnClass(false)} ${!editor.getCanRedo() ? "opacity-30" : ""}`}
        title="Redo (Ctrl+Shift+Z)"
        disabled={!editor.getCanRedo()}
      >
        <Redo2Icon className={compact ? "size-3.5" : "size-4"} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Compact toggle */}
      <button
        onClick={onToggleCompact}
        className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        title={compact ? "Full toolbar" : "Compact toolbar"}
      >
        <PanelTopCloseIcon className="size-3.5" />
      </button>

      {/* Collapse */}
      <button
        onClick={onToggleCollapse}
        className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        title="Collapse toolbar"
      >
        <ChevronUpIcon className="size-3.5" />
      </button>
    </div>
  )
}
