export interface PenPreset {
  id: string
  type: "pen" | "highlighter"
  color: string
  size: string
}

const PRESETS_KEY = "openvlt:pen-presets"
const ACTIVE_KEY = "openvlt:active-pen"

const DEFAULT_PRESETS: PenPreset[] = [
  { id: "pen-1", type: "pen", color: "black", size: "xs" },
  { id: "pen-2", type: "pen", color: "blue", size: "m" },
  { id: "pen-3", type: "pen", color: "red", size: "m" },
  { id: "hl-1", type: "highlighter", color: "yellow", size: "l" },
]

export function getPenPresets(): PenPreset[] {
  if (typeof window === "undefined") return DEFAULT_PRESETS
  try {
    const stored = localStorage.getItem(PRESETS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return DEFAULT_PRESETS
}

export function savePenPresets(presets: PenPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

export function getActivePenIndex(): number {
  if (typeof window === "undefined") return 0
  try {
    const stored = localStorage.getItem(ACTIVE_KEY)
    if (stored !== null) return parseInt(stored) || 0
  } catch {}
  return 0
}

export function setActivePenIndex(index: number) {
  localStorage.setItem(ACTIVE_KEY, String(index))
}

export const COLOR_HEX: Record<string, string> = {
  black: "#1d1d1d", grey: "#9fa8b2", "light-violet": "#e085f4",
  violet: "#ae3ec9", blue: "#4465e9", "light-blue": "#4ba1f1",
  yellow: "#f1ac4b", orange: "#e16919", green: "#099268",
  "light-green": "#4cb05e", "light-red": "#f87777", red: "#e03131",
  white: "#FFFFFF",
}

export const STROKE_COLORS = [
  "black", "grey", "blue", "light-blue", "violet",
  "light-violet", "red", "light-red", "orange", "yellow",
  "green", "light-green", "white",
] as const
