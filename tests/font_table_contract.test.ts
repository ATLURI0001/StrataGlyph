import { describe, it, expect } from 'vitest';
import { FontTableDirectoryContract, type TableRecord } from '../src/font_table_contract';

describe('FontTableDirectoryContract', () => {
  const createValidTables = (): TableRecord[] => {
    const minOffset = 12 + 6 * 16; // 108
    return [
      { tag: 'cmap', checksum: 0x1234, offset: minOffset, length: 500 },
      { tag: 'head', checksum: 0x5678, offset: minOffset + 500, length: 54 },
      { tag: 'hhea', checksum: 0x9abc, offset: minOffset + 554, length: 36 },
      { tag: 'hmtx', checksum: 0xdef0, offset: minOffset + 590, length: 1200 },
      { tag: 'maxp', checksum: 0x1111, offset: minOffset + 1790, length: 32 },
      { tag: 'name', checksum: 0x2222, offset: minOffset + 1822, length: 800 },
    ];
  };

  it('validates a compliant TrueType font table directory', () => {
    const tables = createValidTables();
    const result = FontTableDirectoryContract.validateDirectory('0x00010000', tables, 10000);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.numTables).toBe(6);
  });

  it('rejects unsupported SFNT version', () => {
    const tables = createValidTables();
    const result = FontTableDirectoryContract.validateDirectory('UNKNOWN', tables, 10000);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ERR_INVALID_SFNT_VERSION'))).toBe(true);
  });

  it('detects malformed tags and duplicate tags', () => {
    const tables: TableRecord[] = [
      { tag: 'bad', checksum: 0, offset: 200, length: 50 }, // 3 chars
      { tag: 'head', checksum: 0, offset: 250, length: 54 },
      { tag: 'head', checksum: 0, offset: 310, length: 54 }, // duplicate
    ];
    const result = FontTableDirectoryContract.validateDirectory('OTTO', tables, 10000);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ERR_MALFORMED_TABLE_TAG'))).toBe(true);
    expect(result.errors.some((e) => e.includes('ERR_DUPLICATE_TABLE_TAG'))).toBe(true);
  });

  it('catches out-of-bounds table byte offsets', () => {
    const tables: TableRecord[] = [
      { tag: 'cmap', checksum: 0, offset: 200, length: 5000 }, // offset + length = 5200 > 1000
    ];
    const result = FontTableDirectoryContract.validateDirectory('0x00010000', tables, 1000);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ERR_TABLE_OUT_OF_BOUNDS'))).toBe(true);
  });

  it('flags missing mandatory tables', () => {
    const tables: TableRecord[] = [
      { tag: 'cmap', checksum: 0, offset: 200, length: 100 },
    ];
    const result = FontTableDirectoryContract.validateDirectory('0x00010000', tables, 5000);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ERR_MISSING_MANDATORY_TABLE'))).toBe(true);
  });
});
