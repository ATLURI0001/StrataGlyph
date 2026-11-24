/**
 * StrataGlyph - OpenType / TrueType Font Glyph Table Ingress Contract & Binary Buffer Sanitizer
 *
 * Enforces rigid structural and memory boundary contracts on binary font headers and table
 * records, preventing out-of-bounds buffer dereferencing, table record overlap exploits,
 * integer overflow offset wrapping, and checksum corruption before font ingestion into
 * vector SVG and Canvas text layout pipelines.
 */

export interface TableRecord {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

export interface GlyphTableSanitizerOptions {
  maxTableCount?: number;
  requireChecksumVerification?: boolean;
  requiredTags?: string[];
}

export interface SanitizedTableCatalog {
  sfntVersion: string;
  tableCount: number;
  totalByteLength: number;
  records: TableRecord[];
  tableMap: Record<string, TableRecord>;
}

export class GlyphTableContractError extends Error {
  constructor(public code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'GlyphTableContractError';
  }
}

const SUPPORTED_SFNT_VERSIONS: Record<number, string> = {
  0x00010000: 'TrueType (1.0)',
  0x4F54544F: 'OpenType (OTTO)',
  0x74727565: 'TrueType (true)',
  0x74797031: 'PostScript (typ1)',
};

/**
 * Validates binary font sfnt headers and extracts sanitized table directory records.
 */
export function validateFontHeader(
  buffer: Uint8Array,
  options: GlyphTableSanitizerOptions = {}
): SanitizedTableCatalog {
  if (!buffer || !(buffer instanceof Uint8Array)) {
    throw new GlyphTableContractError(
      'ERR_INVALID_BUFFER',
      'Font input must be a non-null Uint8Array instance'
    );
  }

  // Minimum sfnt header length: 12 bytes
  if (buffer.length < 12) {
    throw new GlyphTableContractError(
      'ERR_BUFFER_TOO_SHORT',
      `Buffer length (${buffer.length} bytes) is insufficient for sfnt font header (min 12 bytes)`
    );
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // 1. Validate sfntVersion tag
  const sfntVersionTag = view.getUint32(0, false);
  const sfntVersionName = SUPPORTED_SFNT_VERSIONS[sfntVersionTag];
  if (!sfntVersionName) {
    throw new GlyphTableContractError(
      'ERR_UNSUPPORTED_SFNT_VERSION',
      `Unsupported sfntVersion tag 0x${sfntVersionTag.toString(16).toUpperCase()}`
    );
  }

  // 2. Validate numTables
  const numTables = view.getUint16(4, false);
  const maxTableCount = Math.max(1, options.maxTableCount ?? 64);
  if (numTables === 0) {
    throw new GlyphTableContractError(
      'ERR_ZERO_TABLE_COUNT',
      'Font specifies 0 table directory records'
    );
  }
  if (numTables > maxTableCount) {
    throw new GlyphTableContractError(
      'ERR_EXCESSIVE_TABLE_COUNT',
      `Declared table count (${numTables}) exceeds safety boundary (${maxTableCount})`
    );
  }

  // 3. Verify buffer can contain full table directory (12 + numTables * 16)
  const expectedDirectoryEnd = 12 + numTables * 16;
  if (buffer.length < expectedDirectoryEnd) {
    throw new GlyphTableContractError(
      'ERR_TRUNCATED_TABLE_DIRECTORY',
      `Buffer (${buffer.length} bytes) truncated; expected at least ${expectedDirectoryEnd} bytes for table records`
    );
  }

  const records: TableRecord[] = [];
  const tableMap: Record<string, TableRecord> = {};
  const seenTags = new Set<string>();

  // 4. Parse and sanitize individual table records
  for (let i = 0; i < numTables; i++) {
    const recordOffset = 12 + i * 16;

    // Read 4-character ASCII tag
    let tag = '';
    for (let c = 0; c < 4; c++) {
      const charCode = buffer[recordOffset + c] ?? 0;
      tag += String.fromCharCode(charCode);
    }

    if (!/^[A-Za-z0-9 _-]{4}$/.test(tag)) {
      throw new GlyphTableContractError(
        'ERR_MALFORMED_TABLE_TAG',
        `Table index ${i} contains illegal non-ASCII tag '${tag}'`
      );
    }

    if (seenTags.has(tag)) {
      throw new GlyphTableContractError(
        'ERR_DUPLICATE_TABLE_TAG',
        `Duplicate table record for tag '${tag}' at index ${i}`
      );
    }
    seenTags.add(tag);

    const checksum = view.getUint32(recordOffset + 4, false);
    const offset = view.getUint32(recordOffset + 8, false);
    const length = view.getUint32(recordOffset + 12, false);

    // Guard integer overflow / wrapping
    const endOffset = offset + length;
    if (endOffset < offset) {
      throw new GlyphTableContractError(
        'ERR_INTEGER_OVERFLOW',
        `Table '${tag}' offset (${offset}) + length (${length}) wraps integer boundary`
      );
    }

    // Boundary check against buffer length
    if (endOffset > buffer.length) {
      throw new GlyphTableContractError(
        'ERR_OUT_OF_BOUNDS_TABLE',
        `Table '${tag}' bounds [${offset}, ${endOffset}) extend beyond buffer size (${buffer.length})`
      );
    }

    // Checksum verification (skip 'head' table which has checkSumAdjustment)
    if (options.requireChecksumVerification !== false && tag !== 'head') {
      const computedChecksum = computeTableChecksum(buffer, offset, length);
      if (computedChecksum !== checksum) {
        throw new GlyphTableContractError(
          'ERR_CHECKSUM_MISMATCH',
          `Table '${tag}' checksum mismatch: expected 0x${checksum.toString(16)}, got 0x${computedChecksum.toString(16)}`
        );
      }
    }

    const record: TableRecord = { tag, checksum, offset, length };
    records.push(record);
    tableMap[tag] = record;
  }

  // 5. Verify required tables if configured
  if (options.requiredTags) {
    for (const requiredTag of options.requiredTags) {
      if (!seenTags.has(requiredTag)) {
        throw new GlyphTableContractError(
          'ERR_MISSING_REQUIRED_TABLE',
          `Required font table '${requiredTag}' is absent from table directory`
        );
      }
    }
  }

  // 6. Check for destructive table overlaps
  const sortedRecords = [...records].sort((a, b) => a.offset - b.offset);
  for (let i = 0; i < sortedRecords.length - 1; i++) {
    const current = sortedRecords[i];
    const next = sortedRecords[i + 1];
    if (current && next && current.offset + current.length > next.offset) {
      throw new GlyphTableContractError(
        'ERR_OVERLAPPING_TABLES',
        `Destructive overlap between table '${current.tag}' [${current.offset}, ${current.offset + current.length}) and table '${next.tag}' [${next.offset}, ${next.offset + next.length})`
      );
    }
  }

  return {
    sfntVersion: sfntVersionName,
    tableCount: numTables,
    totalByteLength: buffer.length,
    records,
    tableMap,
  };
}

/**
 * Computes OpenType 32-bit unsigned checksum with zero-padding to 4-byte boundaries.
 */
export function computeTableChecksum(buffer: Uint8Array, offset: number, length: number): number {
  const paddedLength = (length + 3) & ~3;
  let sum = 0;

  for (let i = 0; i < paddedLength; i += 4) {
    const b0 = (offset + i < buffer.length) ? (buffer[offset + i] ?? 0) : 0;
    const b1 = (offset + i + 1 < buffer.length) ? (buffer[offset + i + 1] ?? 0) : 0;
    const b2 = (offset + i + 2 < buffer.length) ? (buffer[offset + i + 2] ?? 0) : 0;
    const b3 = (offset + i + 3 < buffer.length) ? (buffer[offset + i + 3] ?? 0) : 0;

    const word = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    sum = (sum + word) >>> 0;
  }

  return sum;
}

/**
 * Safely extracts a table buffer slice based on a validated TableRecord.
 */
export function sliceTableSafely(buffer: Uint8Array, record: TableRecord): Uint8Array {
  if (!record || record.offset + record.length > buffer.length) {
    throw new GlyphTableContractError(
      'ERR_SLICE_OUT_OF_BOUNDS',
      `Cannot slice table '${record?.tag}': offset bounds violate buffer boundaries`
    );
  }
  return buffer.subarray(record.offset, record.offset + record.length);
}
