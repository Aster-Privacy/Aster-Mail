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
import type { TranslationKey } from "@/lib/i18n/types";
import type { CategoryIndexEntry } from "@/services/category_index";

import { useCallback, useRef } from "react";

import { category_for_tab } from "@/services/mail_categorizer";
import { effective_category } from "@/services/effective_category";
import {
  clear_recent_pin,
  get_index_entries,
  note_recent_pin,
  set_message_category,
  upsert_entries,
} from "@/services/category_index";
import {
  bulk_action_result,
  show_bulk_result_toast,
} from "@/hooks/bulk_action_result";
import { show_toast } from "@/components/toast/simple_toast";

const CATEGORY_MOVE_CONCURRENCY = 6;

type UpdateEmail = (id: string, updates: Partial<InboxEmail>) => void;

interface CategorySnapshot {
  email: InboxEmail;
  mail_category?: EmailCategory;
  entry?: CategoryIndexEntry;
}

interface UseCategoryDropOptions {
  emails: InboxEmail[];
  update_email: UpdateEmail;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function index_entry_for(
  email: InboxEmail,
  category: EmailCategory,
  previous?: CategoryIndexEntry,
): CategoryIndexEntry {
  return {
    id: email.id,
    thread_token: email.thread_token,
    message_ts: previous?.message_ts || email.raw_timestamp || email.timestamp,
    is_read: previous?.is_read ?? email.is_read,
    category,
    category_pinned: true,
    ...(previous?.snoozed_until
      ? { snoozed_until: previous.snoozed_until }
      : {}),
  };
}

function apply_category_locally(
  snapshots: CategorySnapshot[],
  category: EmailCategory,
  update_email: UpdateEmail,
): void {
  const entries: CategoryIndexEntry[] = [];

  for (const snapshot of snapshots) {
    note_recent_pin(snapshot.email.id, category);
    entries.push(index_entry_for(snapshot.email, category, snapshot.entry));
    update_email(snapshot.email.id, { mail_category: category });
  }

  upsert_entries(entries);
}

function restore_category_locally(
  snapshots: CategorySnapshot[],
  update_email: UpdateEmail,
): void {
  const entries: CategoryIndexEntry[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.entry) {
      note_recent_pin(snapshot.email.id, snapshot.entry.category);
      entries.push(snapshot.entry);
    } else {
      clear_recent_pin(snapshot.email.id);
    }
    update_email(snapshot.email.id, { mail_category: snapshot.mail_category });
  }

  upsert_entries(entries);
}

interface CategoryMoveOutcome {
  failed_ids: string[];
  undecryptable_ids: string[];
}

async function move_to_category(
  emails: InboxEmail[],
  category: EmailCategory,
): Promise<CategoryMoveOutcome> {
  const failed_ids: string[] = [];
  const undecryptable_ids: string[] = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const email = emails[cursor];

      cursor += 1;
      if (!email) return;

      let applied = false;
      let undecryptable = false;

      try {
        const outcome = await set_message_category(email, category);

        applied = outcome.applied;
        undecryptable = outcome.undecryptable;
      } catch {
        applied = false;
      }
      if (!applied) {
        failed_ids.push(email.id);
        if (undecryptable) undecryptable_ids.push(email.id);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(CATEGORY_MOVE_CONCURRENCY, emails.length) },
      worker,
    ),
  );

  return { failed_ids, undecryptable_ids };
}

export function use_category_drop({
  emails,
  update_email,
  t,
}: UseCategoryDropOptions): (
  category: EmailCategory,
  email_ids: string[],
) => Promise<void> {
  const emails_ref = useRef(emails);
  const queue_ref = useRef<Promise<void>>(Promise.resolve());

  emails_ref.current = emails;

  const run_undo = useCallback(
    async (
      snapshots: CategorySnapshot[],
      moved_category: EmailCategory,
    ): Promise<void> => {
      const by_category = new Map<EmailCategory, CategorySnapshot[]>();

      for (const snapshot of snapshots) {
        const target = category_for_tab(snapshot.mail_category);
        const group = by_category.get(target);

        if (group) {
          group.push(snapshot);
        } else {
          by_category.set(target, [snapshot]);
        }
      }

      restore_category_locally(snapshots, update_email);

      const failed_ids: string[] = [];
      const undecryptable_ids: string[] = [];

      for (const [target, group] of by_category) {
        const current = group.map(
          (snapshot) =>
            emails_ref.current.find(
              (email) => email.id === snapshot.email.id,
            ) ?? snapshot.email,
        );

        const outcome = await move_to_category(current, target);

        failed_ids.push(...outcome.failed_ids);
        undecryptable_ids.push(...outcome.undecryptable_ids);
      }

      if (failed_ids.length > 0) {
        const failed = new Set(failed_ids);

        apply_category_locally(
          snapshots.filter((snapshot) => failed.has(snapshot.email.id)),
          moved_category,
          update_email,
        );
        show_toast(
          undecryptable_ids.length > 0
            ? t("errors.metadata_undecryptable_change")
            : t("common.something_went_wrong"),
          "error",
        );
      }
    },
    [update_email, t],
  );

  return useCallback(
    (category: EmailCategory, email_ids: string[]): Promise<void> => {
      const id_set = new Set(email_ids);
      const targets = emails_ref.current.filter(
        (email) =>
          id_set.has(email.id) && effective_category(email) !== category,
      );

      if (targets.length === 0) return Promise.resolve();

      const entries = new Map(
        get_index_entries(targets.map((email) => email.id)).map((entry) => [
          entry.id,
          entry,
        ]),
      );
      const snapshots: CategorySnapshot[] = targets.map((email) => ({
        email,
        mail_category: effective_category(email),
        entry: entries.get(email.id),
      }));

      apply_category_locally(snapshots, category, update_email);

      const run = async (): Promise<void> => {
        const { failed_ids, undecryptable_ids } = await move_to_category(
          targets,
          category,
        );
        const failed = new Set(failed_ids);
        const moved = snapshots.filter(
          (snapshot) => !failed.has(snapshot.email.id),
        );

        if (failed.size > 0) {
          restore_category_locally(
            snapshots.filter((snapshot) => failed.has(snapshot.email.id)),
            update_email,
          );
        }

        show_bulk_result_toast({
          result: bulk_action_result(
            targets.map((email) => email.id),
            failed_ids,
          ),
          t,
          success_message: t("mail.moved_to_category"),
          error_message:
            undecryptable_ids.length > 0
              ? t("errors.metadata_undecryptable_change")
              : t("common.something_went_wrong"),
          action_type: "folder",
          email_ids: moved.map((snapshot) => snapshot.email.id),
          on_undo: () => run_undo(moved, category),
        });
      };

      queue_ref.current = queue_ref.current.then(run, run);

      return queue_ref.current;
    },
    [update_email, run_undo, t],
  );
}
