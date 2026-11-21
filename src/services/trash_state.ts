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
import type { ApiResponse } from "@/services/api/client";

import {
  trash_thread,
  spam_thread,
  restore_mail_item,
  type RestoreMailItemRequest,
  type RestoreMailItemResponse,
  type TrashThreadResponse,
  type SpamThreadResponse,
} from "@/services/api/mail";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import {
  run_bounded,
  with_rate_limit_retry,
} from "@/services/api/rate_limit_retry";
import { ignore_error } from "@/lib/ignore_error";

const LOG_SCOPE = "services/trash_state";
const THREAD_ACTION_CONCURRENCY = 4;

function merge_ids(server_ids: string[] | undefined, known_ids: string[]) {
  return Array.from(new Set([...(server_ids ?? []), ...known_ids]));
}

async function write_trash_flag(
  ids: string[],
  updates: { is_trashed: boolean; is_archived?: boolean },
): Promise<void> {
  if (ids.length === 0) return;

  await bulk_update_metadata_by_ids(ids, updates).catch((caught) =>
    ignore_error(LOG_SCOPE, caught),
  );
}

export async function set_thread_trashed(
  thread_token: string,
  known_ids: string[],
  is_trashed: boolean,
): Promise<ApiResponse<TrashThreadResponse>> {
  const result = await with_rate_limit_retry(() =>
    trash_thread(thread_token, is_trashed),
  );

  if (result.data) {
    await write_trash_flag(merge_ids(result.data.ids, known_ids), {
      is_trashed,
    });
  }

  return result;
}

export interface ThreadTrashTarget {
  thread_token: string;
  known_ids: string[];
}

export async function set_threads_trashed(
  targets: ThreadTrashTarget[],
  is_trashed: boolean,
): Promise<{ failed_tokens: string[] }> {
  const failed_tokens: string[] = [];
  const changed_ids = new Set<string>();

  await run_bounded(targets, THREAD_ACTION_CONCURRENCY, async (target) => {
    try {
      const result = await with_rate_limit_retry(() =>
        trash_thread(target.thread_token, is_trashed),
      );

      if (!result.data) {
        failed_tokens.push(target.thread_token);

        return;
      }
      for (const id of merge_ids(result.data.ids, target.known_ids)) {
        changed_ids.add(id);
      }
    } catch (caught) {
      ignore_error(LOG_SCOPE, caught);
      failed_tokens.push(target.thread_token);
    }
  });

  await write_trash_flag(Array.from(changed_ids), { is_trashed });

  return { failed_tokens };
}

export async function set_thread_spam(
  thread_token: string,
  known_ids: string[],
  is_spam: boolean,
): Promise<ApiResponse<SpamThreadResponse>> {
  const result = await with_rate_limit_retry(() =>
    spam_thread(thread_token, is_spam),
  );

  if (result.data) {
    const ids = is_spam
      ? merge_ids(result.data.ids, [])
      : merge_ids(result.data.ids, known_ids);

    if (ids.length > 0) {
      await bulk_update_metadata_by_ids(
        ids,
        is_spam ? { is_spam: true, is_trashed: false } : { is_spam: false },
      ).catch((caught) => ignore_error(LOG_SCOPE, caught));
    }
  }

  return result;
}

export async function sync_thread_spam(
  thread_tokens: Array<string | null | undefined>,
  is_spam: boolean,
): Promise<string[]> {
  const tokens = Array.from(
    new Set(thread_tokens.filter((token): token is string => !!token)),
  );
  const changed_ids = new Set<string>();

  await run_bounded(tokens, THREAD_ACTION_CONCURRENCY, async (token) => {
    try {
      const result = await with_rate_limit_retry(() =>
        spam_thread(token, is_spam),
      );

      for (const id of result.data?.ids ?? []) changed_ids.add(id);
    } catch (caught) {
      ignore_error(LOG_SCOPE, caught);
    }
  });

  const ids = Array.from(changed_ids);

  if (ids.length > 0) {
    await bulk_update_metadata_by_ids(
      ids,
      is_spam ? { is_spam: true, is_trashed: false } : { is_spam: false },
    ).catch((caught) => ignore_error(LOG_SCOPE, caught));
  }

  return ids;
}

export async function restore_item_from_trash(
  item_id: string,
  known_ids: string[],
  request: RestoreMailItemRequest = {},
): Promise<ApiResponse<RestoreMailItemResponse>> {
  const result = await with_rate_limit_retry(() =>
    restore_mail_item(item_id, request),
  );

  if (result.data) {
    await write_trash_flag(merge_ids(result.data.restored_ids, known_ids), {
      is_trashed: false,
      ...(request.target === "archive" && { is_archived: true }),
    });
  }

  return result;
}
