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
import { useCallback, useState } from "react";

import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { use_i18n } from "@/lib/i18n/context";
import { block_sender } from "@/services/api/blocked_senders";
import { show_toast } from "@/components/toast/simple_toast";

export interface BlockSenderTarget {
  sender_email: string;
  sender_name?: string;
}

interface BlockSenderConfirmResult {
  request_block_sender: (target: BlockSenderTarget) => void;
  block_sender_dialog: React.ReactElement;
}

export function use_block_sender_confirm(): BlockSenderConfirmResult {
  const { t } = use_i18n();
  const [target, set_target] = useState<BlockSenderTarget | null>(null);

  const request_block_sender = useCallback((next: BlockSenderTarget) => {
    if (next.sender_email) set_target(next);
  }, []);

  const handle_cancel = useCallback(() => set_target(null), []);

  const handle_confirm = useCallback(async () => {
    const current = target;

    set_target(null);
    if (!current) return;

    const result = await block_sender(
      current.sender_email,
      current.sender_name,
    );

    if (result.data) {
      show_toast(t("common.sender_blocked"), "success");
    } else {
      show_toast(t("errors.failed_to_block_sender"), "error");
    }
  }, [target, t]);

  const block_sender_dialog = (
    <ConfirmModal
      hide_dont_ask
      confirm_text={t("mail.block_sender")}
      confirm_variant="destructive"
      description={t("mail.block_sender_spam_warning")}
      dont_ask={false}
      on_cancel={handle_cancel}
      on_confirm={() => void handle_confirm()}
      on_dont_ask_change={() => undefined}
      show={target !== null}
      title={t("mail.block_sender")}
    />
  );

  return { request_block_sender, block_sender_dialog };
}
