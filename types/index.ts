export interface User {
  id: string
  username: string
  displayName: string
  createdAt: string
}

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: string
  createdAt: string
}

export type NoteType = "markdown" | "excalidraw" | "canvas"

export interface NoteMetadata {
  id: string
  title: string
  filePath: string
  parentId: string | null
  vaultId: string
  createdAt: string
  updatedAt: string
  isTrashed: boolean
  trashedAt: string | null
  isFavorite: boolean
  isLocked: boolean
  tags: string[]
  version: number
  noteType: NoteType
  /** IDs of notes that link to this note */
  backlinks?: string[]
}

export interface NoteWithContent {
  metadata: NoteMetadata
  content: string
}

export interface ConflictRegion {
  startLine: number
  endLine: number
  ours: string
  theirs: string
}

export interface SaveResult {
  version: number
  content: string
  status: "saved" | "merged" | "conflict"
  conflicts?: ConflictRegion[]
  serverContent?: string
}

export interface FolderNode {
  id: string
  name: string
  path: string
  parentId: string | null
  vaultId: string
  createdAt: string
}

export interface TreeNode {
  id: string
  name: string
  path: string
  type: "file" | "folder" | "attachment"
  /** MIME type for attachment nodes */
  mimeType?: string
  children?: TreeNode[]
}

export interface Tag {
  id: string
  name: string
  userId: string
}

export type VersionTrigger =
  | "autosave"
  | "idle"
  | "max_interval"
  | "navigate"
  | "explicit"
  | "restore"
  | "merge"

export interface NoteVersion {
  id: string
  noteId: string
  content: string
  title: string
  createdAt: string
  versionNumber: number
  sessionId: string | null
  isSnapshot: boolean
  trigger: VersionTrigger
}

export interface EditSession {
  id: string
  noteId: string
  userId: string
  startedAt: string
  lastEditAt: string
  endedAt: string | null
  versionId: string | null
}

export type StructureEventType =
  | "note_created"
  | "note_moved"
  | "note_renamed"
  | "note_deleted"
  | "note_restored"
  | "note_trashed"
  | "folder_created"
  | "folder_moved"
  | "folder_renamed"
  | "folder_deleted"
  | "attachment_added"
  | "attachment_removed"

export interface StructureEvent {
  id: string
  vaultId: string
  userId: string
  eventType: StructureEventType
  entityType: "note" | "folder" | "attachment"
  entityId: string
  fromState: Record<string, unknown> | null
  toState: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface AttachmentVersion {
  id: string
  attachmentId: string
  noteId: string
  fileName: string
  versionPath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface VaultSnapshot {
  notes: { id: string; title: string; filePath: string; parentId: string | null }[]
  folders: { id: string; name: string; path: string; parentId: string | null }[]
  events: StructureEvent[]
  timestamp: string
}

export interface FolderSnapshot {
  notes: { id: string; title: string; filePath: string }[]
  folders: { id: string; name: string; path: string }[]
  events: StructureEvent[]
  timestamp: string
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged"
  content: string
  lineNumber: number
}

export interface Attachment {
  id: string
  noteId: string
  fileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface Vault {
  id: string
  name: string
  path: string
  userId: string
  isActive: boolean
  createdAt: string
}

export interface Bookmark {
  id: string
  userId: string
  vaultId: string
  type: "note" | "heading" | "search"
  /** Note ID for note/heading bookmarks */
  targetId: string | null
  /** Display label */
  label: string
  /** Extra data: heading ID, search query, etc. */
  data: string | null
  sortOrder: number
  createdAt: string
}
