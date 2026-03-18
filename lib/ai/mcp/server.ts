import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { getToolDefinitions, executeTool } from "@/lib/ai/tools"
import { validateApiToken } from "./auth"
import type { ToolContext } from "@/lib/ai/tool-types"

function jsonSchemaToZod(
  schema: Record<string, unknown>
): Record<string, z.ZodTypeAny> {
  const properties = schema.properties as Record<
    string,
    { type: string; description?: string }
  >
  const required = (schema.required as string[]) || []
  const zodShape: Record<string, z.ZodTypeAny> = {}

  for (const [key, prop] of Object.entries(properties)) {
    let zodType: z.ZodTypeAny
    switch (prop.type) {
      case "string":
        zodType = z.string()
        break
      case "number":
        zodType = z.number()
        break
      case "boolean":
        zodType = z.boolean()
        break
      default:
        zodType = z.any()
    }
    if (prop.description) {
      zodType = zodType.describe(prop.description)
    }
    if (!required.includes(key)) {
      zodType = zodType.optional()
    }
    zodShape[key] = zodType
  }

  return zodShape
}

export async function startMcpServer() {
  const token = process.env.OPENVLT_API_TOKEN
  if (!token) {
    console.error(
      "OPENVLT_API_TOKEN environment variable is required"
    )
    process.exit(1)
  }

  const auth = validateApiToken(token)
  if (!auth) {
    console.error("Invalid API token")
    process.exit(1)
  }

  const ctx: ToolContext = {
    userId: auth.userId,
    vaultId: auth.vaultId,
  }

  const server = new McpServer({
    name: "openvlt",
    version: "1.0.0",
  })

  const toolDefs = getToolDefinitions()

  for (const def of toolDefs) {
    const zodShape = jsonSchemaToZod(def.parameters)

    server.tool(def.name, def.description, zodShape, async (params) => {
      const result = await executeTool(
        def.name,
        params as Record<string, unknown>,
        ctx
      )
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      }
    })
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
