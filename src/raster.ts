/**
 * StrataGlyph Glyphic Grid Rasterizer & Subpixel Anti-Aliasing Engine.
 *
 * Provides discrete grid snapping, AABB collision & IoU calculation,
 * fractional pixel coverage, and gamma-corrected linear alpha blending
 * for crisp vector diagram rendering.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RGBAColor {
  r: number; // 0 - 255
  g: number; // 0 - 255
  b: number; // 0 - 255
  a: number; // 0.0 - 1.0
}

/**
 * Snap floating-point coordinate to nearest subpixel grid increment.
 *
 * @param val - Raw coordinate value
 * @param gridStep - Subpixel grid increment (default 0.25)
 * @returns Snapped coordinate
 */
export function snapToSubpixelGrid(val: number, gridStep: number = 0.25): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new TypeError(`val must be a finite number, received: ${val}`);
  }
  if (gridStep <= 0.0) {
    throw new RangeError(`gridStep must be strictly positive, received: ${gridStep}`);
  }
  return Math.round(val / gridStep) * gridStep;
}

/**
 * Clamp point within canvas dimensions [0, width] x [0, height].
 */
export function clampPointToCanvas(p: Point2D, width: number, height: number): Point2D {
  if (width <= 0 || height <= 0) {
    throw new RangeError('Canvas width and height must be strictly positive');
  }
  return {
    x: Math.max(0, Math.min(width, p.x)),
    y: Math.max(0, Math.min(height, p.y)),
  };
}

/**
 * Validates and normalizes an Axis-Aligned Bounding Box (AABB).
 */
export function normalizeBoundingBox(box: BoundingBox2D): BoundingBox2D {
  for (const [key, val] of Object.entries(box)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new TypeError(`BoundingBox property '${key}' must be a finite number`);
    }
  }
  return {
    minX: Math.min(box.minX, box.maxX),
    minY: Math.min(box.minY, box.maxY),
    maxX: Math.max(box.minX, box.maxX),
    maxY: Math.max(box.minY, box.maxY),
  };
}

/**
 * Check if two AABBs intersect/overlap.
 */
export function doBoundingBoxesOverlap(b1: BoundingBox2D, b2: BoundingBox2D): boolean {
  const norm1 = normalizeBoundingBox(b1);
  const norm2 = normalizeBoundingBox(b2);

  return (
    norm1.minX <= norm2.maxX &&
    norm1.maxX >= norm2.minX &&
    norm1.minY <= norm2.maxY &&
    norm1.maxY >= norm2.minY
  );
}

/**
 * Compute Intersection-over-Union (IoU) of two bounding boxes.
 */
export function computeBoundingBoxIoU(b1: BoundingBox2D, b2: BoundingBox2D): number {
  const norm1 = normalizeBoundingBox(b1);
  const norm2 = normalizeBoundingBox(b2);

  const interMinX = Math.max(norm1.minX, norm2.minX);
  const interMinY = Math.max(norm1.minY, norm2.minY);
  const interMaxX = Math.min(norm1.maxX, norm2.maxX);
  const interMaxY = Math.min(norm1.maxY, norm2.maxY);

  if (interMinX >= interMaxX || interMinY >= interMaxY) {
    return 0.0; // No overlap
  }

  const interArea = (interMaxX - interMinX) * (interMaxY - interMinY);
  const area1 = (norm1.maxX - norm1.minX) * (norm1.maxY - norm1.minY);
  const area2 = (norm2.maxX - norm2.minX) * (norm2.maxY - norm2.minY);

  const unionArea = area1 + area2 - interArea;
  if (unionArea <= 0.0) return 0.0;

  return Math.min(1.0, Math.max(0.0, interArea / unionArea));
}

/**
 * Gamma-corrected linear alpha blending between two RGBA colors (gamma = 2.2).
 */
export function blendColorsGammaCorrected(
  src: RGBAColor,
  dst: RGBAColor,
  gamma: number = 2.2
): RGBAColor {
  const toLinear = (c: number) => Math.pow(Math.max(0, Math.min(255, c)) / 255.0, gamma);
  const toSRGB = (c: number) => Math.round(Math.pow(Math.max(0, Math.min(1.0, c)), 1.0 / gamma) * 255.0);

  const srcAlpha = Math.max(0.0, Math.min(1.0, src.a));
  const dstAlpha = Math.max(0.0, Math.min(1.0, dst.a));

  const outAlpha = srcAlpha + dstAlpha * (1.0 - srcAlpha);
  if (outAlpha < 1e-6) {
    return { r: 0, g: 0, b: 0, a: 0.0 };
  }

  const blendChannel = (srcVal: number, dstVal: number) => {
    const linSrc = toLinear(srcVal);
    const linDst = toLinear(dstVal);
    const linOut = (linSrc * srcAlpha + linDst * dstAlpha * (1.0 - srcAlpha)) / outAlpha;
    return toSRGB(linOut);
  };

  return {
    r: blendChannel(src.r, dst.r),
    g: blendChannel(src.g, dst.g),
    b: blendChannel(src.b, dst.b),
    a: Math.round(outAlpha * 1000) / 1000,
  };
}
