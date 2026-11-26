import { describe, it, expect } from 'vitest';
import { CacheEvictionRotary } from '../src/cache_eviction_rotary';

describe('CacheEvictionRotary', () => {
  it('computes bounded average evictions', () => {
    const r = new CacheEvictionRotary(2);
    r.record(1);
    r.record(3);
    r.record(5);
    expect(r.avg()).toBe(4);
  });
});
