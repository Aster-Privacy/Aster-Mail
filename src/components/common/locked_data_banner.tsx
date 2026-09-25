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
import { LockClosedIcon } from "@heroicons/react/24/outline";

import { RecoverDataModal } from "@/components/common/recover_data_modal";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_accent_contrast_text } from "@/hooks/use_accent_contrast_text";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_locked_data_status,
  has_locked_data,
  type LockedDataStatus,
} from "@/services/locked_data";
import { LOCKED_DATA_CHANGED_EVENT } from "@/services/locked_sent_mail_store";

export function LockedDataBanner() {
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
  const { vault, user } = use_auth();
  const account_id = user?.id ?? null;
  const { preferences, update_preference, is_loading, has_loaded_from_server } =
    use_preferences();
  const [status, set_status] = useState<LockedDataStatus | null>(null);
  const [dismissed_signature, set_dismissed_signature] = useState<
    string | null
  >(null);
  const [is_modal_open, set_is_modal_open] = useState(false);

  useEffect(() => {
    if (!vault || !account_id) {
      set_status(null);

      return;
    }

    let cancelled = false;

    const refresh = () => {
      void get_locked_data_status(account_id).then((next) => {
        if (!cancelled) set_status(next);
      });
    };

    refresh();
    window.addEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(LOCKED_DATA_CHANGED_EVENT, refresh);
    };
  }, [vault, account_id]);

  const signature = status?.signature ?? "";
  const is_dismissed =
    dismissed_signature === signature ||
    preferences.locked_data_banner_dismissed === signature;

  const should_hide =
    is_loading ||
    !has_loaded_from_server ||
    !account_id ||
    !has_locked_data(status) ||
    is_dismissed;

  const handle_dismiss = useCallback(() => {
    if (!signature) return;
    set_dismissed_signature(signature);
    update_preference("locked_data_banner_dismissed", signature, true);
  }, [signature, update_preference]);

  const open_modal = useCallback(() => set_is_modal_open(true), []);
  const close_modal = useCallback(() => set_is_modal_open(false), []);

  return (
    <>
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
                <LockClosedIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
                <span className="text-xs font-medium line-clamp-2 sm:truncate">
                  {t("common.locked_data_banner_message")}
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
                  onClick={open_modal}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = button_bg_hover)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = button_bg)
                  }
                >
                  {t("common.locked_data_banner_action")}
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
                  {t("common.locked_data_banner_dismiss")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {account_id && (
        <RecoverDataModal
          account_id={account_id}
          is_open={is_modal_open}
          on_close={close_modal}
        />
      )}
    </>
  );
}
