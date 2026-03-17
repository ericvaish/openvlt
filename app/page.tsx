"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

// ── Interactive particle field ──────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", handleMouse)

    // Particles
    const count = Math.min(
      120,
      Math.floor((window.innerWidth * window.innerHeight) / 12000)
    )
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 0.5,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const mouse = mouseRef.current

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy

        // Wrap
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        // Mouse repel
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 150) {
          const force = (150 - dist) / 150
          p.vx += (dx / dist) * force * 0.2
          p.vy += (dy / dist) * force * 0.2
        }

        // Dampen
        p.vx *= 0.99
        p.vy *= 0.99

        // Draw dot
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `oklch(0.5 0.08 166 / ${0.3 + p.size * 0.15})`
        ctx.fill()

        // Connect nearby
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const d = Math.hypot(p.x - p2.x, p.y - p2.y)
          if (d < 120) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = `oklch(0.5 0.1 166 / ${(1 - d / 120) * 0.12})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouse)
    }
  }, [])

  return (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />
  )
}

// ── Scramble text on mount (once) ────────────────────────────────────
function ScrambleText({
  text,
  className = "",
  delay = 0,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const [display, setDisplay] = useState(text)
  const chars = "abcdefghijklmnopqrstuvwxyz"

  useEffect(() => {
    let iteration = 0
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        setDisplay(
          text
            .split("")
            .map((char, i) => {
              if (char === " ") return " "
              if (i < iteration) return text[i]
              return chars[Math.floor(Math.random() * chars.length)]
            })
            .join("")
        )
        iteration += 1
        if (iteration > text.length) {
          clearInterval(interval)
          setDisplay(text)
        }
      }, 30)
    }, delay)
    return () => clearTimeout(timeout)
  }, [text, delay])

  return <span className={className}>{display}</span>
}

// ════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <ParticleField />

      <div className="relative z-10 flex h-screen flex-col bg-transparent text-white">
        {/* ── NAV ─────────────────────────────────────────────── */}
        <nav
          className={`flex items-center justify-between px-8 py-6 transition-all duration-1000 ${mounted ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}
        >
          <span className="font-mono text-sm tracking-widest text-stone-600">
            v1.0
          </span>
          <div className="flex items-center gap-8">
            <Link
              href="https://github.com/ericvaish/openvlt"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs tracking-widest text-stone-600 transition-colors hover:text-stone-300"
            >
              GITHUB
            </Link>
            <Link
              href="/get-started"
              className="font-mono text-xs tracking-widest text-stone-600 transition-colors hover:text-[oklch(0.7_0.15_166)]"
            >
              DOCS
            </Link>
          </div>
        </nav>

        {/* ── CENTER HERO ────────────────────────────────────── */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
          {/* Massive brand */}
          <div
            className={`transition-all delay-300 duration-1000 ${mounted ? "scale-100 opacity-100" : "scale-95 opacity-0"}`}
          >
            <h1 className="text-center text-[clamp(4rem,15vw,14rem)] leading-[0.85] font-black tracking-[-0.06em] select-none">
              <ScrambleText
                text="openvlt"
                className="text-white [text-shadow:0_0_80px_rgba(255,255,255,0.15)]"
                delay={400}
              />
            </h1>
          </div>

          {/* Tagline */}
          <div
            className={`mt-6 transition-all delay-700 duration-1000 ${mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
          >
            <p className="text-center font-mono text-sm tracking-[0.2em] text-stone-500 sm:text-base">
              open source &middot; self-hosted &middot; encrypted &middot;
              markdown
            </p>
          </div>

          {/* Subtitle */}
          <div
            className={`mt-4 transition-all delay-1000 duration-1000 ${mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
          >
            <p className="max-w-md text-center text-lg leading-relaxed text-stone-400">
              Your notes as plain files on your server.
              <br />
              No cloud. No subscription. No compromise.
            </p>
          </div>

          {/* CTA */}
          <div
            className={`mt-10 flex items-center gap-5 transition-all delay-[1200ms] duration-1000 ${mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
          >
            <Link
              href="/get-started"
              className="group relative inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 font-mono text-sm font-semibold text-black transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_oklch(0.7_0.15_166/0.3)]"
            >
              Get Started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="https://github.com/ericvaish/openvlt"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-stone-500 underline decoration-stone-800 underline-offset-4 transition-colors hover:text-stone-300 hover:decoration-stone-500"
            >
              Learn more
            </a>
          </div>
        </div>

        {/* ── SCREENSHOT rising from bottom ────────────────── */}
        <div
          className={`pointer-events-none relative mx-auto w-full max-w-5xl px-8 transition-all delay-[1600ms] duration-1000 ${mounted ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}`}
          style={{ perspective: "1200px" }}
        >
          <div
            className="overflow-hidden rounded-t-2xl border border-b-0 border-white/10 shadow-[0_-20px_60px_oklch(0.5_0.1_166/0.1)]"
            style={{
              transform: "rotateX(8deg)",
              transformOrigin: "bottom center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/openvlt_demo.webp"
              alt="openvlt app interface"
              className="w-full"
              loading="eager"
            />
          </div>
        </div>

        {/* ── BOTTOM BAR ─────────────────────────────────────── */}
        <div
          className={`flex items-center justify-between border-t border-white/5 px-8 py-5 transition-all delay-[1400ms] duration-1000 ${mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
        >
          <span className="font-mono text-xs text-stone-700">
            &copy; openvlt by{" "}
            <a
              href="https://ericvaish.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-stone-400"
            >
              Eric Vaish
            </a>
          </span>
          <div className="flex items-center gap-5 font-mono text-xs text-stone-700">
            <a
              href="mailto:hi@ericvaish.com"
              className="transition-colors hover:text-stone-400"
            >
              hi@ericvaish.com
            </a>
            <a
              href="https://github.com/ericvaish/openvlt"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-stone-400"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
