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
export function normalize_contact_addresses(
  addresses: (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of addresses) {
    const value = (raw || "").trim().toLowerCase();

    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

export function build_contact_mail_query(
  addresses: (string | null | undefined)[],
): string {
  return normalize_contact_addresses(addresses)
    .map((address) =>
      /\s/.test(address) ? `contact:"${address}"` : `contact:${address}`,
    )
    .join(" ");
}
