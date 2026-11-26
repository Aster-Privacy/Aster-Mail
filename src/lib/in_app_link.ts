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
import { strip_account_prefix } from "@/lib/account_index_url";

const IN_APP_ROUTES = ["/join/family"];
const IN_APP_ROUTE_PREFIXES = ["/family/claim/"];

export function in_app_route_for(
  url: string,
  app_origins: readonly string[],
): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!app_origins.includes(parsed.origin)) return null;

  const path = strip_account_prefix(parsed.pathname);
  const matches =
    IN_APP_ROUTES.includes(path) ||
    IN_APP_ROUTE_PREFIXES.some(
      (prefix) => path.startsWith(prefix) && path.length > prefix.length,
    );

  if (!matches) return null;

  return `${path}${parsed.search}${parsed.hash}`;
}
