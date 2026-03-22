import type { Editor } from "@tiptap/core"
import { Selection } from "@tiptap/pm/state"
import { moveTableRow, moveTableColumn } from "@tiptap/pm/tables"

export interface Rect {
  index: number
  top: number
  left: number
  width: number
  height: number
}

/** Get bounding rects for each row, relative to the scroll container. */
export function getRowRects(
  table: HTMLTableElement,
  containerRect: DOMRect,
  scrollTop: number
): Rect[] {
  const rows = table.querySelectorAll("tr")
  const rects: Rect[] = []
  rows.forEach((row, i) => {
    const r = row.getBoundingClientRect()
    rects.push({
      index: i,
      top: r.top - containerRect.top + scrollTop,
      left: r.left - containerRect.left,
      width: r.width,
      height: r.height,
    })
  })
  return rects
}

/** Get bounding rects for each column, derived from first row cells. */
export function getColRects(
  table: HTMLTableElement,
  containerRect: DOMRect,
  scrollTop: number
): Rect[] {
  const firstRow = table.querySelector("tr")
  if (!firstRow) return []
  const cells = firstRow.querySelectorAll("th, td")
  const tableRect = table.getBoundingClientRect()
  const rects: Rect[] = []
  cells.forEach((cell, i) => {
    const r = cell.getBoundingClientRect()
    rects.push({
      index: i,
      top: tableRect.top - containerRect.top + scrollTop,
      left: r.left - containerRect.left,
      width: r.width,
      height: tableRect.height,
    })
  })
  return rects
}

/**
 * Given mouse position along the drag axis, determine the drop index.
 * Returns the index where the dragged item should end up.
 */
export function getDropIndex(
  mousePos: number,
  rects: Rect[],
  axis: "top" | "left"
): number {
  const sizeKey = axis === "top" ? "height" : "width"
  for (let i = 0; i < rects.length; i++) {
    const mid = rects[i][axis] + rects[i][sizeKey] / 2
    if (mousePos < mid) return i
  }
  return rects.length - 1
}

/** Focus a cell inside the table so prosemirror-tables commands work. */
function focusTableCell(editor: Editor, table: HTMLTableElement) {
  const cell = table.querySelector("td, th")
  if (!cell) return
  const pos = editor.view.posAtDOM(cell, 0)
  if (pos != null) {
    editor.view.dispatch(
      editor.view.state.tr.setSelection(
        Selection.near(editor.view.state.doc.resolve(pos))
      )
    )
  }
}

/** Find the ProseMirror position of the table node. */
function getTablePos(
  editor: Editor,
  table: HTMLTableElement
): number | null {
  const pos = editor.view.posAtDOM(table, 0)
  if (pos == null) return null
  const resolved = editor.view.state.doc.resolve(pos)
  for (let d = resolved.depth; d > 0; d--) {
    if (resolved.node(d).type.name === "table") {
      return resolved.before(d)
    }
  }
  return null
}

/** Move a table row from one index to another. */
export function executeRowMove(
  editor: Editor,
  table: HTMLTableElement,
  from: number,
  to: number
): boolean {
  focusTableCell(editor, table)
  const tablePos = getTablePos(editor, table)
  if (tablePos == null) return false
  return moveTableRow({ from, to, select: true, pos: tablePos })(
    editor.view.state,
    editor.view.dispatch
  )
}

/** Move a table column from one index to another. */
export function executeColMove(
  editor: Editor,
  table: HTMLTableElement,
  from: number,
  to: number
): boolean {
  focusTableCell(editor, table)
  const tablePos = getTablePos(editor, table)
  if (tablePos == null) return false
  return moveTableColumn({ from, to, select: true, pos: tablePos })(
    editor.view.state,
    editor.view.dispatch
  )
}
