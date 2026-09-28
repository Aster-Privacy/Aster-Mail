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
import type { UndoSendEvent } from "@/hooks/use_undo_send";
import type {
  ComposeHost,
  MessageViewHost,
} from "@/components/toast/toast_action_router";

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import {
  register_compose_host,
  register_message_view_host,
  register_toast_navigator,
  restore_undone_send_draft,
  undone_send_is_restored_by_host,
} from "@/components/toast/toast_action_router";
import {
  draft_from_undone_send,
  undone_send_has_content,
} from "@/components/toast/undone_send_draft";
import { show_toast } from "@/components/toast/simple_toast";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import { use_i18n } from "@/lib/i18n/context";

export function use_message_view_host(host: MessageViewHost): void {
  const host_ref = useRef(host);

  host_ref.current = host;

  const can_show_message = host.can_show_message();
  const can_show_preview = host.can_show_preview();

  useEffect(() => {
    return register_message_view_host({
      can_show_message: () => host_ref.current.can_show_message(),
      can_show_preview: () => host_ref.current.can_show_preview(),
      show_message: (email_id) => host_ref.current.show_message(email_id),
      show_preview: (data) => host_ref.current.show_preview(data),
      go_to_list: (route) => host_ref.current.go_to_list(route),
    });
  }, [can_show_message, can_show_preview]);
}

export function use_compose_host(host: ComposeHost): void {
  const host_ref = useRef(host);

  host_ref.current = host;

  const restores_undone_sends = host.restores_undone_sends;

  useEffect(() => {
    return register_compose_host({
      restores_undone_sends,
      open_draft: (draft) => host_ref.current.open_draft(draft),
    });
  }, [restores_undone_sends]);
}

interface ToastActionBridgeOptions {
  is_mobile_app: boolean;
}

export function use_toast_action_bridge({
  is_mobile_app,
}: ToastActionBridgeOptions): void {
  const navigate = useNavigate();
  const { t } = use_i18n();
  const navigate_ref = useRef(navigate);

  navigate_ref.current = navigate;

  useEffect(() => {
    return register_toast_navigator({
      navigate: (path, options) => {
        void navigate_ref.current(path, options);
      },
      is_mobile_app,
      prefers_full_page: is_mobile_app,
    });
  }, [is_mobile_app]);

  useEffect(() => {
    if (is_mobile_app) return;

    const handle_undo_send = (event: Event) => {
      const { pending, payload } = (event as CustomEvent<UndoSendEvent>).detail;

      if (!pending) return;
      if (undone_send_is_restored_by_host()) return;

      if (!undone_send_has_content(pending, payload)) {
        show_toast(t("common.scheduled_email_cancelled"));

        return;
      }

      restore_undone_send_draft(draft_from_undone_send(pending, payload));
    };

    window.addEventListener(MAIL_EVENTS.UNDO_SEND, handle_undo_send);

    return () =>
      window.removeEventListener(MAIL_EVENTS.UNDO_SEND, handle_undo_send);
  }, [is_mobile_app, t]);
}
