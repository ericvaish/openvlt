"use client"

import * as React from "react"
import { ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { VersionTrigger, EditSession } from "@/types"
import type { VersionMeta } from "@/lib/versions/service"

interface VersionTimelineProps {
  noteId: string
  onSelectVersion: (versionId: string) => void
  selectedVersionId?: string
}

interface VersionGroup {
  session: EditSession | null
  versions: VersionMeta[]
}

export function VersionTimeline({
  noteId,
  onSelectVersion,
  selectedVersionId,
}: VersionTimelineProps) {
  const [versions, setVersions] = React.useState<VersionMeta[]>([])
  const [sessions, setSessions] = React.useState<EditSession[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    setLoading(true)
    fetch(`/api/history/notes/${noteId}`)
      .then((r) => r.json())
      .then((data) => {
        setVersions(data.versions ?? [])
        setSessions(data.sessions ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [noteId])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        Loading history...
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        No version history yet
      </div>
    )
  }

  // Group versions by session
  const groups = groupBySession(versions, sessions)

  return (
    <div className="flex flex-col gap-1 p-2">
      {groups.map((group, gi) => (
        <SessionGroup
          key={group.session?.id ?? `ungrouped-${gi}`}
          group={group}
          selectedVersionId={selectedVersionId}
          onSelectVersion={onSelectVersion}
        />
      ))}
    </div>
  )
}

function SessionGroup({
  group,
  selectedVersionId,
  onSelectVersion,
}: {
  group: VersionGroup
  selectedVersionId?: string
  onSelectVersion: (id: string) => void
}) {
  const [expanded, setExpanded] = React.useState(true)
  const session = group.session

  const timeRange = session
    ? `${formatTime(session.startedAt)} – ${formatTime(session.endedAt ?? session.lastEditAt)}`
    : "Ungrouped"

  return (
    <div className="rounded-md border border-border/50 bg-muted/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
      >
        <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")} />
        <span className="font-medium">{timeRange}</span>
        <span className="ml-auto tabular-nums">
          {group.versions.length} version{group.versions.length !== 1 ? "s" : ""}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-1 py-1">
          {group.versions.map((v) => (
            <VersionItem
              key={v.id}
              version={v}
              isSelected={v.id === selectedVersionId}
              onClick={() => onSelectVersion(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VersionItem({
  version,
  isSelected,
  onClick,
}: {
  version: VersionMeta
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-left text-sm transition-colors",
        isSelected
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-muted"
      )}
    >
      <TriggerDot trigger={version.trigger} />
      <span className="min-w-0 flex-1 truncate">{formatTime(version.createdAt)}</span>
      <span className="text-xs text-muted-foreground">{triggerLabel(version.trigger)}</span>
    </button>
  )
}

function TriggerDot({ trigger }: { trigger: VersionTrigger }) {
  const colors: Record<VersionTrigger, string> = {
    autosave: "bg-muted-foreground/40",
    idle: "bg-blue-500",
    max_interval: "bg-amber-500",
    navigate: "bg-green-500",
    explicit: "bg-primary",
    restore: "bg-purple-500",
    merge: "bg-orange-500",
  }

  return <span className={cn("size-2 shrink-0 rounded-full", colors[trigger])} />
}

function triggerLabel(trigger: VersionTrigger): string {
  const labels: Record<VersionTrigger, string> = {
    autosave: "auto",
    idle: "idle",
    max_interval: "interval",
    navigate: "nav",
    explicit: "saved",
    restore: "restore",
    merge: "merge",
  }
  return labels[trigger]
}

function groupBySession(
  versions: VersionMeta[],
  sessions: EditSession[]
): VersionGroup[] {
  const sessionMap = new Map(sessions.map((s) => [s.id, s]))
  const groups: VersionGroup[] = []
  const grouped = new Map<string, VersionMeta[]>()
  const ungrouped: VersionMeta[] = []

  for (const v of versions) {
    if (v.sessionId) {
      if (!grouped.has(v.sessionId)) grouped.set(v.sessionId, [])
      grouped.get(v.sessionId)!.push(v)
    } else {
      ungrouped.push(v)
    }
  }

  // Add session groups in chronological order (newest first — versions already sorted DESC)
  for (const [sessionId, versionList] of grouped) {
    groups.push({
      session: sessionMap.get(sessionId) ?? null,
      versions: versionList,
    })
  }

  if (ungrouped.length > 0) {
    groups.push({ session: null, versions: ungrouped })
  }

  return groups
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  if (isToday) return time
  if (isYesterday) return `Yesterday ${time}`
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ` ${time}`
}
