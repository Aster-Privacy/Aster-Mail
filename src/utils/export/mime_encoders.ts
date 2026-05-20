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
const QP_SOFT_LIMIT = 76;
const QP_NEEDS_ENCODE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\xff=]/;
const BASE64_LINE_BYTES = 57;
const BASE64_LINE_CHARS = 76;

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function classify_text_encoding(
  bytes: Uint8Array,
): "7bit" | "quoted-printable" {
  let line_len = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b > 0x7e || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d)) {
      return "quoted-printable";
    }
    if (b === 0x0a) {
      line_len = 0;
      continue;
    }
    if (b === 0x0d) continue;
    line_len++;
    if (line_len > 998) return "quoted-printable";
  }
  return "7bit";
}

function hex_byte(b: number): string {
  return "=" + b.toString(16).toUpperCase().padStart(2, "0");
}

export function quoted_printable_encode(input: string): string {
  const bytes = new TextEncoder().encode(input.replace(/\r\n|\n|\r/g, "\n"));
  const out: string[] = [];
  let line = "";
  const flush = (soft: boolean) => {
    out.push(soft ? line + "=" : line);
    line = "";
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x0a) {
      if (line.endsWith(" ") || line.endsWith("\t")) {
        const last = line[line.length - 1];
        line = line.slice(0, -1) + hex_byte(last.charCodeAt(0));
      }
      out.push(line);
      line = "";
      continue;
    }
    let token: string;
    if (b === 0x20 || b === 0x09) {
      token = String.fromCharCode(b);
    } else if (b === 0x3d || b < 0x20 || b > 0x7e) {
      token = hex_byte(b);
    } else {
      token = String.fromCharCode(b);
    }
    if (line.length + token.length > QP_SOFT_LIMIT - 1) {
      flush(true);
    }
    line += token;
  }
  if (line.length > 0) out.push(line);
  return out.join("\r\n");
}

export async function* qp_encode_stream(
  source: AsyncIterable<Uint8Array> | Uint8Array,
): AsyncGenerator<Uint8Array> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] =
    source instanceof Uint8Array ? [source] : [];
  if (!(source instanceof Uint8Array)) {
    for await (const c of source) chunks.push(c);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  yield enc.encode(quoted_printable_encode(text));
}

function base64_chunk(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64_ALPHABET[(n >> 18) & 0x3f];
    out += BASE64_ALPHABET[(n >> 12) & 0x3f];
    out += BASE64_ALPHABET[(n >> 6) & 0x3f];
    out += BASE64_ALPHABET[n & 0x3f];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += BASE64_ALPHABET[(n >> 18) & 0x3f];
    out += BASE64_ALPHABET[(n >> 12) & 0x3f];
    out += "==";
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += BASE64_ALPHABET[(n >> 18) & 0x3f];
    out += BASE64_ALPHABET[(n >> 12) & 0x3f];
    out += BASE64_ALPHABET[(n >> 6) & 0x3f];
    out += "=";
  }
  return out;
}

export async function* base64_encode_stream(
  source: AsyncIterable<Uint8Array> | Uint8Array,
): AsyncGenerator<Uint8Array> {
  const enc = new TextEncoder();
  let carry = new Uint8Array(0);
  const iter: AsyncIterable<Uint8Array> =
    source instanceof Uint8Array
      ? (async function* () { yield source; })()
      : source;
  for await (const chunk of iter) {
    const combined = new Uint8Array(carry.length + chunk.length);
    combined.set(carry, 0);
    combined.set(chunk, carry.length);
    const usable = combined.length - (combined.length % BASE64_LINE_BYTES);
    if (usable > 0) {
      const encodable = combined.subarray(0, usable);
      const lines: string[] = [];
      for (let i = 0; i < encodable.length; i += BASE64_LINE_BYTES) {
        lines.push(base64_chunk(encodable.subarray(i, i + BASE64_LINE_BYTES)));
      }
      yield enc.encode(lines.join("\r\n") + "\r\n");
    }
    carry = combined.subarray(usable);
  }
  if (carry.length > 0) {
    const tail: string[] = [];
    for (let i = 0; i < carry.length; i += BASE64_LINE_BYTES) {
      tail.push(base64_chunk(carry.subarray(i, Math.min(i + BASE64_LINE_BYTES, carry.length))));
    }
    yield enc.encode(tail.join("\r\n") + "\r\n");
  }
}

export function base64_line_chars(): number {
  return BASE64_LINE_CHARS;
}

export function qp_needs(input: string): boolean {
  return QP_NEEDS_ENCODE.test(input);
}
