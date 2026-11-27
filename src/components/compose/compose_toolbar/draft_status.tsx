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
import type {} from "@/lib/i18n/types";
import type { ComposeToolbarState } from "@/components/compose/compose_shared";

import { motion, AnimatePresence } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { format_last_saved } from "@/components/compose/compose_shared";

export function DraftStatusIndicator({
  compose,
  reduce_motion,
}: {
  compose: ComposeToolbarState;
  reduce_motion: boolean;
}) {
  const { t } = use_i18n();
  const saved_label = compose.last_saved_time
    ? format_last_saved(compose.last_saved_time, t)
    : t("mail.saved");

  return (
    <AnimatePresence>
      {compose.draft_status !== "idle" && (
        <motion.div
          animate={{ opacity: 1 }}
          className="text-xs flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-txt-muted"
          data-testid="compose_draft_status"
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
                <div
                  aria-label={t("common.saving")}
                  className="h-[3px] w-16 overflow-hidden rounded-full bg-edge-secondary"
                  role="progressbar"
                >
                  <motion.div
                    animate={
                      reduce_motion ? { x: "0%" } : { x: ["-100%", "250%"] }
                    }
                    className="h-full w-2/5 rounded-full bg-[var(--accent-color)]"
                    transition={
                      reduce_motion
                        ? { duration: 0 }
                        : { duration: 1.1, ease: "easeInOut", repeat: Infinity }
                    }
                  />
                </div>
              </motion.div>
            ) : compose.draft_status === "error" ? (
              <motion.div
                key="error"
                animate={{ opacity: 1 }}
                className="flex min-w-0 items-center gap-1.5 text-red-700 dark:text-red-400"
                title={t("common.save_failed")}
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.15 }}
              >
                <svg
                  aria-hidden="true"
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                <span className="min-w-0 truncate">
                  {t("common.save_failed")}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="saved"
                animate={{ opacity: 1 }}
                className="flex min-w-0 items-center gap-1.5"
                title={saved_label}
                exit={{ opacity: 0 }}
                initial={reduce_motion ? false : { opacity: 0 }}
                transition={{ duration: reduce_motion ? 0 : 0.15 }}
              >
                <svg
                  aria-hidden="true"
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                <span className="min-w-0 truncate">{saved_label}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
