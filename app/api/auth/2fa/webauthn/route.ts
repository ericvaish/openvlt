import { NextRequest, NextResponse } from "next/server"
import { createSession } from "@/lib/auth/service"
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from "@/lib/constants"
import {
  validatePending2FAToken,
  consumePending2FAToken,
} from "@/lib/auth/totp"
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server"
import { getDb } from "@/lib/db"

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost"
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000"

// In-memory challenge store for 2FA WebAuthn
const challenges2FA = new Map<string, string>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pendingToken, action, response: authResponse } = body

    if (!pendingToken || typeof pendingToken !== "string") {
      return NextResponse.json(
        { error: "Pending token is required" },
        { status: 400 }
      )
    }

    const pending = validatePending2FAToken(pendingToken)
    if (!pending) {
      return NextResponse.json(
        { error: "Invalid or expired verification session. Please log in again." },
        { status: 401 }
      )
    }

    const db = getDb()

    if (action === "options") {
      const credentials = db
        .prepare(
          "SELECT credential_id FROM webauthn_credentials WHERE user_id = ?"
        )
        .all(pending.userId) as { credential_id: string }[]

      if (credentials.length === 0) {
        return NextResponse.json(
          { error: "No passkeys registered" },
          { status: 400 }
        )
      }

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: credentials.map((c) => ({ id: c.credential_id })),
        userVerification: "preferred",
      })

      challenges2FA.set(pending.userId, options.challenge)

      return NextResponse.json({ options })
    }

    if (action === "verify") {
      if (!authResponse) {
        return NextResponse.json(
          { error: "Authentication response is required" },
          { status: 400 }
        )
      }

      const expectedChallenge = challenges2FA.get(pending.userId)
      if (!expectedChallenge) {
        return NextResponse.json(
          { error: "Challenge not found or expired" },
          { status: 400 }
        )
      }

      const credential = db
        .prepare(
          "SELECT credential_id, public_key, counter FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?"
        )
        .get(authResponse.id, pending.userId) as
        | { credential_id: string; public_key: string; counter: number }
        | undefined

      if (!credential) {
        return NextResponse.json(
          { error: "Credential not found" },
          { status: 400 }
        )
      }

      const verification = await verifyAuthenticationResponse({
        response: authResponse,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: credential.credential_id,
          publicKey: Buffer.from(credential.public_key, "base64"),
          counter: credential.counter,
        },
      })

      if (!verification.verified) {
        return NextResponse.json(
          { error: "Passkey verification failed" },
          { status: 401 }
        )
      }

      // Update counter
      db.prepare(
        "UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ? AND user_id = ?"
      ).run(
        verification.authenticationInfo.newCounter,
        credential.credential_id,
        pending.userId
      )

      challenges2FA.delete(pending.userId)

      // Consume the pending token and create a real session
      consumePending2FAToken(pending.tokenId)
      const session = createSession(pending.userId)

      const userRow = db
        .prepare(
          "SELECT id, username, display_name, created_at FROM users WHERE id = ?"
        )
        .get(pending.userId) as {
        id: string
        username: string
        display_name: string
        created_at: string
      }

      const res = NextResponse.json({
        user: {
          id: userRow.id,
          username: userRow.username,
          displayName: userRow.display_name,
          createdAt: userRow.created_at,
        },
      })
      res.cookies.set(SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_MS / 1000,
      })

      return res
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
