/**
 * Layer Constraint Solver & Spatial Collision Resolver
 *
 * Implements iterative Axis-Aligned Bounding Box (AABB) collision detection,
 * Minimum Translation Vector (MTV) separation, and container boundary enforcement.
 */

export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPinned?: boolean; // Pinned boxes cannot be displaced
  padding?: number;  // Extra clearance boundary
}

export interface CanvasBoundary {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CollisionPair {
  boxAId: string;
  boxBId: string;
  overlapX: number;
  overlapY: number;
}

export interface SolverOptions {
  maxIterations?: number;
  dampingFactor?: number;
  defaultPadding?: number;
  boundary?: CanvasBoundary;
}

export interface SolverResult {
  boxes: BoundingBox[];
  iterations: number;
  converged: boolean;
  resolvedCollisions: number;
}

/**
 * Checks if two bounding boxes with padding intersect.
 */
export function checkAABBIntersection(
  a: BoundingBox,
  b: BoundingBox,
  defaultPadding: number = 0
): { intersects: boolean; overlapX: number; overlapY: number } {
  const padA = a.padding ?? defaultPadding;
  const padB = b.padding ?? defaultPadding;
  const totalPad = (padA + padB) / 2;

  const aLeft = a.x - totalPad;
  const aRight = a.x + a.width + totalPad;
  const aTop = a.y - totalPad;
  const aBottom = a.y + a.height + totalPad;

  const bLeft = b.x - totalPad;
  const bRight = b.x + b.width + totalPad;
  const bTop = b.y - totalPad;
  const bBottom = b.y + b.height + totalPad;

  const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
  const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

  const epsilon = 1e-3;
  if (overlapX > epsilon && overlapY > epsilon) {
    return { intersects: true, overlapX, overlapY };
  }

  return { intersects: false, overlapX: 0, overlapY: 0 };
}

/**
 * Iterative constraint relaxation solver to resolve all pairwise collisions.
 */
export function resolveSpatialCollisions(
  boxes: BoundingBox[],
  options: SolverOptions = {}
): SolverResult {
  const maxIterations = options.maxIterations ?? 50;
  const damping = options.dampingFactor ?? 1.05;
  const defaultPadding = options.defaultPadding ?? 10;
  const boundary = options.boundary;

  // Clone boxes to prevent mutating caller's inputs
  const resolved: BoundingBox[] = boxes.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    isPinned: Boolean(b.isPinned),
    padding: b.padding ?? defaultPadding,
  }));

  let totalResolved = 0;
  let iteration = 0;
  let converged = false;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    let hadCollisionThisPass = false;

    // Sweep all pairs
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const boxA = resolved[i];
        const boxB = resolved[j];

        // If both are pinned, they cannot be moved
        if (boxA.isPinned && boxB.isPinned) {
          continue;
        }

        const { intersects, overlapX, overlapY } = checkAABBIntersection(
          boxA,
          boxB,
          defaultPadding
        );

        if (intersects) {
          hadCollisionThisPass = true;
          totalResolved++;

          // Minimum Translation Vector: separate along smallest penetration axis
          if (overlapX < overlapY) {
            // Separate horizontally
            const separation = overlapX * damping;
            const dir = (boxA.x + boxA.width / 2) < (boxB.x + boxB.width / 2) ? -1 : 1;

            if (!boxA.isPinned && !boxB.isPinned) {
              boxA.x += (dir * separation) / 2;
              boxB.x -= (dir * separation) / 2;
            } else if (!boxA.isPinned) {
              boxA.x += dir * separation;
            } else if (!boxB.isPinned) {
              boxB.x -= dir * separation;
            }
          } else {
            // Separate vertically
            const separation = overlapY * damping;
            const dir = (boxA.y + boxA.height / 2) < (boxB.y + boxB.height / 2) ? -1 : 1;

            if (!boxA.isPinned && !boxB.isPinned) {
              boxA.y += (dir * separation) / 2;
              boxB.y -= (dir * separation) / 2;
            } else if (!boxA.isPinned) {
              boxA.y += dir * separation;
            } else if (!boxB.isPinned) {
              boxB.y -= dir * separation;
            }
          }
        }
      }
    }

    // Enforce container boundary clamping
    if (boundary) {
      for (const box of resolved) {
        if (!box.isPinned) {
          if (box.x < boundary.minX) box.x = boundary.minX;
          if (box.y < boundary.minY) box.y = boundary.minY;
          if (box.x + box.width > boundary.maxX) box.x = boundary.maxX - box.width;
          if (box.y + box.height > boundary.maxY) box.y = boundary.maxY - box.height;
        }
      }
    }

    if (!hadCollisionThisPass) {
      converged = true;
      break;
    }
  }

  return {
    boxes: resolved,
    iterations: iteration + 1,
    converged,
    resolvedCollisions: totalResolved,
  };
}

/**
 * Computes the total bounding footprint enclosing all layout boxes.
 */
export function computeTotalFootprint(boxes: BoundingBox[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (boxes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const b of boxes) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
