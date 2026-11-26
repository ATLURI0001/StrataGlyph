import { describe, it, expect, beforeEach } from "vitest";
import {
  SvgExpansionCircuitBreaker,
} from "../src/svg_expansion_circuit_breaker";

describe("SvgExpansionCircuitBreaker", () => {
  let breaker: SvgExpansionCircuitBreaker;

  beforeEach(() => {
    breaker = new SvgExpansionCircuitBreaker({
      maxNestingDepth: 5,
      maxExpandedNodes: 100,
      failureThreshold: 2,
      recoveryTimeoutMs: 100,
    });
  });

  it("passes safe SVG through without triggering fallback", () => {
    const safeSvg = `
      <svg viewBox="0 0 100 100">
        <g id="layer1">
          <circle cx="50" cy="50" r="40" fill="blue" />
          <rect x="10" y="10" width="20" height="20" fill="red" />
        </g>
      </svg>
    `;
    const res = breaker.processSvg(safeSvg);
    expect(res.usedFallback).toBe(false);
    expect(res.breakerState).toBe("CLOSED");
    expect(res.maxDepthReached).toBe(2);
    expect(res.svg).toBe(safeSvg);
  });

  it("trips circuit on XML entity declaration (Billion Laughs / XXE guard)", () => {
    const maliciousSvg = `
      <!DOCTYPE svg [
        <!ENTITY lol "lol">
        <!ENTITY lol2 "&lol;&lol;&lol;">
      ]>
      <svg><text>&lol2;</text></svg>
    `;
    const res = breaker.processSvg(maliciousSvg);
    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe("EXPANSION_RATIO_EXCEEDED");
    expect(res.svg).toContain("SVG Expansion Quarantined");
    expect(res.svg).toContain("EXPANSION_RATIO_EXCEEDED");
  });

  it("trips fallback when nesting depth exceeds threshold", () => {
    // 7 nested groups > maxNestingDepth of 5
    const deeplyNestedSvg = `
      <svg>
        <g><g><g><g><g><g><g>
          <rect x="0" y="0" width="10" height="10" />
        </g></g></g></g></g></g></g>
      </svg>
    `;
    const res = breaker.processSvg(deeplyNestedSvg);
    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe("MAX_DEPTH_EXCEEDED");
  });

  it("detects cyclic <use> self-reference and trips circuit", () => {
    const cyclicSvg = `
      <svg>
        <g id="nodeA">
          <rect width="10" height="10" />
          <use href="#nodeA" />
        </g>
      </svg>
    `;
    const res = breaker.processSvg(cyclicSvg);
    expect(res.usedFallback).toBe(true);
    expect(res.fallbackReason).toBe("CYCLIC_REFERENCE_DETECTED");
  });

  it("transitions CLOSED -> OPEN after consecutive failures and fast-rejects", () => {
    const badSvg = "<!ENTITY foo 'bar'><svg></svg>";

    // Failure 1
    const r1 = breaker.processSvg(badSvg);
    expect(r1.usedFallback).toBe(true);
    expect(breaker.getState()).toBe("CLOSED");

    // Failure 2 (reaches threshold of 2) -> OPEN
    const r2 = breaker.processSvg(badSvg);
    expect(r2.usedFallback).toBe(true);
    expect(breaker.getState()).toBe("OPEN");

    // 3rd call is fast-rejected by open circuit
    const r3 = breaker.processSvg("<svg><rect /></svg>");
    expect(r3.usedFallback).toBe(true);
    expect(r3.fallbackReason).toBe("CONSECUTIVE_FAILURES");
  });

  it("recovers from OPEN to HALF_OPEN to CLOSED after timeout and valid input", async () => {
    const badSvg = "<!ENTITY foo 'bar'><svg></svg>";
    breaker.processSvg(badSvg);
    breaker.processSvg(badSvg);
    expect(breaker.getState()).toBe("OPEN");

    // Wait for recovery timeout (100ms)
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(breaker.getState()).toBe("HALF_OPEN");

    // Successful parse closes the breaker
    const goodSvg = "<svg><rect width='10' height='10' /></svg>";
    const res = breaker.processSvg(goodSvg);
    expect(res.usedFallback).toBe(false);
    expect(breaker.getState()).toBe("CLOSED");
  });
});
