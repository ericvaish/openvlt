"use client"

import { useState } from "react"
import {
  Terminal,
  Container,
  Server,
  FolderTree,
  Database,
  Shield,
  Settings,
  HardDrive,
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Info,
} from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "../../theme-toggle"

const aiCopyText = `# openvlt Self-Hosting Guide

openvlt is a self-hosted, open-source notes app. Notes are stored as plain markdown files on disk, with SQLite for metadata and search. It supports multi-user setups, E2E encrypted locked notes, and runs as a Next.js application.

## Requirements
- Node.js 22+ (or 20+ minimum)
- bun (package manager)
- pm2 (for process management, installed automatically)

## Quick Install (macOS / Linux)
curl -fsSL https://openvlt.com/install.sh | bash

This installs Node.js, bun, and pm2 if needed, clones the repo to ~/.openvlt/app/, builds the app, starts the server on port 3456, and sets up the "openvlt" CLI command.

## Docker Install (recommended for servers)
git clone https://github.com/ericvaish/openvlt.git
cd openvlt
docker compose up -d

docker-compose.yml:
services:
  openvlt:
    build: .
    container_name: openvlt
    restart: unless-stopped
    ports:
      - "\${OPENVLT_PORT:-3456}:3456"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3456
      - OPENVLT_DB_PATH=/app/data/.openvlt/openvlt.db

The ./data volume is critical. It contains vault files and the database.

Docker image uses node:22-alpine, runs as non-root user (UID 1001).

## Manual Install
git clone https://github.com/ericvaish/openvlt.git
cd openvlt
bun install
bun run build
bun run start

Default port: 3456. Set PORT env var to change.

For production with pm2:
bun add -g pm2
PORT=3456 pm2 start node -- .next/standalone/server.js
pm2 save

## CLI Commands (after quick install)
openvlt start              # Start the server (default port 3456)
openvlt start 8080         # Start on a custom port
openvlt stop               # Stop the server
openvlt restart            # Restart the server
openvlt status             # Show status and check for updates
openvlt update             # Pull latest version, rebuild, restart
openvlt logs               # Show recent logs
openvlt logs -f            # Follow logs in real-time
openvlt uninstall          # Remove openvlt (keeps your data)

## Environment Variables
PORT=3456                          # Server listening port
HOSTNAME=0.0.0.0                   # Bind address
OPENVLT_DB_PATH=data/.openvlt/openvlt.db  # SQLite database path
WEBAUTHN_ORIGIN=http://localhost:3456     # WebAuthn origin (set to your domain for production)
WEBAUTHN_RP_ID=localhost                  # WebAuthn relying party ID (your domain)
NODE_ENV=production                       # Set for deployments

For WebAuthn (biometric login) in production, set WEBAUTHN_ORIGIN to your full URL (e.g. https://notes.example.com) and WEBAUTHN_RP_ID to your domain (e.g. notes.example.com).

## Directory Structure
data/
  vault/{userId}/          # Each user gets an isolated directory
    notes/                 # Plain markdown files
    attachments/           # Uploaded files
  .openvlt/
    openvlt.db             # SQLite metadata and search index

The markdown files on disk are always the source of truth. SQLite only stores metadata, search indexes, and sync state.

## Reverse Proxy (production)

Caddy (automatic HTTPS):
notes.example.com {
    reverse_proxy localhost:3456
}

nginx:
server {
    listen 443 ssl http2;
    server_name notes.example.com;
    ssl_certificate     /etc/letsencrypt/live/notes.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notes.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

Set WEBAUTHN_ORIGIN and WEBAUTHN_RP_ID to match your domain.

## Backups
rsync -av data/ /path/to/backup/

Or just the essentials:
cp data/.openvlt/openvlt.db /path/to/backup/
rsync -av data/vault/ /path/to/backup/vault/

Notes are plain markdown files, so any file sync tool (git, Syncthing, etc.) works.

## Updating
Quick install: openvlt update
Docker: git pull && docker compose up -d --build
Manual: git pull && bun install && bun run build && bun run start

Database migrations run automatically on startup.

## Security
- User isolation: each user scoped to data/vault/{userId}/
- Passwords hashed with bcrypt (12 rounds)
- WebAuthn for biometric login (Touch ID, Face ID, Windows Hello)
- 24-word recovery key generated at registration
- Locked notes: AES-256-GCM, PBKDF2 key derivation (100,000 iterations), encryption happens in browser
- Sessions: httpOnly cookies with signed tokens
- Docker: runs as non-root user (UID 1001)

## Tech Stack
Next.js 16 (App Router), React 19, SQLite (WAL + FTS5), TipTap editor, bun, Tailwind CSS v4

GitHub: https://github.com/ericvaish/openvlt
`

function CodeBlock({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-[var(--border-medium)]">
      {title && (
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--card-bg)] px-4 py-2.5">
          <span className="font-mono text-xs text-[var(--text-muted)]">{title}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 font-mono text-xs text-[var(--text-faint)] transition-colors hover:text-[var(--text-primary)]"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto bg-[var(--code-bg)] p-4 font-mono text-sm leading-relaxed text-[var(--text-primary)]">
          {children}
        </pre>
        {!title && (
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-[var(--card-bg)] px-2 py-1 font-mono text-xs text-[var(--text-faint)] opacity-0 transition-all hover:text-[var(--text-primary)] group-hover:opacity-100"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  )
}

function Section({
  id,
  icon: Icon,
  title,
  children,
  badge,
}: {
  id: string
  icon: React.ElementType
  title: string
  children: React.ReactNode
  badge?: string
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--card-bg)]">
          <Icon className="size-4.5 text-[var(--text-body)]" />
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
        {badge && (
          <span className="rounded-full bg-[var(--card-bg)] px-2.5 py-0.5 font-mono text-xs text-[var(--text-muted)]">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-[var(--text-body)]">
        {children}
      </div>
    </section>
  )
}

function Callout({
  children,
  type = "info",
}: {
  children: React.ReactNode
  type?: "info" | "tip" | "important"
}) {
  const styles = {
    info: "border-[var(--border-subtle)] bg-[var(--card-bg)]",
    tip: "border-[var(--callout-tip-border)] bg-[var(--callout-tip-bg)]",
    important: "border-[var(--callout-warn-border)] bg-[var(--callout-warn-bg)]",
  }
  const icons = {
    info: <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--text-muted)]" />,
    tip: <Zap className="mt-0.5 size-3.5 shrink-0 text-emerald-500/70" />,
    important: <Info className="mt-0.5 size-3.5 shrink-0 text-amber-500/70" />,
  }

  return (
    <div
      className={`flex gap-2.5 rounded-xl border p-4 text-sm leading-relaxed text-[var(--text-body)] ${styles[type]}`}
    >
      {icons[type]}
      <div>{children}</div>
    </div>
  )
}

function Step({
  number,
  children,
}: {
  number: number
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-medium)] font-mono text-xs text-[var(--text-muted)]">
        {number}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  )
}

const navItems = [
  { id: "quick-install", label: "Quick Install" },
  { id: "docker", label: "Docker" },
  { id: "manual", label: "Manual Setup" },
  { id: "cli", label: "CLI Commands" },
  { id: "configuration", label: "Configuration" },
  { id: "directory-structure", label: "Directory Structure" },
  { id: "database", label: "Database" },
  { id: "security", label: "Security" },
  { id: "reverse-proxy", label: "Reverse Proxy" },
  { id: "backups", label: "Backups" },
  { id: "updating", label: "Updating" },
]

export default function GetStarted() {
  const [aiCopied, setAiCopied] = useState(false)

  function handleAiCopy() {
    navigator.clipboard.writeText(aiCopyText)
    setAiCopied(true)
    setTimeout(() => setAiCopied(false), 3000)
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      {/* Nav */}
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--nav-bg)] px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="size-3.5" />
            openvlt
          </Link>
          <span className="text-[var(--text-ghost)]">/</span>
          <Link
            href="/docs"
            className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Docs
          </Link>
          <span className="text-[var(--text-ghost)]">/</span>
          <span className="text-sm font-medium">Get Started</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <a
            href="https://github.com/ericvaish/openvlt"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            GitHub
            <ExternalLink className="size-3" />
          </a>
        </div>
      </nav>

      <div className="mx-auto flex max-w-6xl gap-12 px-6 pt-24 pb-24">
        {/* Sidebar nav */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-24">
            <p className="mb-4 font-mono text-xs tracking-widest text-[var(--text-faint)] uppercase">
              On this page
            </p>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--card-bg)] hover:text-[var(--text-primary)]"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 space-y-16">
          {/* Header */}
          <div>
            <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Self-Host openvlt
            </h1>
            <p className="mb-6 max-w-xl text-lg leading-relaxed text-[var(--text-body)]">
              Get openvlt running on your own hardware in minutes. Your notes
              stay on your machine as plain markdown files. No cloud, no third
              parties, no subscriptions.
            </p>

            {/* Copy for AI button */}
            <button
              onClick={handleAiCopy}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--border-medium)] bg-[var(--card-bg)] px-4 py-3 text-sm transition-all hover:border-[var(--border-medium)] hover:bg-white/[0.05]"
            >
              <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--card-bg)]">
                {aiCopied ? (
                  <Check className="size-3.5 text-emerald-400" />
                ) : (
                  <Copy className="size-3.5 text-[var(--text-body)]" />
                )}
              </div>
              <div className="text-left">
                <p className="font-medium text-[var(--text-primary)]">
                  {aiCopied
                    ? "Copied to clipboard"
                    : "Copy install guide as text"}
                </p>
                <p className="text-xs text-[var(--text-faint)]">
                  {aiCopied
                    ? "Paste it into your AI assistant"
                    : "Paste into ChatGPT, Claude, or any AI assistant"}
                </p>
              </div>
            </button>
          </div>

          {/* Quick facts */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Stack", "Next.js 16"],
              ["Database", "SQLite"],
              ["Port", "3456"],
              ["Storage", ".md files"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 text-center"
              >
                <p className="font-mono text-xs text-[var(--text-faint)]">{label}</p>
                <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Quick Install */}
          <Section id="quick-install" icon={Terminal} title="Quick Install">
            <p>
              The fastest way to get started. Works on macOS and Linux. One
              command installs everything and starts the server.
            </p>

            <CodeBlock title="terminal">
              {`curl -fsSL https://openvlt.com/install.sh | bash`}
            </CodeBlock>

            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                What the script does:
              </p>
              <div className="space-y-2.5">
                <Step number={1}>
                  <p>
                    Installs Node.js 22+ and bun if not already present
                  </p>
                </Step>
                <Step number={2}>
                  <p>
                    Clones the repo to{" "}
                    <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                      ~/.openvlt/app/
                    </code>{" "}
                    and builds the application
                  </p>
                </Step>
                <Step number={3}>
                  <p>
                    Starts the server on port{" "}
                    <strong className="text-[var(--text-primary)]">3456</strong> via pm2
                    and sets up the{" "}
                    <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                      openvlt
                    </code>{" "}
                    CLI command
                  </p>
                </Step>
              </div>
            </div>

            <Callout type="tip">
              Once complete, open{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                http://localhost:3456
              </code>{" "}
              to create your account.
            </Callout>
          </Section>

          {/* Docker */}
          <Section id="docker" icon={Container} title="Docker" badge="recommended for servers">
            <p>
              Best for VPS and server deployments. The image uses a multi-stage
              build with{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                node:22-alpine
              </code>{" "}
              and runs as a non-root user.
            </p>

            <CodeBlock title="docker-compose.yml">
              {`services:
  openvlt:
    build: .
    container_name: openvlt
    restart: unless-stopped
    ports:
      - "\${OPENVLT_PORT:-3456}:3456"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3456
      - OPENVLT_DB_PATH=/app/data/.openvlt/openvlt.db`}
            </CodeBlock>

            <CodeBlock title="terminal">
              {`# Clone and start
git clone https://github.com/ericvaish/openvlt.git
cd openvlt
docker compose up -d

# Or build and run manually
docker build -t openvlt .
docker run -d -p 3456:3456 -v openvlt_data:/app/data openvlt`}
            </CodeBlock>

            <Callout type="important">
              The{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                ./data
              </code>{" "}
              volume is critical. It contains your vault files and database.
              Always mount it to persist data across container restarts.
            </Callout>
          </Section>

          {/* Manual */}
          <Section id="manual" icon={Server} title="Manual Setup">
            <p>
              For full control over the setup. Requires Node.js 22+ and bun.
            </p>

            <CodeBlock title="terminal">
              {`git clone https://github.com/ericvaish/openvlt.git
cd openvlt
bun install
bun run build
bun run start`}
            </CodeBlock>

            <p>
              The server starts on port 3456 by default. Set the{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                PORT
              </code>{" "}
              environment variable to change it. For production, use pm2 to
              handle restarts.
            </p>

            <CodeBlock title="terminal (pm2)">
              {`# Install pm2
bun add -g pm2

# Start with pm2
PORT=3456 pm2 start node -- .next/standalone/server.js
pm2 save`}
            </CodeBlock>
          </Section>

          {/* CLI */}
          <Section id="cli" icon={Terminal} title="CLI Commands">
            <p>
              If you used the quick install script, the{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                openvlt
              </code>{" "}
              CLI is available globally.
            </p>

            <CodeBlock title="commands">
              {`openvlt start              # Start the server (default port 3456)
openvlt start 8080         # Start on a custom port
openvlt stop               # Stop the server
openvlt restart            # Restart the server
openvlt status             # Show status and check for updates
openvlt update             # Pull latest version, rebuild, restart
openvlt logs               # Show recent logs
openvlt logs -f            # Follow logs in real-time
openvlt uninstall          # Remove openvlt (keeps your data)`}
            </CodeBlock>
          </Section>

          {/* Configuration */}
          <Section id="configuration" icon={Settings} title="Configuration">
            <p>
              Configured via environment variables. All settings have sensible
              defaults. No configuration file is required.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-medium)] text-left">
                    <th className="py-3 pr-4 font-mono text-xs font-medium text-[var(--text-primary)]">
                      Variable
                    </th>
                    <th className="py-3 pr-4 font-medium text-[var(--text-primary)]">
                      Default
                    </th>
                    <th className="py-3 font-medium text-[var(--text-primary)]">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-muted)]">
                  {[
                    ["PORT", "3456", "Server listening port"],
                    ["HOSTNAME", "0.0.0.0", "Bind address"],
                    [
                      "OPENVLT_DB_PATH",
                      "data/.openvlt/openvlt.db",
                      "SQLite database file path",
                    ],
                    [
                      "WEBAUTHN_ORIGIN",
                      "http://localhost:3456",
                      "WebAuthn origin (must match your domain)",
                    ],
                    [
                      "WEBAUTHN_RP_ID",
                      "localhost",
                      "WebAuthn relying party ID (your domain)",
                    ],
                    [
                      "NODE_ENV",
                      "production",
                      "Set to production for deployments",
                    ],
                  ].map(([variable, def, desc]) => (
                    <tr key={variable} className="border-b border-[var(--border-subtle)]">
                      <td className="py-3 pr-4 font-mono text-xs text-[var(--text-primary)]">
                        {variable}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">{def}</td>
                      <td className="py-3">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Callout type="info">
              For WebAuthn (biometric login) to work in production, set{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                WEBAUTHN_ORIGIN
              </code>{" "}
              to your full URL (e.g.{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                https://notes.example.com
              </code>
              ) and{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                WEBAUTHN_RP_ID
              </code>{" "}
              to your domain (e.g.{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                notes.example.com
              </code>
              ).
            </Callout>
          </Section>

          {/* Directory Structure */}
          <Section
            id="directory-structure"
            icon={FolderTree}
            title="Directory Structure"
          >
            <p>
              All user data lives in the{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                data/
              </code>{" "}
              directory. Notes are plain markdown files. You can browse, edit,
              and back them up with any standard tools.
            </p>

            <CodeBlock>
              {`data/
├── vault/
│   └── {userId}/            # Each user gets an isolated directory
│       ├── notes/
│       │   ├── meeting.md   # Plain markdown files
│       │   └── ideas.md
│       └── attachments/
│           └── image.png
└── .openvlt/
    └── openvlt.db           # SQLite metadata & search index`}
            </CodeBlock>

            <Callout type="important">
              The markdown files on disk are always the source of truth.
              SQLite stores metadata, search indexes, and sync state only.
              Never note content.
            </Callout>
          </Section>

          {/* Database */}
          <Section id="database" icon={Database} title="Database">
            <p>
              openvlt uses SQLite in WAL mode with FTS5 for full-text search.
              The database is created and migrated automatically on first
              start. No manual setup required.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Auto-created", "Schema is created on first run"],
                ["Auto-migrated", "Migrations run on every startup"],
                ["Default path", "data/.openvlt/openvlt.db"],
                ["Override", "OPENVLT_DB_PATH env variable"],
              ].map(([title, desc]) => (
                <div
                  key={title}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3"
                >
                  <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Security */}
          <Section id="security" icon={Shield} title="Security">
            <p>
              Designed for self-hosting with strong security defaults.
            </p>

            <div className="space-y-3">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">
                  User Isolation
                </p>
                <p>
                  Each user&apos;s files are scoped to{" "}
                  <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                    data/vault/{"{userId}"}/
                  </code>
                  . The service layer enforces directory boundaries. Users
                  cannot access each other&apos;s files through the API.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">
                  Authentication
                </p>
                <p>
                  Passwords hashed with bcrypt (12 rounds). Optional WebAuthn
                  for biometric login (Touch ID, Face ID, Windows Hello).
                  24-word recovery key generated at registration. Sessions
                  stored as httpOnly cookies with signed tokens.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">
                  End-to-End Encryption
                </p>
                <p>
                  Lock sensitive notes with AES-256-GCM. The encryption key is
                  derived from your lock password via PBKDF2 (100,000
                  iterations) and never leaves the browser.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">
                  Docker
                </p>
                <p>
                  The container runs as a non-root user (
                  <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                    UID 1001
                  </code>
                  ) with minimal permissions.
                </p>
              </div>
            </div>
          </Section>

          {/* Reverse Proxy */}
          <Section id="reverse-proxy" icon={Server} title="Reverse Proxy">
            <p>
              For production, put openvlt behind a reverse proxy with HTTPS.
            </p>

            <CodeBlock title="Caddy (recommended, automatic HTTPS)">
              {`notes.example.com {
    reverse_proxy localhost:3456
}`}
            </CodeBlock>

            <CodeBlock title="nginx">
              {`server {
    listen 443 ssl http2;
    server_name notes.example.com;

    ssl_certificate     /etc/letsencrypt/live/notes.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/notes.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for HMR in dev, optional in prod)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}`}
            </CodeBlock>

            <Callout type="info">
              Set{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                WEBAUTHN_ORIGIN
              </code>{" "}
              and{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                WEBAUTHN_RP_ID
              </code>{" "}
              to match your domain when using a reverse proxy.
            </Callout>
          </Section>

          {/* Backups */}
          <Section id="backups" icon={HardDrive} title="Backups">
            <p>
              Since notes are plain files, backing up is straightforward.
            </p>

            <CodeBlock title="terminal">
              {`# Back up everything
rsync -av data/ /path/to/backup/

# Or just the essentials
cp data/.openvlt/openvlt.db /path/to/backup/
rsync -av data/vault/ /path/to/backup/vault/`}
            </CodeBlock>

            <Callout type="tip">
              You can also use git, Syncthing, or any file sync tool on the{" "}
              <code className="rounded bg-[var(--card-bg)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                data/vault/
              </code>{" "}
              directory since it&apos;s just markdown files.
            </Callout>
          </Section>

          {/* Updating */}
          <Section id="updating" icon={Settings} title="Updating">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">
                  Quick Install
                </p>
                <code className="font-mono text-xs text-[var(--text-body)]">
                  openvlt update
                </code>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">
                  Docker
                </p>
                <code className="font-mono text-xs text-[var(--text-body)]">
                  git pull && docker compose up -d --build
                </code>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4">
                <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">
                  Manual
                </p>
                <code className="font-mono text-xs text-[var(--text-body)]">
                  git pull && bun install && bun run build
                </code>
              </div>
            </div>

            <Callout type="tip">
              Database migrations run automatically on startup. No manual
              migration step needed.
            </Callout>
          </Section>

          {/* Footer */}
          <div className="border-t border-[var(--border-subtle)] pt-12">
            <p className="text-sm text-[var(--text-faint)]">
              Need help?{" "}
              <a
                href="mailto:hi@ericvaish.com"
                className="text-[var(--text-body)] underline decoration-[var(--text-ghost)] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
              >
                hi@ericvaish.com
              </a>{" "}
              &middot;{" "}
              <a
                href="https://github.com/ericvaish/openvlt/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-body)] underline decoration-[var(--text-ghost)] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
              >
                Open an issue on GitHub
              </a>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
