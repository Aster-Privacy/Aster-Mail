import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiIcon } from "@heroicons/react/24/outline";

import { use_online_status } from "@/hooks/use_online_status";
import { cn } from "@/lib/utils";

interface OfflineIndicatorProps {
  position?: "top" | "bottom";
  className?: string;
}

export function OfflineIndicator({
  position = "bottom",
  className,
}: OfflineIndicatorProps) {
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
          initial={{ opacity: 0, y: position === "top" ? -20 : 20 }}
          transition={{ duration: 0.2 }}
        >
          <WifiIcon className="h-4 w-4" />
          <span>You&apos;re offline. Some features may be limited.</span>
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
          initial={{ opacity: 0, y: position === "top" ? -20 : 20 }}
          transition={{ duration: 0.2 }}
        >
          <WifiIcon className="h-4 w-4" />
          <span>Back online</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OfflineBadge({ className }: { className?: string }) {
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
      Offline
    </span>
  );
}
