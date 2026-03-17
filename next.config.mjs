/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  transpilePackages: ["tldraw", "@tldraw/tldraw"],
}

export default nextConfig
