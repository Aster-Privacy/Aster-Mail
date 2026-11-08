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
import { useCallback, useRef, useState } from "react";

import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { use_i18n } from "@/lib/i18n/context";
import {
  is_mail_item_in_trash,
  is_thread_message_in_trash,
  type TrashPlacementItem,
  type TrashPlacementMessage,
} from "@/components/email/viewer_shared/trash_placement";

type PermanentDeletePerform = () => unknown;

export interface PermanentDeleteConfirmResult {
  request_permanent_delete: (perform: PermanentDeletePerform) => void;
  permanent_delete_dialog: React.ReactElement;
}

export function use_permanent_delete_confirm(): PermanentDeleteConfirmResult {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const pending_ref = useRef<PermanentDeletePerform | null>(null);

  const request_permanent_delete = useCallback(
    (perform: PermanentDeletePerform) => {
      pending_ref.current = perform;
      set_is_open(true);
    },
    [],
  );

  const handle_confirm = useCallback(() => {
    const perform = pending_ref.current;

    pending_ref.current = null;
    set_is_open(false);

    if (perform) void perform();
  }, []);

  const handle_cancel = useCallback(() => {
    pending_ref.current = null;
    set_is_open(false);
  }, []);

  const permanent_delete_dialog = (
    <ConfirmModal
      hide_dont_ask
      confirm_text={t("mail.delete_permanently")}
      confirm_variant="destructive"
      description={t("mail.delete_email_confirmation")}
      dont_ask={false}
      on_cancel={handle_cancel}
      on_confirm={handle_confirm}
      on_dont_ask_change={() => {}}
      show={is_open}
      title={t("mail.delete_permanently_question")}
    />
  );

  return { request_permanent_delete, permanent_delete_dialog };
}

interface GuardedTrashOptions<TMessage extends TrashPlacementMessage> {
  email_id: string | null | undefined;
  mail_item: TrashPlacementItem | null | undefined;
  handle_trash: () => unknown;
  handle_per_message_trash: (message: TMessage) => unknown;
}

export interface GuardedTrashActions<TMessage extends TrashPlacementMessage> {
  handle_trash: () => Promise<void>;
  handle_per_message_trash: (message: TMessage) => Promise<void>;
  permanent_delete_dialog: React.ReactElement;
}

export function use_guarded_trash_actions<
  TMessage extends TrashPlacementMessage,
>({
  email_id,
  mail_item,
  handle_trash,
  handle_per_message_trash,
}: GuardedTrashOptions<TMessage>): GuardedTrashActions<TMessage> {
  const { request_permanent_delete, permanent_delete_dialog } =
    use_permanent_delete_confirm();

  const guarded_trash = useCallback(async () => {
    if (is_mail_item_in_trash(mail_item)) {
      request_permanent_delete(handle_trash);

      return;
    }

    await handle_trash();
  }, [mail_item, handle_trash, request_permanent_delete]);

  const guarded_per_message_trash = useCallback(
    async (message: TMessage) => {
      if (is_thread_message_in_trash(message, email_id, mail_item)) {
        request_permanent_delete(() => handle_per_message_trash(message));

        return;
      }

      await handle_per_message_trash(message);
    },
    [email_id, mail_item, handle_per_message_trash, request_permanent_delete],
  );

  return {
    handle_trash: guarded_trash,
    handle_per_message_trash: guarded_per_message_trash,
    permanent_delete_dialog,
  };
}
