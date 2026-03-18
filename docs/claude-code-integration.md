# Claude Code Integration

## Overview

openvlt integrates with Claude Code to let users chat with AI using their existing Claude Max subscription, without paying per-token API costs. This document covers the technical findings, failed approaches, and the working architecture.

## How Claude Code Authentication Works

Claude Code stores OAuth credentials in the macOS Keychain under `"Claude Code-credentials"`. The credential structure:

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "...",
    "expiresAt": 1234567890,
    "scopes": [
      "user:file_upload",
      "user:inference",
      "user:mcp_servers",
      "user:profile",
      "user:sessions:claude_code"
    ],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  }
}
```

The token can be read on macOS with:
```bash
security find-generic-password -s "Claude Code-credentials" -w
```

Auth status can be checked with:
```bash
claude auth status
# Returns JSON: { loggedIn, authMethod, apiProvider, email, orgId, subscriptionType }
```

## Failed Approach: Direct API Calls with OAuth Token

**Attempted:** Read the OAuth token from the keychain and pass it to the Anthropic SDK to make standard Messages API calls, just like the Anthropic API provider does.

**Why it failed:** Anthropic intentionally blocks third-party use of Claude Code OAuth tokens for API calls.

### Test Results

**Bearer auth (Authorization: Bearer):**
```
POST https://api.anthropic.com/v1/messages
Authorization: Bearer sk-ant-oat01-...
→ 401: "OAuth authentication is currently not supported."
```

**API key auth (x-api-key):**
```
POST https://api.anthropic.com/v1/messages
x-api-key: sk-ant-oat01-...
→ Auth passes, but model calls return 400: {"type":"invalid_request_error","message":"Error"}
```

The token passes authentication when used as `x-api-key`, but inference requests are rejected with an intentionally vague error. Non-existent models return `not_found_error`, while real models return `invalid_request_error: Error`, confirming the token authenticates but is blocked from making inference calls outside the Claude Code CLI.

**OAuth-to-API-key exchange:**
```
POST https://api.anthropic.com/api/oauth/claude_cli/create_api_key
Authorization: Bearer sk-ant-oat01-...
→ 403: "OAuth token does not meet scope requirement org:create_api_key"
```

The token's scopes (`user:inference`, etc.) don't include `org:create_api_key`, so we can't exchange it for a regular API key.

### Conclusion

Anthropic ties OAuth tokens to their own harness (the Claude Code CLI). The CLI likely has an internal client verification mechanism that third-party applications cannot replicate. This is intentional to ensure Max subscription users go through Claude Code rather than building custom API clients.

### Anthropic SDK OAuth Support

The Anthropic TypeScript SDK does have an `authToken` parameter:
```typescript
new Anthropic({ apiKey: null, authToken: "sk-ant-oat01-..." })
// Sends: Authorization: Bearer <token>
```

But the API rejects it with "OAuth authentication is currently not supported."

## Failed Approach: Subprocess with Full Tool Access

**Attempted:** Spawn `claude --print` as a subprocess with `--dangerously-skip-permissions` and let Claude Code use its own native tools (Bash, Read, Write, Grep, etc.).

**Why it failed:** Claude Code used its native tools to run arbitrary commands on the host machine (`ls`, `cat`, `sqlite3`, `node -e`, `curl`, etc.) trying to figure out openvlt's architecture from scratch. It had no knowledge of openvlt's tools (search_notes, create_note, draw_excalidraw) and wasted tokens on filesystem exploration. This is also a security risk since it executes arbitrary shell commands.

## Working Approach: CLI with MCP Tools Only

The correct architecture spawns Claude Code CLI as a subprocess but restricts it to only use openvlt's tools via MCP:

```
User → openvlt chat UI → API route → streamChat()
  → spawn `claude --print --verbose --output-format stream-json`
     --mcp-config <temp-config.json>     # Connect to openvlt MCP server
     --allowedTools mcp__openvlt__*      # ONLY MCP tools, no Bash/Read/Write
     --append-system-prompt <instructions>
     --model <model>
     --no-session-persistence
     --dangerously-skip-permissions
  → Parse streaming JSON events
  → Stream SSE to frontend
```

### MCP Integration

openvlt already has an MCP server (`bin/openvlt-mcp.ts`) that exposes all note tools. For each chat session:

1. Create a temporary MCP API token for the user/vault
2. Write a temp MCP config JSON file pointing to `bin/openvlt-mcp.ts`
3. Pass `--mcp-config <path>` to the Claude Code subprocess
4. Restrict tools with `--allowedTools` to only `mcp__openvlt__*` tools
5. Clean up the temp token and config file when the session ends

### Available MCP Tools

When connected via MCP, Claude Code sees these tools (prefixed with `mcp__openvlt__`):

- `search_notes` - Full-text search across notes
- `list_notes` - List all notes in vault
- `get_note` - Read note content by ID
- `create_note` - Create new note
- `update_note` - Update existing note
- `delete_note` - Move note to trash
- `list_folders` - Get folder tree
- `list_tags` - List all tags
- `get_excalidraw` - Read excalidraw drawing
- `draw_excalidraw` - Add shapes to excalidraw

### CLI Flags Reference

Key flags for the `claude` CLI in print mode:

| Flag | Purpose |
|---|---|
| `--print` | Non-interactive single-response mode |
| `--verbose` | Required when using `--output-format stream-json` |
| `--output-format stream-json` | Streaming JSON events on stdout |
| `--model <id>` | Model to use (e.g. `sonnet`, `opus`, `claude-sonnet-4-6-20250514`) |
| `--mcp-config <path>` | Path to MCP server config JSON |
| `--allowedTools <tools>` | Comma-separated list of allowed tools |
| `--append-system-prompt <text>` | Append to default system prompt |
| `--no-session-persistence` | Don't save session to disk |
| `--dangerously-skip-permissions` | Skip all permission prompts |

**Important:** `--allowedTools` is variadic (`<tools...>`), meaning it consumes all subsequent positional arguments. The prompt must be passed via stdin, not as a positional argument.

### Known Model IDs

From the Claude Code CLI binary, the following model IDs are available:

```
claude-sonnet-4-5-20250514     claude-sonnet-4-20250514
claude-sonnet-4-5-20250929     claude-sonnet-4-6-20250514
claude-opus-4-6-20250619       claude-opus-4-20250514
claude-haiku-4-5-20251001      claude-haiku-4-5-20251001-v1
```

Aliases also work: `sonnet`, `opus`, `haiku` (resolve to latest).

## Architecture Comparison

| Provider | Auth Source | API Call | Tools | Billing |
|---|---|---|---|---|
| OpenAI API | User API key | OpenAI SDK | openvlt tools via API | Pay-per-token |
| Anthropic API | User API key | Anthropic SDK | openvlt tools via API | Pay-per-token |
| OpenRouter | User API key | OpenAI-compat SDK | openvlt tools via API | Pay-per-token |
| Codex CLI | ~/.codex/auth.json | ChatGPT Responses API | openvlt tools via API | ChatGPT subscription |
| **Claude Code** | **OS Keychain (OAuth)** | **CLI subprocess** | **openvlt tools via MCP** | **Max subscription** |

Claude Code is the only provider that runs as a subprocess rather than making direct SDK calls. This is because Anthropic blocks direct API access with OAuth tokens.
