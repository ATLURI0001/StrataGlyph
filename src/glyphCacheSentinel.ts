// glyphCacheSentinel.ts – sentinel for glyph cache overflow
export class GlyphCacheSentinel {
  private maxEntries: number;
  private overflowCount = 0;

  constructor(maxEntries: number) {
    this.maxEntries = maxEntries;
  }

  check(currentEntries: number): boolean {
    if (currentEntries > this.maxEntries) {
      this.overflowCount++;
      return false;
    }
    return true;
  }

  overflows(): number {
    return this.overflowCount;
  }
}
