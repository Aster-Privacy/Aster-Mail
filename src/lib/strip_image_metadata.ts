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
const STRIPPABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function redraw_via_canvas(blob: Blob, mime_type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("no_canvas_context"));

        return;
      }

      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("canvas_to_blob_failed"));

            return;
          }
          resolve(result);
        },
        mime_type,
        mime_type === "image/jpeg" ? 0.95 : undefined,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_load_failed"));
    };

    img.src = url;
  });
}

export async function strip_image_metadata(
  data: ArrayBuffer,
  mime_type: string,
): Promise<ArrayBuffer> {
  if (!STRIPPABLE_TYPES.has(mime_type)) return data;

  try {
    const blob = new Blob([data], { type: mime_type });
    const stripped = await redraw_via_canvas(blob, mime_type);

    return stripped.arrayBuffer();
  } catch {
    return data;
  }
}

export async function strip_image_metadata_data_url(
  data_url: string,
): Promise<string> {
  const match = data_url.match(/^data:(image\/[^;]+);base64,/);

  if (!match) return data_url;

  const mime_type = match[1];

  if (!STRIPPABLE_TYPES.has(mime_type)) return data_url;

  try {
    const base64 = data_url.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mime_type });
    const stripped = await redraw_via_canvas(blob, mime_type);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(stripped);
    });
  } catch {
    return data_url;
  }
}
