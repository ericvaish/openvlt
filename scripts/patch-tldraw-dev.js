/**
 * Patches tldraw's LicenseProvider to not hide the editor in production
 * without a license key. This is for development/testing only.
 *
 * Once a proper license key is obtained, remove this script and the
 * postinstall hook from package.json.
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@tldraw",
  "editor",
  "dist-cjs",
  "lib",
  "license",
  "LicenseProvider.js"
)

if (!fs.existsSync(filePath)) {
  console.log("[patch-tldraw-dev] LicenseProvider.js not found, skipping")
  process.exit(0)
}

let content = fs.readFileSync(filePath, "utf-8")

// Change shouldHideEditorAfterDelay to always return false
const original = 'function shouldHideEditorAfterDelay(licenseState) {\n  return licenseState === "expired" || licenseState === "unlicensed-production";\n}'
const patched = 'function shouldHideEditorAfterDelay(licenseState) {\n  return false;\n}'

if (content.includes(patched)) {
  console.log("[patch-tldraw-dev] Already patched, skipping")
  process.exit(0)
}

if (!content.includes(original)) {
  // Try single-line variant
  const singleLine = 'function shouldHideEditorAfterDelay(licenseState) {'
  if (content.includes(singleLine)) {
    content = content.replace(
      /function shouldHideEditorAfterDelay\(licenseState\)\s*\{[^}]+\}/,
      'function shouldHideEditorAfterDelay(licenseState) {\n  return false;\n}'
    )
  } else {
    console.log("[patch-tldraw-dev] Could not find shouldHideEditorAfterDelay, skipping")
    process.exit(0)
  }
} else {
  content = content.replace(original, patched)
}

fs.writeFileSync(filePath, content, "utf-8")
console.log("[patch-tldraw-dev] Patched LicenseProvider.js (CJS)")

// Also patch the ESM version
const esmPath = filePath
  .replace("dist-cjs", "dist-esm")
  .replace("LicenseProvider.js", "LicenseProvider.mjs")

if (fs.existsSync(esmPath)) {
  let esmContent = fs.readFileSync(esmPath, "utf-8")
  esmContent = esmContent.replace(
    /function shouldHideEditorAfterDelay\(licenseState\)\s*\{[^}]+\}/,
    'function shouldHideEditorAfterDelay(licenseState) {\n  return false;\n}'
  )
  fs.writeFileSync(esmPath, esmContent, "utf-8")
  console.log("[patch-tldraw-dev] Patched LicenseProvider.mjs (ESM)")
}
