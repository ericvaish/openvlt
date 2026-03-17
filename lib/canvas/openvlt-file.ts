import fs from "fs"
import AdmZip from "adm-zip"
import archiver from "archiver"

/**
 * Extract searchable text from all text-note shapes in a tldraw document snapshot.
 */
export function extractTextFromCanvas(canvasJson: string): string {
  try {
    const data = JSON.parse(canvasJson)
    const doc = data.document
    if (!doc) return ""

    // tldraw store snapshot: doc.store is a flat record of { [id]: record }
    const store = doc.store ?? doc
    const texts: string[] = []

    for (const key of Object.keys(store)) {
      const record = store[key]
      if (
        record &&
        typeof record === "object" &&
        record.typeName === "shape" &&
        record.type === "text-note" &&
        record.props?.content
      ) {
        const content = String(record.props.content).trim()
        if (content) texts.push(content)
      }
    }

    return texts.join("\n\n")
  } catch {
    return ""
  }
}

/**
 * Create an .openvlt ZIP file from a canvas JSON string.
 * Returns a Promise that resolves to a Buffer.
 */
export async function createOpenvltBuffer(canvasJson: string): Promise<Buffer> {
  const data = JSON.parse(canvasJson)

  const manifest = JSON.stringify({
    type: "openvlt-canvas",
    version: 2,
    createdAt: new Date().toISOString(),
  })

  const document = JSON.stringify(data.document ?? {})
  const settings = JSON.stringify(data.settings ?? {})
  const textContent = extractTextFromCanvas(canvasJson)

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver("zip", { zlib: { level: 1 } })

    archive.on("data", (chunk: Buffer) => chunks.push(chunk))
    archive.on("end", () => resolve(Buffer.concat(chunks)))
    archive.on("error", reject)

    archive.append(manifest, { name: "manifest.json" })
    archive.append(document, { name: "document.json" })
    archive.append(settings, { name: "settings.json" })
    archive.append(textContent, { name: "content.md" })

    archive.finalize()
  })
}

/**
 * Read an .openvlt ZIP file and return the canvas JSON string
 * (same format the canvas editor expects) and extracted text.
 */
export function readOpenvltFile(filePath: string): {
  content: string
  textContent: string
} {
  const zip = new AdmZip(filePath)

  let document = {}
  let settings = {}
  let textContent = ""

  const docEntry = zip.getEntry("document.json")
  if (docEntry) {
    try {
      document = JSON.parse(docEntry.getData().toString("utf-8"))
    } catch {}
  }

  const settingsEntry = zip.getEntry("settings.json")
  if (settingsEntry) {
    try {
      settings = JSON.parse(settingsEntry.getData().toString("utf-8"))
    } catch {}
  }

  const contentEntry = zip.getEntry("content.md")
  if (contentEntry) {
    textContent = contentEntry.getData().toString("utf-8")
  }

  const content = JSON.stringify({
    type: "openvlt-canvas",
    version: 2,
    document,
    settings,
  })

  return { content, textContent }
}

/**
 * Write an .openvlt ZIP file from a canvas JSON string.
 * Uses atomic write (temp file + rename) for safety.
 */
export async function writeOpenvltFile(
  filePath: string,
  canvasJson: string
): Promise<void> {
  const buffer = await createOpenvltBuffer(canvasJson)
  const tmpPath = filePath + ".tmp"
  fs.writeFileSync(tmpPath, buffer)
  fs.renameSync(tmpPath, filePath)
}

/**
 * Check if a file path is an .openvlt file.
 */
export function isOpenvltFile(filePath: string): boolean {
  return filePath.endsWith(".openvlt")
}
