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

const FULL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function is_full_address(value: string): boolean {
  return FULL_ADDRESS_REGEX.test(value.trim());
}

export function address_list_includes(field: string, address: string): boolean {
  const target = address.trim().toLowerCase();

  return field
    .toLowerCase()
    .split(/[\s<>]+/)
    .some((candidate) => candidate === target);
}

export function build_sender_mail_query(
  address: string | null | undefined,
): string {
  const value = (address || "").replace(/"/g, "").trim().toLowerCase();

  if (!value) return "";

  return /\s/.test(value) ? `from:"${value}"` : `from:${value}`;
}
