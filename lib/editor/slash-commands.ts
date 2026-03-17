import { Extension } from "@tiptap/core"
import { Suggestion } from "@tiptap/suggestion"
import type { Editor, Range } from "@tiptap/core"
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
} from "@tiptap/suggestion"
import tippy, { type Instance as TippyInstance } from "tippy.js"
import { parseEmbedUrl } from "@/lib/editor/embed-block"

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  command: (editor: Editor, range: Range) => void
}

const COMMANDS: SlashCommandItem[] = [
  {
    title: "Heading 1",
    description: "Large heading",
    icon: "H1",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    icon: "H2",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    icon: "H3",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: "•",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: "1.",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: "Task List",
    description: "Checklist with checkboxes",
    icon: "☑",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: "Blockquote",
    description: "Quote block",
    icon: "❝",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: "Code Block",
    description: "Syntax-highlighted code",
    icon: "<>",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: "Table",
    description: "Insert a table",
    icon: "⊞",
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
  {
    title: "Horizontal Rule",
    description: "Divider line",
    icon: "—",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: "Callout: Note",
    description: "Blue info callout",
    icon: "ℹ",
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCallout({ type: "note" })
        .run()
    },
  },
  {
    title: "Callout: Tip",
    description: "Green tip callout",
    icon: "💡",
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCallout({ type: "tip" })
        .run()
    },
  },
  {
    title: "Callout: Warning",
    description: "Yellow warning callout",
    icon: "⚠",
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCallout({ type: "warning" })
        .run()
    },
  },
  {
    title: "Callout: Danger",
    description: "Red danger callout",
    icon: "🚫",
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setCallout({ type: "danger" })
        .run()
    },
  },
  {
    title: "Toggle Block",
    description: "Collapsible content",
    icon: "▶",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setToggleBlock().run()
    },
  },
  {
    title: "Embed",
    description: "YouTube, tweet, or webpage",
    icon: "🔗",
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).run()
      const url = window.prompt("Paste a URL to embed (YouTube, Twitter/X, etc.)")
      if (!url) return
      const embed = parseEmbedUrl(url)
      if (embed) {
        ;(editor.commands as any).setEmbed({
          src: embed.embedUrl,
          embedType: embed.type,
          originalUrl: embed.originalUrl,
        })
      } else {
        // Fallback: generic iframe
        ;(editor.commands as any).setEmbed({
          src: url,
          embedType: "iframe",
          originalUrl: url,
        })
      }
    },
  },
]

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: SlashCommandItem
        }) => {
          props.command(editor, range)
        },
        items: ({ query }: { query: string }): SlashCommandItem[] => {
          return COMMANDS.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase())
          ).slice(0, 10)
        },
        render: () => {
          let popup: TippyInstance | undefined
          let container: HTMLDivElement | undefined
          let selectedIndex = 0
          let items: SlashCommandItem[] = []

          function renderItems() {
            if (!container) return
            container.innerHTML = ""
            items.forEach((item, index) => {
              const el = document.createElement("button")
              el.className = `slash-command-item ${index === selectedIndex ? "is-selected" : ""}`
              el.innerHTML = `
                <span class="slash-command-icon">${item.icon}</span>
                <span class="slash-command-text">
                  <span class="slash-command-title">${item.title}</span>
                  <span class="slash-command-description">${item.description}</span>
                </span>
              `
              el.addEventListener("click", () => {
                selectItem(index)
              })
              container!.appendChild(el)
            })
          }

          let commandFn: ((props: SlashCommandItem) => void) | null = null

          function selectItem(index: number) {
            const item = items[index]
            if (item && commandFn) {
              commandFn(item)
            }
          }

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              container = document.createElement("div")
              container.className = "slash-command-list"
              items = props.items
              commandFn = props.command
              selectedIndex = 0
              renderItems()

              popup = tippy(document.body, {
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
                appendTo: () => document.body,
                content: container,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              })
            },

            onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
              items = props.items
              commandFn = props.command
              selectedIndex = 0
              renderItems()

              popup?.setProps({
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
              })
            },

            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "ArrowUp") {
                selectedIndex =
                  (selectedIndex - 1 + items.length) % items.length
                renderItems()
                return true
              }
              if (props.event.key === "ArrowDown") {
                selectedIndex = (selectedIndex + 1) % items.length
                renderItems()
                return true
              }
              if (props.event.key === "Enter") {
                selectItem(selectedIndex)
                return true
              }
              if (props.event.key === "Escape") {
                popup?.hide()
                return true
              }
              return false
            },

            onExit: () => {
              popup?.destroy()
              container?.remove()
            },
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
