export function assertSafeSvgPath(svg: string): void {
  if (/<script/i.test(svg) || /on\w+\s*=/i.test(svg)) {
    throw new Error('Sentinel violation: unsafe script or event handler in SVG');
  }
}
