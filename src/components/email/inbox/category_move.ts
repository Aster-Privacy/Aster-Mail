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
import type {
  EmailCategory,
  InboxEmail,
  SenderVerificationStatus,
} from "@/types/email";
import type { MailItem } from "@/services/api/mail";
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  CategoryIndexEntry,
  CategoryMoveTarget,
  CategoryWriteResult,
} from "@/services/category_index";
import type { PreviousCategoryState } from "@/services/crypto/mail_metadata_core";

import { effective_category } from "@/services/effective_category";
import {
  apply_category_pins_locally,
  batch_index_updates,
  get_index_entries,
  group_thread_entries,
  is_thread_grouping,
  restore_category_entry_locally,
  thread_category_of,
  write_category_states,
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
import { record_category_move } from "@/services/learned_category_senders";
import { ignore_error } from "@/lib/ignore_error";
import { is_primary_locked_sender } from "@/services/learned_sender_gate";

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
  sender_verification?: SenderVerificationStatus;
  is_external?: boolean;
  system_origin?: boolean;
  spf_result?: string | null;
  dkim_result?: string | null;
  dmarc_result?: string | null;
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
  undone?: boolean;
}

interface WriteOutcome {
  failed_ids: Set<string>;
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
  sender_verification?: SenderVerificationStatus,
): CategoryMoveItem {
  return {
    is_external: mail_item.is_external,
    system_origin: mail_item.system_origin,
    sender_verification,
    spf_result: mail_item.spf_result,
    dkim_result: mail_item.dkim_result,
    dmarc_result: mail_item.dmarc_result,
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


function is_locked_move(
  item: CategoryMoveItem,
  entry: CategoryIndexEntry | undefined,
  thread: readonly CategoryIndexEntry[] | null | undefined,
): boolean {
  if (entry?.system_locked) return true;
  if (thread?.some((member) => member.system_locked)) return true;

  return is_primary_locked_sender(item.sender_email || "", item);
}

function plan_row_moves(
  items: readonly CategoryMoveItem[],
  category: EmailCategory,
): RowMove[] {
  const grouping = is_thread_grouping();
  const tokens = new Set<string>();

  if (grouping) {
    for (const item of items) {
      if (item.thread_token) tokens.add(item.thread_token);
    }
  }

  const threads = group_thread_entries(tokens);
  const heads = new Map(
    get_index_entries(items.map((item) => item.id)).map((entry) => [
      entry.id,
      entry,
    ]),
  );
  const claimed = new Set<string>();
  const rows: RowMove[] = [];

  for (const item of items) {
    if (claimed.has(item.id)) continue;

    const thread =
      grouping && item.thread_token ? threads.get(item.thread_token) : null;

    if (is_locked_move(item, heads.get(item.id), thread)) continue;
    const shown =
      (thread ? thread_category_of(thread) : null) ??
      effective_category(item);

    if (shown === category) continue;

    const members: MemberMove[] = [
      { target: with_latest_blob(item), entry: heads.get(item.id) },
    ];

    claimed.add(item.id);
    for (const entry of thread ?? []) {
      if (entry.id === item.id || claimed.has(entry.id)) continue;
      claimed.add(entry.id);
      if (entry.category_pinned && entry.category === category) continue;
      members.push({
        target: with_latest_blob({
          id: entry.id,
          thread_token: entry.thread_token,
          is_read: entry.is_read,
          raw_timestamp: entry.message_ts,
        }),
        entry: { ...entry },
      });
    }

    rows.push({ item, members });
  }

  return rows;
}

function restore_member_locally(member: MemberMove): void {
  restore_category_entry_locally(member.target.id, member.entry);
}

function apply_rows_locally(
  rows: readonly RowMove[],
  category: EmailCategory,
  update_email?: CategoryMoveUpdateEmail,
): void {
  batch_index_updates(() => {
    apply_category_pins_locally(
      rows.flatMap((row) => row.members.map((member) => member.target)),
      category,
    );
  });
  for (const row of rows) {
    update_email?.(row.item.id, { mail_category: category });
  }
}

function restore_rows_locally(
  rows: readonly RowMove[],
  update_email?: CategoryMoveUpdateEmail,
): void {
  if (rows.length === 0) return;
  batch_index_updates(() => {
    for (const row of rows) {
      for (const member of row.members) restore_member_locally(member);
    }
  });
  for (const row of rows) {
    update_email?.(row.item.id, { mail_category: row.item.mail_category });
  }
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

interface StateWrite {
  target: CategoryMoveTarget;
  state: PreviousCategoryState;
}

async function safe_write_all(
  writes: readonly StateWrite[],
): Promise<Map<string, CategoryWriteResult>> {
  if (writes.length === 0) return new Map();
  try {
    return await write_category_states(writes);
  } catch (caught) {
    ignore_error("components/email/inbox/category_move:write", caught);

    return new Map();
  }
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

async function write_rows(
  rows: readonly RowMove[],
  category: EmailCategory,
  update_email?: CategoryMoveUpdateEmail,
): Promise<WriteOutcome> {
  const state: PreviousCategoryState = { category, category_pinned: true };
  const outcomes = await safe_write_all(
    rows.flatMap((row) =>
      row.members.map((member) => ({ target: member.target, state })),
    ),
  );
  const failed_ids = new Set<string>();
  const failed_rows: RowMove[] = [];
  const failed_members: MemberMove[] = [];
  const orphaned: MemberMove[] = [];
  let undecryptable = false;

  for (const row of rows) {
    for (const member of row.members) {
      const result = outcomes.get(member.target.id);

      remember_write(member.target.id, result);
      if (result?.applied) member.written = result;
    }

    const head = row.members[0];

    if (!head.written) {
      failed_ids.add(row.item.id);
      failed_rows.push(row);
      undecryptable =
        undecryptable || outcomes.get(head.target.id)?.undecryptable === true;
      for (const member of row.members) {
        if (member.written) orphaned.push(member);
      }
      continue;
    }

    for (const member of row.members) {
      if (!member.written && !row.undone) failed_members.push(member);
    }
    if (!row.undone) apply_blob(row.item.id, head.written, update_email);
  }

  if (failed_members.length > 0) {
    batch_index_updates(() => {
      for (const member of failed_members) restore_member_locally(member);
    });
  }
  restore_rows_locally(
    failed_rows.filter((row) => !row.undone),
    update_email,
  );
  if (orphaned.length > 0) {
    const reverted = await safe_write_all(
      orphaned.map((member) => ({
        target: with_latest_blob(written_target(member)),
        state: previous_state(member),
      })),
    );

    for (const member of orphaned) {
      remember_write(member.target.id, reverted.get(member.target.id));
      member.written = undefined;
    }
  }

  return { failed_ids, undecryptable };
}

async function undo_rows(
  rows: readonly RowMove[],
  category: EmailCategory,
  options: CategoryMoveOptions,
): Promise<void> {
  const { t, update_email } = options;
  const members = rows.flatMap((row) =>
    row.members
      .filter((member) => member.written)
      .map((member) => ({ row, member })),
  );
  const outcomes = await safe_write_all(
    members.map(({ member }) => ({
      target: with_latest_blob(written_target(member)),
      state: previous_state(member),
    })),
  );
  const reapply: CategoryMoveTarget[] = [];
  let undecryptable = false;

  for (const { row, member } of members) {
    const result = outcomes.get(member.target.id);
    const is_head = member.target.id === row.item.id;

    remember_write(member.target.id, result);
    if (result?.applied) {
      if (is_head) apply_blob(row.item.id, result, update_email);
      continue;
    }

    undecryptable = undecryptable || result?.undecryptable === true;
    reapply.push(member.target);
    if (is_head) update_email?.(row.item.id, { mail_category: category });
  }

  if (reapply.length === 0) return;

  batch_index_updates(() => apply_category_pins_locally(reapply, category));
  show_toast(
    undecryptable
      ? t("errors.metadata_undecryptable_change")
      : t("common.something_went_wrong"),
    "error",
  );
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

  let undo_learned: (() => void) | null = null;
  const row_ids = rows.map((row) => row.item.id);

  show_bulk_result_toast({
    result: bulk_action_result(row_ids, []),
    t,
    success_message: t("mail.moved_to_category"),
    error_message: t("common.something_went_wrong"),
    action_type: "folder",
    email_ids: row_ids,
    on_undo: () => {
      const live = rows.filter((row) => !row.undone);

      for (const row of live) row.undone = true;
      restore_rows_locally(live, update_email);
      undo_learned?.();
      undo_learned = null;

      return enqueue(() => undo_rows(live, category, options));
    },
  });

  return enqueue(async () => {
    const { failed_ids, undecryptable } = await write_rows(
      rows,
      category,
      update_email,
    );

    if (failed_ids.size > 0) {
      show_toast(
        undecryptable
          ? t("errors.metadata_undecryptable_change")
          : failed_ids.size === rows.length
            ? t("common.something_went_wrong")
            : t("common.bulk_action_partially_applied", {
                count: rows.length - failed_ids.size,
                total: rows.length,
              }),
        "error",
      );
    }

    const moved = rows.filter(
      (row) => !failed_ids.has(row.item.id) && !row.undone,
    );

    if (moved.length > 0) {
      undo_learned = record_category_move(
        moved.map((row) => row.item),
        category,
      );
      maybe_offer_sender_rule(
        moved.map((row) => row.item),
        category,
        category_display_name(category, custom_categories, t),
        t,
      );
    }
  });
}
