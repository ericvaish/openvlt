"use client"

import * as React from "react"
import { NoteHeader } from "@/components/note-header"
import { NoteEditor } from "@/components/note-editor"
import { ExcalidrawEditor } from "@/components/excalidraw-editor"
import { CanvasEditor, type CanvasEditorState } from "@/components/canvas-editor"
import { CanvasToolbarInline } from "@/components/canvas/canvas-toolbar-inline"
import { LockPrompt } from "@/components/lock-dialog"
import { NoteProperties } from "@/components/note-properties"
import type { NoteMetadata } from "@/types"

interface TabPanelProps {
  noteId: string
  active: boolean
  isSplit?: boolean
}

function isExcalidrawFile(metadata: NoteMetadata): boolean {
  return (
    metadata.noteType === "excalidraw" ||
    metadata.filePath.endsWith(".excalidraw.json") ||
    metadata.title.endsWith(".excalidraw")
  )
}

function isCanvasFile(metadata: NoteMetadata): boolean {
  return (
    metadata.noteType === "canvas" ||
    metadata.filePath.endsWith(".canvas.json") ||
    metadata.filePath.endsWith(".openvlt")
  )
}

export function TabPanel({ noteId, active, isSplit = false }: TabPanelProps) {
  const [metadata, setMetadata] = React.useState<NoteMetadata | null>(null)
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)
  const fetchedRef = React.useRef(false)
  const [canvasState, setCanvasState] = React.useState<CanvasEditorState | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [historyFolderId, setHistoryFolderId] = React.useState<string | null>(null)

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.noteId === noteId) {
        setHistoryOpen((prev) => !prev)
        setHistoryFolderId(detail?.folderId ?? null)
      }
    }
    window.addEventListener("openvlt:toggle-history", handler)
    return () => window.removeEventListener("openvlt:toggle-history", handler)
  }, [noteId])

  React.useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    fetch(`/api/notes/${noteId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found")
        return res.json()
      })
      .then((data) => {
        setMetadata(data.metadata)
        setContent(data.content)
      })
      .catch(() => setError(true))
  }, [noteId])

  if (error) {
    return (
      <div className={`flex h-full items-center justify-center ${active ? "" : "hidden"}`}>
        <p className="text-sm text-muted-foreground">Note not found or inaccessible.</p>
      </div>
    )
  }

  if (!metadata || content === null) {
    return (
      <div className={`flex h-full items-center justify-center ${active ? "" : "hidden"}`}>
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    )
  }

  const isExcalidraw = isExcalidrawFile(metadata)
  const isCanvas = isCanvasFile(metadata)
  const isLocked = metadata.isLocked

  const canvasToolbar = isCanvas && canvasState ? (
    <CanvasToolbarInline
      editor={canvasState.editor}
      pageSize={canvasState.pageSize}
      background={canvasState.background}
      pageCount={canvasState.pageCount}
      onPageSizeChange={canvasState.onPageSizeChange}
      onBackgroundChange={canvasState.onBackgroundChange}
      onAddPage={canvasState.onAddPage}
      onRemovePage={canvasState.onRemovePage}
      strokeColor={canvasState.strokeColor}
      strokeSize={canvasState.strokeSize}
      onStrokeColorChange={canvasState.onStrokeColorChange}
      onStrokeSizeChange={canvasState.onStrokeSizeChange}
      ruleStyle={canvasState.ruleStyle}
      customSpacing={canvasState.customSpacing}
      onRuleStyleChange={canvasState.onRuleStyleChange}
      onCustomSpacingChange={canvasState.onCustomSpacingChange}
      pressureSensitivity={canvasState.pressureSensitivity}
      onPressureSensitivityChange={canvasState.onPressureSensitivityChange}
      drawWithFinger={canvasState.drawWithFinger}
      onDrawWithFingerChange={canvasState.onDrawWithFingerChange}
    />
  ) : null

  // Locked note: show password prompt, then render editor with decrypted content
  if (isLocked) {
    return (
      <div className={`flex h-full min-w-0 flex-col overflow-hidden ${active ? "" : "hidden"}`}>
        <NoteHeader note={metadata} isSplit={isSplit} pane={isSplit ? "split" : "main"} />
        <LockedNoteView noteId={noteId} metadata={metadata} isExcalidraw={isExcalidraw} isCanvas={isCanvas} isSplit={isSplit} />
      </div>
    )
  }

  return (
    <div className={`relative flex h-full min-w-0 flex-col overflow-hidden ${active ? "" : "hidden"}`}>
      <NoteHeader note={metadata} isSplit={isSplit} pane={isSplit ? "split" : "main"} toolbarSlot={canvasToolbar} />
      {!isCanvas && !isExcalidraw && <NoteProperties noteId={metadata.id} />}
      {isCanvas ? (
        <CanvasEditor noteId={metadata.id} initialData={content} onEditorReady={setCanvasState} />
      ) : isExcalidraw ? (
        <ExcalidrawEditor noteId={metadata.id} initialData={content} />
      ) : (
        <NoteEditor noteId={metadata.id} initialContent={content} initialVersion={metadata.version} coverImage={metadata.coverImage} pane={isSplit ? "split" : "main"} />
      )}
    </div>
  )
}

/** Shows a lock prompt, then renders the editor once decrypted */
function LockedNoteView({
  noteId,
  metadata,
  isExcalidraw,
  isCanvas,
  isSplit = false,
}: {
  noteId: string
  metadata: NoteMetadata
  isExcalidraw: boolean
  isCanvas: boolean
  isSplit?: boolean
}) {
  const [decryptedContent, setDecryptedContent] = React.useState<string | null>(null)

  if (decryptedContent === null) {
    return <LockPrompt noteId={noteId} onDecrypted={setDecryptedContent} />
  }

  if (isCanvas) {
    return <CanvasEditor noteId={metadata.id} initialData={decryptedContent} />
  }

  if (isExcalidraw) {
    return <ExcalidrawEditor noteId={metadata.id} initialData={decryptedContent} />
  }

  return (
    <NoteEditor
      noteId={metadata.id}
      initialContent={decryptedContent}
      initialVersion={metadata.version}
      coverImage={metadata.coverImage}
      pane={isSplit ? "split" : "main"}
    />
  )
}
