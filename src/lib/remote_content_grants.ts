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
export type RemoteContentGrants = ReadonlyMap<string, Set<string>>;

export const NO_REMOTE_CONTENT_GRANTS: RemoteContentGrants = new Map();

const NO_GRANTED_TYPES: Set<string> = new Set();

export function grant_remote_content(
  grants: RemoteContentGrants,
  message_id: string,
  types: readonly string[],
): RemoteContentGrants {
  if (!message_id || types.length === 0) return grants;

  const current = grants.get(message_id);

  if (current && types.every((type) => current.has(type))) return grants;

  const next = new Map(grants);

  next.set(message_id, new Set([...(current ?? []), ...types]));

  return next;
}

export function granted_content_types(
  grants: RemoteContentGrants | undefined,
  message_id: string,
): Set<string> {
  return grants?.get(message_id) ?? NO_GRANTED_TYPES;
}

const IMAGE_GRANT_TYPES: ReadonlySet<string> = new Set([
  "image",
  "tracking_pixel",
]);

export function honored_content_types(
  types: Set<string> | undefined,
  image_grant_allowed: boolean,
): Set<string> {
  if (!types || types.size === 0) return NO_GRANTED_TYPES;
  if (image_grant_allowed) return types;

  const honored = new Set<string>();

  for (const type of types) {
    if (!IMAGE_GRANT_TYPES.has(type)) honored.add(type);
  }

  return honored.size === 0 ? NO_GRANTED_TYPES : honored;
}

export function has_remote_content_grant(
  grants: RemoteContentGrants | undefined,
  message_id: string,
): boolean {
  return granted_content_types(grants, message_id).size > 0;
}
