/**
 * StrataGlyph - Typography & Font Specification Ingress Contract & Sanitizer
 *
 * Enforces strict ingress contracts on diagram typography declarations, sanitizing font
 * families against CSS injection, normalizing font weights and dimensional sizes into
 * canonical pixels, and validating letter spacing and line heights.
 */

export interface FontSpecInput {
  family?: string;
  size?: number | string;
  weight?: number | string;
  lineHeight?: number | string;
  letterSpacing?: number | string;
  transform?: string;
}

export interface SanitizedFontSpec {
  family: string;
  sizePx: number;
  weight: number;
  lineHeightRatio: number;
  letterSpacingPx: number;
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  cssFontString: string;
}

export class FontSpecContractError extends Error {
  constructor(public code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'FontSpecContractError';
  }
}

const FORBIDDEN_CSS_PATTERNS = [
  /url\s*\(/i,
  /expression\s*\(/i,
  /javascript\s*:/i,
  /<[^>]*>/,
  /[;{}]/,
];

const STANDARD_GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]);

const WEIGHT_MAP: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

/**
 * Sanitizes font family names and list to prevent CSS breakout or injection
 */
export function sanitizeFontFamily(familyInput?: string): string {
  if (!familyInput || typeof familyInput !== 'string') {
    return 'system-ui, sans-serif';
  }

  const clean = familyInput.trim();
  if (clean.length === 0) {
    return 'system-ui, sans-serif';
  }

  for (const pattern of FORBIDDEN_CSS_PATTERNS) {
    if (pattern.test(clean)) {
      throw new FontSpecContractError(
        'ERR_CSS_INJECTION_DETECTED',
        `Forbidden CSS character or sequence detected in font family: "${clean}"`
      );
    }
  }

  const parts = clean.split(',').map(p => p.trim()).filter(Boolean);
  const sanitizedParts: string[] = [];

  for (const rawPart of parts) {
    const unquoted = rawPart.replace(/^['"]|['"]$/g, '').trim();
    if (!unquoted) continue;

    // Reject non-alphanumeric font names (allow spaces, hyphens, underscores)
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(unquoted)) {
      throw new FontSpecContractError(
        'ERR_MALFORMED_FONT_FAMILY',
        `Font family name contains invalid characters: "${unquoted}"`
      );
    }

    if (STANDARD_GENERIC_FAMILIES.has(unquoted.toLowerCase())) {
      sanitizedParts.push(unquoted.toLowerCase());
    } else {
      sanitizedParts.push(`"${unquoted}"`);
    }
  }

  if (sanitizedParts.length === 0) {
    return 'system-ui, sans-serif';
  }

  return sanitizedParts.join(', ');
}

/**
 * Parses and normalizes font sizes to canonical pixels (px).
 * Supports numbers, 'px', 'pt' (1pt = 1.333px), 'em', 'rem' (assumes 16px base).
 */
export function parseFontSize(sizeInput?: number | string): number {
  if (sizeInput === undefined || sizeInput === null) {
    return 14; // Default diagram font size
  }

  if (typeof sizeInput === 'number') {
    if (isNaN(sizeInput) || sizeInput < 6 || sizeInput > 144) {
      throw new FontSpecContractError(
        'ERR_FONT_SIZE_OUT_OF_BOUNDS',
        `Font size (${sizeInput}) must be between 6px and 144px`
      );
    }
    return Math.round(sizeInput * 10) / 10;
  }

  const clean = sizeInput.trim().toLowerCase();
  const match = clean.match(/^([0-9]+(?:\.[0-9]+)?)\s*(px|pt|rem|em)?$/);
  if (!match) {
    throw new FontSpecContractError(
      'ERR_INVALID_FONT_SIZE_FORMAT',
      `Cannot parse font size string: "${sizeInput}"`
    );
  }

  const val = parseFloat(match[1]);
  const unit = match[2] || 'px';

  let px = val;
  if (unit === 'pt') px = val * 1.3333;
  else if (unit === 'rem' || unit === 'em') px = val * 16.0;

  if (px < 6 || px > 144) {
    throw new FontSpecContractError(
      'ERR_FONT_SIZE_OUT_OF_BOUNDS',
      `Calculated font size ${px.toFixed(1)}px must be within [6px, 144px]`
    );
  }

  return Math.round(px * 10) / 10;
}

/**
 * Normalizes font weight into numeric CSS weight (100 - 900)
 */
export function parseFontWeight(weightInput?: number | string): number {
  if (weightInput === undefined || weightInput === null) {
    return 400; // Normal
  }

  if (typeof weightInput === 'number') {
    if (weightInput >= 100 && weightInput <= 900 && weightInput % 100 === 0) {
      return weightInput;
    }
    throw new FontSpecContractError(
      'ERR_INVALID_FONT_WEIGHT',
      `Numeric font weight must be 100, 200, ..., 900; got ${weightInput}`
    );
  }

  const clean = weightInput.trim().toLowerCase();
  if (WEIGHT_MAP[clean] !== undefined) {
    return WEIGHT_MAP[clean];
  }

  const numeric = parseInt(clean, 10);
  if (!isNaN(numeric) && numeric >= 100 && numeric <= 900 && numeric % 100 === 0) {
    return numeric;
  }

  throw new FontSpecContractError(
    'ERR_INVALID_FONT_WEIGHT',
    `Unknown font weight name or value: "${weightInput}"`
  );
}

/**
 * Parses and validates line height multiplier (e.g. 1.2 to 3.0)
 */
export function parseLineHeight(lineHeightInput?: number | string, fontSizePx: number = 14): number {
  if (lineHeightInput === undefined || lineHeightInput === null) {
    return 1.4; // Default diagram line height
  }

  let ratio: number;
  if (typeof lineHeightInput === 'number') {
    ratio = lineHeightInput;
  } else {
    const clean = lineHeightInput.trim().toLowerCase();
    if (clean.endsWith('px')) {
      const px = parseFloat(clean);
      ratio = px / fontSizePx;
    } else {
      ratio = parseFloat(clean);
    }
  }

  if (isNaN(ratio) || ratio < 0.8 || ratio > 3.0) {
    throw new FontSpecContractError(
      'ERR_LINE_HEIGHT_OUT_OF_BOUNDS',
      `Line height ratio (${ratio}) must be between 0.8 and 3.0`
    );
  }

  return Math.round(ratio * 100) / 100;
}

/**
 * Validates and sanitizes complete font specification contract
 */
export function validateAndSanitizeFontSpec(input: FontSpecInput = {}): SanitizedFontSpec {
  const family = sanitizeFontFamily(input.family);
  const sizePx = parseFontSize(input.size);
  const weight = parseFontWeight(input.weight);
  const lineHeightRatio = parseLineHeight(input.lineHeight, sizePx);

  let letterSpacingPx = 0;
  if (input.letterSpacing !== undefined && input.letterSpacing !== null) {
    const lsVal = typeof input.letterSpacing === 'number'
      ? input.letterSpacing
      : parseFloat(String(input.letterSpacing).replace(/px$/i, ''));
    if (isNaN(lsVal) || lsVal < -5 || lsVal > 20) {
      throw new FontSpecContractError(
        'ERR_LETTER_SPACING_OUT_OF_BOUNDS',
        `Letter spacing (${lsVal}px) must be between -5px and 20px`
      );
    }
    letterSpacingPx = Math.round(lsVal * 10) / 10;
  }

  let transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize' = 'none';
  if (input.transform) {
    const t = input.transform.trim().toLowerCase();
    if (t === 'uppercase' || t === 'lowercase' || t === 'capitalize' || t === 'none') {
      transform = t;
    } else {
      throw new FontSpecContractError(
        'ERR_INVALID_TEXT_TRANSFORM',
        `Invalid text transform: "${input.transform}". Allowed: none, uppercase, lowercase, capitalize.`
      );
    }
  }

  const cssFontString = `${weight} ${sizePx}px/${lineHeightRatio} ${family}`;

  return {
    family,
    sizePx,
    weight,
    lineHeightRatio,
    letterSpacingPx,
    transform,
    cssFontString,
  };
}
