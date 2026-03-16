import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

const activeNodePluginKey = new PluginKey("activeNodeReveal")

export const ActiveNodeReveal = Extension.create({
  name: "activeNodeReveal",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: activeNodePluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr) {
            const { selection } = tr
            const { $from } = selection

            const decorations: Decoration[] = []

            // Handle NodeSelection for leaf nodes (e.g. horizontal rule)
            if (selection instanceof NodeSelection) {
              const node = selection.node
              if (node.type.name === "horizontalRule") {
                const pos = $from.pos
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "is-active-node",
                    "data-active": "true",
                    "data-type": "horizontalRule",
                  })
                )
              }
            }

            const depth = $from.depth
            if (depth === 0 && decorations.length === 0)
              return DecorationSet.empty

            // Walk up the node tree to find all relevant ancestors
            for (let d = depth; d >= 1; d--) {
              const node = $from.node(d)
              const pos = $from.before(d)
              const nodeType = node.type.name

              if (nodeType === "heading") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "is-active-node",
                    "data-active": "true",
                    "data-level": String(node.attrs.level),
                  })
                )
              }

              if (nodeType === "blockquote") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "is-active-node",
                    "data-active": "true",
                    "data-type": "blockquote",
                  })
                )
              }

              if (nodeType === "callout") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "is-active-node",
                    "data-active": "true",
                    "data-type": "callout",
                    "data-callout-type": node.attrs.type || "note",
                  })
                )
              }

              if (nodeType === "codeBlock") {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: "is-active-node",
                    "data-active": "true",
                    "data-type": "codeBlock",
                    "data-language": node.attrs.language || "",
                  })
                )
              }
            }

            if (decorations.length === 0) return DecorationSet.empty
            return DecorationSet.create(tr.doc, decorations)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
