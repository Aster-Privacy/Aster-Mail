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
import type { InboxEmail } from "@/types/email";
import type { RestoredEmailEntry } from "@/hooks/email_list_helpers";

import { collect_restore_entries } from "@/hooks/email_list_helpers";
import {
  forget_removed_ids,
  hold_removed_ids,
  note_removed_ids,
  release_removed_ids,
} from "@/services/removed_items";

export const REMOVAL_SETTLE_MS = 2_000;

export interface ListRemovalTarget {
  remove_emails: (ids: string[]) => void;
  restore_emails: (entries: RestoredEmailEntry[]) => void;
}

export interface ListRemoval {
  ids: string[];
  settle: (failed_ids: Iterable<string>) => string[];
  undo: () => void;
  redo: () => void;
}

export function begin_list_removal(
  rows: InboxEmail[],
  ids: string[],
  target: ListRemovalTarget,
): ListRemoval {
  const unique_ids = Array.from(new Set(ids.filter(Boolean)));
  const entries = collect_restore_entries(rows, unique_ids);
  let committed: string[] = [];
  let settled = false;

  hold_removed_ids(unique_ids);
  if (unique_ids.length > 0) target.remove_emails(unique_ids);

  const entries_for = (
    subset: Set<string>,
    absent: Set<string> = new Set(),
  ): RestoredEmailEntry[] =>
    entries
      .filter((entry) => subset.has(entry.email.id))
      .map((entry) => ({
        email: entry.email,
        index:
          entry.index -
          entries.filter(
            (other) => absent.has(other.email.id) && other.index < entry.index,
          ).length,
      }));

  return {
    ids: unique_ids,
    settle: (failed_ids) => {
      if (settled) return committed;
      settled = true;

      const failed = new Set(failed_ids);

      committed = unique_ids.filter((id) => !failed.has(id));
      release_removed_ids(committed);

      const reverted = unique_ids.filter((id) => failed.has(id));

      if (reverted.length > 0) {
        forget_removed_ids(reverted);
        target.restore_emails(
          entries_for(new Set(reverted), new Set(committed)),
        );
      }

      return committed;
    },
    undo: () => {
      if (committed.length === 0) return;
      forget_removed_ids(committed);
      target.restore_emails(entries_for(new Set(committed)));
    },
    redo: () => {
      if (committed.length === 0) return;
      note_removed_ids(committed);
      target.remove_emails(committed);
    },
  };
}
