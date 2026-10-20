/*
 * Aster Mail
 * Copyright (C) 2026 Aster Privacy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export function normalize_address_ignoring_dots(address: string): string {
  const lowered = address.toLowerCase().trim();
  const at = lowered.lastIndexOf("@");

  if (at === -1) return lowered.replace(/\./g, "");

  return lowered.slice(0, at).replace(/\./g, "") + lowered.slice(at);
}

export function same_address_ignoring_dots(
  left: string,
  right: string,
): boolean {
  if (!left || !right) return false;

  return (
    normalize_address_ignoring_dots(left) ===
    normalize_address_ignoring_dots(right)
  );
}

const DOT_INSENSITIVE_DOMAINS = new Set(["astermail.org", "aster.cx"]);

export function identity_addresses_for(address: string): string[] {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf("@");

  if (at <= 0) return trimmed ? [trimmed] : [];

  const local_part = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();

  if (!local_part.includes(".") || !DOT_INSENSITIVE_DOMAINS.has(domain)) {
    return [trimmed];
  }

  const dotless = local_part.replace(/\./g, "");

  if (!dotless) return [trimmed];

  return [trimmed, `${dotless}@${trimmed.slice(at + 1)}`];
}
