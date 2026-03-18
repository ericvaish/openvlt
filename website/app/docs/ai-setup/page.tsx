"use client"

import { useState } from "react"
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Check,
  Zap,
  Info,
  Sparkles,
  Key,
  Terminal,
  Shield,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"

function CodeBlock({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-white/10">
      {title && (
        <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-4 py-2.5">
          <span className="font-mono text-xs text-stone-500">{title}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 font-mono text-xs text-stone-600 transition-colors hover:text-stone-300"
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
        <pre className="overflow-x-auto bg-black/30 p-4 font-mono text-sm leading-relaxed text-stone-300">
          {children}
        </pre>
        {!title && (
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 font-mono text-xs text-stone-600 opacity-0 transition-all hover:text-stone-300 group-hover:opacity-100"
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
        <div className="flex size-9 items-center justify-center rounded-lg bg-white/5">
          <Icon className="size-4.5 text-stone-400" />
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
        {badge && (
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-xs text-stone-500">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-stone-400">
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
    info: "border-white/5 bg-white/[0.02]",
    tip: "border-emerald-500/10 bg-emerald-500/[0.03]",
    important: "border-amber-500/10 bg-amber-500/[0.03]",
  }
  const icons = {
    info: <Info className="mt-0.5 size-3.5 shrink-0 text-stone-500" />,
    tip: <Zap className="mt-0.5 size-3.5 shrink-0 text-emerald-500/70" />,
    important: (
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500/70" />
    ),
  }

  return (
    <div
      className={`flex gap-2.5 rounded-xl border p-4 text-sm leading-relaxed text-stone-400 ${styles[type]}`}
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
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 font-mono text-xs text-stone-500">
        {number}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </div>
  )
}

const navItems = [
  { id: "subscriptions", label: "Subscriptions" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "claude", label: "Claude" },
  { id: "api-keys", label: "API Keys" },
  { id: "troubleshooting", label: "Troubleshooting" },
]

export default function AISetupDocs() {
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
          <Link
            href="/docs"
            className="text-sm text-stone-500 transition-colors hover:text-white"
          >
            Docs
          </Link>
          <span className="text-stone-800">/</span>
          <span className="text-sm font-medium">AI Setup</span>
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

      <div className="mx-auto flex max-w-6xl gap-12 px-6 pt-24 pb-24">
        {/* Sidebar nav */}
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-24">
            <p className="mb-4 font-mono text-xs tracking-widest text-stone-600 uppercase">
              On this page
            </p>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block rounded-lg px-3 py-1.5 text-sm text-stone-500 transition-colors hover:bg-white/5 hover:text-white"
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
              AI Setup
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-stone-400">
              Connect your existing AI subscriptions to chat with your notes
              directly inside openvlt. No per-token charges when using
              subscriptions.
            </p>
          </div>

          {/* Subscriptions overview */}
          <Section
            id="subscriptions"
            icon={Sparkles}
            title="Subscriptions"
            badge="recommended"
          >
            <p>
              The easiest way to use AI in openvlt. Connect your existing
              ChatGPT or Claude subscription and your usage is covered by your
              plan. No API keys or per-token billing.
            </p>

            <p>
              Go to{" "}
              <strong className="text-stone-300">
                Settings &rarr; AI &rarr; Subscriptions
              </strong>
              , enable the provider you want, and follow the sign-in flow. Both
              providers can be enabled at the same time.
            </p>
          </Section>

          {/* ChatGPT */}
          <Section id="chatgpt" icon={Sparkles} title="ChatGPT">
            <p>
              Works with ChatGPT Plus or Pro subscriptions. openvlt uses OAuth
              to connect to your ChatGPT account.
            </p>

            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-stone-300">
                How to connect
              </p>
              <div className="space-y-2.5">
                <Step number={1}>
                  <p>
                    Go to{" "}
                    <strong className="text-stone-300">
                      Settings &rarr; AI &rarr; Subscriptions
                    </strong>{" "}
                    and enable ChatGPT
                  </p>
                </Step>
                <Step number={2}>
                  <p>
                    Click{" "}
                    <strong className="text-stone-300">
                      Log in to ChatGPT
                    </strong>
                    . A sign-in page will open in your browser.
                  </p>
                </Step>
                <Step number={3}>
                  <p>
                    Sign in with your OpenAI account and authorize openvlt
                  </p>
                </Step>
                <Step number={4}>
                  <p>
                    The settings page will update automatically once connected
                  </p>
                </Step>
              </div>
            </div>

            <Callout type="tip">
              If the sign-in page didn&apos;t open automatically, a link will be
              shown that you can copy and open in any browser where you are
              signed in to your ChatGPT account.
            </Callout>

            <Callout type="info">
              To disconnect, click the{" "}
              <strong className="text-stone-300">Disconnect</strong> button in
              the connected state. This removes the stored authentication token.
            </Callout>
          </Section>

          {/* Claude */}
          <Section id="claude" icon={Sparkles} title="Claude">
            <p>
              Works with Claude Pro, Max, and Team subscriptions. openvlt
              connects through Claude Code, which is bundled with the
              application.
            </p>

            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-stone-300">
                How to connect
              </p>
              <div className="space-y-2.5">
                <Step number={1}>
                  <p>
                    Go to{" "}
                    <strong className="text-stone-300">
                      Settings &rarr; AI &rarr; Subscriptions
                    </strong>{" "}
                    and enable Claude
                  </p>
                </Step>
                <Step number={2}>
                  <p>
                    Click{" "}
                    <strong className="text-stone-300">Connect Claude</strong>.
                    An authentication page will open in your browser.
                  </p>
                </Step>
                <Step number={3}>
                  <p>
                    Sign in with your Anthropic account and approve the
                    connection
                  </p>
                </Step>
                <Step number={4}>
                  <p>
                    The settings page will update automatically once connected
                  </p>
                </Step>
              </div>
            </div>

            <Callout type="tip">
              If the authentication page didn&apos;t open, a link will be shown
              that you can copy and open in any browser where you are signed in
              to your Anthropic account.
            </Callout>

            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-stone-300">
                Manual setup (fallback)
              </p>
              <p>
                If the in-app login flow doesn&apos;t work (e.g. in Docker or
                behind certain firewalls), you can authenticate manually via the
                terminal:
              </p>
            </div>

            <CodeBlock title="terminal">
              {`# Navigate to your openvlt installation directory
cd /path/to/openvlt

# Run Claude login
npx claude login

# Follow the prompts to sign in with your Anthropic account`}
            </CodeBlock>

            <p>
              After authenticating in the terminal, go back to{" "}
              <strong className="text-stone-300">
                Settings &rarr; AI &rarr; Subscriptions
              </strong>{" "}
              and click{" "}
              <strong className="text-stone-300">Refresh</strong> or toggle
              Claude off and on. The connection will be detected automatically.
            </p>
          </Section>

          {/* API Keys */}
          <Section id="api-keys" icon={Key} title="API Keys">
            <p>
              For pay-per-token usage. You provide your own API key and are
              billed directly by the provider. Supports OpenAI, Anthropic, and
              OpenRouter.
            </p>

            <div className="space-y-3 pt-2">
              <p className="text-sm font-medium text-stone-300">
                How to set up
              </p>
              <div className="space-y-2.5">
                <Step number={1}>
                  <p>
                    Go to{" "}
                    <strong className="text-stone-300">
                      Settings &rarr; AI &rarr; API Keys
                    </strong>
                  </p>
                </Step>
                <Step number={2}>
                  <p>Enable the provider you want and enter your API key</p>
                </Step>
                <Step number={3}>
                  <p>
                    Click <strong className="text-stone-300">Save</strong>. The
                    key is encrypted and stored in the database.
                  </p>
                </Step>
              </div>
            </div>

            <div className="overflow-x-auto pt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="py-3 pr-4 font-medium text-stone-300">
                      Provider
                    </th>
                    <th className="py-3 pr-4 font-medium text-stone-300">
                      Key format
                    </th>
                    <th className="py-3 font-medium text-stone-300">
                      Get a key
                    </th>
                  </tr>
                </thead>
                <tbody className="text-stone-500">
                  {[
                    [
                      "OpenAI",
                      "sk-...",
                      "https://platform.openai.com/api-keys",
                    ],
                    [
                      "Anthropic",
                      "sk-ant-...",
                      "https://console.anthropic.com/settings/keys",
                    ],
                    [
                      "OpenRouter",
                      "sk-or-...",
                      "https://openrouter.ai/keys",
                    ],
                  ].map(([provider, format, url]) => (
                    <tr key={provider} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-stone-300">{provider}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{format}</td>
                      <td className="py-3">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-stone-400 underline decoration-stone-800 underline-offset-4 transition-colors hover:text-white"
                        >
                          Get key
                          <ExternalLink className="size-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Callout type="info">
              API keys are encrypted before being stored in the database. They
              are only decrypted server-side when making requests to the
              provider.
            </Callout>
          </Section>

          {/* Troubleshooting */}
          <Section
            id="troubleshooting"
            icon={Shield}
            title="Troubleshooting"
          >
            <div className="space-y-3">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="mb-1 text-sm font-medium text-stone-300">
                  Claude login fails or times out
                </p>
                <p>
                  This can happen in Docker or behind firewalls that block the
                  OAuth callback. Use the terminal fallback instead:
                </p>
                <div className="mt-3">
                  <CodeBlock title="terminal">
                    {`cd /path/to/openvlt
npx claude login`}
                  </CodeBlock>
                </div>
                <p className="mt-3">
                  Then refresh the status in Settings. If using Docker, you may
                  need to run{" "}
                  <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-stone-300">
                    docker exec -it openvlt npx claude login
                  </code>{" "}
                  inside the container.
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="mb-1 text-sm font-medium text-stone-300">
                  ChatGPT login page doesn&apos;t open
                </p>
                <p>
                  The sign-in link is shown below the button after clicking
                  &quot;Log in to ChatGPT&quot;. Copy it and open it manually in
                  the browser where you are signed in to your OpenAI account.
                  Make sure pop-ups are not blocked.
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="mb-1 text-sm font-medium text-stone-300">
                  Authentication succeeds but AI chat doesn&apos;t work
                </p>
                <p>
                  Make sure AI chat is enabled in{" "}
                  <strong className="text-stone-300">
                    Settings &rarr; AI &rarr; Chat
                  </strong>
                  . Also verify you have selected a model in the chat sidebar
                  dropdown.
                </p>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="mb-1 text-sm font-medium text-stone-300">
                  &quot;Claude Code not detected&quot;
                </p>
                <p>
                  Claude Code is bundled with openvlt as an npm dependency. If
                  it&apos;s not detected, try reinstalling dependencies:
                </p>
                <div className="mt-3">
                  <CodeBlock title="terminal">
                    {`cd /path/to/openvlt
bun install`}
                  </CodeBlock>
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="mb-1 text-sm font-medium text-stone-300">
                  API key not working
                </p>
                <p>
                  Verify the key is correct and has not expired. Check that your
                  API account has available credits. You can remove the key and
                  re-enter it in{" "}
                  <strong className="text-stone-300">
                    Settings &rarr; AI &rarr; API Keys
                  </strong>
                  .
                </p>
              </div>
            </div>
          </Section>

          {/* Footer */}
          <div className="border-t border-white/5 pt-12">
            <p className="text-sm text-stone-600">
              Still stuck?{" "}
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
        </main>
      </div>
    </div>
  )
}
