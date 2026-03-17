"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { RotateCcwIcon } from "lucide-react"
import { CanvasPreview } from "@/components/canvas/canvas-preview"
import type { DiffLine } from "@/types"

interface VersionPreviewProps {
  noteId: string
  versionId: string
  onRestore: () => void
}

interface VersionData {
  id: string
  noteId: string
  content: string
  title: string
  createdAt: string
  versionNumber: number
}

export function VersionPreview({
  noteId,
  versionId,
  onRestore,
}: VersionPreviewProps) {
  const [version, setVersion] = React.useState<VersionData | null>(null)
  const [diff, setDiff] = React.useState<DiffLine[] | null>(null)
  const [mode, setMode] = React.useState<"preview" | "diff">("preview")
  const [loading, setLoading] = React.useState(true)
  const [restoring, setRestoring] = React.useState(false)

  React.useEffect(() => {
    setLoading(true)
    fetch(`/api/history/notes/${noteId}/${versionId}`)
      .then((r) => r.json())
      .then((data) => setVersion(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [noteId, versionId])

  // Fetch diff when switching to diff mode
  React.useEffect(() => {
    if (mode !== "diff" || !version) return

    // Get the latest version to diff against
    fetch(`/api/history/notes/${noteId}`)
      .then((r) => r.json())
      .then((data) => {
        const versions = data.versions ?? []
        if (versions.length === 0) return

        // Find the version just after this one (or the latest)
        const currentIdx = versions.findIndex(
          (v: { id: string }) => v.id === versionId
        )
        const compareId =
          currentIdx > 0 ? versions[currentIdx - 1].id : versions[0].id

        if (compareId === versionId) {
          setDiff([])
          return
        }

        return fetch(
          `/api/history/notes/${noteId}/diff?from=${versionId}&to=${compareId}`
        )
          .then((r) => r.json())
          .then((data) => setDiff(data.diff ?? []))
      })
      .catch(() => {})
  }, [mode, version, noteId, versionId])

  async function handleRestore() {
    setRestoring(true)
    try {
      const res = await fetch(`/api/history/notes/${noteId}/${versionId}`, {
        method: "POST",
      })
      if (res.ok) {
        onRestore()
      }
    } finally {
      setRestoring(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        Loading version...
      </div>
    )
  }

  if (!version) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        Version not found
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Version {version.versionNumber}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(version.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isCanvasContent(version.content) && (
            <div className="flex rounded-md border">
              <button
                onClick={() => setMode("preview")}
                className={`px-2 py-1 text-xs ${mode === "preview" ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                Preview
              </button>
              <button
                onClick={() => setMode("diff")}
                className={`px-2 py-1 text-xs ${mode === "diff" ? "bg-muted font-medium" : "text-muted-foreground"}`}
              >
                Diff
              </button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRestore}
            disabled={restoring}
          >
            <RotateCcwIcon className="mr-1.5 size-3.5" />
            {restoring ? "Restoring..." : "Restore"}
          </Button>
        </div>
      </div>

      {/* Content */}
      {mode === "preview" ? (
        isCanvasContent(version.content) ? (
          <div className="flex flex-col items-center gap-2 rounded-md border bg-muted/30 p-2">
            <CanvasPreview content={version.content} width={280} height={200} />
            <p className="text-[10px] text-muted-foreground">
              {getCanvasShapeCount(version.content)}
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30 p-4">
            <pre className="whitespace-pre-wrap text-sm">{version.content}</pre>
          </div>
        )
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/30">
          {diff === null ? (
            <div className="p-4 text-sm text-muted-foreground">
              Computing diff...
            </div>
          ) : diff.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No differences
            </div>
          ) : (
            <div className="font-mono text-sm">
              {diff.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.type === "added"
                      ? "bg-green-500/10 text-green-700 dark:text-green-400"
                      : line.type === "removed"
                        ? "bg-red-500/10 text-red-700 dark:text-red-400"
                        : "text-muted-foreground"
                  }
                >
                  <span className="inline-block w-8 select-none text-right text-xs opacity-50">
                    {line.lineNumber}
                  </span>
                  <span className="ml-2">
                    {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function isCanvasContent(content: string): boolean {
  try {
    const data = JSON.parse(content)
    return data.type === "openvlt-canvas"
  } catch {
    return false
  }
}

function getCanvasShapeCount(content: string): string {
  try {
    const data = JSON.parse(content)
    const store = data.document?.store ?? data.document ?? {}
    let strokes = 0, texts = 0, shapes = 0
    for (const key of Object.keys(store)) {
      const record = store[key]
      if (record?.typeName !== "shape") continue
      if (record.type === "handwrite") strokes++
      else if (record.type === "text-note") texts++
      else shapes++
    }
    const parts: string[] = []
    if (strokes > 0) parts.push(`${strokes} stroke${strokes > 1 ? "s" : ""}`)
    if (texts > 0) parts.push(`${texts} text block${texts > 1 ? "s" : ""}`)
    if (shapes > 0) parts.push(`${shapes} shape${shapes > 1 ? "s" : ""}`)
    return parts.length > 0 ? parts.join(", ") : "Empty canvas"
  } catch {
    return ""
  }
}
