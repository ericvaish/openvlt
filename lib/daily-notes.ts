import { getDb } from "@/lib/db"
import { createNote } from "@/lib/notes"
import { renderTemplate } from "@/lib/templates"
import type { NoteMetadata } from "@/types"

const DAILY_TEMPLATE = `# {{date}}

## Grateful For
-

## Today's Goals
- [ ]

## Notes


## Reflection

`

/**
 * Format today's date as a title string, e.g. "March 16, 2026"
 */
function todayTitle(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

/**
 * Format a date as YYYY-MM-DD for matching
 */
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Get or create today's daily note.
 * Looks for an existing note whose title matches today's date format,
 * otherwise creates a new one with the daily journal template.
 */
export function getOrCreateDailyNote(
  userId: string,
  vaultId: string
): NoteMetadata {
  const db = getDb()
  const title = todayTitle()
  const isoDate = todayISO()

  // Look for a note titled with today's date (either long format or ISO)
  const existing = db
    .prepare(
      `SELECT * FROM notes
       WHERE user_id = ? AND vault_id = ? AND is_trashed = 0
       AND (title = ? OR title = ?)
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId, vaultId, title, isoDate) as Record<string, unknown> | undefined

  if (existing) {
    // Return existing daily note metadata
    const tagRows = db
      .prepare(
        `SELECT t.name FROM tags t
         JOIN note_tags nt ON nt.tag_id = t.id
         WHERE nt.note_id = ?`
      )
      .all(existing.id as string) as { name: string }[]

    return {
      id: existing.id as string,
      title: existing.title as string,
      filePath: existing.file_path as string,
      parentId: (existing.parent_id as string) || null,
      vaultId: (existing.vault_id as string) || "",
      createdAt: existing.created_at as string,
      updatedAt: existing.updated_at as string,
      isTrashed: false,
      trashedAt: null,
      isFavorite: (existing.is_favorite as number) === 1,
      isLocked: (existing.is_locked as number) === 1,
      tags: tagRows.map((t) => t.name),
      version: (existing.version as number) ?? 1,
      noteType: "markdown",
    }
  }

  // Create a new daily note with the journal template
  const content = renderTemplate(DAILY_TEMPLATE)
  return createNote(title, userId, vaultId, null, content)
}
