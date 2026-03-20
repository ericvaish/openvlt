import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { verifyPeerRequest } from "@/lib/sync/peer"
import { appendSyncLog } from "@/lib/sync/log"
import { getDb } from "@/lib/db"
import type { SyncLogEntry } from "@/types"

/**
 * Receive and apply changes pushed by a remote peer.
 * Authenticated with HMAC.
 */
export async function POST(request: NextRequest) {
  try {
    const pairingId = request.headers.get("X-Peer-Pairing-Id")
    const peerId = request.headers.get("X-Peer-Id")
    const timestamp = request.headers.get("X-Peer-Timestamp")
    const signature = request.headers.get("X-Peer-Signature")

    if (!pairingId || !peerId || !timestamp || !signature) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.text()
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex")

    const valid = verifyPeerRequest(
      pairingId,
      peerId,
      "POST",
      "/api/sync/push",
      timestamp,
      bodyHash,
      signature
    )

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const data = JSON.parse(body) as {
      pairingId: string
      changes: SyncLogEntry[]
    }

    // Ensure body pairingId matches the authenticated header pairingId
    if (data.pairingId !== pairingId) {
      return NextResponse.json({ error: "Pairing ID mismatch" }, { status: 403 })
    }

    const db = getDb()
    const pairing = db
      .prepare("SELECT local_vault_id FROM sync_pairings WHERE id = ? AND is_active = 1")
      .get(pairingId) as { local_vault_id: string } | undefined

    if (!pairing) {
      return NextResponse.json({ error: "Pairing not found" }, { status: 404 })
    }

    // Record received changes in our sync log with peer_origin
    let applied = 0
    for (const change of data.changes) {
      appendSyncLog(
        pairing.local_vault_id,
        change.entityType,
        change.entityId,
        change.changeType,
        change.payload,
        change.contentHash,
        peerId // Mark as coming from this peer
      )
      applied++
    }

    return NextResponse.json({ applied })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
