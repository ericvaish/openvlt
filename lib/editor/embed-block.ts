import { Node, mergeAttributes, type Commands, type RawCommands } from "@tiptap/core"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embedBlock: {
      setEmbed: (attrs: {
        src: string
        embedType?: EmbedType
        originalUrl?: string
      }) => ReturnType
    }
  }
}

export type EmbedType = "youtube" | "twitter" | "iframe"

interface EmbedInfo {
  type: EmbedType
  embedUrl: string
  originalUrl: string
}

/**
 * Parses a URL and returns embed info if it's a recognized embed type.
 */
export function parseEmbedUrl(url: string): EmbedInfo | null {
  // YouTube
  const ytMatch =
    url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/
    ) ??
    url.match(/youtube\.com\/shorts\/([\w-]+)/)
  if (ytMatch) {
    return {
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
      originalUrl: url,
    }
  }

  // Twitter / X
  const tweetMatch = url.match(
    /(?:twitter\.com|x\.com)\/([\w]+)\/status\/(\d+)/
  )
  if (tweetMatch) {
    return {
      type: "twitter",
      embedUrl: url,
      originalUrl: url,
    }
  }

  // Generic URL with embeddable extension or iframe-compatible URL
  if (
    url.startsWith("https://") &&
    (url.includes("codepen.io") ||
      url.includes("codesandbox.io") ||
      url.includes("figma.com") ||
      url.includes("loom.com") ||
      url.includes("vimeo.com") ||
      url.includes("spotify.com") ||
      url.includes("soundcloud.com") ||
      url.includes("google.com/maps"))
  ) {
    return {
      type: "iframe",
      embedUrl: url,
      originalUrl: url,
    }
  }

  return null
}

export const EmbedBlock = Node.create({
  name: "embedBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      embedType: { default: "iframe" as EmbedType },
      originalUrl: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-embed-block]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-embed-block": "" }),
    ]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const url = node.attrs.originalUrl || node.attrs.src
          state.write(`@[embed](${url})\n\n`)
        },
        parse: {
          setup(markdownit: any) {
            // Custom markdown-it rule for @[embed](url)
            markdownit.inline.ruler.after("image", "embed_block", (state: any, silent: boolean) => {
              const start = state.pos
              if (
                state.src.charCodeAt(start) !== 0x40 /* @ */ ||
                state.src.charCodeAt(start + 1) !== 0x5b /* [ */
              ) {
                return false
              }

              const labelEnd = state.src.indexOf("](", start + 2)
              if (labelEnd === -1) return false

              const urlStart = labelEnd + 2
              const urlEnd = state.src.indexOf(")", urlStart)
              if (urlEnd === -1) return false

              if (!silent) {
                const url = state.src.slice(urlStart, urlEnd)
                const token = state.push("embed_block", "", 0)
                token.attrs = [["src", url]]
                token.content = url
              }

              state.pos = urlEnd + 1
              return true
            })
          },
          updateProseMirrorPlugins: (plugins: any[]) => plugins,
        },
      },
    }
  },

  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const wrapper = document.createElement("div")
      wrapper.setAttribute("data-embed-block", "")
      wrapper.className =
        "embed-block my-4 rounded-lg border bg-muted/30 overflow-hidden"

      const embedType = node.attrs.embedType as EmbedType
      const src = node.attrs.src as string
      const originalUrl = node.attrs.originalUrl as string

      if (embedType === "youtube") {
        const iframe = document.createElement("iframe")
        iframe.src = src
        iframe.className = "w-full aspect-video"
        iframe.setAttribute("allowfullscreen", "true")
        iframe.setAttribute("frameborder", "0")
        iframe.setAttribute(
          "allow",
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        )
        wrapper.appendChild(iframe)
      } else if (embedType === "twitter") {
        // Twitter embed via blockquote + script
        const container = document.createElement("div")
        container.className = "p-4"
        const blockquote = document.createElement("blockquote")
        blockquote.className = "twitter-tweet"
        blockquote.setAttribute("data-theme", "dark")
        const link = document.createElement("a")
        link.href = originalUrl || src
        link.textContent = "Loading tweet..."
        blockquote.appendChild(link)
        container.appendChild(blockquote)
        wrapper.appendChild(container)

        // Load Twitter widget script
        if (!document.querySelector('script[src*="platform.twitter.com"]')) {
          const script = document.createElement("script")
          script.src = "https://platform.twitter.com/widgets.js"
          script.async = true
          document.head.appendChild(script)
        } else if ((window as any).twttr?.widgets) {
          setTimeout(() => {
            ;(window as any).twttr.widgets.load(container)
          }, 0)
        }
      } else {
        // Generic iframe embed
        const iframe = document.createElement("iframe")
        iframe.src = src
        iframe.className = "w-full min-h-[400px]"
        iframe.setAttribute("frameborder", "0")
        iframe.setAttribute("allowfullscreen", "true")
        wrapper.appendChild(iframe)
      }

      // URL footer
      const footer = document.createElement("div")
      footer.className = "flex items-center gap-2 border-t px-3 py-1.5"
      const urlText = document.createElement("a")
      urlText.href = originalUrl || src
      urlText.target = "_blank"
      urlText.rel = "noopener noreferrer"
      urlText.className =
        "truncate text-xs text-muted-foreground hover:text-foreground"
      urlText.textContent = originalUrl || src
      footer.appendChild(urlText)
      wrapper.appendChild(footer)

      return {
        dom: wrapper,
      }
    }
  },

  addCommands() {
    return {
      setEmbed:
        (attrs: { src: string; embedType?: EmbedType; originalUrl?: string }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              embedType: attrs.embedType || "iframe",
              originalUrl: attrs.originalUrl || attrs.src,
            },
          })
        },
    }
  },
})
