# Canvas Note Feature — Implementation Plan

## Overview

A hybrid canvas + document experience (like OneNote/GoodNotes) where markdown text and freeform drawing coexist on the same surface. Built on tldraw with custom text shapes powered by TipTap.

### Key Decisions
- **File format**: `.openvlt` (ZIP containing document.json, settings.json, content.md, manifest.json)
- **Canvas engine**: tldraw
- **Text input**: Model C — invisible text regions, borderless until selected
- **Note types**: Markdown (`.md`) and Canvas (`.openvlt`) coexist
- **Input**: Apple Pencil/stylus = active tool, finger = pan/zoom
- **Ink rendering**: tldraw-native SVG rendering (migrated from custom InkLayer canvas in Phase 11)

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
- [x] Tools: Select, Hand, Lasso, Pen presets, Eraser (stroke/pixel), Shapes, Text, Undo/Redo
- [x] Shapes dropdown (single tap opens menu)
- [x] Eraser dropdown (double tap to switch stroke/pixel mode)
- [x] Note header actions collapsed into "..." dropdown menu for canvas notes
- [x] Pressure sensitivity toggle in page settings
- [x] Draw with finger toggle in page settings
- [x] Snap-to-shape toggle in page settings
- [ ] Compact toolbar mode (smaller buttons)

## Phase 4: Pages and Backgrounds ✅

- [x] Page size system — constants for A4, Letter, Legal, infinite
- [x] Background pattern rendering: ruled lines (with red margin), grid, dot grid, blank
- [x] Custom canvas background component via tldraw Grid override
- [x] Page/background selector UI in toolbar (grid icon dropdown)
- [x] Dynamic page size switching per note
- [x] Free camera movement (no restrictive bounds)
- [x] Visual page boundary with white page + grey outside area
- [x] Multi-page support with "+" buttons between pages (inserts page at position, shifts shapes)
- [x] Page mask overlay hides content drawn outside fixed-size pages
- [x] Light blue line color for iPad visibility
- [x] Wider left margin (60px) with red margin line like a notebook
- [x] Top margin (60px) for writing space
- [x] Settings saved to localStorage and synced via document JSON
- [x] Standard notebook rule sizes (college ruled, wide ruled, narrow, custom)
- [x] Custom line spacing option (slider 12–50px for custom rule style)
- [x] Clear page and delete page buttons with confirmation dialogs
- [x] Page gap overlay clamp fix (no longer expands when scrolled past viewport)

## Phase 5: Layers Panel (skipped)

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
- [x] Inertial scrolling with momentum and friction decay after finger lift

## Phase 7.5: Custom Handwrite Tool ✅

- [x] Custom `handwrite` shape and tool — bypasses tldraw's stroke smoothing
- [x] Zero post-processing: raw pen input rendered as smooth bezier curves
- [x] Wet ink canvas overlay for instant real-time drawing (no React re-renders)
- [x] High-DPI InkLayer renders completed strokes at native screen resolution
- [x] Smooth quadratic bezier curves (Catmull-Rom style) during and after drawing
- [x] No flicker on pen lift (delayed wet ink clear)
- [x] Pressure-sensitive stroke width from Apple Pencil (Catmull-Rom sampled filled circles)
- [x] Proper z-index layering: ink (1) < page mask (2) < add-page buttons (3)
- [x] XS pen size (0.75px) for ultra-thin strokes
- [x] Pen presets: multiple pens with individual color/size/type settings
- [x] Highlighter pen type (35% opacity, wider strokes)
- [x] Add/delete pen presets with "+" button
- [x] Preset icons show color and type (pen/highlighter)
- [ ] Fix text block rendering resolution (tldraw CSS transform limitation)

## Phase 8: Snap-to-Shape + Lasso Select ✅

- [x] Shape recognition on stroke completion:
  - Detect circles, rectangles, triangles, diamonds, arrows, pentagons, hexagons
  - Confidence threshold → replace freehand stroke with clean tldraw geo shape
  - Dedicated triangle detector to prevent rectangle misclassification
- [x] Toggle snap-to-shape in page settings menu
- [x] Highlighter skips snap-to-shape
- [x] Recognized shapes use active pen color
- [x] Lasso select tool:
  - Draw freeform selection loop with dashed outline + blue fill
  - Select all shapes inside the lasso polygon (ray casting algorithm)
  - Works across all shape types (handwrite, text-note, geo, etc.)
- [x] Selected content can be moved, copied, resized, deleted as group (tldraw built-in)
- [x] Rotation handle hidden on handwrite and text-note shapes

## Phase 9: Eraser Modes ✅

- [x] Stroke eraser (tldraw built-in) — erases entire stroke on touch
- [x] Eraser preview: handwrite strokes turn grey at 30% opacity when eraser passes over
- [x] Pixel eraser (custom tool):
  - Eraser circle cursor with trail visualization
  - Finds handwrite strokes intersecting with eraser path
  - Splits affected strokes at erased sections into new shapes
  - Preserves remaining segments with original color/size/pressure/penType
  - Deletes text/geo shapes when eraser touches their bounds
- [x] Eraser dropdown in toolbar to switch between stroke/pixel mode

## Phase 10: Version History + PDF Export ✅

- [x] Canvas JSON snapshots in existing TimeMachine version system (already works via saveVersionGrouped)
- [x] Read-only canvas preview component (renders strokes, text, geo shapes on canvas element)
- [x] Auto-fit zoom to show all content with padding
- [x] Highlighter strokes render with correct opacity in preview
- [x] Shape count summary below preview (strokes, text blocks, shapes)
- [x] Integrated into TimeMachine panel as dropdown from 3-dot menu
- [x] Diff tab hidden for canvas notes (JSON diff not useful)
- [x] Restore button works (restores canvas JSON to current version)
- [x] PDF export from 3-dot menu (jspdf, client-side, 4x resolution)
- [x] PDF includes background patterns (ruled/grid/dot-grid with margins)
- [x] PDF respects page size, page count, and line spacing settings

---

## Phase 11: Migration to tldraw-native rendering ✅

- [x] Rewrote `HandwriteShapeUtil.component()` to render visible SVG paths instead of invisible div
- [x] Pressure strokes use `perfect-freehand` (`getStroke`) → filled SVG `<path>` outline
- [x] Non-pressure strokes use `buildSmoothPath()` → stroked SVG `<path>` with uniform width
- [x] Highlighter rendering: 35% opacity, minimum width of 12
- [x] Updated `indicator()` to use filled outline path for pressure strokes
- [x] Added `xs: 0.75` to `SIZE_MAP` in handwrite-shape.tsx (was missing, existed in InkLayer)
- [x] Reduced wet ink rAF delay from 2 frames to 1 (tldraw renders SVG immediately)
- [x] Removed InkLayer component, import, ref, `isDrawing` state, and all `redraw()` calls from canvas-editor.tsx
- [x] Deleted `components/canvas/ink-layer.tsx`
- [x] Data format unchanged — existing handwrite shapes render with new SVG pipeline automatically
- [x] tldraw handles all rendering, panning, zooming, selection, erasing natively

---

## Known Limitations

- **Text block resolution**: Text inside tldraw shapes is rendered at CSS-transform resolution (can be blurry when zoomed in). Fixing requires rendering text as HTML overlay outside tldraw, which is a significant architectural change.
- **Panning performance**: ~~InkLayer redraws all strokes every frame~~ Fixed in Phase 11 — strokes now render as tldraw-native SVG paths.
- **iPad breakpoint**: Tailwind `md:hidden` (768px) doesn't work reliably on iPad Safari. Using `@media (min-width: 600px)` inline style instead.

## Future Enhancements (Post-MVP)

- [x] PDF export — render canvas as-is (drawings + text + layout + backgrounds)
- [ ] Markdown export — extract text, convert drawings to inline SVG/PNG
- [ ] XY/XYZ graph shape templates
- [x] Highlighter pen tool (implemented as pen preset type)
- [ ] Pencil (textured) pen tool
- [ ] Import Excalidraw notes into canvas system
- [ ] Collaboration / real-time sync for canvas notes
