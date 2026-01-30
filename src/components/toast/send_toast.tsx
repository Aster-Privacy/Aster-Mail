import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";

interface SendToastProps {
  email_id: string;
  total_seconds: number;
  on_undo: () => void;
  on_send_now: () => void;
}

export function SendToast({
  email_id,
  total_seconds,
  on_undo,
  on_send_now,
}: SendToastProps) {
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

  return (
    <AnimatePresence>
      {is_visible && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] shadow-2xl"
          exit={{ opacity: 0, y: 50 }}
          initial={{ opacity: 0, y: 50 }}
          style={{
            backgroundColor: "var(--modal-bg)",
            borderColor: "var(--border-primary)",
          }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="border rounded-lg overflow-hidden min-w-[320px]"
            style={{ borderColor: "var(--border-secondary)" }}
          >
            <div className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Sending in {remaining_seconds} second
                    {remaining_seconds !== 1 ? "s" : ""}...
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Your message will be sent shortly
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  className="font-medium"
                  size="sm"
                  variant="ghost"
                  onClick={on_undo}
                >
                  Undo
                </Button>
                <Button
                  className="font-medium"
                  size="sm"
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
              initial={{ width: "100%" }}
              transition={{ duration: 1, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
