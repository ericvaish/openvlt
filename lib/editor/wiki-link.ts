import { Node, mergeAttributes } from "@tiptap/core"
import { Suggestion } from "@tiptap/suggestion"
import type { Editor, Range } from "@tiptap/core"
import type {
  SuggestionProps,
  SuggestionKeyDownProps,
} from "@tiptap/suggestion"
import tippy, { type Instance as TippyInstance } from "tippy.js"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export interface WikiLinkSuggestionItem {
  id: string
  title: string
}

const wikiLinkPluginKey = new PluginKey("wikiLinkReveal")

/**
 * Custom suggestion match function that triggers on `[[` followed by query text.
 * Returns the match info that @tiptap/suggestion expects.
 */
function findWikiLinkSuggestionMatch(_config: {
  char: string
  allowSpaces: boolean
}) {
  return ({ $position }: { $position: any }) => {
    const nodeBefore = $position.nodeBefore
    const text = nodeBefore?.isText && nodeBefore.text
    if (!text) return null

    const textBeforeCursor = text
    const triggerIndex = textBeforeCursor.lastIndexOf("[[")

    if (triggerIndex === -1) return null

    // Make sure there's no `]]` between the trigger and cursor
    const textAfterTrigger = textBeforeCursor.slice(triggerIndex + 2)
    if (textAfterTrigger.includes("]]")) return null

    const query = textAfterTrigger

    // Calculate absolute positions
    const textFrom = $position.pos - text.length
    const from = textFrom + triggerIndex
    const to = $position.pos

    return {
      range: { from, to },
      query,
      text: `[[${query}`,
    }
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

export const WikiLink = Node.create({
  name: "wikiLink",

  group: "inline",

  inline: true,

  atom: true,

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-wiki-link") || "",
        renderHTML: (attributes: Record<string, string>) => ({
          "data-wiki-link": attributes.title,
        }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wiki-link]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "wiki-link",
      }),
      HTMLAttributes["data-wiki-link"] || "",
    ]
  },

  renderMarkdown: (node: any) => {
    const title = node.attrs?.title || ""
    return `[[${title}]]`
  },

  markdownTokenizer: {
    name: "wikiLink",
    level: "inline" as const,
    start(src: string) {
      const index = src.indexOf("[[")
      return index !== -1 ? index : -1
    },
    tokenize(src: string) {
      const match = src.match(/^\[\[([^\]\n]+)\]\]/)
      if (!match) return undefined
      return {
        type: "wikiLink",
        raw: match[0],
        title: match[1],
        text: match[1],
      }
    },
  },

  parseMarkdown: (token: any, helpers: any) => {
    return helpers.createNode("wikiLink", { title: token.title || "" })
  },

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      // NodeView-like reveal: show [[title]] when selected
      new Plugin({
        key: wikiLinkPluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr) {
            const { selection } = tr
            const decorations: Decoration[] = []

            tr.doc.descendants((node, pos) => {
              if (node.type.name !== "wikiLink") return

              const nodeFrom = pos
              const nodeTo = pos + node.nodeSize
              const isSelected =
                selection.from >= nodeFrom && selection.to <= nodeTo

              if (isSelected) {
                decorations.push(
                  Decoration.node(nodeFrom, nodeTo, {
                    class: "wiki-link ProseMirror-selectednode",
                    "data-wiki-active": "true",
                  })
                )
              }
            })

            if (decorations.length === 0) return DecorationSet.empty
            return DecorationSet.create(tr.doc, decorations)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty
          },
          handleClick(view, pos, event) {
            // Only navigate on Cmd/Ctrl+click (like regular links)
            if (!(event.metaKey || event.ctrlKey)) return false

            const $pos = view.state.doc.resolve(pos)
            const node =
              $pos.nodeAfter?.type.name === "wikiLink"
                ? $pos.nodeAfter
                : $pos.nodeBefore?.type.name === "wikiLink"
                  ? $pos.nodeBefore
                  : null

            if (node) {
              const title = node.attrs.title
              if (title) {
                window.dispatchEvent(
                  new CustomEvent("openvlt:wiki-link-click", {
                    detail: { title },
                  })
                )
              }
              return true
            }
            return false
          },
        },
      }),
      // Suggestion plugin for [[query autocomplete
      Suggestion({
        editor,
        char: "[[",
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        findSuggestionMatch: findWikiLinkSuggestionMatch({
          char: "[[",
          allowSpaces: true,
        }),
        items: async ({
          query,
        }: {
          query: string
        }): Promise<WikiLinkSuggestionItem[]> => {
          if (!query || query.length < 1) return []

          return new Promise((resolve) => {
            if (debounceTimer) clearTimeout(debounceTimer)
            debounceTimer = setTimeout(async () => {
              try {
                const res = await fetch(
                  `/api/notes/search-titles?q=${encodeURIComponent(query)}`
                )
                if (res.ok) {
                  const data = await res.json()
                  resolve(data.results ?? data ?? [])
                } else {
                  resolve([])
                }
              } catch {
                resolve([])
              }
            }, 150)
          })
        },
        command: ({
          editor: ed,
          range,
          props,
        }: {
          editor: Editor
          range: Range
          props: WikiLinkSuggestionItem
        }) => {
          ed.chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "wikiLink",
              attrs: { title: props.title },
            })
            .run()
        },
        render: () => {
          let popup: TippyInstance | undefined
          let container: HTMLDivElement | undefined
          let selectedIndex = 0
          let items: WikiLinkSuggestionItem[] = []

          function renderItems() {
            if (!container) return
            container.innerHTML = ""

            if (items.length === 0) {
              const empty = document.createElement("div")
              empty.className = "wiki-link-item wiki-link-empty"
              empty.textContent = "No matches"
              container.appendChild(empty)
              return
            }

            items.forEach((item, index) => {
              const el = document.createElement("button")
              el.className = `wiki-link-item ${index === selectedIndex ? "is-selected" : ""}`
              el.innerHTML = `<span class="wiki-link-item-title">${item.title}</span>`
              el.addEventListener("click", () => {
                selectItem(index)
              })
              container!.appendChild(el)
            })
          }

          let commandFn: ((props: WikiLinkSuggestionItem) => void) | null = null

          function selectItem(index: number) {
            const item = items[index]
            if (item && commandFn) {
              commandFn(item)
            }
          }

          return {
            onStart: (props: SuggestionProps<WikiLinkSuggestionItem>) => {
              container = document.createElement("div")
              container.className = "wiki-link-list"
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

            onUpdate: (props: SuggestionProps<WikiLinkSuggestionItem>) => {
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
      }),
    ]
  },
})
