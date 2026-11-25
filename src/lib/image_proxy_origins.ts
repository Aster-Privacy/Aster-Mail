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
import { get_image_proxy_url } from "@/lib/image_proxy";
import { get_api_base_url } from "@/services/api/base_url";
import { connection_store } from "@/services/routing/connection_store";
import { trim_end_index } from "@/lib/linear_trim";

export const NATIVE_APP_ORIGIN = "https://app.astermail.org";

function read_origin(value: string, base?: string): string | null {
  try {
    const parsed = new URL(value, base);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function page_href(): string | undefined {
  try {
    return typeof window !== "undefined" && window.location?.href
      ? window.location.href
      : undefined;
  } catch {
    return undefined;
  }
}

function read_configured_origin(
  read: () => string,
  base: string | undefined,
): string | null {
  try {
    return read_origin(read(), base);
  } catch {
    return null;
  }
}

function is_slash(code: number): boolean {
  return code === 47;
}

function add_onion_origins(origins: Set<string>): void {
  let onion: string | null = null;

  try {
    onion = connection_store.get_api_onion_url();
  } catch {
    return;
  }

  if (!onion) return;

  const bare = onion.replace(/^https?:\/\//i, "");
  const host = bare.slice(0, trim_end_index(bare, is_slash));

  if (!host) return;

  for (const scheme of ["http://", "https://"]) {
    const origin = read_origin(`${scheme}${host}`);

    if (origin) origins.add(origin);
  }
}

export function get_trusted_image_proxy_origins(): Set<string> {
  const origins = new Set<string>([NATIVE_APP_ORIGIN]);
  const href = page_href();

  if (href) {
    const page_origin = read_origin(href);

    if (page_origin) origins.add(page_origin);
  }

  for (const read of [get_image_proxy_url, get_api_base_url]) {
    const origin = read_configured_origin(read, href);

    if (origin) origins.add(origin);
  }

  add_onion_origins(origins);

  return origins;
}
