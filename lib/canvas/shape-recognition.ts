/**
 * Shape recognition — detects if a freehand stroke approximates a geometric shape.
 * Returns the recognized shape type and parameters, or null if no match.
 */

interface Point {
  x: number
  y: number
}

interface RecognizedShape {
  type: "rectangle" | "ellipse" | "triangle" | "line" | "diamond" | "arrow" | "pentagon" | "hexagon"
  bounds: { x: number; y: number; w: number; h: number }
  confidence: number
  // For arrow: direction from first to last point
  arrowStart?: Point
  arrowEnd?: Point
}

const CONFIDENCE_THRESHOLD = 0.7

/**
 * Analyze a set of points from a completed stroke and try to recognize a geometric shape.
 */
export function recognizeShape(points: Point[]): RecognizedShape | null {
  if (points.length < 5) return null

  const bounds = getBounds(points)
  if (bounds.w < 10 && bounds.h < 10) return null

  const candidates: RecognizedShape[] = []

  const lineResult = detectLine(points, bounds)
  if (lineResult) candidates.push(lineResult)

  const arrowResult = detectArrow(points, bounds)
  if (arrowResult) candidates.push(arrowResult)

  const isClosed = isStrokeClosed(points, bounds)

  if (isClosed) {
    const rectResult = detectRectangle(points, bounds)
    if (rectResult) candidates.push(rectResult)

    const ellipseResult = detectEllipse(points, bounds)
    if (ellipseResult) candidates.push(ellipseResult)

    const diamondResult = detectDiamond(points, bounds)
    if (diamondResult) candidates.push(diamondResult)

    const triResult = detectTriangle(points, bounds)
    if (triResult) candidates.push(triResult)

    const pentResult = detectPolygon(points, bounds, 5, "pentagon")
    if (pentResult) candidates.push(pentResult)

    const hexResult = detectPolygon(points, bounds, 6, "hexagon")
    if (hexResult) candidates.push(hexResult)
  }

  if (candidates.length === 0) return null

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
 * Check if a stroke is closed — endpoints are near each other.
 */
function isStrokeClosed(points: Point[], bounds: { w: number; h: number }): boolean {
  const first = points[0]
  const last = points[points.length - 1]
  const diagonal = Math.hypot(bounds.w, bounds.h)
  const endpointDist = Math.hypot(last.x - first.x, last.y - first.y)
  return endpointDist < diagonal * 0.35
}

/**
 * Detect if stroke is approximately a straight line.
 */
function detectLine(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  const first = points[0]
  const last = points[points.length - 1]
  const lineLen = Math.hypot(last.x - first.x, last.y - first.y)

  if (lineLen < 20) return null

  let pathLen = 0
  for (let i = 1; i < points.length; i++) {
    pathLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }

  const straightness = lineLen / pathLen

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

  return { type: "line", bounds, confidence }
}

/**
 * Detect if stroke is approximately an arrow (line with a V at the end).
 */
function detectArrow(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (points.length < 10) return null

  // Split into main shaft (first ~70%) and head (~last 30%)
  const shaftEnd = Math.floor(points.length * 0.7)
  const shaft = points.slice(0, shaftEnd)
  const head = points.slice(shaftEnd)

  // Shaft should be roughly straight
  const shaftFirst = shaft[0]
  const shaftLast = shaft[shaft.length - 1]
  const shaftLen = Math.hypot(shaftLast.x - shaftFirst.x, shaftLast.y - shaftFirst.y)
  if (shaftLen < 30) return null

  let shaftPathLen = 0
  for (let i = 1; i < shaft.length; i++) {
    shaftPathLen += Math.hypot(shaft[i].x - shaft[i - 1].x, shaft[i].y - shaft[i - 1].y)
  }
  const shaftStraightness = shaftLen / shaftPathLen
  if (shaftStraightness < 0.85) return null

  // Head should go back toward the shaft (direction reversal)
  const headFirst = head[0]
  const headLast = head[head.length - 1]

  // The head should end closer to the shaft than it starts
  const shaftDx = shaftLast.x - shaftFirst.x
  const shaftDy = shaftLast.y - shaftFirst.y

  // Project head endpoint onto shaft direction
  const headDx = headLast.x - headFirst.x
  const headDy = headLast.y - headFirst.y
  const dot = (headDx * shaftDx + headDy * shaftDy) / (shaftLen * shaftLen)

  // Arrow head should point backward (negative dot product)
  if (dot > -0.1) return null

  const confidence = shaftStraightness * 0.7 + Math.min(Math.abs(dot), 1) * 0.3

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return {
    type: "arrow",
    bounds,
    confidence,
    arrowStart: shaftFirst,
    arrowEnd: shaftLast,
  }
}

/**
 * Detect if stroke is approximately a rectangle.
 */
function detectRectangle(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  const margin = Math.max(bounds.w, bounds.h) * 0.15
  const diagonal = Math.hypot(bounds.w, bounds.h)
  let nearTop = 0, nearBottom = 0, nearLeft = 0, nearRight = 0

  for (const p of points) {
    if (Math.abs(p.y - bounds.y) < margin) nearTop++
    if (Math.abs(p.y - (bounds.y + bounds.h)) < margin) nearBottom++
    if (Math.abs(p.x - bounds.x) < margin) nearLeft++
    if (Math.abs(p.x - (bounds.x + bounds.w)) < margin) nearRight++
  }

  const n = points.length
  const edgeCoverage = Math.min(nearTop / n, nearBottom / n, nearLeft / n, nearRight / n)

  const aspectRatio = bounds.w / bounds.h
  const aspectPenalty = (aspectRatio > 5 || aspectRatio < 0.2) ? 0.3 : 0

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

  // Penalize if the shape has only 3 sharp corners (likely a triangle)
  const corners = findCorners(points, 5)
  const cornerPenalty = corners.length < 4 ? 0.3 : 0

  const confidence = edgeCoverage * 4 * 0.4 + edgeProximity * 0.6 - aspectPenalty - cornerPenalty

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return { type: "rectangle", bounds, confidence: Math.min(confidence, 1) }
}

/**
 * Detect if stroke is approximately an ellipse/circle.
 */
function detectEllipse(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  const rx = bounds.w / 2
  const ry = bounds.h / 2

  let totalError = 0
  for (const p of points) {
    const nx = (p.x - cx) / rx
    const ny = (p.y - cy) / ry
    const dist = Math.sqrt(nx * nx + ny * ny)
    totalError += Math.abs(dist - 1)
  }

  const avgError = totalError / points.length
  const confidence = Math.max(0, 1 - avgError * 2)

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return { type: "ellipse", bounds, confidence }
}

/**
 * Detect if stroke is approximately a diamond/rhombus.
 * A diamond has points near the midpoints of each bounding box edge.
 */
function detectDiamond(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  const diagonal = Math.hypot(bounds.w, bounds.h)

  // Diamond vertices: top-center, right-center, bottom-center, left-center
  const vertices = [
    { x: cx, y: bounds.y },             // top
    { x: bounds.x + bounds.w, y: cy },  // right
    { x: cx, y: bounds.y + bounds.h },  // bottom
    { x: bounds.x, y: cy },             // left
  ]

  // Check how well points fit the diamond edges
  let totalDist = 0
  for (const p of points) {
    let minDist = Infinity
    for (let i = 0; i < 4; i++) {
      const v1 = vertices[i]
      const v2 = vertices[(i + 1) % 4]
      const dist = pointToSegmentDist(p, v1, v2)
      minDist = Math.min(minDist, dist)
    }
    totalDist += minDist
  }

  const avgDist = totalDist / points.length
  const edgeProximity = 1 - Math.min(avgDist / (diagonal * 0.1), 1)

  // Check that we have points near all 4 vertices
  const margin = diagonal * 0.2
  let vertexCoverage = 0
  for (const v of vertices) {
    if (points.some(p => Math.hypot(p.x - v.x, p.y - v.y) < margin)) {
      vertexCoverage++
    }
  }

  const confidence = edgeProximity * 0.6 + (vertexCoverage / 4) * 0.4

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return { type: "diamond", bounds, confidence }
}

/**
 * Dedicated triangle detector — more forgiving than the generic polygon detector.
 * Checks for 3 corners with straight segments between them.
 */
function detectTriangle(points: Point[], bounds: { x: number; y: number; w: number; h: number }): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  const corners = findCorners(points, 4)
  // Need exactly 3 sharp corners (allow findCorners to return 3 from a request of 4)
  if (corners.length < 3) return null

  // Use only the 3 sharpest corners
  const triCorners = corners.slice(0, 3).sort((a, b) => a - b)

  // Check segment straightness between the 3 corners
  const segments = [
    points.slice(triCorners[0], triCorners[1] + 1),
    points.slice(triCorners[1], triCorners[2] + 1),
    [...points.slice(triCorners[2]), ...points.slice(0, triCorners[0] + 1)],
  ]

  let straightness = 0
  let validSegments = 0
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
    validSegments++
  }

  if (validSegments < 3) return null
  straightness /= validSegments

  // Triangle: straightness > 0.85 is a good triangle
  // Give a confidence boost since rectangles tend to steal triangles
  const confidence = Math.min(1, straightness * 0.9 + 0.1)

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return { type: "triangle", bounds, confidence }
}

/**
 * Detect N-sided regular polygon (triangle, pentagon, hexagon).
 * Uses corner detection and segment straightness analysis.
 */
function detectPolygon(
  points: Point[],
  bounds: { x: number; y: number; w: number; h: number },
  sides: number,
  type: "triangle" | "pentagon" | "hexagon"
): RecognizedShape | null {
  if (bounds.w < 20 || bounds.h < 20) return null

  const corners = findCorners(points, sides)
  if (corners.length < sides) return null

  // Build segments between consecutive corners (wrapping around)
  const segments: Point[][] = []
  for (let i = 0; i < sides; i++) {
    const start = corners[i]
    const end = corners[(i + 1) % sides]
    if (end > start) {
      segments.push(points.slice(start, end + 1))
    } else {
      segments.push([...points.slice(start), ...points.slice(0, end + 1)])
    }
  }

  // Check segment straightness
  let straightness = 0
  let validSegments = 0
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
    validSegments++
  }

  if (validSegments < sides) return null
  straightness /= validSegments

  // Check that corner angles are roughly equal for regular polygons
  const expectedAngle = Math.PI * (sides - 2) / sides
  let angleError = 0
  for (let i = 0; i < corners.length; i++) {
    const prev = points[corners[(i - 1 + corners.length) % corners.length]]
    const curr = points[corners[i]]
    const next = points[corners[(i + 1) % corners.length]]

    const a1 = Math.atan2(prev.y - curr.y, prev.x - curr.x)
    const a2 = Math.atan2(next.y - curr.y, next.x - curr.x)
    let angle = Math.abs(a2 - a1)
    if (angle > Math.PI) angle = 2 * Math.PI - angle

    angleError += Math.abs(angle - (Math.PI - expectedAngle))
  }
  angleError /= corners.length
  const angleScore = Math.max(0, 1 - angleError * 2)

  const confidence = straightness * 0.6 + angleScore * 0.4

  if (confidence < CONFIDENCE_THRESHOLD) return null

  return { type, bounds, confidence }
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

/**
 * Distance from a point to a line segment.
 */
function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}
