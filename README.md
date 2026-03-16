<p align="center">
  <img src="public/logo.svg" alt="openvlt" width="64" height="64" />
</p>

<h1 align="center">openvlt</h1>

<p align="center">
  <strong>Your notes. Your files. Your server.</strong><br/>
  <a href="https://openvlt.com">openvlt.com</a>
</p>

<p align="center">
  Self-hosted, open-source notes app built on plain markdown files.<br/>
  Think Obsidian meets Apple Notes. But you own everything. No Sync Conflicts.
</p>

<p align="center">
  <a href="https://openvlt.com"><img src="https://img.shields.io/badge/Website-openvlt.com-black?style=for-the-badge&logo=safari&logoColor=white" alt="Website" /></a>
  &nbsp;
  <a href="#quick-install"><img src="https://img.shields.io/badge/%E2%86%92_Install-curl_|_bash-black?style=for-the-badge" alt="Install" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  &nbsp;
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  &nbsp;
  <img src="https://img.shields.io/badge/E2E_Encrypted-1a1a2e?style=for-the-badge&logo=letsencrypt&logoColor=white" alt="E2E Encrypted" />
</p>

<br />

<p align="center">
  <img src=".github/assets/screenshot.png" alt="openvlt Screenshot" width="800" style="border-radius: 12px;" />
</p>

<br />

---

<br />

## Why openvlt?

We've all been there. Apple Notes silently corrupts an attachment and you don't notice until you need it. Obsidian's sync creates duplicate conflict files that quietly overwrite your edits. Notion goes down and your entire workspace is unreachable. Your notes deserve better than this.

openvlt was built out of frustration with tools that treat your data as their product:

- **Your notes are real `.md` files** on your filesystem. Browse them in Finder, edit with Vim, back up with rsync. No proprietary database sitting between you and your words.
- **No sync conflicts.** openvlt uses three-way merge with vector clocks. When conflicts do happen, you see both versions and choose. Nothing gets silently overwritten or duplicated.
- **No cloud dependency.** Runs on your machine or your VPS. Your notes never pass through someone else's servers. If openvlt disappears tomorrow, your files are still right there on disk.
- **Attachments that don't corrupt.** Files are stored alongside your notes as regular files on your filesystem. No re-encoding, no compression, no database blobs. What you put in is exactly what you get out.
- **No vendor lock-in.** Every note is a plain markdown file. Walk away anytime with all your data intact, no export tool needed.

<br />

## Quick Install

```bash
curl -fsSL https://openvlt.com/install.sh | bash
```

That's it. This will:

1. Install Node.js, bun, and pm2 (if not present)
2. Clone and build openvlt to `~/.openvlt/app/`
3. Start the server on port **3456**
4. Configure auto-restart on crash and reboot

Then open **http://localhost:3456** and create your account.

<br />

## CLI

After installation, the `openvlt` command is available globally:

```bash
openvlt start              # Start the server (default port 3456)
openvlt start 8080         # Start on a custom port
openvlt stop               # Stop the server
openvlt restart            # Restart the server
openvlt status             # Show status + check for updates
openvlt update             # Pull latest, rebuild, restart
openvlt logs               # Show recent logs
openvlt logs -f            # Follow logs in real-time
openvlt uninstall          # Remove openvlt (keeps your notes)
```

<br />

## How It Works

```
Your Filesystem                     openvlt
──────────────                     ────────
~/Documents/Notes/                 ← You choose the vault directory
├── meeting-notes.md               ← Real markdown files
├── project/
│   ├── roadmap.md
│   └── ideas.md
└── attachments/
    └── screenshot.png

~/.openvlt/
├── app/                           ← Application files
└── data/.openvlt/openvlt.db       ← Metadata & search index only
                                     (never stores note content)
```

Notes are always plain markdown files on disk. SQLite handles metadata, search indexing, and sessions, but never note content. Delete the database and your notes are still there.

<br />

## Manual Setup

```bash
git clone https://github.com/ericvaish/openvlt.git
cd openvlt
bun install
bun run build
bun run start              # Starts on port 3456
```

<br />

## Development

```bash
bun install
bun run dev                # Dev server with Turbopack → localhost:3000
bun run lint               # ESLint
bun run format             # Prettier
bun run typecheck          # TypeScript checks
```

<br />

## Docker

For server/VPS deployments:

```bash
docker compose up -d
```

Data is stored in `./data/` on the host via bind mount. Server runs on port 3456.

> **Note:** In Docker mode, all vaults live under the mounted `./data/` directory. For full filesystem access (choose any directory as a vault), use the native install.

<br />

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Next.js 16 (App Router, Turbopack) |
| **Backend** | Next.js API routes, Node.js |
| **Database** | SQLite via better-sqlite3 (WAL mode, FTS5) |
| **Editor** | TipTap + tiptap-markdown |
| **UI** | shadcn/ui, Tailwind CSS v4, Lucide icons |
| **Auth** | bcryptjs + WebAuthn + recovery keys |
| **Package Manager** | bun |
| **Process Manager** | pm2 |

<br />

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3456` | Server port |
| `openvlt_DB_PATH` | `data/.openvlt/openvlt.db` | SQLite database path |
| `WEBAUTHN_ORIGIN` | `http://localhost:3456` | WebAuthn origin |
| `WEBAUTHN_RP_ID` | `localhost` | WebAuthn relying party ID |

<br />

## Contributing

PRs are welcome.

<br />

---

<p align="center">
  <sub>Built for people who believe their notes should outlive any app.</sub>
</p>
