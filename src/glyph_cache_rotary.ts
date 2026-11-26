/**
 * Glyph Atlas Cache Hit Ratio & Rasterization Latency Rotary.
 * 
 * Bounded circular telemetry ring tracking font atlas cache hits/misses
 * and subpixel rasterization microsecond latencies.
 */

export interface GlyphCacheRecord {
  glyphCode: number;
  hit: boolean;
  rasterizeMicros: number;
}

export interface GlyphCacheSummary {
  sampleCount: number;
  hitRatePct: number;
  p50Micros: number;
  p90Micros: number;
}

export class GlyphCacheRotary {
  private readonly capacity: number;
  private readonly buffer: (GlyphCacheRecord | undefined)[];
  private head = 0;
  private count = 0;

  constructor(capacity = 500) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array(this.capacity);
  }

  public record(glyphCode: number, hit: boolean, rasterizeMicros: number): void {
    this.buffer[this.head] = { glyphCode, hit, rasterizeMicros };
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  public getSummary(): GlyphCacheSummary {
    if (this.count === 0) {
      return { sampleCount: 0, hitRatePct: 0, p50Micros: 0, p90Micros: 0 };
    }

    let hits = 0;
    const latencies: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const rec = this.buffer[i]!;
      if (rec.hit) hits++;
      latencies.push(rec.rasterizeMicros);
    }

    latencies.sort((a, b) => a - b);
    return {
      sampleCount: this.count,
      hitRatePct: Number(((hits / this.count) * 100).toFixed(2)),
      p50Micros: latencies[Math.floor(this.count * 0.5)],
      p90Micros: latencies[Math.floor(this.count * 0.9)],
    };
  }
}
