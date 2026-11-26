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
  MAX_INLINE_IMAGES,
  MAX_INLINE_IMAGE_SIZE,
  MAX_TOTAL_INLINE_SIZE,
} from "@/components/compose/compose_shared_core";
import { extract_cid_references, resolve_cid_references } from "@/lib/cid_resolver";
import {
  PLACEHOLDER_PIXEL_DATA_URL,
  data_image_byte_length,
  is_placeholder_pixel_src,
} from "@/lib/placeholder_pixel";

const IMG_TAG_PATTERN = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const EMBEDDABLE_DATA_IMAGE =
  /^data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;
const PLACEHOLDER_CSS_URLS = ["", '"', "'", "&quot;"].map(
  (quote) => `url(${quote}${PLACEHOLDER_PIXEL_DATA_URL}${quote})`,
);

const QUOTE_SCOPE_SELECTOR = "blockquote, .aster_quote";

function image_src(tag: string): string | null {
  const template = document.createElement("template");

  template.innerHTML = tag;

  const image = template.content.querySelector("img");

  if (!image) return null;

  return (image.getAttribute("src") ?? "").trim();
}

export function is_embeddable_quoted_image(src: string): boolean {
  return EMBEDDABLE_DATA_IMAGE.test(src.trim());
}

export function cap_quoted_images(
  html: string,
  enforce_budget = true,
): string {
  let count = 0;
  let total = 0;

  const capped = html.replace(IMG_TAG_PATTERN, (tag) => {
    const src = image_src(tag);

    if (src === null) return tag;

    const lower = src.toLowerCase();

    if (lower.startsWith("cid:")) return "";

    if (enforce_budget && lower.startsWith("blob:")) return "";

    if (!lower.startsWith("data:")) return tag;

    if (!is_embeddable_quoted_image(src) || is_placeholder_pixel_src(src)) {
      return "";
    }

    const size = data_image_byte_length(src) ?? 0;

    if (size === 0) return "";

    if (!enforce_budget) return tag;

    if (
      size > MAX_INLINE_IMAGE_SIZE ||
      total + size > MAX_TOTAL_INLINE_SIZE ||
      count >= MAX_INLINE_IMAGES
    ) {
      return "";
    }

    count += 1;
    total += size;

    return tag;
  });

  return PLACEHOLDER_CSS_URLS.reduce(
    (result, placeholder) => result.split(placeholder).join("none"),
    capped,
  );
}

export function cap_scoped_quote_images(html: string): string {
  if (!/<img\b/i.test(html) && !html.includes(PLACEHOLDER_PIXEL_DATA_URL)) {
    return html;
  }

  const template = document.createElement("template");

  template.innerHTML = html;

  let changed = false;

  template.content.querySelectorAll(QUOTE_SCOPE_SELECTOR).forEach((scope) => {
    if (scope.parentElement?.closest(QUOTE_SCOPE_SELECTOR)) return;

    const before = scope.innerHTML;
    const after = cap_quoted_images(before, false);

    if (after === before) return;

    scope.innerHTML = after;
    changed = true;
  });

  return changed ? template.innerHTML : html;
}

export async function embed_quoted_cid_images(
  html: string,
  source_mail_item_id: string | undefined,
  enforce_budget = true,
  quotes_only = false,
): Promise<string> {
  if (!html) return html;

  const cap = (value: string): string =>
    quotes_only
      ? cap_scoped_quote_images(value)
      : cap_quoted_images(value, enforce_budget);

  if (!source_mail_item_id || extract_cid_references(html).length === 0) {
    return cap(html);
  }

  try {
    const result = await resolve_cid_references(
      html,
      source_mail_item_id,
      "data",
    );

    return cap(result.html);
  } catch {
    return cap(html);
  }
}

export const QUOTE_IMAGE_WAIT_MS = 10_000;

export function settle_within<T>(
  promise: Promise<T>,
  timeout_ms: number,
): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeout_ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
