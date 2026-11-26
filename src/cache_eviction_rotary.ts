export class CacheEvictionRotary {
  private readonly samples: number[] = [];
  private readonly cap: number;

  constructor(cap = 32) {
    this.cap = cap;
  }

  record(evictions: number): void {
    if (evictions < 0) throw new Error('evictions must be non-negative');
    if (this.samples.length >= this.cap) this.samples.shift();
    this.samples.push(evictions);
  }

  avg(): number {
    if (!this.samples.length) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }
}
