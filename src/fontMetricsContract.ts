// fontMetricsContract.ts – validates font metrics bounds
export function validateFontMetrics(ascent: number, descent: number): boolean {
  return ascent > 0 && descent >= 0;
}
