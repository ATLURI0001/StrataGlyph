import { describe, it, expect } from 'vitest';
import { ShaderCompileRotary } from '../src/shader_compile_rotary';

describe('ShaderCompileRotary', () => {
  it('computes bounded average compile time', () => {
    const r = new ShaderCompileRotary(2);
    r.record(4);
    r.record(8);
    r.record(12);
    expect(r.avgMs()).toBe(10);
  });
});
