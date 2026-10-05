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
import { degraded_text_html, plain_text_to_html } from "@/lib/html_sanitizer";
import { is_html_content } from "@/lib/html_text";
import { readable_text_with_fallback } from "@/lib/message_markup";
import { ignore_error } from "@/lib/ignore_error";

export function guard_body_step<T>(
  context: string,
  compute: () => T,
  fallback: () => T,
): T {
  try {
    return compute();
  } catch (caught) {
    ignore_error(context, caught);

    return fallback();
  }
}

function decode_basic_entities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function readable_fallback_text(
  html: string | undefined,
  text_part?: string,
): string {
  const source = typeof html === "string" ? html : "";

  if (source) {
    const readable = guard_body_step(
      "components/email/message_body_fallback:readable",
      () => readable_text_with_fallback(source, text_part),
      () => "",
    );

    if (readable) return readable;

    const degraded = decode_basic_entities(degraded_text_html(source));

    if (degraded) return degraded;
  }

  if (typeof text_part === "string" && text_part.trim()) {
    return is_html_content(text_part)
      ? decode_basic_entities(degraded_text_html(text_part))
      : text_part;
  }

  return "";
}

export function readable_fallback_html(
  html: string | undefined,
  text_part?: string,
): string {
  const text = readable_fallback_text(html, text_part);

  if (!text) return "";

  return guard_body_step(
    "components/email/message_body_fallback:to_html",
    () => plain_text_to_html(text),
    () => degraded_text_html(text),
  );
}
