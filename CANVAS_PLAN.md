# Canvas Note Feature — Implementation Plan

## Overview

A hybrid canvas + document experience (like OneNote/GoodNotes) where markdown text and freeform drawing coexist on the same surface. Built on tldraw with custom text shapes powered by TipTap.

### Key Decisions
- **File format**: `.canvas.json` for now → `.openvlt` (ZIP) later
- **Canvas engine**: tldraw
- **Text input**: Model C — invisible text regions, borderless until selected
- **Note types**: Markdown (`.md`) and Canvas (`.canvas.json`) coexist
- **Input**: Apple Pencil/stylus = active tool, finger = pan/zoom
- **Ink rendering**: Custom high-DPI canvas layer (InkLayer) bypasses tldraw's blurry CSS transforms

---

## Phase 1: Minimal Working Canvas ✅

- [x] Install `@tldraw/tldraw`
- [x] DB migration v7: add `note_type` column to notes table
- [x] Update TypeScript types (`NoteType`, `noteType` on `NoteMetadata`)
- [x] Update `createNote()` to support `noteType` param and `.canvas.json` extension
- [x] Update `updateNoteContent()` to skip merge for canvas/excalidraw notes
- [x] Update `updateNoteTitle()` to preserve `.canvas.json` extension on rename
- [x] Update API route (`POST /api/notes`) to accept `noteType`
- [x] Create `canvas-editor.tsx` — tldraw canvas with auto-save (1s debounce)
- [x] Route canvas notes in `tab-panel.tsx` to `CanvasEditor`
- [x] Add "+Canvas" button in sidebar (`app-sidebar.tsx`)
- [x] Add "New canvas" to folder context menu (`sidebar-tree.tsx`)
- [x] Canvas-specific icon (`LayoutDashboardIcon`) in file tree
- [x] Disable tldraw's built-in text tool and double-click-to-create-text

## Phase 2: Text Blocks with Mini TipTap ✅

- [x] Custom tldraw shape: `text-note` — renders mini TipTap editor inside
- [x] Augment `TLGlobalShapePropsMap` to register custom shape type
- [x] Custom tool: `TextNoteTool` — click anywhere to create text block
- [x] Markdown support: headings, bold, italic, lists, blockquotes, code blocks
- [x] Model C behavior: invisible borders, blue highlight on edit
- [x] Double-click/double-tap on empty canvas creates text block
- [x] Empty text blocks auto-delete on edit end
- [x] Auto-resize text blocks based on content (line counting)
- [x] `immediatelyRender: false` to fix SSR hydration error
- [x] Text note style bar: font (draw/sans/serif/mono), size (S/M/L/XL), 13 colors
- [x] Style bar rendered outside tldraw (overlay) so button clicks work
- [x] Style bar updates live when changing properties
- [x] "Set as default" button with visual feedback — saves to localStorage
- [x] New text blocks use saved defaults

## Phase 3: Custom Canvas Toolbar ✅

- [x] Hide tldraw's default UI (`hideUi` prop)
- [x] Inline toolbar integrated into note header bar
- [x] Tools: Select, Hand, Pen, Eraser, Shapes (dropdown: rectangle/ellipse/triangle/line/arrow), Text, Undo/Redo
- [x] Shapes dropdown with active shape indicator
- [x] Style bar closes when switching away from select tool
- [x] Stroke style dropdown: size slider (S-XL) with preview, 13 colors, save as default
- [x] Note header actions collapsed into "..." dropdown menu
- [x] Pressure sensitivity toggle in pen settings
- [x] Collapsible toolbar (show/hide ribbon)
- [ ] Compact toolbar mode (smaller buttons)

## Phase 4: Pages and Backgrounds ✅

- [x] Page size system — constants for A4, Letter, Legal, infinite
- [x] Background pattern rendering: ruled lines (with red margin), grid, dot grid, blank
- [x] Custom canvas background component via tldraw Grid override
- [x] Page/background selector UI in toolbar (grid icon dropdown)
- [x] Dynamic page size switching per note
- [x] Free camera movement (no restrictive bounds)
- [x] Visual page boundary with white page + grey outside area
- [x] Multi-page support with "+" buttons between pages
- [x] Page mask overlay hides content drawn outside fixed-size pages
- [x] Light blue line color for iPad visibility
- [x] Wider left margin (60px) with red margin line like a notebook
- [x] Top margin (60px) for writing space
- [x] Settings saved to localStorage
- [x] Standard notebook rule sizes (college ruled, wide ruled, narrow, custom)
- [x] Custom line spacing option (slider 12–50px for custom rule style)

## Phase 5: Layers Panel

- [ ] Side panel listing all shapes sorted by z-index
- [ ] Drag to reorder layers
- [ ] Click to select shape from layer list
- [ ] Eye icon to toggle visibility per layer
- [ ] Uses tldraw's `editor.sendToBack()`, `editor.bringToFront()`, etc.
- [ ] Toggle button in toolbar to show/hide layer panel

## Phase 6: `.openvlt` ZIP Format ✅

- [x] Add `adm-zip` dependency for reading ZIP files, `archiver` for writing
- [x] Create `openvlt-file.ts` service:
  - `createOpenvltBuffer(canvasJson)` — create ZIP buffer
  - `readOpenvltFile(filePath)` — extract canvas JSON and text content
  - `writeOpenvltFile(filePath, canvasJson)` — atomic write ZIP
  - `extractTextFromCanvas(canvasJson)` — extract text from text-note shapes
- [x] Migrate note CRUD to use `.openvlt` files for canvas notes
- [x] Text extraction from text-note shapes into `content.md` inside ZIP
- [x] DB migration v10: convert existing `.canvas.json` → `.openvlt`
- [x] Update FTS index with extracted text content for search

## Phase 7: Stylus vs Finger Input ✅

- [x] Detect `pointerType` from native DOM `PointerEvent`
- [x] Finger = always pan (single finger) / pinch-to-zoom (two fingers)
- [x] Manual touch handling: block single-finger touch from tldraw, handle pan ourselves
- [x] Manual pinch-to-zoom with correct anchor point math
- [x] Fix zoom persistence (wide zoomSteps, always pass z to setCamera)
- [x] Block Safari gesture events to prevent double-zoom
- [x] AbortController prevents double event registration from React StrictMode
- [x] Pen/stylus = uses active tool (handwrite by default)
- [x] Double-tap detection for creating text blocks on touch
- [x] Tap outside text block to close/deselect
- [x] "Draw with finger" toggle option (when enabled, finger draws too)
- [x] Store preference in localStorage

## Phase 7.5: Custom Handwrite Tool ✅

- [x] Custom `handwrite` shape and tool — bypasses tldraw's stroke smoothing
- [x] Zero post-processing: raw pen input rendered as smooth bezier curves
- [x] Wet ink canvas overlay for instant real-time drawing (no React re-renders)
- [x] High-DPI InkLayer renders completed strokes at native screen resolution
- [x] Smooth quadratic bezier curves (Catmull-Rom style) during and after drawing
- [x] No flicker on pen lift (delayed wet ink clear)
- [x] Pressure-sensitive stroke width from Apple Pencil
- [x] Proper z-index layering: ink (1) < page mask (2) < add-page buttons (3)
- [ ] Fix text block rendering resolution (tldraw CSS transform limitation)
- [ ] Investigate rendering text blocks as HTML overlay for crisp text

## Phase 8: Snap-to-Shape + Lasso Select ✅

- [x] Shape recognition on stroke completion:
  - Detect approximate circles, rectangles, triangles, lines
  - Confidence threshold → replace freehand stroke with clean tldraw geo shape
- [x] Toggle snap-to-shape in toolbar/settings (stroke menu toggle)
- [x] Lasso select tool:
  - Draw freeform selection loop with dashed outline + blue fill
  - Select all shapes inside the lasso polygon (ray casting algorithm)
  - Works across all shape types (handwrite, text-note, geo, etc.)
- [x] Selected content can be moved, copied, resized, deleted as group (tldraw built-in)

## Phase 9: Eraser Modes ✅

- [x] Stroke eraser (tldraw built-in) — erases entire stroke on touch
- [x] Eraser preview: handwrite strokes turn grey at 30% opacity when eraser passes over
- [x] Pixel eraser (custom tool):
  - Eraser circle cursor with trail visualization
  - Finds handwrite strokes intersecting with eraser path
  - Splits affected strokes at erased sections into new shapes
  - Preserves remaining segments with original color/size/pressure
- [x] Eraser dropdown in toolbar to switch between stroke/pixel mode

## Phase 10: Version History for Canvas ✅

- [x] Canvas JSON snapshots in existing TimeMachine version system (already works via saveVersionGrouped)
- [x] Read-only canvas preview component (renders strokes, text, geo shapes on canvas element)
- [x] Auto-fit zoom to show all content with padding
- [x] Highlighter strokes render with correct opacity in preview
- [x] Shape count summary below preview (strokes, text blocks, shapes)
- [x] Integrated into TimeMachine panel — auto-detects canvas versions
- [x] Diff tab hidden for canvas notes (JSON diff not useful)
- [x] Restore button works (restores canvas JSON to current version)

---

## Known Limitations

- **Text block resolution**: Text inside tldraw shapes is rendered at CSS-transform resolution (can be blurry when zoomed in). Fixing requires rendering text as HTML overlay outside tldraw, which is a significant architectural change.
- **tldraw's minimum stroke width**: 2px (S size) is tldraw's hardcoded minimum. Thinner lines would require forking tldraw's STROKE_SIZES.

## Future Enhancements (Post-MVP)

- [ ] PDF export — render canvas as-is (drawings + text + layout)
- [ ] Markdown export — extract text, convert drawings to inline SVG/PNG
- [ ] XY/XYZ graph shape templates
- [ ] Highlighter pen tool
- [ ] Pencil (textured) pen tool
- [ ] Import Excalidraw notes into canvas system
- [ ] Collaboration / real-time sync for canvas notes
