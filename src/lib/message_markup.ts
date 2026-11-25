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
import {
  ascii_lower,
  html_to_readable_plain_text,
  is_ascii_word_code,
  is_html_content,
  strip_html_tags,
  strip_html_tags_bounded,
} from "./html_text";

const MEDIA_TAG_RE = /<(?:svg|video|canvas|picture|hr)\b/i;
const PIXEL_SIZE_RE = /\b(?:width|height)\s*=\s*["']?[01]["']?(?=[\s/>])/i;

export function collect_image_tags(html: string): string[] {
  const tags: string[] = [];
  const lower = ascii_lower(html);
  let start = lower.indexOf("<img");

  while (start !== -1) {
    const name_end = start + 4;

    if (
      name_end < html.length &&
      is_ascii_word_code(html.charCodeAt(name_end))
    ) {
      start = lower.indexOf("<img", start + 1);
      continue;
    }

    const close = html.indexOf(">", name_end);

    if (close === -1) break;

    tags.push(html.slice(start, close + 1));
    start = lower.indexOf("<img", close + 1);
  }

  return tags;
}

function has_visible_image(html: string): boolean {
  const images = collect_image_tags(html);

  if (images.length === 0) return false;

  return images.some((tag) => !PIXEL_SIZE_RE.test(tag));
}

export function html_has_renderable_content(html: string | undefined): boolean {
  if (!html || typeof html !== "string") return false;
  if (MEDIA_TAG_RE.test(html) || has_visible_image(html)) return true;

  return strip_html_tags_bounded(html, 1).length > 0;
}

export function renderable_html_part(
  html_content: string | undefined,
  body: string | undefined,
): string | undefined {
  if (!html_content) return html_content;
  if (!body || !body.trim() || body === html_content) return html_content;
  if (html_has_renderable_content(html_content)) return html_content;

  const body_has_content = is_html_content(body)
    ? html_has_renderable_content(body)
    : true;

  return body_has_content ? undefined : html_content;
}

export function readable_text_with_fallback(
  html: string,
  text_part?: string,
): string {
  const readable = html_to_readable_plain_text(html, { keep_link_urls: true });

  if (readable) return readable;

  const stripped = strip_html_tags(html);

  if (stripped) return stripped;
  if (text_part && text_part.trim() && !is_html_content(text_part)) {
    return text_part;
  }

  return "";
}
