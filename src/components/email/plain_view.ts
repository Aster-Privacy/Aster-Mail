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
import type { DecryptedThreadMessage } from "@/types/thread";

import {
  guard_body_step,
  readable_fallback_html,
} from "./message_body_fallback";

import { is_html_content, plain_text_to_html } from "@/lib/html_sanitizer";
import { renderable_html_part } from "@/lib/message_markup";
import { strip_reply_quotes } from "@/lib/strip_reply_quotes";
import { parse_ratchet_envelope } from "@/services/crypto/ratchet_types";

type PlainViewFields = Pick<
  DecryptedThreadMessage,
  "body" | "html_content" | "text_part"
>;

const HTML_MARKUP_RE =
  /<\/?(?:html|head|body|div|p|br|table|tr|td|span|font|img|style|center|a|h[1-6]|ul|ol|li|blockquote|hr|pre)[\s/>]/i;

const MIME_HEADER_RE = /^content-type\s*:/im;

const INTERNAL_MARKER = "\x00ASTER_";

function is_internal_body(text: string): boolean {
  return (
    text.startsWith(INTERNAL_MARKER) || parse_ratchet_envelope(text) !== null
  );
}

export function sender_text_alternative(
  html: string | undefined,
  text: string | undefined,
): string | undefined {
  if (!html || typeof html !== "string") return undefined;
  if (typeof text !== "string" || text === html || !text.trim()) {
    return undefined;
  }
  if (
    text.includes(INTERNAL_MARKER) ||
    is_internal_body(text) ||
    text.includes("-----BEGIN PGP MESSAGE-----") ||
    MIME_HEADER_RE.test(text) ||
    HTML_MARKUP_RE.test(text)
  ) {
    return undefined;
  }

  return text;
}

export function message_text_alternative(
  message: PlainViewFields,
): string | undefined {
  return sender_text_alternative(
    message.html_content,
    message.text_part ?? message.body,
  );
}

export function message_has_html_view(message: PlainViewFields): boolean {
  const source =
    renderable_html_part(message.html_content, message.body) || message.body;

  if (!source || is_internal_body(source)) return false;
  if (message.body && is_internal_body(message.body)) return false;

  return is_html_content(source);
}

export function resolve_plain_view(options: {
  has_html: boolean;
  has_text_alternative: boolean;
  prefer_plain_text: boolean;
  override: boolean | undefined;
}): boolean {
  if (!options.has_html) return false;
  if (options.override !== undefined) return options.override;

  return options.prefer_plain_text && options.has_text_alternative;
}

export function plain_view_html(
  clean_body: string,
  message: PlainViewFields,
): string {
  const text = message_text_alternative(message);

  if (text) {
    return guard_body_step(
      "components/email/plain_view:text_part",
      () => plain_text_to_html(strip_reply_quotes(text)),
      () => readable_fallback_html(clean_body, message.body),
    );
  }

  return readable_fallback_html(clean_body, message.body);
}

export function message_plain_view_state(
  message: PlainViewFields,
  prefer_plain_text: boolean,
  override: boolean | undefined,
): { available: boolean; active: boolean } {
  const available = message_has_html_view(message);

  return {
    available,
    active: resolve_plain_view({
      has_html: available,
      has_text_alternative: message_text_alternative(message) !== undefined,
      prefer_plain_text,
      override,
    }),
  };
}
