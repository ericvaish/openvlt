import { NextResponse } from "next/server"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { reconcileVault } from "@/lib/sync/reconcile"

export async function POST() {
  try {
    const { vaultId } = await requireAuthWithVault()
    reconcileVault(vaultId, true)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: "Failed to sync vault" },
      { status: 500 }
    )
  }
}
