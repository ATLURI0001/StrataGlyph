import { describe, it, expect } from 'vitest';
import { GlyphFallbackCircuitBreaker } from '../src/glyph_fallback_circuit_breaker';

describe('GlyphFallbackCircuitBreaker', () => {
  it('trips OPEN on consecutive raster failures and serves replacement glyph', () => {
    const cb = new GlyphFallbackCircuitBreaker(2, 100);
    const fail = () => { throw new Error('corrupt glyph'); };

    cb.resolveGlyph(65, fail, 1000);
    cb.resolveGlyph(65, fail, 1010);
    expect(cb.getState()).toBe('OPEN');

    const res = cb.resolveGlyph(65, () => 'A', 1050);
    expect(res.fallback).toBe(true);
    expect(res.glyph).toBe('\uFFFD');

    const rec = cb.resolveGlyph(65, () => 'A', 1200);
    expect(rec.fallback).toBe(false);
    expect(cb.getState()).toBe('CLOSED');
  });
});
