import * as cron from "node-cron"
import { getDb } from "@/lib/db"
import { runBackup } from "@/lib/backup/service"
import type { BackupFrequency } from "@/types"

const FREQUENCY_CRON: Record<BackupFrequency, string> = {
  hourly: "0 * * * *",
  every_6h: "0 */6 * * *",
  every_12h: "0 */12 * * *",
  daily: "0 2 * * *", // 2 AM
  weekly: "0 2 * * 0", // Sunday 2 AM
}

const activeJobs = new Map<string, ReturnType<typeof cron.schedule>>()
let initialized = false

/**
 * Initialize the backup scheduler by loading all enabled configs from DB.
 * Called once on server startup.
 */
export function initBackupScheduler(): void {
  if (initialized) return
  initialized = true

  const db = getDb()
  const configs = db
    .prepare("SELECT id, frequency FROM backup_configs WHERE enabled = 1")
    .all() as { id: string; frequency: BackupFrequency }[]

  for (const config of configs) {
    scheduleBackup(config.id, config.frequency)
  }

  if (configs.length > 0) {
    console.log(`[backup] Initialized scheduler with ${configs.length} config(s)`)
  }
}

/**
 * Schedule or reschedule a backup job for a config.
 */
export function scheduleBackup(
  configId: string,
  frequency: BackupFrequency
): void {
  // Cancel existing job if any
  cancelBackup(configId)

  const cronExpression = FREQUENCY_CRON[frequency]
  if (!cronExpression) return

  const task = cron.schedule(cronExpression, async () => {
    console.log(`[backup] Starting scheduled backup for config ${configId}`)
    try {
      const result = await runBackup(configId)
      console.log(
        `[backup] Completed: ${result.filesUploaded} files uploaded, ${result.filesDeleted} deleted, ${result.bytesUploaded} bytes`
      )
    } catch (err) {
      console.error(`[backup] Failed for config ${configId}:`, err)
    }
  })

  activeJobs.set(configId, task)
}

/**
 * Cancel a scheduled backup job.
 */
export function cancelBackup(configId: string): void {
  const existing = activeJobs.get(configId)
  if (existing) {
    existing.stop()
    activeJobs.delete(configId)
  }
}

/**
 * Get the number of active scheduled backup jobs.
 */
export function getActiveJobCount(): number {
  return activeJobs.size
}
