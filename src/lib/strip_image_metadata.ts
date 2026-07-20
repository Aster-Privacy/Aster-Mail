// SPDX-FileCopyrightText: 2026 Aster Communications Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later
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
export type StripStatus = "stripped" | "unsupported" | "failed";

export interface StripResult {
  data: ArrayBuffer;
  status: StripStatus;
}

type ImageFormat = "jpeg" | "png" | "webp";

const FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const CANVAS_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const PNG_KEEP_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
  "cICP",
  "mDCv",
  "cLLi",
]);

function read_u32_be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function read_u32_le(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset + 3] << 24) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 1] << 8) |
      bytes[offset]) >>>
    0
  );
}

function write_u32_le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function read_ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";

  for (let i = 0; i < length; i++)
    out += String.fromCharCode(bytes[offset + i]);

  return out;
}

function has_ascii_prefix(
  bytes: Uint8Array,
  start: number,
  end: number,
  prefix: string,
): boolean {
  if (end - start < prefix.length) return false;

  for (let i = 0; i < prefix.length; i++) {
    if (bytes[start + i] !== prefix.charCodeAt(i)) return false;
  }

  return true;
}

function concat_chunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;

  for (const chunk of chunks) total += chunk.length;

  const out = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

function detect_format(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }

  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return "png";
  }

  if (
    bytes.length >= 12 &&
    read_ascii(bytes, 0, 4) === "RIFF" &&
    read_ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

function should_drop_jpeg_segment(
  bytes: Uint8Array,
  marker: number,
  payload_start: number,
  payload_end: number,
): boolean {
  if (marker === 0xfe) return true;
  if (marker === 0xe1) return true;

  if (marker === 0xe2) {
    return !has_ascii_prefix(bytes, payload_start, payload_end, "ICC_PROFILE");
  }

  if (marker === 0xee) {
    return !has_ascii_prefix(bytes, payload_start, payload_end, "Adobe");
  }

  if (marker >= 0xe3 && marker <= 0xef) return true;

  return false;
}

function strip_jpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;

    let marker_offset = offset;

    while (marker_offset < bytes.length && bytes[marker_offset] === 0xff) {
      marker_offset++;
    }

    if (marker_offset >= bytes.length) return null;

    const marker = bytes[marker_offset];

    if (marker === 0xda || marker === 0xd9) {
      kept.push(bytes.subarray(offset));

      return concat_chunks(kept);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(offset, marker_offset + 1));
      offset = marker_offset + 1;
      continue;
    }

    const length_offset = marker_offset + 1;

    if (length_offset + 1 >= bytes.length) return null;

    const segment_length =
      (bytes[length_offset] << 8) | bytes[length_offset + 1];

    if (segment_length < 2) return null;

    const segment_end = length_offset + segment_length;

    if (segment_end > bytes.length) return null;

    if (
      should_drop_jpeg_segment(bytes, marker, length_offset + 2, segment_end)
    ) {
      offset = segment_end;
      continue;
    }

    kept.push(bytes.subarray(offset, segment_end));
    offset = segment_end;
  }

  return concat_chunks(kept);
}

function strip_png(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8) return null;

  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  }

  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let saw_end = false;

  while (offset + 8 <= bytes.length) {
    const length = read_u32_be(bytes, offset);

    if (length > 0x7fffffff) return null;

    const type = read_ascii(bytes, offset + 4, 4);
    const chunk_end = offset + 12 + length;

    if (chunk_end > bytes.length) return null;

    const is_critical = (bytes[offset + 4] & 0x20) === 0;

    if (is_critical || PNG_KEEP_CHUNKS.has(type)) {
      kept.push(bytes.subarray(offset, chunk_end));
    }

    offset = chunk_end;

    if (type === "IEND") {
      saw_end = true;
      break;
    }
  }

  if (!saw_end) return null;

  return concat_chunks(kept);
}

function strip_webp(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12) return null;
  if (read_ascii(bytes, 0, 4) !== "RIFF") return null;
  if (read_ascii(bytes, 8, 4) !== "WEBP") return null;

  const riff_size = read_u32_le(bytes, 4);
  const declared_end = Math.min(bytes.length, 8 + riff_size);

  if (declared_end < 12) return null;

  const kept: Uint8Array[] = [];
  let offset = 12;

  while (offset + 8 <= declared_end) {
    const fourcc = read_ascii(bytes, offset, 4);
    const size = read_u32_le(bytes, offset + 4);

    if (size > 0x7fffffff) return null;

    const padded_size = size + (size % 2);
    const chunk_end = offset + 8 + padded_size;

    if (chunk_end > declared_end) return null;

    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = bytes.slice(offset, chunk_end);

      if (fourcc === "VP8X" && size >= 1) chunk[8] &= ~0x0c;

      kept.push(chunk);
    }

    offset = chunk_end;
  }

  if (kept.length === 0) return null;

  let body_length = 0;

  for (const chunk of kept) body_length += chunk.length;

  const out = new Uint8Array(12 + body_length);

  out.set(bytes.subarray(0, 12));
  write_u32_le(out, 4, 4 + body_length);

  let write_offset = 12;

  for (const chunk of kept) {
    out.set(chunk, write_offset);
    write_offset += chunk.length;
  }

  return out;
}

function strip_lossless(
  bytes: Uint8Array,
  format: ImageFormat,
): Uint8Array | null {
  if (format === "jpeg") return strip_jpeg(bytes);
  if (format === "png") return strip_png(bytes);

  return strip_webp(bytes);
}

function to_array_buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const CANVAS_TIMEOUT_MS = 15000;

function redraw_via_canvas(blob: Blob, mime_type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      reject(new Error("no_dom"));

      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(blob);
    let settled = false;

    const finish = (error: Error | null, result?: Blob) => {
      if (settled) return;

      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      img.onload = null;
      img.onerror = null;

      if (error) reject(error);
      else resolve(result as Blob);
    };

    const timer = setTimeout(
      () => finish(new Error("image_decode_timeout")),
      CANVAS_TIMEOUT_MS,
    );

    img.onload = () => {
      const canvas = document.createElement("canvas");

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      if (canvas.width === 0 || canvas.height === 0) {
        finish(new Error("empty_image"));

        return;
      }

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        finish(new Error("no_canvas_context"));

        return;
      }

      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (result) => {
          if (!result) {
            finish(new Error("canvas_to_blob_failed"));

            return;
          }
          finish(null, result);
        },
        mime_type,
        mime_type === "image/jpeg" ? 0.95 : undefined,
      );
    };

    img.onerror = () => finish(new Error("image_load_failed"));

    img.src = url;
  });
}

export async function strip_metadata(
  data: ArrayBuffer,
  mime_type: string,
): Promise<StripResult> {
  const bytes = new Uint8Array(data);
  const format = detect_format(bytes);

  if (format) {
    try {
      const stripped = strip_lossless(bytes, format);

      if (stripped && stripped.length > 0) {
        return { data: to_array_buffer(stripped), status: "stripped" };
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }
  }

  const canvas_mime = format ? FORMAT_MIME[format] : mime_type;

  if (CANVAS_TYPES.has(canvas_mime)) {
    try {
      const blob = new Blob([data], { type: canvas_mime });
      const redrawn = await redraw_via_canvas(blob, canvas_mime);

      return { data: await redrawn.arrayBuffer(), status: "stripped" };
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }
  }

  return { data, status: format ? "failed" : "unsupported" };
}

export async function strip_image_metadata(
  data: ArrayBuffer,
  mime_type: string,
): Promise<ArrayBuffer> {
  return (await strip_metadata(data, mime_type)).data;
}

export async function strip_image_metadata_data_url(
  data_url: string,
): Promise<string> {
  const match = data_url.match(/^data:([^;,]+);base64,/);

  if (!match) return data_url;

  try {
    const base64 = data_url.split(",")[1];

    if (!base64) return data_url;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const result = await strip_metadata(to_array_buffer(bytes), match[1]);

    if (result.status !== "stripped") return data_url;

    const blob = new Blob([result.data], { type: match[1] });

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return data_url;
  }
}
