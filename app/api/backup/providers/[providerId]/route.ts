import { NextRequest, NextResponse } from "next/server"
import { requireAuth, AuthError } from "@/lib/auth/middleware"
import { deleteCloudProvider } from "@/lib/backup/service"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const user = await requireAuth()
    const { providerId } = await params
    deleteCloudProvider(providerId, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
