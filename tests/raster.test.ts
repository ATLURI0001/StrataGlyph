import { describe, expect, it } from 'vitest';
import {
  blendColorsGammaCorrected,
  clampPointToCanvas,
  computeBoundingBoxIoU,
  doBoundingBoxesOverlap,
  normalizeBoundingBox,
  snapToSubpixelGrid,
} from '../src/raster';

describe('StrataGlyph Subpixel Rasterizer & Bounding Engine', () => {
  it('snapToSubpixelGrid snaps coordinates accurately', () => {
    expect(snapToSubpixelGrid(10.12, 0.25)).toBe(10.0);
    expect(snapToSubpixelGrid(10.13, 0.25)).toBe(10.25);
    expect(snapToSubpixelGrid(10.37, 0.25)).toBe(10.25);
    expect(snapToSubpixelGrid(10.38, 0.25)).toBe(10.5);

    expect(() => snapToSubpixelGrid(NaN)).toThrow(TypeError);
    expect(() => snapToSubpixelGrid(10, 0)).toThrow(RangeError);
  });

  it('clampPointToCanvas confines points within canvas bounds', () => {
    expect(clampPointToCanvas({ x: 50, y: 50 }, 100, 100)).toEqual({ x: 50, y: 50 });
    expect(clampPointToCanvas({ x: -10, y: 150 }, 100, 100)).toEqual({ x: 0, y: 100 });
    expect(() => clampPointToCanvas({ x: 0, y: 0 }, 0, 100)).toThrow(RangeError);
  });

  it('normalizeBoundingBox orders inverted coordinate pairs', () => {
    const inverted = { minX: 100, minY: 200, maxX: 50, maxY: 100 };
    const normalized = normalizeBoundingBox(inverted);
    expect(normalized).toEqual({ minX: 50, minY: 100, maxX: 100, maxY: 200 });
  });

  it('doBoundingBoxesOverlap detects intersections and disjoint boxes', () => {
    const box1 = { minX: 0, minY: 0, maxX: 50, maxY: 50 };
    const box2 = { minX: 25, minY: 25, maxX: 75, maxY: 75 };
    const box3 = { minX: 60, minY: 60, maxX: 100, maxY: 100 };

    expect(doBoundingBoxesOverlap(box1, box2)).toBe(true);
    expect(doBoundingBoxesOverlap(box1, box3)).toBe(false);
  });

  it('computeBoundingBoxIoU computes exact Intersection-over-Union metrics', () => {
    const box1 = { minX: 0, minY: 0, maxX: 10, maxY: 10 }; // Area = 100
    const box2 = { minX: 0, minY: 0, maxX: 10, maxY: 10 }; // Identical -> IoU = 1.0
    expect(computeBoundingBoxIoU(box1, box2)).toBe(1.0);

    const disjoint = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(computeBoundingBoxIoU(box1, disjoint)).toBe(0.0);

    // Partial overlap: box1 [0, 10], box3 [5, 15] in X, [0, 10] in Y
    // Inter = 5 * 10 = 50. Union = 100 + 100 - 50 = 150. IoU = 50 / 150 = 1/3 ~ 0.3333
    const box3 = { minX: 5, minY: 0, maxX: 15, maxY: 10 };
    expect(computeBoundingBoxIoU(box1, box3)).toBeCloseTo(1 / 3, 4);
  });

  it('blendColorsGammaCorrected blends RGBA colors in linear space', () => {
    const white = { r: 255, g: 255, b: 255, a: 1.0 };
    const black = { r: 0, g: 0, b: 0, a: 1.0 };

    // 100% opaque source replaces destination
    const opaqueBlend = blendColorsGammaCorrected(white, black);
    expect(opaqueBlend).toEqual({ r: 255, g: 255, b: 255, a: 1.0 });

    // 0% source preserves destination
    const transparentSource = { r: 255, g: 255, b: 255, a: 0.0 };
    const destPreserved = blendColorsGammaCorrected(transparentSource, black);
    expect(destPreserved).toEqual({ r: 0, g: 0, b: 0, a: 1.0 });

    // 50% opacity blend in gamma 2.2 linear space
    // Linear midpoint: 0.5^(1/2.2) * 255 ~ 186 sRGB (perceptually correct, not raw 127/128)
    const semiWhite = { r: 255, g: 255, b: 255, a: 0.5 };
    const midBlend = blendColorsGammaCorrected(semiWhite, black);
    expect(midBlend.r).toBeGreaterThan(180);
    expect(midBlend.r).toBeLessThan(190);
    expect(midBlend.a).toBe(1.0);
  });
});
