import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fontsDir } from "./paths.ts";
import type { TextBlock } from "./types.ts";

interface Metrics {
  unitsPerEm: number;
  weights: Record<string, string>;
}

type WidthTable = { widths: Map<number, number>; fallback: number };

let tables: Record<number, WidthTable> | undefined;
let unitsPerEm = 2048;

function load(): Record<number, WidthTable> {
  if (tables) return tables;
  const metrics = JSON.parse(readFileSync(join(fontsDir, "metrics.json"), "utf8")) as Metrics;
  unitsPerEm = metrics.unitsPerEm;
  tables = {};
  for (const [weight, packed] of Object.entries(metrics.weights)) {
    const widths = new Map<number, number>();
    let cp = -1;
    for (const part of packed.split(",")) {
      const colon = part.indexOf(":");
      if (colon >= 0) {
        cp = Number(part.slice(0, colon));
        widths.set(cp, Number(part.slice(colon + 1)));
      } else {
        cp += 1;
        widths.set(cp, Number(part));
      }
    }
    // Glyphs the font lacks (CJK, emoji) are roughly square; measure them at 1em.
    tables[Number(weight)] = { widths, fallback: unitsPerEm };
  }
  return tables;
}

/** Width in px of one line of text set in Inter at `size` px. */
export function measure(text: string, size: number, weight: 400 | 600 = 400): number {
  const table = load()[weight] ?? load()[400];
  if (!table) return text.length * size * 0.6;
  let units = 0;
  for (const ch of text) units += table.widths.get(ch.codePointAt(0) ?? 32) ?? table.fallback;
  return (units / unitsPerEm) * size;
}

/** Greedy word wrap; words longer than the line are broken at character boundaries. */
export function wrap(
  text: string,
  size: number,
  maxWidth: number,
  weight: 400 | 600 = 400,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    // Split at breaking whitespace only: a no-break space (U+00A0, U+2007, U+202F) joins its words.
    const words = paragraph.split(/[^\S\u00a0\u2007\u202f]+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, size, weight) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, size, weight) <= maxWidth) {
        line = word;
        continue;
      }
      // "HorizontalPodAutoscaler" -> "HorizontalPod" + "Autoscaler"; "cross-region" at the hyphen.
      const pieces = word.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=-)/);
      if (pieces.length > 1 && pieces.every((x) => measure(x, size, weight) <= maxWidth)) {
        let part = "";
        for (const piece of pieces) {
          if (part && measure(part + piece, size, weight) > maxWidth) {
            lines.push(part);
            part = piece;
          } else part += piece;
        }
        line = part;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (measure(chunk + ch, size, weight) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      line = chunk;
    }
    if (line || !words.length) lines.push(line);
  }
  return lines;
}

export function textBlock(
  text: string,
  size: number,
  maxWidth: number,
  weight: 400 | 600 = 400,
  lineHeight = 1.3,
): TextBlock {
  const lines = text ? wrap(text, size, maxWidth, weight) : [];
  const lead = Math.round(size * lineHeight * 10) / 10;
  const width = Math.max(0, ...lines.map((l) => measure(l, size, weight)));
  return { lines, size, weight, lead, width, height: lines.length ? lines.length * lead : 0 };
}

export interface OptimalWrapOptions {
  orphanPenalty?: number;
  shortLastLinePenalty?: number;
}

/**
 * Optimal line breaking via dynamic programming (Knuth-Plass badness minimization).
 * Produces balanced line lengths without ragged orphans or excessive whitespace rivers.
 */
export function optimalWrap(
  text: string,
  size: number,
  maxWidth: number,
  weight: 400 | 600 = 400,
  options: OptimalWrapOptions = {},
): string[] {
  const orphanPenalty = options.orphanPenalty ?? 500;
  const allLines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const rawWords = paragraph.split(/[^\S\u00a0\u2007\u202f]+/).filter(Boolean);
    if (!rawWords.length) {
      if (text.includes("\n")) allLines.push("");
      continue;
    }

    // Decompose words that exceed maxWidth using CamelCase, hyphens, or character slicing
    const tokens: string[] = [];
    for (const word of rawWords) {
      if (measure(word, size, weight) <= maxWidth) {
        tokens.push(word);
        continue;
      }
      const pieces = word.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=-)/);
      if (pieces.length > 1 && pieces.every((p) => measure(p, size, weight) <= maxWidth)) {
        let acc = "";
        for (const p of pieces) {
          if (acc && measure(acc + p, size, weight) > maxWidth) {
            tokens.push(acc);
            acc = p;
          } else acc += p;
        }
        if (acc) tokens.push(acc);
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (measure(chunk + ch, size, weight) > maxWidth && chunk) {
          tokens.push(chunk);
          chunk = ch;
        } else chunk += ch;
      }
      if (chunk) tokens.push(chunk);
    }

    const n = tokens.length;
    if (n === 0) continue;

    // dp[i] = minimum badness cost from token i to n
    // nextBreak[i] = optimal token index for next line break
    const dp = new Array<number>(n + 1).fill(Infinity);
    const nextBreak = new Array<number>(n + 1).fill(n);
    dp[n] = 0;

    for (let i = n - 1; i >= 0; i--) {
      let curLine = "";
      for (let j = i + 1; j <= n; j++) {
        const token = tokens[j - 1] ?? "";
        curLine = curLine ? `${curLine} ${token}` : token;
        const w = measure(curLine, size, weight);
        const dpNext = dp[j] ?? 0;
        if (w > maxWidth) {
          // If first token alone exceeds maxWidth, break immediately to avoid infinite cost
          if (j === i + 1) {
            dp[i] = 1_000_000 + dpNext;
            nextBreak[i] = j;
          }
          break;
        }

        const slack = maxWidth - w;
        let lineCost = 0;

        if (j === n) {
          // Last line in paragraph: slack is permitted, but penalize severe single-word orphans
          lineCost = slack * 0.1;
          if (i === n - 1 && n > 2) {
            lineCost += orphanPenalty;
          }
        } else {
          // Intermediate line: quadratic slack penalty
          lineCost = slack * slack;
        }

        const totalCost = lineCost + dpNext;
        const curBest = dp[i] ?? Infinity;
        if (totalCost < curBest) {
          dp[i] = totalCost;
          nextBreak[i] = j;
        }
      }
    }

    // Reconstruct breaks from nextBreak
    let idx = 0;
    while (idx < n) {
      const nxt = nextBreak[idx] ?? n;
      const lineTokens = tokens.slice(idx, nxt);
      allLines.push(lineTokens.join(" "));
      idx = nxt;
    }
  }

  return allLines;
}

export function optimalTextBlock(
  text: string,
  size: number,
  maxWidth: number,
  weight: 400 | 600 = 400,
  lineHeight = 1.3,
  options: OptimalWrapOptions = {},
): TextBlock {
  const lines = text ? optimalWrap(text, size, maxWidth, weight, options) : [];
  const lead = Math.round(size * lineHeight * 10) / 10;
  const width = Math.max(0, ...lines.map((l) => measure(l, size, weight)));
  return { lines, size, weight, lead, width, height: lines.length ? lines.length * lead : 0 };
}

