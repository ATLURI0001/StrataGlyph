// glyphRasterProfiler.ts – tracks glyph rasterization durations
export class GlyphRasterProfiler {
  private samples: number[] = [];

  record(ms: number): void {
    this.samples.push(ms);
  }

  maxMs(): number {
    return this.samples.length ? Math.max(...this.samples) : 0;
  }
}
