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
import type { InboxEmailTag } from "@/types/email";

export type MembershipStatus = "all" | "some" | "none";

export interface MembershipRow {
  id: string;
  tags?: { id: string }[];
  folders?: { folder_token: string }[];
}

function status_for(
  rows: MembershipRow[],
  selected_ids: ReadonlySet<string>,
  has_member: (row: MembershipRow) => boolean,
): MembershipStatus {
  const selected = rows.filter((row) => selected_ids.has(row.id));

  if (selected.length === 0) return "none";

  const count = selected.filter(has_member).length;

  if (count === 0) return "none";
  if (count === selected.length) return "all";

  return "some";
}

export function selection_tag_status(
  rows: MembershipRow[],
  selected_ids: ReadonlySet<string>,
  tag_token: string,
): MembershipStatus {
  return status_for(rows, selected_ids, (row) =>
    (row.tags ?? []).some((tag) => tag.id === tag_token),
  );
}

export function selection_folder_status(
  rows: MembershipRow[],
  selected_ids: ReadonlySet<string>,
  folder_token: string,
): MembershipStatus {
  return status_for(rows, selected_ids, (row) =>
    (row.folders ?? []).some((folder) => folder.folder_token === folder_token),
  );
}

export function tags_from_tokens(
  tokens: string[] | undefined,
  lookup: ReadonlyMap<string, { name: string; color?: string; icon?: string }>,
): InboxEmailTag[] {
  return (tokens ?? []).map((token) => {
    const tag = lookup.get(token);

    return {
      id: token,
      name: tag?.name ?? "",
      color: tag?.color,
      icon: tag?.icon,
    };
  });
}
