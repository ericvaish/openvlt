import path from "path"

export const DB_PATH =
  process.env.OPENVLT_DB_PATH ??
  path.join(process.cwd(), "data", ".openvlt", "openvlt.db")

export const SESSION_COOKIE_NAME = "openvlt_session"

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// Server-side encryption key for OAuth tokens and backup keys at rest
// Must be a 64-character hex string (256 bits)
export const SERVER_KEY = process.env.OPENVLT_SERVER_KEY ?? ""

// Google Drive OAuth
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ""
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ""
export const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? ""
