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

export interface ZipInputEntry {
  name: string;
  data: Uint8Array;
}

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

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = crc_table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dos_datetime(): { time: number; date: number } {
  const d = new Date();
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((d.getSeconds() >> 1) & 0x1f);
  const year = Math.max(1980, d.getFullYear());
  const date =
    (((year - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

export function build_store_zip(entries: ZipInputEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dos_datetime();

  const records: Array<{
    name_bytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
  }> = [];

  let local_total = 0;
  for (const e of entries) {
    const name_bytes = enc.encode(e.name);
    if (e.data.length > 0xfffffffe) {
      throw new Error("zip entry exceeds 4GiB STORE limit");
    }
    records.push({
      name_bytes,
      data: e.data,
      crc: crc32(e.data),
      offset: local_total,
    });
    local_total += 30 + name_bytes.length + e.data.length;
  }

  let central_total = 0;
  for (const r of records) central_total += 46 + r.name_bytes.length;

  const total = local_total + central_total + 22;
  if (total > 0xfffffffe) {
    throw new Error("zip archive exceeds 4GiB STORE limit");
  }
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;

  for (const r of records) {
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 0x0800, true);
    view.setUint16(pos + 8, 0, true);
    view.setUint16(pos + 10, time, true);
    view.setUint16(pos + 12, date, true);
    view.setUint32(pos + 14, r.crc, true);
    view.setUint32(pos + 18, r.data.length, true);
    view.setUint32(pos + 22, r.data.length, true);
    view.setUint16(pos + 26, r.name_bytes.length, true);
    view.setUint16(pos + 28, 0, true);
    pos += 30;
    out.set(r.name_bytes, pos);
    pos += r.name_bytes.length;
    out.set(r.data, pos);
    pos += r.data.length;
  }

  const central_start = pos;
  for (const r of records) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, time, true);
    view.setUint16(pos + 14, date, true);
    view.setUint32(pos + 16, r.crc, true);
    view.setUint32(pos + 20, r.data.length, true);
    view.setUint32(pos + 24, r.data.length, true);
    view.setUint16(pos + 28, r.name_bytes.length, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, r.offset, true);
    pos += 46;
    out.set(r.name_bytes, pos);
    pos += r.name_bytes.length;
  }

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, records.length, true);
  view.setUint16(pos + 10, records.length, true);
  view.setUint32(pos + 12, central_total, true);
  view.setUint32(pos + 16, central_start, true);
  view.setUint16(pos + 20, 0, true);

  return out;
}
