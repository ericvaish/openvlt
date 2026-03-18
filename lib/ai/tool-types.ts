export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ToolContext {
  userId: string
  vaultId: string
}

export type ToolHandler = (
  params: Record<string, unknown>,
  ctx: ToolContext
) => Promise<unknown>

export interface Tool {
  definition: ToolDefinition
  handler: ToolHandler
}
