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
const TRUSTED_LINK_DOMAINS = [
  "astermail.org",
  "aster.cx",
  "realiased.me",
  "astermail.me",
  "astermail.net",
] as const;

export function is_trusted_link(url: string): boolean {
  let host: string;

  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : undefined;
    const parsed = base ? new URL(url, base) : new URL(url);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    return false;
  }

  return TRUSTED_LINK_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
