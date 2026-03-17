import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getProvider } from "@/lib/backup/provider"
import { listCloudProviders } from "@/lib/backup/service"
import { GOOGLE_REDIRECT_URI } from "@/lib/constants"
import type { CloudProvider } from "@/types"

export async function GET() {
  try {
    const user = await requireAuth()
    const providers = listCloudProviders(user.id)
    return NextResponse.json(providers)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth()
    const body = (await request.json()) as { provider: CloudProvider }

    if (!body.provider) {
      return NextResponse.json({ error: "provider is required" }, { status: 400 })
    }

    const provider = getProvider(body.provider)
    const redirectUri = GOOGLE_REDIRECT_URI || `${request.nextUrl.origin}/api/backup/providers/callback`
    const authUrl = provider.getAuthUrl(redirectUri)

    return NextResponse.json({ authUrl })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : "Server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
