import Link from "next/link"
import { ThemeToggle } from "../theme-toggle"
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  HelpCircle,
  Server,
  Sparkles,
} from "lucide-react"

const docs = [
  {
    title: "Self-Hosting",
    description:
      "Install and configure openvlt on your own hardware. Docker, CLI, or manual setup.",
    href: "/docs/get-started",
    icon: Server,
  },
  {
    title: "AI Setup",
    description:
      "Connect ChatGPT, Claude, or API keys to chat with your notes.",
    href: "/docs/ai-setup",
    icon: Sparkles,
  },
  {
    title: "FAQ",
    description:
      "Common questions about sync, architecture, and design decisions.",
    href: "/docs/faq",
    icon: HelpCircle,
  },
]

export default function DocsIndex() {
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
          <span className="text-sm font-medium">Docs</span>
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

      <div className="mx-auto max-w-3xl px-6 pt-24 pb-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Documentation
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[var(--text-body)]">
            Everything you need to set up, configure, and get the most out of
            openvlt.
          </p>
        </div>

        {/* Doc cards */}
        <div className="space-y-4">
          {docs.map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              className="group flex items-center gap-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-6 transition-all hover:border-[var(--border-medium)] hover:bg-[var(--card-bg-hover)]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[var(--card-bg)]">
                <doc.icon className="size-5 text-[var(--text-body)]" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  {doc.title}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {doc.description}
                </p>
              </div>
              <ArrowRight className="size-4 text-[var(--text-ghost)] transition-colors group-hover:text-[var(--text-body)]" />
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-[var(--border-subtle)] pt-12">
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
      </div>
    </div>
  )
}
