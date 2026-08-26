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
export interface SelectionSnapshotSource {
  id: string;
  is_selected?: boolean;
  grouped_email_ids?: string[];
  folders?: { folder_token: string }[];
  tags?: { id: string }[];
}

export interface SelectionSnapshot {
  ids: string[];
  grouped_ids: string[];
  folder_tokens: string[];
  tag_tokens: string[];
}

export const empty_selection_snapshot: SelectionSnapshot = {
  ids: [],
  grouped_ids: [],
  folder_tokens: [],
  tag_tokens: [],
};

function intersect_tokens(
  current: Set<string> | null,
  next: Set<string>,
): Set<string> {
  if (current === null) return next;

  const merged = new Set<string>();

  for (const token of current) {
    if (next.has(token)) merged.add(token);
  }

  return merged;
}

export function build_selection_snapshot(
  emails: readonly SelectionSnapshotSource[],
): SelectionSnapshot {
  const ids: string[] = [];
  const grouped_ids: string[] = [];

  let folder_tokens: Set<string> | null = null;
  let tag_tokens: Set<string> | null = null;

  for (const email of emails) {
    if (!email.is_selected) continue;

    ids.push(email.id);

    if (email.grouped_email_ids && email.grouped_email_ids.length > 1) {
      for (const grouped_id of email.grouped_email_ids) {
        grouped_ids.push(grouped_id);
      }
    } else {
      grouped_ids.push(email.id);
    }

    const email_folders = new Set(
      (email.folders ?? []).map((folder) => folder.folder_token),
    );
    const email_tags = new Set((email.tags ?? []).map((tag) => tag.id));

    folder_tokens = intersect_tokens(folder_tokens, email_folders);
    tag_tokens = intersect_tokens(tag_tokens, email_tags);
  }

  if (ids.length === 0) return empty_selection_snapshot;

  return {
    ids,
    grouped_ids,
    folder_tokens: Array.from(folder_tokens ?? []),
    tag_tokens: Array.from(tag_tokens ?? []),
  };
}
