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
  if (content_type === "application/pdf") return "#ea4335";
  if (content_type.startsWith("image/")) return "#a855f7";
  if (content_type.startsWith("video/")) return "#ec4899";
  if (content_type.startsWith("audio/")) return "#0ea5e9";
  if (
    content_type.includes("spreadsheet") ||
    content_type.includes("excel") ||
    content_type === "text/csv"
  )
    return "#34a853";
  if (
    content_type.includes("presentation") ||
    content_type.includes("powerpoint")
  )
    return "#f97316";
  if (content_type.includes("word") || content_type.includes("document"))
    return "#4285f4";

  return "#6b7280";
}

export function is_previewable_image(content_type: string): boolean {
  return (
    content_type === "image/jpeg" ||
    content_type === "image/png" ||
    content_type === "image/gif" ||
    content_type === "image/webp" ||
    content_type === "image/bmp"
  );
}

export function is_previewable_pdf(content_type: string): boolean {
  return content_type === "application/pdf";
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
