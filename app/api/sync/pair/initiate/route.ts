import { NextRequest, NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { getLocalPeer, storePairing } from "@/lib/sync/peer"

/**
 * Server-side proxy for initiating peer sync pairing.
 * Avoids CORS issues by making the remote calls from the server instead of the browser.
 *
 * POST body: { remoteUrl, username, password }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const body = await request.json()
    const { remoteUrl: rawUrl, username, password } = body

    if (!rawUrl || !username || !password) {
      return NextResponse.json(
        { error: "remoteUrl, username, and password are required" },
        { status: 400 }
      )
    }

    // Normalize URL: extract origin only (strip any path, trailing slashes)
    let remoteUrl: string
    try {
      const parsed = new URL(rawUrl)
      remoteUrl = parsed.origin
    } catch {
      return NextResponse.json(
        { error: "Invalid URL. Enter the base URL of the remote instance (e.g. https://notes.example.com)" },
        { status: 400 }
      )
    }

    // Step 1: Authenticate with the remote instance
    let loginRes: Response
    try {
      loginRes = await fetch(`${remoteUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
    } catch (err) {
      return NextResponse.json(
        {
          error: `Could not reach remote instance: ${err instanceof Error ? err.message : "Connection failed"}`,
        },
        { status: 502 }
      )
    }

    if (!loginRes.ok) {
      const detail = await loginRes.text().catch(() => "")
      return NextResponse.json(
        { error: `Authentication failed on remote instance (${loginRes.status}): ${detail}` },
        { status: 401 }
      )
    }

    // Extract session cookie from login response
    const setCookieHeader = loginRes.headers.get("set-cookie")

    // Step 2: Send pairing request to the remote instance
    const localPeer = getLocalPeer()
    const pairHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (setCookieHeader) {
      // Forward the session cookie
      const cookieParts = setCookieHeader.split(";")[0]
      pairHeaders["Cookie"] = cookieParts
    }

    let reqRes: Response
    try {
      reqRes = await fetch(`${remoteUrl}/api/sync/pair/request`, {
        method: "POST",
        headers: pairHeaders,
        body: JSON.stringify({
          peerName: localPeer.displayName,
          peerId: localPeer.id,
          vaultName: "Vault",
        }),
      })
    } catch (err) {
      return NextResponse.json(
        {
          error: `Pairing request failed: ${err instanceof Error ? err.message : "Connection failed"}`,
        },
        { status: 502 }
      )
    }

    if (!reqRes.ok) {
      const detail = await reqRes.text().catch(() => "")
      return NextResponse.json(
        { error: `Pairing request rejected (${reqRes.status}): ${detail}` },
        { status: reqRes.status }
      )
    }

    const pairData = await reqRes.json()
    const { pairingId, sharedSecret, remotePeerId } = pairData

    // Step 3: Store the pairing locally
    try {
      storePairing(
        pairingId,
        vaultId,
        remotePeerId || localPeer.id,
        remoteUrl,
        sharedSecret,
        "all"
      )
    } catch (err) {
      console.error("[peer-sync] Failed to store pairing locally:", err)
      return NextResponse.json(
        { error: "Pairing succeeded on remote but failed to save locally" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      pairingId,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    console.error("[peer-sync] Initiate pairing error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
