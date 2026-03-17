import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { AttachmentEmbedView } from "@/components/editor/attachment-embed-view"

export const PRESET_WIDTHS: Record<string, number | null> = {
  xs: 150,
  small: 240,
  medium: 400,
  large: 640,
  full: null,
}

/** Resolve a displaySize (preset name or custom px string) to pixel dimensions */
export function resolveWidth(displaySize: string): number | null {
  if (displaySize in PRESET_WIDTHS) return PRESET_WIDTHS[displaySize]
  if (displaySize.includes("x")) {
    const w = parseInt(displaySize.split("x")[0], 10)
    return w > 0 ? w : null
  }
  const px = parseInt(displaySize, 10)
  return px > 0 ? px : null
}

export function resolveHeight(displaySize: string): number | null {
  if (displaySize in PRESET_WIDTHS) return null
  if (displaySize.includes("x")) {
    const h = parseInt(displaySize.split("x")[1], 10)
    return h > 0 ? h : null
  }
  return null
}

function parseImgAttrs(el: HTMLElement) {
  const width = Number(el.getAttribute("width") || 0)
  const height = Number(el.getAttribute("height") || 0)
  let displaySize = "full"
  if (width) {
    let matched = false
    for (const [name, w] of Object.entries(PRESET_WIDTHS)) {
      if (w && Math.abs(w - width) < 20 && !height) {
        displaySize = name
        matched = true
        break
      }
    }
    if (!matched) {
      displaySize = height ? `${width}x${height}` : String(width)
    }
  } else if (height) {
    displaySize = `x${height}`
  }
  return {
    attachmentId: el.getAttribute("data-attachment-id"),
    fileName: el.getAttribute("alt") || "",
    mimeType: el.getAttribute("data-mimetype") || "image/png",
    sizeBytes: Number(el.getAttribute("data-size-bytes") || 0),
    displaySize,
  }
}

export interface AttachmentEmbedAttrs {
  attachmentId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  displaySize: string
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachmentEmbed: {
      insertAttachmentEmbed: (
        attrs: AttachmentEmbedAttrs
      ) => ReturnType
    }
  }
}

export const AttachmentEmbed = Node.create({
  name: "attachmentEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      attachmentId: { default: null },
      fileName: { default: "" },
      mimeType: { default: "application/octet-stream" },
      sizeBytes: { default: 0 },
      displaySize: { default: "medium" },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-attachment]",
        getAttrs(dom) {
          const el = dom as HTMLElement
          return {
            attachmentId: el.getAttribute("data-attachment-id"),
            fileName: el.getAttribute("data-filename"),
            mimeType: el.getAttribute("data-mimetype"),
            sizeBytes: Number(el.getAttribute("data-size-bytes") || 0),
            displaySize: el.getAttribute("data-display-size") || "medium",
          }
        },
      },
      {
        tag: "div[data-image-embed]",
        getAttrs(dom) {
          const el = dom as HTMLElement
          const img = el.querySelector("img")
          if (!img) return false
          return parseImgAttrs(img)
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-attachment": "",
        "data-attachment-id": HTMLAttributes.attachmentId,
        "data-filename": HTMLAttributes.fileName,
        "data-mimetype": HTMLAttributes.mimeType,
        "data-size-bytes": String(HTMLAttributes.sizeBytes),
        "data-display-size": HTMLAttributes.displaySize,
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentEmbedView)
  },

  addCommands() {
    return {
      insertAttachmentEmbed:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },

  renderMarkdown: (node: any) => {
    const a = node.attrs as AttachmentEmbedAttrs | undefined
    if (!a) return ""
    const isImage = a.mimeType.startsWith("image/")

    if (isImage) {
      const w = resolveWidth(a.displaySize)
      const h = resolveHeight(a.displaySize)
      const widthAttr = w ? ` width="${w}"` : ""
      const heightAttr = h ? ` height="${h}"` : ""
      return `<div data-image-embed><img src="/api/attachments/${a.attachmentId}" alt="${a.fileName}"${widthAttr}${heightAttr} data-attachment-id="${a.attachmentId}" data-mimetype="${a.mimeType}" data-size-bytes="${a.sizeBytes}"></div>\n`
    }
    return `<div data-attachment data-attachment-id="${a.attachmentId}" data-filename="${a.fileName}" data-mimetype="${a.mimeType}" data-size-bytes="${a.sizeBytes}" data-display-size="${a.displaySize}"></div>\n`
  },
})
