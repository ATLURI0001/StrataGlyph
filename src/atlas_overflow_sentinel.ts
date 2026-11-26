export class AtlasOverflowError extends Error {}

export function assertAtlasRegionFits(
  atlasWidth: number,
  atlasHeight: number,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (w <= 0 || h <= 0) {
    throw new AtlasOverflowError('Glyph dimensions must be positive');
  }
  if (x < 0 || y < 0 || x + w > atlasWidth || y + h > atlasHeight) {
    throw new AtlasOverflowError(`Glyph region (${x},${y},${w},${h}) overflows ${atlasWidth}x${atlasHeight} atlas`);
  }
}
