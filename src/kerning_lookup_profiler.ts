export function benchmarkKerningLookup(pairs: Map<string, number>, keys: string[], iterations = 200): { opsPerSec: number } {
  const start = performance.now();
  let acc = 0;
  for (let i = 0; i < iterations; i++) {
    for (const k of keys) acc += pairs.get(k) ?? 0;
  }
  const sec = Math.max((performance.now() - start) / 1000, 1e-6);
  return { opsPerSec: Math.round((iterations * keys.length + (acc & 0)) / sec) };
}
