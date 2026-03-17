import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import {
  verifyTotpAndEnable,
  generateRecoveryCodes,
} from "@/lib/auth/totp"

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "A valid 6-digit code is required" },
        { status: 400 }
      )
    }

    const valid = verifyTotpAndEnable(user.id, code)
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid code. Please try again." },
        { status: 400 }
      )
    }

    // Generate recovery codes
    const recoveryCodes = await generateRecoveryCodes(user.id)

    return NextResponse.json({ success: true, recoveryCodes })
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
