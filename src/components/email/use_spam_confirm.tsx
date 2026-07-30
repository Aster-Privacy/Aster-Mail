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

interface SpamConfirmResult {
  request_spam: (perform: () => void | Promise<void>) => void;
  spam_confirm_dialog: React.ReactElement | null;
}

export function use_spam_confirm(): SpamConfirmResult {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [is_open, set_is_open] = useState(false);
  const [dont_ask, set_dont_ask] = useState(false);
  const pending_ref = useRef<(() => void | Promise<void>) | null>(null);

  const request_spam = useCallback(
    (perform: () => void | Promise<void>) => {
      if (!preferences.confirm_before_spam) {
        void perform();

        return;
      }

      pending_ref.current = perform;
      set_dont_ask(false);
      set_is_open(true);
    },
    [preferences.confirm_before_spam],
  );

  const handle_confirm = useCallback(() => {
    const perform = pending_ref.current;

    pending_ref.current = null;
    set_is_open(false);

    if (dont_ask) {
      update_preference("confirm_before_spam", false, true);
    }

    set_dont_ask(false);

    if (perform) void perform();
  }, [dont_ask, update_preference]);

  const handle_cancel = useCallback(() => {
    pending_ref.current = null;
    set_is_open(false);
    set_dont_ask(false);
  }, []);

  const spam_confirm_dialog = (
    <ConfirmModal
      confirm_text={t("mail.mark_spam_title")}
      confirm_variant="destructive"
      description={t("mail.spam_email_message")}
      dont_ask={dont_ask}
      on_cancel={handle_cancel}
      on_confirm={handle_confirm}
      on_dont_ask_change={set_dont_ask}
      show={is_open}
      title={t("mail.mark_spam_title")}
    />
  );

  return { request_spam, spam_confirm_dialog };
}
