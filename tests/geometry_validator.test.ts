import { describe, it, expect } from 'vitest';
import {
  validateLayoutGeometry,
  snapToGrid,
  boxesIntersect,
  relaxLayoutOverlaps,
  type RectBox,
} from '../src/geometry_validator.js';

describe('Layout Geometry Validator & Constraint Solver', () => {
  it('should snap coordinates to grid correctly', () => {
    expect(snapToGrid(15, 8)).toBe(16);
    expect(snapToGrid(12, 8)).toBe(16);
    expect(snapToGrid(11, 8)).toBe(8);
    expect(snapToGrid(100, 16)).toBe(96);
    expect(snapToGrid(104, 16)).toBe(112);
  });

  it('should validate perfectly aligned, non-overlapping boxes without violations', () => {
    const boxes: RectBox[] = [
      { id: 'header', x: 16, y: 16, width: 200, height: 48 },
      { id: 'sidebar', x: 16, y: 72, width: 80, height: 200 },
      { id: 'content', x: 104, y: 72, width: 300, height: 200 },
    ];

    const result = validateLayoutGeometry(boxes, { gridSize: 8, minMargin: 8 });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('should detect dimension and canvas boundary violations', () => {
    const boxes: RectBox[] = [
      { id: 'tiny', x: 16, y: 16, width: 10, height: 10 }, // Below minWidth (32) and minHeight (24)
      { id: 'out-of-bounds', x: 2000, y: 2000, width: 100, height: 100 }, // Extends beyond 2048
    ];

    const result = validateLayoutGeometry(boxes, { canvasWidth: 2048, canvasHeight: 2048 });
    expect(result.valid).toBe(false);

    const types = result.violations.map((v) => v.type);
    expect(types).toContain('DIMENSION_TOO_SMALL');
    expect(types).toContain('OUT_OF_BOUNDS');
  });

  it('should flag grid misalignments when coordinates do not conform to grid step', () => {
    const boxes: RectBox[] = [
      { id: 'misaligned', x: 17, y: 23, width: 100, height: 50 },
    ];

    const result = validateLayoutGeometry(boxes, { gridSize: 8 });
    expect(result.valid).toBe(false);

    const misaligned = result.violations.find((v) => v.type === 'GRID_MISALIGNMENT');
    expect(misaligned).toBeDefined();
    expect(misaligned?.boxId).toBe('misaligned');
  });

  it('should detect collision when boxes overlap or breach minMargin', () => {
    const boxes: RectBox[] = [
      { id: 'box-a', x: 16, y: 16, width: 100, height: 100 },
      { id: 'box-b', x: 50, y: 50, width: 100, height: 100 },
    ];

    const result = validateLayoutGeometry(boxes, { minMargin: 8 });
    expect(result.valid).toBe(false);

    const collision = result.violations.find((v) => v.type === 'COLLISION');
    expect(collision).toBeDefined();
    expect(collision?.details?.collidedWith).toBe('box-b');
  });

  it('should relax overlapping boxes into non-intersecting grid-aligned coordinates', () => {
    const overlapping: RectBox[] = [
      { id: 'box-1', x: 16, y: 16, width: 100, height: 80 },
      { id: 'box-2', x: 32, y: 32, width: 100, height: 80 },
    ];

    const relaxed = relaxLayoutOverlaps(overlapping, { gridSize: 8, minMargin: 8 });
    expect(relaxed).toHaveLength(2);

    // After relaxation, boxes should no longer intersect
    expect(boxesIntersect(relaxed[0], relaxed[1], 8)).toBe(false);
    expect(relaxed[0].x % 8).toBe(0);
    expect(relaxed[1].x % 8).toBe(0);
  });
});
