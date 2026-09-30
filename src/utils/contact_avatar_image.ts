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
export const CONTACT_AVATAR_MAX_DATA_URL_CHARS = 200_000;

const INLINE_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;

export function is_inline_image_data_url(value: string | undefined): boolean {
  return Boolean(value && INLINE_IMAGE_PATTERN.test(value));
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

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

export async function compress_contact_avatar_source(
  src: string,
  max_px: number = CONTACT_AVATAR_MAX_PX,
): Promise<string> {
  const img = await load_image(src);
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

  return canvas.toDataURL("image/jpeg", CONTACT_AVATAR_QUALITY);
}

export async function compress_contact_avatar_file(file: File): Promise<string> {
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
  if (value.length <= CONTACT_AVATAR_MAX_DATA_URL_CHARS) return value;

  try {
    return await compress_contact_avatar_source(value);
  } catch {
    return undefined;
  }
}
