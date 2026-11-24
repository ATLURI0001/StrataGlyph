/**
 * SVG Path Bézier Curve Flattening & Coordinate Transformation Benchmark Profiler.
 *
 * Implements high-throughput adaptive De Casteljau subdivision for cubic and quadratic
 * Bézier curves, optimized 2D affine matrix coordinate transformations, and latency
 * profiling with percentile statistics.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface CubicBezier {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
}

export interface QuadraticBezier {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
}

/**
 * 2D Affine Matrix representation:
 * [ a, b, c, d, e, f ] representing:
 * | a  c  e |
 * | b  d  f |
 * | 0  0  1 |
 */
export type AffineMatrix = [number, number, number, number, number, number];

export interface FlatteningResult {
  points: Point2D[];
  segmentCount: number;
  maxDeviation: number;
}

export interface BenchmarkProfileResult {
  totalOperations: number;
  totalDurationMs: number;
  opsPerSecond: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  flattenedSegments: number;
}

/**
 * Transforms a 2D point using an affine transformation matrix.
 */
export function applyAffineTransform(point: Point2D, matrix: AffineMatrix): Point2D {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

/**
 * Calculates squared perpendicular distance from point P to line segment (A, B).
 */
function pointToSegmentDistanceSq(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return px * px + py * py;
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const diffX = p.x - projX;
  const diffY = p.y - projY;
  return diffX * diffX + diffY * diffY;
}

/**
 * Adaptive subdivision of a cubic Bézier curve using De Casteljau's algorithm.
 */
export function flattenCubicBezier(
  curve: CubicBezier,
  tolerance: number = 0.5,
  maxDepth: number = 12
): FlatteningResult {
  if (tolerance <= 0 || !Number.isFinite(tolerance)) {
    throw new RangeError("tolerance must be a positive finite number");
  }

  const tolSq = tolerance * tolerance;
  const points: Point2D[] = [curve.p0];
  let maxDevSq = 0;

  function subdivide(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    depth: number
  ): void {
    const d1Sq = pointToSegmentDistanceSq(p1, p0, p3);
    const d2Sq = pointToSegmentDistanceSq(p2, p0, p3);
    const devSq = Math.max(d1Sq, d2Sq);
    if (devSq > maxDevSq) {
      maxDevSq = devSq;
    }

    if (devSq <= tolSq || depth >= maxDepth) {
      points.push(p3);
      return;
    }

    // De Casteljau midpoints
    const p01 = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
    const p12 = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
    const p23 = { x: (p2.x + p3.x) * 0.5, y: (p2.y + p3.y) * 0.5 };

    const p012 = { x: (p01.x + p12.x) * 0.5, y: (p01.y + p12.y) * 0.5 };
    const p123 = { x: (p12.x + p23.x) * 0.5, y: (p12.y + p23.y) * 0.5 };

    const p0123 = { x: (p012.x + p123.x) * 0.5, y: (p012.y + p123.y) * 0.5 };

    subdivide(p0, p01, p012, p0123, depth + 1);
    subdivide(p0123, p123, p23, p3, depth + 1);
  }

  subdivide(curve.p0, curve.p1, curve.p2, curve.p3, 0);

  return {
    points,
    segmentCount: points.length - 1,
    maxDeviation: Math.sqrt(maxDevSq),
  };
}

/**
 * Adaptive subdivision of a quadratic Bézier curve.
 */
export function flattenQuadraticBezier(
  curve: QuadraticBezier,
  tolerance: number = 0.5,
  maxDepth: number = 12
): FlatteningResult {
  if (tolerance <= 0 || !Number.isFinite(tolerance)) {
    throw new RangeError("tolerance must be a positive finite number");
  }

  const tolSq = tolerance * tolerance;
  const points: Point2D[] = [curve.p0];
  let maxDevSq = 0;

  function subdivide(p0: Point2D, p1: Point2D, p2: Point2D, depth: number): void {
    const devSq = pointToSegmentDistanceSq(p1, p0, p2);
    if (devSq > maxDevSq) {
      maxDevSq = devSq;
    }

    if (devSq <= tolSq || depth >= maxDepth) {
      points.push(p2);
      return;
    }

    const p01 = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
    const p12 = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
    const p012 = { x: (p01.x + p12.x) * 0.5, y: (p01.y + p12.y) * 0.5 };

    subdivide(p0, p01, p012, depth + 1);
    subdivide(p012, p12, p2, depth + 1);
  }

  subdivide(curve.p0, curve.p1, curve.p2, 0);

  return {
    points,
    segmentCount: points.length - 1,
    maxDeviation: Math.sqrt(maxDevSq),
  };
}

/**
 * Calculates polyline length in euclidean units.
 */
export function computePolylineLength(points: Point2D[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev && curr) {
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
  }
  return total;
}

/**
 * Benchmark Profiler executing repeated vector path flattening and transformation runs.
 */
export class BezierBenchmarkProfiler {
  /**
   * Profiles cubic Bézier curve flattening latency and segment generation throughput.
   */
  public benchmarkCubicFlattening(
    curve: CubicBezier,
    iterations: number = 1000,
    tolerance: number = 0.5
  ): BenchmarkProfileResult {
    if (iterations <= 0) {
      throw new RangeError("iterations must be strictly positive");
    }

    const latencies: number[] = [];
    let lastSegmentCount = 0;

    const startTotal = performance.now();
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      const res = flattenCubicBezier(curve, tolerance);
      const t1 = performance.now();
      latencies.push(t1 - t0);
      lastSegmentCount = res.segmentCount;
    }
    const endTotal = performance.now();
    const totalDurationMs = Math.max(0.001, endTotal - startTotal);

    latencies.sort((a, b) => a - b);
    const p50Ms = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p90Ms = latencies[Math.floor(latencies.length * 0.9)] ?? 0;
    const p99Ms = latencies[Math.floor(latencies.length * 0.99)] ?? 0;

    return {
      totalOperations: iterations,
      totalDurationMs,
      opsPerSecond: Number(((iterations / totalDurationMs) * 1000).toFixed(1)),
      p50Ms: Number(p50Ms.toFixed(4)),
      p90Ms: Number(p90Ms.toFixed(4)),
      p99Ms: Number(p99Ms.toFixed(4)),
      flattenedSegments: lastSegmentCount,
    };
  }

  /**
   * Profiles batch 2D affine transformation performance.
   */
  public benchmarkBatchTransform(
    points: Point2D[],
    matrix: AffineMatrix,
    iterations: number = 1000
  ): BenchmarkProfileResult {
    if (iterations <= 0) {
      throw new RangeError("iterations must be strictly positive");
    }

    const latencies: number[] = [];
    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      for (let j = 0; j < points.length; j++) {
        const pt = points[j];
        if (pt) {
          applyAffineTransform(pt, matrix);
        }
      }
      const t1 = performance.now();
      latencies.push(t1 - t0);
    }

    const endTotal = performance.now();
    const totalDurationMs = Math.max(0.001, endTotal - startTotal);

    latencies.sort((a, b) => a - b);
    const p50Ms = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p90Ms = latencies[Math.floor(latencies.length * 0.9)] ?? 0;
    const p99Ms = latencies[Math.floor(latencies.length * 0.99)] ?? 0;

    return {
      totalOperations: iterations * points.length,
      totalDurationMs,
      opsPerSecond: Number((((iterations * points.length) / totalDurationMs) * 1000).toFixed(1)),
      p50Ms: Number(p50Ms.toFixed(4)),
      p90Ms: Number(p90Ms.toFixed(4)),
      p99Ms: Number(p99Ms.toFixed(4)),
      flattenedSegments: points.length,
    };
  }
}
