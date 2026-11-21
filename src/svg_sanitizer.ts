/**
 * SVG Viewport Normalizer & Script Injection Sanitizer for StrataGlyph.
 * Enforces secure SVG embedding, eliminates XSS/XXE attack surfaces,
 * and normalizes viewport coordinates and aspect ratios.
 */

export interface ViewportBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface SanitizerOptions {
  stripScripts?: boolean;
  stripEventHandlers?: boolean;
  normalizeOrigin?: boolean;
  padding?: number;
  maxDimension?: number;
}

const DANGEROUS_ELEMENTS = /<\s*(script|object|embed|foreignObject|iframe)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>|<\s*(script|object|embed|foreignObject|iframe)[^>]*\/>/gi;
const INLINE_EVENT_HANDLERS = /\s+on[a-z]+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi;
const DANGEROUS_HREF = /(href|xlink:href)\s*=\s*["']\s*(javascript:|data:text\/html|vbscript:)[^"']*["']/gi;
const XML_ENTITY_DECL = /<!ENTITY\s+[\s\S]*?>/gi;
const XML_DOCTYPE = /<!DOCTYPE\s+[\s\S]*?>/gi;

/**
 * Extracts the viewBox bounding box or derives one from width and height attributes.
 */
export function extractViewport(svg: string): ViewportBox | null {
  const viewBoxMatch = svg.match(/viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);
  if (viewBoxMatch) {
    const minX = parseFloat(viewBoxMatch[1]);
    const minY = parseFloat(viewBoxMatch[2]);
    const width = parseFloat(viewBoxMatch[3]);
    const height = parseFloat(viewBoxMatch[4]);
    if (Number.isFinite(minX) && Number.isFinite(minY) && width > 0 && height > 0) {
      return { minX, minY, width, height };
    }
  }

  const widthMatch = svg.match(/\bwidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);
  const heightMatch = svg.match(/\bheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);

  if (widthMatch && heightMatch) {
    const width = parseFloat(widthMatch[1]);
    const height = parseFloat(heightMatch[1]);
    if (width > 0 && height > 0) {
      return { minX: 0, minY: 0, width, height };
    }
  }

  return null;
}

/**
 * Sanitizes and normalizes an SVG document string.
 */
export function sanitizeSvg(svg: string, options: SanitizerOptions = {}): string {
  const {
    stripScripts = true,
    stripEventHandlers = true,
    normalizeOrigin = true,
    padding = 0,
    maxDimension = 4096,
  } = options;

  let cleaned = svg;

  // 1. Strip external entity and DOCTYPE declarations (XXE defense)
  cleaned = cleaned.replace(XML_ENTITY_DECL, '');
  cleaned = cleaned.replace(XML_DOCTYPE, '');

  // 2. Strip dangerous script, embed, iframe elements
  if (stripScripts) {
    cleaned = cleaned.replace(DANGEROUS_ELEMENTS, '');
  }

  // 3. Strip inline JavaScript event handlers (e.g. onclick, onload, onerror)
  if (stripEventHandlers) {
    cleaned = cleaned.replace(INLINE_EVENT_HANDLERS, '');
  }

  // 4. Strip dangerous href protocols
  cleaned = cleaned.replace(DANGEROUS_HREF, '');

  // 5. Viewport origin normalization and bounds clamping
  const viewport = extractViewport(cleaned);
  if (viewport) {
    let normX = viewport.minX;
    let normY = viewport.minY;
    let normW = viewport.width;
    let normH = viewport.height;

    if (padding > 0) {
      normX -= padding;
      normY -= padding;
      normW += padding * 2;
      normH += padding * 2;
    }

    if (normalizeOrigin && (normX !== 0 || normY !== 0)) {
      // Normalize origin to 0 0 and adjust dimensions
      normW = Math.max(1, normW);
      normH = Math.max(1, normH);
      normX = 0;
      normY = 0;
    }

    // Clamp dimensions to maxDimension
    if (normW > maxDimension || normH > maxDimension) {
      const scale = Math.min(maxDimension / normW, maxDimension / normH);
      normW = Math.round(normW * scale);
      normH = Math.round(normH * scale);
    }

    const formattedViewBox = `viewBox="${normX} ${normY} ${normW} ${normH}"`;

    if (/viewBox\s*=\s*["'][^"']*["']/i.test(cleaned)) {
      cleaned = cleaned.replace(/viewBox\s*=\s*["'][^"']*["']/i, formattedViewBox);
    } else {
      // Insert viewBox into root <svg> tag
      cleaned = cleaned.replace(/<svg\b/i, `<svg ${formattedViewBox}`);
    }
  }

  return cleaned.trim();
}
