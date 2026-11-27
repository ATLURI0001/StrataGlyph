import { describe, it, expect } from 'vitest';
import { GlyphCacheSentinel } from '../src/glyphCacheSentinel';

describe('GlyphCacheSentinel', () => {
  it('flags cache overflow', () => {
    const s = new GlyphCacheSentinel(100);
    expect(s.check(50)).toBe(true);
    expect(s.check(150)).toBe(false);
    expect(s.overflows()).toBe(1);
  });
});
