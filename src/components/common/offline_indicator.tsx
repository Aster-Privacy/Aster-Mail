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
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiIcon } from "@heroicons/react/24/outline";

import { use_online_status } from "@/hooks/use_online_status";
import { cn } from "@/lib/utils";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface OfflineIndicatorProps {
  position?: "top" | "bottom";
  className?: string;
}

export function OfflineIndicator({
  position = "bottom",
  className,
}: OfflineIndicatorProps) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { is_online, was_offline } = use_online_status();
  const [show_reconnected, set_show_reconnected] = useState(false);

  useEffect(() => {
    if (is_online && was_offline) {
      set_show_reconnected(true);
      const timer = setTimeout(() => {
        set_show_reconnected(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [is_online, was_offline]);

  const position_classes =
    position === "top" ? "top-0 left-0 right-0" : "bottom-0 left-0 right-0";

  return (
    <AnimatePresence>
      {!is_online && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "fixed z-50 flex items-center justify-center gap-2 px-4 py-2",
            "bg-amber-500 text-white text-sm font-medium shadow-lg",
            position_classes,
            className,
          )}
          exit={{ opacity: 0, y: position === "top" ? -20 : 20 }}
          initial={
            reduce_motion
              ? false
              : { opacity: 0, y: position === "top" ? -20 : 20 }
          }
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <WifiIcon className="h-4 w-4" />
          <span>{t("common.offline_features_limited")}</span>
        </motion.div>
      )}

      {is_online && show_reconnected && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "fixed z-50 flex items-center justify-center gap-2 px-4 py-2",
            "bg-green-500 text-white text-sm font-medium shadow-lg",
            position_classes,
            className,
          )}
          exit={{ opacity: 0, y: position === "top" ? -20 : 20 }}
          initial={
            reduce_motion
              ? false
              : { opacity: 0, y: position === "top" ? -20 : 20 }
          }
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <WifiIcon className="h-4 w-4" />
          <span>{t("common.back_online")}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflineBadge({ className }: { className?: string }) {
  const { t } = use_i18n();
  const { is_online } = use_online_status();

  if (is_online) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
        "bg-amber-100 text-amber-700 text-xs font-medium",
        "dark:bg-amber-900/30 dark:text-amber-400",
        className,
      )}
    >
      <WifiIcon className="h-3 w-3" />
      {t("common.offline")}
    </span>
  );
}
