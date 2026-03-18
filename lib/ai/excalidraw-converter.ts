import { v4 as uuid } from "uuid"

interface SkeletonElement {
  id?: string
  type: string
  x?: number
  y?: number
  width?: number
  height?: number
  backgroundColor?: string
  strokeColor?: string
  fillStyle?: string
  strokeWidth?: number
  strokeStyle?: string
  roughness?: number
  opacity?: number
  angle?: number
  label?: { text: string; fontSize?: number; fontFamily?: number }
  text?: string
  fontSize?: number
  fontFamily?: number
  textAlign?: string
  verticalAlign?: string
  points?: [number, number][]
  start?: { id: string }
  end?: { id: string }
  startArrowhead?: string | null
  endArrowhead?: string | null
  roundness?: { type: number; value?: number } | null
}

interface ExcalidrawElement {
  [key: string]: unknown
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647)
}

function baseElement(skeleton: SkeletonElement): ExcalidrawElement {
  return {
    id: skeleton.id || uuid(),
    type: skeleton.type,
    x: skeleton.x ?? 0,
    y: skeleton.y ?? 0,
    width: skeleton.width ?? 200,
    height: skeleton.height ?? 100,
    angle: skeleton.angle ?? 0,
    strokeColor: skeleton.strokeColor ?? "#1e1e1e",
    backgroundColor: skeleton.backgroundColor ?? "transparent",
    fillStyle: skeleton.fillStyle ?? "solid",
    strokeWidth: skeleton.strokeWidth ?? 2,
    strokeStyle: skeleton.strokeStyle ?? "solid",
    roughness: skeleton.roughness ?? 0,
    opacity: skeleton.opacity ?? 100,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    updated: Date.now(),
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    link: null,
    locked: false,
  }
}

function getRoundness(type: string): { type: number } | null {
  if (type === "rectangle") return { type: 3 }
  if (type === "diamond" || type === "ellipse") return { type: 2 }
  return null
}

function createTextElement(
  text: string,
  x: number,
  y: number,
  opts: {
    fontSize?: number
    fontFamily?: number
    textAlign?: string
    verticalAlign?: string
    containerId?: string | null
    width?: number
    height?: number
  } = {}
): ExcalidrawElement {
  const fontSize = opts.fontSize ?? 20
  const lineHeight = 1.25
  const lines = text.split("\n")
  const estWidth = opts.width ?? Math.max(...lines.map((l) => l.length * fontSize * 0.6))
  const estHeight = opts.height ?? lines.length * fontSize * lineHeight

  return {
    id: uuid(),
    type: "text",
    x,
    y,
    width: estWidth,
    height: estHeight,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    updated: Date.now(),
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    link: null,
    locked: false,
    roundness: null,
    text,
    originalText: text,
    fontSize,
    fontFamily: opts.fontFamily ?? 1,
    textAlign: opts.textAlign ?? "center",
    verticalAlign: opts.verticalAlign ?? "middle",
    containerId: opts.containerId ?? null,
    autoResize: true,
    lineHeight,
  }
}

/**
 * Convert skeleton elements (minimal format from AI tool calls) into
 * fully valid Excalidraw elements that can be saved directly to a .json file.
 */
export function convertSkeletonToExcalidraw(
  skeletons: SkeletonElement[]
): ExcalidrawElement[] {
  const result: ExcalidrawElement[] = []
  // Map skeleton IDs to generated IDs for arrow binding resolution
  const idMap = new Map<string, string>()

  // First pass: assign IDs
  for (const skeleton of skeletons) {
    const assignedId = skeleton.id || uuid()
    if (skeleton.id) {
      idMap.set(skeleton.id, assignedId)
    }
    skeleton.id = assignedId
  }

  // Second pass: build elements
  for (const skeleton of skeletons) {
    const type = skeleton.type

    if (type === "text") {
      const textEl = createTextElement(skeleton.text ?? "", skeleton.x ?? 0, skeleton.y ?? 0, {
        fontSize: skeleton.fontSize,
        fontFamily: skeleton.fontFamily,
        textAlign: skeleton.textAlign,
        verticalAlign: skeleton.verticalAlign,
        width: skeleton.width,
        height: skeleton.height,
      })
      textEl.id = skeleton.id!
      result.push(textEl)
      continue
    }

    if (type === "arrow" || type === "line") {
      const el = baseElement(skeleton)
      el.width = 0
      el.height = 0
      el.roundness = { type: 2 }
      el.points = skeleton.points ?? [[0, 0], [200, 0]]
      el.lastCommittedPoint = null

      if (type === "arrow") {
        el.startArrowhead = skeleton.startArrowhead ?? null
        el.endArrowhead = skeleton.endArrowhead ?? "arrow"
        el.elbowed = false

        if (skeleton.start?.id) {
          const targetId = idMap.get(skeleton.start.id) ?? skeleton.start.id
          el.startBinding = { elementId: targetId, focus: 0, gap: 5, fixedPoint: null }
        } else {
          el.startBinding = null
        }

        if (skeleton.end?.id) {
          const targetId = idMap.get(skeleton.end.id) ?? skeleton.end.id
          el.endBinding = { elementId: targetId, focus: 0, gap: 5, fixedPoint: null }
        } else {
          el.endBinding = null
        }
      } else {
        el.startBinding = null
        el.endBinding = null
        el.startArrowhead = null
        el.endArrowhead = null
      }

      // Handle label on arrow/line
      if (skeleton.label?.text) {
        const labelEl = createTextElement(skeleton.label.text, el.x as number, el.y as number, {
          fontSize: skeleton.label.fontSize ?? 16,
          fontFamily: skeleton.label.fontFamily,
          containerId: el.id as string,
        })
        el.boundElements = [{ type: "text", id: labelEl.id as string }]
        result.push(el, labelEl)
      } else {
        result.push(el)
      }
      continue
    }

    // Shape types: rectangle, diamond, ellipse
    if (["rectangle", "diamond", "ellipse"].includes(type)) {
      const el = baseElement(skeleton)
      el.roundness = skeleton.roundness !== undefined ? skeleton.roundness : getRoundness(type)

      if (skeleton.label?.text) {
        const labelEl = createTextElement(skeleton.label.text, (el.x as number) + (el.width as number) / 2, (el.y as number) + (el.height as number) / 2, {
          fontSize: skeleton.label.fontSize ?? 16,
          fontFamily: skeleton.label.fontFamily,
          containerId: el.id as string,
        })
        el.boundElements = [{ type: "text", id: labelEl.id as string }]
        result.push(el, labelEl)
      } else {
        result.push(el)
      }
      continue
    }

    // Fallback: treat as generic shape
    const el = baseElement(skeleton)
    el.roundness = getRoundness(type)
    result.push(el)
  }

  // Third pass: add arrow references to boundElements on shapes
  for (const el of result) {
    if (el.type !== "arrow") continue

    const startId = (el.startBinding as { elementId: string } | null)?.elementId
    const endId = (el.endBinding as { elementId: string } | null)?.elementId

    for (const targetId of [startId, endId]) {
      if (!targetId) continue
      const target = result.find((e) => e.id === targetId)
      if (!target) continue

      const existing = (target.boundElements as { type: string; id: string }[] | null) ?? []
      target.boundElements = [...existing, { type: "arrow", id: el.id as string }]
    }
  }

  return result
}
