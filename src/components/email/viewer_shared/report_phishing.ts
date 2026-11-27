//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type { TranslationKey } from "@/lib/i18n/types";
import type { SpamReportReceipt } from "@/services/api/mail_threads";

import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  emit_mail_changed,
  emit_mail_item_updated,
  emit_mail_items_removed,
  emit_mail_soft_refresh,
} from "@/hooks/mail_events";
import { report_spam_sender, retract_spam_report } from "@/services/api/mail";
import { reindex_ids } from "@/services/category_index";

async function send_phishing_report(
  sender_email: string | undefined,
): Promise<SpamReportReceipt | null> {
  if (!sender_email) return null;

  try {
    const response = await report_spam_sender(sender_email);

    return response.data ?? null;
  } catch {
    return null;
  }
}

export async function report_phishing_with_undo(
  msg: DecryptedThreadMessage,
  t: (key: TranslationKey) => string,
): Promise<boolean> {
  const previous = {
    is_spam: msg.is_spam ?? false,
    is_trashed: msg.is_trashed ?? false,
  };
  const result = await update_item_metadata(
    msg.id,
    {
      encrypted_metadata: msg.encrypted_metadata,
      metadata_nonce: msg.metadata_nonce,
    },
    { is_spam: true, is_trashed: false },
  );

  if (!result.success) {
    show_toast(t("common.failed_to_mark_as_spam"), "error");

    return false;
  }

  emit_mail_items_removed({ ids: [msg.id] });
  emit_mail_changed();

  const report = send_phishing_report(msg.sender_email);
  let folder_restored = false;
  let report_retracted = false;
  const undo_failed = {
    message: t("common.undo_failed"),
    tone: "error" as const,
    keep_undo: true,
  };

  show_action_toast({
    message: t("common.reported_as_phishing"),
    action_type: "spam",
    email_ids: [msg.id],
    on_undo: async () => {
      if (!folder_restored) {
        const undo_result = await update_item_metadata(
          msg.id,
          {
            encrypted_metadata: result.encrypted?.encrypted_metadata,
            metadata_nonce: result.encrypted?.metadata_nonce,
          },
          previous,
        );

        if (!undo_result.success) {
          return undo_failed;
        }
        folder_restored = true;
        reindex_ids([msg.id]);
        emit_mail_item_updated({ id: msg.id, ...previous });
        emit_mail_soft_refresh();
      }

      if (!report_retracted) {
        const receipt = await report;

        if (receipt?.sender_entry_id || receipt?.feedback_id) {
          const retracted = await retract_spam_report(receipt).catch(
            () => null,
          );

          if (!retracted?.data?.success) {
            return undo_failed;
          }
        }
        report_retracted = true;
      }
    },
  });

  return true;
}
