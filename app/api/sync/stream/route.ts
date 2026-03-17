import { NextRequest } from "next/server"
import crypto from "crypto"
import { verifyPeerRequest } from "@/lib/sync/peer"
import { onVaultChange } from "@/lib/watcher"
import { getDb } from "@/lib/db"

/**
 * SSE stream for change notifications to remote peers.
 * Authenticated with HMAC headers.
 */
export async function GET(request: NextRequest) {
  const pairingId = request.headers.get("X-Peer-Pairing-Id")
  const peerId = request.headers.get("X-Peer-Id")
  const timestamp = request.headers.get("X-Peer-Timestamp")
  const signature = request.headers.get("X-Peer-Signature")

  if (!pairingId || !peerId || !timestamp || !signature) {
    return new Response("Missing peer headers", { status: 400 })
  }

  const valid = verifyPeerRequest(
    pairingId,
    peerId,
    "GET",
    "/api/sync/stream",
    timestamp,
    crypto.createHash("sha256").update("").digest("hex"),
    signature
  )

  if (!valid) {
    return new Response("Invalid signature", { status: 401 })
  }

  const db = getDb()
  const pairing = db
    .prepare("SELECT local_vault_id FROM sync_pairings WHERE id = ? AND is_active = 1")
    .get(pairingId) as { local_vault_id: string } | undefined

  if (!pairing) {
    return new Response("Pairing not found", { status: 404 })
  }

  const vaultId = pairing.local_vault_id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode("data: connected\n\n"))

      const unsubscribe = onVaultChange((changedVaultId) => {
        if (changedVaultId === vaultId) {
          try {
            controller.enqueue(encoder.encode("data: changed\n\n"))
          } catch {
            unsubscribe()
          }
        }
      })

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"))
        } catch {
          clearInterval(heartbeat)
          unsubscribe()
        }
      }, 30000)

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
