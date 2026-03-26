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
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  env: {
    NEXT_PUBLIC_COMMIT_HASH: gitInfo.commitHash,
    NEXT_PUBLIC_COMMIT_DATE: gitInfo.commitDate,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://static.cloudflareinsights.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://cdn.tldraw.com",
              "font-src 'self' data: https://cdn.tldraw.com",
              "connect-src 'self' https://api.openai.com https://api.anthropic.com https://openrouter.ai https://cdn.tldraw.com",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
