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
const enc = new TextEncoder();
const LF = 0x0a;
const CR = 0x0d;
const GT = 0x3e;
const FROM_BYTES = enc.encode("From ");

function line_starts_with_from_quoted(buf: Uint8Array, start: number, end: number): boolean {
  let i = start;
  while (i < end && buf[i] === GT) i++;
  if (end - i < FROM_BYTES.length) return false;
  for (let j = 0; j < FROM_BYTES.length; j++) {
    if (buf[i + j] !== FROM_BYTES[j]) return false;
  }
  return true;
}

export async function* mboxrd_quote(
  source: AsyncIterable<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  let pending = new Uint8Array(0);
  let at_line_start = true;

  const append = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  };

  for await (const chunk of source) {
    let buf = append(pending, chunk);
    pending = new Uint8Array(0);
    const out_parts: Uint8Array[] = [];
    let i = 0;
    while (i < buf.length) {
      if (at_line_start) {
        if (line_starts_with_from_quoted(buf, i, buf.length)) {
          out_parts.push(enc.encode(">"));
        } else if (buf.length - i < FROM_BYTES.length + 8 && buf[i] === GT) {
          pending = buf.subarray(i);
          buf = new Uint8Array(0);
          break;
        }
        at_line_start = false;
      }
      let j = i;
      while (j < buf.length && buf[j] !== LF) j++;
      if (j === buf.length) {
        pending = append(pending, buf.subarray(i));
        break;
      }
      out_parts.push(buf.subarray(i, j + 1));
      i = j + 1;
      at_line_start = true;
    }
    if (out_parts.length > 0) {
      let total = 0;
      for (const p of out_parts) total += p.length;
      const merged = new Uint8Array(total);
      let off = 0;
      for (const p of out_parts) {
        merged.set(p, off);
        off += p.length;
      }
      yield merged;
    }
  }
  if (pending.length > 0) {
    if (at_line_start && line_starts_with_from_quoted(pending, 0, pending.length)) {
      const out = new Uint8Array(pending.length + 1);
      out[0] = GT;
      out.set(pending, 1);
      yield out;
    } else {
      yield pending;
    }
  }
}

export function unused_keep_cr(): number {
  return CR;
}
