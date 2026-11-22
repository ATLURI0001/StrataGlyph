import { describe, it, expect } from 'vitest';
import {
  sanitizeFontFamily,
  parseFontSize,
  parseFontWeight,
  parseLineHeight,
  validateAndSanitizeFontSpec,
  FontSpecContractError,
} from '../src/font_spec_contract.js';

describe('Typography & Font Specification Ingress Contract', () => {
  describe('sanitizeFontFamily', () => {
    it('returns default system font fallback on missing or empty input', () => {
      expect(sanitizeFontFamily()).toBe('system-ui, sans-serif');
      expect(sanitizeFontFamily('')).toBe('system-ui, sans-serif');
      expect(sanitizeFontFamily('   ')).toBe('system-ui, sans-serif');
    });

    it('wraps custom font family in quotes and preserves generic families', () => {
      const res = sanitizeFontFamily('Inter, Roboto, sans-serif');
      expect(res).toBe('"Inter", "Roboto", sans-serif');
    });

    it('strips redundant outer quotes and sanitizes properly', () => {
      const res = sanitizeFontFamily("'Fira Code', \"JetBrains Mono\", monospace");
      expect(res).toBe('"Fira Code", "JetBrains Mono", monospace');
    });

    it('rejects CSS breakout attempts and injection patterns', () => {
      expect(() => sanitizeFontFamily('Arial; color: red;')).toThrow(FontSpecContractError);
      expect(() => sanitizeFontFamily('Inter { font-size: 99px }')).toThrow(FontSpecContractError);
      expect(() => sanitizeFontFamily('url("http://malicious.site/font.woff")')).toThrow(FontSpecContractError);
      expect(() => sanitizeFontFamily('<script>alert(1)</script>')).toThrow(FontSpecContractError);
    });

    it('rejects special punctuation characters in font names', () => {
      expect(() => sanitizeFontFamily('Font@Name!')).toThrow(FontSpecContractError);
    });
  });

  describe('parseFontSize', () => {
    it('parses valid numeric and pixel values', () => {
      expect(parseFontSize(16)).toBe(16);
      expect(parseFontSize('14px')).toBe(14);
      expect(parseFontSize('24.5px')).toBe(24.5);
    });

    it('converts units pt and rem/em accurately to pixels', () => {
      // 12pt * 1.3333 = 16px
      expect(parseFontSize('12pt')).toBe(16);
      // 1.5rem * 16 = 24px
      expect(parseFontSize('1.5rem')).toBe(24);
    });

    it('rejects out of bounds font sizes', () => {
      expect(() => parseFontSize(4)).toThrow(FontSpecContractError);
      expect(() => parseFontSize(150)).toThrow(FontSpecContractError);
      expect(() => parseFontSize('200px')).toThrow(FontSpecContractError);
      expect(() => parseFontSize('invalid')).toThrow(FontSpecContractError);
    });
  });

  describe('parseFontWeight', () => {
    it('normalizes keyword names to standard numeric CSS weights', () => {
      expect(parseFontWeight('normal')).toBe(400);
      expect(parseFontWeight('bold')).toBe(700);
      expect(parseFontWeight('semibold')).toBe(600);
      expect(parseFontWeight('light')).toBe(300);
      expect(parseFontWeight('black')).toBe(900);
    });

    it('accepts valid numeric weights and rejects invalid steps', () => {
      expect(parseFontWeight(400)).toBe(400);
      expect(parseFontWeight('700')).toBe(700);
      expect(() => parseFontWeight(450)).toThrow(FontSpecContractError);
      expect(() => parseFontWeight('heavyweight')).toThrow(FontSpecContractError);
    });
  });

  describe('parseLineHeight', () => {
    it('parses unitless multipliers and pixel heights', () => {
      expect(parseLineHeight(1.5, 16)).toBe(1.5);
      expect(parseLineHeight('24px', 16)).toBe(1.5);
    });

    it('rejects out of bounds line heights', () => {
      expect(() => parseLineHeight(0.5, 16)).toThrow(FontSpecContractError);
      expect(() => parseLineHeight(3.5, 16)).toThrow(FontSpecContractError);
    });
  });

  describe('validateAndSanitizeFontSpec', () => {
    it('sanitizes and builds full CSS font shorthand contract', () => {
      const spec = validateAndSanitizeFontSpec({
        family: 'Helvetica Neue, sans-serif',
        size: '16px',
        weight: 'bold',
        lineHeight: 1.5,
        letterSpacing: '0.5px',
        transform: 'uppercase',
      });

      expect(spec.family).toBe('"Helvetica Neue", sans-serif');
      expect(spec.sizePx).toBe(16);
      expect(spec.weight).toBe(700);
      expect(spec.lineHeightRatio).toBe(1.5);
      expect(spec.letterSpacingPx).toBe(0.5);
      expect(spec.transform).toBe('uppercase');
      expect(spec.cssFontString).toBe('700 16px/1.5 "Helvetica Neue", sans-serif');
    });

    it('rejects invalid text transform keyword', () => {
      expect(() => validateAndSanitizeFontSpec({ transform: 'rotated' })).toThrow(FontSpecContractError);
    });
  });
});
