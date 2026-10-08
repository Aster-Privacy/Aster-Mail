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
  restore_mail_item,
  type RestoreMailItemRequest,
  type RestoreMailItemResponse,
  type TrashThreadResponse,
} from "@/services/api/mail";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { ignore_error } from "@/lib/ignore_error";

const LOG_SCOPE = "services/trash_state";

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
  const result = await trash_thread(thread_token, is_trashed);

  if (result.data) {
    await write_trash_flag(merge_ids(result.data.ids, known_ids), {
      is_trashed,
    });
  }

  return result;
}

export async function restore_item_from_trash(
  item_id: string,
  known_ids: string[],
  request: RestoreMailItemRequest = {},
): Promise<ApiResponse<RestoreMailItemResponse>> {
  const result = await restore_mail_item(item_id, request);

  if (result.data) {
    await write_trash_flag(merge_ids(result.data.restored_ids, known_ids), {
      is_trashed: false,
      ...(request.target === "archive" && { is_archived: true }),
    });
  }

  return result;
}
