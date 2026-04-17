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
import { Capacitor } from "@capacitor/core";

const NATIVE_BASE = "https://app.astermail.org/api/images/v1/favicon";
const WEB_BASE = "/api/images/v1/favicon";
const EMPTY_FAVICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";
const DOMAIN_PATTERN =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function is_valid_favicon_domain(domain: string): boolean {
  if (!domain || domain.length > 253) {
    return false;
  }

  return DOMAIN_PATTERN.test(domain);
}

export function get_favicon_url(domain: string): string {
  const trimmed = (domain ?? "").trim().toLowerCase();

  if (!is_valid_favicon_domain(trimmed)) {
    return EMPTY_FAVICON;
  }

  const is_native =
    Capacitor.isNativePlatform() ||
    (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window);
  const base = is_native ? NATIVE_BASE : WEB_BASE;

  return `${base}/${encodeURIComponent(trimmed)}`;
}
