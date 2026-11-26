export interface FontMetrics {
  ascender: number;
  descender: number;
  unitsPerEm: number;
}

export function validateFontMetrics(m: FontMetrics): void {
  if (m.unitsPerEm <= 0) throw new Error('Contract violation: unitsPerEm must be positive');
  if (m.ascender <= 0) throw new Error('Contract violation: ascender must be positive');
  if (m.descender > 0) throw new Error('Contract violation: descender must be <= 0');
}
