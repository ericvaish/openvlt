import crypto from "crypto"
import { SERVER_KEY } from "@/lib/constants"

const IV_LENGTH = 12
const TAG_LENGTH = 16

function getServerKey(): Buffer {
  if (!SERVER_KEY || SERVER_KEY.length !== 64) {
    throw new Error(
      "OPENVLT_SERVER_KEY must be set to a 64-character hex string (256 bits)"
    )
  }
  return Buffer.from(SERVER_KEY, "hex")
}

/**
 * Encrypt a token (OAuth access/refresh token) for storage at rest.
 * Uses the server key from OPENVLT_SERVER_KEY env var.
 */
export function encryptToken(token: string): string {
  const key = getServerKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(token, "utf-8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

/**
 * Decrypt a token from storage.
 */
export function decryptToken(encryptedBase64: string): string {
  const key = getServerKey()
  const data = Buffer.from(encryptedBase64, "base64")
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf-8"
  )
}

/**
 * Encrypt the backup key with the server key for automated scheduled backups.
 */
export function encryptBackupKeyWithServerKey(backupKey: Buffer): string {
  return encryptToken(backupKey.toString("base64"))
}

/**
 * Decrypt the backup key using the server key.
 */
export function decryptBackupKeyWithServerKey(encrypted: string): Buffer {
  return Buffer.from(decryptToken(encrypted), "base64")
}
