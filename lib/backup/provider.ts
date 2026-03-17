import type { CloudProvider, CloudStorageProvider } from "@/types"
import { GoogleDriveProvider } from "@/lib/backup/providers/google-drive"

const providers: Partial<Record<CloudProvider, CloudStorageProvider>> = {}

/**
 * Get a cloud storage provider implementation by type.
 */
export function getProvider(type: CloudProvider): CloudStorageProvider {
  if (!providers[type]) {
    switch (type) {
      case "google_drive":
        providers[type] = new GoogleDriveProvider()
        break
      default:
        throw new Error(`Cloud provider "${type}" is not yet supported`)
    }
  }
  return providers[type]!
}
