import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth/middleware"
import { AuthError } from "@/lib/auth/middleware"
import { generateTotpSecret } from "@/lib/auth/totp"

export async function GET() {
  try {
    const user = await requireAuth()
    const { secret, uri } = generateTotpSecret(user.id, user.username)
    return NextResponse.json({ secret, uri })
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
