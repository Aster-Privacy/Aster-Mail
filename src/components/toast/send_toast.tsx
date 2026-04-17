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
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";

interface SendToastProps {
  email_id: string;
  total_seconds: number;
  on_undo: () => void;
  on_send_now: () => void;
  position?: "top" | "bottom";
}

export function SendToast({
  email_id,
  total_seconds,
  on_undo,
  on_send_now,
  position = "bottom",
}: SendToastProps) {
  const reduce_motion = use_should_reduce_motion();
  const [remaining_seconds, set_remaining_seconds] = useState(total_seconds);
  const [is_visible, set_is_visible] = useState(true);

  useEffect(() => {
    set_remaining_seconds(total_seconds);
    set_is_visible(true);

    const interval = setInterval(() => {
      set_remaining_seconds((prev) => {
        const next = prev - 1;

        if (next <= 0) {
          clearInterval(interval);
          setTimeout(() => set_is_visible(false), 100);
        }

        return Math.max(0, next);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [email_id, total_seconds]);

  const progress_percentage = (remaining_seconds / total_seconds) * 100;
  const is_top = position === "top";
  const y_offset = is_top ? -50 : 50;

  return (
    <AnimatePresence>
      {is_visible && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="fixed left-1/2 -translate-x-1/2 z-[100] shadow-2xl bg-modal-bg border-edge-primary"
          exit={{ opacity: 0, y: y_offset }}
          initial={reduce_motion ? false : { opacity: 0, y: y_offset }}
          style={
            is_top
              ? { top: `calc(env(safe-area-inset-top, 0px) + 12px)` }
              : { bottom: "24px" }
          }
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
        >
          <div className="border rounded-lg overflow-hidden min-w-[320px] border-edge-secondary">
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium text-txt-primary">
                    Sending in {remaining_seconds} second
                    {remaining_seconds !== 1 ? "s" : ""}...
                  </p>
                  <p className="text-xs text-txt-tertiary">
                    Your message will be sent shortly
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  className="font-medium"
                  size="md"
                  variant="ghost"
                  onClick={on_undo}
                >
                  Undo
                </Button>
                <Button
                  className="font-medium"
                  size="md"
                  variant="ghost"
                  onClick={on_send_now}
                >
                  Send Now
                </Button>
              </div>
            </div>
            <motion.div
              animate={{ width: `${progress_percentage}%` }}
              className="h-1 bg-success"
              initial={reduce_motion ? false : { width: "100%" }}
              transition={{ duration: reduce_motion ? 0 : 1, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
