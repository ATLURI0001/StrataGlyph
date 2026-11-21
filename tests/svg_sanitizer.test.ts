import { describe, it, expect } from 'vitest';
import { extractViewport, sanitizeSvg } from '../src/svg_sanitizer.js';

describe('SVG Viewport Normalizer & Script Injection Sanitizer', () => {
  it('extracts viewport from viewBox attribute', () => {
    const svg = '<svg viewBox="10 20 800 600"><rect /></svg>';
    const vp = extractViewport(svg);
    expect(vp).toEqual({ minX: 10, minY: 20, width: 800, height: 600 });
  });

  it('falls back to width and height when viewBox is missing', () => {
    const svg = '<svg width="640px" height="480px"><circle /></svg>';
    const vp = extractViewport(svg);
    expect(vp).toEqual({ minX: 0, minY: 0, width: 640, height: 480 });
  });

  it('strips <script> tags and foreignObject attacks', () => {
    const dirty = '<svg viewBox="0 0 100 100"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><rect /></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('foreignObject');
    expect(clean).toContain('<rect />');
  });

  it('strips inline event handlers (onload, onclick, onerror)', () => {
    const dirty = '<svg viewBox="0 0 100 100"><rect onload="steal()" onclick="hack()" fill="red" /></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('fill="red"');
  });

  it('strips javascript: and data:text/html hrefs', () => {
    const dirty = '<svg><a href="javascript:alert(1)"><text>Click</text></a><image xlink:href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" /></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('data:text/html');
  });

  it('strips DOCTYPE and entity declarations to prevent XXE', () => {
    const dirty = '<!DOCTYPE svg SYSTEM "http://evil.com/xxe.dtd"><!ENTITY xxe SYSTEM "file:///etc/passwd"><svg viewBox="0 0 50 50"><rect /></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('DOCTYPE');
    expect(clean).not.toContain('ENTITY');
    expect(clean).toContain('<svg viewBox="0 0 50 50">');
  });

  it('normalizes non-zero origin viewport and applies padding', () => {
    const svg = '<svg viewBox="50 100 400 300"><path /></svg>';
    const clean = sanitizeSvg(svg, { normalizeOrigin: true, padding: 10 });
    // After padding: width 400 + 20 = 420, height 300 + 20 = 320; normalized origin: 0 0
    expect(clean).toContain('viewBox="0 0 420 320"');
  });
});
