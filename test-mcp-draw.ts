import { executeTool } from "@/lib/ai/tools"
import { v4 as uuid } from "uuid"

async function main() {
  const ctx = {
    userId: "78e28623-0878-49f4-9318-fcae223f484c",
    vaultId: "01968575-1ec7-4bae-a7f0-d6d34c67a692",
  }

  const noteId = "77e2cbe2-885c-4201-901d-f66908dd30b5"

  const sq1Id = uuid()
  const sq2Id = uuid()
  const sq1TextId = uuid()
  const sq2TextId = uuid()
  const now = Date.now()

  const elements = [
    {
      id: sq1Id,
      type: "rectangle",
      x: 100, y: 100, width: 150, height: 150,
      angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#a5d8ff",
      fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
      roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
      seed: 1, version: 1, versionNonce: 1, isDeleted: false,
      boundElements: [{ id: sq1TextId, type: "text" }],
      updated: now, link: null, locked: false,
    },
    {
      id: sq1TextId,
      type: "text",
      x: 137, y: 162, width: 76, height: 25,
      angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
      fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
      roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
      seed: 2, version: 1, versionNonce: 2, isDeleted: false,
      boundElements: null, updated: now, link: null, locked: false,
      text: "Square 1", fontSize: 20, fontFamily: 1,
      textAlign: "center", verticalAlign: "middle",
      containerId: sq1Id, originalText: "Square 1", lineHeight: 1.25,
    },
    {
      id: sq2Id,
      type: "rectangle",
      x: 350, y: 100, width: 150, height: 150,
      angle: 0, strokeColor: "#1e1e1e", backgroundColor: "#b2f2bb",
      fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
      roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
      seed: 3, version: 1, versionNonce: 3, isDeleted: false,
      boundElements: [{ id: sq2TextId, type: "text" }],
      updated: now, link: null, locked: false,
    },
    {
      id: sq2TextId,
      type: "text",
      x: 387, y: 162, width: 76, height: 25,
      angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
      fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
      roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null,
      seed: 4, version: 1, versionNonce: 4, isDeleted: false,
      boundElements: null, updated: now, link: null, locked: false,
      text: "Square 2", fontSize: 20, fontFamily: 1,
      textAlign: "center", verticalAlign: "middle",
      containerId: sq2Id, originalText: "Square 2", lineHeight: 1.25,
    },
  ]

  const excalidrawContent = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "openvlt",
    elements,
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  })

  const updateResult = await executeTool("update_note", { noteId, content: excalidrawContent }, ctx)
  console.log("UPDATE RESULT:", JSON.stringify(updateResult, null, 2))

  const getResult = await executeTool("get_excalidraw", { noteId }, ctx)
  console.log("FINAL SCENE:", JSON.stringify(getResult, null, 2))
}

main().catch(console.error)
