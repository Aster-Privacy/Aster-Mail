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
import type { UnsubscribeInfo } from "@/types/email";

import { useCallback, useEffect, useRef, useState } from "react";

import { show_action_toast } from "@/components/toast/action_toast";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import {
  execute_unsubscribe,
  get_manual_unsubscribe_url,
} from "@/utils/unsubscribe_detector";
import { open_external } from "@/utils/open_link";
import { persist_unsubscribe } from "@/hooks/use_unsubscribed_senders";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { get_undo_send_delay_ms } from "@/services/send_queue";

interface UseUnsubscribeActionOptions {
  unsubscribe_info: UnsubscribeInfo;
  sender_email: string;
  sender_name: string;
  on_unsubscribed?: () => void;
}

export function use_unsubscribe_action({
  unsubscribe_info,
  sender_email,
  sender_name,
  on_unsubscribed,
}: UseUnsubscribeActionOptions) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const [is_pending, set_is_pending] = useState(false);
  const pending_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cancelled_ref = useRef(false);
  const mounted_ref = useRef(true);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const unsubscribe = useCallback(() => {
    if (pending_timeout_ref.current) return;

    const record_unsubscribed = () =>
      persist_unsubscribe(
        sender_email,
        sender_name,
        {
          unsubscribe_link: unsubscribe_info.unsubscribe_link,
          list_unsubscribe_header: unsubscribe_info.list_unsubscribe_header,
        },
        "manual",
      );

    cancelled_ref.current = false;
    set_is_pending(true);

    const delay_ms = get_undo_send_delay_ms(
      preferences.undo_send_enabled,
      preferences.undo_send_seconds,
      preferences.undo_send_period,
    );

    if (delay_ms > 0) {
      show_action_toast({
        message: t("settings.unsubscribing"),
        action_type: "not_spam",
        email_ids: [],
        duration_ms: delay_ms,
        on_undo: async () => {
          cancelled_ref.current = true;
          if (pending_timeout_ref.current) {
            clearTimeout(pending_timeout_ref.current);
            pending_timeout_ref.current = null;
          }
          if (mounted_ref.current) set_is_pending(false);
        },
      });
    }

    pending_timeout_ref.current = setTimeout(async () => {
      pending_timeout_ref.current = null;
      if (cancelled_ref.current) return;

      try {
        const result = await execute_unsubscribe(unsubscribe_info);

        if (result === "api") {
          record_unsubscribed();
          on_unsubscribed?.();
          show_action_toast({
            message: t("mail.successfully_unsubscribed"),
            action_type: "not_spam",
            email_ids: [],
          });
        } else {
          const url = get_manual_unsubscribe_url(unsubscribe_info);
          const lockdown = is_any_lockdown_active();

          show_action_toast({
            message: t("mail.unsubscribe_manual_required"),
            action_type: "not_spam",
            email_ids: [],
            duration_ms: 15000,
            ...(!lockdown &&
              url && {
                action_label: t("mail.open_unsubscribe_page"),
                on_undo: async () => {
                  open_external(url);
                  record_unsubscribed();
                  on_unsubscribed?.();
                },
              }),
          });
          if (mounted_ref.current && (lockdown || !url)) {
            set_is_pending(false);
          }
        }
      } catch {
        if (mounted_ref.current) set_is_pending(false);
        show_action_toast({
          message: t("mail.unsubscribe_failed"),
          action_type: "not_spam",
          email_ids: [],
        });
      }
    }, delay_ms);
  }, [
    unsubscribe_info,
    sender_email,
    sender_name,
    preferences.undo_send_enabled,
    preferences.undo_send_seconds,
    preferences.undo_send_period,
    on_unsubscribed,
    t,
  ]);

  return { unsubscribe, is_pending };
}
