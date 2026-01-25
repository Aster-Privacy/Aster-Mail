import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { show_toast } from "@/components/simple_toast";

interface SupportPanelProps {
  is_open: boolean;
  on_close: () => void;
}

export function SupportPanel({ is_open, on_close }: SupportPanelProps) {
  const [feedback, set_feedback] = useState("");
  const [is_sending, set_is_sending] = useState(false);

  const handle_send = useCallback(async () => {
    if (!feedback.trim()) return;

    set_is_sending(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: feedback.trim() }),
      });

      if (response.ok) {
        show_toast(
          "Thank you for your feedback! We truly appreciate it.",
          "success",
        );
        set_feedback("");
        on_close();
      } else {
        show_toast("Failed to send feedback. Please try again.", "error");
      }
    } catch {
      show_toast("Failed to send feedback. Please try again.", "error");
    } finally {
      set_is_sending(false);
    }
  }, [feedback, on_close]);

  const handle_close = useCallback(() => {
    set_feedback("");
    on_close();
  }, [on_close]);

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 flex items-center justify-center z-50 p-4 backdrop-blur-md"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          style={{ backgroundColor: "var(--modal-overlay)" }}
          transition={{ duration: 0.15 }}
          onClick={handle_close}
        >
          <motion.div
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-xl border w-full max-w-lg overflow-hidden"
            exit={{ scale: 0.96, opacity: 0 }}
            initial={{ scale: 0.96, opacity: 0 }}
            style={{
              backgroundColor: "var(--modal-bg)",
              borderColor: "var(--border-primary)",
              boxShadow: "0 24px 48px -12px rgba(0, 0, 0, 0.25)",
            }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Send feedback
              </h2>
              <p
                className="text-[13px] mt-1"
                style={{ color: "var(--text-tertiary)" }}
              >
                Let us know how we can improve
              </p>
            </div>

            <div className="px-6 pb-4">
              <textarea
                className="w-full h-44 px-3 py-2.5 text-sm rounded-lg border resize-none focus:outline-none"
                placeholder="Your feedback..."
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  borderColor: "var(--border-secondary)",
                  color: "var(--text-primary)",
                }}
                value={feedback}
                onChange={(e) => set_feedback(e.target.value)}
              />
            </div>

            <div className="px-6 pb-6 flex justify-end gap-3">
              <Button
                className="h-9 px-4"
                variant="ghost"
                onClick={handle_close}
              >
                Cancel
              </Button>
              <Button
                className="h-9 px-4"
                disabled={!feedback.trim() || is_sending}
                variant="primary"
                onClick={handle_send}
              >
                {is_sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
