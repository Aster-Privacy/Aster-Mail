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
import type { TranslationKey } from "@/lib/i18n/types";

import { useCallback, useState } from "react";

import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { permanently_delete_message_ids } from "@/components/email/viewer_shared/trash_placement";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { emit_mail_items_removed } from "@/hooks/mail_events";

interface UseSearchDeleteOptions {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  bulk_delete: (emails: InboxEmail[]) => Promise<boolean>;
  apply_flag_patch: (ids: string[], patch: { is_trashed: boolean }) => void;
  remove_results: (ids: string[]) => void;
  confirm_before_permanent_delete: boolean | undefined;
  disable_permanent_delete_confirm?: () => void;
}

export interface SearchDeleteResult {
  delete_emails: (emails: InboxEmail[]) => Promise<void>;
  search_delete_dialog: React.ReactElement;
}

export function split_search_delete(emails: InboxEmail[]): {
  trashed: InboxEmail[];
  untrashed: InboxEmail[];
} {
  const trashed: InboxEmail[] = [];
  const untrashed: InboxEmail[] = [];

  for (const email of emails) {
    (email.is_trashed ? trashed : untrashed).push(email);
  }

  return { trashed, untrashed };
}

export function use_search_delete({
  t,
  bulk_delete,
  apply_flag_patch,
  remove_results,
  confirm_before_permanent_delete,
  disable_permanent_delete_confirm,
}: UseSearchDeleteOptions): SearchDeleteResult {
  const [pending, set_pending] = useState<InboxEmail[] | null>(null);
  const [dont_ask, set_dont_ask] = useState(false);

  const run_permanent_delete = useCallback(
    async (emails: InboxEmail[]) => {
      const ids = emails.map((email) => email.id);

      if (!(await permanently_delete_message_ids(ids))) {
        show_toast(t("common.failed_to_permanently_delete"), "error");

        return;
      }

      remove_results(ids);
      show_action_toast({
        message:
          ids.length === 1
            ? t("common.email_permanently_deleted")
            : t("common.emails_permanently_deleted", { count: ids.length }),
        action_type: "trash",
        email_ids: ids,
      });
    },
    [remove_results, t],
  );

  const delete_emails = useCallback(
    async (emails: InboxEmail[]) => {
      const { trashed, untrashed } = split_search_delete(emails);

      if (untrashed.length > 0 && (await bulk_delete(untrashed))) {
        const ids = untrashed.map((email) => email.id);

        apply_flag_patch(ids, { is_trashed: true });
        emit_mail_items_removed({ ids });
      }

      if (trashed.length === 0) return;

      if (confirm_before_permanent_delete !== false) {
        set_dont_ask(false);
        set_pending(trashed);

        return;
      }

      await run_permanent_delete(trashed);
    },
    [
      apply_flag_patch,
      bulk_delete,
      confirm_before_permanent_delete,
      run_permanent_delete,
    ],
  );

  const handle_confirm = useCallback(() => {
    const emails = pending;

    set_pending(null);
    if (dont_ask) disable_permanent_delete_confirm?.();
    set_dont_ask(false);
    if (emails) void run_permanent_delete(emails);
  }, [pending, dont_ask, disable_permanent_delete_confirm, run_permanent_delete]);

  const handle_cancel = useCallback(() => {
    set_pending(null);
    set_dont_ask(false);
  }, []);

  const count = pending?.length ?? 0;
  const search_delete_dialog = (
    <ConfirmModal
      confirm_text={t("mail.delete_permanently")}
      confirm_variant="destructive"
      description={
        count > 1
          ? t("mail.delete_messages_confirmation")
          : t("mail.delete_email_confirmation")
      }
      dont_ask={dont_ask}
      hide_dont_ask={!disable_permanent_delete_confirm}
      on_cancel={handle_cancel}
      on_confirm={handle_confirm}
      on_dont_ask_change={set_dont_ask}
      show={pending !== null}
      title={
        count > 1
          ? t("mail.bulk_delete_title", { count })
          : t("mail.delete_permanently_question")
      }
    />
  );

  return { delete_emails, search_delete_dialog };
}
