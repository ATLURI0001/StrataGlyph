import { describe, it, expect } from 'vitest';
import { GlyphRasterProfiler } from '../src/glyphRasterProfiler';

describe('GlyphRasterProfiler', () => {
  it('tracks max raster duration', () => {
    const p = new GlyphRasterProfiler();
    p.record(4); p.record(12);
    expect(p.maxMs()).toBe(12);
  });
});
