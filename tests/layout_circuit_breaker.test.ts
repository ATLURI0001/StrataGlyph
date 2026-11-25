import { describe, it, expect, beforeEach } from "vitest";
import {
  LayoutCircuitBreaker,
  BreakerNode,
  BreakerEdge,
} from "../src/layout_circuit_breaker";

describe("LayoutCircuitBreaker", () => {
  let breaker: LayoutCircuitBreaker;
  const sampleNodes: BreakerNode[] = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 10, y: 10 },
    { id: "C", x: 20, y: 20 },
  ];
  const sampleEdges: BreakerEdge[] = [
    { from: "A", to: "B" },
    { from: "B", to: "C" },
  ];

  beforeEach(() => {
    breaker = new LayoutCircuitBreaker({
      failureThreshold: 2,
      recoveryTimeoutMs: 1000,
      maxExecutionTimeMs: 20,
      maxCanvasDimension: 5000,
      gridFallbackCellSize: 100,
      gridFallbackColumns: 2,
    });
  });

  it("successfully passes healthy solver execution in CLOSED state", () => {
    const result = breaker.execute(sampleNodes, sampleEdges, (nodes) => {
      return nodes.map((n) => ({ ...n, x: n.x + 50, y: n.y + 50 }));
    });

    expect(result.usedFallback).toBe(false);
    expect(result.breakerState).toBe("CLOSED");
    expect(result.nodes[0].x).toBe(50);
  });

  it("intercepts exception and delivers deterministic grid fallback", () => {
    const result = breaker.execute(sampleNodes, sampleEdges, () => {
      throw new Error("Simulated solver crash");
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe("UNHANDLED_EXCEPTION");
    expect(result.nodes.length).toBe(3);
    // Verify grid layout structure: 2 columns
    expect(result.nodes[0]).toMatchObject({ id: "A", x: 50, y: 50 });
    expect(result.nodes[1]).toMatchObject({ id: "B", x: 150, y: 50 });
    expect(result.nodes[2]).toMatchObject({ id: "C", x: 50, y: 150 });
  });

  it("intercepts coordinate explosion (NaN / Infinity) and falls back", () => {
    const result = breaker.execute(sampleNodes, sampleEdges, (nodes) => {
      return nodes.map((n) => ({ ...n, x: NaN, y: Infinity }));
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe("COORDINATE_EXPLOSION");
    expect(result.nodes[0].x).toBe(50);
  });

  it("intercepts canvas bounds overflow and falls back", () => {
    const result = breaker.execute(sampleNodes, sampleEdges, (nodes) => {
      return nodes.map((n) => ({ ...n, x: 999999, y: 0 }));
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe("CANVAS_BOUNDS_EXCEEDED");
  });

  it("trips circuit to OPEN after reaching failure threshold and enforces fast fallback", () => {
    const t0 = 10000;
    // Failure 1
    breaker.execute(sampleNodes, sampleEdges, () => {
      throw new Error("Fail 1");
    }, t0);
    expect(breaker.getState(t0)).toBe("CLOSED");

    // Failure 2 (reaches threshold 2)
    breaker.execute(sampleNodes, sampleEdges, () => {
      throw new Error("Fail 2");
    }, t0);
    expect(breaker.getState(t0)).toBe("OPEN");

    // Next call should immediately short-circuit without calling the solverFn
    let solverCalled = false;
    const fastResult = breaker.execute(sampleNodes, sampleEdges, () => {
      solverCalled = true;
      return sampleNodes;
    }, t0 + 100);

    expect(solverCalled).toBe(false);
    expect(fastResult.usedFallback).toBe(true);
    expect(fastResult.fallbackReason).toBe("CONSECUTIVE_FAILURES");
    expect(fastResult.breakerState).toBe("OPEN");
  });

  it("transitions from OPEN to HALF_OPEN after recovery timeout and resets on success", () => {
    const t0 = 10000;
    breaker.execute(sampleNodes, sampleEdges, () => { throw new Error("1"); }, t0);
    breaker.execute(sampleNodes, sampleEdges, () => { throw new Error("2"); }, t0);
    expect(breaker.getState(t0)).toBe("OPEN");

    // After 1000ms recovery window
    const t1 = t0 + 1001;
    expect(breaker.getState(t1)).toBe("HALF_OPEN");

    // Healthy call restores CLOSED state
    const result = breaker.execute(sampleNodes, sampleEdges, (nodes) => nodes, t1);
    expect(result.usedFallback).toBe(false);
    expect(result.breakerState).toBe("CLOSED");
    expect(breaker.getState(t1)).toBe("CLOSED");
  });
});
