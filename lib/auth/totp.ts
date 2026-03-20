import crypto from "crypto"
import { v4 as uuid } from "uuid"
import * as OTPAuth from "otpauth"
import { getDb } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/auth/crypto"

const TOTP_ISSUER = "openvlt"
const TOTP_PERIOD = 30
const TOTP_DIGITS = 6
const TOTP_ALGORITHM = "SHA1"

// ── Server-side AES-256-GCM encryption for TOTP secrets ──

function getServerKey(): Buffer {
  const key = process.env.OPENVLT_SERVER_KEY
  if (!key || key.length < 64) {
    throw new Error(
      "OPENVLT_SERVER_KEY is not configured. " +
      "Set it to a 64-character hex string (256 bits) in your environment."
    )
  }
  return Buffer.from(key.slice(0, 64), "hex")
}

function encryptSecret(plaintext: string): string {
  const key = getServerKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:encrypted (all base64)
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`
}

function decryptSecret(encryptedStr: string): string {
  const key = getServerKey()
  const [ivB64, tagB64, dataB64] = encryptedStr.split(":")
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Invalid encrypted format")
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const encrypted = Buffer.from(dataB64, "base64")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString("utf-8")
}

// ── TOTP Functions ──

export function generateTotpSecret(
  userId: string,
  username: string
): { secret: string; uri: string } {
  const db = getDb()

  // Generate a random secret
  const secretBytes = crypto.randomBytes(20)
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label: username,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromHex(secretBytes.toString("hex")),
  })

  const secretBase32 = totp.secret.base32
  const uri = totp.toString()

  // Encrypt and store (not verified yet)
  const secretEnc = encryptSecret(secretBase32)

  // Remove any existing unverified TOTP for this user
  db.prepare("DELETE FROM user_totp WHERE user_id = ? AND verified = 0").run(
    userId
  )

  db.prepare(
    `INSERT INTO user_totp (id, user_id, secret_enc, verified, created_at)
     VALUES (?, ?, ?, 0, datetime('now'))`
  ).run(uuid(), userId, secretEnc)

  return { secret: secretBase32, uri }
}

export function verifyTotpAndEnable(
  userId: string,
  code: string
): boolean {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT id, secret_enc FROM user_totp WHERE user_id = ? AND verified = 0"
    )
    .get(userId) as { id: string; secret_enc: string } | undefined

  if (!row) return false

  const secretBase32 = decryptSecret(row.secret_enc)
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  })

  const delta = totp.validate({ token: code, window: 1 })
  if (delta === null) return false

  // Mark as verified and enable 2FA on user
  db.prepare("UPDATE user_totp SET verified = 1 WHERE id = ?").run(row.id)

  // Update user's 2FA status
  const existing = db
    .prepare("SELECT two_factor_methods FROM users WHERE id = ?")
    .get(userId) as { two_factor_methods: string | null } | undefined
  const methods: string[] = existing?.two_factor_methods
    ? JSON.parse(existing.two_factor_methods)
    : []
  if (!methods.includes("totp")) methods.push("totp")

  db.prepare(
    "UPDATE users SET two_factor_enabled = 1, two_factor_methods = ? WHERE id = ?"
  ).run(JSON.stringify(methods), userId)

  return true
}

export function verifyTotpCode(userId: string, code: string): boolean {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT secret_enc FROM user_totp WHERE user_id = ? AND verified = 1"
    )
    .get(userId) as { secret_enc: string } | undefined

  if (!row) return false

  const secretBase32 = decryptSecret(row.secret_enc)
  const totp = new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  })

  const delta = totp.validate({ token: code, window: 1 })
  return delta !== null
}

export function disableTotp(userId: string): void {
  const db = getDb()
  db.prepare("DELETE FROM user_totp WHERE user_id = ?").run(userId)

  // Update user's 2FA methods
  const existing = db
    .prepare("SELECT two_factor_methods FROM users WHERE id = ?")
    .get(userId) as { two_factor_methods: string | null } | undefined
  const methods: string[] = existing?.two_factor_methods
    ? JSON.parse(existing.two_factor_methods)
    : []
  const filtered = methods.filter((m) => m !== "totp")

  if (filtered.length === 0) {
    db.prepare(
      "UPDATE users SET two_factor_enabled = 0, two_factor_methods = '[]' WHERE id = ?"
    ).run(userId)
    // Clean up recovery codes when 2FA is fully disabled
    db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId)
  } else {
    db.prepare("UPDATE users SET two_factor_methods = ? WHERE id = ?").run(
      JSON.stringify(filtered),
      userId
    )
  }
}

// ── Recovery Codes ──

export async function generateRecoveryCodes(
  userId: string
): Promise<string[]> {
  const db = getDb()

  // Delete existing codes
  db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId)

  const codes: string[] = []
  const insertStmt = db.prepare(
    `INSERT INTO recovery_codes (id, user_id, code_hash, created_at)
     VALUES (?, ?, ?, datetime('now'))`
  )

  for (let i = 0; i < 10; i++) {
    // Generate 8-char alphanumeric code in xxxx-xxxx format
    const part1 = crypto.randomBytes(2).toString("hex")
    const part2 = crypto.randomBytes(2).toString("hex")
    const code = `${part1}-${part2}`
    codes.push(code)
    const hash = await hashPassword(code)
    insertStmt.run(uuid(), userId, hash)
  }

  return codes
}

export async function verifyRecoveryCode(
  userId: string,
  code: string
): Promise<boolean> {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL"
    )
    .all(userId) as { id: string; code_hash: string }[]

  const normalized = code.trim().toLowerCase()
  for (const row of rows) {
    const match = await verifyPassword(normalized, row.code_hash)
    if (match) {
      db.prepare(
        "UPDATE recovery_codes SET used_at = datetime('now') WHERE id = ?"
      ).run(row.id)
      return true
    }
  }
  return false
}

export function getRecoveryCodeCount(userId: string): number {
  const db = getDb()
  const result = db
    .prepare(
      "SELECT COUNT(*) as count FROM recovery_codes WHERE user_id = ? AND used_at IS NULL"
    )
    .get(userId) as { count: number }
  return result.count
}

// ── Pending 2FA Tokens ──

export function createPending2FAToken(userId: string): string {
  const db = getDb()
  const id = uuid()
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes

  // Clean up any existing pending tokens for this user
  db.prepare("DELETE FROM pending_2fa_tokens WHERE user_id = ?").run(userId)

  db.prepare(
    `INSERT INTO pending_2fa_tokens (id, user_id, token, expires_at, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(id, userId, token, expiresAt)

  return token
}

export function validatePending2FAToken(
  token: string
): { userId: string; tokenId: string } | null {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT id, user_id, expires_at FROM pending_2fa_tokens WHERE token = ?"
    )
    .get(token) as
    | { id: string; user_id: string; expires_at: string }
    | undefined

  if (!row) return null

  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM pending_2fa_tokens WHERE id = ?").run(row.id)
    return null
  }

  return { userId: row.user_id, tokenId: row.id }
}

export function consumePending2FAToken(tokenId: string): void {
  const db = getDb()
  db.prepare("DELETE FROM pending_2fa_tokens WHERE id = ?").run(tokenId)
}

// ── 2FA Status ──

export interface TwoFactorStatus {
  enabled: boolean
  methods: string[]
  hasTotp: boolean
  hasWebauthn: boolean
  recoveryCodesRemaining: number
}

export function getUserTwoFactorStatus(userId: string): TwoFactorStatus {
  const db = getDb()

  const user = db
    .prepare(
      "SELECT two_factor_enabled, two_factor_methods FROM users WHERE id = ?"
    )
    .get(userId) as {
    two_factor_enabled: number
    two_factor_methods: string | null
  } | undefined

  const methods: string[] = user?.two_factor_methods
    ? JSON.parse(user.two_factor_methods)
    : []

  const hasTotp =
    (db
      .prepare(
        "SELECT COUNT(*) as count FROM user_totp WHERE user_id = ? AND verified = 1"
      )
      .get(userId) as { count: number }).count > 0

  const hasWebauthn =
    (db
      .prepare(
        "SELECT COUNT(*) as count FROM webauthn_credentials WHERE user_id = ?"
      )
      .get(userId) as { count: number }).count > 0

  const recoveryCodesRemaining = getRecoveryCodeCount(userId)

  return {
    enabled: user?.two_factor_enabled === 1,
    methods,
    hasTotp,
    hasWebauthn,
    recoveryCodesRemaining,
  }
}

// ── Cleanup ──

export function cleanupExpiredPendingTokens(): void {
  const db = getDb()
  db.prepare(
    "DELETE FROM pending_2fa_tokens WHERE expires_at < datetime('now')"
  ).run()
}

// ── WebAuthn as 2FA method ──

export function addWebauthnAs2FAMethod(userId: string): void {
  const db = getDb()
  const existing = db
    .prepare("SELECT two_factor_methods FROM users WHERE id = ?")
    .get(userId) as { two_factor_methods: string | null } | undefined
  const methods: string[] = existing?.two_factor_methods
    ? JSON.parse(existing.two_factor_methods)
    : []
  if (!methods.includes("webauthn")) methods.push("webauthn")

  db.prepare(
    "UPDATE users SET two_factor_enabled = 1, two_factor_methods = ? WHERE id = ?"
  ).run(JSON.stringify(methods), userId)
}

export function removeWebauthnAs2FAMethod(userId: string): void {
  const db = getDb()
  const existing = db
    .prepare("SELECT two_factor_methods FROM users WHERE id = ?")
    .get(userId) as { two_factor_methods: string | null } | undefined
  const methods: string[] = existing?.two_factor_methods
    ? JSON.parse(existing.two_factor_methods)
    : []
  const filtered = methods.filter((m) => m !== "webauthn")

  if (filtered.length === 0) {
    db.prepare(
      "UPDATE users SET two_factor_enabled = 0, two_factor_methods = '[]' WHERE id = ?"
    ).run(userId)
    db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(userId)
  } else {
    db.prepare("UPDATE users SET two_factor_methods = ? WHERE id = ?").run(
      JSON.stringify(filtered),
      userId
    )
  }
}
