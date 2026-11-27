import { describe, it, expect } from 'vitest';
import { GlyphAtlasRotary } from '../src/glyphAtlasRotary';

describe('GlyphAtlasRotary', () => {
  it('bounds atlas entries', () => {
    const r = new GlyphAtlasRotary(2);
    r.push('g1'); r.push('g2'); r.push('g3');
    expect(r.count()).toBe(2);
  });
});
