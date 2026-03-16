"use client"

import * as React from "react"
import { NoteHeader } from "@/components/note-header"
import { NoteEditor } from "@/components/note-editor"
import { ExcalidrawEditor } from "@/components/excalidraw-editor"
import { CanvasEditor } from "@/components/canvas-editor"
import { LockPrompt } from "@/components/lock-dialog"
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
    metadata.filePath.endsWith(".canvas.json")
  )
}

export function TabPanel({ noteId, active, isSplit = false }: TabPanelProps) {
  const [metadata, setMetadata] = React.useState<NoteMetadata | null>(null)
  const [content, setContent] = React.useState<string | null>(null)
  const [error, setError] = React.useState(false)
  const fetchedRef = React.useRef(false)

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

  // Locked note: show password prompt, then render editor with decrypted content
  if (isLocked) {
    return (
      <div className={`flex h-full min-w-0 flex-col overflow-hidden ${active ? "" : "hidden"}`}>
        <NoteHeader note={metadata} isSplit={isSplit} />
        <LockedNoteView noteId={noteId} metadata={metadata} isExcalidraw={isExcalidraw} isCanvas={isCanvas} />
      </div>
    )
  }

  return (
    <div className={`flex h-full min-w-0 flex-col overflow-hidden ${active ? "" : "hidden"}`}>
      <NoteHeader note={metadata} isSplit={isSplit} />
      {isCanvas ? (
        <CanvasEditor noteId={metadata.id} initialData={content} />
      ) : isExcalidraw ? (
        <ExcalidrawEditor noteId={metadata.id} initialData={content} />
      ) : (
        <NoteEditor noteId={metadata.id} initialContent={content} initialVersion={metadata.version} />
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
}: {
  noteId: string
  metadata: NoteMetadata
  isExcalidraw: boolean
  isCanvas: boolean
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
    />
  )
}
