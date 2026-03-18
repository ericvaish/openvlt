import { executeTool } from "@/lib/ai/tools"

const ctx = {
  userId: "78e28623-0878-49f4-9318-fcae223f484c",
  vaultId: "01968575-1ec7-4bae-a7f0-d6d34c67a692",
}

// Step 1: Create excalidraw note
const createResult = await executeTool("create_note", { title: "Drawing.excalidraw" }, ctx) as any
console.log("CREATE RESULT:", JSON.stringify(createResult, null, 2))

const noteId = createResult.id
console.log("NOTE ID:", noteId)

// Step 2: Draw 2 squares on it
const elements = JSON.stringify([
  {
    type: "rectangle",
    id: "square_1",
    x: 100,
    y: 100,
    width: 150,
    height: 150,
    backgroundColor: "#a5d8ff",
    label: { text: "Square 1" }
  },
  {
    type: "rectangle",
    id: "square_2",
    x: 350,
    y: 100,
    width: 150,
    height: 150,
    backgroundColor: "#b2f2bb",
    label: { text: "Square 2" }
  }
])

const drawResult = await executeTool("draw_excalidraw", { noteId, elements }, ctx)
console.log("DRAW RESULT:", JSON.stringify(drawResult, null, 2))
