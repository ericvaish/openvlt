/**
 * TEMPORARY: OAuth PKCE flow for ChatGPT authentication.
 *
 * Replicates the Codex CLI auth flow so users can sign in to their
 * ChatGPT account directly from the openvlt UI. Spins up a temporary
 * local HTTP server on a free port for the OAuth callback (matching
 * the pattern Codex CLI uses), then writes tokens to ~/.codex/auth.json.
 *
 * This is NOT officially supported by OpenAI and may break at any time.
 */

import crypto from "crypto"
import http from "http"
import fs from "fs"
import path from "path"
import os from "os"

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const AUTH_ENDPOINT = "https://auth.openai.com/oauth/authorize"
const TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token"
const SCOPES = "openid profile email offline_access"
const CALLBACK_PORT = 1455

const CODEX_DIR = path.join(os.homedir(), ".codex")
const CODEX_AUTH_PATH = path.join(CODEX_DIR, "auth.json")

function base64url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function generateCodeVerifier(): string {
  return base64url(crypto.randomBytes(32))
}

function generateCodeChallenge(verifier: string): string {
  return base64url(crypto.createHash("sha256").update(verifier).digest())
}

function generateState(): string {
  return base64url(crypto.randomBytes(16))
}

// Track active auth server so we can clean up
let activeServer: http.Server | null = null

/**
 * Start the full OAuth PKCE flow:
 * 1. Spin up a temporary HTTP server on a free port
 * 2. Build the auth URL with that server's callback as redirect_uri
 * 3. Return the auth URL for the frontend to open in a popup
 * 4. When callback is received, exchange code for tokens and write auth.json
 * 5. Shut down the temporary server
 */
export async function startCodexAuthFlow(): Promise<{
  authUrl: string
  port: number
}> {
  // Clean up any previous auth server
  if (activeServer) {
    activeServer.close()
    activeServer = null
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://localhost`)

      if (url.pathname !== "/auth/callback") {
        res.writeHead(404)
        res.end("Not found")
        return
      }

      const code = url.searchParams.get("code")
      const returnedState = url.searchParams.get("state")
      const error = url.searchParams.get("error")

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(callbackPage(false, `Authentication denied: ${error}`))
        cleanup()
        return
      }

      if (!code || returnedState !== state) {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(
          callbackPage(false, "Invalid callback. Missing code or state mismatch.")
        )
        cleanup()
        return
      }

      // Exchange code for tokens
      const redirectUri = `http://localhost:${CALLBACK_PORT}/auth/callback`
      const result = await exchangeCodeForTokens(
        code,
        redirectUri,
        codeVerifier
      )

      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(callbackPage(result.success, result.error))
      cleanup()
    })

    function cleanup() {
      setTimeout(() => {
        server.close()
        if (activeServer === server) activeServer = null
      }, 1000)
    }

    // Auto-cleanup after 5 minutes if no callback received
    const timeout = setTimeout(() => {
      cleanup()
    }, 5 * 60 * 1000)

    server.on("close", () => clearTimeout(timeout))

    server.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            "Port 1455 is already in use. Close any running Codex CLI instances and try again."
          )
        )
      } else {
        reject(err)
      }
    })

    // Listen on port 1455 (the port whitelisted by OpenAI for Codex CLI)
    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      activeServer = server

      const redirectUri = `http://localhost:${CALLBACK_PORT}/auth/callback`

      const params = new URLSearchParams({
        client_id: OPENAI_CLIENT_ID,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: SCOPES,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "opencode",
      })

      resolve({
        authUrl: `${AUTH_ENDPOINT}?${params.toString()}`,
        port: CALLBACK_PORT,
      })
    })
  })
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: OPENAI_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      return {
        success: false,
        error: `Token exchange failed: ${tokenResponse.status} ${errText}`,
      }
    }

    const tokens = await tokenResponse.json()

    // Extract account ID from id_token JWT if present
    let accountId: string | undefined
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64").toString()
        )
        accountId =
          payload["https://api.openai.com/auth"]?.chatgpt_account_id ||
          payload["https://api.openai.com/auth.chatgpt_account_id"]
      } catch {
        // ignore JWT parse errors
      }
    }

    // Write to ~/.codex/auth.json (same format as Codex CLI)
    const authData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
      ...(accountId ? { account_id: accountId } : {}),
    }

    if (!fs.existsSync(CODEX_DIR)) {
      fs.mkdirSync(CODEX_DIR, { recursive: true, mode: 0o700 })
    }
    fs.writeFileSync(CODEX_AUTH_PATH, JSON.stringify(authData, null, 2), {
      mode: 0o600,
    })

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }
  }
}

function callbackPage(success: boolean, error?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>openvlt - ChatGPT Login</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0a0a0a;
      color: #fafafa;
    }
    .card {
      text-align: center;
      padding: 2rem;
      max-width: 400px;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    .success { color: #22c55e; }
    .fail { color: #ef4444; }
    h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
    p { margin: 0; color: #a1a1aa; font-size: 0.875rem; }
    .error { color: #ef4444; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon ${success ? "success" : "fail"}">${success ? "&#10003;" : "&#10007;"}</div>
    <h2>${success ? "Successfully connected!" : "Connection failed"}</h2>
    <p${success ? "" : ' class="error"'}>
      ${success ? "Your ChatGPT account is now linked to openvlt. You can close this window." : error || "An unknown error occurred."}
    </p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: "codex-auth-complete", success: ${success} }, "*");
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`
}
