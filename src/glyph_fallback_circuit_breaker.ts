/**
 * Missing Glyph Fallback & Rasterizer Timeout Circuit Breaker.
 */
export class GlyphFallbackCircuitBreaker {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private tripTime = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 500) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  public resolveGlyph(codePoint: number, loader: () => string, now = Date.now()): { glyph: string; fallback: boolean } {
    if (this.state === 'OPEN') {
      if (now - this.tripTime >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
      } else {
        return { glyph: '\uFFFD', fallback: true }; // Tofu / replacement character
      }
    }

    try {
      const glyph = loader();
      this.state = 'CLOSED';
      this.failures = 0;
      return { glyph, fallback: false };
    } catch {
      this.failures++;
      if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
        this.state = 'OPEN';
        this.tripTime = now;
      }
      return { glyph: '\uFFFD', fallback: true };
    }
  }

  public getState(): string {
    return this.state;
  }
}
