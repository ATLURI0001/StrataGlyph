import { describe, it, expect } from 'vitest';
import { benchmarkGlyphRaster } from '../src/glyph_raster_profiler';

describe('glyph_raster_profiler', () => {
  it('computes positive opsPerSec', () => {
    const res = benchmarkGlyphRaster(64, 50);
    expect(res.opsPerSec).toBeGreaterThan(0);
  });
});
