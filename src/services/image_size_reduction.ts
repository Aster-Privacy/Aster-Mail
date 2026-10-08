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
export type ImageSizeChoice = "reduce" | "original" | "cancel";

export const REDUCED_IMAGE_MAX_EDGE = 1920;
export const REDUCIBLE_IMAGE_MIN_BYTES = 512 * 1024;

const REDUCED_IMAGE_QUALITY = 0.82;
const REDUCIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ChoiceRequester = () => Promise<ImageSizeChoice>;

let active_requester: ChoiceRequester | null = null;

export function register_image_size_prompt(
  requester: ChoiceRequester | null,
): void {
  active_requester = requester;
}

export function is_reducible_image(file: File): boolean {
  return (
    REDUCIBLE_TYPES.has(file.type) && file.size >= REDUCIBLE_IMAGE_MIN_BYTES
  );
}

export function scaled_dimensions(
  width: number,
  height: number,
  max_edge: number = REDUCED_IMAGE_MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);

  if (longest <= max_edge) return { width, height };
  const scale = max_edge / longest;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encode_canvas(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, REDUCED_IMAGE_QUALITY);
  });
}

export async function reduce_image_file(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const { width, height } = scaled_dimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      bitmap.close();

      return file;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await encode_canvas(canvas, file.type);

    if (!blob || blob.type !== file.type || blob.size >= file.size) {
      return file;
    }

    return new File([blob], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

export async function prepare_image_attachments(
  files: File[],
): Promise<File[] | null> {
  const reducible = files.filter(is_reducible_image);

  if (reducible.length === 0 || !active_requester) return files;

  const choice = await active_requester();

  if (choice === "cancel") return null;
  if (choice === "original") return files;

  return Promise.all(
    files.map((file) =>
      is_reducible_image(file) ? reduce_image_file(file) : file,
    ),
  );
}
