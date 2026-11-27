import { describe, it, expect } from 'vitest';
import { benchmarkKerningLookup } from '../src/kerning_lookup_profiler';

describe('kerning_lookup_profiler', () => {
  it('measures positive opsPerSec', () => {
    const map = new Map([['AV', -50], ['To', -30]]);
    expect(benchmarkKerningLookup(map, ['AV', 'To', 'XX'], 50).opsPerSec).toBeGreaterThan(0);
  });
});
