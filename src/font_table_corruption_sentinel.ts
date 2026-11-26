/**
 * StrataGlyph - INC-2026-GLYPH-8102 Font Table Corruption Sentinel
 *
 * Incident Sentinel for INC-2026-GLYPH-8102: Corrupt or maliciously crafted TrueType/OpenType
 * font tables causing out-of-bounds buffer reads, indexToLocFormat desync, table boundary overlaps,
 * and vector layout crash cascades during diagram text rasterization.
 */

export interface FontTableEntry {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

export interface FontSentinelOptions {
  strictChecksums?: boolean;
  maxTableCount?: number;
  allowedTags?: string[];
  maxTotalFileSize?: number;
}

export interface FontSentinelAuditResult {
  valid: boolean;
  sfntVersion: string;
  numTables: number;
  tables: Record<string, FontTableEntry>;
  hasHead: boolean;
  hasCmap: boolean;
  hasGlyf: boolean;
  hasLoca: boolean;
  indexToLocFormat?: number; // 0 = short (16-bit), 1 = long (32-bit)
  anomaliesDetected: string[];
}

export class FontTableCorruptionError extends Error {
  constructor(
    public readonly incidentCode: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(`[INC-2026-GLYPH-8102][${incidentCode}] ${message}`);
    this.name = 'FontTableCorruptionError';
  }
}

const HEAD_MAGIC_NUMBER = 0x5f0f3cf5;
const MAX_ALLOWED_TABLES_DEFAULT = 64;
const MAX_FILE_SIZE_DEFAULT = 32 * 1024 * 1024; // 32MB

/**
 * Calculates OpenType 32-bit table checksum.
 */
export function calculateTableChecksum(buffer: Uint8Array, offset: number, length: number): number {
  let sum = 0;
  const numLongs = Math.floor((length + 3) / 4);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  for (let i = 0; i < numLongs; i++) {
    const pos = offset + i * 4;
    let val = 0;
    if (pos + 4 <= buffer.byteLength) {
      val = view.getUint32(pos, false);
    } else {
      // Zero-padded tail
      for (let b = 0; b < 4; b++) {
        if (pos + b < buffer.byteLength) {
          val = (val << 8) | buffer[pos + b];
        } else {
          val = (val << 8);
        }
      }
    }
    sum = (sum + val) >>> 0;
  }
  return sum;
}

/**
 * Deep inspects and sanitizes font binary buffers against INC-2026-GLYPH-8102 corruptions.
 */
export function inspectFontBuffer(
  buffer: Uint8Array,
  options: FontSentinelOptions = {}
): FontSentinelAuditResult {
  if (!buffer || !(buffer instanceof Uint8Array)) {
    throw new FontTableCorruptionError(
      'ERR_INVALID_BUFFER',
      'Buffer must be a non-null Uint8Array instance'
    );
  }

  const maxFileSize = options.maxTotalFileSize ?? MAX_FILE_SIZE_DEFAULT;
  if (buffer.length > maxFileSize) {
    throw new FontTableCorruptionError(
      'ERR_BUFFER_EXCEEDS_MAX_SIZE',
      `Font file length ${buffer.length} exceeds maximum permissible size ${maxFileSize}`
    );
  }

  if (buffer.length < 12) {
    throw new FontTableCorruptionError(
      'ERR_TRUNCATED_SFNT_HEADER',
      `Buffer of size ${buffer.length} bytes is too short for sfnt header (min 12 bytes)`
    );
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const sfntTag = view.getUint32(0, false);
  let sfntVersion: string;

  switch (sfntTag) {
    case 0x00010000:
      sfntVersion = 'TrueType-1.0';
      break;
    case 0x4f54544f:
      sfntVersion = 'OpenType-CFF';
      break;
    case 0x74727565:
      sfntVersion = 'TrueType-Apple';
      break;
    case 0x774f4646:
      sfntVersion = 'WOFF-1.0';
      break;
    default:
      throw new FontTableCorruptionError(
        'ERR_UNRECOGNIZED_SFNT_TAG',
        `Unrecognized sfnt version tag 0x${sfntTag.toString(16).padStart(8, '0')}`
      );
  }

  const numTables = view.getUint16(4, false);
  const maxTables = options.maxTableCount ?? MAX_ALLOWED_TABLES_DEFAULT;

  if (numTables === 0) {
    throw new FontTableCorruptionError(
      'ERR_EMPTY_TABLE_DIRECTORY',
      'Font contains zero directory table records'
    );
  }

  if (numTables > maxTables) {
    throw new FontTableCorruptionError(
      'ERR_TABLE_COUNT_EXCEEDS_CAP',
      `Number of tables ${numTables} exceeds limit ${maxTables}`
    );
  }

  const headerDirectorySize = 12 + numTables * 16;
  if (buffer.length < headerDirectorySize) {
    throw new FontTableCorruptionError(
      'ERR_TRUNCATED_TABLE_DIRECTORY',
      `Font buffer length ${buffer.length} is insufficient for ${numTables} table directory entries (${headerDirectorySize} required)`
    );
  }

  const tables: Record<string, FontTableEntry> = {};
  const ranges: Array<{ tag: string; start: number; end: number }> = [];
  const anomalies: string[] = [];

  for (let i = 0; i < numTables; i++) {
    const recOffset = 12 + i * 16;
    let tag = '';
    for (let t = 0; t < 4; t++) {
      tag += String.fromCharCode(buffer[recOffset + t]);
    }

    const checksum = view.getUint32(recOffset + 4, false);
    const tableOffset = view.getUint32(recOffset + 8, false);
    const tableLength = view.getUint32(recOffset + 12, false);

    if (tableOffset > buffer.length || tableOffset + tableLength > buffer.length) {
      throw new FontTableCorruptionError(
        'ERR_TABLE_OUT_OF_BOUNDS',
        `Table '${tag}' offset ${tableOffset} length ${tableLength} extends past buffer length ${buffer.length}`,
        { tag, tableOffset, tableLength, bufferLength: buffer.length }
      );
    }

    if (tables[tag]) {
      throw new FontTableCorruptionError(
        'ERR_DUPLICATE_TABLE_TAG',
        `Duplicate table directory tag '${tag}' encountered at index ${i}`
      );
    }

    // Check table overlap (ignoring 0-length tables)
    if (tableLength > 0) {
      const start = tableOffset;
      const end = tableOffset + tableLength;

      for (const range of ranges) {
        if (Math.max(start, range.start) < Math.min(end, range.end)) {
          throw new FontTableCorruptionError(
            'ERR_TABLE_OVERLAP',
            `Table '${tag}' [${start}..${end}] overlaps with existing table '${range.tag}' [${range.start}..${range.end}]`
          );
        }
      }
      ranges.push({ tag, start, end });
    }

    // Checksum check if strict
    if (options.strictChecksums && tag !== 'head') {
      const computed = calculateTableChecksum(buffer, tableOffset, tableLength);
      if (computed !== checksum) {
        anomalies.push(`Checksum mismatch on '${tag}': expected 0x${checksum.toString(16)}, got 0x${computed.toString(16)}`);
      }
    }

    tables[tag] = {
      tag,
      checksum,
      offset: tableOffset,
      length: tableLength,
    };
  }

  // Deep validation of 'head' table if present
  let indexToLocFormat: number | undefined;
  if (tables['head']) {
    const head = tables['head'];
    if (head.length < 54) {
      throw new FontTableCorruptionError(
        'ERR_TRUNCATED_HEAD_TABLE',
        `'head' table is ${head.length} bytes, minimum is 54 bytes`
      );
    }

    const magic = view.getUint32(head.offset + 12, false);
    if (magic !== HEAD_MAGIC_NUMBER) {
      throw new FontTableCorruptionError(
        'ERR_CORRUPT_HEAD_MAGIC',
        `'head' magic number 0x${magic.toString(16)} does not match expected 0x${HEAD_MAGIC_NUMBER.toString(16)}`
      );
    }

    indexToLocFormat = view.getInt16(head.offset + 50, false);
    if (indexToLocFormat !== 0 && indexToLocFormat !== 1) {
      throw new FontTableCorruptionError(
        'ERR_INVALID_LOCA_FORMAT',
        `Invalid indexToLocFormat ${indexToLocFormat} in 'head' table (must be 0 or 1)`
      );
    }
  }

  // Check 'loca' table consistency against indexToLocFormat if both present
  if (tables['loca'] && tables['head'] && indexToLocFormat !== undefined) {
    const loca = tables['loca'];
    if (indexToLocFormat === 0) {
      // Short format: 16-bit offsets (multiplied by 2)
      if (loca.length % 2 !== 0) {
        throw new FontTableCorruptionError(
          'ERR_LOCA_FORMAT_DESYNC',
          `'loca' length ${loca.length} is not a multiple of 2 for short format (indexToLocFormat=0)`
        );
      }
    } else if (indexToLocFormat === 1) {
      // Long format: 32-bit offsets
      if (loca.length % 4 !== 0) {
        throw new FontTableCorruptionError(
          'ERR_LOCA_FORMAT_DESYNC',
          `'loca' length ${loca.length} is not a multiple of 4 for long format (indexToLocFormat=1)`
        );
      }
    }
  }

  return {
    valid: anomalies.length === 0,
    sfntVersion,
    numTables,
    tables,
    hasHead: Boolean(tables['head']),
    hasCmap: Boolean(tables['cmap']),
    hasGlyf: Boolean(tables['glyf']),
    hasLoca: Boolean(tables['loca']),
    indexToLocFormat,
    anomaliesDetected: anomalies,
  };
}

/**
 * Validates whether font buffer is safe to pass to diagram glyph renderers.
 */
export function isFontSafeForRendering(buffer: Uint8Array): boolean {
  try {
    const res = inspectFontBuffer(buffer);
    return res.hasHead && res.hasCmap;
  } catch {
    return false;
  }
}
