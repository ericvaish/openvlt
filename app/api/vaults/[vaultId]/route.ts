import { NextRequest, NextResponse } from "next/server"
import {
  getVault,
  deleteVault,
  setActiveVault,
  renameVault,
} from "@/lib/vaults/service"
import { AuthError, requireAuth } from "@/lib/auth/middleware"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vaultId: string }> }
) {
  try {
    const user = await requireAuth()
    const { vaultId } = await params
    const vault = getVault(vaultId, user.id)

    if (!vault) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 })
    }

    return NextResponse.json(vault)
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ vaultId: string }> }
) {
  try {
    const user = await requireAuth()
    const { vaultId } = await params
    const body = await request.json()

    if (body.action === "setActive") {
      setActiveVault(user.id, vaultId)
      return NextResponse.json({ success: true })
    }

    if (body.action === "rename") {
      const name = body.name?.trim()
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 })
      }
      renameVault(vaultId, user.id, name)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    const status = message === "Vault not found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ vaultId: string }> }
) {
  try {
    const user = await requireAuth()
    const { vaultId } = await params
    deleteVault(vaultId, user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    const status = message === "Vault not found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
