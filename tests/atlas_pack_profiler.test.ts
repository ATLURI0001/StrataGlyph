import { describe, it, expect } from 'vitest';
import { benchmarkAtlasPack } from '../src/atlas_pack_profiler';

describe('atlas_pack_profiler', () => {
  it('reports positive opsPerSec', () => {
    expect(benchmarkAtlasPack(64, 50).opsPerSec).toBeGreaterThan(0);
  });
});
