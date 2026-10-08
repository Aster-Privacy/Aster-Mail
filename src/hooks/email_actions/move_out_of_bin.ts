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

import {
  expand_email_ids,
  trashes_whole_thread,
} from "@/hooks/email_list_helpers";
import {
  batched_bulk_add_folder,
  batched_bulk_remove_folder,
  report_spam_sender,
  remove_spam_sender,
} from "@/services/api/mail";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { bulk_update_metadata_by_ids } from "@/services/crypto/mail_metadata";
import { set_thread_trashed } from "@/services/trash_state";
import { ignore_error } from "@/lib/ignore_error";

export type BinSource = "trash" | "spam";

export interface MoveOutOfBinParams {
  emails: InboxEmail[];
  source: BinSource;
  target_folder_token: string | null;
  conversation_grouping: boolean | undefined;
}

export interface MoveOutOfBinResult {
  moved: InboxEmail[];
  failed: InboxEmail[];
  filing_failed: boolean;
  undo: () => Promise<void>;
}

const LOG_SCOPE = "hooks/email_actions/move_out_of_bin";

export function bin_source_of(
  email: Pick<InboxEmail, "is_trashed" | "is_spam">,
  current_view: string,
): BinSource | null {
  if (current_view === "trash") return "trash";
  if (current_view === "spam") return "spam";
  if (email.is_trashed) return "trash";
  if (email.is_spam) return "spam";

  return null;
}

export function bin_source_of_view(current_view: string): BinSource | null {
  if (current_view === "trash") return "trash";
  if (current_view === "spam") return "spam";

  return null;
}

function restores_whole_thread(
  email: InboxEmail,
  source: BinSource,
  conversation_grouping: boolean | undefined,
): boolean {
  return (
    source === "trash" &&
    (email.thread_message_count ?? 0) > 1 &&
    trashes_whole_thread(email, conversation_grouping)
  );
}

async function set_bin_flag(
  emails: InboxEmail[],
  source: BinSource,
  conversation_grouping: boolean | undefined,
  in_bin: boolean,
): Promise<Set<string>> {
  const thread_emails = emails.filter((e) =>
    restores_whole_thread(e, source, conversation_grouping),
  );
  const single_emails = emails.filter(
    (e) => !restores_whole_thread(e, source, conversation_grouping),
  );
  const thread_tokens = Array.from(
    new Set(thread_emails.map((e) => e.thread_token as string)),
  );
  const single_ids = single_emails.flatMap(expand_email_ids);

  const thread_results = await Promise.all(
    thread_tokens.map((token) =>
      set_thread_trashed(
        token,
        thread_emails
          .filter((e) => e.thread_token === token)
          .flatMap(expand_email_ids),
        in_bin,
      ).catch(() => ({ data: null })),
    ),
  );
  const failed_threads = new Set(
    thread_tokens.filter((_, index) => !thread_results[index]?.data),
  );
  const single_result =
    single_ids.length > 0
      ? await bulk_update_metadata_by_ids(
          single_ids,
          source === "trash" ? { is_trashed: in_bin } : { is_spam: in_bin },
        ).catch(() => null)
      : { failed_ids: [] as string[] };
  const failed_ids = new Set(
    single_result ? single_result.failed_ids : single_ids,
  );

  const failed_emails = new Set<string>();

  for (const email of thread_emails) {
    if (failed_threads.has(email.thread_token as string)) {
      failed_emails.add(email.id);
    }
  }
  for (const email of single_emails) {
    if (expand_email_ids(email).some((id) => failed_ids.has(id))) {
      failed_emails.add(email.id);
    }
  }

  return failed_emails;
}

function group_ids_by_folder(emails: InboxEmail[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const email of emails) {
    for (const folder of email.folders ?? []) {
      const ids = groups.get(folder.folder_token) ?? [];

      ids.push(...expand_email_ids(email));
      groups.set(folder.folder_token, ids);
    }
  }

  return groups;
}

function update_spam_senders(emails: InboxEmail[], is_spam: boolean): void {
  const senders = new Set(
    emails.map((e) => e.sender_email).filter((s): s is string => !!s),
  );

  for (const sender of senders) {
    const request = is_spam
      ? report_spam_sender(sender)
      : remove_spam_sender(sender);

    request.catch((caught) => ignore_error(LOG_SCOPE, caught));
  }
}

export async function move_out_of_bin(
  params: MoveOutOfBinParams,
): Promise<MoveOutOfBinResult> {
  const { emails, source, target_folder_token, conversation_grouping } = params;
  const failed_set = await set_bin_flag(
    emails,
    source,
    conversation_grouping,
    false,
  );
  const moved = emails.filter((e) => !failed_set.has(e.id));
  const failed = emails.filter((e) => failed_set.has(e.id));
  const moved_ids = moved.flatMap(expand_email_ids);
  const previous_folders = group_ids_by_folder(moved);
  const archived_ids = moved
    .filter((e) => e.is_archived)
    .flatMap(expand_email_ids);
  let filing_failed = false;

  if (moved.length > 0) {
    if (source === "spam") {
      update_spam_senders(moved, false);
    }

    if (target_folder_token) {
      const result = await batched_bulk_add_folder(
        moved_ids,
        target_folder_token,
      );

      filing_failed = !result.success;
    } else {
      for (const [folder_token, ids] of previous_folders) {
        const result = await batched_bulk_remove_folder(ids, folder_token);

        if (!result.success) filing_failed = true;
      }

      if (archived_ids.length > 0) {
        const result = await batch_unarchive({ ids: archived_ids });

        if (result.data?.success) {
          await bulk_update_metadata_by_ids(archived_ids, {
            is_archived: false,
          }).catch((caught) => ignore_error(LOG_SCOPE, caught));
        } else {
          filing_failed = true;
        }
      }
    }
  }

  const undo = async (): Promise<void> => {
    if (moved.length === 0) return;

    if (target_folder_token) {
      await batched_bulk_remove_folder(moved_ids, target_folder_token);
    } else if (archived_ids.length > 0) {
      await batch_archive({ ids: archived_ids, tier: "hot" });
      await bulk_update_metadata_by_ids(archived_ids, {
        is_archived: true,
      }).catch((caught) => ignore_error(LOG_SCOPE, caught));
    }

    for (const [folder_token, ids] of previous_folders) {
      await batched_bulk_add_folder(ids, folder_token);
    }

    await set_bin_flag(moved, source, conversation_grouping, true);

    if (source === "spam") {
      update_spam_senders(moved, true);
    }
  };

  return { moved, failed, filing_failed, undo };
}
