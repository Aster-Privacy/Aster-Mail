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
import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellIcon } from "@heroicons/react/24/outline";

import { use_preferences } from "@/contexts/preferences_context";
import { use_accent_contrast_text } from "@/hooks/use_accent_contrast_text";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";

const DISMISSED_CACHE_KEY = "aster_notification_banner_dismissed";

function get_cached_dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_CACHE_KEY) === "true";
  } catch {
    return false;
  }
}

function cache_dismissed() {
  try {
    localStorage.setItem(DISMISSED_CACHE_KEY, "true");
  } catch (caught) {
    ignore_error(
      "components/common/notification_banner:cache_dismissed",
      caught,
    );
  }
}

export function NotificationBanner() {
  const reduce_motion = use_should_reduce_motion();
  const contrast_text = use_accent_contrast_text();
  const is_dark_text = contrast_text === "#111827";
  const button_bg = is_dark_text
    ? "rgba(0, 0, 0, 0.12)"
    : "rgba(255, 255, 255, 0.2)";
  const button_bg_hover = is_dark_text
    ? "rgba(0, 0, 0, 0.2)"
    : "rgba(255, 255, 255, 0.3)";
  const dismiss_bg = is_dark_text
    ? "rgba(0, 0, 0, 0.06)"
    : "rgba(255, 255, 255, 0.1)";
  const dismiss_bg_hover = button_bg;
  const { t } = use_i18n();
  const { preferences, update_preference, is_loading, has_loaded_from_server } =
    use_preferences();
  const [is_dismissed, set_is_dismissed] = useState(get_cached_dismissed);
  const [browser_permission, set_browser_permission] = useState<
    NotificationPermission | "unsupported"
  >(() => {
    if (!("Notification" in window)) return "unsupported";

    return Notification.permission;
  });

  useEffect(() => {
    if (!("Notification" in window)) return;

    const check_permission = () => {
      set_browser_permission(Notification.permission);
    };

    let status: PermissionStatus | null = null;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "notifications" as PermissionName })
        .then((result) => {
          if (cancelled) return;
          status = result;
          result.addEventListener("change", check_permission);
          check_permission();
        })
        .catch(() => {
          if (cancelled) return;
          interval = setInterval(check_permission, 3000);
        });
    } else {
      interval = setInterval(check_permission, 3000);
    }

    window.addEventListener("focus", check_permission);

    return () => {
      cancelled = true;
      status?.removeEventListener("change", check_permission);
      if (interval !== null) clearInterval(interval);
      window.removeEventListener("focus", check_permission);
    };
  }, []);

  const should_hide =
    is_loading ||
    !has_loaded_from_server ||
    is_dismissed ||
    browser_permission === "granted" ||
    browser_permission === "unsupported" ||
    preferences.notification_banner_dismissed ||
    preferences.desktop_notifications;

  useEffect(() => {
    if (!is_loading && preferences.notification_banner_dismissed) {
      cache_dismissed();
    }
  }, [is_loading, preferences.notification_banner_dismissed]);

  const handle_allow = useCallback(async () => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "denied") {
      show_toast(t("settings.notifications_denied_help"), "warning", 6000);

      return;
    }

    let result: NotificationPermission;

    try {
      result = await Notification.requestPermission();
    } catch (permission_error) {
      if (import.meta.env.DEV) console.error(permission_error);
      show_toast(t("common.something_went_wrong_try_again"), "error");

      return;
    }

    set_browser_permission(result);

    if (result === "denied") {
      show_toast(t("settings.notifications_denied_help"), "warning", 6000);

      return;
    }

    set_is_dismissed(true);
    cache_dismissed();

    if (result === "granted") {
      update_preference("desktop_notifications", true, true);
    }

    update_preference("notification_banner_dismissed", true, true);
  }, [update_preference, t]);

  const handle_dismiss = useCallback(() => {
    set_is_dismissed(true);
    cache_dismissed();
    update_preference("notification_banner_dismissed", true, true);
  }, [update_preference]);

  return (
    <AnimatePresence>
      {!should_hide && (
        <motion.div
          animate={{ opacity: 1, height: "auto" }}
          className="w-full flex-shrink-0 overflow-hidden"
          exit={{ opacity: 0, height: 0, overflow: "hidden" }}
          initial={reduce_motion ? false : { opacity: 0, height: 0 }}
          style={{
            backgroundColor: "var(--accent-color)",
            color: contrast_text,
          }}
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <div className="flex items-center justify-between px-4 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <BellIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
              <span className="text-xs font-medium truncate">
                {t("common.notification_banner_message")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ms-4">
              <button
                className="px-2.5 py-0.5 text-xs font-medium rounded-[12px] transition-colors"
                style={{
                  backgroundColor: button_bg,
                  color: "inherit",
                }}
                type="button"
                onClick={handle_allow}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = button_bg_hover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = button_bg)
                }
              >
                {t("common.notification_banner_allow")}
              </button>
              <button
                className="px-2.5 py-0.5 text-xs font-medium rounded-[12px] transition-colors"
                style={{
                  backgroundColor: dismiss_bg,
                  color: "inherit",
                }}
                type="button"
                onClick={handle_dismiss}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = dismiss_bg_hover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = dismiss_bg)
                }
              >
                {t("common.notification_banner_no_thanks")}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
