import crypto from "crypto"

const PBKDF2_ITERATIONS = 100000
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 12
const TAG_LENGTH = 16
const FORMAT_VERSION = 1

/**
 * Generate a random 256-bit backup key.
 */
export function generateBackupKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH)
}

/**
 * Wrap (encrypt) the backup key with a user-provided password via PBKDF2.
 * Returns the encrypted key and the salt used for derivation.
 */
export function encryptBackupKey(
  backupKey: Buffer,
  password: string
): { encrypted: string; salt: string } {
  const salt = crypto.randomBytes(16)
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  )
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv)
  const encrypted = Buffer.concat([cipher.update(backupKey), cipher.final()])
  const tag = cipher.getAuthTag()

  // Format: iv + tag + encrypted
  const result = Buffer.concat([iv, tag, encrypted])
  return {
    encrypted: result.toString("base64"),
    salt: salt.toString("base64"),
  }
}

/**
 * Unwrap (decrypt) the backup key with the user's password.
 */
export function decryptBackupKey(
  encryptedBase64: string,
  password: string,
  saltBase64: string
): Buffer {
  const data = Buffer.from(encryptedBase64, "base64")
  const salt = Buffer.from(saltBase64, "base64")

  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH)

  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  )

  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/**
 * Encrypt file content with the backup key for cloud storage.
 * Format: [4B version uint32] [12B IV] [16B auth tag] [ciphertext]
 */
export function encryptFile(plaintext: Buffer, backupKey: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", backupKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()

  const versionBuf = Buffer.alloc(4)
  versionBuf.writeUInt32BE(FORMAT_VERSION, 0)

  return Buffer.concat([versionBuf, iv, tag, encrypted])
}

/**
 * Decrypt file content with the backup key.
 */
export function decryptFile(data: Buffer, backupKey: Buffer): Buffer {
  const version = data.readUInt32BE(0)
  if (version !== FORMAT_VERSION) {
    throw new Error(`Unsupported backup file format version: ${version}`)
  }

  const iv = data.subarray(4, 4 + IV_LENGTH)
  const tag = data.subarray(4 + IV_LENGTH, 4 + IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(4 + IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv("aes-256-gcm", backupKey, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/**
 * SHA-256 hash of content for change detection.
 */
export function hashContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}
