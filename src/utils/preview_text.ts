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
import { strip_html_tags_bounded } from "@/lib/html_sanitizer";

export const PREVIEW_SOURCE_CHAR_CAP = 600;

export const ELLIPSIS = "…";

export const PREHEADER_HTML_SCAN_CAP = 65536;

const PREHEADER_MIN_CHARS = 4;

const PREHEADER_MAX_CHARS = 600;

const FILLER_CHARS =
  /[\u200b\u200c\u200d\u2060\u2066-\u2069\ufeff\u034f\u00ad\u00a0\u180e\u3164\ufff9-\ufffc]/g;

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

const CSS_RULE_PATTERN = /([^{}]+)\{([^{}]*)\}/g;

const STYLE_BLOCK_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

type hidden_selectors = {
  classes: Set<string>;
  ids: Set<string>;
};

export function strip_preview_filler(value: string): string {
  if (!value) return "";

  return value.replace(FILLER_CHARS, "").replace(/\s+/g, " ").trim();
}

function drop_at_rule_groups(css: string): string {
  let result = "";
  let index = 0;

  while (index < css.length) {
    const at = css.indexOf("@", index);

    if (at === -1) {
      result += css.slice(index);
      break;
    }

    const open = css.indexOf("{", at);

    if (open === -1) {
      result += css.slice(index, at);
      break;
    }

    result += css.slice(index, at);

    let depth = 0;
    let cursor = open;

    for (; cursor < css.length; cursor += 1) {
      if (css[cursor] === "{") depth += 1;
      else if (css[cursor] === "}") {
        depth -= 1;

        if (depth === 0) break;
      }
    }

    index = cursor === css.length ? css.length : cursor + 1;
  }

  return result;
}

function collect_hidden_selectors(html: string): hidden_selectors {
  const classes = new Set<string>();
  const ids = new Set<string>();

  for (const block of html.matchAll(STYLE_BLOCK_PATTERN)) {
    const css = drop_at_rule_groups(block[1] ?? "");

    for (const rule of css.matchAll(CSS_RULE_PATTERN)) {
      const declarations = rule[2] ?? "";

      if (!HIDDEN_STYLE_PATTERNS.some((pattern) => pattern.test(declarations))) {
        continue;
      }

      for (const selector of (rule[1] ?? "").split(",")) {
        const target = selector.trim().split(/[\s>+~]+/).pop() ?? "";

        for (const match of target.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
          classes.add(match[1].toLowerCase());
        }

        for (const match of target.matchAll(/#([A-Za-z0-9_-]+)/g)) {
          ids.add(match[1].toLowerCase());
        }
      }
    }
  }

  return { classes, ids };
}

function is_hidden_element(
  element: Element,
  selectors: hidden_selectors,
): boolean {
  if (element.hasAttribute("hidden")) return true;

  const class_name = element.getAttribute("class") ?? "";
  const id = element.getAttribute("id") ?? "";

  if (HIDDEN_CLASS_PATTERN.test(class_name)) return true;
  if (HIDDEN_CLASS_PATTERN.test(id)) return true;

  if (selectors.classes.size) {
    for (const token of class_name.split(/\s+/)) {
      if (token && selectors.classes.has(token.toLowerCase())) return true;
    }
  }

  if (id && selectors.ids.has(id.toLowerCase())) return true;

  const style = element.getAttribute("style") ?? "";

  if (!style) return false;

  return HIDDEN_STYLE_PATTERNS.some((pattern) => pattern.test(style));
}

function collect_leading_hidden_text(
  node: Element,
  selectors: hidden_selectors,
  parts: string[],
): boolean {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) {
      if (strip_preview_filler(child.textContent ?? "")) return true;

      continue;
    }

    if (child.nodeType !== 1) continue;

    const element = child as Element;
    const text = strip_preview_filler(element.textContent ?? "");

    if (!text) continue;

    if (is_hidden_element(element, selectors)) {
      parts.push(text);

      if (parts.join(" ").length >= PREHEADER_MAX_CHARS) return true;

      continue;
    }

    if (collect_leading_hidden_text(element, selectors, parts)) return true;
  }

  return false;
}

export function extract_preheader_text(html: string): string {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return "";

  const scanned = html.slice(0, PREHEADER_HTML_SCAN_CAP);
  const selectors = collect_hidden_selectors(scanned);
  const cleaned = scanned
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

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

  const parts: string[] = [];

  collect_leading_hidden_text(doc.body, selectors, parts);

  const text = strip_preview_filler(parts.join(" "));

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

  return build_list_preview(
    strip_html_tags_bounded(body_text || body_html, PREVIEW_SOURCE_CHAR_CAP),
  );
}

const PREVIEW_MEMO_LIMIT = 4000;

const preview_memo = new Map<string, string>();

export function build_body_preview_cached(
  cache_key: string,
  body_text: string,
  body_html: string,
): string {
  if (!cache_key) return build_body_preview(body_text, body_html);

  const cached = preview_memo.get(cache_key);

  if (cached !== undefined) return cached;

  const preview = build_body_preview(body_text, body_html);

  if (preview_memo.size >= PREVIEW_MEMO_LIMIT) {
    const oldest = preview_memo.keys().next();

    if (!oldest.done) preview_memo.delete(oldest.value);
  }

  preview_memo.set(cache_key, preview);

  return preview;
}

export function clear_preview_memo(): void {
  preview_memo.clear();
}

export function truncate_with_ellipsis(value: string, cap: number): string {
  if (!value) return "";

  const normalized = strip_preview_filler(value);

  if (cap <= 0) return "";
  if (normalized.length <= cap) return normalized;

  const raw_clipped = normalized.slice(0, cap);
  const last_code = raw_clipped.charCodeAt(raw_clipped.length - 1);
  const clipped =
    last_code >= 0xd800 && last_code <= 0xdbff
      ? raw_clipped.slice(0, -1)
      : raw_clipped;
  const last_space = clipped.lastIndexOf(" ");
  const cut = last_space > cap * 0.6 ? clipped.slice(0, last_space) : clipped;

  return cut.trimEnd() + ELLIPSIS;
}

export function build_list_preview(value: string): string {
  return truncate_with_ellipsis(value, PREVIEW_SOURCE_CHAR_CAP);
}
