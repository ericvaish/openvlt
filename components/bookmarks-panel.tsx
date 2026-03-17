"use client"

import * as React from "react"
import {
  BookmarkIcon,
  XIcon,
  FileTextIcon,
  HashIcon,
  SearchIcon,
} from "lucide-react"
import { useTabStore } from "@/lib/stores/tab-store"
import type { Bookmark } from "@/types"

export function BookmarksPanel() {
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([])
  const [loading, setLoading] = React.useState(true)
  const { openTab } = useTabStore()

  const fetchBookmarks = React.useCallback(async () => {
    try {
      const res = await fetch("/api/bookmarks")
      if (res.ok) {
        setBookmarks(await res.json())
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchBookmarks()
  }, [fetchBookmarks])

  // Listen for bookmark refresh events
  React.useEffect(() => {
    const handler = () => fetchBookmarks()
    window.addEventListener("openvlt:bookmarks-refresh", handler)
    return () =>
      window.removeEventListener("openvlt:bookmarks-refresh", handler)
  }, [fetchBookmarks])

  async function handleRemove(id: string) {
    await fetch(`/api/bookmarks/${id}`, { method: "DELETE" })
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }

  function handleClick(bookmark: Bookmark) {
    switch (bookmark.type) {
      case "note":
        if (bookmark.targetId) {
          openTab(bookmark.targetId, bookmark.label)
        }
        break
      case "heading":
        if (bookmark.targetId) {
          openTab(bookmark.targetId, bookmark.label)
          // After opening, scroll to heading via event
          setTimeout(() => {
            if (bookmark.data) {
              window.dispatchEvent(
                new CustomEvent("openvlt:scroll-to-heading", {
                  detail: { headingText: bookmark.data },
                })
              )
            }
          }, 500)
        }
        break
      case "search":
        if (bookmark.data) {
          window.location.href = `/notes?search=${encodeURIComponent(bookmark.data)}`
        }
        break
    }
  }

  if (loading || bookmarks.length === 0) return null

  const iconForType = {
    note: FileTextIcon,
    heading: HashIcon,
    search: SearchIcon,
  }

  return (
    <>
      {bookmarks.map((bookmark) => {
        const Icon = iconForType[bookmark.type]
        return (
          <div
            key={bookmark.id}
            role="button"
            tabIndex={0}
            className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => handleClick(bookmark)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                handleClick(bookmark)
              }
            }}
            title={
              bookmark.type === "heading"
                ? `${bookmark.label} → ${bookmark.data}`
                : bookmark.label
            }
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">{bookmark.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(bookmark.id)
              }}
              className="hidden size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground group-hover:flex hover:text-foreground"
              title="Remove bookmark"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        )
      })}
    </>
  )
}

/** Helper to add a bookmark via API */
export async function addBookmark(
  type: Bookmark["type"],
  label: string,
  targetId?: string | null,
  data?: string | null
): Promise<Bookmark | null> {
  try {
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, label, targetId, data }),
    })
    if (res.ok) {
      const result = await res.json()
      window.dispatchEvent(new Event("openvlt:bookmarks-refresh"))
      if (result.removed) return null
      return result as Bookmark
    }
  } catch {
    // silently fail
  }
  return null
}
