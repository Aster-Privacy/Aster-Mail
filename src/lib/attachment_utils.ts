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
import DOMPurify from "dompurify";

export function build_previewable_image_blob(
  data: BufferSource,
  content_type: string,
): Blob {
  if (content_type.toLowerCase() === "image/svg+xml") {
    const svg_text = new TextDecoder().decode(data);
    const safe_svg = DOMPurify.sanitize(svg_text, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });

    return new Blob([safe_svg], { type: content_type });
  }

  return new Blob([data], { type: content_type });
}

const TYPE_LABEL_MAP: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "application/vnd.ms-powerpoint": "PPT",
  "application/json": "JSON",
  "application/xml": "XML",
};

export function get_type_label(content_type: string, filename: string): string {
  if (TYPE_LABEL_MAP[content_type]) return TYPE_LABEL_MAP[content_type];
  if (content_type.startsWith("text/")) return "TXT";
  if (content_type.includes("zip") || content_type.includes("compressed"))
    return "ZIP";

  const parts = filename.split(".");

  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "FILE";
}

export function get_type_color(content_type: string): string {
  if (content_type === "application/pdf") return "#e24942";
  if (content_type.startsWith("image/")) return "#0eb09b";
  if (content_type.startsWith("video/")) return "#d64992";
  if (content_type.startsWith("audio/")) return "#0fb1cb";
  if (
    content_type.includes("spreadsheet") ||
    content_type.includes("excel") ||
    content_type === "text/csv"
  )
    return "#0ca844";
  if (
    content_type.includes("presentation") ||
    content_type.includes("powerpoint")
  )
    return "#e38f0c";
  if (content_type.includes("word") || content_type.includes("document"))
    return "#3981f6";
  if (is_archive_type(content_type)) return "#9964e5";
  if (is_code_type(content_type) || content_type.startsWith("text/"))
    return "#6d89a7";

  return "#83868c";
}

export type AttachmentGlyph =
  | "photo"
  | "video"
  | "music"
  | "table"
  | "presentation"
  | "code"
  | "archive"
  | "document"
  | "file";

function is_code_type(content_type: string): boolean {
  return (
    content_type.includes("html") ||
    content_type.includes("xml") ||
    content_type.includes("json") ||
    content_type.includes("javascript")
  );
}

function is_archive_type(content_type: string): boolean {
  return (
    content_type.includes("zip") ||
    content_type.includes("gzip") ||
    content_type.includes("compressed") ||
    content_type.includes("tar") ||
    content_type.includes("rar") ||
    content_type.includes("7z")
  );
}

export function get_type_glyph(content_type: string): AttachmentGlyph {
  if (content_type.startsWith("image/")) return "photo";
  if (content_type.startsWith("video/")) return "video";
  if (content_type.startsWith("audio/")) return "music";
  if (is_archive_type(content_type)) return "archive";
  if (
    content_type.includes("spreadsheet") ||
    content_type.includes("excel") ||
    content_type === "text/csv"
  )
    return "table";
  if (
    content_type.includes("presentation") ||
    content_type.includes("powerpoint")
  )
    return "presentation";
  if (is_code_type(content_type)) return "code";
  if (
    content_type === "application/pdf" ||
    content_type.startsWith("text/") ||
    content_type.includes("word") ||
    content_type.includes("document")
  )
    return "document";

  return "file";
}

const PREVIEWABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "image/avif",
]);

export function is_previewable_image(content_type: string): boolean {
  return PREVIEWABLE_IMAGE_TYPES.has(content_type.toLowerCase());
}

export function is_previewable_pdf(content_type: string): boolean {
  return content_type === "application/pdf";
}

export function sanitize_download_filename(filename: string): string {
  let cleaned = "";

  for (const ch of filename) {
    const code = ch.codePointAt(0) ?? 0;
    const is_control = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    const is_bidi =
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);

    if (is_control || is_bidi) continue;

    cleaned += code === 0x2f || code === 0x5c ? "_" : ch;
  }

  cleaned = cleaned.trim();

  return cleaned || "download";
}

export function truncate_filename(
  filename: string,
  max_length: number = 20,
): string {
  if (filename.length <= max_length) return filename;

  const dot_index = filename.lastIndexOf(".");

  if (dot_index === -1 || dot_index === 0) {
    return filename.slice(0, max_length - 1) + "\u2026";
  }

  const ext = filename.slice(dot_index);
  const name = filename.slice(0, dot_index);
  const available = max_length - ext.length - 1;

  if (available < 3) {
    return filename.slice(0, max_length - 1) + "\u2026";
  }

  return name.slice(0, available) + "\u2026" + ext;
}
