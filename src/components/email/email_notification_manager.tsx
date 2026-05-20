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
  play_notification_sound,
  show_notification,
} from "@/services/notification_service";
import {
  is_push_subscribed,
  subscribe_to_push,
} from "@/services/push_subscription";
import { use_i18n } from "@/lib/i18n/context";

function is_tauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function EmailNotificationManager() {
  const { is_authenticated } = use_auth();
  const { preferences } = use_preferences();
  const { t } = use_i18n();
  const push_subscribed_ref = useRef<boolean>(false);

  useEffect(() => {
    if (!is_authenticated || !preferences.desktop_notifications) {
      push_subscribed_ref.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      const ok = await subscribe_to_push();
      if (cancelled) return;
      push_subscribed_ref.current = ok && (await is_push_subscribed());
    })();

    return () => {
      cancelled = true;
    };
  }, [is_authenticated, preferences.desktop_notifications]);

  useEffect(() => {
    if (!is_authenticated) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const email_id = detail?.email_id || "";

      if (push_subscribed_ref.current && !is_tauri()) {
        if (preferences.sound) {
          play_notification_sound();
        }
        return;
      }

      show_notification(
        "new_email",
        {
          title: t("common.aster_mail"),
          body: t("common.new_email_body"),
          tag: `email-${email_id}`,
          data: email_id ? { email_id } : undefined,
        },
        preferences,
      );
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);

    return () => {
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);
    };
  }, [is_authenticated, preferences, t]);

  return null;
}
