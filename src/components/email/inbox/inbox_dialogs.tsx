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
import type { ConfirmationDialogState } from "@/types/email";

import { Button } from "@aster/ui";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert_dialog";
import {
  ConfirmModal,
  EmptyTrashModal,
} from "@/components/email/inbox/inbox_confirmation_dialog";
import { CustomSnoozeModal } from "@/components/modals/custom_snooze_modal";
import { use_i18n } from "@/lib/i18n/context";

interface InboxDialogsProps {
  current_view: string;
  confirmations: ConfirmationDialogState;
  dont_ask_delete: boolean;
  set_dont_ask_delete: (v: boolean) => void;
  dont_ask_archive: boolean;
  set_dont_ask_archive: (v: boolean) => void;
  dont_ask_spam: boolean;
  set_dont_ask_spam: (v: boolean) => void;
  cancel_delete: () => void;
  confirm_delete: () => Promise<void>;
  cancel_archive: () => void;
  confirm_archive: () => Promise<void>;
  cancel_single_delete: () => void;
  confirm_single_delete: () => Promise<void>;
  show_single_delete_confirm: boolean;
  dont_ask_single_delete: boolean;
  set_dont_ask_single_delete: (v: boolean) => void;
  cancel_single_spam: () => void;
  confirm_single_spam: () => Promise<void>;
  show_single_spam_confirm: boolean;
  dont_ask_single_spam: boolean;
  set_dont_ask_single_spam: (v: boolean) => void;
  cancel_single_archive: () => void;
  confirm_single_archive: () => Promise<void>;
  show_single_archive_confirm: boolean;
  dont_ask_single_archive: boolean;
  set_dont_ask_single_archive: (v: boolean) => void;
  cancel_spam: () => void;
  confirm_spam: () => Promise<void>;
  show_empty_spam_dialog: boolean;
  is_emptying_spam: boolean;
  cancel_empty_spam: () => void;
  confirm_empty_spam: () => Promise<void>;
  spam_count: number;
  show_empty_trash_dialog: boolean;
  is_emptying_trash: boolean;
  cancel_empty_trash: () => void;
  confirm_empty_trash: () => Promise<void>;
  trash_count: number;
  custom_snooze_open: boolean;
  on_custom_snooze_close: () => void;
  on_custom_snooze: (snooze_until: Date) => Promise<void>;
}

export function InboxDialogs({
  current_view,
  confirmations,
  dont_ask_delete,
  set_dont_ask_delete,
  dont_ask_archive,
  set_dont_ask_archive,
  dont_ask_spam,
  set_dont_ask_spam,
  cancel_delete,
  confirm_delete,
  cancel_archive,
  confirm_archive,
  cancel_single_delete,
  confirm_single_delete,
  show_single_delete_confirm,
  dont_ask_single_delete,
  set_dont_ask_single_delete,
  cancel_single_spam,
  confirm_single_spam,
  show_single_spam_confirm,
  dont_ask_single_spam,
  set_dont_ask_single_spam,
  cancel_single_archive,
  confirm_single_archive,
  show_single_archive_confirm,
  dont_ask_single_archive,
  set_dont_ask_single_archive,
  cancel_spam,
  confirm_spam,
  show_empty_spam_dialog,
  is_emptying_spam,
  cancel_empty_spam,
  confirm_empty_spam,
  spam_count,
  show_empty_trash_dialog,
  is_emptying_trash,
  cancel_empty_trash,
  confirm_empty_trash,
  trash_count,
  custom_snooze_open,
  on_custom_snooze_close,
  on_custom_snooze,
}: InboxDialogsProps) {
  const { t } = use_i18n();

  return (
    <>
      <ConfirmModal
        confirm_text={t("common.delete")}
        confirm_variant="destructive"
        description={t("mail.delete_messages_confirmation")}
        dont_ask={dont_ask_delete}
        on_cancel={cancel_delete}
        on_confirm={confirm_delete}
        on_dont_ask_change={set_dont_ask_delete}
        show={confirmations.show_delete}
        title={t("mail.delete_messages_title")}
      />
      <ConfirmModal
        confirm_text={t("mail.archive")}
        confirm_variant="default"
        description={t("mail.archive_messages_confirmation")}
        dont_ask={dont_ask_archive}
        on_cancel={cancel_archive}
        on_confirm={confirm_archive}
        on_dont_ask_change={set_dont_ask_archive}
        show={confirmations.show_archive}
        title={t("mail.archive_messages_title")}
      />
      <ConfirmModal
        confirm_text={
          current_view === "trash" || current_view === "drafts"
            ? t("mail.delete_permanently")
            : t("mail.move_to_trash")
        }
        confirm_variant="destructive"
        description={
          current_view === "trash" || current_view === "drafts"
            ? t("mail.delete_email_confirmation")
            : t("mail.trash_email_message")
        }
        dont_ask={dont_ask_single_delete}
        on_cancel={cancel_single_delete}
        on_confirm={confirm_single_delete}
        on_dont_ask_change={set_dont_ask_single_delete}
        show={show_single_delete_confirm}
        title={
          current_view === "trash" || current_view === "drafts"
            ? t("mail.delete_permanently_question")
            : t("mail.move_to_trash_question")
        }
      />
      <ConfirmModal
        confirm_text={t("mail.mark_spam_title")}
        confirm_variant="destructive"
        description={t("mail.spam_email_message")}
        dont_ask={dont_ask_single_spam}
        on_cancel={cancel_single_spam}
        on_confirm={confirm_single_spam}
        on_dont_ask_change={set_dont_ask_single_spam}
        show={show_single_spam_confirm}
        title={t("mail.mark_spam_title")}
      />
      <ConfirmModal
        confirm_text={t("mail.archive")}
        confirm_variant="default"
        description={t("mail.archive_email_message")}
        dont_ask={dont_ask_single_archive}
        on_cancel={cancel_single_archive}
        on_confirm={confirm_single_archive}
        on_dont_ask_change={set_dont_ask_single_archive}
        show={show_single_archive_confirm}
        title={t("mail.archive_email_title")}
      />
      <ConfirmModal
        confirm_text={t("mail.mark_spam_title")}
        confirm_variant="destructive"
        description={t("mail.mark_spam_confirmation")}
        dont_ask={dont_ask_spam}
        on_cancel={cancel_spam}
        on_confirm={confirm_spam}
        on_dont_ask_change={set_dont_ask_spam}
        show={confirmations.show_spam}
        title={t("mail.mark_spam_title")}
      />

      <AlertDialog
        open={show_empty_spam_dialog}
        onOpenChange={(open) => !open && cancel_empty_spam()}
      >
        <AlertDialogContent
          className="gap-0 p-0 overflow-hidden max-w-[380px]"
          on_overlay_click={cancel_empty_spam}
        >
          <div className="px-6 pt-6 pb-5">
            <AlertDialogHeader className="space-y-2">
              <AlertDialogTitle className="text-16 font-semibold">
                {t("mail.empty_spam_folder_question")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-14 leading-normal">
                {t("mail.empty_spam_description", {
                  count: spam_count,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
            <AlertDialogCancel asChild>
              <Button
                className="mt-0 max-sm:flex-1"
                disabled={is_emptying_spam}
                size="xl"
                variant="outline"
              >
                {t("common.cancel")}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                className="max-sm:flex-1"
                disabled={is_emptying_spam}
                size="xl"
                variant="destructive"
                onClick={confirm_empty_spam}
              >
                {is_emptying_spam ? t("common.deleting") : t("mail.delete_all")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmptyTrashModal
        is_emptying={is_emptying_trash}
        on_cancel={cancel_empty_trash}
        on_confirm={confirm_empty_trash}
        show={show_empty_trash_dialog}
        trash_count={trash_count}
      />
      <CustomSnoozeModal
        is_open={custom_snooze_open}
        on_close={on_custom_snooze_close}
        on_snooze={on_custom_snooze}
      />
    </>
  );
}
