"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import dynamic from "next/dynamic"
import "tldraw/tldraw.css"

import {
  TextNoteShapeUtil,
  FONT_CSS,
  COLOR_VALUES,
  type TextNoteFont,
  type TextNoteSize,
  type TextNoteColor,
  type TextNoteShape,
} from "@/lib/canvas/shapes/text-note-shape"
import { TextNoteTool } from "@/lib/canvas/tools/text-note-tool"

const customShapeUtils = [TextNoteShapeUtil]
const customTools = [TextNoteTool]

const TEXT_NOTE_DEFAULTS_KEY = "openvlt:text-note-defaults"

function getTextNoteDefaults(): {
  font: TextNoteFont
  size: TextNoteSize
  color: TextNoteColor
} {
  if (typeof window === "undefined")
    return { font: "sans", size: "m", color: "black" }
  try {
    const stored = localStorage.getItem(TEXT_NOTE_DEFAULTS_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { font: "sans", size: "m", color: "black" }
}

function saveTextNoteDefaults(defaults: {
  font: TextNoteFont
  size: TextNoteSize
  color: TextNoteColor
}) {
  localStorage.setItem(TEXT_NOTE_DEFAULTS_KEY, JSON.stringify(defaults))
}

// Dynamic import of tldraw (no SSR) with all needed exports
const TldrawComponent = dynamic(
  () =>
    import("tldraw").then((mod) => {
      const { Tldraw } = mod
      return function TldrawWrapper(
        props: React.ComponentProps<typeof Tldraw>
      ) {
        return <Tldraw {...props} />
      }
    }),
  { ssr: false, loading: () => <CanvasSkeleton /> }
)

function CanvasSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  )
}

interface CanvasEditorProps {
  noteId: string
  initialData: string
}

export function CanvasEditor({ noteId, initialData }: CanvasEditorProps) {
  const { resolvedTheme } = useTheme()
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const [saving, setSaving] = React.useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = React.useRef<any>(null)

  const snapshot = React.useMemo(() => {
    try {
      const data = JSON.parse(initialData)
      if (data.document && Object.keys(data.document).length > 0) {
        return data.document
      }
      return undefined
    } catch {
      return undefined
    }
  }, [initialData])

  const handleMount = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (editor: any) => {
      editorRef.current = editor

      // Track text-note selection for the style bar
      editor.store.listen(
        () => {
          const selected = editor.getSelectedShapes()
          if (selected.length === 1 && selected[0].type === "text-note") {
            setSelectedTextNote(selected[0] as TextNoteShape)
          } else {
            setSelectedTextNote(null)
          }
        },
        { source: "user", scope: "session" }
      )

      // Double-click/double-tap on empty canvas → create our text-note shape
      let lastPointerDownTime = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.on("event", (event: any) => {
        if (event.type !== "pointer" || event.name !== "pointer_down") return

        const now = Date.now()
        const timeSinceLastDown = now - lastPointerDownTime
        lastPointerDownTime = now

        // Detect double-click: two pointer_down events within 400ms
        if (timeSinceLastDown > 400) return
        if (editor.getCurrentToolId() !== "select") return

        // Only create if no shape under pointer
        const hitShape = editor.getShapeAtPoint(
          editor.inputs.currentPagePoint
        )
        if (hitShape) return

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createShapeId } = require("tldraw")
        const { x, y } = editor.inputs.currentPagePoint
        const id = createShapeId()
        const defaults = getTextNoteDefaults()
        editor.createShape({
          id,
          type: "text-note",
          x,
          y,
          props: { w: 300, h: 30, content: "", ...defaults },
        })
        editor.select(id)
        editor.setEditingShape(id)
      })

      // Listen for changes and auto-save
      editor.store.listen(
        () => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current)
          }

          saveTimeoutRef.current = setTimeout(async () => {
            setSaving(true)
            try {
              const storeSnapshot = editor.store.getStoreSnapshot()
              const data = JSON.stringify({
                type: "openvlt-canvas",
                version: 1,
                document: storeSnapshot,
              })

              await fetch(`/api/notes/${noteId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: data }),
              })
            } finally {
              setSaving(false)
            }
          }, 1000)
        },
        { source: "user", scope: "document" }
      )
    },
    [noteId]
  )

  // Override: remove tldraw's built-in text tool, add our text-note tool
  const overrides = React.useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools(editor: any, tools: any) {
        // Remove the built-in text tool (per tldraw docs: use delete)
        delete tools.text

        // Add our text-note tool
        tools["text-note"] = {
          id: "text-note",
          icon: "text",
          label: "Text Block",
          kbd: "t",
          onSelect() {
            editor.setCurrentTool("text-note")
          },
        }
        return tools
      },
    }),
    []
  )

  // Track selected text-note shape for the style bar
  const [selectedTextNote, setSelectedTextNote] =
    React.useState<TextNoteShape | null>(null)

  const updateTextNoteStyle = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => {
      if (!editorRef.current || !selectedTextNote) return
      editorRef.current.updateShape({
        id: selectedTextNote.id,
        type: "text-note",
        props,
      })
    },
    [selectedTextNote]
  )

  return (
    <div className="relative flex flex-1 flex-col canvas-editor-wrapper">
      {/* Text note style bar — rendered outside tldraw so events work */}
      {selectedTextNote && (
        <div
          className="flex items-center gap-2 border-b bg-background px-3 py-1.5"
          style={{ zIndex: 50 }}
        >
          {/* Fonts */}
          {(["draw", "sans", "serif", "mono"] as TextNoteFont[]).map((f) => (
            <button
              key={f}
              onClick={() => updateTextNoteStyle({ font: f })}
              className="rounded px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              style={{
                fontFamily: FONT_CSS[f],
                background:
                  selectedTextNote.props.font === f
                    ? "var(--color-primary, #3b82f6)"
                    : undefined,
                color:
                  selectedTextNote.props.font === f ? "#fff" : undefined,
              }}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Sizes */}
          {(
            [
              ["s", "S"],
              ["m", "M"],
              ["l", "L"],
              ["xl", "XL"],
            ] as [TextNoteSize, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => updateTextNoteStyle({ size: id })}
              className="rounded px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              style={{
                background:
                  selectedTextNote.props.size === id
                    ? "var(--color-primary, #3b82f6)"
                    : undefined,
                color:
                  selectedTextNote.props.size === id ? "#fff" : undefined,
              }}
            >
              {label}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Colors */}
          {(
            [
              "black", "grey", "blue", "light-blue", "violet",
              "light-violet", "red", "light-red", "orange", "yellow",
              "green", "light-green", "white",
            ] as TextNoteColor[]
          ).map((c) => (
            <button
              key={c}
              onClick={() => updateTextNoteStyle({ color: c })}
              className="rounded-full"
              style={{
                width: 18,
                height: 18,
                background: COLOR_VALUES[c],
                border:
                  selectedTextNote.props.color === c
                    ? "2px solid var(--color-primary, #3b82f6)"
                    : "1px solid #d1d5db",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Save as default */}
          <button
            onClick={() => {
              if (!selectedTextNote) return
              saveTextNoteDefaults({
                font: selectedTextNote.props.font,
                size: selectedTextNote.props.size,
                color: selectedTextNote.props.color,
              })
            }}
            className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="New text boxes will use these settings"
          >
            Set as default
          </button>
        </div>
      )}

      {saving && (
        <div className="absolute right-4 top-2 z-30 text-xs text-muted-foreground">
          Saving...
        </div>
      )}
      <style jsx global>{`
        .canvas-editor-wrapper .tlui-debug-panel {
          display: none !important;
        }
        .canvas-editor-wrapper .tlui-style-panel__wrapper {
          max-height: 70vh;
          overflow-y: auto;
        }
        /* Text note shape: ensure the container and editor fill the shape bounds */
        .canvas-editor-wrapper .text-note-container {
          width: 100%;
          height: 100%;
        }
        .canvas-editor-wrapper .text-note-editor {
          width: 100%;
          height: 100%;
        }
        .canvas-editor-wrapper .text-note-editor,
        .canvas-editor-wrapper .text-note-editor > div {
          padding: 0 !important;
          margin: 0 !important;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap,
        .canvas-editor-wrapper .text-note-editor .ProseMirror {
          outline: none !important;
          width: 100% !important;
          height: 100%;
          padding: 0 !important;
          margin: 0 !important;
          white-space: pre-wrap !important;
          word-break: break-word !important;
          -webkit-user-select: text !important;
          user-select: text !important;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap p:first-child,
        .canvas-editor-wrapper .text-note-editor .ProseMirror p:first-child {
          margin-top: 0 !important;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap h1 {
          font-size: 1.75em;
          font-weight: 700;
          margin: 0.25em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap h2 {
          font-size: 1.4em;
          font-weight: 600;
          margin: 0.25em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap h3 {
          font-size: 1.15em;
          font-weight: 600;
          margin: 0.2em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap p {
          margin: 0.15em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap ul,
        .canvas-editor-wrapper .text-note-editor .tiptap ol {
          padding-left: 1.5em;
          margin: 0.15em 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 0.75em;
          margin: 0.25em 0;
          color: #6b7280;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap code {
          background: rgba(0, 0, 0, 0.06);
          border-radius: 3px;
          padding: 0.15em 0.3em;
          font-size: 0.9em;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap pre {
          background: rgba(0, 0, 0, 0.06);
          border-radius: 6px;
          padding: 0.5em 0.75em;
          margin: 0.25em 0;
          overflow-x: auto;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap pre code {
          background: none;
          padding: 0;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap strong {
          font-weight: 700;
        }
        .canvas-editor-wrapper .text-note-editor .tiptap em {
          font-style: italic;
        }
      `}</style>
      <div className="h-full w-full">
        <TldrawComponent
          snapshot={snapshot}
          shapeUtils={customShapeUtils}
          tools={customTools}
          overrides={overrides}
          onMount={handleMount}
          inferDarkMode={false}
          forceMobile={false}
          options={{
            maxPages: 1,
            createTextOnCanvasDoubleClick: false,
          }}
        />
      </div>
    </div>
  )
}
