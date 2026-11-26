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
import { trim_end_while } from "@/lib/linear_trim";
import { public_web_url } from "@/lib/public_origin";

const TRUSTED_LINK_DOMAINS = [
  "astermail.org",
  "aster.cx",
  "realiased.me",
  "astermail.me",
  "astermail.net",
] as const;

const DOT_CODE = 0x2e;

function is_dot(code: number): boolean {
  return code === DOT_CODE;
}

export function is_trusted_link(url: string): boolean {
  let host: string;

  try {
    const parsed = new URL(public_web_url(url));

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    host = trim_end_while(parsed.hostname.toLowerCase(), is_dot);
  } catch {
    return false;
  }

  return TRUSTED_LINK_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
