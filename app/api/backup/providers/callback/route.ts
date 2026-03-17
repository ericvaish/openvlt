import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getProvider } from "@/lib/backup/provider"
import { saveCloudProvider } from "@/lib/backup/service"
import { GOOGLE_REDIRECT_URI } from "@/lib/constants"

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    const code = request.nextUrl.searchParams.get("code")

    if (!code) {
      return NextResponse.json({ error: "No authorization code" }, { status: 400 })
    }

    const redirectUri = GOOGLE_REDIRECT_URI || `${request.nextUrl.origin}/api/backup/providers/callback`
    const provider = getProvider("google_drive")
    const tokens = await provider.exchangeCode(code, redirectUri)

    saveCloudProvider(
      user.id,
      "google_drive",
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresAt,
      "Google Drive"
    )

    // Redirect back to settings page
    return NextResponse.redirect(new URL("/settings?backup=connected", request.url))
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.redirect(new URL("/settings?backup=error", request.url))
    }
    return NextResponse.redirect(new URL("/settings?backup=error", request.url))
  }
}
