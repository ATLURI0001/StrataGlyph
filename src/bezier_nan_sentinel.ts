export function assertFiniteBezierPoints(points: number[]): void {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('Sentinel violation: bezier points array must be non-empty');
  }
  for (const p of points) {
    if (!Number.isFinite(p)) {
      throw new Error('Sentinel violation: NaN or Infinity in bezier curve control point');
    }
  }
}
