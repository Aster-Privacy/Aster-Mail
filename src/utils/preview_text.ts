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
import { strip_html_tags } from "@/lib/html_sanitizer";

export const PREVIEW_SOURCE_CHAR_CAP = 600;

export const ELLIPSIS = "…";

export const PREHEADER_HTML_SCAN_CAP = 65536;

export const PREHEADER_PARSE_CAP = 8192;

const PREHEADER_MIN_CHARS = 4;

const FILLER_CHARS = /[\u200b\u200c\u200d\u2060\ufeff\u034f\u00ad\u00a0]/g;

const HIDDEN_STYLE_PATTERNS = [
  /display\s*:\s*none/i,
  /visibility\s*:\s*hidden/i,
  /mso-hide\s*:\s*all/i,
  /opacity\s*:\s*0(?!\.[1-9]|[1-9])/i,
  /font-size\s*:\s*0(?!\.[1-9]|[1-9])/i,
  /line-height\s*:\s*0(?!\.[1-9]|[1-9])/i,
  /max-height\s*:\s*0(?!\.[1-9]|[1-9])/i,
  /max-width\s*:\s*0(?!\.[1-9]|[1-9])/i,
  /(?:^|[;{\s])height\s*:\s*0(?!\.[1-9]|[1-9])/i,
];

const HIDDEN_CLASS_PATTERN =
  /(^|[\s_-])(preheader|preview[-_]?text)([\s_-]|$)/i;

export function strip_preview_filler(value: string): string {
  if (!value) return "";

  return value.replace(FILLER_CHARS, "").replace(/\s+/g, " ").trim();
}

function is_hidden_element(element: Element): boolean {
  if (element.hasAttribute("hidden")) return true;

  const class_name = element.getAttribute("class") ?? "";

  if (HIDDEN_CLASS_PATTERN.test(class_name)) return true;

  const style = element.getAttribute("style") ?? "";

  if (!style) return false;

  return HIDDEN_STYLE_PATTERNS.some((pattern) => pattern.test(style));
}

function first_hidden_text(node: Element): string {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      if (strip_preview_filler(child.textContent ?? "")) return "";

      continue;
    }

    if (child.nodeType !== 1) continue;

    const element = child as Element;
    const text = strip_preview_filler(element.textContent ?? "");

    if (!text) continue;

    if (is_hidden_element(element)) return text;

    return first_hidden_text(element);
  }

  return "";
}

export function extract_preheader_text(html: string): string {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return "";

  const cleaned = html
    .slice(0, PREHEADER_HTML_SCAN_CAP)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .slice(0, PREHEADER_PARSE_CAP);

  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(cleaned, "text/html");
  } catch {
    return "";
  }

  doc
    .querySelectorAll("script, style, head, noscript, template")
    .forEach((element) => element.remove());

  if (!doc.body) return "";

  const text = first_hidden_text(doc.body);

  if (text.length < PREHEADER_MIN_CHARS) return "";
  if (!/[\p{L}\p{N}]/u.test(text)) return "";

  return text;
}

export function build_body_preview(
  body_text: string,
  body_html: string,
): string {
  const preheader = extract_preheader_text(body_html);

  if (preheader) return build_list_preview(preheader);

  return build_list_preview(strip_html_tags(body_text || body_html));
}

export function truncate_with_ellipsis(value: string, cap: number): string {
  if (!value) return "";

  const normalized = strip_preview_filler(value);

  if (cap <= 0) return "";
  if (normalized.length <= cap) return normalized;

  const clipped = normalized.slice(0, cap);
  const last_space = clipped.lastIndexOf(" ");
  const cut = last_space > cap * 0.6 ? clipped.slice(0, last_space) : clipped;

  return cut.trimEnd() + ELLIPSIS;
}

export function build_list_preview(value: string): string {
  return truncate_with_ellipsis(value, PREVIEW_SOURCE_CHAR_CAP);
}
