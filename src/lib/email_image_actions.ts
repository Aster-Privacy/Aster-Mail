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
import { is_safe_viewer_src } from "@/lib/email_image_viewer";
import { get_image_proxy_url } from "@/lib/image_proxy";

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/apng": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/heic": "heic",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

const SAVE_URL_LIFETIME_MS = 1000;

export class UnsafeImageSourceError extends Error {
  constructor() {
    super("unsafe_image_source");
  }
}

export async function load_viewer_image_blob(
  src: string,
  proxy_url: string = get_image_proxy_url(),
): Promise<Blob> {
  if (!is_safe_viewer_src(src, proxy_url)) throw new UnsafeImageSourceError();

  const response = await fetch(src, {
    cache: "force-cache",
    credentials: "same-origin",
    referrerPolicy: "no-referrer",
  });

  if (!response.ok) throw new Error("image_unavailable");

  const blob = await response.blob();
  const type = blob.type.split(";")[0].trim().toLowerCase();

  if (!type.startsWith("image/")) throw new Error("image_unavailable");

  return blob;
}

export function viewer_image_filename(content_type: string): string {
  const type = content_type.split(";")[0].trim().toLowerCase();

  return `image.${IMAGE_EXTENSIONS[type] ?? "png"}`;
}

export async function save_viewer_image(
  src: string,
  proxy_url: string = get_image_proxy_url(),
): Promise<void> {
  const blob = await load_viewer_image_blob(src, proxy_url);

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = viewer_image_filename(blob.type);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), SAVE_URL_LIFETIME_MS);
}

async function to_png(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");

  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((png) => {
      if (png) resolve(png);
      else reject(new Error("canvas_unavailable"));
    }, "image/png");
  });
}

export async function copy_viewer_image(
  src: string,
  proxy_url: string = get_image_proxy_url(),
): Promise<void> {
  if (
    typeof ClipboardItem === "undefined" ||
    typeof navigator.clipboard?.write !== "function"
  ) {
    throw new Error("clipboard_unavailable");
  }

  if (!is_safe_viewer_src(src, proxy_url)) throw new UnsafeImageSourceError();

  const png = load_viewer_image_blob(src, proxy_url).then(to_png);

  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
