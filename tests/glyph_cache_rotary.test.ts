import { describe, it, expect } from 'vitest';
import { GlyphCacheRotary } from '../src/glyph_cache_rotary';

describe('GlyphCacheRotary', () => {
  it('computes hit rate and latency quantiles across wrapped ring', () => {
    const rotary = new GlyphCacheRotary(4);
    rotary.record(65, true, 10);
    rotary.record(66, false, 100);
    rotary.record(67, true, 12);
    rotary.record(68, true, 14);
    rotary.record(69, true, 8); // wraps around

    const summary = rotary.getSummary();
    expect(summary.sampleCount).toBe(4);
    expect(summary.hitRatePct).toBe(75);
    expect(summary.p50Micros).toBeGreaterThan(0);
  });
});
