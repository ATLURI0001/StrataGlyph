/**
 * Font Kerning Pair Lookup & Sub-Pixel Spacing Benchmark Profiler for StrataGlyph.
 *
 * Microbenchmarks glyph pair kerning lookups, binary search tree dispatch,
 * and typographic layout spacing latencies across diverse character counts.
 */

export interface KerningWorkload {
  name: string;
  pairCount: number;
  useCache: boolean;
}

export interface KerningBenchmarkReport {
  workloadName: string;
  pairCount: number;
  iterations: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  lookupsPerSec: number;
}

export class KerningBenchmarkProfiler {
  private readonly kerningTable = new Map<string, number>();

  constructor() {
    // Populate standard typographic kerning pairs
    const pairs = ['AV', 'AW', 'VA', 'WA', 'To', 'Tr', 'Ta', 'Yo', 'We', 'LT'];
    for (const p of pairs) {
      this.kerningTable.set(p, -50);
    }
  }

  public lookupKerning(left: string, right: string): number {
    const key = left + right;
    return this.kerningTable.get(key) || 0;
  }

  public executeWorkload(w: KerningWorkload): { durationMs: number; lookupsDone: number } {
    if (w.pairCount <= 0) {
      throw new Error(`pairCount must be positive, got ${w.pairCount}`);
    }

    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const t0 = performance.now();
    let lookups = 0;

    for (let i = 0; i < w.pairCount; i++) {
      const left = alphabet[i % alphabet.length];
      const right = alphabet[(i + 1) % alphabet.length];
      this.lookupKerning(left, right);
      lookups++;
    }

    const dur = Math.max(0.001, performance.now() - t0);
    return { durationMs: dur, lookupsDone: lookups };
  }

  public profileWorkload(
    w: KerningWorkload,
    iterations: number = 20,
    warmup: number = 3
  ): KerningBenchmarkReport {
    if (iterations < 1) {
      throw new Error(`iterations must be >= 1, got ${iterations}`);
    }

    for (let i = 0; i < warmup; i++) {
      this.executeWorkload(w);
    }

    const latencies: number[] = [];
    let totalTime = 0;
    let totalLookups = 0;

    for (let i = 0; i < iterations; i++) {
      const res = this.executeWorkload(w);
      latencies.push(res.durationMs);
      totalTime += res.durationMs;
      totalLookups += res.lookupsDone;
    }

    latencies.sort((a, b) => a - b);
    const n = latencies.length;
    const getP = (p: number) => latencies[Math.min(Math.floor((p / 100) * n), n - 1)];

    const rate = totalTime > 0 ? Math.round((totalLookups / totalTime) * 1000) : 0;

    return {
      workloadName: w.name,
      pairCount: w.pairCount,
      iterations,
      p50Ms: Math.round(getP(50) * 1000) / 1000,
      p90Ms: Math.round(getP(90) * 1000) / 1000,
      p99Ms: Math.round(getP(99) * 1000) / 1000,
      minMs: Math.round(latencies[0] * 1000) / 1000,
      maxMs: Math.round(latencies[n - 1] * 1000) / 1000,
      avgMs: Math.round((totalTime / n) * 1000) / 1000,
      lookupsPerSec: rate,
    };
  }

  public generateMarkdownMatrix(reports: KerningBenchmarkReport[]): string {
    const lines = [
      '| Workload | Pairs | p50 (ms) | p90 (ms) | p99 (ms) | Max (ms) | Throughput (pairs/s) |',
      '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
    ];
    for (const r of reports) {
      lines.push(
        `| ${r.workloadName} | ${r.pairCount} | ${r.p50Ms}ms | ${r.p90Ms}ms | ${r.p99Ms}ms | ${r.maxMs}ms | ${r.lookupsPerSec.toLocaleString()} |`
      );
    }
    return lines.join('\n');
  }
}
