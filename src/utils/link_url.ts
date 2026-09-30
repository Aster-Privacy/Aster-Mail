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
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;
const ALLOWED_PROTOCOLS = ["http:", "https:", "mailto:"];

function parse_allowed(candidate: string): URL | null {
  try {
    const parsed = new URL(candidate);

    return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalize_link_url(raw: string): string | null {
  const value = raw.trim();

  if (!value) return null;

  if (SCHEME_PREFIX.test(value)) {
    return parse_allowed(value) ? value : null;
  }

  if (value.includes("@") && !value.includes("/") && !value.includes(" ")) {
    return parse_allowed(`mailto:${value}`) ? `mailto:${value}` : null;
  }

  return parse_allowed(`https://${value}`) ? `https://${value}` : null;
}
