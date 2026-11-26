import { describe, expect, it } from 'vitest';
import {
  GlyphRasterBenchmarkProfiler,
  type GlyphRasterWorkload,
} from '../src/glyph_raster_benchmark_profiler';

describe('GlyphRasterBenchmarkProfiler Suite', () => {
  const profiler = new GlyphRasterBenchmarkProfiler();

  it('executes rasterization and computes non-zero pixels and scanlines', () => {
    const workload: GlyphRasterWorkload = {
      name: 'Paragraph-12pt',
      glyphCount: 50,
      fontSizePt: 12,
      supersampleFactor: 1,
    };

    const metrics = profiler.executeRasterization(workload);
    expect(metrics.durationMs).toBeGreaterThan(0);
    expect(metrics.pixelsRendered).toBeGreaterThan(0);
    expect(metrics.scanlinesProcessed).toBeGreaterThan(0);
  });

  it('scales raster workload metrics with supersample factor', () => {
    const base: GlyphRasterWorkload = {
      name: 'Base-1x',
      glyphCount: 10,
      fontSizePt: 16,
      supersampleFactor: 1,
    };

    const supersampled: GlyphRasterWorkload = {
      name: 'Super-4x',
      glyphCount: 10,
      fontSizePt: 16,
      supersampleFactor: 4,
    };

    const mBase = profiler.executeRasterization(base);
    const mSuper = profiler.executeRasterization(supersampled);

    expect(mSuper.scanlinesProcessed).toBeGreaterThan(mBase.scanlinesProcessed);
    expect(mSuper.pixelsRendered).toBeGreaterThan(mBase.pixelsRendered);
  });

  it('profiles multi-iteration benchmark and produces valid percentiles', () => {
    const workload: GlyphRasterWorkload = {
      name: 'Heading-32pt',
      glyphCount: 20,
      fontSizePt: 32,
      supersampleFactor: 2,
    };

    const report = profiler.profileWorkload(workload, 15, 2);
    expect(report.iterations).toBe(15);
    expect(report.p50Ms).toBeGreaterThanOrEqual(0);
    expect(report.p90Ms).toBeGreaterThanOrEqual(report.p50Ms);
    expect(report.maxMs).toBeGreaterThanOrEqual(report.p90Ms);
    expect(report.minMs).toBeLessThanOrEqual(report.p50Ms);
    expect(report.throughputPixelsPerSec).toBeGreaterThan(0);
  });

  it('generates formatted markdown benchmark matrix', () => {
    const report = profiler.profileWorkload(
      { name: 'Headline', glyphCount: 5, fontSizePt: 48, supersampleFactor: 1 },
      5,
      1
    );

    const matrix = profiler.generateMarkdownMatrix([report]);
    expect(matrix).toContain('| Workload | Glyphs | Size (pt) |');
    expect(matrix).toContain('| Headline | 5 | 48pt | 1x |');
  });

  it('rejects invalid workload parameters defensively', () => {
    expect(() =>
      profiler.executeRasterization({
        name: 'Invalid-Glyphs',
        glyphCount: 0,
        fontSizePt: 12,
        supersampleFactor: 1,
      })
    ).toThrow('glyphCount must be positive');

    expect(() =>
      profiler.executeRasterization({
        name: 'Invalid-Font',
        glyphCount: 10,
        fontSizePt: -4,
        supersampleFactor: 1,
      })
    ).toThrow('fontSizePt must be positive');
  });
});
