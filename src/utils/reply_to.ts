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
import { EMAIL_REGEX } from "@/lib/utils";

export interface ParsedAddress {
  name?: string;
  email: string;
}

export function parse_address(value: string): ParsedAddress | undefined {
  const trimmed = value.trim();

  if (!trimmed) return undefined;

  const angle_match = trimmed.match(/^(.*?)<\s*([^<>\s]+)\s*>\s*$/);

  if (angle_match) {
    const raw_name = angle_match[1].trim().replace(/^"(.*)"$/, "$1").trim();
    const email = angle_match[2].trim();

    if (!EMAIL_REGEX.test(email)) return undefined;

    return { name: raw_name || undefined, email };
  }

  const bare = trimmed.replace(/^[<\s"]+|[>\s"]+$/g, "");

  if (!EMAIL_REGEX.test(bare)) return undefined;

  return { email: bare };
}

export function extract_reply_to(
  raw_headers?: { name: string; value: string }[],
): ParsedAddress | undefined {
  if (!raw_headers || raw_headers.length === 0) return undefined;
  const header = raw_headers.find(
    (h) => h.name.toLowerCase() === "reply-to",
  );

  if (!header) return undefined;
  const first = header.value.split(",")[0];

  return parse_address(first);
}
