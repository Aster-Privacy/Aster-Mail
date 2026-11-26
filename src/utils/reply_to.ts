//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { split_outside_quotes, strip_edge_runs } from "@/lib/address_scans";
import { is_js_whitespace } from "@/lib/linear_trim";
import { EMAIL_REGEX } from "@/lib/utils";
import { decode_header_for_display } from "@/services/import/mime_utils";

export interface ParsedAddress {
  name?: string;
  email: string;
}

function is_leading_wrap(code: number): boolean {
  return code === 0x3c || code === 0x22 || is_js_whitespace(code);
}

function is_trailing_wrap(code: number): boolean {
  return code === 0x3e || code === 0x22 || is_js_whitespace(code);
}

export function parse_address(value: string): ParsedAddress | undefined {
  const trimmed = value.trim();

  if (!trimmed) return undefined;

  const angle_match = trimmed.match(/^(.*?)<\s*([^<>\s]+)\s*>\s*$/);

  if (angle_match) {
    const raw_name = angle_match[1]
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();
    const email = angle_match[2].trim();

    if (!EMAIL_REGEX.test(email)) return undefined;

    return { name: raw_name || undefined, email };
  }

  const bare = strip_edge_runs(trimmed, is_leading_wrap, is_trailing_wrap);

  if (!EMAIL_REGEX.test(bare)) return undefined;

  return { email: bare };
}

export function reply_to_header_value(
  raw_headers?: { name: string; value: string }[],
): string | undefined {
  if (!raw_headers || raw_headers.length === 0) return undefined;
  const values = raw_headers
    .filter((h) => h.name.toLowerCase() === "reply-to")
    .map((h) => h.value)
    .filter((value) => value.trim() !== "");

  return values.length > 0 ? values.join(", ") : undefined;
}

export function extract_reply_to(
  raw_headers?: { name: string; value: string }[],
): ParsedAddress | undefined {
  if (!raw_headers || raw_headers.length === 0) return undefined;
  const header = raw_headers.find((h) => h.name.toLowerCase() === "reply-to");

  if (!header) return undefined;
  const first = split_outside_quotes(header.value)[0];
  const parsed = parse_address(first);

  if (!parsed?.name) return parsed;
  const name = decode_header_for_display(parsed.name).trim();

  return { ...parsed, name: name || undefined };
}
