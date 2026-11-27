export function validateKerningPair(left: string, right: string, offset: number): void {
  if (!left || !right) throw new Error('Contract violation: kerning glyphs must be non-empty');
  if (!Number.isFinite(offset) || offset < -2000 || offset > 2000) {
    throw new Error(`Contract violation: kerning offset ${offset} out of bounds [-2000, 2000]`);
  }
}
