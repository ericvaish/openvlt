# AI Provider OAuth Token Reuse: Research Findings

**Date:** March 2026
**Context:** openvlt integrates with both OpenAI Codex CLI and Claude Code. This document covers the legality, technical enforcement, and community landscape around reusing subscription OAuth tokens in third-party applications.

## TL;DR

- **OpenAI (Codex CLI):** Explicitly supports third-party OAuth token reuse. Documented APIs, official partnerships with Cline/OpenClaw, Apache-licensed CLI. Strategy: make ChatGPT subscriptions more valuable everywhere to win developer adoption.
- **Anthropic (Claude Code):** Explicitly banned third-party OAuth token reuse since January 9, 2026. Server-side enforcement, legal requests to projects, updated ToS. Strategy: protect flat-rate subscription margins from agentic workloads that would cost 5x+ at API rates.
- **Account sharing (both):** Prohibited by both ToS. OpenAI has minimal technical enforcement. Anthropic blocks it at the API level. Rate limits are the natural constraint.

---

## 1. OpenAI: Why Codex CLI Token Reuse Is Allowed

### Official Support

OpenAI has built a documented third-party integration ecosystem around Codex OAuth:

- **App Server API**: Official documentation at [developers.openai.com/codex/app-server](https://developers.openai.com/codex/app-server) describes two integration modes: "ChatGPT managed" (Codex handles the OAuth flow) and "ChatGPT external tokens" (the host app supplies `idToken` and `accessToken` directly). This is an explicit API for third parties.

- **Cline partnership**: Cline (popular VS Code AI extension) officially supports "Bring your ChatGPT subscription to Cline" via Codex OAuth. OpenAI cooperated on this integration. ([Source: cline.bot/blog/introducing-openai-codex-oauth](https://cline.bot/blog/introducing-openai-codex-oauth))

- **OpenClaw support**: OpenAI explicitly supports Codex OAuth in OpenClaw, the multi-provider coding tool. ([Source: docs.openclaw.ai/providers/openai](https://docs.openclaw.ai/providers/openai))

- **Apache-licensed CLI**: The Codex CLI is open source under Apache 2.0. A GitHub discussion asking "Does forking/modifying Codex CLI affect ToS?" confirmed that forking and modifying is welcome. ([Source: github.com/openai/codex/discussions/8338](https://github.com/openai/codex/discussions/8338))

- **Public OAuth client ID**: The CLI uses client ID `app_EMoamEEZ73f0CkXaXp7hrann` with standard OAuth 2.0 + PKCE. Auth endpoints (`auth.openai.com/oauth/authorize`, `/oauth/token`) are documented. ([Source: developers.openai.com/codex/auth](https://developers.openai.com/codex/auth))

- **Community best practices**: An OpenAI community forum thread discusses best practices for third-party apps using Codex OAuth, further confirming it is sanctioned. ([Source: community.openai.com/t/best-practice-for-clientid-when-using-codex-oauth/1371778](https://community.openai.com/t/best-practice-for-clientid-when-using-codex-oauth/1371778))

### Token Storage

Tokens are stored in plaintext at `~/.codex/auth.json` containing `idToken`, `accessToken`, `refreshToken`, `accountId`, and `expires` fields. The plaintext storage is by design, not an oversight.

### Strategic Rationale

OpenAI is playing a platform game. By allowing "bring your ChatGPT subscription" to any tool, they:
1. Increase the value of ChatGPT subscriptions
2. Lock users into the OpenAI ecosystem
3. Win developer mindshare over Anthropic

This strategy is explicitly contrasted with Anthropic's approach in multiple news articles. The Codex Open Source Fund even provides API credits and ChatGPT Pro access to open-source maintainers.

---

## 2. Anthropic: Why Claude Code Token Reuse Is Blocked

### Timeline

1. **Pre-January 2026**: Third-party tools like OpenCode (107k+ GitHub stars), OpenClaw, Cline, and Roo Code were using Claude subscription OAuth tokens. OpenCode was specifically spoofing Claude Code's client identity via HTTP headers to make Anthropic's servers think requests came from the official CLI.

2. **January 9, 2026**: Anthropic deployed server-side blocks without advance warning. Tokens now return: *"This credential is only authorized for use with Claude Code and cannot be used for other API requests."* ([Source: daveswift.com/claude-oauth-update](https://daveswift.com/claude-oauth-update/))

3. **February 2026 (~6 weeks later)**: Anthropic formally updated their legal compliance page: *"Using OAuth tokens obtained through Claude Free, Pro, or Max accounts in any other product, tool, or service, including the Agent SDK, is not permitted and constitutes a violation of the Consumer Terms of Service."* ([Source: The Register](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/), [VentureBeat](https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses))

4. **Legal requests**: OpenCode received a direct legal request from Anthropic to remove Claude OAuth support. A commit in OpenCode's repo cites "anthropic legal requests" as the reason. ([Source: natural20.com/coverage/anthropic-banned-openclaw-oauth-claude-code-third-party](https://natural20.com/coverage/anthropic-banned-openclaw-oauth-claude-code-third-party))

### Technical Enforcement

- OAuth tokens are stored in the OS keychain (macOS: `"Claude Code-credentials"`), not plaintext files.
- The Claude Code CLI sends specific client headers that identify it as the official tool.
- The API validates these headers server-side. Third-party tools that tried to spoof these headers were specifically targeted.
- Testing confirms: `Authorization: Bearer <token>` returns "OAuth authentication is currently not supported." Using `x-api-key: <token>` passes auth but inference requests return `invalid_request_error: Error` for recognized models.

### Economic Rationale

- A $200/month Max subscription running agentic Opus workloads would cost $1,000+ at API rates.
- Flat-rate subscriptions become deeply unprofitable when third-party tools remove the built-in rate limits that Claude Code enforces.
- Anthropic engineer Thariq Shihipar stated: *"Third-party harnesses using Claude subscriptions create problems for users and are prohibited by our Terms of Service."* ([Source: Hacker News discussion](https://news.ycombinator.com/item?id=47069299))

### Community Reaction

The Hacker News thread gathered 180+ comments in 2 hours. David Heinemeier Hansson called it "customer hostile." Others noted it was better than retroactive billing at API rates. Multiple migration guides appeared for moving from Claude to Codex. ([Source: news.ycombinator.com/item?id=47069299](https://news.ycombinator.com/item?id=47069299))

A Medium article captured the sentiment: "Anthropic Just Killed My $200/Month OpenClaw Setup. So I Rebuilt It for $15." ([Source: medium.com/@rentierdigital](https://medium.com/@rentierdigital/anthropic-just-killed-my-200-month-openclaw-setup-so-i-rebuilt-it-for-15-9cab6814c556))

---

## 3. Subscription Sharing Across Multiple Users

### OpenAI Terms of Service

Account sharing is **prohibited**:
- *"Your OpenAI account is meant for you, the individual who created it."*
- *"You may not share your account with anyone else."*
([Source: help.openai.com/en/articles/10471989-openai-account-sharing-policy](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy))

The Services Agreement explicitly prohibits sharing login credentials between multiple users. ([Source: openai.com/policies/services-agreement](https://openai.com/policies/services-agreement/))

**Detection methods**: Browser fingerprinting, multiple simultaneous sessions from different locations, unusual usage patterns (different IPs/device fingerprints).

**Consequences**: Account suspension/termination, loss of chat history, potential permanent ban from all OpenAI services.

**Gray area for Codex tokens**: Since OpenAI allows third-party tools to use Codex OAuth, and the tokens are stored in plaintext, there is a gray area. The ToS prohibits sharing the account, but a self-hosted proxy server that routes multiple users through one set of tokens would appear as requests from a single server IP, which might actually look less suspicious than multi-device usage.

**Rate limits as natural constraint**:
- ChatGPT Plus ($20/mo): ~160 messages per 3-hour window
- ChatGPT Pro ($200/mo): Higher limits but still has per-window quotas for Codex
- Codex quotas reset every 5 hours; local and cloud tasks share the same bucket
([Source: developers.openai.com/codex/pricing](https://developers.openai.com/codex/pricing), [help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan))

### Anthropic Terms of Service

Account sharing is **prohibited and technically enforced**:
- OAuth tokens from consumer plans cannot be used outside Claude Code at all (server-side enforcement since January 2026).
- Multiple logins from different IPs trigger verification or suspension.
- The Team plan ($25/user/month for 5-75 users) is the legitimate path for multi-user access.

---

## 4. Open Source Projects Reusing Codex CLI Tokens

Several active open-source projects demonstrate the ecosystem:

1. **CLIProxyAPI** ([github.com/router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)): The most comprehensive project. Wraps Codex, Claude Code, Gemini CLI, Qwen Code into a unified OpenAI-compatible API. Supports multi-account load balancing with round-robin and automatic failover, and explicitly supports remote proxy mode for team sharing. MIT licensed.

2. **codex-openai-proxy** ([github.com/Securiteru/codex-openai-proxy](https://github.com/Securiteru/codex-openai-proxy)): Rust proxy that reads `auth.json`, converts OpenAI Chat Completions API format to ChatGPT Responses API format. Includes Cloudflare bypass with browser-like headers. Designed for Cline/Claude Code extensions.

3. **claude_n_codex_api_proxy** ([github.com/jimmc414/claude_n_codex_api_proxy](https://github.com/jimmc414/claude_n_codex_api_proxy)): Python proxy that auto-routes API calls to local CLI tools when API key is set to all 9s, otherwise uses cloud APIs.

4. **opencode-openai-codex-auth** ([github.com/numman-ali/opencode-openai-codex-auth](https://github.com/numman-ali/opencode-openai-codex-auth)): OAuth plugin for OpenCode using the same OAuth flow as the official Codex CLI. Includes the disclaimer: *"This plugin is intended for personal development only. For commercial applications, production systems, or services serving multiple users, you must obtain proper API access through the OpenAI Platform API."*

5. **openai-oauth** ([github.com/EvanZhouDev/openai-oauth](https://github.com/EvanZhouDev/openai-oauth)): Described as "Free OpenAI API access with your ChatGPT account."

---

## 5. Comparison Table

| Aspect | OpenAI (Codex) | Anthropic (Claude) |
|---|---|---|
| Third-party OAuth use | Explicitly supported with docs and App Server API | Explicitly banned since Jan 2026 |
| Token storage | Plaintext `~/.codex/auth.json` | OS keychain (macOS) |
| Technical enforcement | None (open OAuth flow) | Server-side client validation |
| Account sharing (ToS) | Prohibited | Prohibited |
| Account sharing (enforcement) | Minimal; rate limits are the constraint | Blocked at API level |
| Multi-user sharing projects | Multiple active open-source projects | All blocked at API level |
| Strategy | Platform play (ecosystem growth) | Walled garden (cost control) |

---

## Implications for openvlt

1. **Codex CLI integration is safe.** OpenAI explicitly supports third-party Codex OAuth usage. openvlt reading `~/.codex/auth.json` and making Responses API calls is sanctioned behavior.

2. **Claude Code must use the CLI subprocess.** Direct API calls with OAuth tokens are blocked. The `claude --print` approach with MCP tools is the only viable path. See [/docs/claude-code-integration.md](/docs/claude-code-integration.md) for technical details.

3. **Multi-user sharing should not be encouraged.** Both providers prohibit account sharing in their ToS. openvlt should treat each user's subscription as their own. The settings UI should make this clear.

4. **Monitor Anthropic's stance.** If Anthropic opens up OAuth for third-party tools in the future (to compete with OpenAI's platform strategy), the Claude Code provider could be simplified to use direct API calls instead of CLI subprocess. The current CLI approach works but is inherently more complex.

---

## 6. Revenue Breakdown: Why the Business Model Explains Everything

The OAuth policy difference becomes obvious when you look at where these companies actually make their money.

### OpenAI Revenue

**Current ARR (early 2026):** ~$25 billion, tripled from ~$6B in 2024. ([PYMNTS](https://www.pymnts.com/artificial-intelligence-2/2026/openais-annual-recurring-revenue-tripled-to-20-billion-in-2025/))

**Revenue split:**
- **ChatGPT subscriptions (consumer + business): ~73%** of total revenue
- **API revenue (developer/enterprise): ~27%** of total revenue

([Source: Tanay Jaipuria analysis](https://www.tanayj.com/p/openai-and-anthropic-revenue-breakdown))

**Subscriber counts:**
- ChatGPT Plus ($20/mo): ~10 million paying subscribers
- ChatGPT Pro ($200/mo): ~5.8% of consumer revenue as of January 2025
- Enterprise/Team/Edu: 7 million enterprise seats deployed
- Total weekly active users: 900 million+

([Source: Sacra](https://sacra.com/c/openai/), [Backlinko](https://backlinko.com/chatgpt-stats), [Business of Apps](https://www.businessofapps.com/data/chatgpt-statistics/))

**Codex:** 1.6 million weekly active users by early 2026. No standalone revenue figure disclosed. ([Fortune](https://fortune.com/2026/03/04/openai-codex-growth-enterprise-ai-agents/))

### Anthropic Revenue

**Current ARR (early 2026):** ~$19 billion, approaching $20B. 2028 projection: $70B. ([Yahoo Finance](https://finance.yahoo.com/news/anthropic-arr-surges-19-billion-151028403.html), [TechCrunch](https://techcrunch.com/2025/11/04/anthropic-expects-b2b-demand-to-boost-revenue-to-70b-in-2028-report/))

**Revenue split:**
- **API revenue (direct + cloud marketplace): ~85%** of total revenue
  - Third-party API via Amazon Bedrock, Google Vertex: 60-75%
  - Direct API: 10-25%
- **Claude subscriptions (Pro/Team): ~15%** of total revenue

([Source: Sacra](https://sacra.com/c/anthropic/), [SaaStr](https://www.saastr.com/anthropic-just-hit-14-billion-in-arr-up-from-1-billion-just-14-months-ago/))

**User counts:**
- Monthly active users: ~18.9 million
- Daily signups quadrupled to over 1 million/day by March 2026
- 500+ organizations pay over $1M/year
- Claude Code alone: $2.5B annualized as of February 2026, more than doubling since January

([Source: Backlinko](https://backlinko.com/claude-users), [Constellation Research](https://www.constellationr.com/insights/news/anthropics-claude-code-revenue-doubled-jan-1))

**Cloud provider revenue sharing:** AWS projected to generate $1.28B from Anthropic in 2025, climbing to ~$3B in 2026. Total resale partner payouts projected to reach ~$6.4B by 2027. ([Seeking Alpha](https://seekingalpha.com/news/4553201-anthropic-may-share-up-to-64b-with-amazon-google-microsoft-in-2027))

### Head-to-Head

| Metric | OpenAI | Anthropic |
|---|---|---|
| **Current ARR (early 2026)** | ~$25B | ~$19B |
| **Revenue from subscriptions** | ~73% | ~15% |
| **Revenue from API** | ~27% | ~85% |
| **Consumer users** | 900M+ weekly | 18.9M monthly |
| **Paid subscribers** | ~15M+ | Not disclosed |
| **Coding tool ARR** | Not disclosed | $2.5B (Claude Code) |
| **Growth rate** | ~3.4x/year | ~10x/year |

([Source: Epoch AI](https://epoch.ai/data-insights/anthropic-openai-revenue), [Entrepreneur](https://www.entrepreneur.com/business-news/anthropic-doubles-revenue-to-nearly-20b-in-mere-months/503170))

### What This Explains

**OpenAI is a subscription company (73% subscriptions).** Every additional tool that accepts "bring your ChatGPT subscription" makes the subscription more valuable and drives more sign-ups. Letting Cline, OpenClaw, and third-party apps use Codex OAuth is a growth lever, not a cost center. The API business (27%) is secondary. Losing some margin on power users who route through third-party tools is worth it if it drives subscription growth.

**Anthropic is an API company (85% API).** Their revenue comes from developers and enterprises paying per-token. A flat-rate subscription user who routes agentic workloads through a third-party tool is pure cost with no upside. A $200/month Max subscriber running Opus through a third-party harness could consume $1,000+ in compute. Since subscriptions are only 15% of revenue, protecting API margins matters far more than growing the subscriber base. Blocking OAuth reuse preserves the economics of the API business that actually pays the bills.

In short: OpenAI can afford to be generous with subscriptions because subscriptions ARE the business. Anthropic cannot because subscriptions are a small loss-leader for the API business that generates 85% of revenue.
