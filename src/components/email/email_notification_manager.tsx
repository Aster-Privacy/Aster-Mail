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
import { useEffect, useRef } from "react";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import {
  request_notification_permission,
  show_notification,
} from "@/services/notification_service";
import { subscribe_to_push } from "@/services/push_subscription";
import { use_i18n } from "@/lib/i18n/context";
import { is_lockdown_enabled } from "@/services/lockdown_store";

function is_tauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const EMAIL_RECEIVED_BURST_WINDOW_MS = 8000;
const EMAIL_RECEIVED_BURST_THRESHOLD = 4;

export function EmailNotificationManager() {
  const { is_authenticated, current_account_id } = use_auth();
  const { preferences } = use_preferences();
  const { t } = use_i18n();

  useEffect(() => {
    if (!is_authenticated || !preferences.desktop_notifications) {
      return;
    }

    if (is_tauri()) {
      request_notification_permission();
    }

    let cancelled = false;
    (async () => {
      if (!preferences.low_network_mode) {
        await subscribe_to_push();
        if (cancelled) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    is_authenticated,
    preferences.desktop_notifications,
    preferences.low_network_mode,
  ]);

  const burst_state = useRef({ window_start: 0, count: 0 });

  useEffect(() => {
    if (!is_authenticated) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const email_id = detail?.email_id || "";
      const now = Date.now();
      const state = burst_state.current;

      if (now - state.window_start > EMAIL_RECEIVED_BURST_WINDOW_MS) {
        state.window_start = now;
        state.count = 0;
      }
      state.count += 1;

      if (state.count <= EMAIL_RECEIVED_BURST_THRESHOLD) {
        show_notification(
          "new_email",
          {
            title: t("common.aster_mail"),
            body: t("common.new_email_body"),
            tag: `email-${email_id}`,
            data: email_id ? { email_id } : undefined,
          },
          preferences,
          is_lockdown_enabled(current_account_id ?? ""),
        );

        return;
      }

      show_notification(
        "new_email",
        {
          title: t("common.aster_mail"),
          body: t("common.new_emails_burst_body").replace(
            "{{count}}",
            String(state.count),
          ),
          tag: "email-burst",
        },
        preferences,
        is_lockdown_enabled(current_account_id ?? ""),
        state.count === EMAIL_RECEIVED_BURST_THRESHOLD + 1,
      );
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);

    return () => {
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);
    };
  }, [is_authenticated, preferences, t, current_account_id]);

  return null;
}
