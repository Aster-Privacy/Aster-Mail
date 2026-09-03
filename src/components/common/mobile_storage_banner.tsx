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
import { AnimatePresence, motion } from "framer-motion";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { show_storage_full_upgrade } from "@/stores/upgrade_store";
import { use_i18n } from "@/lib/i18n/context";
import { use_mail_stats } from "@/hooks/use_mail_stats";

const LOCKED_PERCENT = 100;
const WARNING_PERCENT = 90;

export function MobileStorageBanner() {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { stats, has_initialized } = use_mail_stats();

  const percent =
    stats.storage_total_bytes > 0
      ? (stats.storage_used_bytes / stats.storage_total_bytes) * 100
      : 0;

  const is_locked = has_initialized && percent >= LOCKED_PERCENT;
  const is_warning =
    has_initialized && percent >= WARNING_PERCENT && percent < LOCKED_PERCENT;
  const is_visible = is_locked || is_warning;

  return (
    <AnimatePresence>
      {is_visible && (
        <motion.div
          animate={{ opacity: 1, height: "auto" }}
          className="w-full flex-shrink-0 overflow-hidden text-white"
          exit={{ opacity: 0, height: 0, overflow: "hidden" }}
          initial={reduce_motion ? false : { opacity: 0, height: 0 }}
          style={{ backgroundColor: is_locked ? "#dc2626" : "#d97706" }}
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
              <span className="truncate text-xs font-medium opacity-95">
                {is_locked
                  ? t("settings.storage_locked_title")
                  : t("settings.storage_warning_title")}
              </span>
            </div>
            <button
              className="flex-shrink-0 rounded-[12px] px-2.5 py-0.5 text-xs font-medium transition-colors"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
              type="button"
              onClick={() => show_storage_full_upgrade({})}
            >
              {t("common.upgrade")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
