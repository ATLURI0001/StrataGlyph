import { describe, it, expect } from 'vitest';
import { validateFontMetrics } from '../src/fontMetricsContract';

describe('fontMetricsContract', () => {
  it('validates positive ascent and non-negative descent', () => {
    expect(validateFontMetrics(12, 3)).toBe(true);
    expect(validateFontMetrics(0, 3)).toBe(false);
  });
});
