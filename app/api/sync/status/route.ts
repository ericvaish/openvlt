import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { verifyPeerRequest, getLocalPeer } from "@/lib/sync/peer"
import { getMaxSeq } from "@/lib/sync/log"
import { getDb } from "@/lib/db"

/**
 * Health check / status endpoint for peer sync.
 * Returns current max sequence number.
 */
export async function GET(request: NextRequest) {
  const pairingId = request.headers.get("X-Peer-Pairing-Id")
  const peerId = request.headers.get("X-Peer-Id")
  const timestamp = request.headers.get("X-Peer-Timestamp")
  const signature = request.headers.get("X-Peer-Signature")

  if (!pairingId || !peerId || !timestamp || !signature) {
    return NextResponse.json({ error: "Missing peer headers" }, { status: 400 })
  }

  const valid = verifyPeerRequest(
    pairingId,
    peerId,
    "GET",
    "/api/sync/status",
    timestamp,
    crypto.createHash("sha256").update("").digest("hex"),
    signature
  )

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const db = getDb()
  const pairing = db
    .prepare("SELECT local_vault_id FROM sync_pairings WHERE id = ? AND is_active = 1")
    .get(pairingId) as { local_vault_id: string } | undefined

  if (!pairing) {
    return NextResponse.json({ error: "Pairing not found" }, { status: 404 })
  }

  const localPeer = getLocalPeer()
  const maxSeq = getMaxSeq(pairing.local_vault_id)

  return NextResponse.json({
    peerId: localPeer.id,
    peerName: localPeer.displayName,
    maxSeq,
    timestamp: new Date().toISOString(),
  })
}
