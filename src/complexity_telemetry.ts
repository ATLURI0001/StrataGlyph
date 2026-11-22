/**
 * Diagram Complexity Telemetry & Layout Node Density Diagnostic.
 * Computes graph topology metrics, edge densities, canvas visual congestion,
 * and layout complexity diagnostics for architectural diagrams.
 */

export type ComplexityDiagnosticTier = 'SPARSE' | 'OPTIMAL' | 'DENSE' | 'CONGESTED';

export interface DiagramInputSpec {
  nodes?: Array<{ id: string; label?: string; x?: number; y?: number }>;
  edges?: Array<{ from: string; to: string; label?: string }>;
  groups?: Array<{ id: string; members?: string[] }>;
  width?: number;
  height?: number;
}

export interface DiagramComplexityMetrics {
  nodeCount: number;
  edgeCount: number;
  groupCount: number;
  canvasArea: number;
  nodesPerMegapixel: number;
  edgeDensityRatio: number;
  cyclomaticComplexity: number;
  connectedComponents: number;
  maxDegree: number;
  averageDegree: number;
  diagnosticTier: ComplexityDiagnosticTier;
  advisories: string[];
}

/**
 * Computes topological complexity, spatial density, and diagnostic tier for an architectural diagram.
 */
export function computeDiagramComplexity(spec: DiagramInputSpec = {}): DiagramComplexityMetrics {
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec.edges) ? spec.edges : [];
  const groups = Array.isArray(spec.groups) ? spec.groups : [];

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const groupCount = groups.length;

  const width = typeof spec.width === 'number' && spec.width > 0 ? spec.width : 1200;
  const height = typeof spec.height === 'number' && spec.height > 0 ? spec.height : 800;
  const canvasArea = width * height;

  const nodesPerMegapixel = canvasArea > 0
    ? Number(((nodeCount / canvasArea) * 1_000_000).toFixed(2))
    : 0;

  // Maximum potential undirected edges in a graph with N nodes: N * (N - 1) / 2
  const maxPossibleEdges = nodeCount > 1 ? (nodeCount * (nodeCount - 1)) / 2 : 1;
  const edgeDensityRatio = nodeCount > 1
    ? Number((edgeCount / maxPossibleEdges).toFixed(4))
    : 0;

  // Build adjacency list to calculate connected components and node degrees
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) {
    if (n && n.id) {
      adj.set(n.id, new Set());
    }
  }

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const e of edges) {
    if (!e || !e.from || !e.to) continue;
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());

    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from); // undirected connectivity for components

    outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  }

  // Count connected components via BFS
  const visited = new Set<string>();
  let connectedComponents = 0;

  for (const nodeId of adj.keys()) {
    if (!visited.has(nodeId)) {
      connectedComponents++;
      const queue = [nodeId];
      visited.add(nodeId);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = adj.get(curr);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }
    }
  }

  // Handle completely disconnected nodes that weren't in edges
  if (nodes.length > 0 && connectedComponents === 0) {
    connectedComponents = nodes.length;
  }

  // Maximum and average total degree
  let maxDegree = 0;
  let totalDegrees = 0;
  for (const [id, neighbors] of adj.entries()) {
    const deg = neighbors.size;
    if (deg > maxDegree) maxDegree = deg;
    totalDegrees += deg;
  }
  const averageDegree = adj.size > 0 ? Number((totalDegrees / adj.size).toFixed(2)) : 0;

  // Cyclomatic complexity M = E - V + 2P (where P is connected components)
  const cyclomaticComplexity = Math.max(1, edgeCount - nodeCount + (2 * (connectedComponents || 1)));

  // Diagnostic Tier Assessment
  let diagnosticTier: ComplexityDiagnosticTier = 'OPTIMAL';
  const advisories: string[] = [];

  if (nodeCount <= 3 && edgeCount <= 2) {
    diagnosticTier = 'SPARSE';
  } else if (nodeCount > 50 || nodesPerMegapixel > 150 || maxDegree > 12) {
    diagnosticTier = 'CONGESTED';
    advisories.push('Diagram exhibits high node density or severe hub bottlenecking (>12 connected edges)');
    advisories.push('Consider decomposing into modular sub-views or container groups');
  } else if (nodeCount > 25 || nodesPerMegapixel > 75 || edgeDensityRatio > 0.4) {
    diagnosticTier = 'DENSE';
    advisories.push('High layout density; routing and label collisions may occur without increased canvas dimensions');
  } else {
    diagnosticTier = 'OPTIMAL';
  }

  if (connectedComponents > 5) {
    advisories.push(`Diagram contains ${connectedComponents} disjoint graphs; verify cross-component relationships`);
  }

  return {
    nodeCount,
    edgeCount,
    groupCount,
    canvasArea,
    nodesPerMegapixel,
    edgeDensityRatio,
    cyclomaticComplexity,
    connectedComponents,
    maxDegree,
    averageDegree,
    diagnosticTier,
    advisories,
  };
}

/**
 * Formats a diagnostic summary into a structured ASCII diagnostic text report.
 */
export function formatComplexityDiagnostic(metrics: DiagramComplexityMetrics): string {
  const lines = [
    `=== Diagram Complexity Diagnostic [${metrics.diagnosticTier}] ===`,
    `Nodes: ${metrics.nodeCount} | Edges: ${metrics.edgeCount} | Groups: ${metrics.groupCount}`,
    `Canvas Area: ${metrics.canvasArea.toLocaleString()} px² (${metrics.nodesPerMegapixel} nodes/Mpx)`,
    `Edge Density: ${(metrics.edgeDensityRatio * 100).toFixed(1)}% | Cyclomatic Complexity: ${metrics.cyclomaticComplexity}`,
    `Connected Components: ${metrics.connectedComponents} | Max Node Degree: ${metrics.maxDegree} (Avg: ${metrics.averageDegree})`,
  ];

  if (metrics.advisories.length > 0) {
    lines.push('Advisories:');
    for (const adv of metrics.advisories) {
      lines.push(`  * ${adv}`);
    }
  }

  return lines.join('\n');
}
