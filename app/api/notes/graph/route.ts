import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"

export async function GET() {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const db = getDb()

    const notes = db
      .prepare(
        "SELECT id, title FROM notes WHERE is_trashed = 0 AND user_id = ? AND vault_id = ?"
      )
      .all(user.id, vaultId) as {
      id: string
      title: string
    }[]

    // Build title -> id lookup (case-insensitive)
    const titleToId = new Map<string, string>()
    const idSet = new Set<string>()
    for (const note of notes) {
      titleToId.set(note.title.toLowerCase(), note.id)
      idSet.add(note.id)
    }

    const nodes = notes.map((n) => ({ id: n.id, title: n.title }))
    const linkSet = new Set<string>()
    const links: { source: string; target: string }[] = []

    // Use FTS content to extract links instead of reading all files from disk.
    // notes_fts stores the indexed content, so we can read it directly.
    for (const note of notes) {
      try {
        // Read FTS content (already indexed, no disk I/O)
        const ftsRow = db
          .prepare(
            `SELECT content FROM notes_fts WHERE rowid = (SELECT rowid FROM notes WHERE id = ?)`
          )
          .get(note.id) as { content: string } | undefined

        if (!ftsRow?.content) continue
        const content = ftsRow.content

        // Extract [[wiki-links]]
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g
        let match
        while ((match = wikiLinkRegex.exec(content)) !== null) {
          const linkedTitle = match[1].toLowerCase()
          const targetId = titleToId.get(linkedTitle)
          if (targetId && targetId !== note.id) {
            const key = `${note.id}->${targetId}`
            if (!linkSet.has(key)) {
              linkSet.add(key)
              links.push({ source: note.id, target: targetId })
            }
          }
        }

        // Also detect /notes/{uuid} references
        const uuidRegex =
          /\/notes\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/g
        while ((match = uuidRegex.exec(content)) !== null) {
          const targetId = match[1]
          if (targetId !== note.id && idSet.has(targetId)) {
            const key = `${note.id}->${targetId}`
            if (!linkSet.has(key)) {
              linkSet.add(key)
              links.push({ source: note.id, target: targetId })
            }
          }
        }
      } catch {
        // skip
      }
    }

    return NextResponse.json({ nodes, links })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
