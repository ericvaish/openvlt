"use client"

import * as React from "react"

interface PdfCanvasProps {
  url: string
  width: number
}

let pdfjsLoaded: Promise<typeof import("pdfjs-dist")> | null = null

function loadPdfjs() {
  if (!pdfjsLoaded) {
    pdfjsLoaded = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      return pdfjs
    })
  }
  return pdfjsLoaded
}

export const PdfCanvas = React.memo(function PdfCanvas({
  url,
  width,
}: PdfCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = React.useState(0)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setError(false)
    setPageCount(0)

    async function render() {
      try {
        const [pdfjs, pdfData] = await Promise.all([
          loadPdfjs(),
          fetch(url, { credentials: "same-origin" }).then((r) => {
            if (!r.ok) throw new Error(`Failed to fetch PDF: ${r.status}`)
            return r.arrayBuffer()
          }),
        ])
        if (cancelled) return

        const pdf = await pdfjs.getDocument({ data: pdfData }).promise

        if (cancelled) return

        setPageCount(pdf.numPages)

        const container = containerRef.current
        if (!container) return

        // Clear previous renders
        container.innerHTML = ""

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) break

          const page = await pdf.getPage(i)
          if (cancelled) break

          const unscaledViewport = page.getViewport({ scale: 1 })
          const scale = width / unscaledViewport.width
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement("canvas")
          const dpr = window.devicePixelRatio || 1
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = `${Math.floor(viewport.width)}px`
          canvas.style.height = `${Math.floor(viewport.height)}px`
          canvas.className = "block"

          const ctx = canvas.getContext("2d")
          if (!ctx) continue

          ctx.scale(dpr, dpr)

          await page.render({
            canvasContext: ctx,
            viewport,
            canvas,
          } as Parameters<typeof page.render>[0]).promise

          if (cancelled) break

          container.appendChild(canvas)
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[PdfCanvas] render error:", err)
          setError(true)
        }
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [url, width])

  if (error) {
    return (
      <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
        Failed to render PDF
      </div>
    )
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="flex flex-col" />
      {pageCount > 0 && (
        <div className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          {pageCount} {pageCount === 1 ? "page" : "pages"}
        </div>
      )}
    </div>
  )
})
