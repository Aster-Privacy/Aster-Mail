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
import type { NotificationType } from "@/services/notification_service";
import {
  get_arrival_category,
  get_arrival_reply_state,
} from "@/services/category_index";
import { category_for_tab } from "@/services/mail_categorizer";
import { subscribe_to_push } from "@/services/push_subscription";
import { use_i18n } from "@/lib/i18n/context";
import { is_lockdown_enabled } from "@/services/lockdown_store";
import { get_mail_item_folders } from "@/services/api/mail";
import {
  get_locked_folder_tokens,
  has_protected_folders,
} from "@/services/locked_folders";

const REPLY_STATE_TIMEOUT_MS = 1500;
const REPLY_STATE_POLL_MS = 150;
const CATEGORY_TIMEOUT_MS = 1500;
const CATEGORY_POLL_MS = 150;

async function resolve_arrival_type(
  email_id: string,
  notify_new_email: boolean,
): Promise<NotificationType> {
  const deadline = Date.now() + REPLY_STATE_TIMEOUT_MS;

  for (;;) {
    const state = get_arrival_reply_state(email_id);

    if (state !== null) return state ? "reply" : "new_email";
    if (Date.now() >= deadline) break;

    await new Promise((resolve) => setTimeout(resolve, REPLY_STATE_POLL_MS));
  }

  return notify_new_email ? "new_email" : "reply";
}

async function is_category_muted(
  email_id: string,
  muted_categories: string[],
): Promise<boolean> {
  if (!email_id || muted_categories.length === 0) {
    return false;
  }

  const muted = new Set(muted_categories);
  const deadline = Date.now() + CATEGORY_TIMEOUT_MS;

  for (;;) {
    const category = get_arrival_category(email_id);

    if (category !== null) {
      return muted.has(category_for_tab(category));
    }
    if (Date.now() >= deadline) return false;

    await new Promise((resolve) => setTimeout(resolve, CATEGORY_POLL_MS));
  }
}

async function is_email_notification_suppressed(
  email_id: string,
  muted_folder_tokens: string[],
): Promise<boolean> {
  const locked_tokens = has_protected_folders()
    ? get_locked_folder_tokens()
    : new Set<string>();

  if (!email_id) {
    return false;
  }

  if (muted_folder_tokens.length === 0 && locked_tokens.size === 0) {
    return false;
  }

  try {
    const response = await get_mail_item_folders(email_id);
    const folder_tokens = response.data?.labels;

    if (!folder_tokens || folder_tokens.length === 0) {
      return false;
    }

    const muted = new Set(muted_folder_tokens);

    return folder_tokens.some(
      (token) => muted.has(token) || locked_tokens.has(token),
    );
  } catch {
    return false;
  }
}

function is_tauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const NOTIFIED_TTL_MS = 6 * 60 * 60 * 1000;
const NOTIFIED_MAX_ENTRIES = 1000;
const UNKNOWN_ID_DEBOUNCE_MS = 5000;
const notified_at_by_email_id = new Map<string, number>();

function claim_notification(email_id: string): boolean {
  const now = Date.now();
  const key = email_id || "__unknown__";
  const window_ms = email_id ? NOTIFIED_TTL_MS : UNKNOWN_ID_DEBOUNCE_MS;
  const last = notified_at_by_email_id.get(key);

  if (last !== undefined && now - last < window_ms) {
    return false;
  }

  if (notified_at_by_email_id.size >= NOTIFIED_MAX_ENTRIES) {
    for (const [id, ts] of notified_at_by_email_id) {
      if (now - ts >= NOTIFIED_TTL_MS) {
        notified_at_by_email_id.delete(id);
      }
    }
    if (notified_at_by_email_id.size >= NOTIFIED_MAX_ENTRIES) {
      const oldest = notified_at_by_email_id.keys().next().value;

      if (oldest !== undefined) {
        notified_at_by_email_id.delete(oldest);
      }
    }
  }

  notified_at_by_email_id.set(key, now);

  return true;
}

export function EmailNotificationManager() {
  const { is_authenticated, current_account_id } = use_auth();
  const { preferences } = use_preferences();
  const { t } = use_i18n();
  const preferences_ref = useRef(preferences);

  useEffect(() => {
    preferences_ref.current = preferences;
  }, [preferences]);

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

  useEffect(() => {
    if (!is_authenticated) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const email_id = detail?.email_id || "";

      if (!claim_notification(email_id)) {
        return;
      }

      void (async () => {
        const suppressed = await is_email_notification_suppressed(
          email_id,
          preferences_ref.current.muted_folder_tokens ?? [],
        );

        if (suppressed) {
          return;
        }

        const category_muted = await is_category_muted(
          email_id,
          preferences_ref.current.muted_notification_categories ?? [],
        );

        if (category_muted) {
          return;
        }

        const arrival_type = await resolve_arrival_type(
          email_id,
          preferences_ref.current.notify_new_email,
        );

        show_notification(
          arrival_type,
          {
            title: t("common.aster_mail"),
            body: t("common.new_email_body"),
            tag: `email-${email_id}`,
            data: email_id ? { email_id } : undefined,
          },
          preferences_ref.current,
          is_lockdown_enabled(current_account_id ?? ""),
        );
      })();
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);

    return () => {
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handler);
    };
  }, [is_authenticated, t, current_account_id]);

  return null;
}
