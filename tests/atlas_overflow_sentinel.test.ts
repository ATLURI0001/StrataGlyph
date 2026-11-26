import { describe, it, expect } from 'vitest';
import { assertAtlasRegionFits, AtlasOverflowError } from '../src/atlas_overflow_sentinel';

describe('atlas_overflow_sentinel', () => {
  it('accepts valid region and rejects overflow', () => {
    expect(() => assertAtlasRegionFits(512, 512, 10, 10, 32, 32)).not.toThrow();
    expect(() => assertAtlasRegionFits(512, 512, 500, 10, 32, 32)).toThrow(AtlasOverflowError);
  });
});
