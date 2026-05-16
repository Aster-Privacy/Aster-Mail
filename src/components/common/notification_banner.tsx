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
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

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
  } catch {}
}

export function NotificationBanner() {
  const reduce_motion = use_should_reduce_motion();
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

    const interval = setInterval(check_permission, 1000);

    return () => clearInterval(interval);
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

    const result = await Notification.requestPermission();

    set_browser_permission(result);

    set_is_dismissed(true);
    cache_dismissed();

    if (result === "granted") {
      update_preference("desktop_notifications", true, true);
    }

    update_preference("notification_banner_dismissed", true, true);
  }, [update_preference]);

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
          className="w-full text-white flex-shrink-0 overflow-hidden"
          exit={{ opacity: 0, height: 0, overflow: "hidden" }}
          initial={reduce_motion ? false : { opacity: 0, height: 0 }}
          style={{ backgroundColor: "var(--accent-color)" }}
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <div className="flex items-center justify-between px-4 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <BellIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
              <span className="text-xs font-medium truncate opacity-95">
                {t("common.notification_banner_message")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
              <button
                className="px-2.5 py-0.5 text-xs font-medium rounded-[12px] transition-colors"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                  color: "inherit",
                }}
                type="button"
                onClick={handle_allow}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.3)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.2)")
                }
              >
                {t("common.notification_banner_allow")}
              </button>
              <button
                className="px-2.5 py-0.5 text-xs font-medium rounded-[12px] transition-colors"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                  color: "inherit",
                }}
                type="button"
                onClick={handle_dismiss}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "rgba(255, 255, 255, 0.1)")
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
