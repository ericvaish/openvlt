"use client"

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { NodeSelection, Selection } from "@tiptap/pm/state"
import {
  getRowRects,
  getColRects,
  getDropIndex,
  executeRowMove,
  executeColMove,
  type Rect,
} from "@/lib/editor/table-reorder"

interface TableControlsOverlayProps {
  editor: Editor | null
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
}

const GRIP_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
  >
    <circle cx="8" cy="4" r="2" />
    <circle cx="16" cy="4" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="16" cy="12" r="2" />
    <circle cx="8" cy="20" r="2" />
    <circle cx="16" cy="20" r="2" />
  </svg>
)

const PLUS_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const GRID_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
)

/**
 * Renders add-row and add-column bars plus drag handles for reordering,
 * positioned as an overlay OUTSIDE the contenteditable.
 */
export function TableControlsOverlay({
  editor,
  scrollContainerRef,
}: TableControlsOverlayProps) {
  const [hoveredTable, setHoveredTable] =
    React.useState<HTMLTableElement | null>(null)
  const [pos, setPos] = React.useState<{
    rowTop: number
    rowLeft: number
    rowWidth: number
    colTop: number
    colLeft: number
    colHeight: number
    wrapperScrollLeft: number
    wrapperWidth: number
  } | null>(null)
  const [rowRects, setRowRects] = React.useState<Rect[]>([])
  const [colRects, setColRects] = React.useState<Rect[]>([])
  const [dragging, setDragging] = React.useState<{
    type: "row" | "col"
    index: number
    target: number
  } | null>(null)
  const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const draggingRef = React.useRef(dragging)
  draggingRef.current = dragging

  function cancelHide() {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  function scheduleHide() {
    if (draggingRef.current) return
    cancelHide()
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredTable(null)
      setPos(null)
      setRowRects([])
      setColRects([])
    }, 300)
  }

  function updatePos(table: HTMLTableElement) {
    const container = scrollContainerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const tableRect = table.getBoundingClientRect()

    const wrapper = table.closest(".tableWrapper") as HTMLElement | null
    const wrapperScrollLeft = wrapper?.scrollLeft ?? 0
    const wrapperRect = wrapper?.getBoundingClientRect()
    const wrapperWidth = wrapperRect?.width ?? containerRect.width

    const visibleLeft = Math.max(
      tableRect.left - containerRect.left,
      (wrapperRect?.left ?? 0) - containerRect.left
    )
    const visibleRight = Math.min(
      tableRect.right - containerRect.left,
      (wrapperRect?.right ?? containerRect.width) - containerRect.left
    )
    const visibleWidth = Math.max(0, visibleRight - visibleLeft)

    setPos({
      rowTop:
        tableRect.bottom - containerRect.top + container.scrollTop + 2,
      rowLeft: visibleLeft,
      rowWidth: visibleWidth,
      colTop: tableRect.top - containerRect.top + container.scrollTop,
      colLeft: Math.min(
        tableRect.right - containerRect.left + 2,
        (wrapperRect?.right ?? containerRect.width) - containerRect.left + 2
      ),
      colHeight: tableRect.height,
      wrapperScrollLeft,
      wrapperWidth,
    })

    setRowRects(getRowRects(table, containerRect, container.scrollTop))
    setColRects(getColRects(table, containerRect, container.scrollTop))
  }

  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    function handleMouseOver(e: MouseEvent) {
      if (draggingRef.current) return
      const target = e.target as HTMLElement
      const table = target.closest("table") as HTMLTableElement | null
      const onBar = target.closest("[data-table-bar]")

      if (table || onBar) cancelHide()
      if (table) {
        setHoveredTable(table)
        updatePos(table)
      }
    }

    function handleMouseOut(e: MouseEvent) {
      if (draggingRef.current) return
      const related = e.relatedTarget as HTMLElement | null
      const onTable = related?.closest("table")
      const onBar = related?.closest("[data-table-bar]")
      if (!onTable && !onBar) scheduleHide()
    }

    function handleScroll() {
      if (hoveredTable && document.contains(hoveredTable)) {
        updatePos(hoveredTable)
      }
    }

    function handleWrapperScroll(e: Event) {
      const target = e.target as HTMLElement
      if (
        target.classList.contains("tableWrapper") &&
        hoveredTable &&
        target.contains(hoveredTable)
      ) {
        updatePos(hoveredTable)
      }
    }

    container.addEventListener("mouseover", handleMouseOver)
    container.addEventListener("mouseout", handleMouseOut)
    container.addEventListener("scroll", handleScroll, { passive: true })
    container.addEventListener("scroll", handleWrapperScroll, {
      passive: true,
      capture: true,
    })

    return () => {
      container.removeEventListener("mouseover", handleMouseOver)
      container.removeEventListener("mouseout", handleMouseOut)
      container.removeEventListener("scroll", handleScroll)
      container.removeEventListener("scroll", handleWrapperScroll, {
        capture: true,
      })
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [scrollContainerRef, hoveredTable]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cell focus helper ──
  function focusCell(selector: string) {
    if (!editor || !hoveredTable) return
    const cell = hoveredTable.querySelector(selector)
    if (cell) {
      const view = editor.view
      const pos = view.posAtDOM(cell, 0)
      if (pos !== undefined) {
        view.dispatch(
          view.state.tr.setSelection(
            Selection.near(view.state.doc.resolve(pos))
          )
        )
      }
    }
  }

  // ── Table actions ──
  function handleSelectTable(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!editor || !hoveredTable) return
    const view = editor.view
    const p = view.posAtDOM(hoveredTable, 0)
    if (p == null) return
    const resolved = view.state.doc.resolve(p)
    for (let d = resolved.depth; d > 0; d--) {
      if (resolved.node(d).type.name === "table") {
        const tablePos = resolved.before(d)
        view.dispatch(
          view.state.tr.setSelection(
            NodeSelection.create(view.state.doc, tablePos)
          )
        )
        view.focus()
        return
      }
    }
  }

  function handleAddRow(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!editor) return
    focusCell("tr:last-child td, tr:last-child th")
    editor.chain().focus().addRowAfter().run()
    setTimeout(() => {
      if (hoveredTable && document.contains(hoveredTable))
        updatePos(hoveredTable)
    }, 50)
  }

  function handleAddCol(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!editor) return
    focusCell("tr:first-child th:last-child, tr:first-child td:last-child")
    editor.chain().focus().addColumnAfter().run()
    setTimeout(() => {
      if (hoveredTable && document.contains(hoveredTable))
        updatePos(hoveredTable)
    }, 50)
  }

  // ── Drag handlers ──
  function startDrag(
    e: React.MouseEvent,
    type: "row" | "col",
    index: number
  ) {
    e.preventDefault()
    e.stopPropagation()
    cancelHide()

    const container = scrollContainerRef.current
    if (!container) return

    setDragging({ type, index, target: index })
    document.body.style.cursor = "grabbing"

    const rects = type === "row" ? rowRects : colRects
    const axis = type === "row" ? "top" : "left"

    function onMouseMove(ev: MouseEvent) {
      const containerRect = container!.getBoundingClientRect()
      const scrollTop = container!.scrollTop
      const mousePos =
        type === "row"
          ? ev.clientY - containerRect.top + scrollTop
          : ev.clientX - containerRect.left
      const target = getDropIndex(mousePos, rects, axis)
      setDragging((prev) =>
        prev && prev.target !== target ? { ...prev, target } : prev
      )
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.body.style.cursor = ""

      const current = draggingRef.current
      if (current && current.index !== current.target && editor && hoveredTable) {
        if (current.type === "row") {
          executeRowMove(editor, hoveredTable, current.index, current.target)
        } else {
          executeColMove(editor, hoveredTable, current.index, current.target)
        }
        setTimeout(() => {
          if (hoveredTable && document.contains(hoveredTable))
            updatePos(hoveredTable)
        }, 50)
      }

      setDragging(null)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  if (!hoveredTable || !pos) return null

  const showDragHandles = !dragging

  return (
    <>
      {/* Select Table Grip */}
      <button
        data-table-bar="grip"
        className="table-select-grip"
        style={{
          position: "absolute",
          top: `${pos.colTop - 22}px`,
          left: `${pos.rowLeft - 2}px`,
        }}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        onMouseDown={handleSelectTable}
        title="Select table"
      >
        {GRID_ICON}
      </button>

      {/* Row drag handles */}
      {rowRects.map((rect) => (
        <button
          key={`row-drag-${rect.index}`}
          data-table-bar="drag"
          className={`table-drag-handle${showDragHandles ? " visible" : ""}`}
          style={{
            position: "absolute",
            top: `${rect.top + rect.height / 2 - 9}px`,
            left: `${rect.left - 22}px`,
          }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onMouseDown={(e) => startDrag(e, "row", rect.index)}
          title="Drag to reorder row"
        >
          {GRIP_ICON}
        </button>
      ))}

      {/* Column drag handles */}
      {colRects.map((rect) => (
        <button
          key={`col-drag-${rect.index}`}
          data-table-bar="drag"
          className={`table-drag-handle${showDragHandles ? " visible" : ""}`}
          style={{
            position: "absolute",
            top: `${rect.top - 22}px`,
            left: `${rect.left + rect.width / 2 - 9}px`,
          }}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onMouseDown={(e) => startDrag(e, "col", rect.index)}
          title="Drag to reorder column"
        >
          <span style={{ transform: "rotate(90deg)", display: "flex" }}>
            {GRIP_ICON}
          </span>
        </button>
      ))}

      {/* Drop indicator line */}
      {dragging && (() => {
        const rects = dragging.type === "row" ? rowRects : colRects
        const targetRect = rects[dragging.target]
        if (!targetRect) return null

        if (dragging.type === "row") {
          const y =
            dragging.target <= dragging.index
              ? targetRect.top
              : targetRect.top + targetRect.height
          return (
            <div
              className="table-drop-indicator"
              style={{
                position: "absolute",
                top: `${y - 1}px`,
                left: `${targetRect.left}px`,
                width: `${targetRect.width}px`,
                height: "2px",
              }}
            />
          )
        } else {
          const x =
            dragging.target <= dragging.index
              ? targetRect.left
              : targetRect.left + targetRect.width
          return (
            <div
              className="table-drop-indicator"
              style={{
                position: "absolute",
                top: `${targetRect.top}px`,
                left: `${x - 1}px`,
                width: "2px",
                height: `${targetRect.height}px`,
              }}
            />
          )
        }
      })()}

      {/* Source highlight */}
      {dragging && (() => {
        const rects = dragging.type === "row" ? rowRects : colRects
        const sourceRect = rects[dragging.index]
        if (!sourceRect) return null

        return (
          <div
            className="table-drag-highlight"
            style={{
              position: "absolute",
              top: `${sourceRect.top}px`,
              left: `${sourceRect.left}px`,
              width: `${sourceRect.width}px`,
              height: `${sourceRect.height}px`,
            }}
          />
        )
      })()}

      {/* Add Row Bar */}
      <button
        data-table-bar="row"
        className="table-add-row-bar"
        style={{
          position: "absolute",
          top: `${pos.rowTop}px`,
          left: `${pos.rowLeft}px`,
          width: `${pos.rowWidth}px`,
        }}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        onMouseDown={handleAddRow}
        title="Add row"
      >
        {PLUS_ICON}
      </button>

      {/* Add Column Bar */}
      <button
        data-table-bar="col"
        className="table-add-col-bar"
        style={{
          position: "absolute",
          top: `${pos.colTop}px`,
          left: `${pos.colLeft}px`,
          height: `${pos.colHeight}px`,
        }}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        onMouseDown={handleAddCol}
        title="Add column"
      >
        {PLUS_ICON}
      </button>
    </>
  )
}
