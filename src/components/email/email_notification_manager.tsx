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
import { useEffect } from "react";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { MAIL_EVENTS } from "@/hooks/mail_events";
import { show_notification } from "@/services/notification_service";
import { subscribe_to_push } from "@/services/push_subscription";
import { use_i18n } from "@/lib/i18n/context";

export function EmailNotificationManager() {
  const { is_authenticated } = use_auth();
  const { preferences } = use_preferences();
  const { t } = use_i18n();

  useEffect(() => {
    if (!is_authenticated || !preferences.desktop_notifications) return;

    subscribe_to_push();
  }, [is_authenticated, preferences.desktop_notifications]);

  useEffect(() => {
    if (!is_authenticated) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const email_id = detail?.email_id || "";

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
