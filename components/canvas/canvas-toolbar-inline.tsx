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
  LassoIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import {
  PAGE_SIZES,
  BACKGROUND_PATTERNS,
  RULE_STYLES,
  type PageSizeId,
  type BackgroundPattern,
  type RuleStyle,
} from "@/lib/canvas/page-config"
import {
  getPenPresets,
  savePenPresets,
  getActivePenIndex,
  setActivePenIndex,
  COLOR_HEX,
  STROKE_COLORS,
  type PenPreset,
} from "@/lib/canvas/pen-presets"
import { GeoShapeGeoStyle } from "@tldraw/tlschema"

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
  const [activeEraser, setActiveEraser] = React.useState<"eraser" | "pixel-eraser">("eraser")
  const [eraserMenuOpen, setEraserMenuOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState(false)
  const shapesRef = React.useRef<HTMLDivElement>(null)
  const eraserRef = React.useRef<HTMLDivElement>(null)

  // Pen presets
  const [penPresets, setPenPresets] = React.useState<PenPreset[]>(() => getPenPresets())
  const [activePenIdx, setActivePenIdx] = React.useState(() => getActivePenIndex())
  const [penSettingsOpen, setPenSettingsOpen] = React.useState<number | null>(null)
  const penSettingsRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!editor) return
    const interval = setInterval(() => {
      setCurrentTool(editor.getCurrentToolId())
    }, 100)
    return () => clearInterval(interval)
  }, [editor])

  React.useEffect(() => {
    if (!shapesOpen && !pageMenuOpen && !strokeMenuOpen && !eraserMenuOpen && penSettingsOpen === null) return
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
      if (eraserMenuOpen && eraserRef.current && !eraserRef.current.contains(e.target as Node)) {
        setEraserMenuOpen(false)
      }
      if (penSettingsOpen !== null && penSettingsRef.current && !penSettingsRef.current.contains(e.target as Node)) {
        setPenSettingsOpen(null)
      }
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("touchstart", handler as EventListener)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("touchstart", handler as EventListener)
    }
  }, [shapesOpen, pageMenuOpen, strokeMenuOpen, eraserMenuOpen, penSettingsOpen])

  const [currentRuleStyle, setCurrentRuleStyle] = React.useState(ruleStyle)
  const [currentCustomSpacing, setCurrentCustomSpacing] = React.useState(customSpacing)
  const [currentPressure, setCurrentPressure] = React.useState(pressureSensitivity)
  const [currentDrawWithFinger, setCurrentDrawWithFinger] = React.useState(drawWithFinger)
  const [currentSnapToShape, setCurrentSnapToShape] = React.useState(() => {
    try {
      const stored = localStorage.getItem("openvlt:canvas-settings")
      if (stored) return JSON.parse(stored).snapToShape === true
    } catch {}
    return false
  })

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
        // GeoShapeGeoStyle imported at top level
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
      <button onClick={() => selectTool("lasso")} className={btn(currentTool === "lasso")} title="Lasso Select (L)">
        <LassoIcon className="size-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-px bg-border" />

      {/* Pen presets */}
      {penPresets.map((preset, idx) => (
        <div key={preset.id} ref={penSettingsOpen === idx ? penSettingsRef : undefined} className="relative">
          <button
            onClick={() => {
              setActivePenIdx(idx)
              setActivePenIndex(idx)
              savePenPresets(penPresets)
              selectTool("handwrite")
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setPenSettingsOpen(penSettingsOpen === idx ? null : idx)
            }}
            onDoubleClick={() => {
              setPenSettingsOpen(penSettingsOpen === idx ? null : idx)
            }}
            className={btn(activePenIdx === idx && (currentTool === "handwrite" || currentTool === "draw"))}
            title={`${preset.type === "highlighter" ? "Highlighter" : "Pen"} — ${preset.color} ${preset.size.toUpperCase()} (double-click to edit)`}
          >
            {preset.type === "highlighter" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={preset.color === "black" ? "currentColor" : (COLOR_HEX[preset.color] || "currentColor")} strokeWidth="2.5" strokeLinecap="round">
                <path d="M4 18h8" />
                <path d="M4 14h12" opacity="0.5" />
              </svg>
            ) : (
              <PenToolIcon className="size-3.5" style={{ color: preset.color === "black" || preset.color === "white" ? undefined : (COLOR_HEX[preset.color] || undefined) }} />
            )}
          </button>
          {penSettingsOpen === idx && (
            <div className="absolute left-0 top-full z-50 mt-1 flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-md" style={{ minWidth: 200 }}>
              {/* Type toggle */}
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Type</div>
                <div className="flex gap-1">
                  {(["pen", "highlighter"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        const updated = [...penPresets]
                        updated[idx] = { ...updated[idx], type: t }
                        setPenPresets(updated)
                        savePenPresets(updated)
                      }}
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        preset.type === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {t === "pen" ? "Pen" : "Highlighter"}
                    </button>
                  ))}
                </div>
              </div>
              {/* Size */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Size</span>
                  <span className="text-[10px] text-muted-foreground">{preset.size.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">Thin</span>
                  <input
                    type="range" min={0} max={4} step={1}
                    value={["xs", "s", "m", "l", "xl"].indexOf(preset.size)}
                    onChange={(e) => {
                      const sizes = ["xs", "s", "m", "l", "xl"] as const
                      const updated = [...penPresets]
                      updated[idx] = { ...updated[idx], size: sizes[parseInt(e.target.value)] }
                      setPenPresets(updated)
                      savePenPresets(updated)
                    }}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                  />
                  <span className="text-[9px] text-muted-foreground">Thick</span>
                </div>
              </div>
              {/* Color */}
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">Color</div>
                <div className="flex flex-wrap gap-1">
                  {STROKE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        const updated = [...penPresets]
                        updated[idx] = { ...updated[idx], color: c }
                        setPenPresets(updated)
                        savePenPresets(updated)
                      }}
                      className="rounded-full"
                      style={{
                        width: 20, height: 20,
                        background: COLOR_HEX[c],
                        border: preset.color === c
                          ? "2px solid var(--color-primary, #3b82f6)"
                          : "1px solid #d1d5db",
                        cursor: "pointer", padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
              {/* Delete preset */}
              {penPresets.length > 1 && (
                <button
                  onClick={() => {
                    const updated = penPresets.filter((_, i) => i !== idx)
                    setPenPresets(updated)
                    savePenPresets(updated)
                    if (activePenIdx >= updated.length) {
                      setActivePenIdx(updated.length - 1)
                      setActivePenIndex(updated.length - 1)
                    }
                    setPenSettingsOpen(null)
                  }}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2Icon className="size-3" />
                  Delete preset
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {/* Add new pen preset */}
      <button
        onClick={() => {
          const newPreset: PenPreset = {
            id: `pen-${Date.now()}`,
            type: "pen",
            color: "black",
            size: "m",
          }
          const updated = [...penPresets, newPreset]
          setPenPresets(updated)
          savePenPresets(updated)
          const newIdx = updated.length - 1
          setActivePenIdx(newIdx)
          setActivePenIndex(newIdx)
          setPenSettingsOpen(newIdx)
          selectTool("handwrite")
        }}
        className={btn(false)}
        title="Add pen preset"
      >
        <PlusIcon className="size-3.5" />
      </button>
      {/* Eraser — single tap uses active eraser, double tap opens menu */}
      <div ref={eraserRef} className="relative">
        <button
          onClick={() => selectTool(activeEraser)}
          onDoubleClick={() => setEraserMenuOpen(!eraserMenuOpen)}
          className={btn(currentTool === "eraser" || currentTool === "pixel-eraser")}
          title={`${activeEraser === "eraser" ? "Stroke Eraser" : "Pixel Eraser"} (double-click to switch)`}
        >
          <EraserIcon className="size-3.5" />
        </button>
        <span className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center text-muted-foreground pointer-events-none">
          <ChevronDownIcon className="size-2" />
        </span>
        {eraserMenuOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex flex-col gap-0.5 rounded-lg border bg-background p-1 shadow-md" style={{ minWidth: 140 }}>
            <button
              onClick={() => { setActiveEraser("eraser"); selectTool("eraser"); setEraserMenuOpen(false) }}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                activeEraser === "eraser"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <EraserIcon className="size-3.5" />
              Stroke Eraser
            </button>
            <button
              onClick={() => { setActiveEraser("pixel-eraser"); selectTool("pixel-eraser"); setEraserMenuOpen(false) }}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                activeEraser === "pixel-eraser"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <EraserIcon className="size-3.5" />
              Pixel Eraser
            </button>
          </div>
        )}
      </div>


      <div className="mx-0.5 h-4 w-px bg-border" />

      {/* Shapes — single tap opens menu */}
      <div ref={shapesRef} className="relative">
        <button
          onClick={() => setShapesOpen(!shapesOpen)}
          className={btn(isGeoActive)}
          title="Shapes"
        >
          <ActiveShapeIcon className="size-3.5" />
        </button>
        <span className="absolute -bottom-0.5 -right-0.5 flex size-2.5 items-center justify-center text-muted-foreground pointer-events-none">
          <ChevronDownIcon className="size-2" />
        </span>
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
            {/* Drawing settings */}
            <div className="border-t pt-2 mt-1 flex flex-col gap-2">
              {([
                { label: "Pressure", value: currentPressure, onChange: (v: boolean) => {
                  setCurrentPressure(v)
                  onPressureSensitivityChange(v)
                  try { const s = JSON.parse(localStorage.getItem("openvlt:canvas-settings") || "{}"); s.pressureSensitivity = v; localStorage.setItem("openvlt:canvas-settings", JSON.stringify(s)) } catch {}
                }},
                { label: "Draw with finger", value: currentDrawWithFinger, onChange: (v: boolean) => { setCurrentDrawWithFinger(v); onDrawWithFingerChange(v) }},
                { label: "Snap to shape", value: currentSnapToShape, onChange: (v: boolean) => {
                  setCurrentSnapToShape(v)
                  try { const s = JSON.parse(localStorage.getItem("openvlt:canvas-settings") || "{}"); s.snapToShape = v; localStorage.setItem("openvlt:canvas-settings", JSON.stringify(s)) } catch {}
                }},
              ] as const).map(({ label, value, onChange }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">{label}</span>
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onChange(!value) }}
                    style={{
                      position: "relative", width: 36, height: 20, borderRadius: 10, border: "none",
                      background: value ? "var(--color-primary, #3b82f6)" : "#71717a",
                      cursor: "pointer", padding: 0, transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 2, left: value ? 18 : 2, width: 16, height: 16,
                      borderRadius: 8, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
