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
export const CONTACT_AVATAR_MAX_PX = 512;
export const CONTACT_AVATAR_QUALITY = 0.85;
export const CONTACT_AVATAR_MAX_BYTES = 180 * 1024;
export const CONTACT_AVATAR_MAX_SOURCE_CHARS = 16 * 1024 * 1024;

const QUALITY_STEPS = [CONTACT_AVATAR_QUALITY, 0.7, 0.55, 0.4];
const FALLBACK_MAX_PX = 256;
const INLINE_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;

export function is_inline_image_data_url(value: string | undefined): boolean {
  return Boolean(value && INLINE_IMAGE_PATTERN.test(value));
}

export function data_url_byte_size(value: string): number {
  const comma = value.indexOf(",");
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;

  return Math.floor((payload.length * 3) / 4) - padding;
}

export function scaled_dimensions(
  width: number,
  height: number,
  max_px: number = CONTACT_AVATAR_MAX_PX,
): { width: number; height: number } {
  if (width <= max_px && height <= max_px) return { width, height };
  const ratio = Math.min(max_px / width, max_px / height);

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function load_image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function encode_image(
  img: HTMLImageElement,
  max_px: number,
  quality: number,
): string {
  const { width, height } = scaled_dimensions(
    img.naturalWidth || img.width,
    img.naturalHeight || img.height,
    max_px,
  );
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("no_canvas_context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const result = canvas.toDataURL("image/jpeg", quality);

  canvas.width = 0;
  canvas.height = 0;

  return result;
}

function encode_within_limit(img: HTMLImageElement, max_px: number): string {
  for (const size of [max_px, Math.min(max_px, FALLBACK_MAX_PX)]) {
    for (const quality of QUALITY_STEPS) {
      const result = encode_image(img, size, quality);

      if (data_url_byte_size(result) <= CONTACT_AVATAR_MAX_BYTES) return result;
    }
  }
  throw new Error("avatar_too_large");
}

export async function compress_contact_avatar_source(
  src: string,
  max_px: number = CONTACT_AVATAR_MAX_PX,
): Promise<string> {
  const img = await load_image(src);

  try {
    return encode_within_limit(img, max_px);
  } finally {
    img.src = "";
  }
}

export async function compress_contact_avatar_file(
  file: File,
): Promise<string> {
  const url = URL.createObjectURL(file);

  try {
    return await compress_contact_avatar_source(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepare_imported_avatar(
  value: string | undefined,
): Promise<string | undefined> {
  if (!value || !is_inline_image_data_url(value)) return undefined;
  if (value.length > CONTACT_AVATAR_MAX_SOURCE_CHARS) return undefined;

  try {
    const img = await load_image(value);

    try {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const fits =
        width <= CONTACT_AVATAR_MAX_PX &&
        height <= CONTACT_AVATAR_MAX_PX &&
        data_url_byte_size(value) <= CONTACT_AVATAR_MAX_BYTES;

      return fits ? value : encode_within_limit(img, CONTACT_AVATAR_MAX_PX);
    } finally {
      img.src = "";
    }
  } catch {
    return undefined;
  }
}
