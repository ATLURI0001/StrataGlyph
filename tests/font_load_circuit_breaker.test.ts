import { describe, it, expect } from 'vitest';
import { FontLoadCircuitBreaker } from '../src/font_load_circuit_breaker';

describe('FontLoadCircuitBreaker', () => {
  it('opens after threshold failures', () => {
    const cb = new FontLoadCircuitBreaker(2, 5000);
    expect(() => cb.call(() => { throw new Error('io'); })).toThrow();
    expect(() => cb.call(() => { throw new Error('io'); })).toThrow();
    expect(() => cb.call(() => 'ok')).toThrow(/circuit open/);
  });
});
