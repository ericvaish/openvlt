"use client"

import * as React from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { Markdown } from "@tiptap/markdown"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import Image from "@tiptap/extension-image"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import { common, createLowlight } from "lowlight"
import { ActiveNodeReveal } from "@/lib/editor/active-node-reveal"
import { InlineMarkReveal } from "@/lib/editor/inline-mark-reveal"
import { HeadingFold } from "@/lib/editor/heading-fold"
import { AttachmentEmbed } from "@/lib/editor/attachment-embed"
import { SlashCommands } from "@/lib/editor/slash-commands"
import { Callout } from "@/lib/editor/callout"
import { ToggleBlock } from "@/lib/editor/toggle-block"
import { WikiLink } from "@/lib/editor/wiki-link"
import { TaskListInputRule } from "@/lib/editor/task-list-input-rule"
import { EmbedBlock } from "@/lib/editor/embed-block"
import { MathBlock } from "@/lib/editor/math-block"
import { InlineMath } from "@/lib/editor/inline-math"
import { MermaidBlock } from "@/lib/editor/mermaid-block"
import { InlineDatabase } from "@/lib/editor/inline-database"
import { SyncedBlock } from "@/lib/editor/synced-block"
import { NoNestedTables } from "@/lib/editor/no-nested-tables"
import { useTabStore } from "@/lib/stores/tab-store"
import { useShortcutAction } from "@/lib/stores/shortcuts-store"
import { useStickyTableHeader } from "@/hooks/use-sticky-table-header"

const lowlight = createLowlight(common)
import { uploadAndInsert } from "@/lib/editor/upload"
import { EditorToolbar } from "@/components/editor/editor-toolbar"
import { EditorContextMenu } from "@/components/editor/editor-context-menu"
import { TableControlsOverlay } from "@/components/editor/table-controls-overlay"
import { LinkHoverTooltip } from "@/components/editor/link-hover-tooltip"
import { AttachmentModalProvider } from "@/components/editor/embeds/attachment-modal-context"
import { LightboxModal } from "@/components/editor/embeds/lightbox-modal"
import { PdfViewerModal } from "@/components/editor/embeds/pdf-viewer-modal"
import { DocxViewerModal } from "@/components/editor/embeds/docx-viewer-modal"
import { ConflictDialog } from "@/components/conflict-dialog"
import { addBookmark } from "@/components/bookmarks-panel"
import { BacklinksPanel } from "@/components/backlinks-panel"
import { NoteProperties } from "@/components/note-properties"
import { OutlinePanel } from "@/components/outline-panel"
import { WordCountBar } from "@/components/word-count-bar"
import { TimeMachinePanel } from "@/components/history/time-machine-panel"

interface NoteEditorProps {
  noteId: string
  initialContent: string
  initialVersion?: number
  coverImage?: string | null
  pane?: "main" | "split"
}

export function NoteEditor({
  noteId,
  initialContent,
  initialVersion = 1,
  coverImage: initialCoverImage = null,
  pane = "main",
}: NoteEditorProps) {
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [saving, setSaving] = React.useState(false)
  const versionRef = React.useRef(initialVersion)
  const lastSavedContentRef = React.useRef(initialContent)
  const [conflict, setConflict] = React.useState<{
    myContent: string
    serverContent: string
  } | null>(null)
  const editorRef = React.useRef<Editor | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [historyFolderId, setHistoryFolderId] = React.useState<string | null>(
    null
  )
  const { openTab } = useTabStore()
  const { enabled: stickyHeader } = useStickyTableHeader()
  const [coverImage, setCoverImage] = React.useState<string | null>(
    initialCoverImage
  )
  const [coverHovered, setCoverHovered] = React.useState(false)
  const coverInputRef = React.useRef<HTMLInputElement>(null)

  // Listen for cover image updates from the note header (add cover button)
  React.useEffect(() => {
    const handler = () => {
      fetch(`/api/notes/${noteId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.metadata?.coverImage !== undefined) {
            setCoverImage(data.metadata.coverImage)
          }
        })
        .catch(() => {})
    }
    window.addEventListener("openvlt:notes-refresh", handler)
    return () => window.removeEventListener("openvlt:notes-refresh", handler)
  }, [noteId])

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`/api/notes/${noteId}/attachments`, {
      method: "POST",
      body: formData,
    })
    if (res.ok) {
      const data = await res.json()
      const url = `/api/attachments/${data.id}`
      setCoverImage(url)
      await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: url }),
      })
      window.dispatchEvent(new Event("openvlt:notes-refresh"))
    }
  }

  async function handleRemoveCover() {
    setCoverImage(null)
    await fetch(`/api/notes/${noteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImage: null }),
    })
    window.dispatchEvent(new Event("openvlt:notes-refresh"))
  }

  // Listen for bookmark requests from the editor context menu
  React.useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.targetId === noteId) {
        await addBookmark(detail.type, detail.label, detail.targetId, detail.data)
      }
    }
    window.addEventListener("openvlt:add-bookmark", handler)
    return () => window.removeEventListener("openvlt:add-bookmark", handler)
  }, [noteId])

  // Listen for history toggle event from note header
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

  useShortcutAction("toggleHistory", () => {
    setHistoryOpen((prev) => !prev)
  })

  // Handle wiki-link clicks: resolve title to note ID and open tab
  React.useEffect(() => {
    const handler = async (e: Event) => {
      const title = (e as CustomEvent).detail?.title
      if (!title) return

      try {
        const res = await fetch(
          `/api/notes/resolve?title=${encodeURIComponent(title)}`
        )
        if (res.ok) {
          const data = await res.json()
          if (data.id) {
            openTab(data.id, data.title || title)
          }
        }
      } catch {
        // Silently fail if resolve endpoint is unavailable
      }
    }
    window.addEventListener("openvlt:wiki-link-click", handler)
    return () => window.removeEventListener("openvlt:wiki-link-click", handler)
  }, [openTab])

  // Live reload: when vault changes on disk (e.g. from peer sync),
  // check if this note's version changed and reload content if so.
  React.useEffect(() => {
    let checking = false
    const handler = async () => {
      if (checking || !editorRef.current) return
      checking = true
      try {
        const res = await fetch(`/api/notes/${noteId}`)
        if (!res.ok) return
        const data = await res.json()
        const remoteVersion = data.metadata?.version
        if (remoteVersion && remoteVersion > versionRef.current) {
          versionRef.current = remoteVersion
          lastSavedContentRef.current = data.content
          const editor = editorRef.current
          // Only update if the content actually differs from what's in the editor
          const currentContent = (editor as any).getMarkdown?.() || ""
          if (data.content !== currentContent) {
            const { from, to } = editor.state.selection
            editor.commands.setContent(data.content, {
              contentType: "markdown",
            })
            // Try to restore cursor position
            try {
              const maxPos = editor.state.doc.content.size
              editor.commands.setTextSelection({
                from: Math.min(from, maxPos),
                to: Math.min(to, maxPos),
              })
            } catch {}
          }
        }
      } catch {
        // Silently ignore fetch errors
      } finally {
        checking = false
      }
    }
    window.addEventListener("openvlt:vault-changed", handler)
    return () => window.removeEventListener("openvlt:vault-changed", handler)
  }, [noteId])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        link: false,
        underline: false,
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      Markdown.configure({
        markedOptions: { gfm: true },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-2 cursor-pointer",
        },
      }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableCell,
      TableHeader,
      NoNestedTables,
      TaskList,
      TaskItem.configure({ nested: true }),
      TaskListInputRule,
      Image.configure({ inline: true }),
      AttachmentEmbed,
      SlashCommands,
      ActiveNodeReveal,
      InlineMarkReveal,
      HeadingFold,
      Callout,
      ToggleBlock,
      WikiLink,
      EmbedBlock,
      MathBlock,
      InlineMath,
      MermaidBlock,
      InlineDatabase,
      SyncedBlock,
    ],
    content: initialContent,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class:
          "prose prose-stone dark:prose-invert prose-sm sm:prose-base max-w-none focus:outline-none",
      },
      clipboardTextSerializer: (slice) => {
        // Serialize copied content as markdown so paste round-trips correctly
        const md = editorRef.current?.markdown
        if (!md) return ""
        const nodes: ReturnType<typeof md.serialize>[] = []
        slice.content.forEach((node) => {
          nodes.push(md.serialize({ type: "doc", content: [node.toJSON()] }))
        })
        return nodes.join("\n\n")
      },
      handleDrop: (view, event, slice, moved) => {
        const files = event.dataTransfer?.files
        if (files?.length && editorRef.current) {
          event.preventDefault()
          uploadAndInsert(editorRef.current, noteId, files)
          return true
        }
        // Prevent "mismatched transaction" crash when dragging a node
        // and dropping it at the same position
        if (moved) {
          const pos = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })
          if (pos) {
            const { from, to } = view.state.selection
            if (pos.pos >= from && pos.pos <= to) {
              return true
            }
          }
        }
        return false
      },
      handleClick: (view, pos, event) => {
        if (!(event.metaKey || event.ctrlKey)) return false
        const attrs = view.state.doc
          .resolve(pos)
          .marks()
          .find((m) => m.type.name === "link")?.attrs
        if (attrs?.href) {
          window.open(attrs.href, "_blank", "noopener,noreferrer")
          return true
        }
        return false
      },
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files
        if (files?.length && editorRef.current) {
          event.preventDefault()
          uploadAndInsert(editorRef.current, noteId, files)
          return true
        }

        // Always parse pasted text as markdown (like Obsidian)
        const text = event.clipboardData?.getData("text/plain")
        if (text && editorRef.current?.markdown) {
          event.preventDefault()
          // Normalize: collapse blank lines between table rows so the
          // markdown parser sees them as a contiguous table block
          let normalized = text
          while (/(\|[^\n]*\|)\n\n(\|)/.test(normalized)) {
            normalized = normalized.replace(
              /(\|[^\n]*\|)\n\n(\|)/g,
              "$1\n$2"
            )
          }
          const json = editorRef.current.markdown.parse(normalized)
          if (json?.content) {
            editorRef.current.commands.insertContent(json.content)
          }
          return true
        }

        return false
      },
    },
    onUpdate: ({ editor }) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      saveTimeoutRef.current = setTimeout(async () => {
        const content = (editor as any).getMarkdown()

        // Skip save if content hasn't changed
        if (content === lastSavedContentRef.current) return

        setSaving(true)
        try {
          const res = await fetch(`/api/notes/${noteId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              baseVersion: versionRef.current,
              trigger: "autosave",
            }),
          })

          if (res.ok) {
            const data = await res.json()
            versionRef.current = data.version
            lastSavedContentRef.current = content
            // If server auto-merged, update editor content
            if (data.status === "merged" && data.content !== content) {
              editor.commands.setContent(data.content, {
                contentType: "markdown",
              })
              lastSavedContentRef.current = data.content
            }
            // Refresh sidebar tree if attachments were cleaned up
            if (data.removedAttachments > 0) {
              window.dispatchEvent(new Event("openvlt:tree-refresh"))
            }
          } else if (res.status === 409) {
            const data = await res.json()
            setConflict({
              myContent: content,
              serverContent: data.serverContent,
            })
          }
        } finally {
          setSaving(false)
        }
      }, 800)
    },
  })

  // Keep ref in sync so editorProps handlers can access the editor
  editorRef.current = editor

  // Sync sticky header data attribute onto the editor DOM element
  React.useEffect(() => {
    const el = editor?.view.dom
    if (el) el.setAttribute("data-sticky-header", String(stickyHeader))
  }, [editor, stickyHeader])

  // Explicit save
  useShortcutAction("save", () => {
    if (!editor) return
    const content = (editor as any).getMarkdown()
    if (content === lastSavedContentRef.current) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    setSaving(true)
    fetch(`/api/notes/${noteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        baseVersion: versionRef.current,
        trigger: "explicit",
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          versionRef.current = data.version
          lastSavedContentRef.current = content
        }
      })
      .finally(() => setSaving(false))
  })

  // Cleanup timeout on unmount + end edit session
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      // Signal session end when navigating away
      try {
        navigator.sendBeacon(`/api/notes/${noteId}/session-end`)
      } catch {
        // Fallback: fire-and-forget fetch
        fetch(`/api/notes/${noteId}/session-end`, { method: "POST" }).catch(
          () => {}
        )
      }
    }
  }, [noteId])

  // Update editor content when noteId changes
  React.useEffect(() => {
    if (editor && initialContent !== undefined) {
      editor.commands.setContent(initialContent, { contentType: "markdown" })
      lastSavedContentRef.current = initialContent
    }
  }, [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist scroll position across refreshes
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const key = `openvlt:scroll:${noteId}`

    // Restore saved position after editor content has rendered
    const raf = requestAnimationFrame(() => {
      const saved = sessionStorage.getItem(key)
      if (saved) {
        el.scrollTop = Number(saved)
      }
    })

    // Save position on scroll (debounced)
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        sessionStorage.setItem(key, String(el.scrollTop))
      }, 200)
    }
    el.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      el.removeEventListener("scroll", onScroll)
    }
  }, [noteId])

  return (
    <AttachmentModalProvider>
      {/* min-w-0 on all flex containers here: prevents horizontal overflow
           in split view. Without it, editor content pushes panes wider than
           their allocated half. Do not remove min-w-0 from these elements. */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {saving && (
          <div className="absolute top-2 right-4 z-30 text-sm text-muted-foreground">
            Saving...
          </div>
        )}
        <EditorToolbar editor={editor} noteId={noteId} />
        <div className="relative flex min-w-0 flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
          >
            {/* Cover image: scrolls with content instead of being pinned */}
            {coverImage && (
              <div
                className="group/cover relative h-40 overflow-hidden bg-muted"
                onMouseEnter={() => setCoverHovered(true)}
                onMouseLeave={() => setCoverHovered(false)}
              >
                <img
                  src={coverImage}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {coverHovered && (
                  <div className="absolute right-3 bottom-3 flex gap-1.5">
                    <button
                      onClick={() => coverInputRef.current?.click()}
                      className="rounded-md bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90"
                    >
                      Change cover
                    </button>
                    <button
                      onClick={handleRemoveCover}
                      className="rounded-md bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-sm hover:bg-background/90"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              className="hidden"
            />
            <NoteProperties noteId={noteId} />
            <EditorContextMenu editor={editor} noteId={noteId}>
              <EditorContent editor={editor} />
            </EditorContextMenu>
            <TableControlsOverlay
              editor={editor}
              scrollContainerRef={scrollRef}
            />
            <LinkHoverTooltip editor={editor} scrollContainerRef={scrollRef} />
            <BacklinksPanel noteId={noteId} />
          </div>
          <OutlinePanel editor={editor} pane={pane} />
          {historyOpen && (
            <TimeMachinePanel
              noteId={noteId}
              folderId={historyFolderId}
              onClose={() => setHistoryOpen(false)}
              onRestored={() => {
                // Refetch note content after restore
                fetch(`/api/notes/${noteId}`)
                  .then((r) => r.json())
                  .then((data) => {
                    if (editor && data.content) {
                      editor.commands.setContent(data.content, {
                        contentType: "markdown",
                      })
                      lastSavedContentRef.current = data.content
                      versionRef.current =
                        data.metadata?.version ?? versionRef.current
                    }
                  })
                  .catch(() => {})
                setHistoryOpen(false)
              }}
            />
          )}
        </div>
        <WordCountBar editor={editor} />
      </div>
      <LightboxModal />
      <PdfViewerModal />
      <DocxViewerModal />
      {conflict && (
        <ConflictDialog
          open
          myContent={conflict.myContent}
          serverContent={conflict.serverContent}
          onResolve={async (choice) => {
            const content =
              choice === "mine" ? conflict.myContent : conflict.serverContent
            if (editor) {
              editor.commands.setContent(content, { contentType: "markdown" })
            }
            // Force save with no baseVersion (unconditional overwrite)
            const res = await fetch(`/api/notes/${noteId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content }),
            })
            if (res.ok) {
              const data = await res.json()
              versionRef.current = data.version
            }
            setConflict(null)
          }}
        />
      )}
    </AttachmentModalProvider>
  )
}
