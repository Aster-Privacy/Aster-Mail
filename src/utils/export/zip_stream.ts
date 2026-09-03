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

export interface ZipStreamTarget {
  write(chunk: Uint8Array): Promise<void>;
}

export interface ZipEntryOptions {
  zip64?: boolean;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const END_SIGNATURE = 0x06054b50;

const ZIP64_EXTRA_ID = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_UTF8_NAMES = 0x0800;
const VERSION_STORE = 20;
const VERSION_ZIP64 = 45;
const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;
const U32_LIMIT = 0xfffffffe;
const OFFSET_ZIP64_MARGIN = 0xffff0000;

const crc_table: Uint32Array = (() => {
  const t = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;

    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }

  return t;
})();

export function crc32_update(seed: number, data: Uint8Array): number {
  let c = seed;

  for (let i = 0; i < data.length; i++) {
    c = crc_table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }

  return c >>> 0;
}

export function crc32(data: Uint8Array): number {
  return (crc32_update(0xffffffff, data) ^ 0xffffffff) >>> 0;
}

function dos_datetime(when: Date): { time: number; date: number } {
  const time =
    ((when.getHours() & 0x1f) << 11) |
    ((when.getMinutes() & 0x3f) << 5) |
    ((when.getSeconds() >> 1) & 0x1f);
  const year = Math.max(1980, when.getFullYear());
  const date =
    (((year - 1980) & 0x7f) << 9) |
    (((when.getMonth() + 1) & 0x0f) << 5) |
    (when.getDate() & 0x1f);

  return { time, date };
}

class ByteBuilder {
  private bytes: number[] = [];

  u16(value: number): this {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);

    return this;
  }

  u32(value: number): this {
    const v = value >>> 0;

    this.bytes.push(
      v & 0xff,
      (v >>> 8) & 0xff,
      (v >>> 16) & 0xff,
      (v >>> 24) & 0xff,
    );

    return this;
  }

  u64(value: number): this {
    const low = value % 0x100000000;
    const high = Math.floor(value / 0x100000000);

    this.u32(low);
    this.u32(high);

    return this;
  }

  raw(data: Uint8Array): this {
    for (let i = 0; i < data.length; i++) this.bytes.push(data[i]);

    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

interface DirectoryEntry {
  name_bytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  zip64: boolean;
  time: number;
  date: number;
}

interface OpenEntry {
  name: string;
  name_bytes: Uint8Array;
  offset: number;
  zip64: boolean;
  time: number;
  date: number;
  crc_seed: number;
  size: number;
}

export class ZipStreamWriter {
  private target: ZipStreamTarget;
  private directory: DirectoryEntry[] = [];
  private open: OpenEntry | null = null;
  private offset = 0;
  private finished = false;
  private names = new Set<string>();

  constructor(target: ZipStreamTarget) {
    this.target = target;
  }

  get bytes_written(): number {
    return this.offset;
  }

  get entry_count(): number {
    return this.directory.length + (this.open ? 1 : 0);
  }

  get open_entry_name(): string | null {
    return this.open ? this.open.name : null;
  }

  get is_finished(): boolean {
    return this.finished;
  }

  unique_name(name: string): string {
    if (!this.names.has(name)) return name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";

    for (let i = 1; ; i++) {
      const candidate = stem + "_" + i + ext;

      if (!this.names.has(candidate)) return candidate;
    }
  }

  async begin_entry(
    name: string,
    options: ZipEntryOptions = {},
  ): Promise<void> {
    if (this.finished) throw new Error("zip stream already finished");
    if (this.open) await this.end_entry();

    const unique = this.unique_name(name);

    this.names.add(unique);

    const name_bytes = new TextEncoder().encode(unique);
    const zip64 = options.zip64 === true || this.offset > OFFSET_ZIP64_MARGIN;
    const { time, date } = dos_datetime(new Date());
    const header = new ByteBuilder();

    header
      .u32(LOCAL_HEADER_SIGNATURE)
      .u16(zip64 ? VERSION_ZIP64 : VERSION_STORE)
      .u16(FLAG_DATA_DESCRIPTOR | FLAG_UTF8_NAMES)
      .u16(0)
      .u16(time)
      .u16(date)
      .u32(0)
      .u32(0)
      .u32(0)
      .u16(name_bytes.length)
      .u16(zip64 ? 20 : 0)
      .raw(name_bytes);

    if (zip64) {
      header.u16(ZIP64_EXTRA_ID).u16(16).u64(0).u64(0);
    }

    this.open = {
      name: unique,
      name_bytes,
      offset: this.offset,
      zip64,
      time,
      date,
      crc_seed: 0xffffffff,
      size: 0,
    };

    await this.emit(header.build());
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (!this.open) throw new Error("zip stream has no open entry");
    if (chunk.length === 0) return;

    this.open.crc_seed = crc32_update(this.open.crc_seed, chunk);
    this.open.size += chunk.length;
    await this.emit(chunk);
  }

  async end_entry(): Promise<void> {
    const entry = this.open;

    if (!entry) return;
    this.open = null;

    if (!entry.zip64 && entry.size > U32_LIMIT) {
      throw new Error("zip entry exceeds 4GiB and was not opened as zip64");
    }
    const crc = (entry.crc_seed ^ 0xffffffff) >>> 0;
    const descriptor = new ByteBuilder();

    descriptor.u32(DATA_DESCRIPTOR_SIGNATURE).u32(crc);

    if (entry.zip64) {
      descriptor.u64(entry.size).u64(entry.size);
    } else {
      descriptor.u32(entry.size).u32(entry.size);
    }

    await this.emit(descriptor.build());

    this.directory.push({
      name_bytes: entry.name_bytes,
      crc,
      size: entry.size,
      offset: entry.offset,
      zip64: entry.zip64,
      time: entry.time,
      date: entry.date,
    });
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    if (this.open) await this.end_entry();
    this.finished = true;

    const directory_offset = this.offset;

    for (const entry of this.directory) {
      await this.emit(central_record(entry));
    }
    const directory_size = this.offset - directory_offset;
    const count = this.directory.length;
    const needs_zip64 =
      count > U16_MAX ||
      directory_offset > U32_LIMIT ||
      directory_size > U32_LIMIT;

    if (needs_zip64) {
      const zip64_end_offset = this.offset;
      const zip64_end = new ByteBuilder();

      zip64_end
        .u32(ZIP64_END_SIGNATURE)
        .u64(44)
        .u16(VERSION_ZIP64)
        .u16(VERSION_ZIP64)
        .u32(0)
        .u32(0)
        .u64(count)
        .u64(count)
        .u64(directory_size)
        .u64(directory_offset);

      await this.emit(zip64_end.build());

      const locator = new ByteBuilder();

      locator.u32(ZIP64_LOCATOR_SIGNATURE).u32(0).u64(zip64_end_offset).u32(1);

      await this.emit(locator.build());
    }

    const end = new ByteBuilder();

    end
      .u32(END_SIGNATURE)
      .u16(0)
      .u16(0)
      .u16(needs_zip64 ? U16_MAX : count)
      .u16(needs_zip64 ? U16_MAX : count)
      .u32(needs_zip64 ? U32_MAX : directory_size)
      .u32(needs_zip64 ? U32_MAX : directory_offset)
      .u16(0);

    await this.emit(end.build());
  }

  private async emit(data: Uint8Array): Promise<void> {
    await this.target.write(data);
    this.offset += data.length;
  }
}

function central_record(entry: DirectoryEntry): Uint8Array {
  const offset_overflow = entry.offset > U32_LIMIT;
  const record = new ByteBuilder();
  let extra: Uint8Array | null = null;

  if (entry.zip64) {
    const fields = new ByteBuilder();

    fields.u64(entry.size).u64(entry.size);
    if (offset_overflow) fields.u64(entry.offset);
    const body = fields.build();

    extra = new ByteBuilder()
      .u16(ZIP64_EXTRA_ID)
      .u16(body.length)
      .raw(body)
      .build();
  }
  const extra_length = extra ? extra.length : 0;

  record
    .u32(CENTRAL_HEADER_SIGNATURE)
    .u16(entry.zip64 ? VERSION_ZIP64 : VERSION_STORE)
    .u16(entry.zip64 ? VERSION_ZIP64 : VERSION_STORE)
    .u16(FLAG_DATA_DESCRIPTOR | FLAG_UTF8_NAMES)
    .u16(0)
    .u16(entry.time)
    .u16(entry.date)
    .u32(entry.crc)
    .u32(entry.zip64 ? U32_MAX : entry.size)
    .u32(entry.zip64 ? U32_MAX : entry.size)
    .u16(entry.name_bytes.length)
    .u16(extra_length)
    .u16(0)
    .u16(0)
    .u16(0)
    .u32(0)
    .u32(offset_overflow ? U32_MAX : entry.offset)
    .raw(entry.name_bytes);

  if (extra) record.raw(extra);

  return record.build();
}
