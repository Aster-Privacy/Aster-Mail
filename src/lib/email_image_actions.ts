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
import { has_tauri_runtime } from "@/lib/tauri_runtime";

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

const DATA_URL_PATTERN = /^data:([^,]*),([\s\S]*)$/i;

function normalized_type(content_type: string): string {
  return content_type.split(";")[0].trim().toLowerCase();
}

function is_data_src(src: string): boolean {
  return src.slice(0, 5).toLowerCase() === "data:";
}

function is_blob_src(src: string): boolean {
  return src.slice(0, 5).toLowerCase() === "blob:";
}

function decode_payload(payload: string): string {
  try {
    return decodeURIComponent(payload);
  } catch {
    throw new Error("image_unavailable");
  }
}

export function decode_image_data_url(src: string): Blob {
  const match = DATA_URL_PATTERN.exec(src);

  if (!match) throw new Error("image_unavailable");

  const [type, ...params] = match[1].split(";");
  const content_type = normalized_type(type);

  if (!content_type.startsWith("image/")) throw new Error("image_unavailable");

  const is_base64 = params.some(
    (param) => param.trim().toLowerCase() === "base64",
  );

  if (!is_base64) {
    return new Blob([new TextEncoder().encode(decode_payload(match[2]))], {
      type: content_type,
    });
  }

  let binary: string;

  try {
    binary = atob(decode_payload(match[2]).replace(/\s+/g, ""));
  } catch {
    throw new Error("image_unavailable");
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: content_type });
}

export async function load_viewer_image_blob(
  src: string,
  proxy_url: string = get_image_proxy_url(),
): Promise<Blob> {
  if (!is_safe_viewer_src(src, proxy_url)) throw new UnsafeImageSourceError();

  if (is_data_src(src)) return decode_image_data_url(src);

  const response = await fetch(src, {
    cache: "force-cache",
    credentials: "same-origin",
    referrerPolicy: "no-referrer",
  });

  if (!response.ok) throw new Error("image_unavailable");

  const blob = await response.blob();

  if (!normalized_type(blob.type).startsWith("image/")) {
    throw new Error("image_unavailable");
  }

  return blob;
}

export function viewer_image_filename(content_type: string): string {
  return `image.${IMAGE_EXTENSIONS[normalized_type(content_type)] ?? "png"}`;
}

function click_download(href: string, filename: string): void {
  const link = document.createElement("a");

  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function save_viewer_image(
  src: string,
  proxy_url: string = get_image_proxy_url(),
): Promise<void> {
  if (!is_safe_viewer_src(src, proxy_url)) throw new UnsafeImageSourceError();

  const blob = is_blob_src(src)
    ? await image_source_to_png(src)
    : await load_viewer_image_blob(src, proxy_url);
  const url = URL.createObjectURL(blob);

  click_download(url, viewer_image_filename(blob.type));
  setTimeout(() => URL.revokeObjectURL(url), SAVE_URL_LIFETIME_MS);
}

function load_image_element(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_unavailable"));
    image.src = src;
  });
}

function canvas_to_png(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  if (!width || !height) {
    return Promise.reject(new Error("image_unavailable"));
  }

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) return Promise.reject(new Error("canvas_unavailable"));
  context.drawImage(source, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((png) => {
      if (png) resolve(png);
      else reject(new Error("canvas_unavailable"));
    }, "image/png");
  });
}

export async function image_source_to_png(src: string): Promise<Blob> {
  const image = await load_image_element(src);

  return canvas_to_png(image, image.naturalWidth, image.naturalHeight);
}

async function bitmap_to_png(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);

  try {
    return await canvas_to_png(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

export async function image_blob_to_png(blob: Blob): Promise<Blob> {
  if (normalized_type(blob.type) === "image/png") {
    return blob.type === "image/png"
      ? blob
      : new Blob([blob], { type: "image/png" });
  }

  if (typeof createImageBitmap === "function") {
    try {
      return await bitmap_to_png(blob);
    } catch {
      return blob_url_to_png(blob);
    }
  }

  return blob_url_to_png(blob);
}

async function blob_url_to_png(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);

  try {
    return await image_source_to_png(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function viewer_image_png(
  src: string,
  proxy_url: string = get_image_proxy_url(),
): Promise<Blob> {
  if (!is_safe_viewer_src(src, proxy_url)) throw new UnsafeImageSourceError();

  if (is_blob_src(src)) return image_source_to_png(src);

  return image_blob_to_png(await load_viewer_image_blob(src, proxy_url));
}

async function write_native_clipboard(png: Blob): Promise<void> {
  const core = await import("@tauri-apps/api/core");
  const bytes = new Uint8Array(await png.arrayBuffer());

  await core.invoke("plugin:clipboard-manager|write_image", {
    image: Array.from(bytes),
  });
}

function has_web_clipboard(): boolean {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard?.write === "function"
  );
}

async function write_web_clipboard(png: Promise<Blob>): Promise<void> {
  if (!has_web_clipboard()) throw new Error("clipboard_unavailable");

  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function copy_viewer_image(
  src: string,
  proxy_url: string = get_image_proxy_url(),
): Promise<void> {
  const is_native = has_tauri_runtime();

  if (!is_native && !has_web_clipboard()) {
    throw new Error("clipboard_unavailable");
  }

  if (!is_safe_viewer_src(src, proxy_url)) throw new UnsafeImageSourceError();

  const png = viewer_image_png(src, proxy_url);

  if (!is_native) {
    await write_web_clipboard(png);

    return;
  }

  try {
    await write_native_clipboard(await png);
  } catch (native_error) {
    if (!has_web_clipboard()) throw native_error;
    await write_web_clipboard(png);
  }
}
