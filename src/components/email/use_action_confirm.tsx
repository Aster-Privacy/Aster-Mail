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
import { use_preferences } from "@/contexts/preferences_context";

type ActionPreference = "confirm_before_delete" | "confirm_before_archive";

interface ActionConfirmResult {
  request: (perform: () => void | Promise<void>) => void;
  dialog: React.ReactElement;
}

function use_action_confirm(
  preference_key: ActionPreference,
  title_key: "mail.move_to_trash_question" | "mail.archive_email_question",
  message_key: "mail.trash_email_message" | "mail.archive_email_message",
  confirm_key: "mail.move_to_trash" | "mail.archive",
  confirm_variant: "destructive" | "default",
): ActionConfirmResult {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [is_open, set_is_open] = useState(false);
  const [dont_ask, set_dont_ask] = useState(false);
  const pending_ref = useRef<(() => void | Promise<void>) | null>(null);
  const is_enabled = preferences[preference_key];

  const request = useCallback(
    (perform: () => void | Promise<void>) => {
      if (!is_enabled) {
        void perform();

        return;
      }

      pending_ref.current = perform;
      set_dont_ask(false);
      set_is_open(true);
    },
    [is_enabled],
  );

  const handle_confirm = useCallback(() => {
    const perform = pending_ref.current;

    pending_ref.current = null;
    set_is_open(false);

    if (dont_ask) {
      update_preference(preference_key, false, true);
    }

    set_dont_ask(false);

    if (perform) void perform();
  }, [dont_ask, preference_key, update_preference]);

  const handle_cancel = useCallback(() => {
    pending_ref.current = null;
    set_is_open(false);
    set_dont_ask(false);
  }, []);

  const dialog = (
    <ConfirmModal
      confirm_text={t(confirm_key)}
      confirm_variant={confirm_variant}
      description={t(message_key)}
      dont_ask={dont_ask}
      on_cancel={handle_cancel}
      on_confirm={handle_confirm}
      on_dont_ask_change={set_dont_ask}
      show={is_open}
      title={t(title_key)}
    />
  );

  return { request, dialog };
}

export function use_delete_confirm() {
  const { request, dialog } = use_action_confirm(
    "confirm_before_delete",
    "mail.move_to_trash_question",
    "mail.trash_email_message",
    "mail.move_to_trash",
    "destructive",
  );

  return { request_delete: request, delete_confirm_dialog: dialog };
}

export function use_archive_confirm() {
  const { request, dialog } = use_action_confirm(
    "confirm_before_archive",
    "mail.archive_email_question",
    "mail.archive_email_message",
    "mail.archive",
    "default",
  );

  return { request_archive: request, archive_confirm_dialog: dialog };
}
