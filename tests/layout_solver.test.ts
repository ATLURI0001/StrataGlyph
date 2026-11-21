import { describe, it, expect } from 'vitest';
import {
  ForceDirectedLayoutSolver,
  segmentsIntersect,
  countEdgeCrossings,
  type LayoutNode,
  type LayoutEdge,
} from '../src/layout_solver.js';

describe('ForceDirectedLayoutSolver & Edge Crossings', () => {
  it('should correctly detect line segment intersections', () => {
    // Intersecting X
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 10, y: 10 };
    const p3 = { x: 0, y: 10 };
    const p4 = { x: 10, y: 0 };
    expect(segmentsIntersect(p1, p2, p3, p4)).toBe(true);

    // Parallel lines
    const p5 = { x: 0, y: 0 };
    const p6 = { x: 10, y: 0 };
    const p7 = { x: 0, y: 5 };
    const p8 = { x: 10, y: 5 };
    expect(segmentsIntersect(p5, p6, p7, p8)).toBe(false);
  });

  it('should count edge crossings accurately in a graph', () => {
    const nodes = new Map<string, LayoutNode>([
      ['n1', { id: 'n1', x: 0, y: 0 }],
      ['n2', { id: 'n2', x: 100, y: 100 }],
      ['n3', { id: 'n3', x: 0, y: 100 }],
      ['n4', { id: 'n4', x: 100, y: 0 }],
    ]);

    const edges: LayoutEdge[] = [
      { from: 'n1', to: 'n2' }, // diagonal 1
      { from: 'n3', to: 'n4' }, // diagonal 2
    ];

    expect(countEdgeCrossings(nodes, edges)).toBe(1);

    // Share common vertex: not considered a crossing
    const sharedEdges: LayoutEdge[] = [
      { from: 'n1', to: 'n2' },
      { from: 'n1', to: 'n3' },
    ];
    expect(countEdgeCrossings(nodes, sharedEdges)).toBe(0);
  });

  it('should solve layout and separate clustered nodes with simulated annealing', () => {
    const solver = new ForceDirectedLayoutSolver({
      iterations: 50,
      idealLength: 100,
    });

    // 3 nodes starting almost at the exact same point
    const initialNodes: LayoutNode[] = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 1, y: 1 },
      { id: 'c', x: -1, y: -1 },
    ];

    const edges: LayoutEdge[] = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];

    const { nodes, telemetry } = solver.solve(initialNodes, edges);

    expect(nodes.length).toBe(3);
    expect(telemetry.iterationsExecuted).toBeGreaterThan(0);

    // Nodes should have been pushed apart by Coulomb repulsion
    const [na, nb, nc] = nodes;
    const distAB = Math.hypot(nb.x - na.x, nb.y - na.y);
    const distBC = Math.hypot(nc.x - nb.x, nc.y - nb.y);

    expect(distAB).toBeGreaterThan(10);
    expect(distBC).toBeGreaterThan(10);
    expect(telemetry.bounds.maxX).toBeGreaterThan(telemetry.bounds.minX);
  });

  it('should handle empty graph gracefully', () => {
    const solver = new ForceDirectedLayoutSolver();
    const { nodes, telemetry } = solver.solve([], []);
    expect(nodes).toEqual([]);
    expect(telemetry.iterationsExecuted).toBe(0);
  });
});
