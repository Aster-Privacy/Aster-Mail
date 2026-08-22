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
import { is_transparent_color_value } from "./html_sanitizer_css";
import { looks_format_flowed, unflow_format_flowed } from "./format_flowed";
import { repair_comment_markup } from "./html_sanitizer_utils";

export function is_html_content(content: string): boolean {
  if (!content || typeof content !== "string") {
    return false;
  }

  const html_patterns = [
    /<[a-z][\s\S]*>/i,
    /<\/[a-z]+>/i,
    /<br\s*\/?>/i,
    /&[a-z]+;/i,
    /&#\d+;/i,
  ];

  return html_patterns.some((pattern) => pattern.test(content));
}

const QUOTE_CONTAINER_START_RE =
  /<(?:div|blockquote)[^>]*(?:class=["'][^"']*(?:aster_quote|gmail_quote|yahoo_quoted|protonmail_quote|moz-cite-prefix)[^"']*["']|type=["']cite["'])/i;

export function strip_quoted_sections(content: string): string {
  const idx = content.search(QUOTE_CONTAINER_START_RE);

  if (idx < 0) return content;
  const own_content = content.slice(0, idx);

  return strip_html_tags(own_content).trim() ? own_content : content;
}

function has_designed_background_style(content: string): boolean {
  const declarations = content.match(
    /style\s*=\s*["'][^"']*background(?:-color)?\s*:\s*[^;"']+/gi,
  );

  if (!declarations) return false;

  return declarations.some((declaration) => {
    const value_match = declaration.match(
      /background(?:-color)?\s*:\s*([^;"']+)$/i,
    );
    const value = value_match ? value_match[1].trim() : "";

    return value.length > 0 && !is_transparent_color_value(value);
  });
}

export function has_rich_html(content: string): boolean {
  if (!content || typeof content !== "string") return false;

  const stripped = strip_quoted_sections(
    content
      .replace(/<span[^>]*>Secured by\s*<a[^>]*>Aster Mail<\/a><\/span>/gi, "")
      .replace(
        /<a[^>]*href=["']https?:\/\/astermail\.org["'][^>]*>Aster Mail<\/a>/gi,
        "",
      ),
  );

  if (/<(table|td|th|tr)\b/i.test(stripped)) return true;
  if (/<style[\s>]/i.test(stripped)) return true;
  if (has_designed_background_style(stripped)) return true;
  if (/style\s*=\s*["'][^"']*\bwidth\s*:/i.test(stripped)) return true;
  if (/<img\b[^>]*src\s*=/i.test(stripped)) return true;
  if (/<(center|font)\b/i.test(stripped)) return true;

  return false;
}

export function plain_text_to_html(text: string): string {
  if (!text) return "";

  const url_regex = /(https?:\/\/[^\s<>"'{}|\\^`[\]]+)/g;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const reflowed = looks_format_flowed(normalized)
    ? unflow_format_flowed(normalized)
    : normalized;
  const paragraphs = reflowed.split(/\n\n+/);

  return paragraphs
    .map((para) => {
      let escaped = para
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      escaped = escaped.replace(url_regex, (url) => {
        const href_url = url.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        return `<a href="${href_url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
      });

      escaped = escaped.replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .join("\n");
}

export interface ReadablePlainTextOptions {
  keep_link_urls?: boolean;
}

function append_link_urls(doc: Document) {
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );
  const labelled = new Set<string>();

  anchors.forEach((el) => {
    const href = (el.getAttribute("href") ?? "").trim();

    if (href && (el.textContent ?? "").trim()) labelled.add(href);
  });

  let previous_href = "";

  anchors.forEach((el) => {
    const href = (el.getAttribute("href") ?? "").trim();

    if (!/^https?:\/\//i.test(href)) return;

    const label = (el.textContent ?? "").replace(/\s+/g, "");

    if (!label && labelled.has(href)) return;
    if (href === previous_href) return;

    previous_href = href;

    if (label.includes(href)) return;

    el.append(doc.createTextNode(` ${href} `));
  });
}

export function html_to_readable_plain_text(
  html: string,
  options: ReadablePlainTextOptions = {},
): string {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return strip_html_tags(html);

  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(
      repair_comment_markup(html),
      "text/html",
    );
  } catch {
    return strip_html_tags(html);
  }

  doc
    .querySelectorAll("script, style, head, noscript, template, iframe, object, embed")
    .forEach((el) => el.remove());

  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const s = el.getAttribute("style") ?? "";
    if (
      /display\s*:\s*none/i.test(s) ||
      /visibility\s*:\s*hidden/i.test(s) ||
      /max-height\s*:\s*0(?![.0-9])/i.test(s) ||
      /font-size\s*:\s*0(?![.0-9])/i.test(s) ||
      /opacity\s*:\s*0(?![.0-9])/i.test(s)
    ) {
      el.remove();
    }
  });

  if (options.keep_link_urls) append_link_urls(doc);

  doc.querySelectorAll("br").forEach((el) => el.replaceWith(doc.createTextNode("\n")));

  doc
    .querySelectorAll("p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, li, blockquote")
    .forEach((el) => {
      el.prepend(doc.createTextNode("\n"));
      el.append(doc.createTextNode("\n"));
    });

  doc.querySelectorAll("td, th").forEach((el) => el.append(doc.createTextNode(" ")));
  doc.querySelectorAll("tr").forEach((el) => el.append(doc.createTextNode("\n")));

  doc
    .querySelectorAll("img[width='1'], img[height='1'], img[width='0'], img[height='0']")
    .forEach((el) => el.remove());

  const text = doc.body?.textContent ?? "";

  return text
    .replace(/ /g, " ")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BOUNDED_STRIP_STEPS = [16384, 65536, 262144];

const BOUNDED_STRIP_MARGIN = 64;

function last_tag_boundary(html: string, limit: number): number {
  let boundary = -1;
  let quote = "";
  let in_tag = false;

  for (let index = 0; index < limit; index += 1) {
    const char = html[index];

    if (!in_tag) {
      if (char === "<") {
        in_tag = true;
        quote = "";
      }

      continue;
    }

    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      in_tag = false;
      boundary = index + 1;
    }
  }

  return boundary;
}

export function strip_html_tags_bounded(
  html: string,
  min_chars: number,
): string {
  if (!html || typeof html !== "string") return "";
  if (html.length <= BOUNDED_STRIP_STEPS[0]) return strip_html_tags(html);

  for (const step of BOUNDED_STRIP_STEPS) {
    if (step * 2 >= html.length) break;

    const boundary = last_tag_boundary(html, step);

    if (boundary <= 0) continue;

    const text = strip_html_tags(html.slice(0, boundary));

    if (text.length >= min_chars + BOUNDED_STRIP_MARGIN) return text;
  }

  return strip_html_tags(html);
}

export function strip_html_tags(html: string): string {
  if (!html || typeof html !== "string") return "";

  if (typeof DOMParser === "undefined") return "";

  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(
      repair_comment_markup(html),
      "text/html",
    );
  } catch {
    return "";
  }

  doc
    .querySelectorAll("script, style, head, noscript, template, iframe, object, embed")
    .forEach((el) => el.remove());

  doc.querySelectorAll("br").forEach((el) => {
    el.replaceWith(doc.createTextNode(" "));
  });

  doc.querySelectorAll("p, div, li, td, tr, h1, h2, h3, h4, h5, h6").forEach((el) => {
    el.append(doc.createTextNode(" "));
  });

  const text = doc.body?.textContent || "";

  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
