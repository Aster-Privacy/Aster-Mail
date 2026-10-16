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
import type { TranslationKey } from "@/lib/i18n";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import { emit_mail_item_updated } from "@/hooks/mail_events";
import { adjust_stats_starred } from "@/hooks/use_mail_stats";
import { update_item_metadata } from "@/services/crypto/mail_metadata";

export async function toggle_viewer_star(
  email_id: string,
  is_starred: boolean,
  t: (key: TranslationKey) => string,
): Promise<void> {
  const new_state = !is_starred;

  emit_mail_item_updated({ id: email_id, is_starred: new_state });
  adjust_stats_starred(new_state ? 1 : -1);

  const result = await update_item_metadata(
    email_id,
    {},
    { is_starred: new_state },
  );

  if (!result.success) {
    emit_mail_item_updated({ id: email_id, is_starred: is_starred });
    adjust_stats_starred(new_state ? -1 : 1);
    show_toast(t("common.failed_to_update"), "error");

    return;
  }

  emit_mail_item_updated({
    id: email_id,
    is_starred: new_state,
    encrypted_metadata: result.encrypted?.encrypted_metadata,
    metadata_nonce: result.encrypted?.metadata_nonce,
  });
  show_action_toast({
    message: new_state
      ? t("common.starred_toast")
      : t("common.unstarred_toast"),
    action_type: "star",
    email_ids: [email_id],
    on_undo: async () => {
      adjust_stats_starred(new_state ? -1 : 1);
      const undo_result = await update_item_metadata(
        email_id,
        {
          encrypted_metadata: result.encrypted?.encrypted_metadata,
          metadata_nonce: result.encrypted?.metadata_nonce,
        },
        { is_starred },
      );

      if (!undo_result.success) {
        adjust_stats_starred(new_state ? 1 : -1);
        throw new Error("undo star failed");
      }

      emit_mail_item_updated({
        id: email_id,
        is_starred,
        encrypted_metadata: undo_result.encrypted?.encrypted_metadata,
        metadata_nonce: undo_result.encrypted?.metadata_nonce,
      });
    },
  });
}
