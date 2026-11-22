import { describe, it, expect } from 'vitest';
import {
  computeDiagramComplexity,
  formatComplexityDiagnostic,
  type DiagramInputSpec,
} from '../src/complexity_telemetry.js';

describe('Diagram Complexity Telemetry Suite', () => {
  it('computes metrics for empty or sparse specifications', () => {
    const emptySpec: DiagramInputSpec = {};
    const metrics = computeDiagramComplexity(emptySpec);

    expect(metrics.nodeCount).toBe(0);
    expect(metrics.edgeCount).toBe(0);
    expect(metrics.diagnosticTier).toBe('SPARSE');
    expect(metrics.nodesPerMegapixel).toBe(0);
    expect(metrics.connectedComponents).toBe(0);
  });

  it('computes balanced architecture metrics and OPTIMAL tier', () => {
    const spec: DiagramInputSpec = {
      nodes: [
        { id: 'client' },
        { id: 'gateway' },
        { id: 'auth_service' },
        { id: 'order_service' },
        { id: 'database' },
      ],
      edges: [
        { from: 'client', to: 'gateway' },
        { from: 'gateway', to: 'auth_service' },
        { from: 'gateway', to: 'order_service' },
        { from: 'order_service', to: 'database' },
      ],
      groups: [{ id: 'backend', members: ['auth_service', 'order_service'] }],
      width: 1200,
      height: 800,
    };

    const metrics = computeDiagramComplexity(spec);

    expect(metrics.nodeCount).toBe(5);
    expect(metrics.edgeCount).toBe(4);
    expect(metrics.groupCount).toBe(1);
    expect(metrics.connectedComponents).toBe(1);
    expect(metrics.maxDegree).toBe(3); // gateway connects to client, auth, and order
    expect(metrics.diagnosticTier).toBe('OPTIMAL');
    expect(metrics.cyclomaticComplexity).toBe(1); // 4 - 5 + 2*1 = 1
  });

  it('detects disjoint connected components', () => {
    const spec: DiagramInputSpec = {
      nodes: [
        { id: 'sub_a1' },
        { id: 'sub_a2' },
        { id: 'sub_b1' },
        { id: 'sub_b2' },
      ],
      edges: [
        { from: 'sub_a1', to: 'sub_a2' },
        { from: 'sub_b1', to: 'sub_b2' },
      ],
    };

    const metrics = computeDiagramComplexity(spec);
    expect(metrics.connectedComponents).toBe(2);
  });

  it('classifies CONGESTED diagrams with hub bottleneck or extreme density', () => {
    const nodes = [];
    const edges = [];
    nodes.push({ id: 'central_hub' });
    for (let i = 1; i <= 20; i++) {
      nodes.push({ id: `worker_${i}` });
      edges.push({ from: 'central_hub', to: `worker_${i}` });
    }

    const spec: DiagramInputSpec = {
      nodes,
      edges,
      width: 400,
      height: 300, // Small canvas: 400 * 300 = 120,000 px² (density = 21 / 0.12 = 175 nodes/Mpx)
    };

    const metrics = computeDiagramComplexity(spec);
    expect(metrics.diagnosticTier).toBe('CONGESTED');
    expect(metrics.maxDegree).toBe(20);
    expect(metrics.advisories.length).toBeGreaterThan(0);
    expect(metrics.advisories[0]).toContain('hub bottlenecking');
  });

  it('formats ASCII diagnostic report cleanly', () => {
    const spec: DiagramInputSpec = {
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b' }],
    };

    const metrics = computeDiagramComplexity(spec);
    const report = formatComplexityDiagnostic(metrics);

    expect(report).toContain('=== Diagram Complexity Diagnostic [SPARSE] ===');
    expect(report).toContain('Nodes: 2 | Edges: 1');
    expect(report).toContain('Edge Density: 100.0%');
  });
});
