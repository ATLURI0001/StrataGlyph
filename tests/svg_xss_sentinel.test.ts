import { describe, it, expect } from 'vitest';
import { assertSafeSvgPath } from '../src/svg_xss_sentinel';

describe('svg_xss_sentinel', () => {
  it('accepts clean SVG and rejects script/event handlers', () => {
    expect(() => assertSafeSvgPath('<svg><path d="M0 0"/></svg>')).not.toThrow();
    expect(() => assertSafeSvgPath('<svg onload="alert(1)"/>')).toThrow();
  });
});
