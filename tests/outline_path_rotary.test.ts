import { describe, it, expect } from 'vitest';
import { OutlinePathRotary } from '../src/outline_path_rotary.ts';

describe('OutlinePathRotary', () => {
  it('caps at capacity', () => {
    const r = new OutlinePathRotary(3);
    for (let i = 0; i < 5; i++) r.record(`M ${i} 0 L ${i} 10`);
    expect(r.length).toBe(3);
  });
});
