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
export const CANONICAL_API_ONION =
  "asterwkopxf427ndjpgco5swerhivljvwcsggsxmfgmve4awbahpcrqd.onion";

export const CANONICAL_MAIL_ONION =
  "asterabf3d5xhqtphx5u462oegteygodgae5y542vmcai22ipkd3ojqd.onion";

export const CANONICAL_WEB_ONION =
  "asterlq6kalut366uozjjm7kgle5lrr4q72noqncnrhyupatl4dc5jyd.onion";

export const LEGACY_API_ONIONS: readonly string[] = [
  "kvwjvhbeoaxmv5hece4mhcigurxv33bmnhzvdqsddtaovkxm6pqpubqd.onion",
];

export const LEGACY_MAIL_ONIONS: readonly string[] = [
  "ruljp6cylip5dzfhpz434vohwkchbswzqcithrke6tjoikj26r6n42id.onion",
];

function normalize_host(host: string): string {
  return host
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/\.+$/, "")
    .toLowerCase();
}

export function is_canonical_api_onion(host: string): boolean {
  const normalized = normalize_host(host);

  if (normalized === CANONICAL_API_ONION) return true;

  return LEGACY_API_ONIONS.includes(normalized);
}

export function is_known_onion_host(host: string): boolean {
  const normalized = normalize_host(host);

  if (normalized === CANONICAL_API_ONION) return true;
  if (normalized === CANONICAL_MAIL_ONION) return true;
  if (normalized === CANONICAL_WEB_ONION) return true;
  if (LEGACY_API_ONIONS.includes(normalized)) return true;
  if (LEGACY_MAIL_ONIONS.includes(normalized)) return true;

  return false;
}
