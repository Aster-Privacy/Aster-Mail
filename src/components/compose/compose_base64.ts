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
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function array_buffer_to_base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  const remainder = len % 3;
  const main_len = len - remainder;
  const parts: string[] = [];

  for (let i = 0; i < main_len; i += 3) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

    parts.push(
      B64[(triplet >> 18) & 63] +
        B64[(triplet >> 12) & 63] +
        B64[(triplet >> 6) & 63] +
        B64[triplet & 63],
    );
  }

  if (remainder === 1) {
    const b = bytes[main_len];

    parts.push(B64[b >> 2] + B64[(b & 3) << 4] + "==");
  } else if (remainder === 2) {
    const b0 = bytes[main_len];
    const b1 = bytes[main_len + 1];

    parts.push(
      B64[b0 >> 2] +
        B64[((b0 & 3) << 4) | (b1 >> 4)] +
        B64[(b1 & 15) << 2] +
        "=",
    );
  }

  return parts.join("");
}

const B64_LOOKUP = new Uint8Array(128);

for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function base64_to_array_buffer(base64: string): ArrayBuffer {
  let len = base64.length;

  while (len > 0 && base64[len - 1] === "=") len--;

  const out_len = (len * 3) >> 2;
  const bytes = new Uint8Array(out_len);
  let j = 0;

  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[base64.charCodeAt(i)];
    const b = i + 1 < len ? B64_LOOKUP[base64.charCodeAt(i + 1)] : 0;
    const c = i + 2 < len ? B64_LOOKUP[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? B64_LOOKUP[base64.charCodeAt(i + 3)] : 0;
    const triplet = (a << 18) | (b << 12) | (c << 6) | d;

    if (j < out_len) bytes[j++] = (triplet >> 16) & 255;
    if (j < out_len) bytes[j++] = (triplet >> 8) & 255;
    if (j < out_len) bytes[j++] = triplet & 255;
  }

  return bytes.buffer;
}
