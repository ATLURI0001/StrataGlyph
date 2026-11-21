/**
 * Resilient Layout Geometry Validator & Grid Constraint Solver for StrataGlyph.
 */

export interface RectBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
}

export interface GeometryValidationOptions {
  gridSize?: number;
  minWidth?: number;
  minHeight?: number;
  minMargin?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

export type ViolationType =
  | 'OUT_OF_BOUNDS'
  | 'COLLISION'
  | 'DIMENSION_TOO_SMALL'
  | 'GRID_MISALIGNMENT';

export interface GeometryViolation {
  boxId: string;
  type: ViolationType;
  message: string;
  details?: Record<string, unknown>;
}

export interface GeometryValidationResult {
  valid: boolean;
  violations: GeometryViolation[];
  relaxedBoxes: RectBox[];
}

export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 1) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function boxesIntersect(a: RectBox, b: RectBox, minMargin: number = 0): boolean {
  return !(
    a.x + a.width + minMargin <= b.x ||
    b.x + b.width + minMargin <= a.x ||
    a.y + a.height + minMargin <= b.y ||
    b.y + b.height + minMargin <= a.y
  );
}

/**
 * Validates bounding boxes against layout geometry constraints, canvas bounds, and grid snapping.
 */
export function validateLayoutGeometry(
  boxes: RectBox[],
  options: GeometryValidationOptions = {}
): GeometryValidationResult {
  const gridSize = options.gridSize && options.gridSize > 0 ? options.gridSize : 8;
  const minWidth = options.minWidth && options.minWidth > 0 ? options.minWidth : 32;
  const minHeight = options.minHeight && options.minHeight > 0 ? options.minHeight : 24;
  const minMargin = options.minMargin ?? 8;
  const canvasWidth = options.canvasWidth ?? 2048;
  const canvasHeight = options.canvasHeight ?? 2048;

  const violations: GeometryViolation[] = [];

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];

    // Minimum dimension checks
    if (box.width < minWidth || box.height < minHeight) {
      violations.push({
        boxId: box.id,
        type: 'DIMENSION_TOO_SMALL',
        message: `Box '${box.id}' dimensions (${box.width}x${box.height}) below minimum allowable (${minWidth}x${minHeight})`,
      });
    }

    // Canvas containment bounds
    if (
      box.x < 0 ||
      box.y < 0 ||
      box.x + box.width > canvasWidth ||
      box.y + box.height > canvasHeight
    ) {
      violations.push({
        boxId: box.id,
        type: 'OUT_OF_BOUNDS',
        message: `Box '${box.id}' extends outside canvas boundary [0, 0, ${canvasWidth}, ${canvasHeight}]`,
      });
    }

    // Grid alignment verification
    if (box.x % gridSize !== 0 || box.y % gridSize !== 0) {
      violations.push({
        boxId: box.id,
        type: 'GRID_MISALIGNMENT',
        message: `Box '${box.id}' coordinates (${box.x}, ${box.y}) not aligned to ${gridSize}px grid`,
      });
    }

    // Pairwise overlap / collision check
    for (let j = i + 1; j < boxes.length; j++) {
      const other = boxes[j];
      if (boxesIntersect(box, other, minMargin)) {
        violations.push({
          boxId: box.id,
          type: 'COLLISION',
          message: `Box '${box.id}' overlaps with '${other.id}' violating minimum margin ${minMargin}px`,
          details: { collidedWith: other.id },
        });
      }
    }
  }

  const relaxedBoxes = relaxLayoutOverlaps(boxes, {
    gridSize,
    minMargin,
    canvasWidth,
    canvasHeight,
  });

  return {
    valid: violations.length === 0,
    violations,
    relaxedBoxes,
  };
}

/**
 * Non-destructive relaxation: shifts overlapping boxes along the minimum displacement axis
 * and snaps resulting coordinates to the designated grid.
 */
export function relaxLayoutOverlaps(
  boxes: RectBox[],
  options: {
    gridSize?: number;
    minMargin?: number;
    canvasWidth?: number;
    canvasHeight?: number;
  } = {}
): RectBox[] {
  const gridSize = options.gridSize ?? 8;
  const minMargin = options.minMargin ?? 8;
  const canvasWidth = options.canvasWidth ?? 2048;
  const canvasHeight = options.canvasHeight ?? 2048;

  // Clone boxes so original input remains immutable
  const adjusted: RectBox[] = boxes.map((b) => ({
    ...b,
    x: snapToGrid(b.x, gridSize),
    y: snapToGrid(b.y, gridSize),
  }));

  let passes = 0;
  const maxPasses = 10;
  let hasOverlap = true;

  while (hasOverlap && passes < maxPasses) {
    hasOverlap = false;
    passes++;

    for (let i = 0; i < adjusted.length; i++) {
      for (let j = i + 1; j < adjusted.length; j++) {
        const a = adjusted[i];
        const b = adjusted[j];

        if (boxesIntersect(a, b, minMargin)) {
          hasOverlap = true;

          // Displace along horizontal axis if horizontal overlap is smaller, else vertical
          const overlapX = a.x < b.x ? a.x + a.width + minMargin - b.x : b.x + b.width + minMargin - a.x;
          const overlapY = a.y < b.y ? a.y + a.height + minMargin - b.y : b.y + b.height + minMargin - a.y;

          if (overlapX <= overlapY) {
            // Displace b rightwards
            b.x = snapToGrid(Math.min(canvasWidth - b.width, b.x + overlapX), gridSize);
          } else {
            // Displace b downwards
            b.y = snapToGrid(Math.min(canvasHeight - b.height, b.y + overlapY), gridSize);
          }
        }
      }
    }
  }

  return adjusted;
}
