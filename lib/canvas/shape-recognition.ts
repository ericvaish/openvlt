/**
 * Shape recognition — detects if a freehand stroke approximates a geometric shape.
 * Returns the recognized shape type and parameters, or null if no match.
 */

interface Point {
  x: number
  y: number
}

interface RecognizedShape {
  type: "rectangle" | "ellipse" | "triangle" | "line"
  bounds: { x: number; y: number; w: number; h: number }
  confidence: number
}

const CONFIDENCE_THRESHOLD = 0.7

/**
 * Analyze a set of points from a completed stroke and try to recognize a geometric shape.
 */
export function recognizeShape(points: Point[]): RecognizedShape | null {
  if (points.length < 5) return null

  const bounds = getBounds(points)
  if (bounds.w < 10 && bounds.h < 10) return null

  // Try each recognizer and return the best match
  const candidates: RecognizedShape[] = []

  const lineResult = detectLine(points, bounds)
  if (lineResult) candidates.push(lineResult)

  const rectResult = detectRectangle(points, bounds)
  if (rectResult) candidates.push(rectResult)

  const ellipseResult = detectEllipse(points, bounds)
  if (ellipseResult) candidates.push(ellipseResult)

  const triangleResult = detectTriangle(points, bounds)
  if (triangleResult) candidates.push(triangleResult)

  if (candidates.length === 0) return null

  // Return highest confidence match
  candidates.sort((a, b) => b.confidence - a.confidence)
  const best = candidates[0]
  return best.confidence >= CONFIDENCE_THRESHOLD ? best : null
}

function getBounds(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * Detect if stroke is approximately a straight line.
 */
function detectLine(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  const first = points[0]
  const last = points[points.length - 1]
  const lineLen = Math.hypot(last.x - first.x, last.y - first.y)

  if (lineLen < 20) return null

  // Calculate total path length
  let pathLen = 0
  for (let i = 1; i < points.length; i++) {
    pathLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }

  // A straight line has path length ≈ distance between endpoints
  const straightness = lineLen / pathLen

  // Calculate max deviation from the line
  const dx = last.x - first.x
  const dy = last.y - first.y
  let maxDev = 0
  for (const p of points) {
    const dist = Math.abs(dy * p.x - dx * p.y + last.x * first.y - last.y * first.x) / lineLen
    maxDev = Math.max(maxDev, dist)
  }
  const devRatio = maxDev / lineLen

  const confidence = straightness * 0.6 + (1 - Math.min(devRatio * 5, 1)) * 0.4

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return {
    type: "line",
    bounds,
    confidence,
  }
}

/**
 * Detect if stroke is approximately a rectangle.
 */
function detectRectangle(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  // Check if the stroke is closed (endpoints near each other)
  const first = points[0]
  const last = points[points.length - 1]
  const closeness = Math.hypot(last.x - first.x, last.y - first.y)
  const diagonal = Math.hypot(bounds.w, bounds.h)
  if (closeness > diagonal * 0.25) return null

  // Calculate how much of the bounding box area the stroke covers
  // A rectangle should have points distributed along all 4 edges
  const margin = Math.max(bounds.w, bounds.h) * 0.15
  let nearTop = 0, nearBottom = 0, nearLeft = 0, nearRight = 0

  for (const p of points) {
    if (Math.abs(p.y - bounds.y) < margin) nearTop++
    if (Math.abs(p.y - (bounds.y + bounds.h)) < margin) nearBottom++
    if (Math.abs(p.x - bounds.x) < margin) nearLeft++
    if (Math.abs(p.x - (bounds.x + bounds.w)) < margin) nearRight++
  }

  const n = points.length
  const edgeCoverage = Math.min(nearTop / n, nearBottom / n, nearLeft / n, nearRight / n)

  // Check aspect ratio isn't too extreme
  const aspectRatio = bounds.w / bounds.h
  const aspectPenalty = (aspectRatio > 5 || aspectRatio < 0.2) ? 0.3 : 0

  // Check that points stay close to the bounding rect edges
  let totalDist = 0
  for (const p of points) {
    const distToEdge = Math.min(
      Math.abs(p.x - bounds.x),
      Math.abs(p.x - (bounds.x + bounds.w)),
      Math.abs(p.y - bounds.y),
      Math.abs(p.y - (bounds.y + bounds.h))
    )
    totalDist += distToEdge
  }
  const avgDist = totalDist / points.length
  const edgeProximity = 1 - Math.min(avgDist / (diagonal * 0.15), 1)

  const confidence = edgeCoverage * 4 * 0.4 + edgeProximity * 0.6 - aspectPenalty

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return {
    type: "rectangle",
    bounds,
    confidence: Math.min(confidence, 1),
  }
}

/**
 * Detect if stroke is approximately an ellipse/circle.
 */
function detectEllipse(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  // Check if closed
  const first = points[0]
  const last = points[points.length - 1]
  const closeness = Math.hypot(last.x - first.x, last.y - first.y)
  const diagonal = Math.hypot(bounds.w, bounds.h)
  if (closeness > diagonal * 0.25) return null

  // Check how well points fit an ellipse
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  const rx = bounds.w / 2
  const ry = bounds.h / 2

  let totalError = 0
  for (const p of points) {
    // Normalized distance from ellipse center
    const nx = (p.x - cx) / rx
    const ny = (p.y - cy) / ry
    const dist = Math.sqrt(nx * nx + ny * ny)
    // Perfect ellipse has dist = 1 for all points
    totalError += Math.abs(dist - 1)
  }

  const avgError = totalError / points.length
  const confidence = Math.max(0, 1 - avgError * 2)

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return {
    type: "ellipse",
    bounds,
    confidence,
  }
}

/**
 * Detect if stroke is approximately a triangle.
 */
function detectTriangle(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  // Check if closed
  const first = points[0]
  const last = points[points.length - 1]
  const closeness = Math.hypot(last.x - first.x, last.y - first.y)
  const diagonal = Math.hypot(bounds.w, bounds.h)
  if (closeness > diagonal * 0.25) return null

  // Find corners — points with highest curvature
  const corners = findCorners(points, 3)
  if (corners.length < 3) return null

  // Check that the 3 corners roughly form a triangle
  // Verify each segment between corners is roughly straight
  const segments = [
    points.slice(corners[0], corners[1] + 1),
    points.slice(corners[1], corners[2] + 1),
    [...points.slice(corners[2]), ...points.slice(0, corners[0] + 1)],
  ]

  let straightness = 0
  for (const seg of segments) {
    if (seg.length < 2) continue
    const segFirst = seg[0]
    const segLast = seg[seg.length - 1]
    const segLen = Math.hypot(segLast.x - segFirst.x, segLast.y - segFirst.y)
    if (segLen < 1) continue

    let pathLen = 0
    for (let i = 1; i < seg.length; i++) {
      pathLen += Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y)
    }
    straightness += segLen / Math.max(pathLen, 1)
  }
  straightness /= 3

  const confidence = straightness * 0.8 + (closeness < diagonal * 0.1 ? 0.2 : 0)

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return {
    type: "triangle",
    bounds,
    confidence,
  }
}

/**
 * Find corner points by analyzing curvature changes.
 */
function findCorners(points: Point[], maxCorners: number): number[] {
  if (points.length < 10) return []

  const step = Math.max(1, Math.floor(points.length / 50))
  const angles: { index: number; angle: number }[] = []

  for (let i = step * 2; i < points.length - step * 2; i += step) {
    const prev = points[i - step * 2]
    const curr = points[i]
    const next = points[i + step * 2]

    const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x)
    const a2 = Math.atan2(next.y - curr.y, next.x - curr.x)
    let angle = Math.abs(a2 - a1)
    if (angle > Math.PI) angle = 2 * Math.PI - angle

    angles.push({ index: i, angle })
  }

  // Sort by sharpest angle and pick top N
  angles.sort((a, b) => b.angle - a.angle)

  const corners: number[] = []
  const minDist = points.length / (maxCorners + 1) * 0.5

  for (const a of angles) {
    if (corners.length >= maxCorners) break
    const tooClose = corners.some(c => Math.abs(c - a.index) < minDist)
    if (!tooClose) {
      corners.push(a.index)
    }
  }

  return corners.sort((a, b) => a - b)
}
