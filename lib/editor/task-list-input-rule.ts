import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

/**
 * When the user types `[ ] ` or `[x] ` inside a bullet list item,
 * delete the typed text and use the editor command to toggle to a task list.
 */
export const TaskListInputRule = Extension.create({
  name: "taskListInputRule",

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey("taskListInputRule"),
        props: {
          handleTextInput(view, from, to, text) {
            // We want to catch the space after `[ ]` or `[x]`
            if (text !== " ") return false

            const { state } = view
            const $from = state.doc.resolve(from)

            // Must be inside a listItem > bulletList
            if ($from.depth < 2) return false
            const parent = $from.node($from.depth - 1)
            const grandparent = $from.node($from.depth - 2)
            if (parent?.type.name !== "listItem") return false
            if (grandparent?.type.name !== "bulletList") return false

            // Check text before cursor in this text block
            const textBlock = $from.parent
            const textBefore =
              textBlock.textBetween(0, $from.parentOffset, undefined, "\ufffc")

            const match = textBefore.match(/^\[([xX ])?\]$/)
            if (!match) return false

            const checked = match[1]?.toLowerCase() === "x"

            // Prevent the space from being inserted
            // Delete the `[ ]` or `[x]` text, then toggle to task list
            const deleteFrom = from - textBefore.length
            const tr = state.tr.delete(deleteFrom, to)
            view.dispatch(tr)

            // Use editor command to convert to task list
            editor.chain().focus().toggleTaskList().run()

            // If checked, set the checked attribute
            if (checked) {
              const pos = editor.state.selection.$from
              const taskItem = pos.node(pos.depth - 1)
              if (taskItem?.type.name === "taskItem") {
                editor
                  .chain()
                  .focus()
                  .updateAttributes("taskItem", { checked: true })
                  .run()
              }
            }

            return true
          },
        },
      }),
    ]
  },
})
