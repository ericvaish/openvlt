import { StateNode, createShapeId } from "tldraw"

// Import for side-effect: registers "text-note" in TLGlobalShapePropsMap
import "../shapes/text-note-shape"

const TEXT_NOTE_DEFAULTS_KEY = "openvlt:text-note-defaults"

function getDefaults() {
  if (typeof window === "undefined")
    return { font: "sans", size: "m", color: "black" }
  try {
    const stored = localStorage.getItem(TEXT_NOTE_DEFAULTS_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { font: "sans", size: "m", color: "black" }
}

export class TextNoteTool extends StateNode {
  static override id = "text-note"

  override onPointerDown() {
    const { currentPagePoint } = this.editor.inputs
    const id = createShapeId()
    const defaults = getDefaults()

    this.editor.createShape({
      id,
      type: "text-note",
      x: currentPagePoint.x,
      y: currentPagePoint.y,
      props: {
        w: 300,
        h: 30,
        content: "",
        ...defaults,
      },
    })

    this.editor.setCurrentTool("select")
    this.editor.setEditingShape(id)
    this.editor.select(id)
  }
}
