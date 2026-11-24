import { describe, expect, it } from 'vitest';
import {
  validateFontHeader,
  computeTableChecksum,
  sliceTableSafely,
  GlyphTableContractError,
  type TableRecord,
} from '../src/glyph_table_contract.ts';

function buildSyntheticFontBuffer(tables: Array<{ tag: string; data: Uint8Array }>): Uint8Array {
  const numTables = tables.length;
  const headerSize = 12 + numTables * 16;

  // Calculate table offsets with 4-byte padding
  let currentOffset = headerSize;
  const tableEntries: Array<{ tag: string; data: Uint8Array; offset: number; length: number; checksum: number }> = [];

  for (const t of tables) {
    const offset = currentOffset;
    const length = t.data.length;
    tableEntries.push({
      tag: t.tag,
      data: t.data,
      offset,
      length,
      checksum: 0, // computed below
    });
    currentOffset += (length + 3) & ~3;
  }

  const fullBuffer = new Uint8Array(currentOffset);
  const view = new DataView(fullBuffer.buffer);

  // Write sfnt header: 0x00010000 (TrueType), numTables, searchRange, entrySelector, rangeShift
  view.setUint32(0, 0x00010000, false);
  view.setUint16(4, numTables, false);
  view.setUint16(6, 16, false); // searchRange dummy
  view.setUint16(8, 1, false);  // entrySelector dummy
  view.setUint16(10, 0, false); // rangeShift dummy

  // Write table payload bytes first so checksum calculation reads real data
  for (const entry of tableEntries) {
    fullBuffer.set(entry.data, entry.offset);
    entry.checksum = computeTableChecksum(fullBuffer, entry.offset, entry.length);
  }

  // Write table directory entries
  for (let i = 0; i < numTables; i++) {
    const entry = tableEntries[i]!;
    const recOffset = 12 + i * 16;
    for (let c = 0; c < 4; c++) {
      fullBuffer[recOffset + c] = entry.tag.charCodeAt(c);
    }
    view.setUint32(recOffset + 4, entry.checksum, false);
    view.setUint32(recOffset + 8, entry.offset, false);
    view.setUint32(recOffset + 12, entry.length, false);
  }

  return fullBuffer;
}

describe('GlyphTableContract & Binary Sanitizer Suite', () => {
  it('parses and validates nominal TrueType font buffer', () => {
    const tableData1 = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const tableData2 = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]);

    const buffer = buildSyntheticFontBuffer([
      { tag: 'maxp', data: tableData1 },
      { tag: 'cmap', data: tableData2 },
    ]);

    const catalog = validateFontHeader(buffer);
    expect(catalog.sfntVersion).toContain('TrueType');
    expect(catalog.tableCount).toBe(2);
    expect(catalog.records).toHaveLength(2);
    expect(catalog.tableMap['maxp']).toBeDefined();
    expect(catalog.tableMap['cmap']).toBeDefined();

    const maxpSlice = sliceTableSafely(buffer, catalog.tableMap['maxp']!);
    expect(maxpSlice).toEqual(tableData1);
  });

  it('rejects invalid or undersized buffers defensively', () => {
    expect(() => validateFontHeader(null as unknown as Uint8Array)).toThrow(GlyphTableContractError);
    expect(() => validateFontHeader(new Uint8Array(8))).toThrow(/ERR_BUFFER_TOO_SHORT/);
  });

  it('rejects unsupported sfntVersion tags', () => {
    const buffer = new Uint8Array(16);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 0xDEADBEEF, false);
    view.setUint16(4, 1, false);

    expect(() => validateFontHeader(buffer)).toThrow(/ERR_UNSUPPORTED_SFNT_VERSION/);
  });

  it('rejects zero or excessive table counts', () => {
    const buffer = new Uint8Array(16);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 0x00010000, false);
    view.setUint16(4, 0, false);
    expect(() => validateFontHeader(buffer)).toThrow(/ERR_ZERO_TABLE_COUNT/);

    view.setUint16(4, 100, false);
    expect(() => validateFontHeader(buffer, { maxTableCount: 64 })).toThrow(/ERR_EXCESSIVE_TABLE_COUNT/);
  });

  it('rejects truncated table directory', () => {
    const buffer = new Uint8Array(20);
    const view = new DataView(buffer.buffer);
    view.setUint32(0, 0x00010000, false);
    view.setUint16(4, 2, false); // needs 12 + 2*16 = 44 bytes

    expect(() => validateFontHeader(buffer)).toThrow(/ERR_TRUNCATED_TABLE_DIRECTORY/);
  });

  it('detects duplicate table tags', () => {
    const buffer = buildSyntheticFontBuffer([
      { tag: 'cmap', data: new Uint8Array([1, 2, 3, 4]) },
      { tag: 'cmap', data: new Uint8Array([5, 6, 7, 8]) },
    ]);

    expect(() => validateFontHeader(buffer)).toThrow(/ERR_DUPLICATE_TABLE_TAG/);
  });

  it('detects out-of-bounds table offsets and lengths', () => {
    const buffer = buildSyntheticFontBuffer([
      { tag: 'glyf', data: new Uint8Array([1, 2, 3, 4]) },
    ]);

    // Corrupt length to exceed buffer
    const view = new DataView(buffer.buffer);
    view.setUint32(12 + 12, 99999, false);

    expect(() => validateFontHeader(buffer)).toThrow(/ERR_OUT_OF_BOUNDS_TABLE/);
  });

  it('detects checksum mismatch corruption', () => {
    const buffer = buildSyntheticFontBuffer([
      { tag: 'glyf', data: new Uint8Array([1, 2, 3, 4]) },
    ]);

    // Corrupt checksum in header
    const view = new DataView(buffer.buffer);
    view.setUint32(12 + 4, 0x12345678, false);

    expect(() => validateFontHeader(buffer)).toThrow(/ERR_CHECKSUM_MISMATCH/);
  });

  it('enforces required table presence', () => {
    const buffer = buildSyntheticFontBuffer([
      { tag: 'maxp', data: new Uint8Array([1, 2, 3, 4]) },
    ]);

    expect(() => validateFontHeader(buffer, { requiredTags: ['head', 'cmap'] })).toThrow(
      /ERR_MISSING_REQUIRED_TABLE/
    );
  });

  it('detects destructive table overlaps', () => {
    const buffer = buildSyntheticFontBuffer([
      { tag: 'tabA', data: new Uint8Array([1, 2, 3, 4]) },
      { tag: 'tabB', data: new Uint8Array([5, 6, 7, 8]) },
    ]);

    // Make table B offset overlap into table A range
    const view = new DataView(buffer.buffer);
    const tabAOffset = view.getUint32(12 + 8, false);
    view.setUint32(12 + 16 + 8, tabAOffset + 2, false); // overlapping by 2 bytes

    expect(() => validateFontHeader(buffer, { requireChecksumVerification: false })).toThrow(
      /ERR_OVERLAPPING_TABLES/
    );
  });
});
