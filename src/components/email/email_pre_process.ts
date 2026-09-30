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
import type { use_i18n } from "@/lib/i18n/context";

import {
  collapse_empty_block_runs,
  collapse_forwarded_content,
  collapse_quoted_replies,
} from "./sandboxed_email_renderer/dom_cleanup";

import { ignore_error } from "@/lib/ignore_error";

type translate_fn = ReturnType<typeof use_i18n>["t"];

export interface PreProcessOptions {
  forwarded_label: string;
  show_trimmed_label: string;
  preserve_formatting: boolean;
  load_remote_content: boolean;
  proxy_base: string;
}

function unblock_remote_content(doc: Document): void {
  doc.querySelectorAll("img[data-blocked='true']").forEach((el) => {
    const src =
      el.getAttribute("data-proxy-src") || el.getAttribute("data-original-src");

    if (src) {
      try {
        const safe_url = new URL(src, window.location.href);

        if (safe_url.protocol === "https:" || safe_url.protocol === "http:") {
          el.setAttribute("src", safe_url.href);
        }
      } catch (caught) {
        ignore_error(
          "components/email/email_pre_process:unblock_remote_content",
          caught,
        );
      }
    }
    el.removeAttribute("data-blocked");
    el.classList.remove("blocked-remote-image");
    const alt = el.getAttribute("alt");

    if (alt === "[Click to load image]") {
      el.setAttribute("alt", "");
    }
  });

  doc.querySelectorAll("img[alt='[Click to load image]']").forEach((el) => {
    el.setAttribute("alt", "");
  });
}

function unblock_blocked_placeholders(doc: Document, proxy_base: string): void {
  doc
    .querySelectorAll("span.blocked-image[data-original-src]")
    .forEach((span) => {
      const original_src = span.getAttribute("data-original-src") || "";
      const img = doc.createElement("img");

      img.setAttribute(
        "src",
        `${proxy_base}?url=${encodeURIComponent(original_src)}`,
      );

      const w = span.getAttribute("data-width");
      const h = span.getAttribute("data-height");
      const s = span.getAttribute("data-style");

      if (w) img.setAttribute("width", w);
      if (h) img.setAttribute("height", h);
      if (s) img.setAttribute("style", s);

      span.parentNode?.replaceChild(img, span);
    });
}

export function pre_process_email_html(
  body_html: string,
  options: PreProcessOptions,
): string {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${body_html}</body></html>`,
    "text/html",
  );

  if (options.load_remote_content) {
    unblock_remote_content(doc);
    unblock_blocked_placeholders(doc, options.proxy_base);
  }

  const t = ((key: string) =>
    key === "common.forwarded_message"
      ? options.forwarded_label
      : options.show_trimmed_label) as unknown as translate_fn;

  collapse_forwarded_content(doc, t);
  collapse_quoted_replies(doc, t);
  if (!options.preserve_formatting) {
    collapse_empty_block_runs(doc);
  }

  return doc.body ? doc.body.innerHTML : body_html;
}
