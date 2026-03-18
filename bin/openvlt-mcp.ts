#!/usr/bin/env node
import { startMcpServer } from "../lib/ai/mcp/server"

startMcpServer().catch((err) => {
  console.error("MCP server failed to start:", err)
  process.exit(1)
})
