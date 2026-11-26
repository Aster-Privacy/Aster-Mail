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
export const PLACEHOLDER_PIXEL_DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function starts_with(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;

  return prefix.every((value, index) => bytes[index] === value);
}

function ascii_prefix(bytes: Uint8Array, text: string): boolean {
  return starts_with(
    bytes,
    Array.from(text, (char) => char.charCodeAt(0)),
  );
}

function read_be_u32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

export function image_dimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (
    bytes.length >= 10 &&
    (ascii_prefix(bytes, "GIF87a") || ascii_prefix(bytes, "GIF89a"))
  ) {
    return {
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
    };
  }

  if (
    bytes.length >= 24 &&
    starts_with(bytes, PNG_SIGNATURE) &&
    ascii_prefix(bytes.subarray(12), "IHDR")
  ) {
    return { width: read_be_u32(bytes, 16), height: read_be_u32(bytes, 20) };
  }

  return null;
}

export function is_placeholder_pixel(bytes: Uint8Array): boolean {
  const dimensions = image_dimensions(bytes);

  return (
    dimensions !== null && dimensions.width <= 1 && dimensions.height <= 1
  );
}

export function is_known_placeholder_pixel(bytes: Uint8Array): boolean {
  const known = atob(PLACEHOLDER_PIXEL_DATA_URL.split(",")[1]);

  if (bytes.length !== known.length) return false;

  for (let index = 0; index < known.length; index += 1) {
    if (bytes[index] !== known.charCodeAt(index)) return false;
  }

  return true;
}

const DATA_IMAGE_PATTERN =
  /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]*)$/i;

function decode_base64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

export function data_image_payload(src: string): string | null {
  const match = DATA_IMAGE_PATTERN.exec(src.trim());

  return match ? match[1].replace(/\s+/g, "") : null;
}

export function data_image_byte_length(src: string): number | null {
  const payload = data_image_payload(src);

  if (payload === null) return null;

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;

  return Math.max(Math.floor((payload.length * 3) / 4) - padding, 0);
}

export function is_placeholder_pixel_src(src: string): boolean {
  if (src.trim() === PLACEHOLDER_PIXEL_DATA_URL) return true;

  const payload = data_image_payload(src);

  if (payload === null) return false;

  const head = decode_base64(payload.slice(0, 32));

  return head !== null && is_placeholder_pixel(head);
}
