import type { Tool, ToolContext, ToolDefinition } from "./tool-types"
import {
  createNote,
  getNote,
  updateNoteContent,
  updateNoteTitle,
  deleteNote,
  listAllNotes,
  searchNotesWithSnippets,
} from "@/lib/notes"
import { getFolderTree } from "@/lib/folders"
import { listTags } from "@/lib/tags"
import { convertSkeletonToExcalidraw } from "@/lib/ai/excalidraw-converter"

/**
 * Convert Excalidraw elements into a compact, AI-friendly scene description.
 * Strips all styling noise (roughness, seed, versionNonce, opacity, etc.)
 * and resolves bindings into explicit connections.
 *
 * Output format:
 * - elements: list of {id, type, label?, x, y, w, h, color?, containedBy?, group?}
 * - connections: list of {from, to, label?} derived from arrow bindings
 * - description: human-readable summary
 */
function describeExcalidrawScene(elements: Record<string, unknown>[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type El = any

  const alive = elements.filter((e: El) => !e.isDeleted) as El[]
  const byId = new Map<string, El>()
  for (const el of alive) byId.set(el.id, el)

  // Resolve text labels: text elements with containerId point to their parent
  const labelMap = new Map<string, string>() // containerId -> text
  for (const el of alive) {
    if (el.type === "text" && el.containerId) {
      labelMap.set(el.containerId, el.text || "")
    }
  }

  // Build compact element list (skip text elements that are labels inside shapes)
  const compactElements: Record<string, unknown>[] = []
  for (const el of alive) {
    // Skip text that's a label inside a container
    if (el.type === "text" && el.containerId) continue
    // Skip arrows (handled as connections)
    if (el.type === "arrow") continue

    const entry: Record<string, unknown> = {
      id: el.id,
      type: el.type,
      x: Math.round(el.x),
      y: Math.round(el.y),
    }

    if (el.width) entry.w = Math.round(el.width)
    if (el.height) entry.h = Math.round(el.height)

    // Add label from bound text or inline text
    const label = labelMap.get(el.id) || (el.type === "text" ? el.text : null)
    if (label) entry.label = label

    if (el.backgroundColor && el.backgroundColor !== "transparent") {
      entry.color = el.backgroundColor
    }

    if (el.groupIds?.length) entry.group = el.groupIds[0]

    compactElements.push(entry)
  }

  // Build connections from arrows
  const connections: Record<string, unknown>[] = []
  for (const el of alive) {
    if (el.type !== "arrow") continue

    const conn: Record<string, unknown> = {}

    if (el.startBinding?.elementId) {
      const src = byId.get(el.startBinding.elementId)
      conn.from = labelMap.get(el.startBinding.elementId) ||
        src?.text || el.startBinding.elementId
    }
    if (el.endBinding?.elementId) {
      const tgt = byId.get(el.endBinding.elementId)
      conn.to = labelMap.get(el.endBinding.elementId) ||
        tgt?.text || el.endBinding.elementId
    }

    // Arrow label
    const arrowLabel = labelMap.get(el.id)
    if (arrowLabel) conn.label = arrowLabel

    // Only include if at least one endpoint is bound
    if (conn.from || conn.to) {
      connections.push(conn)
    }
  }

  // Summary
  const shapeCount = compactElements.filter(
    (e) => e.type !== "text" && e.type !== "freedraw"
  ).length
  const textCount = compactElements.filter((e) => e.type === "text").length
  const arrowCount = connections.length

  const parts: string[] = []
  if (shapeCount > 0) parts.push(`${shapeCount} shape${shapeCount > 1 ? "s" : ""}`)
  if (textCount > 0) parts.push(`${textCount} text element${textCount > 1 ? "s" : ""}`)
  if (arrowCount > 0) parts.push(`${arrowCount} connection${arrowCount > 1 ? "s" : ""}`)
  const description = parts.length > 0
    ? `Drawing contains ${parts.join(", ")}`
    : "Empty drawing"

  // Detect overlaps (elements whose bounding boxes intersect)
  const overlaps: string[] = []
  for (let i = 0; i < compactElements.length; i++) {
    for (let j = i + 1; j < compactElements.length; j++) {
      const a = compactElements[i]
      const b = compactElements[j]
      const ax = a.x as number, ay = a.y as number
      const aw = (a.w as number) || 0, ah = (a.h as number) || 0
      const bx = b.x as number, by = b.y as number
      const bw = (b.w as number) || 0, bh = (b.h as number) || 0

      if (ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by) {
        const aName = (a.label as string) || (a.id as string)
        const bName = (b.label as string) || (b.id as string)
        overlaps.push(`"${aName}" overlaps with "${bName}"`)
      }
    }
  }

  return {
    elements: compactElements,
    connections,
    ...(overlaps.length > 0 ? { overlaps } : {}),
    description,
  }
}

const tools: Tool[] = [
  {
    definition: {
      name: "list_notes",
      description:
        "List all notes in the vault. Returns metadata (id, title, type, tags, dates) without content.",
      parameters: {
        type: "object",
        properties: {
          includeTrash: {
            type: "boolean",
            description: "Include trashed notes (default: false)",
          },
        },
      },
    },
    handler: async (params, ctx) => {
      const notes = listAllNotes(
        ctx.userId,
        ctx.vaultId,
        params.includeTrash === true
      )
      return notes.map((n) => ({
        id: n.id,
        title: n.title,
        type: n.noteType,
        tags: n.tags,
        isFavorite: n.isFavorite,
        isTrashed: n.isTrashed,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }))
    },
  },
  {
    definition: {
      name: "get_note",
      description:
        "Read a note's full content by ID. Returns the title, content (markdown or JSON for excalidraw/canvas), type, and metadata.",
      parameters: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The UUID of the note to read",
          },
        },
        required: ["noteId"],
      },
    },
    handler: async (params, ctx) => {
      const note = getNote(
        params.noteId as string,
        ctx.userId,
        ctx.vaultId
      )
      if (!note) return { error: "Note not found" }
      return {
        id: note.metadata.id,
        title: note.metadata.title,
        content: note.content,
        type: note.metadata.noteType,
        tags: note.metadata.tags,
        isFavorite: note.metadata.isFavorite,
        createdAt: note.metadata.createdAt,
        updatedAt: note.metadata.updatedAt,
      }
    },
  },
  {
    definition: {
      name: "search_notes",
      description:
        "Full-text search across all notes. Returns matching notes with context snippets.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          limit: {
            type: "number",
            description: "Max results to return (default: 10)",
          },
        },
        required: ["query"],
      },
    },
    handler: async (params, ctx) => {
      return searchNotesWithSnippets(
        params.query as string,
        ctx.userId,
        ctx.vaultId,
        (params.limit as number) || 10
      )
    },
  },
  {
    definition: {
      name: "create_note",
      description:
        "Create a new note. Returns the created note's metadata.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title for the new note",
          },
          content: {
            type: "string",
            description: "Initial markdown content (optional)",
          },
          parentId: {
            type: "string",
            description: "Folder ID to create the note in (optional, defaults to root)",
          },
        },
        required: ["title"],
      },
    },
    handler: async (params, ctx) => {
      return createNote(
        params.title as string,
        ctx.userId,
        ctx.vaultId,
        (params.parentId as string) || null,
        params.content as string | undefined
      )
    },
  },
  {
    definition: {
      name: "update_note",
      description:
        "Update an existing note's content and/or title.",
      parameters: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The UUID of the note to update",
          },
          content: {
            type: "string",
            description: "New markdown content (optional)",
          },
          title: {
            type: "string",
            description: "New title (optional)",
          },
        },
        required: ["noteId"],
      },
    },
    handler: async (params, ctx) => {
      const noteId = params.noteId as string
      const results: Record<string, unknown> = {}

      if (typeof params.title === "string") {
        updateNoteTitle(noteId, params.title, ctx.userId, ctx.vaultId)
        results.titleUpdated = true
      }

      if (typeof params.content === "string") {
        const saveResult = updateNoteContent(
          noteId,
          params.content,
          ctx.userId,
          ctx.vaultId
        )
        results.version = saveResult.version
        results.status = saveResult.status
      }

      return { success: true, ...results }
    },
  },
  {
    definition: {
      name: "delete_note",
      description:
        "Move a note to trash (soft delete). The note can be restored later.",
      parameters: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The UUID of the note to trash",
          },
        },
        required: ["noteId"],
      },
    },
    handler: async (params, ctx) => {
      deleteNote(params.noteId as string, ctx.userId, ctx.vaultId)
      return { success: true }
    },
  },
  {
    definition: {
      name: "list_folders",
      description:
        "Get the folder tree structure of the vault. Returns a hierarchical tree of folders and their children.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    handler: async (_params, ctx) => {
      return getFolderTree(ctx.userId, ctx.vaultId)
    },
  },
  {
    definition: {
      name: "list_tags",
      description: "List all tags in the vault.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    handler: async (_params, ctx) => {
      return listTags(ctx.userId, ctx.vaultId)
    },
  },
  {
    definition: {
      name: "get_excalidraw",
      description:
        "Read an excalidraw drawing. Returns a compact scene description with element types, labels, positions, and connections. Much smaller than raw JSON.",
      parameters: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The UUID of the excalidraw/canvas note",
          },
        },
        required: ["noteId"],
      },
    },
    handler: async (params, ctx) => {
      const note = getNote(
        params.noteId as string,
        ctx.userId,
        ctx.vaultId
      )
      if (!note) return { error: "Note not found" }
      if (
        note.metadata.noteType !== "excalidraw" &&
        note.metadata.noteType !== "canvas"
      ) {
        return { error: "Note is not an excalidraw or canvas note" }
      }

      // Parse and serialize to a compact AI-friendly format
      try {
        const data = JSON.parse(note.content)
        const elements = (data.elements || []) as Record<string, unknown>[]
        return {
          id: note.metadata.id,
          title: note.metadata.title,
          scene: describeExcalidrawScene(elements),
        }
      } catch {
        return {
          id: note.metadata.id,
          title: note.metadata.title,
          scene: { elements: [], connections: [], description: "Empty or invalid drawing" },
        }
      }
    },
  },
  {
    definition: {
      name: "draw_excalidraw",
      description: `Add shapes to an excalidraw drawing using skeleton elements. Each element only needs minimal fields; defaults are filled in automatically.

Skeleton element examples:
- Rectangle with label: {"type":"rectangle","x":100,"y":100,"width":200,"height":80,"backgroundColor":"#a5d8ff","label":{"text":"My Box"}}
- Diamond: {"type":"diamond","x":350,"y":100,"width":150,"height":100,"backgroundColor":"#b2f2bb","label":{"text":"Decision?"}}
- Ellipse: {"type":"ellipse","x":100,"y":300,"width":180,"height":80,"backgroundColor":"#ffc9c9","label":{"text":"Process"}}
- Text only: {"type":"text","x":100,"y":50,"text":"Title","fontSize":28}
- Arrow between shapes: {"type":"arrow","x":0,"y":0,"start":{"id":"elem_1"},"end":{"id":"elem_2"}}
- Arrow with label: {"type":"arrow","x":0,"y":0,"start":{"id":"elem_1"},"end":{"id":"elem_2"},"label":{"text":"Yes"}}
- Line with points: {"type":"line","x":100,"y":200,"points":[[0,0],[200,100]]}

Colors: #a5d8ff (blue), #b2f2bb (green), #ffc9c9 (red), #ffec99 (yellow), #d0bfff (purple), #ffd8a8 (orange), #e9ecef (gray), transparent
Give each element an "id" like "elem_1","elem_2" so arrows can reference them via start/end. IMPORTANT: arrows can ONLY bind to elements defined in the SAME elements array. Do NOT reference IDs from existing canvas elements. Always recreate all shapes you want to connect. Space elements ~250px apart.`,
      parameters: {
        type: "object",
        properties: {
          noteId: {
            type: "string",
            description: "The UUID of the excalidraw note",
          },
          elements: {
            type: "string",
            description:
              "JSON array of skeleton elements to add to the drawing",
          },
        },
        required: ["noteId", "elements"],
      },
    },
    handler: async (params, ctx) => {
      const note = getNote(
        params.noteId as string,
        ctx.userId,
        ctx.vaultId
      )
      if (!note) return { error: "Note not found" }
      if (
        note.metadata.noteType !== "excalidraw" &&
        note.metadata.noteType !== "canvas"
      ) {
        return { error: "Note is not an excalidraw note" }
      }
      // Validate the elements JSON
      let skeletonElements
      try {
        skeletonElements = JSON.parse(params.elements as string)
        if (!Array.isArray(skeletonElements)) {
          return { error: "elements must be a JSON array" }
        }
      } catch {
        return { error: "Invalid JSON in elements" }
      }

      // Convert skeleton elements to full Excalidraw elements server-side
      const converted = convertSkeletonToExcalidraw(skeletonElements)

      // Merge with existing content
      let existing: { elements?: unknown[]; appState?: unknown; files?: unknown } = {}
      try {
        existing = JSON.parse(note.content || "{}")
      } catch {
        // empty or invalid content, start fresh
      }

      const merged = {
        type: "excalidraw",
        version: 2,
        source: "openvlt",
        elements: [...(existing.elements ?? []), ...converted],
        appState: existing.appState ?? { viewBackgroundColor: "#ffffff" },
        files: existing.files ?? {},
      }

      updateNoteContent(
        note.metadata.id,
        JSON.stringify(merged),
        ctx.userId,
        ctx.vaultId
      )

      // Return skeleton info for browser-side path (backwards compat with in-app AI chat)
      return {
        success: true,
        noteId: params.noteId,
        skeletonElements,
        pendingConversion: true,
        serverSaved: true,
        elementCount: converted.length,
      }
    },
  },
]

export function getToolDefinitions(): ToolDefinition[] {
  return tools.map((t) => t.definition)
}

export function getToolHandler(name: string): Tool["handler"] | undefined {
  return tools.find((t) => t.definition.name === name)?.handler
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>,
  ctx: ToolContext
): Promise<unknown> {
  const handler = getToolHandler(name)
  if (!handler) {
    return { error: `Unknown tool: ${name}` }
  }
  return handler(params, ctx)
}

export { tools }
