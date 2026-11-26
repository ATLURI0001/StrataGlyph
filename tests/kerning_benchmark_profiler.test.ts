import { describe, expect, it } from 'vitest';
import {
  KerningBenchmarkProfiler,
  type KerningWorkload,
} from '../src/kerning_benchmark_profiler';

describe('KerningBenchmarkProfiler Suite', () => {
  const profiler = new KerningBenchmarkProfiler();

  it('correctly returns known kerning offsets', () => {
    expect(profiler.lookupKerning('A', 'V')).toBe(-50);
    expect(profiler.lookupKerning('X', 'Z')).toBe(0);
  });

  it('executes kerning workload and returns positive metrics', () => {
    const res = profiler.executeWorkload({ name: 'Test', pairCount: 100, useCache: true });
    expect(res.durationMs).toBeGreaterThan(0);
    expect(res.lookupsDone).toBe(100);
  });

  it('profiles multi-iteration workloads and outputs valid percentiles', () => {
    const report = profiler.profileWorkload(
      { name: 'Paragraph', pairCount: 200, useCache: true },
      10,
      2
    );
    expect(report.iterations).toBe(10);
    expect(report.p50Ms).toBeGreaterThanOrEqual(0);
    expect(report.maxMs).toBeGreaterThanOrEqual(report.p50Ms);
    expect(report.lookupsPerSec).toBeGreaterThan(0);
  });

  it('formats markdown matrix correctly', () => {
    const report = profiler.profileWorkload({ name: 'Heading', pairCount: 50, useCache: true }, 5, 1);
    const md = profiler.generateMarkdownMatrix([report]);
    expect(md).toContain('| Heading | 50 |');
  });

  it('rejects invalid inputs defensively', () => {
    expect(() => profiler.executeWorkload({ name: 'Bad', pairCount: 0, useCache: true })).toThrow(
      'pairCount must be positive'
    );
  });
});
