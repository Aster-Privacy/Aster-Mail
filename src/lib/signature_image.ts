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
export const SIGNATURE_CONTENT_LIMIT_BYTES = 65536;
export const SIGNATURE_IMAGE_MAX_DIMENSION = 600;
export const MAX_SIGNATURE_SOURCE_IMAGE_SIZE = 20 * 1024 * 1024;

const AES_GCM_TAG_BYTES = 16;
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
const SCALE_STEPS = [1, 0.75, 0.5, 0.35];
const ENCODE_TYPES = ["image/webp", "image/jpeg"] as const;

export type SignatureImageType = (typeof ENCODE_TYPES)[number];

export type SignatureImageEncoder = (
  width: number,
  height: number,
  type: SignatureImageType,
  quality: number,
) => Promise<string | null> | string | null;

export type SignatureImageResult =
  | { ok: true; data_url: string }
  | { ok: false; reason: "too_large" | "failed" };

export function utf8_length(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function encrypted_signature_size(content: string): number {
  return utf8_length(content) + AES_GCM_TAG_BYTES;
}

export function signature_content_fits(content: string): boolean {
  return encrypted_signature_size(content) <= SIGNATURE_CONTENT_LIMIT_BYTES;
}

export function signature_image_html(src: string): string {
  return `<img src="${src}" style="max-width: min(100%, 480px); height: auto; border-radius: 6px; display: block; margin: 8px 0;" />`;
}

export function signature_image_budget(current_html: string): number {
  return Math.max(
    0,
    SIGNATURE_CONTENT_LIMIT_BYTES -
      encrypted_signature_size(current_html) -
      utf8_length(signature_image_html("")),
  );
}

export function fit_signature_dimensions(
  width: number,
  height: number,
  max_dimension: number = SIGNATURE_IMAGE_MAX_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);

  if (longest <= max_dimension) return { width, height };

  const ratio = max_dimension / longest;

  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export async function choose_signature_encoding(
  encode: SignatureImageEncoder,
  width: number,
  height: number,
  budget: number,
): Promise<string | null> {
  for (const scale of SCALE_STEPS) {
    const scaled_width = Math.max(1, Math.round(width * scale));
    const scaled_height = Math.max(1, Math.round(height * scale));

    for (const type of ENCODE_TYPES) {
      for (const quality of QUALITY_STEPS) {
        const data_url = await encode(
          scaled_width,
          scaled_height,
          type,
          quality,
        );

        if (!data_url) break;
        if (data_url.length <= budget) return data_url;
      }
    }
  }

  return null;
}

function read_as_data_url(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function load_image(data_url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode_failed"));
    image.src = data_url;
  });
}

function canvas_encoder(image: HTMLImageElement): SignatureImageEncoder {
  return (width, height, type, quality) => {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) return null;
    if (type === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    const data_url = canvas.toDataURL(type, quality);

    return data_url.startsWith(`data:${type}`) ? data_url : null;
  };
}

export async function prepare_signature_image(
  file: File,
  budget: number,
): Promise<SignatureImageResult> {
  if (file.size > MAX_SIGNATURE_SOURCE_IMAGE_SIZE) {
    return { ok: false, reason: "too_large" };
  }

  let original: string;
  let image: HTMLImageElement;

  try {
    original = await read_as_data_url(file);
    image = await load_image(original);
  } catch {
    return { ok: false, reason: "failed" };
  }

  const source_width = image.naturalWidth || image.width;
  const source_height = image.naturalHeight || image.height;

  if (!source_width || !source_height) return { ok: false, reason: "failed" };

  const within_dimensions =
    Math.max(source_width, source_height) <= SIGNATURE_IMAGE_MAX_DIMENSION;

  if (within_dimensions && original.length <= budget) {
    return { ok: true, data_url: original };
  }

  const { width, height } = fit_signature_dimensions(
    source_width,
    source_height,
  );
  const data_url = await choose_signature_encoding(
    canvas_encoder(image),
    width,
    height,
    budget,
  );

  return data_url ? { ok: true, data_url } : { ok: false, reason: "too_large" };
}
