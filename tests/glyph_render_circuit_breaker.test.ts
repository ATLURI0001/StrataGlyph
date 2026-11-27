import { describe, it, expect } from 'vitest';
import { GlyphRenderCircuitBreaker } from '../src/glyph_render_circuit_breaker.ts';

describe('GlyphRenderCircuitBreaker', () => {
  it('opens after threshold failures', () => {
    const cb = new GlyphRenderCircuitBreaker(2);
    const boom = () => { throw new Error('fail'); };
    try { cb.call(boom); } catch {}
    try { cb.call(boom); } catch {}
    expect(() => cb.call(() => {})).toThrow('glyph circuit open');
  });
});
