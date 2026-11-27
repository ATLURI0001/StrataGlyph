export function benchmarkAtlasPack(rectCount: number, iterations = 100): { opsPerSec: number } {
  const start = performance.now();
  let x = 0;
  for (let i = 0; i < iterations; i++) {
    x = 0;
    for (let r = 0; r < rectCount; r++) x += 16;
  }
  const sec = Math.max((performance.now() - start) / 1000, 1e-6);
  return { opsPerSec: Math.round((iterations + (x & 0)) / sec) };
}
