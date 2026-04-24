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

import { use_undo_send } from "@/hooks/use_undo_send";
import { undo_send_manager as server_undo_manager } from "@/services/undo_send_manager";
import { is_mac_platform } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { show_action_toast } from "@/components/toast/action_toast";
import { dispatch_undo_send_preview } from "@/components/toast/undo_send_preview_modal";

interface UndoSendContainerProps {
  position?: string;
  max_visible?: number;
  is_mobile?: boolean;
}

export function UndoSendContainer({
  position: _position,
  max_visible: _max_visible,
  is_mobile: _is_mobile,
}: UndoSendContainerProps) {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const { pending_sends, cancel_send, get_time_remaining } = use_undo_send();

  const is_mac = useMemo(() => is_mac_platform(), []);
  const shown_ids_ref = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (is_authenticated) {
      server_undo_manager.sync_with_server().catch(() => {});
      server_undo_manager.start_polling();

      return () => {
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
        !event.shiftKey
      ) {
        if (pending_sends.length > 0) {
          event.preventDefault();
          const most_recent = pending_sends[pending_sends.length - 1];

          cancel_send(most_recent.id);
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
        email_ids: [],
        duration_ms: remaining * 1000,
        on_undo: async () => {
          cancel_send(pending_data.id);
        },
        on_view_message: () => {
          dispatch_undo_send_preview({
            subject: pending_data.subject,
            body: pending_data.body,
            to: pending_data.to,
            cc: pending_data.cc,
            bcc: pending_data.bcc,
          });
        },
      });
    }

    const current_ids = new Set(pending_sends.map((p) => p.id));

    for (const id of shown_ids_ref.current) {
      if (!current_ids.has(id)) {
        shown_ids_ref.current.delete(id);
      }
    }
  }, [pending_sends, cancel_send, get_time_remaining, t]);

  return null;
}
