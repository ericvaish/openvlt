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
  GridIcon,
  PaletteIcon,
} from "lucide-react"
import {
  PAGE_SIZES,
  BACKGROUND_PATTERNS,
  RULE_STYLES,
  type PageSizeId,
  type BackgroundPattern,
  type RuleStyle,
} from "@/lib/canvas/page-config"

const shapeTools = [
  { id: "geo-rectangle", geo: "rectangle", icon: SquareIcon, label: "Rectangle" },
  { id: "geo-ellipse", geo: "ellipse", icon: CircleIcon, label: "Ellipse" },
  { id: "geo-triangle", geo: "triangle", icon: TriangleIcon, label: "Triangle" },
  { id: "line", geo: null, icon: MinusIcon, label: "Line" },
  { id: "arrow", geo: null, icon: ArrowUpRightIcon, label: "Arrow" },
]

const STROKE_COLORS = [
  "black", "grey", "blue", "light-blue", "violet",
  "light-violet", "red", "light-red", "orange", "yellow",
  "green", "light-green", "white",
] as const

const COLOR_HEX: Record<string, string> = {
  black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
  violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
  yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
  "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
  white: "#FFFFFF",
}

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
  strokeColor: string
  strokeSize: string
  onStrokeColorChange: (color: string) => void
  onStrokeSizeChange: (size: string) => void
  ruleStyle: RuleStyle
  customSpacing: number
  onRuleStyleChange: (style: RuleStyle) => void
  onCustomSpacingChange: (spacing: number) => void
  pressureSensitivity: boolean
  onPressureSensitivityChange: (enabled: boolean) => void
  drawWithFinger: boolean
  onDrawWithFingerChange: (enabled: boolean) => void
}

export function CanvasToolbarInline({ editor, pageSize: initialPageSize, background: initialBackground, pageCount, onPageSizeChange, onBackgroundChange, onAddPage, onRemovePage, strokeColor, strokeSize, onStrokeColorChange, onStrokeSizeChange, ruleStyle, customSpacing, onRuleStyleChange, onCustomSpacingChange, pressureSensitivity, onPressureSensitivityChange, drawWithFinger, onDrawWithFingerChange }: CanvasToolbarInlineProps) {
  const [currentTool, setCurrentTool] = React.useState("hand")
  const [shapesOpen, setShapesOpen] = React.useState(false)
  const [pageMenuOpen, setPageMenuOpen] = React.useState(false)
  const [strokeMenuOpen, setStrokeMenuOpen] = React.useState(false)
  const [currentStrokeColor, setCurrentStrokeColor] = React.useState(strokeColor)
  const [currentStrokeSize, setCurrentStrokeSize] = React.useState(strokeSize)
  const [strokeSaved, setStrokeSaved] = React.useState(false)
  const pageMenuRef = React.useRef<HTMLDivElement>(null)
  const strokeMenuRef = React.useRef<HTMLDivElement>(null)
  const [currentPageSize, setCurrentPageSize] = React.useState(initialPageSize)
  const [currentBackground, setCurrentBackground] = React.useState(initialBackground)
  const [activeGeo, setActiveGeo] = React.useState("rectangle")
  const [collapsed, setCollapsed] = React.useState(false)
  const shapesRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!editor) return
    const interval = setInterval(() => {
      setCurrentTool(editor.getCurrentToolId())
    }, 100)
    return () => clearInterval(interval)
  }, [editor])

  React.useEffect(() => {
    if (!shapesOpen && !pageMenuOpen && !strokeMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (shapesOpen && shapesRef.current && !shapesRef.current.contains(e.target as Node)) {
        setShapesOpen(false)
      }
      if (pageMenuOpen && pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
        setPageMenuOpen(false)
      }
      if (strokeMenuOpen && strokeMenuRef.current && !strokeMenuRef.current.contains(e.target as Node)) {
        setStrokeMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [shapesOpen, pageMenuOpen, strokeMenuOpen])

  const [currentRuleStyle, setCurrentRuleStyle] = React.useState(ruleStyle)
  const [currentCustomSpacing, setCurrentCustomSpacing] = React.useState(customSpacing)
  const [currentPressure, setCurrentPressure] = React.useState(pressureSensitivity)
  const [currentDrawWithFinger, setCurrentDrawWithFinger] = React.useState(drawWithFinger)

  if (!editor) return null

  if (collapsed) {
    return (
      <div className="flex items-center">
        <button onClick={() => setCollapsed(false)} className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Show toolbar">
          <ChevronDownIcon className="size-3.5" />
        </button>
      </div>
    )
  }

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

      <button onClick={() => selectTool("handwrite")} className={btn(currentTool === "handwrite" || currentTool === "draw")} title="Pen (D)">
        <PenToolIcon className="size-3.5" />
      </button>
      <button onClick={() => selectTool("eraser")} className={btn(currentTool === "eraser")} title="Eraser (E)">
        <EraserIcon className="size-3.5" />
      </button>

      {/* Stroke style dropdown */}
      <div ref={strokeMenuRef} className="relative">
        <button
          onClick={() => setStrokeMenuOpen(!strokeMenuOpen)}
          className={btn(strokeMenuOpen)}
          title="Stroke style"
        >
          <div className="flex items-center gap-0.5">
            <div className="rounded-full" style={{
              width: 10, height: 10,
              background: COLOR_HEX[currentStrokeColor] || "#1d1d1d",
              border: "1px solid #d1d5db",
            }} />
            <ChevronDownIcon className="size-2" />
          </div>
        </button>
        {strokeMenuOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-md" style={{ minWidth: 200 }}>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">Size</span>
                <span className="text-[10px] text-muted-foreground">{currentStrokeSize.toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground">Thin</span>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={["s", "m", "l", "xl"].indexOf(currentStrokeSize)}
                  onChange={(e) => {
                    const sizes = ["s", "m", "l", "xl"] as const
                    const s = sizes[parseInt(e.target.value)]
                    setCurrentStrokeSize(s)
                    onStrokeSizeChange(s)
                  }}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                />
                <span className="text-[9px] text-muted-foreground">Thick</span>
              </div>
              {/* Preview line */}
              <div className="mt-1.5 flex items-center justify-center rounded bg-muted/50 py-2">
                <div style={{
                  width: 80,
                  height: [1.5, 3, 5, 10][["s", "m", "l", "xl"].indexOf(currentStrokeSize)],
                  borderRadius: 999,
                  background: COLOR_HEX[currentStrokeColor] || "#1d1d1d",
                }} />
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Color</div>
              <div className="flex flex-wrap gap-1">
                {STROKE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setCurrentStrokeColor(c); onStrokeColorChange(c) }}
                    className="rounded-full"
                    style={{
                      width: 20, height: 20,
                      background: COLOR_HEX[c],
                      border: currentStrokeColor === c
                        ? "2px solid var(--color-primary, #3b82f6)"
                        : "1px solid #d1d5db",
                      cursor: "pointer", padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
            {/* Pressure sensitivity toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">Pressure</span>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const next = !currentPressure
                  setCurrentPressure(next)
                  onPressureSensitivityChange(next)
                  // Save immediately so handwrite tool picks it up
                  try {
                    const stored = localStorage.getItem("openvlt:canvas-settings")
                    const settings = stored ? JSON.parse(stored) : {}
                    settings.pressureSensitivity = next
                    localStorage.setItem("openvlt:canvas-settings", JSON.stringify(settings))
                  } catch {}
                }}
                style={{
                  position: "relative",
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  border: "none",
                  background: currentPressure ? "var(--color-primary, #3b82f6)" : "#71717a",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: currentPressure ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
            {/* Draw with finger toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase text-muted-foreground">Draw with finger</span>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const next = !currentDrawWithFinger
                  setCurrentDrawWithFinger(next)
                  onDrawWithFingerChange(next)
                }}
                style={{
                  position: "relative",
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  border: "none",
                  background: currentDrawWithFinger ? "var(--color-primary, #3b82f6)" : "#71717a",
                  cursor: "pointer",
                  padding: 0,
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: currentDrawWithFinger ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
            <button
              onClick={() => {
                localStorage.setItem("openvlt:stroke-defaults", JSON.stringify({
                  color: currentStrokeColor, size: currentStrokeSize,
                }))
                setStrokeSaved(true)
                setTimeout(() => setStrokeSaved(false), 1500)
              }}
              className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                strokeSaved
                  ? "bg-green-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {strokeSaved ? "Saved!" : "Set as default"}
            </button>
          </div>
        )}
      </div>

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
            {/* Rule style — only shown for ruled/grid/dot-grid backgrounds */}
            {currentBackground !== "blank" && (
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Line Spacing</div>
                <div className="flex flex-wrap gap-1">
                  {RULE_STYLES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setCurrentRuleStyle(r.id)
                        onRuleStyleChange(r.id)
                        if (r.id !== "custom") {
                          setCurrentCustomSpacing(r.spacing)
                          onCustomSpacingChange(r.spacing)
                        }
                      }}
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        currentRuleStyle === r.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {currentRuleStyle === "custom" && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground">Tight</span>
                    <input
                      type="range"
                      min={12}
                      max={50}
                      step={1}
                      value={currentCustomSpacing}
                      onChange={(e) => {
                        const v = parseInt(e.target.value)
                        setCurrentCustomSpacing(v)
                        onCustomSpacingChange(v)
                      }}
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                    />
                    <span className="text-[9px] text-muted-foreground">Wide</span>
                    <span className="text-[9px] text-muted-foreground w-6 text-right">{currentCustomSpacing}px</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
