"use client"

import * as React from "react"
import { DownloadIcon, ExternalLinkIcon, FileIcon, LoaderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

function getMimeFromName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }
  return map[ext] || "application/octet-stream"
}

/** Fetch a file as a blob and return an object URL. Avoids X-Frame-Options and Content-Disposition issues. */
function useBlobUrl(apiUrl: string, overrideMime?: string) {
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let revoke: string | null = null
    setLoading(true)
    setError(false)

    fetch(apiUrl)
      .then((r) => {
        if (!r.ok) throw new Error("Not found")
        return r.blob()
      })
      .then((blob) => {
        // Override MIME if the API returns application/octet-stream for security reasons
        const finalBlob = overrideMime ? new Blob([blob], { type: overrideMime }) : blob
        revoke = URL.createObjectURL(finalBlob)
        setBlobUrl(revoke)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [apiUrl, overrideMime])

  return { blobUrl, loading, error }
}

export function FileViewer({
  attachmentId,
  fileName,
}: {
  attachmentId: string
  fileName: string
}) {
  const url = `/api/attachments/${attachmentId}`
  const mime = getMimeFromName(fileName)

  const isImage = mime.startsWith("image/")
  const isPdf = mime === "application/pdf"
  const isVideo = mime.startsWith("video/")
  const isAudio = mime.startsWith("audio/")
  const isText =
    mime.startsWith("text/") || mime === "application/json"

  function handleDownload() {
    const a = document.createElement("a")
    a.href = url
    a.download = fileName
    a.click()
  }

  function handleOpenExternal() {
    window.open(url, "_blank")
  }

  const toolbar = (
    <div className="flex h-10 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-2 text-sm">
        <FileIcon className="size-4 text-muted-foreground" />
        <span className="font-medium">{fileName}</span>
        <span className="text-xs text-muted-foreground">{mime}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={handleOpenExternal}>
          <ExternalLinkIcon className="mr-1.5 size-3.5" />
          Open
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDownload}>
          <DownloadIcon className="mr-1.5 size-3.5" />
          Download
        </Button>
      </div>
    </div>
  )

  if (isImage) return <BlobImageViewer url={url} fileName={fileName} toolbar={toolbar} mime={mime} />
  if (isPdf) return <BlobPdfViewer url={url} fileName={fileName} toolbar={toolbar} />
  if (isVideo) {
    return (
      <div className="flex h-full flex-col">
        {toolbar}
        <div className="flex flex-1 items-center justify-center bg-muted/30 p-8">
          <video src={url} controls className="max-h-full max-w-full rounded-md shadow-lg" />
        </div>
      </div>
    )
  }
  if (isAudio) {
    return (
      <div className="flex h-full flex-col">
        {toolbar}
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <audio src={url} controls className="w-full max-w-md" />
        </div>
      </div>
    )
  }
  if (isText) {
    return (
      <div className="flex h-full flex-col">
        {toolbar}
        <TextPreview url={url} />
      </div>
    )
  }

  // Fallback
  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-muted/30">
        <FileIcon className="size-16 text-muted-foreground/30" />
        <div className="text-center">
          <p className="text-sm font-medium">Cannot preview this file</p>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleOpenExternal}>
            <ExternalLinkIcon className="mr-1.5 size-3.5" />
            Open in browser
          </Button>
          <Button size="sm" onClick={handleDownload}>
            <DownloadIcon className="mr-1.5 size-3.5" />
            Download
          </Button>
        </div>
      </div>
    </div>
  )
}

function BlobImageViewer({ url, fileName, toolbar, mime }: { url: string; fileName: string; toolbar: React.ReactNode; mime: string }) {
  const { blobUrl, loading, error } = useBlobUrl(url, mime)

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-8">
        {loading ? (
          <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">Failed to load image</p>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={blobUrl!}
            alt={fileName}
            className="max-h-full max-w-full rounded-md object-contain shadow-lg"
          />
        )}
      </div>
    </div>
  )
}

function BlobPdfViewer({ url, fileName, toolbar }: { url: string; fileName: string; toolbar: React.ReactNode }) {
  const { blobUrl, loading, error } = useBlobUrl(url)

  return (
    <div className="flex h-full flex-col">
      {toolbar}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Failed to load PDF</p>
        </div>
      ) : (
        <iframe
          src={blobUrl!}
          className="flex-1 border-0"
          title={fileName}
        />
      )}
    </div>
  )
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText("Failed to load file"))
  }, [url])

  return (
    <pre className="flex-1 overflow-auto bg-muted/30 p-6 font-mono text-sm">
      {text ?? "Loading..."}
    </pre>
  )
}
