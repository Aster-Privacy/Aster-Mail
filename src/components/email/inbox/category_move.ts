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
import type { EmailCategory, InboxEmail } from "@/types/email";
import type { MailItem } from "@/services/api/mail";
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  CategoryIndexEntry,
  CategoryMoveTarget,
  CategoryWriteResult,
} from "@/services/category_index";
import type { PreviousCategoryState } from "@/services/crypto/mail_metadata_core";

import { displayed_category } from "@/services/effective_category";
import {
  apply_category_pin_locally,
  get_index_entries,
  get_thread_entry_ids,
  is_thread_grouping,
  restore_category_entry_locally,
  restore_message_category,
  set_message_category,
} from "@/services/category_index";
import {
  bulk_action_result,
  show_bulk_result_toast,
} from "@/hooks/bulk_action_result";
import { show_toast } from "@/components/toast/simple_toast";
import {
  category_display_name,
  type CustomCategoryRule,
} from "@/data/category_catalog";
import { maybe_offer_sender_rule } from "@/components/email/inbox/category_sender_rule";
import { ignore_error } from "@/lib/ignore_error";

const CATEGORY_MOVE_CONCURRENCY = 6;
const MAX_OWN_WRITES = 500;

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export type CategoryMoveUpdateEmail = (
  id: string,
  updates: Partial<InboxEmail>,
) => void;

export interface CategoryMoveItem extends CategoryMoveTarget {
  mail_category?: EmailCategory;
  sender_email?: string;
}

export interface CategoryMoveOptions {
  t: Translate;
  update_email?: CategoryMoveUpdateEmail;
  custom_categories?: readonly CustomCategoryRule[];
}

export interface CategoryEligibilitySource {
  item_type?: string;
  is_archived?: boolean;
  is_trashed?: boolean;
  is_spam?: boolean;
  labels?: readonly unknown[];
  folders?: readonly unknown[];
  snoozed_until?: string | null;
  metadata?: {
    item_type?: string;
    is_archived?: boolean;
    is_trashed?: boolean;
    is_spam?: boolean;
    snoozed_until?: string;
  } | null;
}

function is_future(timestamp: string | null | undefined): boolean {
  if (!timestamp) return false;
  const wake = new Date(timestamp).getTime();

  return !Number.isNaN(wake) && wake > Date.now();
}

interface MemberMove {
  target: CategoryMoveTarget;
  entry?: CategoryIndexEntry;
  written?: CategoryWriteResult;
}

interface RowMove {
  item: CategoryMoveItem;
  members: MemberMove[];
}

interface RowOutcome {
  applied: boolean;
  undecryptable: boolean;
}

interface OwnWrite {
  encrypted_metadata: string;
  metadata_nonce: string;
  metadata_version?: number;
}

let move_queue: Promise<void> = Promise.resolve();
const own_writes = new Map<string, OwnWrite>();

export function can_move_to_category(
  item: CategoryEligibilitySource | null | undefined,
): boolean {
  if (!item) return false;
  const meta = item.metadata;
  const item_type = item.item_type ?? meta?.item_type;

  if (item_type !== undefined && item_type !== "received") return false;
  if (item.is_archived || item.is_trashed || item.is_spam) return false;
  if (meta?.is_archived || meta?.is_trashed || meta?.is_spam) return false;
  if ((item.labels?.length ?? 0) > 0 || (item.folders?.length ?? 0) > 0) {
    return false;
  }

  return !is_future(item.snoozed_until) && !is_future(meta?.snoozed_until);
}

export function mail_item_move_item(
  mail_item: MailItem,
  sender_email?: string,
): CategoryMoveItem {
  return {
    id: mail_item.id,
    thread_token: mail_item.thread_token,
    encrypted_metadata: mail_item.encrypted_metadata,
    metadata_nonce: mail_item.metadata_nonce,
    metadata_version: mail_item.metadata_version,
    is_read: mail_item.is_read,
    raw_timestamp: mail_item.message_ts || mail_item.created_at,
    sender_email,
  };
}

export function reset_category_move_queue(): void {
  move_queue = Promise.resolve();
  own_writes.clear();
}

function remember_write(id: string, written?: CategoryWriteResult): void {
  if (!written?.encrypted_metadata || !written.metadata_nonce) return;
  own_writes.delete(id);
  own_writes.set(id, {
    encrypted_metadata: written.encrypted_metadata,
    metadata_nonce: written.metadata_nonce,
    metadata_version: written.metadata_version,
  });
  while (own_writes.size > MAX_OWN_WRITES) {
    const oldest = own_writes.keys().next().value;

    if (oldest === undefined) break;
    own_writes.delete(oldest);
  }
}

function with_latest_blob<T extends CategoryMoveTarget>(target: T): T {
  const own = own_writes.get(target.id);

  if (!own) return target;
  if (
    target.encrypted_metadata === own.encrypted_metadata ||
    (target.metadata_version ?? -1) > (own.metadata_version ?? -1)
  ) {
    return target;
  }

  return { ...target, ...own };
}

function enqueue(run: () => Promise<void>): Promise<void> {
  const guarded = async (): Promise<void> => {
    try {
      await run();
    } catch (caught) {
      ignore_error("components/email/inbox/category_move:run", caught);
    }
  };

  move_queue = move_queue.then(guarded, guarded);

  return move_queue;
}

function plan_row_moves(
  items: readonly CategoryMoveItem[],
  category: EmailCategory,
): RowMove[] {
  const claimed = new Set<string>();
  const rows: RowMove[] = [];

  for (const item of items) {
    if (claimed.has(item.id)) continue;
    if (displayed_category(item) === category) continue;

    const sibling_ids =
      item.thread_token && is_thread_grouping()
        ? get_thread_entry_ids(item.thread_token).filter(
            (id) => id !== item.id && !claimed.has(id),
          )
        : [];
    const entries = new Map(
      get_index_entries([item.id, ...sibling_ids]).map((entry) => [
        entry.id,
        entry,
      ]),
    );
    const members: MemberMove[] = [
      { target: with_latest_blob(item), entry: entries.get(item.id) },
    ];

    claimed.add(item.id);
    for (const id of sibling_ids) {
      const entry = entries.get(id);

      claimed.add(id);
      if (!entry) continue;
      if (entry.category_pinned && entry.category === category) continue;
      members.push({
        target: with_latest_blob({
          id,
          thread_token: entry.thread_token,
          is_read: entry.is_read,
          raw_timestamp: entry.message_ts,
        }),
        entry,
      });
    }

    rows.push({ item, members });
  }

  return rows;
}

function apply_rows_locally(
  rows: readonly RowMove[],
  category: EmailCategory,
  update_email?: CategoryMoveUpdateEmail,
): void {
  for (const row of rows) {
    for (const member of row.members) {
      apply_category_pin_locally(member.target, category);
    }
    update_email?.(row.item.id, { mail_category: category });
  }
}

function restore_member_locally(member: MemberMove): void {
  restore_category_entry_locally(member.target.id, member.entry);
}

function apply_blob(
  id: string,
  written: CategoryWriteResult | undefined,
  update_email?: CategoryMoveUpdateEmail,
): void {
  if (
    !update_email ||
    !written?.encrypted_metadata ||
    !written.metadata_nonce
  ) {
    return;
  }

  update_email(id, {
    encrypted_metadata: written.encrypted_metadata,
    metadata_nonce: written.metadata_nonce,
    metadata_version: written.metadata_version,
  });
}

async function safe_write(
  write: () => Promise<CategoryWriteResult>,
): Promise<CategoryWriteResult> {
  try {
    return await write();
  } catch (caught) {
    ignore_error("components/email/inbox/category_move:write", caught);

    return { applied: false, undecryptable: false };
  }
}

async function run_in_pool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const next = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor];

      cursor += 1;
      await worker(item);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(CATEGORY_MOVE_CONCURRENCY, items.length) },
      next,
    ),
  );
}

async function write_row(
  row: RowMove,
  category: EmailCategory,
): Promise<RowOutcome> {
  const [head, ...siblings] = row.members;
  const head_result = await safe_write(() =>
    set_message_category(head.target, category),
  );

  remember_write(head.target.id, head_result);
  if (!head_result.applied) {
    for (const member of row.members) restore_member_locally(member);

    return { applied: false, undecryptable: head_result.undecryptable };
  }
  head.written = head_result;

  for (const sibling of siblings) {
    const result = await safe_write(() =>
      set_message_category(sibling.target, category),
    );

    remember_write(sibling.target.id, result);
    if (result.applied) {
      sibling.written = result;
    } else {
      restore_member_locally(sibling);
    }
  }

  return { applied: true, undecryptable: false };
}

function written_target(member: MemberMove): CategoryMoveTarget {
  const written = member.written;

  if (!written?.encrypted_metadata || !written.metadata_nonce) {
    return member.target;
  }

  return {
    ...member.target,
    encrypted_metadata: written.encrypted_metadata,
    metadata_nonce: written.metadata_nonce,
    metadata_version: written.metadata_version,
  };
}

function previous_state(member: MemberMove): PreviousCategoryState {
  return member.written?.previous ?? { category_pinned: false };
}

async function undo_rows(
  rows: readonly RowMove[],
  category: EmailCategory,
  options: CategoryMoveOptions,
): Promise<void> {
  const { t, update_email } = options;
  let failed = false;
  let undecryptable = false;

  for (const row of rows) {
    for (const member of row.members) {
      if (member.written) restore_member_locally(member);
    }
    update_email?.(row.item.id, { mail_category: row.item.mail_category });
  }

  await run_in_pool(rows, async (row) => {
    for (const member of row.members) {
      if (!member.written) continue;

      const is_head = member.target.id === row.item.id;
      const result = await safe_write(() =>
        restore_message_category(
          with_latest_blob(written_target(member)),
          previous_state(member),
        ),
      );

      remember_write(member.target.id, result);
      if (result.applied) {
        if (is_head) apply_blob(row.item.id, result, update_email);
        continue;
      }

      failed = true;
      undecryptable = undecryptable || result.undecryptable;
      apply_category_pin_locally(member.target, category);
      if (is_head) update_email?.(row.item.id, { mail_category: category });
    }
  });

  if (failed) {
    show_toast(
      undecryptable
        ? t("errors.metadata_undecryptable_change")
        : t("common.something_went_wrong"),
      "error",
    );
  }
}

export function move_items_to_category(
  items: readonly CategoryMoveItem[],
  category: EmailCategory,
  options: CategoryMoveOptions,
): Promise<void> {
  const { t, update_email, custom_categories } = options;
  const rows = plan_row_moves(items, category);

  if (rows.length === 0) return Promise.resolve();

  apply_rows_locally(rows, category, update_email);

  return enqueue(async () => {
    const failed_ids = new Set<string>();
    let undecryptable = false;

    await run_in_pool(rows, async (row) => {
      const outcome = await write_row(row, category);

      if (outcome.applied) {
        apply_blob(row.item.id, row.members[0].written, update_email);

        return;
      }

      failed_ids.add(row.item.id);
      undecryptable = undecryptable || outcome.undecryptable;
      update_email?.(row.item.id, { mail_category: row.item.mail_category });
    });

    const moved = rows.filter((row) => !failed_ids.has(row.item.id));

    show_bulk_result_toast({
      result: bulk_action_result(
        rows.map((row) => row.item.id),
        [...failed_ids],
      ),
      t,
      success_message: t("mail.moved_to_category"),
      error_message: undecryptable
        ? t("errors.metadata_undecryptable_change")
        : t("common.something_went_wrong"),
      action_type: "folder",
      email_ids: moved.map((row) => row.item.id),
      on_undo: () => enqueue(() => undo_rows(moved, category, options)),
    });

    if (moved.length > 0) {
      maybe_offer_sender_rule(
        moved.map((row) => row.item),
        category,
        category_display_name(category, custom_categories, t),
        t,
      );
    }
  });
}
