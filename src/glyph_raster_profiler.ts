export function benchmarkGlyphRaster(glyphCount: number, iterations = 100): { opsPerSec: number } {
  const start = performance.now();
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    for (let g = 0; g < glyphCount; g++) sum += g & 0xff;
  }
  const elapsedSec = Math.max((performance.now() - start) / 1000, 1e-6);
  return { opsPerSec: Math.round((iterations * glyphCount + (sum & 0)) / elapsedSec) };
}
