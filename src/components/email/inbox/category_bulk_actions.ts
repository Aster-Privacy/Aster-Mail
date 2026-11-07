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
import type { FlagIntents } from "@/services/read_intent";

import { bulk_action_by_scope } from "@/services/api/mail";
import { clear_flag_intents, note_flag_intents } from "@/services/read_intent";
import {
  get_category_action_ids,
  get_index_entries,
  is_fully_built,
  is_index_capped,
  remove_ids,
  reindex_ids,
  set_ids_read,
} from "@/services/category_index";
import { stale_all_view_caches } from "@/hooks/email_list_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";

export const CATEGORY_ACTION_CHUNK_SIZE = 1000;

export function scope_category_ids(
  category: EmailCategory,
  excluded_ids: readonly string[],
): string[] {
  return get_category_action_ids(category, excluded_ids).all_ids;
}

export type CategoryBulkOutcome =
  "done" | "continuing" | "noop" | "not_ready" | "unsupported";

const CATEGORY_ACTION_INTENTS: ReadonlyMap<BulkScopeAction, FlagIntents> =
  new Map<BulkScopeAction, FlagIntents>([
    ["archive", { is_archived: true }],
    ["trash", { is_trashed: true }],
    ["mark_spam", { is_spam: true }],
    ["mark_read", { is_read: true }],
    ["mark_unread", { is_read: false }],
    ["star", { is_starred: true }],
    ["unstar", { is_starred: false }],
  ]);

export const CATEGORY_SCOPE_ACTIONS: ReadonlySet<BulkScopeAction> = new Set(
  CATEGORY_ACTION_INTENTS.keys(),
);

export function supports_category_scope(action: BulkScopeAction): boolean {
  return CATEGORY_SCOPE_ACTIONS.has(action);
}

export interface CategoryBulkOptions {
  on_progress?: (completed: number, total: number) => void;
  exclude_ids?: string[];
}

function filter_by_read_state(ids: string[], is_read: boolean): string[] {
  const states = new Map(
    get_index_entries(ids).map((entry) => [entry.id, entry.is_read]),
  );

  return ids.filter((id) => (states.get(id) ?? is_read) === is_read);
}

function chunk_ids(ids: string[]): string[][] {
  const chunks: string[][] = [];

  for (let i = 0; i < ids.length; i += CATEGORY_ACTION_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CATEGORY_ACTION_CHUNK_SIZE));
  }

  return chunks;
}

function apply_to_index(action: BulkScopeAction, ids: string[]): void {
  switch (action) {
    case "archive":
    case "trash":
    case "mark_spam":
      remove_ids(ids);
      break;
    case "mark_read":
    case "mark_unread":
      set_ids_read(ids, action === "mark_read");
      break;
    default:
      reindex_ids(ids);
  }
}

async function apply_chunk(
  action: BulkScopeAction,
  intent: FlagIntents,
  chunk: string[],
): Promise<boolean> {
  note_flag_intents(chunk, intent);

  let applied = false;

  try {
    const response = await bulk_action_by_scope({
      action,
      scope: {},
      ids: chunk,
    });

    if (response.error || !response.data) {
      throw new Error("category bulk action failed");
    }
    applied = true;

    return response.data.completed !== false;
  } finally {
    if (!applied) clear_flag_intents(chunk, intent);
  }
}

export async function run_category_scope_action(
  action: BulkScopeAction,
  category: EmailCategory,
  options?: CategoryBulkOptions,
): Promise<CategoryBulkOutcome> {
  const intent = CATEGORY_ACTION_INTENTS.get(action);

  if (!intent) return "unsupported";
  if (!is_fully_built()) return "not_ready";
  if (is_index_capped()) return "not_ready";

  const all_ids = scope_category_ids(category, options?.exclude_ids ?? []);

  if (all_ids.length === 0) return "noop";

  const target_ids =
    action === "mark_read" || action === "mark_unread"
      ? filter_by_read_state(all_ids, action === "mark_unread")
      : all_ids;

  if (target_ids.length === 0) return "noop";

  const total = target_ids.length;
  let completed = 0;
  let finished = true;

  options?.on_progress?.(0, total);

  try {
    for (const chunk of chunk_ids(target_ids)) {
      const chunk_finished = await apply_chunk(action, intent, chunk);

      if (!chunk_finished) finished = false;
      apply_to_index(action, chunk);
      completed += chunk.length;
      options?.on_progress?.(completed, total);
    }
  } finally {
    if (completed > 0) {
      invalidate_mail_stats();
      stale_all_view_caches();
    }
  }

  return finished ? "done" : "continuing";
}
