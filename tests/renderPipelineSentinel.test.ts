import { describe, it, expect } from 'vitest';
import { RenderPipelineSentinel } from '../src/renderPipelineSentinel';

describe('RenderPipelineSentinel', () => {
  it('flags slow render stages', () => {
    const s = new RenderPipelineSentinel(50);
    expect(s.check({ stage: 'raster', durationMs: 30 })).toBe(true);
    expect(s.check({ stage: 'composite', durationMs: 100 })).toBe(false);
    expect(s.flaggedCount()).toBe(1);
  });
});
