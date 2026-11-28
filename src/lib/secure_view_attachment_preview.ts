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
import { sanitize_download_filename } from "@/lib/attachment_utils";

export type SecurePreviewKind = "image" | "pdf" | "text" | "audio" | "video";

export interface SecurePreview {
  kind: SecurePreviewKind;
  mime: string;
}

export const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;
export const MAX_IMAGE_PREVIEW_BYTES = 40 * 1024 * 1024;
export const MAX_PDF_PREVIEW_BYTES = 60 * 1024 * 1024;
export const MAX_MEDIA_PREVIEW_BYTES = 250 * 1024 * 1024;
export const MAX_DISPLAY_FILENAME_LENGTH = 255;

const TEXT_TYPES = new Set([
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
  "text/markdown",
  "text/x-log",
  "application/json",
]);

const TEXT_EXTENSIONS = new Set(["txt", "csv", "tsv", "md", "log", "json"]);

function ascii_at(data: Uint8Array, offset: number, value: string): boolean {
  if (data.length < offset + value.length) return false;

  for (let i = 0; i < value.length; i++) {
    if (data[offset + i] !== value.charCodeAt(i)) return false;
  }

  return true;
}

function bytes_at(data: Uint8Array, offset: number, value: number[]): boolean {
  if (data.length < offset + value.length) return false;

  return value.every((byte, i) => data[offset + i] === byte);
}

function declared_family(content_type: string): string {
  return content_type.split(";")[0].trim().toLowerCase().split("/")[0] ?? "";
}

function file_extension(filename: string): string {
  const dot = filename.lastIndexOf(".");

  return dot > 0 ? filename.slice(dot + 1).trim().toLowerCase() : "";
}

function sniff_image(data: Uint8Array): string | null {
  if (bytes_at(data, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (bytes_at(data, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii_at(data, 0, "GIF87a") || ascii_at(data, 0, "GIF89a")) {
    return "image/gif";
  }
  if (ascii_at(data, 0, "RIFF") && ascii_at(data, 8, "WEBP")) {
    return "image/webp";
  }
  if (ascii_at(data, 4, "ftypavif") || ascii_at(data, 4, "ftypavis")) {
    return "image/avif";
  }
  if (bytes_at(data, 0, [0x42, 0x4d]) && data.length > 26) return "image/bmp";

  return null;
}

function sniff_pdf(data: Uint8Array): boolean {
  const limit = Math.min(data.length - 5, 1024);

  for (let i = 0; i <= limit; i++) {
    if (ascii_at(data, i, "%PDF-")) return true;
  }

  return false;
}

function sniff_media(
  data: Uint8Array,
  family: string,
): { kind: "audio" | "video"; mime: string } | null {
  const wants_video = family === "video";

  if (ascii_at(data, 0, "ID3")) return { kind: "audio", mime: "audio/mpeg" };
  if (
    family === "audio" &&
    data.length > 2 &&
    data[0] === 0xff &&
    (data[1] & 0xe0) === 0xe0
  ) {
    return { kind: "audio", mime: "audio/mpeg" };
  }
  if (ascii_at(data, 0, "RIFF") && ascii_at(data, 8, "WAVE")) {
    return { kind: "audio", mime: "audio/wav" };
  }
  if (ascii_at(data, 0, "fLaC")) return { kind: "audio", mime: "audio/flac" };
  if (ascii_at(data, 0, "OggS")) {
    return wants_video
      ? { kind: "video", mime: "video/ogg" }
      : { kind: "audio", mime: "audio/ogg" };
  }
  if (bytes_at(data, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return family === "audio"
      ? { kind: "audio", mime: "audio/webm" }
      : { kind: "video", mime: "video/webm" };
  }
  if (ascii_at(data, 4, "ftyp")) {
    const brand = String.fromCharCode(...Array.from(data.subarray(8, 12)));

    if (brand.startsWith("avi") || brand.startsWith("hei")) return null;
    if (brand === "M4A " || brand === "M4B ") {
      return { kind: "audio", mime: "audio/mp4" };
    }
    if (brand.startsWith("qt")) return { kind: "video", mime: "video/mp4" };

    return family === "audio"
      ? { kind: "audio", mime: "audio/mp4" }
      : { kind: "video", mime: "video/mp4" };
  }

  return null;
}

function looks_like_text(data: Uint8Array): boolean {
  const sample = data.subarray(0, Math.min(data.length, MAX_TEXT_PREVIEW_BYTES));

  if (sample.includes(0)) return false;

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample, {
      stream: sample.length < data.length,
    });

    return true;
  } catch {
    return false;
  }
}

export function detect_secure_preview(
  data: Uint8Array,
  content_type: string,
  filename: string,
): SecurePreview | null {
  if (!data || data.length === 0) return null;

  const declared = (content_type || "").split(";")[0].trim().toLowerCase();
  const family = declared_family(declared);
  const image_mime = sniff_image(data);

  if (image_mime) {
    return data.length <= MAX_IMAGE_PREVIEW_BYTES
      ? { kind: "image", mime: image_mime }
      : null;
  }

  if (sniff_pdf(data)) {
    return data.length <= MAX_PDF_PREVIEW_BYTES
      ? { kind: "pdf", mime: "application/pdf" }
      : null;
  }

  const media = sniff_media(data, family);

  if (media) {
    return data.length <= MAX_MEDIA_PREVIEW_BYTES ? media : null;
  }

  const textual =
    TEXT_TYPES.has(declared) ||
    (TEXT_EXTENSIONS.has(file_extension(filename)) &&
      (family === "" ||
        family === "text" ||
        declared === "application/octet-stream"));

  if (textual && looks_like_text(data)) {
    return { kind: "text", mime: "text/plain" };
  }

  return null;
}

export function read_text_preview(data: Uint8Array): {
  text: string;
  truncated: boolean;
} {
  const truncated = data.length > MAX_TEXT_PREVIEW_BYTES;
  const slice = truncated ? data.subarray(0, MAX_TEXT_PREVIEW_BYTES) : data;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);

  return { text: text.replace(/^﻿/, ""), truncated };
}

export function display_attachment_name(filename: string): string {
  const cleaned = sanitize_download_filename(
    typeof filename === "string" ? filename : "",
  );

  if (cleaned.length <= MAX_DISPLAY_FILENAME_LENGTH) return cleaned;

  return cleaned.slice(0, MAX_DISPLAY_FILENAME_LENGTH);
}

export function create_preview_url(data: Uint8Array, mime: string): string {
  return URL.createObjectURL(new Blob([data], { type: mime }));
}

export function download_secure_attachment(
  data: Uint8Array,
  filename: string,
  track_url: (url: string) => void,
): void {
  const url = URL.createObjectURL(
    new Blob([data], { type: "application/octet-stream" }),
  );
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = sanitize_download_filename(filename);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  track_url(url);
}
