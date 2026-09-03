//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect } from "vitest";

import { ZipStreamWriter, crc32, type ZipStreamTarget } from "./zip_stream";

class MemoryTarget implements ZipStreamTarget {
  chunks: Uint8Array[] = [];
  bytes = 0;

  async write(chunk: Uint8Array): Promise<void> {
    this.chunks.push(chunk.slice());
    this.bytes += chunk.length;
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.bytes);
    let pos = 0;

    for (const c of this.chunks) {
      out.set(c, pos);
      pos += c.length;
    }

    return out;
  }
}

interface ParsedEntry {
  name: string;
  crc: number;
  size: number;
  offset: number;
  zip64: boolean;
  data: Uint8Array;
}

function read_u16(v: DataView, at: number): number {
  return v.getUint16(at, true);
}

function read_u32(v: DataView, at: number): number {
  return v.getUint32(at, true);
}

function read_u64(v: DataView, at: number): number {
  const low = v.getUint32(at, true);
  const high = v.getUint32(at + 4, true);

  return high * 0x100000000 + low;
}

function parse_zip(bytes: Uint8Array): ParsedEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;

  for (let i = bytes.length - 22; i >= 0; i--) {
    if (read_u32(view, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  expect(end).toBeGreaterThanOrEqual(0);

  let count = read_u16(view, end + 10);
  let directory_offset = read_u32(view, end + 16);

  if (count === 0xffff || directory_offset === 0xffffffff) {
    const locator = end - 20;

    expect(read_u32(view, locator)).toBe(0x07064b50);
    const zip64_end = read_u64(view, locator + 8);

    expect(read_u32(view, zip64_end)).toBe(0x06064b50);
    count = read_u64(view, zip64_end + 32);
    directory_offset = read_u64(view, zip64_end + 48);
  }

  const entries: ParsedEntry[] = [];
  let pos = directory_offset;

  for (let i = 0; i < count; i++) {
    expect(read_u32(view, pos)).toBe(0x02014b50);
    const flags = read_u16(view, pos + 8);
    const method = read_u16(view, pos + 10);
    const crc = read_u32(view, pos + 16);
    let size = read_u32(view, pos + 24);
    const name_len = read_u16(view, pos + 28);
    const extra_len = read_u16(view, pos + 30);
    let offset = read_u32(view, pos + 42);
    const name = new TextDecoder().decode(
      bytes.subarray(pos + 46, pos + 46 + name_len),
    );

    expect(method).toBe(0);
    expect(flags & 0x0800).toBe(0x0800);

    let zip64 = false;
    let extra_pos = pos + 46 + name_len;
    const extra_end = extra_pos + extra_len;

    while (extra_pos + 4 <= extra_end) {
      const id = read_u16(view, extra_pos);
      const len = read_u16(view, extra_pos + 2);

      if (id === 0x0001) {
        zip64 = true;
        let field = extra_pos + 4;

        if (size === 0xffffffff) {
          size = read_u64(view, field);
          field += 8;
          field += 8;
        }
        if (offset === 0xffffffff) offset = read_u64(view, field);
      }
      extra_pos += 4 + len;
    }
    expect(extra_pos).toBe(extra_end);

    expect(read_u32(view, offset)).toBe(0x04034b50);
    const local_name_len = read_u16(view, offset + 26);
    const local_extra_len = read_u16(view, offset + 28);
    const data_at = offset + 30 + local_name_len + local_extra_len;
    const data = bytes.subarray(data_at, data_at + size);

    expect(crc32(data)).toBe(crc);

    const descriptor_at = data_at + size;

    expect(read_u32(view, descriptor_at)).toBe(0x08074b50);
    expect(read_u32(view, descriptor_at + 4)).toBe(crc);
    if (zip64) {
      expect(read_u64(view, descriptor_at + 8)).toBe(size);
      expect(read_u64(view, descriptor_at + 16)).toBe(size);
    } else {
      expect(read_u32(view, descriptor_at + 8)).toBe(size);
      expect(read_u32(view, descriptor_at + 12)).toBe(size);
    }

    entries.push({ name, crc, size, offset, zip64, data });
    pos = extra_end;
  }

  return entries;
}

async function build(
  fn: (w: ZipStreamWriter) => Promise<void>,
): Promise<{ bytes: Uint8Array; entries: ParsedEntry[] }> {
  const target = new MemoryTarget();
  const writer = new ZipStreamWriter(target);

  await fn(writer);
  await writer.finish();
  const bytes = target.concat();

  return { bytes, entries: parse_zip(bytes) };
}

const text = (value: string) => new TextEncoder().encode(value);

describe("ZipStreamWriter", () => {
  it("writes a readable archive with one entry", async () => {
    const { entries } = await build(async (w) => {
      await w.begin_entry("hello.txt");
      await w.write(text("hello world"));
      await w.end_entry();
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("hello.txt");
    expect(entries[0].zip64).toBe(false);
    expect(new TextDecoder().decode(entries[0].data)).toBe("hello world");
  });

  it("joins chunks written across many calls into one entry", async () => {
    const { entries } = await build(async (w) => {
      await w.begin_entry("mailbox.mbox", { zip64: true });
      for (let i = 0; i < 500; i++) await w.write(text("line " + i + "\n"));
      await w.end_entry();
    });

    let expected = "";

    for (let i = 0; i < 500; i++) expected += "line " + i + "\n";
    expect(entries).toHaveLength(1);
    expect(entries[0].zip64).toBe(true);
    expect(new TextDecoder().decode(entries[0].data)).toBe(expected);
    expect(entries[0].size).toBe(text(expected).length);
  });

  it("closes an open entry when the next one begins", async () => {
    const { entries } = await build(async (w) => {
      await w.begin_entry("a.txt");
      await w.write(text("aaa"));
      await w.begin_entry("b.txt");
      await w.write(text("bbbb"));
    });

    expect(entries.map((e) => e.name)).toEqual(["a.txt", "b.txt"]);
    expect(entries[0].size).toBe(3);
    expect(entries[1].size).toBe(4);
  });

  it("keeps entry names unique instead of writing duplicates", async () => {
    const { entries } = await build(async (w) => {
      await w.begin_entry("contacts.json");
      await w.write(text("first"));
      await w.begin_entry("contacts.json");
      await w.write(text("second"));
      await w.begin_entry("contacts.json");
      await w.write(text("third"));
    });

    expect(entries.map((e) => e.name)).toEqual([
      "contacts.json",
      "contacts_1.json",
      "contacts_2.json",
    ]);
  });

  it("preserves non-ascii names and content", async () => {
    const name = "eml/2026-01-01_Grüße_日本語.eml";
    const body = "Subject: Grüße 日本語\r\n\r\nこんにちは\r\n";
    const { entries } = await build(async (w) => {
      await w.begin_entry(name);
      await w.write(text(body));
      await w.end_entry();
    });

    expect(entries[0].name).toBe(name);
    expect(new TextDecoder().decode(entries[0].data)).toBe(body);
  });

  it("writes an empty entry without a data descriptor mismatch", async () => {
    const { entries } = await build(async (w) => {
      await w.begin_entry("empty.txt");
      await w.end_entry();
    });

    expect(entries[0].size).toBe(0);
    expect(entries[0].crc).toBe(crc32(new Uint8Array(0)));
  });

  it("produces an archive with no entries at all", async () => {
    const { entries, bytes } = await build(async () => {});

    expect(entries).toHaveLength(0);
    expect(bytes).toHaveLength(22);
  });

  it("rejects writing without an open entry", async () => {
    const writer = new ZipStreamWriter(new MemoryTarget());

    await expect(writer.write(text("x"))).rejects.toThrow(/no open entry/);
  });

  it("rejects a new entry after the archive is finished", async () => {
    const writer = new ZipStreamWriter(new MemoryTarget());

    await writer.finish();
    await expect(writer.begin_entry("late.txt")).rejects.toThrow(
      /already finished/,
    );
  });

  it("finishes only once", async () => {
    const target = new MemoryTarget();
    const writer = new ZipStreamWriter(target);

    await writer.begin_entry("a.txt");
    await writer.write(text("a"));
    await writer.finish();
    const size = target.bytes;

    await writer.finish();
    expect(target.bytes).toBe(size);
  });

  it("tracks bytes written and entry count", async () => {
    const target = new MemoryTarget();
    const writer = new ZipStreamWriter(target);

    await writer.begin_entry("a.txt");
    await writer.write(text("12345"));
    expect(writer.open_entry_name).toBe("a.txt");
    await writer.end_entry();
    expect(writer.entry_count).toBe(1);
    expect(writer.bytes_written).toBe(target.bytes);
    await writer.finish();
    expect(writer.bytes_written).toBe(target.bytes);
    expect(writer.is_finished).toBe(true);
  });

  it("writes a zip64 archive when the entry count overflows the classic end record", async () => {
    const target = new MemoryTarget();
    const writer = new ZipStreamWriter(target);

    for (let i = 0; i < 70000; i++) {
      await writer.begin_entry("eml/m" + i + ".eml");
      await writer.write(text("x"));
    }
    await writer.finish();
    const bytes = target.concat();
    const view = new DataView(bytes.buffer);
    let end = -1;

    for (let i = bytes.length - 22; i >= 0; i--) {
      if (read_u32(view, i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    expect(read_u16(view, end + 10)).toBe(0xffff);
    expect(read_u32(view, end - 20)).toBe(0x07064b50);
    const zip64_end = read_u64(view, end - 12);

    expect(read_u32(view, zip64_end)).toBe(0x06064b50);
    expect(read_u64(view, zip64_end + 32)).toBe(70000);
  });

  it("refuses to close an oversized entry that was not opened as zip64", async () => {
    const writer = new ZipStreamWriter(new MemoryTarget());

    await writer.begin_entry("big.bin");
    (writer as unknown as { open: { size: number } }).open.size = 0x100000000;
    await expect(writer.end_entry()).rejects.toThrow(/zip64/);
  });
});
