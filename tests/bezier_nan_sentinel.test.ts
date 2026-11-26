import { describe, it, expect } from 'vitest';
import { assertFiniteBezierPoints } from '../src/bezier_nan_sentinel';

describe('bezier_nan_sentinel', () => {
  it('accepts finite points and rejects NaN', () => {
    expect(() => assertFiniteBezierPoints([0, 10, 20])).not.toThrow();
    expect(() => assertFiniteBezierPoints([0, NaN, 20])).toThrow();
  });
});
