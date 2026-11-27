import { describe, it, expect } from 'vitest';
import { validateKerningPair } from '../src/glyph_kerning_contract';

describe('glyph_kerning_contract', () => {
  it('validates kerning pair bounds', () => {
    expect(() => validateKerningPair('A', 'V', -50)).not.toThrow();
    expect(() => validateKerningPair('', 'V', -50)).toThrow();
  });
});
