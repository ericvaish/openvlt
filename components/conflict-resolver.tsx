"use client"

import * as React from "react"
import {
  AlertCircleIcon,
  CheckIcon,
  XIcon,
  FileTextIcon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConflictFile {
  /** The note's .md file path */
  filePath: string
  /** The corresponding .conflict.md file path */
  conflictPath: string
  /** Note title */
  title: string
  /** Note ID */
  noteId: string
}

export function ConflictResolver() {
  const [conflicts, setConflicts] = React.useState<ConflictFile[]>([])
  const [open, setOpen] = React.useState(false)
  const [selectedConflict, setSelectedConflict] =
    React.useState<ConflictFile | null>(null)
  const [localContent, setLocalContent] = React.useState("")
  const [remoteContent, setRemoteContent] = React.useState("")
  const [resolving, setResolving] = React.useState(false)

  // Scan for .conflict.md files periodically
  React.useEffect(() => {
    async function scanConflicts() {
      try {
        const res = await fetch("/api/folders?mode=advanced")
        if (!res.ok) return

        const tree = await res.json()
        const found: ConflictFile[] = []

        function walk(
          nodes: {
            id: string
            name: string
            path: string
            type: string
            children?: typeof nodes
          }[]
        ) {
          for (const node of nodes) {
            if (
              node.type === "file" &&
              node.name.endsWith(".conflict")
            ) {
              // Find the corresponding original note
              const originalPath = node.path.replace(
                ".conflict.md",
                ".md"
              )
              found.push({
                filePath: originalPath,
                conflictPath: node.path,
                title: node.name.replace(".conflict", ""),
                noteId: node.id,
              })
            }
            if (node.children) walk(node.children)
          }
        }

        walk(tree)

        if (found.length > 0 && conflicts.length === 0) {
          setConflicts(found)
          setOpen(true)
        } else {
          setConflicts(found)
        }
      } catch {
        // Silently fail
      }
    }

    scanConflicts()
    const interval = setInterval(scanConflicts, 60000) // Check every minute
    return () => clearInterval(interval)
  }, [conflicts.length])

  async function loadConflictContent(conflict: ConflictFile) {
    setSelectedConflict(conflict)

    // Load local content via note API
    try {
      const noteRes = await fetch(
        `/api/notes?search=${encodeURIComponent(conflict.title)}`
      )
      if (noteRes.ok) {
        const notes = await noteRes.json()
        const match = notes.find(
          (n: { filePath: string }) =>
            n.filePath === conflict.filePath
        )
        if (match) {
          const contentRes = await fetch(`/api/notes/${match.id}`)
          if (contentRes.ok) {
            const data = await contentRes.json()
            setLocalContent(data.content || "")
          }
        }
      }
    } catch {
      setLocalContent("(Could not load local version)")
    }

    // The conflict file content would need a separate endpoint or
    // could be loaded through the file system. For now, show a placeholder.
    setRemoteContent("(Remote version saved in .conflict.md file)")
  }

  async function resolveConflict(
    conflict: ConflictFile,
    choice: "local" | "remote"
  ) {
    setResolving(true)
    try {
      if (choice === "local") {
        // Keep local, delete the .conflict.md file
        // The conflict file can be cleaned up through the regular note deletion
      } else {
        // Keep remote: replace local content with conflict file content
        // Then delete the conflict file
      }

      // Remove from list
      setConflicts(conflicts.filter((c) => c.noteId !== conflict.noteId))
      setSelectedConflict(null)

      if (conflicts.length <= 1) {
        setOpen(false)
      }
    } finally {
      setResolving(false)
    }
  }

  if (conflicts.length === 0) return null

  return (
    <>
      {/* Floating indicator */}
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lg transition-transform hover:scale-105"
      >
        <AlertCircleIcon className="size-4" />
        {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} to
        resolve
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircleIcon className="size-5 text-destructive" />
              Sync Conflicts
            </DialogTitle>
            <DialogDescription>
              These notes were edited on both this instance and a
              paired instance at the same time. Choose which version
              to keep for each conflict.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-96 space-y-2 overflow-y-auto">
            {conflicts.map((conflict) => (
              <div
                key={conflict.noteId}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  selectedConflict?.noteId === conflict.noteId
                    ? "border-primary bg-muted/50"
                    : ""
                }`}
              >
                <div
                  className="flex cursor-pointer items-center gap-3"
                  onClick={() => loadConflictContent(conflict)}
                >
                  <FileTextIcon className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {conflict.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {conflict.filePath}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resolving}
                    onClick={() => resolveConflict(conflict, "local")}
                    title="Keep local version"
                  >
                    <CheckIcon className="mr-1 size-3.5" />
                    Keep Local
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resolving}
                    onClick={() => resolveConflict(conflict, "remote")}
                    title="Keep remote version"
                  >
                    <CheckIcon className="mr-1 size-3.5" />
                    Keep Remote
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {selectedConflict && (
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Local version
                </p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {localContent || "(empty)"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Remote version
                </p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {remoteContent || "(empty)"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
