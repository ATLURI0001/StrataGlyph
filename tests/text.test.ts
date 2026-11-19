import { describe, expect, it } from "vitest";
import { measure, optimalTextBlock, optimalWrap, textBlock, wrap } from "../src/text.ts";

describe("text measurement & wrapping", () => {
  it("measures basic ASCII strings accurately", () => {
    const w1 = measure("hello", 14);
    const w2 = measure("hello world", 14);
    expect(w2).toBeGreaterThan(w1);
    expect(w1).toBeGreaterThan(0);
  });

  it("handles empty strings and line breaks in greedy wrap", () => {
    expect(wrap("", 14, 100)).toEqual([""]);
    expect(wrap("hello\nworld", 14, 200)).toEqual(["hello", "world"]);
  });

  it("splits overflowing words with hyphens or camelCase", () => {
    const wrapped = wrap("HorizontalPodAutoscaler", 12, 80);
    expect(wrapped.length).toBeGreaterThan(1);
  });

  it("produces balanced lines with optimalWrap without orphans", () => {
    const paragraph = "The quick brown fox jumps gracefully over the lazy dog in the warm sunshine.";
    const greedyLines = wrap(paragraph, 12, 120);
    const optimalLines = optimalWrap(paragraph, 12, 120);

    expect(optimalLines.length).toBeGreaterThan(1);
    // Every line should respect maxWidth
    for (const line of optimalLines) {
      expect(measure(line, 12)).toBeLessThanOrEqual(120);
    }

    // Verify all original words are preserved
    const origWords = paragraph.split(/\s+/);
    const joinedWords = optimalLines.join(" ").split(/\s+/);
    expect(joinedWords).toEqual(origWords);
  });

  it("constructs an optimalTextBlock with proper metrics", () => {
    const text = "Architecture Overview: Event Sourcing & CQRS Pattern";
    const block = optimalTextBlock(text, 14, 150);
    expect(block.lines.length).toBeGreaterThan(0);
    expect(block.width).toBeLessThanOrEqual(150);
    expect(block.height).toBe(block.lines.length * block.lead);
  });

  it("handles multi-paragraph optimalWrap smoothly", () => {
    const multi = "First paragraph here.\n\nSecond paragraph has several words to wrap.";
    const lines = optimalWrap(multi, 14, 100);
    expect(lines.length).toBeGreaterThan(1);
  });
});
