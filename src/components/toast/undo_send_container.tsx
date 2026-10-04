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
import { useEffect, useMemo, useRef } from "react";

import {
  handle_restored_send_settled,
  settle_restored_sends_missing_from_server,
  take_interrupted_tab_sends,
  next_interrupted_tab_send_check_ms,
  use_undo_send,
} from "@/hooks/use_undo_send";
import { is_typing } from "@/hooks/use_keyboard_shortcuts";
import { undo_send_manager as server_undo_manager } from "@/services/undo_send_manager";
import { is_mac_platform } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { show_action_toast } from "@/components/toast/action_toast";
import {
  can_preview_pending_send,
  open_pending_send_preview,
} from "@/components/toast/toast_action_router";
import { use_toast_action_bridge } from "@/components/toast/use_toast_action_hosts";
import { ignore_error } from "@/lib/ignore_error";
import { show_toast } from "@/components/toast/simple_toast";
import { get_active_translations } from "@/lib/i18n/translations";

interface UndoSendContainerProps {
  position?: string;
  max_visible?: number;
  is_mobile?: boolean;
}

export function UndoSendContainer({
  position: _position,
  max_visible: _max_visible,
  is_mobile = false,
}: UndoSendContainerProps) {
  const { t } = use_i18n();

  use_toast_action_bridge({ is_mobile_app: is_mobile });

  const { is_authenticated } = use_auth();
  const { pending_sends, cancel_send, get_time_remaining } = use_undo_send();

  const is_mac = useMemo(() => is_mac_platform(), []);
  const shown_ids_ref = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (is_authenticated) {
      const stop_restored_listener =
        server_undo_manager.on_restored_send_settled(
          handle_restored_send_settled,
        );

      server_undo_manager
        .sync_with_server()
        .then((synced) => {
          if (synced) settle_restored_sends_missing_from_server();
        })
        .catch((caught) =>
          ignore_error(
            "components/toast/undo_send_container:UndoSendContainer",
            caught,
          ),
        );

      const report_interrupted_sends = () => {
        if (take_interrupted_tab_sends() > 0) {
          show_toast(
            get_active_translations().common.failed_to_send_email,
            "error",
          );
        }
      };

      report_interrupted_sends();
      const recheck_ms = next_interrupted_tab_send_check_ms();
      const recheck_timer =
        recheck_ms === null
          ? null
          : window.setTimeout(report_interrupted_sends, recheck_ms);

      return () => {
        if (recheck_timer !== null) window.clearTimeout(recheck_timer);
        stop_restored_listener();
        server_undo_manager.stop_polling();
      };
    }
  }, [is_authenticated]);

  useEffect(() => {
    const handle_keydown = (event: KeyboardEvent) => {
      const modifier_pressed = is_mac ? event.metaKey : event.ctrlKey;

      if (
        modifier_pressed &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey &&
        !is_typing()
      ) {
        if (pending_sends.length > 0) {
          event.preventDefault();
          const most_recent = pending_sends[pending_sends.length - 1];

          void cancel_send(most_recent.id);
        }
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [pending_sends, cancel_send, is_mac]);

  useEffect(() => {
    for (const pending of pending_sends) {
      if (shown_ids_ref.current.has(pending.id)) continue;
      shown_ids_ref.current.add(pending.id);

      const remaining = get_time_remaining(pending.id);

      const pending_data = pending;

      show_action_toast({
        message: t("common.email_sent"),
        action_type: "archive",
        sound: "none",
        email_ids: [],
        duration_ms: remaining * 1000,
        on_undo: async () => {
          const cancelled = await cancel_send(pending_data.id);

          if (!cancelled) {
            throw new Error("undo_send_cancel_rejected");
          }
        },
        on_view_message:
          pending_data.body && !is_mobile && can_preview_pending_send()
            ? () => {
                open_pending_send_preview({
                  subject: pending_data.subject,
                  body: pending_data.body,
                  to: pending_data.to,
                  cc: pending_data.cc,
                  bcc: pending_data.bcc,
                  sender_email: pending_data.sender_email,
                });
              }
            : undefined,
      });
    }

    const current_ids = new Set(pending_sends.map((p) => p.id));

    for (const id of shown_ids_ref.current) {
      if (!current_ids.has(id)) {
        shown_ids_ref.current.delete(id);
      }
    }
  }, [pending_sends, cancel_send, get_time_remaining, t, is_mobile]);

  return null;
}
