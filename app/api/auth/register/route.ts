import { NextRequest, NextResponse } from "next/server"
import { createUser } from "@/lib/auth/service"
import { isSetupComplete, isRegistrationOpen } from "@/lib/admin/config"

export async function POST(request: NextRequest) {
  try {
    if (!isSetupComplete()) {
      return NextResponse.json(
        { error: "Setup required. Visit /setup to configure your instance." },
        { status: 403 }
      )
    }

    if (!isRegistrationOpen()) {
      return NextResponse.json(
        { error: "Registration is disabled. Contact your administrator." },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { username, password, displayName } = body

    if (!username || typeof username !== "string") {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      )
    }

    // Normalize and validate username: NFKC normalize, ASCII-only, no whitespace-only
    const normalizedUsername = username.trim().toLowerCase().normalize("NFKC")
    if (!normalizedUsername) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      )
    }
    if (!/^[a-z0-9_.-]+$/.test(normalizedUsername)) {
      return NextResponse.json(
        { error: "Username must contain only letters (a-z), numbers, underscores, hyphens, and dots" },
        { status: 400 }
      )
    }
    if (normalizedUsername.length > 64) {
      return NextResponse.json(
        { error: "Username must be 64 characters or less" },
        { status: 400 }
      )
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json(
        { error: "Display name is required" },
        { status: 400 }
      )
    }

    const { user, recoveryKey } = await createUser(
      normalizedUsername,
      password,
      displayName.trim().slice(0, 128)
    )

    return NextResponse.json({ user, recoveryKey }, { status: 201 })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Username already taken"
    ) {
      return NextResponse.json(
        { error: "Registration failed. Please try a different username." },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    )
  }
}
