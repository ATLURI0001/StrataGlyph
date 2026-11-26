/**
 * Glyph Rasterization & Scanline Benchmark Profiler for StrataGlyph.
 *
 * Measures subpixel anti-aliasing latency, scanline decomposition overhead,
 * and pixel rasterization throughput across variable font sizes and glyph loads.
 */

export interface GlyphRasterWorkload {
  name: string;
  glyphCount: number;
  fontSizePt: number;
  supersampleFactor: 1 | 2 | 4;
}

export interface RasterIterationMetrics {
  durationMs: number;
  pixelsRendered: number;
  scanlinesProcessed: number;
}

export interface RasterBenchmarkReport {
  workloadName: string;
  glyphCount: number;
  fontSizePt: number;
  supersampleFactor: number;
  iterations: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  throughputPixelsPerSec: number;
}

export class GlyphRasterBenchmarkProfiler {
  /**
   * Simulate synthetic vector-to-raster scanline filling for testing and benchmarking.
   */
  public executeRasterization(workload: GlyphRasterWorkload): RasterIterationMetrics {
    if (workload.glyphCount <= 0) {
      throw new Error(`glyphCount must be positive, got ${workload.glyphCount}`);
    }
    if (workload.fontSizePt <= 0) {
      throw new Error(`fontSizePt must be positive, got ${workload.fontSizePt}`);
    }

    const t0 = performance.now();

    // Model scanline traversal: bounding box height proportional to fontSizePt
    const glyphHeightPx = Math.ceil((workload.fontSizePt * 96) / 72);
    const glyphWidthPx = Math.ceil(glyphHeightPx * 0.6);
    const supersample = workload.supersampleFactor;

    let scanlinesTotal = 0;
    let pixelsTotal = 0;

    // Simulate work across glyphs
    for (let g = 0; g < workload.glyphCount; g++) {
      const scanlines = glyphHeightPx * supersample;
      scanlinesTotal += scanlines;

      for (let y = 0; y < scanlines; y++) {
        // Active edge table sorting & fill simulation
        const activeSpan = Math.max(1, Math.floor(glyphWidthPx * supersample * 0.5));
        pixelsTotal += activeSpan;
      }
    }

    const durationMs = Math.max(0.001, performance.now() - t0);

    return {
      durationMs,
      pixelsRendered: pixelsTotal,
      scanlinesProcessed: scanlinesTotal,
    };
  }

  /**
   * Run multi-iteration benchmark suite across a specified workload.
   */
  public profileWorkload(
    workload: GlyphRasterWorkload,
    iterations: number = 20,
    warmupIterations: number = 3
  ): RasterBenchmarkReport {
    if (iterations < 1) {
      throw new Error(`iterations must be at least 1, got ${iterations}`);
    }

    // Warmup
    for (let w = 0; w < warmupIterations; w++) {
      this.executeRasterization(workload);
    }

    const latencies: number[] = [];
    let totalPixels = 0;
    let totalTimeMs = 0;

    for (let i = 0; i < iterations; i++) {
      const m = this.executeRasterization(workload);
      latencies.push(m.durationMs);
      totalPixels += m.pixelsRendered;
      totalTimeMs += m.durationMs;
    }

    latencies.sort((a, b) => a - b);
    const n = latencies.length;

    const getP = (p: number): number => {
      const idx = Math.min(Math.floor((p / 100) * n), n - 1);
      return Math.round(latencies[idx] * 1000) / 1000;
    };

    const sum = latencies.reduce((acc, v) => acc + v, 0);
    const avg = Math.round((sum / n) * 1000) / 1000;
    const throughput = totalTimeMs > 0 ? Math.round((totalPixels / totalTimeMs) * 1000) : 0;

    return {
      workloadName: workload.name,
      glyphCount: workload.glyphCount,
      fontSizePt: workload.fontSizePt,
      supersampleFactor: workload.supersampleFactor,
      iterations,
      p50Ms: getP(50),
      p90Ms: getP(90),
      p99Ms: getP(99),
      minMs: Math.round(latencies[0] * 1000) / 1000,
      maxMs: Math.round(latencies[n - 1] * 1000) / 1000,
      avgMs: avg,
      throughputPixelsPerSec: throughput,
    };
  }

  /**
   * Generate publication-quality markdown benchmark comparison matrix.
   */
  public generateMarkdownMatrix(reports: RasterBenchmarkReport[]): string {
    const lines: string[] = [
      "| Workload | Glyphs | Size (pt) | Supersample | p50 (ms) | p90 (ms) | p99 (ms) | Max (ms) | Throughput (px/s) |",
      "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    ];

    for (const r of reports) {
      lines.push(
        `| ${r.workloadName} | ${r.glyphCount} | ${r.fontSizePt}pt | ${r.supersampleFactor}x | ${r.p50Ms.toFixed(3)}ms | ${r.p90Ms.toFixed(3)}ms | ${r.p99Ms.toFixed(3)}ms | ${r.maxMs.toFixed(3)}ms | ${r.throughputPixelsPerSec.toLocaleString()} |`
      );
    }

    return lines.join("\n");
  }
}
