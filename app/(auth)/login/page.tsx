"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  ArrowRightIcon,
  LoaderIcon,
  ShieldCheckIcon,
  KeyIcon,
  SmartphoneIcon,
  FingerprintIcon,
} from "lucide-react"
import { startAuthentication } from "@simplewebauthn/browser"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [focused, setFocused] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  // 2FA state
  const [requires2FA, setRequires2FA] = React.useState(false)
  const [pendingToken, setPendingToken] = React.useState("")
  const [methods, setMethods] = React.useState<string[]>([])
  const [totpCode, setTotpCode] = React.useState("")
  const [recoveryMode, setRecoveryMode] = React.useState(false)
  const [recoveryCode, setRecoveryCode] = React.useState("")

  const totpInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (requires2FA && !recoveryMode && totpInputRef.current) {
      totpInputRef.current.focus()
    }
  }, [requires2FA, recoveryMode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Login failed")
        return
      }

      if (data.requires2FA) {
        setRequires2FA(true)
        setPendingToken(data.pendingToken)
        setMethods(data.methods || [])
        return
      }

      setSuccess(true)
      router.push("/notes")
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleTotpVerify(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          method: "totp",
          code: totpCode,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Verification failed")
        setTotpCode("")
        return
      }

      setSuccess(true)
      router.push("/notes")
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleRecoveryVerify(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          method: "recovery",
          code: recoveryCode,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Invalid recovery code")
        return
      }

      setSuccess(true)
      router.push("/notes")
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleWebauthn2FA() {
    setError("")
    setLoading(true)

    try {
      // Get authentication options
      const optionsRes = await fetch("/api/auth/2fa/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          action: "options",
        }),
      })

      if (!optionsRes.ok) {
        const data = await optionsRes.json()
        setError(data.error || "Failed to start passkey verification")
        return
      }

      const { options } = await optionsRes.json()

      // Prompt for passkey
      const authResponse = await startAuthentication({ optionsJSON: options })

      // Verify with server
      const verifyRes = await fetch("/api/auth/2fa/webauthn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingToken,
          action: "verify",
          response: authResponse,
        }),
      })

      const data = await verifyRes.json()

      if (!verifyRes.ok) {
        setError(data.error || "Passkey verification failed")
        return
      }

      setSuccess(true)
      router.push("/notes")
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Passkey verification was cancelled")
      } else {
        setError("Passkey verification failed")
      }
    } finally {
      setLoading(false)
    }
  }

  function handleBackToLogin() {
    setRequires2FA(false)
    setPendingToken("")
    setMethods([])
    setTotpCode("")
    setRecoveryCode("")
    setRecoveryMode(false)
    setError("")
  }

  // ── 2FA Challenge Screen ──
  if (requires2FA) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-center gap-4">
          <div className="shrink-0">
            <Image
              src={success ? "/unlocked.svg" : "/auth.svg"}
              alt="openvlt"
              width={72}
              height={72}
              className="size-[72px] drop-shadow-[0_0_20px_rgba(var(--primary),0.15)]"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Two-factor{" "}
              <span className="text-primary">verification</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {recoveryMode
                ? "Enter a recovery code"
                : "Enter the code from your authenticator app"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card/50 p-6 shadow-lg shadow-black/5 backdrop-blur-sm">
          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
              {error}
            </div>
          )}

          {recoveryMode ? (
            <form onSubmit={handleRecoveryVerify} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="recovery" className="text-sm font-medium">
                  Recovery code
                </label>
                <input
                  id="recovery"
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="xxxx-xxxx"
                  className="h-10 rounded-lg border bg-background/50 px-3 font-mono text-sm tracking-widest transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:bg-background focus-visible:shadow-[0_0_0_3px] focus-visible:shadow-primary/10 focus-visible:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !recoveryCode.trim()}
                className="group relative mt-1 flex h-10 items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <LoaderIcon className="size-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <KeyIcon className="size-4" />
                    Verify recovery code
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRecoveryMode(false)
                  setError("")
                }}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Back to authenticator code
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-5">
              {methods.includes("totp") && (
                <form onSubmit={handleTotpVerify} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="totp" className="flex items-center gap-2 text-sm font-medium">
                      <SmartphoneIcon className="size-3.5 text-muted-foreground" />
                      Authenticator code
                    </label>
                    <input
                      ref={totpInputRef}
                      id="totp"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "")
                        setTotpCode(val)
                      }}
                      required
                      autoComplete="one-time-code"
                      placeholder="000000"
                      className="h-12 rounded-lg border bg-background/50 px-3 text-center font-mono text-xl tracking-[0.3em] transition-all placeholder:text-muted-foreground/30 focus-visible:border-primary/50 focus-visible:bg-background focus-visible:shadow-[0_0_0_3px] focus-visible:shadow-primary/10 focus-visible:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6}
                    className="group relative flex h-10 items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
                  >
                    {loading ? (
                      <>
                        <LoaderIcon className="size-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheckIcon className="size-4" />
                        Verify
                      </>
                    )}
                  </button>
                </form>
              )}

              {methods.includes("webauthn") && (
                <>
                  {methods.includes("totp") && (
                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleWebauthn2FA}
                    disabled={loading}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium transition-all hover:bg-accent active:scale-[0.98] disabled:opacity-50"
                  >
                    <FingerprintIcon className="size-4" />
                    Use a passkey
                  </button>
                </>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryMode(true)
                    setError("")
                  }}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Use a recovery code
                </button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Back to login
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Normal Login Screen ──
  return (
    <div className="flex flex-col gap-8">
      {/* Header with mascot */}
      <div className="flex items-center justify-center gap-4">
        <div className={`shrink-0 transition-transform duration-300 ${error ? "animate-[shake_0.5s_ease-in-out]" : ""}`}>
          <Image
            src={success ? "/unlocked.svg" : error ? "/incorrect.svg" : "/auth.svg"}
            alt="openvlt"
            width={72}
            height={72}
            className="size-[72px] drop-shadow-[0_0_20px_rgba(var(--primary),0.15)]"
            priority
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sign in to{" "}
            <span className="text-primary">openvlt</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your credentials to continue
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="rounded-xl border bg-card/50 p-6 shadow-lg shadow-black/5 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="username"
              className={`text-sm font-medium transition-colors ${focused === "username" ? "text-primary" : ""}`}
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocused("username")}
              onBlur={() => setFocused(null)}
              required
              autoComplete="username"
              className="h-10 rounded-lg border bg-background/50 px-3 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:bg-background focus-visible:shadow-[0_0_0_3px] focus-visible:shadow-primary/10 focus-visible:outline-none"
              placeholder="username"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className={`text-sm font-medium transition-colors ${focused === "password" ? "text-primary" : ""}`}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              required
              autoComplete="current-password"
              className="h-10 rounded-lg border bg-background/50 px-3 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/50 focus-visible:bg-background focus-visible:shadow-[0_0_0_3px] focus-visible:shadow-primary/10 focus-visible:outline-none"
              placeholder="********"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative mt-1 flex h-10 items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
          >
            {loading ? (
              <>
                <LoaderIcon className="size-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <a
          href="/register"
          className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline hover:underline-offset-4"
        >
          Register
        </a>
      </p>
    </div>
  )
}
