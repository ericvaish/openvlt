import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { verifyPeerRequest } from "@/lib/sync/peer"
import { buildVaultManifest } from "@/lib/sync/protocol"
import { getDb } from "@/lib/db"

/**
 * Return full vault manifest for initial sync.
 * Authenticated with HMAC.
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
      "/api/sync/manifest",
      timestamp,
      bodyHash,
      signature
    )

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const data = JSON.parse(body) as { pairingId: string }

    const db = getDb()
    const pairing = db
      .prepare("SELECT local_vault_id FROM sync_pairings WHERE id = ? AND is_active = 1")
      .get(data.pairingId) as { local_vault_id: string } | undefined

    if (!pairing) {
      return NextResponse.json({ error: "Pairing not found" }, { status: 404 })
    }

    const manifest = buildVaultManifest(pairing.local_vault_id)
    return NextResponse.json(manifest)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
