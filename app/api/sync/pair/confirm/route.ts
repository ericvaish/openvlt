import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { verifyPeerRequest } from "@/lib/sync/peer"
import { getDb } from "@/lib/db"

/**
 * Confirm a pairing. Authenticated with HMAC using the newly shared secret.
 */
export async function POST(request: NextRequest) {
  try {
    const pairingId = request.headers.get("X-Peer-Pairing-Id")
    const peerId = request.headers.get("X-Peer-Id")
    const timestamp = request.headers.get("X-Peer-Timestamp")
    const signature = request.headers.get("X-Peer-Signature")

    if (!pairingId || !peerId || !timestamp || !signature) {
      return NextResponse.json({ error: "Missing peer headers" }, { status: 400 })
    }

    const body = await request.text()
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex")

    const valid = verifyPeerRequest(
      pairingId,
      peerId,
      "POST",
      "/api/sync/pair/confirm",
      timestamp,
      bodyHash,
      signature
    )

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const data = JSON.parse(body) as { pairingId: string; remoteUrl: string }

    // Update the pairing with the remote URL
    const db = getDb()
    db.prepare(
      "UPDATE sync_pairings SET remote_url = ?, is_active = 1 WHERE id = ?"
    ).run(data.remoteUrl, pairingId)

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
