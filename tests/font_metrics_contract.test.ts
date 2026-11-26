import { describe, it, expect } from 'vitest';
import { validateFontMetrics } from '../src/font_metrics_contract';

describe('font_metrics_contract', () => {
  it('validates font metrics bounds', () => {
    expect(() => validateFontMetrics({ ascender: 800, descender: -200, unitsPerEm: 1000 })).not.toThrow();
    expect(() => validateFontMetrics({ ascender: 800, descender: 50, unitsPerEm: 1000 })).toThrow();
  });
});
