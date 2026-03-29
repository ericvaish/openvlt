import { NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getConfig, setConfig } from "@/lib/admin/config"

export async function POST() {
  try {
    await requireAuth()

    const currentRole = getConfig("sync_role") || "standalone"
    if (currentRole === "client") {
      return NextResponse.json(
        { error: "Disconnect from the server first before promoting" },
        { status: 400 }
      )
    }

    setConfig("sync_role", "server")

    return NextResponse.json({
      role: "server",
      serverUrl: null,
      username: null,
      connectedAt: null,
      lastSyncAt: null,
      clientCount: 0,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
