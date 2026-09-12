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

export type AliasDirection = "all" | "received" | "sent";

export const ALIAS_DIRECTIONS: AliasDirection[] = ["all", "received", "sent"];

export const DEFAULT_ALIAS_DIRECTION: AliasDirection = "all";

const ALIAS_VIEW_PREFIX = "alias-";

const DIRECTION_SEPARATOR = "|";

export function build_alias_view(
  address: string,
  direction: AliasDirection = DEFAULT_ALIAS_DIRECTION,
): string {
  if (direction === DEFAULT_ALIAS_DIRECTION) {
    return `${ALIAS_VIEW_PREFIX}${address}`;
  }

  return `${ALIAS_VIEW_PREFIX}${address}${DIRECTION_SEPARATOR}${direction}`;
}

export function is_alias_view(view: string): boolean {
  return view.startsWith(ALIAS_VIEW_PREFIX);
}

export function parse_alias_view(
  view: string,
): { address: string; direction: AliasDirection } | null {
  if (!is_alias_view(view)) return null;

  const body = view.slice(ALIAS_VIEW_PREFIX.length);
  const separator_index = body.lastIndexOf(DIRECTION_SEPARATOR);

  if (separator_index === -1) {
    return { address: body, direction: DEFAULT_ALIAS_DIRECTION };
  }

  const suffix = body.slice(separator_index + 1);
  const direction = ALIAS_DIRECTIONS.find((candidate) => candidate === suffix);

  if (!direction) {
    return { address: body, direction: DEFAULT_ALIAS_DIRECTION };
  }

  return { address: body.slice(0, separator_index), direction };
}

export function alias_address_of(view: string): string | null {
  return parse_alias_view(view)?.address ?? null;
}

export function alias_direction_of(view: string): AliasDirection {
  return parse_alias_view(view)?.direction ?? DEFAULT_ALIAS_DIRECTION;
}

export function parse_alias_direction(
  value: string | null | undefined,
): AliasDirection {
  return (
    ALIAS_DIRECTIONS.find((candidate) => candidate === value) ??
    DEFAULT_ALIAS_DIRECTION
  );
}
