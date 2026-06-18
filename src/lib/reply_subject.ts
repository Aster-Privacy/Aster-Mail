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

function escape_regex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function strip_reply_prefix(
  subject: string | null | undefined,
  reply_prefix: string,
): string {
  const trimmed = (subject ?? "").trim();
  const localized = reply_prefix.trim();
  const localized_pattern = localized ? `${escape_regex(localized)}|` : "";
  const strip_re = new RegExp(`^(?:(?:${localized_pattern}re:)\\s*)+`, "i");

  return trimmed.replace(strip_re, "").trim();
}

export function build_reply_subject(
  original_subject: string | null | undefined,
  reply_prefix: string,
): string {
  const base = strip_reply_prefix(original_subject, reply_prefix);

  if (!base) return "";

  return `${reply_prefix.trim()} ${base}`;
}
