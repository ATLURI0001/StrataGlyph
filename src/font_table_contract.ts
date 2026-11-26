/**
 * OpenType / TrueType Font Table Directory Schema Contract.
 * 
 * Enforces strict binary header schema invariants, table boundary offsets,
 * 4-byte ASCII tag validity, and mandatory SFNT table presence.
 */

export interface TableRecord {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

export interface FontDirectoryContractResult {
  valid: boolean;
  sfntVersion: string;
  numTables: number;
  tables: Record<string, TableRecord>;
  errors: string[];
}

export class FontTableDirectoryContract {
  private static readonly VALID_SFNT_VERSIONS = new Set([
    '0x00010000', // TrueType 1.0
    'OTTO',       // OpenType with CFF
    'true',       // Apple TrueType
    'typ1',       // PostScript Type 1
  ]);

  private static readonly MANDATORY_TABLES = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name'];

  /**
   * Validates a parsed or simulated font table directory against OpenType specification contracts.
   */
  public static validateDirectory(
    sfntVersion: string,
    tableRecords: TableRecord[],
    totalFileSizeBytes: number
  ): FontDirectoryContractResult {
    const errors: string[] = [];
    const tables: Record<string, TableRecord> = {};

    // 1. Validate SFNT version
    if (!this.VALID_SFNT_VERSIONS.has(sfntVersion)) {
      errors.push(`ERR_INVALID_SFNT_VERSION: Unknown or unsupported version '${sfntVersion}'`);
    }

    const numTables = tableRecords.length;
    if (numTables <= 0) {
      errors.push('ERR_EMPTY_TABLE_DIRECTORY: Font must declare at least one table');
    }

    const minHeaderOffset = 12 + numTables * 16;

    // 2. Validate individual table records
    for (const rec of tableRecords) {
      // 4-byte ASCII tag
      if (!rec.tag || rec.tag.length !== 4) {
        errors.push(`ERR_MALFORMED_TABLE_TAG: Tag must be exactly 4 ASCII characters, got '${rec.tag}'`);
        continue;
      }

      if (tables[rec.tag]) {
        errors.push(`ERR_DUPLICATE_TABLE_TAG: Duplicate table '${rec.tag}' in directory`);
      }
      tables[rec.tag] = rec;

      // Table offset and boundary checks
      if (rec.offset < minHeaderOffset) {
        errors.push(
          `ERR_TABLE_OFFSET_COLLISION: Table '${rec.tag}' offset ${rec.offset} overlaps directory header (min ${minHeaderOffset})`
        );
      }

      if (rec.length <= 0) {
        errors.push(`ERR_ZERO_LENGTH_TABLE: Table '${rec.tag}' has invalid length ${rec.length}`);
      }

      if (rec.offset + rec.length > totalFileSizeBytes) {
        errors.push(
          `ERR_TABLE_OUT_OF_BOUNDS: Table '${rec.tag}' [${rec.offset}..${rec.offset + rec.length}] exceeds file size ${totalFileSizeBytes}`
        );
      }
    }

    // 3. Mandatory tables validation
    for (const req of this.MANDATORY_TABLES) {
      if (!tables[req]) {
        errors.push(`ERR_MISSING_MANDATORY_TABLE: Required table '${req}' not found in directory`);
      }
    }

    return {
      valid: errors.length === 0,
      sfntVersion,
      numTables,
      tables,
      errors,
    };
  }
}
