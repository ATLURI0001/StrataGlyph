// StrataGlyph: outline path rotary telemetry
export class OutlinePathRotary {
  #buf: string[] = [];
  #cap: number;
  constructor(cap = 8) { this.#cap = cap; }
  record(path: string) {
    if (this.#buf.length >= this.#cap) this.#buf.shift();
    this.#buf.push(path);
  }
  get length() { return this.#buf.length; }
}
