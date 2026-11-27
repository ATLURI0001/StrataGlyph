import { describe, it, expect } from 'vitest';
import { GpuBufferCircuitBreaker } from '../src/gpu_buffer_circuit_breaker';

describe('GpuBufferCircuitBreaker', () => {
  it('opens after threshold failures', () => {
    const cb = new GpuBufferCircuitBreaker(2, 5000);
    expect(() => cb.call(() => { throw new Error('oom'); })).toThrow();
    expect(() => cb.call(() => { throw new Error('oom'); })).toThrow();
    expect(() => cb.call(() => 'ok')).toThrow(/circuit open/);
  });
});
