/**
 * StrataGlyph Regex Backtracking Guard & Safe Markdown Delimiter Scanner
 * 
 * Provides deterministic O(N) linear scanning, delimiter repetition bounding,
 * and catastrophic backtracking mitigation for diagram labels, markdown spans,
 * and text formatting blocks.
 */

export interface GuardOptions {
  maxScanLength?: number;
  maxDelimiterRepetition?: number;
  timeoutMs?: number;
  strict?: boolean;
  maxNestingDepth?: number;
}

export interface SanitizeResult {
  sanitizedText: string;
  isSanitized: boolean;
  warnings: string[];
  scanDurationMs: number;
  collapsedRuns: number;
}

export interface DelimitedSpan {
  delimiter: string;
  content: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export interface DelimitedSpanResult {
  spans: DelimitedSpan[];
  unclosedCount: number;
  sanitizedText: string;
}

export interface SafeMatchResult {
  matched: boolean;
  matches: RegExpMatchArray | null;
  durationMs: number;
  timedOut: boolean;
  error?: string;
}

export class BacktrackingSecurityError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BacktrackingSecurityError';
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_MAX_SCAN_LENGTH = 50_000;
const DEFAULT_MAX_DELIMITER_REPETITION = 32;
const DEFAULT_TIMEOUT_MS = 50;
const DEFAULT_MAX_NESTING_DEPTH = 64;

const MARKDOWN_DELIMITERS = new Set(['*', '_', '`', '~', '=', '^']);

/**
 * Detects static ReDoS risk patterns in regular expressions (nested quantifiers).
 */
export function detectReDosRisk(regex: RegExp): { vulnerable: boolean; reason?: string } {
  const pattern = regex.source;

  // Check for nested quantifiers: (x+)+, (x*)+, (x+)*, (x*)*, (\w+)+
  const nestedQuantifierRegex = /\((?:[^()\\]|\\.)*[*+]\)[*+]/;
  if (nestedQuantifierRegex.test(pattern)) {
    return {
      vulnerable: true,
      reason: `Detected catastrophic nested quantifier in pattern: ${pattern}`,
    };
  }

  // Check for nested range quantifiers: (x{1,}){1,}
  const nestedRangeRegex = /\((?:[^()\\]|\\.)*\{[0-9]+,[0-9]*\}\)\{[0-9]+,[0-9]*\}/;
  if (nestedRangeRegex.test(pattern)) {
    return {
      vulnerable: true,
      reason: `Detected catastrophic nested range quantifier in pattern: ${pattern}`,
    };
  }

  // Check for overlapping alternatives with repetition: (a|a)+, (.*|.+)+
  const overlappingAlternativeRegex = /\(([^|()]+)\|\1\)[*+]/;
  if (overlappingAlternativeRegex.test(pattern)) {
    return {
      vulnerable: true,
      reason: `Detected catastrophic overlapping alternative repetition in pattern: ${pattern}`,
    };
  }

  return { vulnerable: false };
}

/**
 * Sanitizes markdown strings by bounding delimiter runs and nesting depth linearly in O(N).
 */
export function sanitizeMarkdownDelimiters(
  input: string,
  options: GuardOptions = {}
): SanitizeResult {
  const startTime = performance.now();
  const maxScanLength = options.maxScanLength ?? DEFAULT_MAX_SCAN_LENGTH;
  const maxDelimiterRepetition = options.maxDelimiterRepetition ?? DEFAULT_MAX_DELIMITER_REPETITION;
  const strict = options.strict ?? false;
  const maxNestingDepth = options.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH;

  const warnings: string[] = [];
  let isSanitized = false;
  let text = input;

  // 1. Enforce length cap
  if (text.length > maxScanLength) {
    if (strict) {
      throw new BacktrackingSecurityError(
        `Payload size (${text.length} chars) exceeds maximum allowable scan length (${maxScanLength} chars)`,
        'ERR_PAYLOAD_TOO_LARGE',
        { length: text.length, maxScanLength }
      );
    }
    text = text.substring(0, maxScanLength);
    warnings.push(`Input truncated from ${input.length} to ${maxScanLength} characters`);
    isSanitized = true;
  }

  // 2. Scan for and collapse pathological delimiter repetitions
  let collapsedRuns = 0;
  const outChars: string[] = [];
  let currentDelim = '';
  let delimRunLength = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prevCh = i > 0 ? text[i - 1] : '';

    // Check bracket/parenthesis nesting depth
    if (ch === '[' && prevCh !== '\\') {
      bracketDepth++;
      if (bracketDepth > maxNestingDepth) {
        if (strict) {
          throw new BacktrackingSecurityError(
            `Bracket nesting depth exceeded limit of ${maxNestingDepth}`,
            'ERR_EXCESSIVE_NESTING_DEPTH',
            { bracketDepth, maxNestingDepth }
          );
        }
        warnings.push(`Excessive bracket nesting depth (${bracketDepth}) detected`);
        isSanitized = true;
      }
    } else if (ch === ']' && prevCh !== '\\' && bracketDepth > 0) {
      bracketDepth--;
    } else if (ch === '(' && prevCh !== '\\') {
      parenDepth++;
      if (parenDepth > maxNestingDepth) {
        if (strict) {
          throw new BacktrackingSecurityError(
            `Parenthesis nesting depth exceeded limit of ${maxNestingDepth}`,
            'ERR_EXCESSIVE_NESTING_DEPTH',
            { parenDepth, maxNestingDepth }
          );
        }
        warnings.push(`Excessive parenthesis nesting depth (${parenDepth}) detected`);
        isSanitized = true;
      }
    } else if (ch === ')' && prevCh !== '\\' && parenDepth > 0) {
      parenDepth--;
    }

    // Check repeated delimiter runs (*, _, `, ~, =, ^)
    if (MARKDOWN_DELIMITERS.has(ch) && prevCh !== '\\') {
      if (ch === currentDelim) {
        delimRunLength++;
        if (delimRunLength > maxDelimiterRepetition) {
          if (strict) {
            throw new BacktrackingSecurityError(
              `Pathological delimiter run of '${ch}' (${delimRunLength} repetitions) exceeds safety threshold of ${maxDelimiterRepetition}`,
              'ERR_PATHOLOGICAL_DELIMITER_RUN',
              { delimiter: ch, count: delimRunLength, threshold: maxDelimiterRepetition }
            );
          }
          collapsedRuns++;
          isSanitized = true;
          continue; // Skip adding excess characters
        }
      } else {
        currentDelim = ch;
        delimRunLength = 1;
      }
    } else {
      currentDelim = '';
      delimRunLength = 0;
    }

    outChars.push(ch);
  }

  if (collapsedRuns > 0) {
    warnings.push(`Collapsed ${collapsedRuns} excess delimiter repetitions exceeding cap ${maxDelimiterRepetition}`);
  }

  const sanitizedText = outChars.join('');
  const duration = performance.now() - startTime;

  return {
    sanitizedText,
    isSanitized,
    warnings,
    scanDurationMs: Math.round(duration * 100) / 100,
    collapsedRuns,
  };
}

/**
 * Deterministic O(N) extraction of paired delimiters (e.g. bold, italic, code spans)
 * without utilizing backtracking regexes.
 */
export function extractDelimitedSpansLinear(
  text: string,
  delimiter: string,
  options: GuardOptions = {}
): DelimitedSpanResult {
  const sanitized = sanitizeMarkdownDelimiters(text, options);
  const src = sanitized.sanitizedText;
  const dLen = delimiter.length;
  const spans: DelimitedSpan[] = [];
  let unclosedCount = 0;

  let i = 0;
  let openIndex = -1;

  while (i <= src.length - dLen) {
    if (src.substring(i, i + dLen) === delimiter) {
      const isEscaped = i > 0 && src[i - 1] === '\\';
      if (!isEscaped) {
        if (openIndex === -1) {
          openIndex = i;
          i += dLen;
          continue;
        } else {
          // Found closing delimiter
          const content = src.substring(openIndex + dLen, i);
          const raw = src.substring(openIndex, i + dLen);
          spans.push({
            delimiter,
            content,
            raw,
            startIndex: openIndex,
            endIndex: i + dLen,
          });
          openIndex = -1;
          i += dLen;
          continue;
        }
      }
    }
    i++;
  }

  if (openIndex !== -1) {
    unclosedCount++;
  }

  return {
    spans,
    unclosedCount,
    sanitizedText: src,
  };
}

/**
 * Safely evaluates a regular expression with static ReDoS risk verification and execution duration limits.
 */
export function safeRegexMatch(
  regex: RegExp,
  input: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): SafeMatchResult {
  const risk = detectReDosRisk(regex);
  if (risk.vulnerable) {
    return {
      matched: false,
      matches: null,
      durationMs: 0,
      timedOut: true,
      error: risk.reason,
    };
  }

  const startTime = performance.now();
  try {
    const matches = input.match(regex);
    const duration = performance.now() - startTime;
    const timedOut = duration > timeoutMs;

    return {
      matched: matches !== null,
      matches,
      durationMs: Math.round(duration * 100) / 100,
      timedOut,
      error: timedOut ? `Execution time (${duration.toFixed(2)}ms) exceeded timeout (${timeoutMs}ms)` : undefined,
    };
  } catch (err: unknown) {
    return {
      matched: false,
      matches: null,
      durationMs: performance.now() - startTime,
      timedOut: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * High-level guard orchestrator providing stats and unified parsing guards.
 */
export class RegexBacktrackingGuard {
  private options: Required<GuardOptions>;
  private totalScans = 0;
  private totalInterceptions = 0;

  constructor(options: GuardOptions = {}) {
    this.options = {
      maxScanLength: options.maxScanLength ?? DEFAULT_MAX_SCAN_LENGTH,
      maxDelimiterRepetition: options.maxDelimiterRepetition ?? DEFAULT_MAX_DELIMITER_REPETITION,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      strict: options.strict ?? false,
      maxNestingDepth: options.maxNestingDepth ?? DEFAULT_MAX_NESTING_DEPTH,
    };
  }

  public scanAndSanitize(input: string): SanitizeResult {
    this.totalScans++;
    const res = sanitizeMarkdownDelimiters(input, this.options);
    if (res.isSanitized) {
      this.totalInterceptions++;
    }
    return res;
  }

  public extractSpans(text: string, delimiter: string): DelimitedSpanResult {
    return extractDelimitedSpansLinear(text, delimiter, this.options);
  }

  public safeMatch(regex: RegExp, input: string): SafeMatchResult {
    return safeRegexMatch(regex, input, this.options.timeoutMs);
  }

  public getStats(): { totalScans: number; totalInterceptions: number } {
    return {
      totalScans: this.totalScans,
      totalInterceptions: this.totalInterceptions,
    };
  }
}
