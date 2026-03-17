import { NextRequest, NextResponse } from "next/server"
import { requireAuthWithVault, AuthError } from "@/lib/auth/middleware"
import { getLocalPeer, createPairing } from "@/lib/sync/peer"

/**
 * Receive a pairing request from a remote peer.
 * The request is authenticated using this instance's normal user auth.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = (await request.json()) as {
      peerName: string
      peerId: string
      vaultName: string
    }

    if (!body.peerId || !body.peerName) {
      return NextResponse.json(
        { error: "peerId and peerName are required" },
        { status: 400 }
      )
    }

    const localPeer = getLocalPeer()
    const { pairingId, sharedSecret } = createPairing(
      vaultId,
      body.peerId,
      "" // Remote URL will be set by confirm step
    )

    return NextResponse.json({
      pairingId,
      peerId: localPeer.id,
      peerName: localPeer.displayName,
      sharedSecret,
      vaultId: vaultId,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
