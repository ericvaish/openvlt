import { notFound, redirect } from "next/navigation"
import { getNote, findNoteVault } from "@/lib/notes"
import { requireAuthWithVault } from "@/lib/auth/middleware"
import { AuthError } from "@/lib/auth/middleware"
import { setActiveVault } from "@/lib/vaults/service"
import { TabActivator } from "@/components/tab-activator"

export default async function NotePage({
  params,
}: {
  params: Promise<{ noteId: string }>
}) {
  try {
    let { user, vaultId } = await requireAuthWithVault()
    const { noteId } = await params
    let note = getNote(noteId, user.id, vaultId)

    // Auto-resolve vault mismatch: note may belong to another vault
    if (!note) {
      const actualVaultId = findNoteVault(noteId, user.id)
      if (actualVaultId && actualVaultId !== vaultId) {
        setActiveVault(user.id, actualVaultId)
        vaultId = actualVaultId
        note = getNote(noteId, user.id, vaultId)
      }
    }

    if (!note) {
      redirect("/notes")
    }

    return <TabActivator noteId={note.metadata.id} title={note.metadata.title} />
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login")
    }
    // Note file missing, DB error, etc. - redirect to notes list
    redirect("/notes")
  }
}
