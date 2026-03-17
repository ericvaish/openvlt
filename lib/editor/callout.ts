import { Node, mergeAttributes } from "@tiptap/core"

export interface CalloutOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { type?: string }) => ReturnType
      toggleCallout: (attrs?: { type?: string }) => ReturnType
      unsetCallout: () => ReturnType
    }
  }
}

const CALLOUT_TYPES = [
  "note",
  "tip",
  "warning",
  "danger",
  "info",
  "success",
  "caution",
  "important",
  "abstract",
  "todo",
  "example",
  "quote",
  "bug",
  "faq",
  "question",
]

const CALLOUT_REGEX = /^\[!(\w+)\]\s*/i

export const Callout = Node.create<CalloutOptions>({
  name: "callout",

  group: "block",

  content: "block+",

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      type: {
        default: "note",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-callout-type") || "note",
        renderHTML: (attributes: Record<string, string>) => ({
          "data-callout-type": attributes.type,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-callout": "",
        class: `callout callout-${HTMLAttributes["data-callout-type"] || "note"}`,
      }),
      0,
    ]
  },

  renderMarkdown: (node: any, helpers: any) => {
    const type = (node.attrs?.type || "note").toUpperCase()
    const inner = node.content ? helpers.renderChildren(node.content, "\n") : ""
    const lines = inner.split("\n")
    const quoted = lines.map((l: string) => `> ${l}`).join("\n")
    return `> [!${type}]\n${quoted}\n`
  },

  markdownTokenizer: {
    name: "callout",
    level: "block" as const,
    start(src: string) {
      const match = src.match(/^>\s*\[!\w+\]/m)
      return match ? (match.index ?? -1) : -1
    },
    tokenize(src: string, _tokens: any, lexer: any) {
      // Match a blockquote that starts with > [!TYPE]
      const lines = src.split("\n")
      const firstLine = lines[0]
      const typeMatch = firstLine.match(/^>\s*\[!(\w+)\]\s*$/)
      if (!typeMatch) return undefined

      const calloutType = typeMatch[1].toLowerCase()

      // Collect all subsequent ">" lines
      let i = 1
      while (i < lines.length && /^>/.test(lines[i])) {
        i++
      }

      const raw = lines.slice(0, i).join("\n")
      // Strip the leading "> " from content lines (skip the first [!TYPE] line)
      const contentLines = lines.slice(1, i).map((l: string) => l.replace(/^>\s?/, ""))
      const innerContent = contentLines.join("\n").trim()

      return {
        type: "callout",
        raw: raw + (i < lines.length ? "" : ""),
        calloutType,
        tokens: lexer.blockTokens(innerContent),
      }
    },
  },

  parseMarkdown: (token: any, helpers: any) => {
    return helpers.createNode(
      "callout",
      { type: token.calloutType || "note" },
      helpers.parseChildren(token.tokens || [])
    )
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attrs)
        },
      toggleCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attrs)
        },
      unsetCallout:
        () =>
        ({ commands }) => {
          return commands.lift(this.name)
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-c": () => this.editor.commands.toggleCallout(),
    }
  },
})
