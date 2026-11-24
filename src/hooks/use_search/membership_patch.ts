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
import type { SearchResultItem } from "./types";

export interface MembershipPatch {
  tag_tokens?: string[];
  add_tag_tokens?: string[];
  remove_tag_tokens?: string[];
  folders?: { folder_token: string; name: string }[];
  remove_folder_tokens?: string[];
}

function same_tokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const wanted = new Set(a);

  return b.every((token) => wanted.has(token));
}

function next_tag_tokens(
  current: string[],
  patch: MembershipPatch,
): string[] | null {
  const has_delta =
    (patch.add_tag_tokens?.length ?? 0) > 0 ||
    (patch.remove_tag_tokens?.length ?? 0) > 0;

  if (patch.tag_tokens === undefined && !has_delta) return null;

  const removed = new Set(patch.remove_tag_tokens ?? []);
  const base = (patch.tag_tokens ?? current).filter(
    (token) => !removed.has(token),
  );

  for (const token of patch.add_tag_tokens ?? []) {
    if (!base.includes(token)) base.push(token);
  }

  return same_tokens(current, base) ? null : base;
}

function next_folders(
  current: { folder_token: string; name: string }[],
  patch: MembershipPatch,
): { folder_token: string; name: string }[] | null {
  const removed = new Set(patch.remove_folder_tokens ?? []);

  if (patch.folders === undefined && removed.size === 0) return null;

  const next = (patch.folders ?? current)
    .filter((folder) => !removed.has(folder.folder_token))
    .map((folder) => ({
      folder_token: folder.folder_token,
      name: folder.name,
    }));

  return same_tokens(
    current.map((folder) => folder.folder_token),
    next.map((folder) => folder.folder_token),
  )
    ? null
    : next;
}

export function patch_results_membership(
  results: SearchResultItem[],
  ids: string[],
  patch: MembershipPatch,
): SearchResultItem[] | null {
  if (ids.length === 0) return null;

  const touched = new Set(ids);
  let changed = false;

  const next = results.map((result) => {
    const members = result.grouped_email_ids?.length
      ? result.grouped_email_ids
      : [result.id];

    if (!members.some((id) => touched.has(id))) return result;

    const tag_tokens = next_tag_tokens(result.tag_tokens ?? [], patch);
    const folders = next_folders(result.folders ?? [], patch);

    if (tag_tokens === null && folders === null) return result;
    changed = true;

    return {
      ...result,
      ...(tag_tokens !== null ? { tag_tokens } : {}),
      ...(folders !== null ? { folders } : {}),
    };
  });

  return changed ? next : null;
}
