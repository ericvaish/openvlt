import { executeTool } from "@/lib/ai/tools"

const ctx = {
  userId: "78e28623-0878-49f4-9318-fcae223f484c",
  vaultId: "01968575-1ec7-4bae-a7f0-d6d34c67a692",
}

// Trash the duplicate (second run)
const trashResult = await executeTool("delete_note", { noteId: "79960214-8fe1-4c0f-ac1c-4027803b0a3b" }, ctx)
console.log("TRASH DUPLICATE:", JSON.stringify(trashResult))

// Verify the first note
const getResult = await executeTool("get_excalidraw", { noteId: "77e2cbe2-885c-4201-901d-f66908dd30b5" }, ctx)
console.log("GET EXCALIDRAW:", JSON.stringify(getResult, null, 2))
