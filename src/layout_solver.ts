/**
 * StrataGlyph: Force-Directed Hierarchical Graph Layout Solver & Edge Crossing Minimizer
 * Implements Coulomb-Hooke physics simulation with simulated annealing cooling and edge crossing diagnostics.
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  mass?: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  weight?: number;
}

export interface ForceSolverConfig {
  iterations?: number;
  repulsionConstant?: number; // kr
  springConstant?: number;    // ks
  idealLength?: number;       // l0
  initialTemperature?: number;
  coolingFactor?: number;     // alpha
  minMovementEpsilon?: number;
}

export interface SolverTelemetry {
  iterationsExecuted: number;
  initialCrossings: number;
  finalCrossings: number;
  initialEnergy: number;
  finalEnergy: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Checks if two line segments (p1-p2) and (p3-p4) intersect.
 */
export function segmentsIntersect(p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): boolean {
  function ccw(a: Point2D, b: Point2D, c: Point2D): boolean {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  }

  const ccw1 = ccw(p1, p3, p4);
  const ccw2 = ccw(p2, p3, p4);
  const ccw3 = ccw(p1, p2, p3);
  const ccw4 = ccw(p1, p2, p4);

  return ccw1 !== ccw2 && ccw3 !== ccw4;
}

/**
 * Counts total edge crossing intersections among non-adjacent edges in a graph.
 */
export function countEdgeCrossings(nodes: Map<string, LayoutNode>, edges: LayoutEdge[]): number {
  let crossings = 0;
  const n = edges.length;

  for (let i = 0; i < n; i++) {
    const e1 = edges[i];
    const u1 = nodes.get(e1.from);
    const v1 = nodes.get(e1.to);
    if (!u1 || !v1) continue;

    for (let j = i + 1; j < n; j++) {
      const e2 = edges[j];
      // Skip if edges share a common vertex
      if (e1.from === e2.from || e1.from === e2.to || e1.to === e2.from || e1.to === e2.to) {
        continue;
      }

      const u2 = nodes.get(e2.from);
      const v2 = nodes.get(e2.to);
      if (!u2 || !v2) continue;

      if (segmentsIntersect(u1, v1, u2, v2)) {
        crossings++;
      }
    }
  }

  return crossings;
}

export class ForceDirectedLayoutSolver {
  private config: Required<ForceSolverConfig>;

  constructor(config: ForceSolverConfig = {}) {
    this.config = {
      iterations: config.iterations ?? 100,
      repulsionConstant: config.repulsionConstant ?? 5000,
      springConstant: config.springConstant ?? 0.05,
      idealLength: config.idealLength ?? 120,
      initialTemperature: config.initialTemperature ?? 50.0,
      coolingFactor: config.coolingFactor ?? 0.95,
      minMovementEpsilon: config.minMovementEpsilon ?? 0.01,
    };
  }

  public solve(
    initialNodes: LayoutNode[],
    edges: LayoutEdge[]
  ): { nodes: LayoutNode[]; telemetry: SolverTelemetry } {
    if (initialNodes.length === 0) {
      return {
        nodes: [],
        telemetry: {
          iterationsExecuted: 0,
          initialCrossings: 0,
          finalCrossings: 0,
          initialEnergy: 0,
          finalEnergy: 0,
          bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        },
      };
    }

    const nodeMap = new Map<string, LayoutNode>();
    for (const n of initialNodes) {
      nodeMap.set(n.id, { ...n });
    }

    const initialCrossings = countEdgeCrossings(nodeMap, edges);
    const initialEnergy = this.computeTotalEnergy(nodeMap, edges);

    let temperature = this.config.initialTemperature;
    let iterationsRun = 0;

    for (let iter = 0; iter < this.config.iterations; iter++) {
      iterationsRun++;
      const forces = new Map<string, { fx: number; fy: number }>();
      for (const id of nodeMap.keys()) {
        forces.set(id, { fx: 0, fy: 0 });
      }

      const nodeList = Array.from(nodeMap.values());

      // 1. Coulomb Repulsion between all node pairs
      for (let i = 0; i < nodeList.length; i++) {
        for (let j = i + 1; j < nodeList.length; j++) {
          const u = nodeList[i];
          const v = nodeList[j];

          const dx = v.x - u.x;
          const dy = v.y - u.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.max(1.0, Math.sqrt(distSq));

          const repForce = this.config.repulsionConstant / (dist * dist);
          const fX = (dx / dist) * repForce;
          const fY = (dy / dist) * repForce;

          const fu = forces.get(u.id)!;
          const fv = forces.get(v.id)!;

          fu.fx -= fX;
          fu.fy -= fY;
          fv.fx += fX;
          fv.fy += fY;
        }
      }

      // 2. Hooke Spring Attraction between connected edge nodes
      for (const edge of edges) {
        const u = nodeMap.get(edge.from);
        const v = nodeMap.get(edge.to);
        if (!u || !v) continue;

        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const dist = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));

        const displacement = dist - this.config.idealLength;
        const springForce = this.config.springConstant * displacement * (edge.weight ?? 1.0);

        const fX = (dx / dist) * springForce;
        const fY = (dy / dist) * springForce;

        const fu = forces.get(u.id)!;
        const fv = forces.get(v.id)!;

        fu.fx += fX;
        fu.fy += fY;
        fv.fx -= fX;
        fv.fy -= fY;
      }

      // 3. Update Positions with Temperature Clamping
      let maxDisplacement = 0;
      for (const node of nodeList) {
        const f = forces.get(node.id)!;
        const forceMagnitude = Math.sqrt(f.fx * f.fx + f.fy * f.fy);
        if (forceMagnitude > 0) {
          const step = Math.min(temperature, forceMagnitude);
          const dx = (f.fx / forceMagnitude) * step;
          const dy = (f.fy / forceMagnitude) * step;

          node.x += dx;
          node.y += dy;
          maxDisplacement = Math.max(maxDisplacement, step);
        }
      }

      // Cool simulated annealing temperature
      temperature *= this.config.coolingFactor;

      if (maxDisplacement < this.config.minMovementEpsilon) {
        break; // Early convergence
      }
    }

    const finalCrossings = countEdgeCrossings(nodeMap, edges);
    const finalEnergy = this.computeTotalEnergy(nodeMap, edges);

    // Compute bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const node of nodeMap.values()) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }

    return {
      nodes: Array.from(nodeMap.values()),
      telemetry: {
        iterationsExecuted: iterationsRun,
        initialCrossings,
        finalCrossings,
        initialEnergy,
        finalEnergy,
        bounds: {
          minX: Math.round(minX * 10) / 10,
          maxX: Math.round(maxX * 10) / 10,
          minY: Math.round(minY * 10) / 10,
          maxY: Math.round(maxY * 10) / 10,
        },
      },
    };
  }

  private computeTotalEnergy(nodes: Map<string, LayoutNode>, edges: LayoutEdge[]): number {
    let energy = 0;
    for (const edge of edges) {
      const u = nodes.get(edge.from);
      const v = nodes.get(edge.to);
      if (!u || !v) continue;
      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const disp = dist - this.config.idealLength;
      energy += 0.5 * this.config.springConstant * disp * disp;
    }
    return Math.round(energy * 100) / 100;
  }
}
