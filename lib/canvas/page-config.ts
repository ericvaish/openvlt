// Page sizes in pixels (at 96 DPI)
export type PageSizeId = "a4" | "letter" | "legal" | "infinite"
export type BackgroundPattern = "blank" | "ruled" | "grid" | "dot-grid"
export type RuleStyle = "college" | "wide" | "narrow" | "custom"

export interface PageSize {
  id: PageSizeId
  label: string
  width: number // px (0 = infinite)
  height: number // px (0 = infinite)
}

export const PAGE_SIZES: PageSize[] = [
  { id: "a4", label: "A4", width: 794, height: 1123 }, // 210mm × 297mm at 96dpi
  { id: "letter", label: "Letter", width: 816, height: 1056 }, // 8.5" × 11" at 96dpi
  { id: "legal", label: "Legal", width: 816, height: 1344 }, // 8.5" × 14" at 96dpi
  { id: "infinite", label: "Infinite", width: 0, height: 0 },
]

export const BACKGROUND_PATTERNS: { id: BackgroundPattern; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "ruled", label: "Ruled" },
  { id: "grid", label: "Grid" },
  { id: "dot-grid", label: "Dot Grid" },
]

// Margins from top-left origin (like a notebook)
export const PAGE_MARGIN_LEFT = 60 // px — left margin (red line position)
export const PAGE_MARGIN_TOP = 60 // px — top margin before content/lines start

// Standard rule styles with their line spacing (at 96 DPI)
export const RULE_STYLES: { id: RuleStyle; label: string; spacing: number }[] = [
  { id: "college", label: "College", spacing: 27 },   // 7.1mm ≈ 27px
  { id: "wide", label: "Wide", spacing: 34 },          // 8.7mm ≈ 34px
  { id: "narrow", label: "Narrow", spacing: 20 },      // 5.3mm ≈ 20px
  { id: "custom", label: "Custom", spacing: 28 },      // user-defined
]

// Default line spacing for ruled/grid patterns
export const RULED_SPACING = 27 // px between ruled lines (college ruled default)
export const GRID_SPACING = 27 // px between grid lines
export const DOT_SPACING = 27 // px between dots

export const CANVAS_SETTINGS_KEY = "openvlt:canvas-settings"

// Gap between pages when multiple pages are used
export const PAGE_GAP = 40 // px

export interface CanvasSettings {
  pageSize: PageSizeId
  background: BackgroundPattern
  pageCount: number
  ruleStyle?: RuleStyle
  customSpacing?: number
  pressureSensitivity?: boolean
}

export function getCanvasSettings(): CanvasSettings {
  if (typeof window === "undefined")
    return { pageSize: "infinite", background: "blank", pageCount: 1 }
  try {
    const stored = localStorage.getItem(CANVAS_SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { pageCount: 1, ...parsed }
    }
  } catch {}
  return { pageSize: "infinite", background: "blank", pageCount: 1 }
}

export function saveCanvasSettings(settings: CanvasSettings) {
  localStorage.setItem(CANVAS_SETTINGS_KEY, JSON.stringify(settings))
}
