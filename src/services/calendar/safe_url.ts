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
const ALLOWED_PROTOCOLS = ["http:", "https:"];
const MAX_URL_LENGTH = 2048;

export function safe_http_url(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    return null;
  }

  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);

    return ALLOWED_PROTOCOLS.includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function safe_http_url_from_input(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "";
  }

  return (
    safe_http_url(trimmed) ??
    safe_http_url(`https://${trimmed.replace(/^\/+/, "")}`) ??
    ""
  );
}
