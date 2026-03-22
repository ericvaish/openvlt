import path from "path"

/**
 * Paths that are blocked by default for security.
 * Prevents vault creation and filesystem browsing in sensitive system directories.
 */
const BLOCKED_PATHS = [
  "/etc", "/var", "/proc", "/sys", "/dev", "/sbin", "/bin", "/usr",
  "/tmp", "/private", "/System", "/root", "/home", "/opt", "/snap",
  "/boot", "/lib", "/lib64", "/run", "/srv",
]

/**
 * Allowed paths take precedence over the blocklist.
 * Configured via OPENVLT_ALLOWED_PATHS env var (comma-separated absolute paths).
 * The app's data directory (from OPENVLT_DATA_DIR or cwd/data) is always allowed.
 */
function getAllowedPaths(): string[] {
  const allowed: string[] = []

  // Always allow the app's data directory
  const dataDir = process.env.OPENVLT_DATA_DIR || path.join(process.cwd(), "data")
  allowed.push(path.resolve(dataDir))

  // Allow paths from env var
  const envPaths = process.env.OPENVLT_ALLOWED_PATHS
  if (envPaths) {
    for (const p of envPaths.split(",")) {
      const trimmed = p.trim()
      if (trimmed && path.isAbsolute(trimmed)) {
        allowed.push(path.resolve(trimmed))
      }
    }
  }

  return allowed
}

function isAllowedPath(resolved: string): boolean {
  const allowed = getAllowedPaths()
  return allowed.some(
    (a) => resolved === a || resolved.startsWith(a + "/")
  )
}

/**
 * Check if a resolved path is blocked.
 * Allowed paths take precedence over the blocklist.
 */
export function isBlockedPath(resolved: string): boolean {
  if (isAllowedPath(resolved)) return false
  return BLOCKED_PATHS.some(
    (blocked) => resolved === blocked || resolved.startsWith(blocked + "/")
  )
}
