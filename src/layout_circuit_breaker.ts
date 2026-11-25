/**
 * StrataGlyph: Layout Solver Timeout & Canvas Memory Exhaustion Fallback Circuit Breaker
 * 
 * Protects layout pipeline against runaway layout solver loops, unbounded coordinates,
 * memory exhaustion, and excessive latency via deterministic grid fallback and stateful circuit breaking.
 */

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type BreakerTripReason = 
  | "EXECUTION_TIMEOUT"
  | "COORDINATE_EXPLOSION"
  | "CONSECUTIVE_FAILURES"
  | "CANVAS_BOUNDS_EXCEEDED"
  | "UNHANDLED_EXCEPTION";

export interface CircuitBreakerConfig {
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  maxExecutionTimeMs?: number;
  maxCanvasDimension?: number;
  gridFallbackCellSize?: number;
  gridFallbackColumns?: number;
}

export interface BreakerNode {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface BreakerEdge {
  from: string;
  to: string;
}

export interface LayoutExecutionResult {
  nodes: BreakerNode[];
  usedFallback: boolean;
  fallbackReason?: BreakerTripReason;
  executionTimeMs: number;
  breakerState: CircuitBreakerState;
}

export class LayoutCircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private failureCount: number = 0;
  private lastStateChangeTime: number = Date.now();
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly maxExecutionTimeMs: number;
  private readonly maxCanvasDimension: number;
  private readonly gridFallbackCellSize: number;
  private readonly gridFallbackColumns: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 3;
    this.recoveryTimeoutMs = config.recoveryTimeoutMs ?? 2000;
    this.maxExecutionTimeMs = config.maxExecutionTimeMs ?? 50;
    this.maxCanvasDimension = config.maxCanvasDimension ?? 16384;
    this.gridFallbackCellSize = config.gridFallbackCellSize ?? 120;
    this.gridFallbackColumns = config.gridFallbackColumns ?? 5;
  }

  public getState(currentTime: number = Date.now()): CircuitBreakerState {
    if (this.state === "OPEN") {
      if (currentTime - this.lastStateChangeTime >= this.recoveryTimeoutMs) {
        this.state = "HALF_OPEN";
        this.lastStateChangeTime = currentTime;
      }
    }
    return this.state;
  }

  public getFailureCount(): number {
    return this.failureCount;
  }

  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastStateChangeTime = Date.now();
  }

  /**
   * Deterministic O(N) grid layout fallback with zero risk of collision, explosion, or loop.
   */
  public generateFallbackLayout(nodes: BreakerNode[]): BreakerNode[] {
    const cols = Math.max(1, this.gridFallbackColumns);
    const cellSize = this.gridFallbackCellSize;

    return nodes.map((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return {
        ...node,
        x: col * cellSize + cellSize / 2,
        y: row * cellSize + cellSize / 2,
      };
    });
  }

  /**
   * Validates coordinate sanity and bounds of solved nodes.
   */
  public validateNodeBounds(nodes: BreakerNode[]): { valid: boolean; reason?: BreakerTripReason } {
    for (const node of nodes) {
      if (
        !Number.isFinite(node.x) ||
        !Number.isFinite(node.y) ||
        Number.isNaN(node.x) ||
        Number.isNaN(node.y)
      ) {
        return { valid: false, reason: "COORDINATE_EXPLOSION" };
      }

      if (
        Math.abs(node.x) > this.maxCanvasDimension ||
        Math.abs(node.y) > this.maxCanvasDimension
      ) {
        return { valid: false, reason: "CANVAS_BOUNDS_EXCEEDED" };
      }
    }
    return { valid: true };
  }

  /**
   * Executes a layout solver function under circuit breaker and timeout supervision.
   */
  public execute(
    nodes: BreakerNode[],
    edges: BreakerEdge[],
    solverFn: (nodes: BreakerNode[], edges: BreakerEdge[]) => BreakerNode[],
    now: number = Date.now()
  ): LayoutExecutionResult {
    const currentState = this.getState(now);

    // Fast-path to fallback if circuit is OPEN
    if (currentState === "OPEN") {
      const fallbackNodes = this.generateFallbackLayout(nodes);
      return {
        nodes: fallbackNodes,
        usedFallback: true,
        fallbackReason: "CONSECUTIVE_FAILURES",
        executionTimeMs: 0,
        breakerState: "OPEN",
      };
    }

    const startTime = Date.now();
    try {
      const solvedNodes = solverFn(nodes, edges);
      const elapsed = Date.now() - startTime;

      if (elapsed > this.maxExecutionTimeMs) {
        this.recordFailure("EXECUTION_TIMEOUT", now);
        return {
          nodes: this.generateFallbackLayout(nodes),
          usedFallback: true,
          fallbackReason: "EXECUTION_TIMEOUT",
          executionTimeMs: elapsed,
          breakerState: this.state,
        };
      }

      const boundsCheck = this.validateNodeBounds(solvedNodes);
      if (!boundsCheck.valid) {
        const reason = boundsCheck.reason!;
        this.recordFailure(reason, now);
        return {
          nodes: this.generateFallbackLayout(nodes),
          usedFallback: true,
          fallbackReason: reason,
          executionTimeMs: elapsed,
          breakerState: this.state,
        };
      }

      // Success
      this.recordSuccess();
      return {
        nodes: solvedNodes,
        usedFallback: false,
        executionTimeMs: elapsed,
        breakerState: this.state,
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      this.recordFailure("UNHANDLED_EXCEPTION", now);
      return {
        nodes: this.generateFallbackLayout(nodes),
        usedFallback: true,
        fallbackReason: "UNHANDLED_EXCEPTION",
        executionTimeMs: elapsed,
        breakerState: this.state,
      };
    }
  }

  private recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.failureCount = 0;
      this.lastStateChangeTime = Date.now();
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private recordFailure(reason: BreakerTripReason, now: number): void {
    this.failureCount += 1;
    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.lastStateChangeTime = now;
    }
  }
}
