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
import type { } from "@/lib/i18n/types";
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { motion, AnimatePresence } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { format_last_saved } from "@/components/compose/compose_shared";
import { use_date_format } from "@/hooks/use_date_format";


export function DraftStatusIndicator({
  compose,
  reduce_motion,
}: {
  compose: ComposeToolbarState;
  reduce_motion: boolean;
}) {
  const { t } = use_i18n();
  const { options: date_format_options } = use_date_format();

  return (
    <AnimatePresence>
      {compose.draft_status !== "idle" && (
        <motion.div
          animate={{ opacity: 1 }}
          className="text-xs flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-txt-muted"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.2, ease: "easeOut" }}
        >
          <AnimatePresence initial={false} mode="wait">
            {compose.draft_status === "saving" ? (
              <motion.div
                key="saving"
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.15 }}
              >
                <svg
                  className="w-3.5 h-3.5 animate-spin"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                <span>{t("common.saving")}</span>
              </motion.div>
            ) : compose.draft_status === "error" ? (
              <motion.div
                key="error"
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 text-red-500 dark:text-red-400"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.15 }}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                <span>{t("common.save_failed")}</span>
              </motion.div>
            ) : (
              <motion.div
                key="saved"
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5"
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.15 }}
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                <span>
                  {compose.last_saved_time
                    ? format_last_saved(compose.last_saved_time, t, date_format_options)
                    : t("mail.saved")}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

