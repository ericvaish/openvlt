import { notFound, redirect } from "next/navigation"
import { getNote } from "@/lib/notes"
import { requireAuthWithVault } from "@/lib/auth/middleware"
import { AuthError } from "@/lib/auth/middleware"
import { TabActivator } from "@/components/tab-activator"

export default async function NotePage({
  params,
}: {
  params: Promise<{ noteId: string }>
}) {
  try {
    const { user, vaultId } = await requireAuthWithVault()
    const { noteId } = await params
    const note = getNote(noteId, user.id, vaultId)

    if (!note) {
      notFound()
    }

    return <TabActivator noteId={note.metadata.id} title={note.metadata.title} />
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login")
    }
    // Note file missing, DB error, etc. - redirect to notes list
    notFound()
  }
}
