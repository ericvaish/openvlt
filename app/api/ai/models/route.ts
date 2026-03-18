import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import os from "os"
import { AuthError, requireAuthWithVault } from "@/lib/auth/middleware"
import { getProviderKey } from "@/lib/ai/key-store"
import { getDb } from "@/lib/db"
import type { AIProviderType } from "@/types"

interface ModelInfo {
  id: string
  name: string
  contextWindow?: number
}

export interface ModelWithProvider extends ModelInfo {
  provider: AIProviderType
  providerName: string
  providerSlug: string
}

const PROVIDER_DISPLAY: Record<
  AIProviderType,
  { name: string; slug: string }
> = {
  codex: { name: "ChatGPT (Codex CLI)", slug: "openai" },
  openai: { name: "OpenAI API", slug: "openai" },
  anthropic: { name: "Anthropic API", slug: "anthropic" },
  openrouter: { name: "OpenRouter", slug: "openrouter" },
  "claude-code": { name: "Claude Code", slug: "anthropic" },
}

const VALID_PROVIDERS: AIProviderType[] = [
  "codex",
  "openai",
  "anthropic",
  "openrouter",
  "claude-code",
]

// Fallback models when API fetch fails
const FALLBACK_MODELS: Record<string, ModelInfo[]> = {
  codex: [
    { id: "gpt-5.4", name: "GPT-5.4", contextWindow: 272_000 },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", contextWindow: 272_000 },
    { id: "gpt-5.3-codex", name: "GPT-5.3 Codex", contextWindow: 272_000 },
    { id: "gpt-5.2", name: "GPT-5.2", contextWindow: 272_000 },
    { id: "gpt-5.1", name: "GPT-5.1", contextWindow: 272_000 },
    { id: "gpt-5", name: "GPT-5", contextWindow: 272_000 },
  ],
  openai: [
    { id: "gpt-5.4", name: "GPT-5.4" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
    { id: "gpt-5.4-nano", name: "GPT-5.4 Nano" },
    { id: "gpt-5", name: "GPT-5" },
    { id: "gpt-5-mini", name: "GPT-5 Mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5-20250514", name: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
  ],
  "claude-code": [
    { id: "sonnet", name: "Claude Sonnet (latest)", contextWindow: 200_000 },
    { id: "opus", name: "Claude Opus (latest)", contextWindow: 200_000 },
    { id: "haiku", name: "Claude Haiku (latest)", contextWindow: 200_000 },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 200_000 },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", contextWindow: 200_000 },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200_000 },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200_000 },
  ],
  openrouter: [],
}

// Chat-capable model prefixes to filter by
const CHAT_MODEL_PREFIXES = [
  "gpt-5",
  "gpt-4",
  "o1",
  "o3",
  "o4",
  "chatgpt",
]

function isRelevantModel(id: string): boolean {
  return CHAT_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix))
}

function formatModelName(id: string): string {
  return id
    .replace(/^gpt-/, "GPT-")
    .replace(/^o(\d)/, "o$1")
    .replace(/-(\d{4})(\d{2})(\d{2})$/, "")
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return FALLBACK_MODELS.openai
    const data = await res.json()
    const models = (data.data as { id: string }[])
      .filter((m) => isRelevantModel(m.id))
      .map((m) => ({ id: m.id, name: formatModelName(m.id) }))
      .sort((a, b) => a.id.localeCompare(b.id))
    return models.length > 0 ? models : FALLBACK_MODELS.openai
  } catch {
    return FALLBACK_MODELS.openai
  }
}

async function fetchOpenRouterModels(
  apiKey: string
): Promise<ModelInfo[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return FALLBACK_MODELS.openrouter
    const data = await res.json()
    const models = (
      data.data as { id: string; name: string }[]
    )
      .filter(
        (m) =>
          m.id.includes("gpt") ||
          m.id.includes("claude") ||
          m.id.includes("gemini") ||
          m.id.includes("llama") ||
          m.id.includes("deepseek")
      )
      .slice(0, 30)
      .map((m) => ({ id: m.id, name: m.name }))
    return models.length > 0 ? models : FALLBACK_MODELS.openrouter
  } catch {
    return FALLBACK_MODELS.openrouter
  }
}

function parseChatProviders(raw: string | null): AIProviderType[] {
  if (!raw) return []
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr))
        return arr.filter((p: string) =>
          VALID_PROVIDERS.includes(p as AIProviderType)
        )
    } catch {
      return []
    }
  }
  if (VALID_PROVIDERS.includes(raw as AIProviderType)) {
    return [raw as AIProviderType]
  }
  return []
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthWithVault()
    const { searchParams } = request.nextUrl

    // Single provider query (legacy support)
    const singleProvider = searchParams.get("provider") as AIProviderType | null

    if (singleProvider) {
      const models = await getModelsForProvider(singleProvider, user.id)
      return NextResponse.json(
        models.map((m) => tagModel(m, singleProvider))
      )
    }

    // Get all enabled providers from config
    const db = getDb()
    const row = db
      .prepare("SELECT chat_provider FROM ai_config WHERE user_id = ?")
      .get(user.id) as { chat_provider: string | null } | undefined

    const providers = parseChatProviders(row?.chat_provider ?? null)

    if (providers.length === 0) {
      return NextResponse.json([])
    }

    // Fetch models from all enabled providers
    const allModels: ModelWithProvider[] = []
    for (const p of providers) {
      const models = await getModelsForProvider(p, user.id)
      for (const m of models) {
        allModels.push(tagModel(m, p))
      }
    }

    return NextResponse.json(allModels)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

function tagModel(m: ModelInfo, provider: AIProviderType): ModelWithProvider {
  const display = PROVIDER_DISPLAY[provider]
  return {
    ...m,
    provider,
    providerName: display.name,
    providerSlug: display.slug,
  }
}

async function getModelsForProvider(
  provider: AIProviderType,
  userId: string
): Promise<ModelInfo[]> {
  switch (provider) {
    case "codex": {
      try {
        const cachePath = path.join(
          os.homedir(),
          ".codex",
          "models_cache.json"
        )
        if (fs.existsSync(cachePath)) {
          const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"))
          const cachedModels = cache.models as {
            slug: string
            display_name?: string
            context_window?: number
            supported_in_api?: boolean
          }[]
          if (Array.isArray(cachedModels)) {
            const contextMap = new Map<string, number>()
            for (const m of cachedModels) {
              if (m.context_window) {
                contextMap.set(m.slug, m.context_window)
              }
            }
            return FALLBACK_MODELS.codex.map((m) => ({
              ...m,
              contextWindow: contextMap.get(m.id) ?? m.contextWindow,
            }))
          }
        }
      } catch {
        // fall through to fallback
      }
      return FALLBACK_MODELS.codex
    }
    case "openai": {
      const key = getProviderKey(userId, "openai")
      if (key) return fetchOpenAIModels(key)
      return FALLBACK_MODELS.openai
    }
    case "anthropic":
      return FALLBACK_MODELS.anthropic
    case "claude-code":
      return FALLBACK_MODELS["claude-code"]
    case "openrouter": {
      const key = getProviderKey(userId, "openrouter")
      if (key) return fetchOpenRouterModels(key)
      return FALLBACK_MODELS.openrouter
    }
    default:
      return []
  }
}
