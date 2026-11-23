import { describe, it, expect } from 'vitest';
import {
  sanitizeMarkdownDelimiters,
  extractDelimitedSpansLinear,
  detectReDosRisk,
  safeRegexMatch,
  RegexBacktrackingGuard,
  BacktrackingSecurityError,
} from '../src/regex_backtracking_guard.ts';

describe('RegexBacktrackingGuard Suite', () => {
  describe('detectReDosRisk', () => {
    it('detects nested quantifiers susceptible to polynomial/exponential ReDoS', () => {
      const vulnerableRegex1 = /(a+)+$/;
      const res1 = detectReDosRisk(vulnerableRegex1);
      expect(res1.vulnerable).toBe(true);
      expect(res1.reason).toContain('Detected catastrophic nested quantifier');

      const vulnerableRegex2 = /(\w+)+/;
      const res2 = detectReDosRisk(vulnerableRegex2);
      expect(res2.vulnerable).toBe(true);
    });

    it('detects overlapping alternative repetitions', () => {
      const regex = /(test|test)+/;
      const res = detectReDosRisk(regex);
      expect(res.vulnerable).toBe(true);
    });

    it('passes standard linear safe regexes', () => {
      const safeRegex = /^([a-zA-Z0-9_-]+): (.*)$/;
      const res = detectReDosRisk(safeRegex);
      expect(res.vulnerable).toBe(false);
    });
  });

  describe('sanitizeMarkdownDelimiters', () => {
    it('passes normal markdown text untouched', () => {
      const text = '# Diagram Header\nThis is **bold** text and `inline_code`.';
      const res = sanitizeMarkdownDelimiters(text);
      expect(res.isSanitized).toBe(false);
      expect(res.sanitizedText).toBe(text);
      expect(res.collapsedRuns).toBe(0);
      expect(res.warnings).toHaveLength(0);
    });

    it('collapses pathological delimiter repetition in non-strict mode', () => {
      const pathological = 'Start ' + '*'.repeat(100) + ' End';
      const res = sanitizeMarkdownDelimiters(pathological, { maxDelimiterRepetition: 10 });
      expect(res.isSanitized).toBe(true);
      expect(res.collapsedRuns).toBe(90);
      expect(res.sanitizedText).toBe('Start ' + '*'.repeat(10) + ' End');
      expect(res.warnings[0]).toContain('Collapsed 90 excess delimiter repetitions');
    });

    it('throws BacktrackingSecurityError in strict mode upon pathological run', () => {
      const pathological = 'Label ' + '_'.repeat(50);
      expect(() => {
        sanitizeMarkdownDelimiters(pathological, { strict: true, maxDelimiterRepetition: 20 });
      }).toThrowError(BacktrackingSecurityError);

      try {
        sanitizeMarkdownDelimiters(pathological, { strict: true, maxDelimiterRepetition: 20 });
      } catch (err) {
        expect((err as BacktrackingSecurityError).code).toBe('ERR_PATHOLOGICAL_DELIMITER_RUN');
      }
    });

    it('truncates payloads exceeding maxScanLength in non-strict mode', () => {
      const longInput = 'A'.repeat(1000);
      const res = sanitizeMarkdownDelimiters(longInput, { maxScanLength: 250 });
      expect(res.isSanitized).toBe(true);
      expect(res.sanitizedText.length).toBe(250);
      expect(res.warnings[0]).toContain('Input truncated from 1000 to 250');
    });

    it('throws BacktrackingSecurityError if payload exceeds maxScanLength in strict mode', () => {
      const longInput = 'B'.repeat(500);
      expect(() => {
        sanitizeMarkdownDelimiters(longInput, { maxScanLength: 100, strict: true });
      }).toThrowError(BacktrackingSecurityError);
    });

    it('bounds excessive nesting depth in strict and non-strict mode', () => {
      const deepBrackets = '['.repeat(30) + 'content' + ']'.repeat(30);
      const nonStrictRes = sanitizeMarkdownDelimiters(deepBrackets, { maxNestingDepth: 10 });
      expect(nonStrictRes.isSanitized).toBe(true);
      expect(nonStrictRes.warnings.some(w => w.includes('bracket nesting depth'))).toBe(true);

      expect(() => {
        sanitizeMarkdownDelimiters(deepBrackets, { maxNestingDepth: 10, strict: true });
      }).toThrowError(BacktrackingSecurityError);
    });
  });

  describe('extractDelimitedSpansLinear', () => {
    it('extracts paired tokens deterministically in O(N)', () => {
      const text = 'Here is **important** and **another item** in text.';
      const res = extractDelimitedSpansLinear(text, '**');
      expect(res.spans).toHaveLength(2);
      expect(res.spans[0].content).toBe('important');
      expect(res.spans[0].raw).toBe('**important**');
      expect(res.spans[1].content).toBe('another item');
      expect(res.unclosedCount).toBe(0);
    });

    it('handles unclosed tokens gracefully without backtracking lockup', () => {
      const unclosed = 'Notice **this never closes...';
      const res = extractDelimitedSpansLinear(unclosed, '**');
      expect(res.spans).toHaveLength(0);
      expect(res.unclosedCount).toBe(1);
    });

    it('ignores escaped delimiters', () => {
      const escaped = 'Literal \\*\\*not bold\\*\\* and **real bold**';
      const res = extractDelimitedSpansLinear(escaped, '**');
      expect(res.spans).toHaveLength(1);
      expect(res.spans[0].content).toBe('real bold');
    });
  });

  describe('safeRegexMatch', () => {
    it('intercepts vulnerable ReDoS regex before execution', () => {
      const vulnerableRegex = /([a-z]+)+$/;
      const attackPayload = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!';
      const res = safeRegexMatch(vulnerableRegex, attackPayload);
      expect(res.matched).toBe(false);
      expect(res.timedOut).toBe(true);
      expect(res.error).toContain('Detected catastrophic nested quantifier');
    });

    it('safely evaluates standard compliant regex', () => {
      const regex = /status: (\w+)/;
      const input = 'System status: active';
      const res = safeRegexMatch(regex, input);
      expect(res.matched).toBe(true);
      expect(res.matches?.[1]).toBe('active');
      expect(res.timedOut).toBe(false);
    });
  });

  describe('RegexBacktrackingGuard orchestrator', () => {
    it('tracks scan count and intercepted pathological items in telemetry', () => {
      const guard = new RegexBacktrackingGuard({ maxDelimiterRepetition: 5 });
      guard.scanAndSanitize('Clean text');
      guard.scanAndSanitize('Clean text 2');
      guard.scanAndSanitize('Pathological ' + '~'.repeat(20));

      const stats = guard.getStats();
      expect(stats.totalScans).toBe(3);
      expect(stats.totalInterceptions).toBe(1);

      const spanRes = guard.extractSpans('`code span`', '`');
      expect(spanRes.spans).toHaveLength(1);
      expect(spanRes.spans[0].content).toBe('code span');
    });
  });
});
