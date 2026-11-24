import { describe, it, expect } from "vitest";
import {
  applyAffineTransform,
  flattenCubicBezier,
  flattenQuadraticBezier,
  computePolylineLength,
  BezierBenchmarkProfiler,
  type Point2D,
  type CubicBezier,
  type QuadraticBezier,
  type AffineMatrix,
} from "../src/bezier_benchmark_profiler.js";

describe("Bézier Curve Flattening & Benchmark Profiler Suite", () => {
  it("applies 2D affine matrix transformations accurately", () => {
    const point: Point2D = { x: 10, y: 20 };

    // Identity
    const identity: AffineMatrix = [1, 0, 0, 1, 0, 0];
    expect(applyAffineTransform(point, identity)).toEqual({ x: 10, y: 20 });

    // Translation by (5, -10)
    const translate: AffineMatrix = [1, 0, 0, 1, 5, -10];
    expect(applyAffineTransform(point, translate)).toEqual({ x: 15, y: 10 });

    // Scaling by (2, 3)
    const scale: AffineMatrix = [2, 0, 0, 3, 0, 0];
    expect(applyAffineTransform(point, scale)).toEqual({ x: 20, y: 60 });

    // 90 degree rotation around origin: x' = -y, y' = x
    const rotate90: AffineMatrix = [0, 1, -1, 0, 0, 0];
    expect(applyAffineTransform(point, rotate90)).toEqual({ x: -20, y: 10 });
  });

  it("flattens collinear cubic Bézier curves into a single line segment", () => {
    // Perfectly collinear control points
    const straight: CubicBezier = {
      p0: { x: 0, y: 0 },
      p1: { x: 25, y: 0 },
      p2: { x: 75, y: 0 },
      p3: { x: 100, y: 0 },
    };

    const res = flattenCubicBezier(straight, 0.5);
    expect(res.segmentCount).toBe(1);
    expect(res.points).toHaveLength(2);
    expect(res.points[0]).toEqual({ x: 0, y: 0 });
    expect(res.points[1]).toEqual({ x: 100, y: 0 });
    expect(res.maxDeviation).toBe(0);
  });

  it("adaptively subdivides curved cubic Bézier paths with tighter tolerances", () => {
    // S-curve
    const sCurve: CubicBezier = {
      p0: { x: 0, y: 0 },
      p1: { x: 0, y: 100 },
      p2: { x: 100, y: 0 },
      p3: { x: 100, y: 100 },
    };

    const coarse = flattenCubicBezier(sCurve, 2.0);
    const fine = flattenCubicBezier(sCurve, 0.2);

    expect(fine.segmentCount).toBeGreaterThan(coarse.segmentCount);
    expect(coarse.points[0]).toEqual(sCurve.p0);
    expect(coarse.points[coarse.points.length - 1]).toEqual(sCurve.p3);
    expect(fine.points[0]).toEqual(sCurve.p0);
    expect(fine.points[fine.points.length - 1]).toEqual(sCurve.p3);
  });

  it("flattens quadratic Bézier curves accurately", () => {
    const quad: QuadraticBezier = {
      p0: { x: 0, y: 0 },
      p1: { x: 50, y: 100 },
      p2: { x: 100, y: 0 },
    };

    const res = flattenQuadraticBezier(quad, 0.5);
    expect(res.segmentCount).toBeGreaterThan(1);
    expect(res.points[0]).toEqual(quad.p0);
    expect(res.points[res.points.length - 1]).toEqual(quad.p2);
  });

  it("rejects non-positive or non-finite tolerances defensively", () => {
    const quad: QuadraticBezier = {
      p0: { x: 0, y: 0 },
      p1: { x: 50, y: 100 },
      p2: { x: 100, y: 0 },
    };

    expect(() => flattenQuadraticBezier(quad, 0)).toThrow(RangeError);
    expect(() => flattenQuadraticBezier(quad, -1)).toThrow(RangeError);
    expect(() => flattenQuadraticBezier(quad, Number.NaN)).toThrow(RangeError);
  });

  it("computes polyline length accurately", () => {
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 }, // length 5
      { x: 3, y: 14 }, // length 10
    ];
    expect(computePolylineLength(points)).toBe(15);
    expect(computePolylineLength([])).toBe(0);
    expect(computePolylineLength([{ x: 1, y: 1 }])).toBe(0);
  });

  it("profiles cubic flattening with latency percentiles and throughput metrics", () => {
    const profiler = new BezierBenchmarkProfiler();
    const curve: CubicBezier = {
      p0: { x: 0, y: 0 },
      p1: { x: 20, y: 80 },
      p2: { x: 80, y: 20 },
      p3: { x: 100, y: 100 },
    };

    const report = profiler.benchmarkCubicFlattening(curve, 200, 0.5);
    expect(report.totalOperations).toBe(200);
    expect(report.totalDurationMs).toBeGreaterThan(0);
    expect(report.opsPerSecond).toBeGreaterThan(0);
    expect(report.p50Ms).toBeGreaterThanOrEqual(0);
    expect(report.p90Ms).toBeGreaterThanOrEqual(report.p50Ms);
    expect(report.p99Ms).toBeGreaterThanOrEqual(report.p90Ms);
    expect(report.flattenedSegments).toBeGreaterThan(0);
  });

  it("profiles batch affine transformation throughput", () => {
    const profiler = new BezierBenchmarkProfiler();
    const points: Point2D[] = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i * 2 }));
    const matrix: AffineMatrix = [1.5, 0.2, -0.1, 1.2, 10, -5];

    const report = profiler.benchmarkBatchTransform(points, matrix, 100);
    expect(report.totalOperations).toBe(5000);
    expect(report.totalDurationMs).toBeGreaterThan(0);
    expect(report.opsPerSecond).toBeGreaterThan(0);
    expect(report.flattenedSegments).toBe(50);
  });
});
