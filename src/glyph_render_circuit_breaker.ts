// StrataGlyph: glyph render circuit breaker
export class GlyphRenderCircuitBreaker {
  #fails = 0;
  #max: number;
  #open = false;
  constructor(max = 3) { this.#max = max; }
  call(fn: () => void) {
    if (this.#open) throw new Error('glyph circuit open');
    try { fn(); this.#fails = 0; }
    catch (e) { if (++this.#fails >= this.#max) this.#open = true; throw e; }
  }
}
