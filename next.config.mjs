import { execSync } from "child_process"

function getGitInfo() {
  try {
    const commitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim()
    const commitDate = execSync("git log -1 --format=%ci", { encoding: "utf-8" }).trim()
    return { commitHash, commitDate }
  } catch {
    return { commitHash: "unknown", commitDate: "" }
  }
}

const gitInfo = getGitInfo()

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "adm-zip"],
  env: {
    NEXT_PUBLIC_COMMIT_HASH: gitInfo.commitHash,
    NEXT_PUBLIC_COMMIT_DATE: gitInfo.commitDate,
  },
}

export default nextConfig
