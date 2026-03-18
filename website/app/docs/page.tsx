import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
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
]

export default function DocsIndex() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-white/5 bg-[#0a0a0a]/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-mono text-sm text-stone-500 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            openvlt
          </Link>
          <span className="text-stone-800">/</span>
          <span className="text-sm font-medium">Docs</span>
        </div>
        <a
          href="https://github.com/ericvaish/openvlt"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-stone-500 transition-colors hover:text-white"
        >
          GitHub
          <ExternalLink className="size-3" />
        </a>
      </nav>

      <div className="mx-auto max-w-3xl px-6 pt-24 pb-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Documentation
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-stone-400">
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
              className="group flex items-center gap-5 rounded-xl border border-white/5 bg-white/[0.02] p-6 transition-all hover:border-white/10 hover:bg-white/[0.04]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/5">
                <doc.icon className="size-5 text-stone-400" />
              </div>
              <div className="flex-1">
                <p className="text-base font-semibold text-stone-200">
                  {doc.title}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {doc.description}
                </p>
              </div>
              <ArrowRight className="size-4 text-stone-700 transition-colors group-hover:text-stone-400" />
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-white/5 pt-12">
          <p className="text-sm text-stone-600">
            Need help?{" "}
            <a
              href="mailto:hi@ericvaish.com"
              className="text-stone-400 underline decoration-stone-800 underline-offset-4 transition-colors hover:text-white"
            >
              hi@ericvaish.com
            </a>{" "}
            &middot;{" "}
            <a
              href="https://github.com/ericvaish/openvlt/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-400 underline decoration-stone-800 underline-offset-4 transition-colors hover:text-white"
            >
              Open an issue on GitHub
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
