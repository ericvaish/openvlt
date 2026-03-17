import { NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { getUserTwoFactorStatus } from "@/lib/auth/totp"

export async function GET() {
  try {
    const user = await requireAuth()
    const status = getUserTwoFactorStatus(user.id)
    return NextResponse.json(status)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
