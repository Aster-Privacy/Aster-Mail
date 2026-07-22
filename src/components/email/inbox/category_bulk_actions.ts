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
import type { EmailCategory } from "@/types/email";
import type { BulkScopeAction } from "@/services/api/mail";

import { batch_archive } from "@/services/api/archive";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import {
  get_category_action_ids,
  is_fully_built,
  is_index_capped,
  remove_ids,
  reindex_ids,
} from "@/services/category_index";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";

export const CATEGORY_ACTION_CHUNK_SIZE = 100;

export type CategoryBulkOutcome = "done" | "noop" | "not_ready";

export interface CategoryBulkOptions {
  on_progress?: (completed: number, total: number) => void;
}

function chunk_ids(ids: string[]): string[][] {
  const chunks: string[][] = [];

  for (let i = 0; i < ids.length; i += CATEGORY_ACTION_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CATEGORY_ACTION_CHUNK_SIZE));
  }

  return chunks;
}

async function apply_metadata_chunks(
  chunks: string[][],
  updates: Parameters<typeof bulk_update_metadata_by_ids>[1],
  options: {
    on_chunk_done: (succeeded_ids: string[]) => void;
    on_failure: (succeeded_ids: string[]) => void;
    on_progress: (completed: number) => void;
  },
): Promise<string[]> {
  const succeeded: string[] = [];
  let completed = 0;

  for (const chunk of chunks) {
    const result = await bulk_update_metadata_by_ids(chunk, updates);
    const failed = new Set(result.failed_ids);
    const chunk_succeeded = chunk.filter((id) => !failed.has(id));

    succeeded.push(...chunk_succeeded);
    options.on_chunk_done(chunk_succeeded);

    if (!result.success) {
      options.on_failure(succeeded);
      throw new Error("category bulk update failed");
    }

    completed += chunk.length;
    options.on_progress(completed);
  }

  return succeeded;
}

export async function run_category_scope_action(
  action: BulkScopeAction,
  category: EmailCategory,
  options?: CategoryBulkOptions,
): Promise<CategoryBulkOutcome> {
  if (!is_fully_built()) return "not_ready";
  if (is_index_capped()) return "not_ready";

  const { all_ids } = get_category_action_ids(category);

  if (all_ids.length === 0) return "noop";

  const total = all_ids.length;
  const report = (completed: number) =>
    options?.on_progress?.(completed, total);
  const chunks = chunk_ids(all_ids);

  report(0);

  switch (action) {
    case "archive": {
      let completed = 0;

      for (const chunk of chunks) {
        const result = await batch_archive({ ids: chunk, tier: "hot" });

        if (result.error || !result.data?.success) {
          throw new Error("category bulk archive failed");
        }

        remove_ids(chunk);

        let blob_updated = false;

        try {
          const blob_result = await bulk_update_metadata_by_ids(chunk, {
            is_archived: true,
          });

          blob_updated = blob_result.success;
        } catch {
          blob_updated = false;
        }
        if (!blob_updated) {
          reindex_ids(chunk);
        }

        completed += chunk.length;
        report(completed);
      }
      break;
    }
    case "trash": {
      await apply_metadata_chunks(
        chunks,
        { is_trashed: true },
        {
          on_chunk_done: (succeeded_ids) => remove_ids(succeeded_ids),
          on_failure: () => {},
          on_progress: report,
        },
      );
      break;
    }
    case "mark_spam": {
      await apply_metadata_chunks(
        chunks,
        { is_spam: true, is_trashed: false },
        {
          on_chunk_done: (succeeded_ids) => remove_ids(succeeded_ids),
          on_failure: () => {},
          on_progress: report,
        },
      );
      break;
    }
    case "mark_read":
    case "mark_unread": {
      const succeeded = await apply_metadata_chunks(
        chunks,
        { is_read: action === "mark_read" },
        {
          on_chunk_done: () => {},
          on_failure: (succeeded_ids) => reindex_ids(succeeded_ids),
          on_progress: report,
        },
      );

      reindex_ids(succeeded);
      break;
    }
    case "star":
    case "unstar": {
      const succeeded = await apply_metadata_chunks(
        chunks,
        { is_starred: action === "star" },
        {
          on_chunk_done: () => {},
          on_failure: (succeeded_ids) => reindex_ids(succeeded_ids),
          on_progress: report,
        },
      );

      reindex_ids(succeeded);
      break;
    }
    default:
      return "not_ready";
  }

  invalidate_mail_stats();
  stale_all_view_caches();

  return "done";
}
