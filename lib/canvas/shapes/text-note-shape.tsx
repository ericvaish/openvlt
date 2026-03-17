"use client"

import * as React from "react"
import {
  ShapeUtil,
  HTMLContainer,
  TLBaseShape,
  Rectangle2d,
  stopEventPropagation,
  useEditor as useTldrawEditor,
  type TLResizeInfo,
  type Geometry2d,
} from "tldraw"
import { useEditor as useTiptapEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { Markdown as MarkdownExt } from "tiptap-markdown"

export type TextNoteFont = "draw" | "sans" | "serif" | "mono"
export type TextNoteSize = "s" | "m" | "l" | "xl"
export type TextNoteColor =
  | "black"
  | "grey"
  | "light-violet"
  | "violet"
  | "blue"
  | "light-blue"
  | "yellow"
  | "orange"
  | "green"
  | "light-green"
  | "light-red"
  | "red"
  | "white"

export const FONT_CSS: Record<TextNoteFont, string> = {
  draw: "var(--tl-font-draw, 'tldraw_draw', sans-serif)",
  sans: "var(--tl-font-sans, 'tldraw_sans', sans-serif)",
  serif: "var(--tl-font-serif, 'tldraw_serif', serif)",
  mono: "var(--tl-font-mono, 'tldraw_mono', monospace)",
}

export const SIZE_PX: Record<TextNoteSize, number> = {
  s: 18,
  m: 24,
  l: 36,
  xl: 44,
}

export const COLOR_VALUES: Record<TextNoteColor, string> = {
  black: "#1d1d1d",
  grey: "#9fa8b2",
  "light-violet": "#e085f4",
  violet: "#ae3ec9",
  blue: "#4465e9",
  "light-blue": "#4ba1f1",
  yellow: "#f1ac4b",
  orange: "#e16919",
  green: "#099268",
  "light-green": "#4cb05e",
  "light-red": "#f87777",
  red: "#e03131",
  white: "#FFFFFF",
}

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    "text-note": {
      w: number
      h: number
      content: string
      font: TextNoteFont
      size: TextNoteSize
      color: TextNoteColor
    }
  }
}

export type TextNoteShape = TLBaseShape<
  "text-note",
  {
    w: number
    h: number
    content: string
    font: TextNoteFont
    size: TextNoteSize
    color: TextNoteColor
  }
>


// Mini TipTap editor rendered inside the shape
function TextNoteComponent({
  shape,
  isEditing,
}: {
  shape: TextNoteShape
  isEditing: boolean
}) {
  const tldrawEditor = useTldrawEditor()
  const lastHeightRef = React.useRef(shape.props.h)

  const fontFamily = FONT_CSS[shape.props.font] || FONT_CSS.sans
  const fontSize = SIZE_PX[shape.props.size] || SIZE_PX.m
  const color = COLOR_VALUES[shape.props.color] || COLOR_VALUES.black

  const editor = useTiptapEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: "Type here...",
        }),
        MarkdownExt.configure({
          html: false,
          transformPastedText: true,
        }),
      ],
      content: shape.props.content || "",
      editable: isEditing,
      onUpdate: ({ editor: ed }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markdown =
          (ed.storage as any).markdown?.getMarkdown?.() ?? ed.getHTML()

        // Auto-resize: count lines based on content
        const lineHeight = fontSize * 1.35
        const padding = 8 // 2px top + 2px bottom + 4px buffer
        // Count block-level elements (paragraphs, headings, list items)
        const blockCount = Math.max(1, (ed.getHTML().match(/<\/(p|h[1-3]|li|blockquote|pre)>/g) || []).length)
        const newH = Math.max(30, Math.ceil(blockCount * lineHeight + padding))
        const heightChanged = Math.abs(newH - lastHeightRef.current) > 2

        if (heightChanged) {
          lastHeightRef.current = newH
          tldrawEditor.updateShape({
            id: shape.id,
            type: "text-note",
            props: { content: markdown, h: newH },
          })
        } else {
          tldrawEditor.updateShape({
            id: shape.id,
            type: "text-note",
            props: { content: markdown },
          })
        }
      },
    },
    [isEditing]
  )

  React.useEffect(() => {
    if (isEditing && editor) {
      // Focus immediately, then again after a frame to ensure keyboard opens on mobile
      editor.commands.focus("end")
      requestAnimationFrame(() => {
        if (!editor.isFocused) {
          editor.commands.focus("end")
        }
        // Also try focusing the underlying contenteditable element directly
        const el = document.querySelector(
          `[data-shape-id="${shape.id}"] .ProseMirror`
        ) as HTMLElement | null
        if (el) el.focus()
      })
    }
  }, [isEditing, editor, shape.id])

  return (
    <div
      className="text-note-editor"
      onPointerDown={isEditing ? stopEventPropagation : undefined}
      onKeyDown={isEditing ? stopEventPropagation : undefined}
      style={{
        pointerEvents: isEditing ? "all" : "none",
        fontFamily,
        fontSize: `${fontSize}px`,
        color,
      }}
    >
      <EditorContent editor={editor} />
    </div>
  )
}

export class TextNoteShapeUtil extends ShapeUtil<TextNoteShape> {
  static override type = "text-note" as const

  override getDefaultProps(): TextNoteShape["props"] {
    return {
      w: 300,
      h: 30,
      content: "",
      font: "sans",
      size: "m",
      color: "black",
    }
  }

  override getGeometry(shape: TextNoteShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override canEdit() {
    return true
  }

  override onEditEnd(shape: TextNoteShape) {
    // Auto-delete empty text boxes
    if (!shape.props.content || shape.props.content.trim() === "") {
      this.editor.deleteShape(shape.id)
    }
  }

  override canResize() {
    return true
  }

  override isAspectRatioLocked() {
    return false
  }

  override component(shape: TextNoteShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id
    return (
      <HTMLContainer id={shape.id}>
        <div
          className="text-note-container"
          style={{
            padding: "2px 4px",
            lineHeight: "1.35",
            boxSizing: "border-box",
            borderRadius: "4px",
            border: isEditing
              ? "1.5px solid var(--color-primary, #3b82f6)"
              : "1.5px solid transparent",
            backgroundColor: isEditing ? "#ffffff" : "transparent",
            transition: "border-color 0.15s, background-color 0.15s",
            overflow: "visible",
            position: "relative",
          }}
        >
          <TextNoteComponent shape={shape} isEditing={isEditing} />
        </div>
      </HTMLContainer>
    )
  }

  override indicator(shape: TextNoteShape) {
    return (
      <rect
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        rx={4}
        ry={4}
      />
    )
  }

  override onResize(shape: TextNoteShape, info: TLResizeInfo<TextNoteShape>) {
    return {
      props: {
        w: Math.max(50, info.initialBounds.w * info.scaleX),
        h: Math.max(20, info.initialBounds.h * info.scaleY),
      },
    }
  }
}
