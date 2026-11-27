// glyphAtlasRotary.ts – bounded ring buffer for glyph atlas allocations
export class GlyphAtlasRotary {
  private buf: string[] = [];
  private readonly max: number;

  constructor(max = 16) {
    this.max = max;
  }

  push(glyphId: string): void {
    if (this.buf.length >= this.max) this.buf.shift();
    this.buf.push(glyphId);
  }

  count(): number {
    return this.buf.length;
  }
}
