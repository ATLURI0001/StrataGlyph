/**
 * StrataGlyph: Nested SVG Entity Expansion & Deep Recursion Fallback Circuit Breaker.
 * 
 * Protects SVG rendering pipelines against recursive entity expansion (Billion Laughs),
 * cyclic <use> references, deeply nested group hierarchies, and canvas memory exhaustion
 * via strict recursion guards and stateful fallback circuit breaking.
 */

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type BreakerTripReason =
  | "MAX_DEPTH_EXCEEDED"
  | "CYCLIC_REFERENCE_DETECTED"
  | "EXPANSION_RATIO_EXCEEDED"
  | "NODE_BUDGET_EXCEEDED"
  | "CONSECUTIVE_FAILURES"
  | "PROCESSING_TIMEOUT";

export interface SvgBreakerConfig {
  maxNestingDepth?: number;
  maxExpandedNodes?: number;
  maxExpansionRatio?: number;
  failureThreshold?: number;
  recoveryTimeoutMs?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
}

export interface SvgExpansionResult {
  svg: string;
  usedFallback: boolean;
  fallbackReason?: BreakerTripReason;
  nodeCount: number;
  maxDepthReached: number;
  breakerState: CircuitBreakerState;
}

export class SvgExpansionCircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private failureCount: number = 0;
  private lastStateChangeTime: number = Date.now();

  private readonly maxNestingDepth: number;
  private readonly maxExpandedNodes: number;
  private readonly maxExpansionRatio: number;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly fallbackWidth: number;
  private readonly fallbackHeight: number;

  constructor(config: SvgBreakerConfig = {}) {
    this.maxNestingDepth = config.maxNestingDepth ?? 16;
    this.maxExpandedNodes = config.maxExpandedNodes ?? 2000;
    this.maxExpansionRatio = config.maxExpansionRatio ?? 10.0;
    this.failureThreshold = config.failureThreshold ?? 3;
    this.recoveryTimeoutMs = config.recoveryTimeoutMs ?? 5000;
    this.fallbackWidth = config.fallbackWidth ?? 400;
    this.fallbackHeight = config.fallbackHeight ?? 200;
  }

  public getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  private checkStateTransition(): void {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastStateChangeTime >= this.recoveryTimeoutMs) {
        this.state = "HALF_OPEN";
        this.lastStateChangeTime = now;
      }
    }
  }

  public processSvg(rawSvg: string): SvgExpansionResult {
    this.checkStateTransition();

    // Fast reject if circuit is open
    if (this.state === "OPEN") {
      return {
        svg: this.generateFallbackSvg("CIRCUIT_BREAKER_OPEN"),
        usedFallback: true,
        fallbackReason: "CONSECUTIVE_FAILURES",
        nodeCount: 0,
        maxDepthReached: 0,
        breakerState: this.state,
      };
    }

    try {
      const analysis = this.analyzeAndExpand(rawSvg);
      this.onSuccess();
      return {
        svg: rawSvg,
        usedFallback: false,
        nodeCount: analysis.nodeCount,
        maxDepthReached: analysis.maxDepth,
        breakerState: this.state,
      };
    } catch (err: any) {
      const reason: BreakerTripReason = err?.tripReason ?? "MAX_DEPTH_EXCEEDED";
      this.onFailure();
      return {
        svg: this.generateFallbackSvg(reason),
        usedFallback: true,
        fallbackReason: reason,
        nodeCount: 0,
        maxDepthReached: 0,
        breakerState: this.state,
      };
    }
  }

  private analyzeAndExpand(svg: string): { nodeCount: number; maxDepth: number } {
    // 1. Check for XML entity declarations / Billion laughs signature
    if (/<!ENTITY/i.test(svg)) {
      const err = new Error("Unsafe entity expansion detected");
      (err as any).tripReason = "EXPANSION_RATIO_EXCEEDED";
      throw err;
    }

    // 2. Count nesting depth using regex scan
    let depth = 0;
    let maxDepth = 0;
    let nodeCount = 0;

    const tagRegex = /<\/?([a-zA-Z0-9_\-:]+)([^>]*?)(\/?)>/g;
    let match: RegExpExecArray | null;

    // Track <use> references to detect cycles
    const defsMap = new Map<string, string[]>();
    const useReferences: Array<{ id: string; target: string }> = [];

    while ((match = tagRegex.exec(svg)) !== null) {
      const isClosing = match[0].startsWith("</");
      const isSelfClosing = match[3] === "/" || match[0].endsWith("/>");
      const tagName = match[1].toLowerCase();
      const attributes = match[2];

      if (!isClosing) {
        nodeCount++;
        if (nodeCount > this.maxExpandedNodes) {
          const err = new Error("Node budget exceeded");
          (err as any).tripReason = "NODE_BUDGET_EXCEEDED";
          throw err;
        }

        if (tagName === "use") {
          const hrefMatch = /href=["']#?([^"']+)["']/i.exec(attributes);
          if (hrefMatch) {
            const target = hrefMatch[1];
            useReferences.push({ id: "use_" + nodeCount, target });
          }
        }

        if (!isSelfClosing) {
          depth++;
          if (depth > maxDepth) maxDepth = depth;
          if (depth > this.maxNestingDepth) {
            const err = new Error(`Max depth exceeded: ${depth} > ${this.maxNestingDepth}`);
            (err as any).tripReason = "MAX_DEPTH_EXCEEDED";
            throw err;
          }
        }
      } else {
        depth = Math.max(0, depth - 1);
      }
    }

    // 3. Cyclic reference check on <use> targets
    for (const ref of useReferences) {
      if (ref.target === ref.id || svg.includes(`id="${ref.target}"`) && svg.includes(`href="#${ref.target}"`)) {
        // Direct self-recursion check
        const selfUseRegex = new RegExp(`<(\\w+)[^>]*id=["']${ref.target}["'][^>]*>.*?<use[^>]*href=["']#${ref.target}["']`, "s");
        if (selfUseRegex.test(svg)) {
          const err = new Error("Cyclic <use> reference detected");
          (err as any).tripReason = "CYCLIC_REFERENCE_DETECTED";
          throw err;
        }
      }
    }

    return { nodeCount, maxDepth };
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.failureCount = 0;
      this.lastStateChangeTime = Date.now();
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.lastStateChangeTime = Date.now();
    }
  }

  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastStateChangeTime = Date.now();
  }

  private generateFallbackSvg(reason: string): string {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.fallbackWidth} ${this.fallbackHeight}" width="${this.fallbackWidth}" height="${this.fallbackHeight}">`,
      `  <rect width="100%" height="100%" fill="#fef2f2" stroke="#dc2626" stroke-width="2" rx="6" />`,
      `  <text x="50%" y="45%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="600" fill="#991b1b">`,
      `    SVG Expansion Quarantined`,
      `  </text>`,
      `  <text x="50%" y="65%" text-anchor="middle" font-family="monospace" font-size="11" fill="#b91c1c">`,
      `    Reason: ${reason}`,
      `  </text>`,
      `</svg>`,
    ].join("\n");
  }
}
