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
  icon: string | null
  coverImage: string | null
  /** Alternative names for wiki-link resolution */
  aliases: string[]
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

// ── Sync Log ──

export type SyncEntityType = "note" | "folder" | "attachment" | "metadata"

export type SyncChangeType =
  | "create"
  | "update"
  | "delete"
  | "move"
  | "rename"
  | "trash"
  | "restore"
  | "favorite"

export interface SyncLogEntry {
  seq: number
  vaultId: string
  entityType: SyncEntityType
  entityId: string
  changeType: SyncChangeType
  payload: Record<string, unknown> | null
  contentHash: string | null
  createdAt: string
  peerOrigin: string | null
}

// ── Cloud Backup ──

export type CloudProvider = "google_drive" | "dropbox" | "s3" | "webdav"

export type BackupFrequency =
  | "hourly"
  | "every_6h"
  | "every_12h"
  | "daily"
  | "weekly"

export interface CloudProviderRecord {
  id: string
  userId: string
  provider: CloudProvider
  displayName: string | null
  tokenExpiresAt: string | null
  providerMetadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface BackupConfig {
  id: string
  vaultId: string
  userId: string
  providerId: string
  enabled: boolean
  frequency: BackupFrequency
  maxVersions: number
  remoteFolderId: string | null
  createdAt: string
  updatedAt: string
}

export type BackupRunStatus = "running" | "completed" | "failed" | "partial"

export interface BackupRun {
  id: string
  configId: string
  status: BackupRunStatus
  startedAt: string
  completedAt: string | null
  filesUploaded: number
  filesDeleted: number
  bytesUploaded: number
  errorMessage: string | null
  lastSyncLogSeq: number | null
}

export interface BackupFileEntry {
  id: string
  configId: string
  noteId: string | null
  entityType: "note" | "attachment" | "manifest"
  localPath: string
  remoteFileId: string | null
  contentHash: string
  encryptedSize: number | null
  lastBackedUpAt: string
}

export interface CloudStorageProvider {
  getAuthUrl(redirectUri: string): string
  exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }>
  refreshToken(
    refreshToken: string
  ): Promise<{ accessToken: string; expiresAt: string }>
  uploadFile(
    accessToken: string,
    folderId: string,
    name: string,
    data: Buffer,
    mimeType?: string
  ): Promise<{ fileId: string }>
  updateFile(
    accessToken: string,
    fileId: string,
    data: Buffer
  ): Promise<void>
  downloadFile(accessToken: string, fileId: string): Promise<Buffer>
  deleteFile(accessToken: string, fileId: string): Promise<void>
  createFolder(
    accessToken: string,
    parentId: string,
    name: string
  ): Promise<{ folderId: string }>
  listFolder(
    accessToken: string,
    folderId: string
  ): Promise<{ id: string; name: string; mimeType: string }[]>
  getStorageQuota(
    accessToken: string
  ): Promise<{ used: number; total: number }>
}

// ── Peer Sync ──

export interface SyncPeer {
  id: string
  displayName: string
  createdAt: string
}

export interface SyncPairing {
  id: string
  localVaultId: string
  remotePeerId: string
  remoteUrl: string
  syncMode: "all" | "selected"
  isActive: boolean
  lastSyncAt: string | null
  createdAt: string
}

export interface SyncCursor {
  id: string
  pairingId: string
  remotePeerId: string
  lastReceivedSeq: number
  lastSentSeq: number
  updatedAt: string
}

export interface SyncIdMapping {
  pairingId: string
  localId: string
  remoteId: string
  entityType: SyncEntityType
}

export interface SyncSelection {
  id: string
  pairingId: string
  entityType: "folder" | "note"
  entityId: string
}

// ── Database Views ──

export type PropertyType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "checkbox"
  | "url"

export interface PropertyDefinition {
  id: string
  vaultId: string
  name: string
  type: PropertyType
  options: string[] | null
  sortOrder: number
  createdAt: string
}

export interface NoteProperty {
  propertyId: string
  name: string
  type: PropertyType
  value: string | number | boolean | string[] | null
}

export type DatabaseViewType = "table" | "kanban" | "calendar"

export interface DatabaseViewFilter {
  propertyId: string
  operator:
    | "eq"
    | "neq"
    | "gt"
    | "lt"
    | "gte"
    | "lte"
    | "contains"
    | "not_contains"
    | "is_empty"
    | "is_not_empty"
  value: string
}

export interface DatabaseViewSort {
  propertyId: string
  direction: "asc" | "desc"
}

export interface DatabaseViewConfig {
  visibleProperties: string[]
  sorts: DatabaseViewSort[]
  filters: DatabaseViewFilter[]
  groupByPropertyId?: string
  calendarPropertyId?: string
  calendarEndPropertyId?: string
}

export interface DatabaseView {
  id: string
  vaultId: string
  userId: string
  name: string
  folderId: string | null
  viewType: DatabaseViewType
  config: DatabaseViewConfig
  createdAt: string
  updatedAt: string
}

export interface DatabaseViewRow {
  noteId: string
  title: string
  icon: string | null
  createdAt: string
  updatedAt: string
  properties: Record<string, string | number | boolean | string[] | null>
}

export interface MarkdownEmbedRef {
  noteId: string
  anchor: string
  anchorType: "heading" | "block-id"
  noteTitle?: string
}

// ── Synced Blocks ──

export interface SyncedBlock {
  id: string
  vaultId: string
  userId: string
  content: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface SyncedBlockRef {
  syncedBlockId: string
  noteId: string
}

// ── Two-Factor Authentication ──

export interface TwoFactorStatus {
  enabled: boolean
  methods: string[]
  hasTotp: boolean
  hasWebauthn: boolean
  recoveryCodesRemaining: number
}

export interface LoginResponse {
  user?: User
  requires2FA?: boolean
  pendingToken?: string
  methods?: string[]
  error?: string
}
