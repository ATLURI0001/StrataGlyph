import { describe, expect, it } from 'vitest';
import {
  calculateTableChecksum,
  FontSentinelAuditResult,
  FontTableCorruptionError,
  inspectFontBuffer,
  isFontSafeForRendering,
} from '../src/font_table_corruption_sentinel';

function createMockFontBuffer(options: {
  sfntTag?: number;
  tables?: Array<{ tag: string; offset: number; length: number; data?: Uint8Array }>;
  corruptHeadMagic?: boolean;
  locaFormat?: number;
  locaLength?: number;
}): Uint8Array {
  const sfntTag = options.sfntTag ?? 0x00010000;
  const tables = options.tables ?? [];
  const numTables = tables.length;

  const headerDirSize = 12 + numTables * 16;
  let totalSize = headerDirSize;
  for (const t of tables) {
    totalSize = Math.max(totalSize, t.offset + t.length);
  }

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // sfnt header
  view.setUint32(0, sfntTag, false);
  view.setUint16(4, numTables, false);
  view.setUint16(6, 0, false); // searchRange
  view.setUint16(8, 0, false); // entrySelector
  view.setUint16(10, 0, false); // rangeShift

  // tables directory
  for (let i = 0; i < numTables; i++) {
    const t = tables[i];
    const recOffset = 12 + i * 16;
    for (let c = 0; c < 4; c++) {
      buf[recOffset + c] = t.tag.charCodeAt(c);
    }
    view.setUint32(recOffset + 4, 0, false); // checksum
    view.setUint32(recOffset + 8, t.offset, false);
    view.setUint32(recOffset + 12, t.length, false);

    if (t.data) {
      buf.set(t.data, t.offset);
    }
  }

  return buf;
}

describe('INC-2026-GLYPH-8102 Font Table Corruption Sentinel', () => {
  it('throws on null or invalid buffer', () => {
    // @ts-expect-error test invalid param
    expect(() => inspectFontBuffer(null)).toThrow(FontTableCorruptionError);
    // @ts-expect-error test invalid param
    expect(() => inspectFontBuffer({})).toThrow('Buffer must be a non-null Uint8Array');
  });

  it('throws on buffer shorter than sfnt header', () => {
    const shortBuf = new Uint8Array(8);
    expect(() => inspectFontBuffer(shortBuf)).toThrow('too short for sfnt header');
  });

  it('throws on unrecognized sfnt tag', () => {
    const badTag = new Uint8Array(16);
    const view = new DataView(badTag.buffer);
    view.setUint32(0, 0x12345678, false);
    view.setUint16(4, 1, false);

    expect(() => inspectFontBuffer(badTag)).toThrow('Unrecognized sfnt version tag');
  });

  it('throws on empty table directory', () => {
    const emptyBuf = new Uint8Array(12);
    const view = new DataView(emptyBuf.buffer);
    view.setUint32(0, 0x00010000, false);
    view.setUint16(4, 0, false);

    expect(() => inspectFontBuffer(emptyBuf)).toThrow('contains zero directory table records');
  });

  it('throws on table record extending past buffer length (out of bounds)', () => {
    const buf = createMockFontBuffer({
      tables: [
        { tag: 'head', offset: 28, length: 100 }, // buffer only holds directory
      ],
    });
    // Shrink buffer to induce out-of-bounds
    const truncated = buf.slice(0, 50);
    expect(() => inspectFontBuffer(truncated)).toThrow('extends past buffer length');
  });

  it('throws on duplicate table tags in directory', () => {
    const buf = createMockFontBuffer({
      tables: [
        { tag: 'cmap', offset: 44, length: 16 },
        { tag: 'cmap', offset: 60, length: 16 },
      ],
    });
    expect(() => inspectFontBuffer(buf)).toThrow('Duplicate table directory tag');
  });

  it('throws on overlapping table records (INC-2026-GLYPH-8102 regression)', () => {
    const buf = createMockFontBuffer({
      tables: [
        { tag: 'head', offset: 44, length: 30 },
        { tag: 'cmap', offset: 50, length: 30 }, // Overlaps with head [44..74]
      ],
    });
    expect(() => inspectFontBuffer(buf)).toThrow('overlaps with existing table');
  });

  it('validates head table magic number and detects corruption', () => {
    // Valid head table
    const headData = new Uint8Array(54);
    const headView = new DataView(headData.buffer);
    headView.setUint32(12, 0x5f0f3cf5, false); // HEAD_MAGIC_NUMBER
    headView.setInt16(50, 1, false); // indexToLocFormat: 1 (long)

    const buf = createMockFontBuffer({
      tables: [
        { tag: 'head', offset: 28, length: 54, data: headData },
      ],
    });

    const result = inspectFontBuffer(buf);
    expect(result.valid).toBe(true);
    expect(result.hasHead).toBe(true);
    expect(result.indexToLocFormat).toBe(1);

    // Corrupt magic number
    headView.setUint32(12, 0xdeadbeef, false);
    const corruptBuf = createMockFontBuffer({
      tables: [
        { tag: 'head', offset: 28, length: 54, data: headData },
      ],
    });
    expect(() => inspectFontBuffer(corruptBuf)).toThrow('magic number');
  });

  it('detects loca format desynchronization against head indexToLocFormat', () => {
    const headData = new Uint8Array(54);
    const headView = new DataView(headData.buffer);
    headView.setUint32(12, 0x5f0f3cf5, false);
    headView.setInt16(50, 1, false); // format 1 requires multiples of 4 bytes

    // loca table of 6 bytes (not multiple of 4!)
    const locaData = new Uint8Array(6);

    const buf = createMockFontBuffer({
      tables: [
        { tag: 'head', offset: 44, length: 54, data: headData },
        { tag: 'loca', offset: 100, length: 6, data: locaData },
      ],
    });

    expect(() => inspectFontBuffer(buf)).toThrow('is not a multiple of 4 for long format');
  });

  it('calculates table checksum accurately', () => {
    const data = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
    const checksum = calculateTableChecksum(data, 0, data.length);
    expect(checksum).toBeGreaterThan(0);
  });

  it('evaluates isFontSafeForRendering predicate correctly', () => {
    const headData = new Uint8Array(54);
    new DataView(headData.buffer).setUint32(12, 0x5f0f3cf5, false);

    const cmapData = new Uint8Array(16);

    // Safe font having head and cmap
    const safeBuf = createMockFontBuffer({
      tables: [
        { tag: 'head', offset: 44, length: 54, data: headData },
        { tag: 'cmap', offset: 100, length: 16, data: cmapData },
      ],
    });
    expect(isFontSafeForRendering(safeBuf)).toBe(true);

    // Missing cmap -> not safe
    const incompleteBuf = createMockFontBuffer({
      tables: [
        { tag: 'head', offset: 28, length: 54, data: headData },
      ],
    });
    expect(isFontSafeForRendering(incompleteBuf)).toBe(false);
  });
});
