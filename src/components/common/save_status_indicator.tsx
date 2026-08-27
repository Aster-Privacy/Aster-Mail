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
import { CheckCircleIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  error_label?: string;
  className?: string;
}

export function SaveStatusIndicator({
  status,
  error_label,
  className = "",
}: SaveStatusIndicatorProps): JSX.Element {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const fade = {
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    initial: reduce_motion ? false : ({ opacity: 0 } as const),
    transition: { duration: reduce_motion ? 0 : 0.18, ease: "easeOut" },
  };

  return (
    <div
      aria-live="polite"
      className={`flex items-center justify-end ${className}`}
    >
      <AnimatePresence initial={false} mode="wait">
        {status === "saving" && (
          <motion.div
            key="saving"
            aria-label={t("common.saving")}
            className="h-[3px] w-16 overflow-hidden rounded-full bg-edge-secondary"
            role="progressbar"
            {...fade}
          >
            <motion.div
              animate={reduce_motion ? { x: "0%" } : { x: ["-100%", "250%"] }}
              className="h-full w-2/5 rounded-full bg-blue-500"
              transition={
                reduce_motion
                  ? { duration: 0 }
                  : { duration: 1.1, ease: "easeInOut", repeat: Infinity }
              }
            />
          </motion.div>
        )}

        {status === "saved" && (
          <motion.div
            key="saved"
            className="flex items-center gap-1 text-blue-500"
            {...fade}
          >
            <CheckCircleIcon className="h-3.5 w-3.5" />
            <span className="text-[11px]">{t("mail.saved")}</span>
          </motion.div>
        )}

        {status === "error" && (
          <motion.span
            key="error"
            className="text-[11px] text-red-500"
            {...fade}
          >
            {error_label ?? t("common.error_label")}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
