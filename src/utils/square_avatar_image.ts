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
export const SQUARE_AVATAR_SIZE = 512;
export const SQUARE_AVATAR_MAX_CHARS = 400_000;

const QUALITY_STEPS = [0.88, 0.8, 0.7, 0.6];
const SIZE_STEPS = [SQUARE_AVATAR_SIZE, 384, 256];
const JPEG_BACKGROUND = "#ffffff";

export interface SquareCrop {
  x: number;
  y: number;
  side: number;
}

export function square_crop(width: number, height: number): SquareCrop {
  const side = Math.max(1, Math.min(width, height));

  return {
    x: Math.max(0, Math.floor((width - side) / 2)),
    y: Math.max(0, Math.floor((height - side) / 2)),
    side,
  };
}

export function square_output_size(side: number, max_size: number): number {
  return Math.max(1, Math.min(Math.floor(side), max_size));
}

let webp_encoding_supported: boolean | null = null;

function supports_webp_encoding(): boolean {
  if (webp_encoding_supported !== null) return webp_encoding_supported;

  const probe = document.createElement("canvas");

  probe.width = 1;
  probe.height = 1;
  webp_encoding_supported = probe
    .toDataURL("image/webp")
    .startsWith("data:image/webp");

  return webp_encoding_supported;
}

function create_canvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("no_canvas_context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  return { canvas, ctx };
}

function release_canvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function draw_square(
  source: CanvasImageSource,
  crop: SquareCrop,
  size: number,
  background: string | null,
): HTMLCanvasElement {
  let current_source = source;
  let current_crop = crop;
  let intermediate: HTMLCanvasElement | null = null;

  while (current_crop.side / 2 >= size * 1.5) {
    const half = Math.round(current_crop.side / 2);
    const step = create_canvas(half);

    step.ctx.drawImage(
      current_source,
      current_crop.x,
      current_crop.y,
      current_crop.side,
      current_crop.side,
      0,
      0,
      half,
      half,
    );
    if (intermediate) release_canvas(intermediate);
    intermediate = step.canvas;
    current_source = step.canvas;
    current_crop = { x: 0, y: 0, side: half };
  }

  const output = create_canvas(size);

  if (background) {
    output.ctx.fillStyle = background;
    output.ctx.fillRect(0, 0, size, size);
  }
  output.ctx.drawImage(
    current_source,
    current_crop.x,
    current_crop.y,
    current_crop.side,
    current_crop.side,
    0,
    0,
    size,
    size,
  );
  if (intermediate) release_canvas(intermediate);

  return output.canvas;
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

export function encode_square_avatar(img: HTMLImageElement): string {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  if (!width || !height) throw new Error("image_empty");

  const crop = square_crop(width, height);
  const use_webp = supports_webp_encoding();
  const mime = use_webp ? "image/webp" : "image/jpeg";
  const background = use_webp ? null : JPEG_BACKGROUND;
  let last = "";

  for (const max_size of SIZE_STEPS) {
    const size = square_output_size(crop.side, max_size);
    const canvas = draw_square(img, crop, size, background);

    try {
      for (const quality of QUALITY_STEPS) {
        last = canvas.toDataURL(mime, quality);
        if (last.length <= SQUARE_AVATAR_MAX_CHARS) return last;
      }
    } finally {
      release_canvas(canvas);
    }
  }

  return last;
}

export async function compress_square_avatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);

  try {
    const img = await load_image(url);

    try {
      return encode_square_avatar(img);
    } finally {
      img.src = "";
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
