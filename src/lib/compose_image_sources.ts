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
import type { SanitizeOptions } from "@/lib/html_sanitizer";

import { get_image_proxy_url } from "@/lib/image_proxy";
import { is_any_lockdown_active } from "@/services/lockdown_store";

const PROXY_PATH_SUFFIX = "/api/images/v1/proxy";
const IMG_SRC_PATTERN = /(<img\b[^>]*?\ssrc=")([^"]*)(")/gi;
const PARSE_BASE = "https://compose.invalid/";

export function get_compose_sanitize_options(): SanitizeOptions {
  const lockdown_mode = is_any_lockdown_active();

  return {
    external_content_mode: lockdown_mode ? "never" : "always",
    lockdown_mode,
    image_proxy_url: get_image_proxy_url(),
  };
}

function decode_attribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function encode_attribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function get_original_image_source(src: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(src, PARSE_BASE);
  } catch {
    return null;
  }

  if (!parsed.pathname.endsWith(PROXY_PATH_SUFFIX)) return null;

  const original = parsed.searchParams.get("url");

  if (!original || !/^https?:\/\//i.test(original)) return null;

  return original;
}

export function restore_compose_image_sources(html: string): string {
  if (!html || !html.includes(PROXY_PATH_SUFFIX)) return html;

  return html.replace(
    IMG_SRC_PATTERN,
    (match: string, prefix: string, raw_src: string, suffix: string) => {
      const original = get_original_image_source(decode_attribute(raw_src));

      if (original === null) return match;

      return `${prefix}${encode_attribute(original)}${suffix}`;
    },
  );
}
