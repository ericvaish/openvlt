import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import {
  getLocalPeer,
  updatePeerName,
  listAllPairings,
  revokePairing,
} from "@/lib/sync/peer"
import { disconnectPeer } from "@/lib/sync/engine"

export async function GET() {
  try {
    await requireAuth()
    const localPeer = getLocalPeer()
    const pairings = listAllPairings()

    return NextResponse.json({
      peer: localPeer,
      pairings,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth()
    const body = (await request.json()) as {
      peerName?: string
      revokePairingId?: string
    }

    if (body.peerName) {
      updatePeerName(body.peerName)
    }

    if (body.revokePairingId) {
      revokePairing(body.revokePairingId)
      disconnectPeer(body.revokePairingId)
    }

    const localPeer = getLocalPeer()
    const pairings = listAllPairings()

    return NextResponse.json({
      peer: localPeer,
      pairings,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
