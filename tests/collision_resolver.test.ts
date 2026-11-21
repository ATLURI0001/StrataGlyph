import { describe, expect, it } from "vitest";
import {
  type BoundingBox,
  checkAABBIntersection,
  computeTotalFootprint,
  resolveSpatialCollisions,
} from "../src/collision_resolver.ts";

describe("Layer Constraint Solver & Spatial Collision Resolver", () => {
  describe("checkAABBIntersection", () => {
    it("should return false for completely disjoint boxes", () => {
      const b1: BoundingBox = { id: "1", x: 0, y: 0, width: 50, height: 50 };
      const b2: BoundingBox = { id: "2", x: 100, y: 100, width: 50, height: 50 };

      const res = checkAABBIntersection(b1, b2, 0);
      expect(res.intersects).toBe(false);
      expect(res.overlapX).toBe(0);
      expect(res.overlapY).toBe(0);
    });

    it("should detect spatial overlap and calculate penetration dimensions", () => {
      const b1: BoundingBox = { id: "1", x: 0, y: 0, width: 50, height: 50 };
      const b2: BoundingBox = { id: "2", x: 40, y: 20, width: 50, height: 50 };

      const res = checkAABBIntersection(b1, b2, 0);
      expect(res.intersects).toBe(true);
      expect(res.overlapX).toBe(10); // 50 - 40
      expect(res.overlapY).toBe(30); // 50 - 20
    });

    it("should consider padding clearance when detecting intersections", () => {
      const b1: BoundingBox = { id: "1", x: 0, y: 0, width: 50, height: 50 };
      const b2: BoundingBox = { id: "2", x: 55, y: 0, width: 50, height: 50 };

      // 5px gap between them; with 0 padding -> no intersection
      expect(checkAABBIntersection(b1, b2, 0).intersects).toBe(false);

      // With 10px padding -> clearance violation detected
      expect(checkAABBIntersection(b1, b2, 10).intersects).toBe(true);
    });
  });

  describe("resolveSpatialCollisions", () => {
    it("should separate two overlapping unpinned boxes symmetrically", () => {
      const boxes: BoundingBox[] = [
        { id: "A", x: 0, y: 0, width: 50, height: 50 },
        { id: "B", x: 20, y: 0, width: 50, height: 50 },
      ];

      const res = resolveSpatialCollisions(boxes, { defaultPadding: 0, maxIterations: 10 });
      expect(res.converged).toBe(true);
      expect(res.resolvedCollisions).toBeGreaterThan(0);

      // Verify no remaining collision after resolution
      const check = checkAABBIntersection(res.boxes[0], res.boxes[1], 0);
      expect(check.intersects).toBe(false);

      // Box A should have shifted left, Box B shifted right
      expect(res.boxes[0].x).toBeLessThan(0);
      expect(res.boxes[1].x).toBeGreaterThan(20);
    });

    it("should displace only the unpinned box when colliding with a pinned box", () => {
      const boxes: BoundingBox[] = [
        { id: "PINNED", x: 100, y: 100, width: 50, height: 50, isPinned: true },
        { id: "MOBILE", x: 120, y: 110, width: 50, height: 50, isPinned: false },
      ];

      const res = resolveSpatialCollisions(boxes, { defaultPadding: 0 });
      expect(res.converged).toBe(true);

      const pinnedRes = res.boxes.find((b) => b.id === "PINNED")!;
      const mobileRes = res.boxes.find((b) => b.id === "MOBILE")!;

      // Pinned box must remain completely static
      expect(pinnedRes.x).toBe(100);
      expect(pinnedRes.y).toBe(100);

      // Mobile box must have been displaced to resolve collision
      const check = checkAABBIntersection(pinnedRes, mobileRes, 0);
      expect(check.intersects).toBe(false);
    });

    it("should enforce canvas boundaries during relaxation", () => {
      const boundary = { minX: 0, minY: 0, maxX: 200, maxY: 200 };
      const boxes: BoundingBox[] = [
        { id: "1", x: 10, y: 10, width: 60, height: 60 },
        { id: "2", x: 20, y: 10, width: 60, height: 60 },
      ];

      const res = resolveSpatialCollisions(boxes, { boundary, defaultPadding: 0 });
      expect(res.converged).toBe(true);

      for (const b of res.boxes) {
        expect(b.x).toBeGreaterThanOrEqual(boundary.minX);
        expect(b.y).toBeGreaterThanOrEqual(boundary.minY);
        expect(b.x + b.width).toBeLessThanOrEqual(boundary.maxX);
        expect(b.y + b.height).toBeLessThanOrEqual(boundary.maxY);
      }
    });
  });

  describe("computeTotalFootprint", () => {
    it("should compute exact enclosing canvas dimensions", () => {
      const boxes: BoundingBox[] = [
        { id: "1", x: 10, y: 20, width: 100, height: 50 },
        { id: "2", x: 50, y: 150, width: 80, height: 60 },
      ];

      const footprint = computeTotalFootprint(boxes);
      expect(footprint.minX).toBe(10);
      expect(footprint.minY).toBe(20);
      expect(footprint.maxX).toBe(130); // 50 + 80
      expect(footprint.maxY).toBe(210); // 150 + 60
      expect(footprint.width).toBe(120); // 130 - 10
      expect(footprint.height).toBe(190); // 210 - 20
    });
  });
});
