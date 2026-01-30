import { useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { api_client } from "@/services/api/client";
import { show_toast } from "@/components/toast/simple_toast";

const MAX_FEEDBACK_LENGTH = 2000;

export function FeedbackSection() {
  const [feedback_text, set_feedback_text] = useState("");
  const [is_sending, set_is_sending] = useState(false);

  const handle_send = useCallback(async () => {
    if (!feedback_text.trim()) return;

    set_is_sending(true);

    try {
      const response = await api_client.post<{ success: boolean }>(
        "/feedback",
        { message: feedback_text.trim() },
      );

      if (response.data?.success) {
        show_toast("Thank you for your feedback!", "success");
        set_feedback_text("");
      } else if (response.code === "FORBIDDEN") {
        show_toast("Too many requests. Please try again later.", "warning");
      } else if (response.code === "UNAUTHORIZED") {
        show_toast("Please log in to send feedback.", "warning");
      } else {
        show_toast(response.error || "Failed to send feedback.", "error");
      }
    } catch {
      show_toast("Failed to send feedback. Please try again.", "error");
    } finally {
      set_is_sending(false);
    }
  }, [feedback_text]);

  return (
    <div className="space-y-4">
      <div
        className="p-4 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          borderColor: "var(--border-secondary)",
        }}
      >
        <label
          className="text-sm font-medium block mb-2"
          htmlFor="feedback-textarea"
          style={{ color: "var(--text-primary)" }}
        >
          Your Feedback
        </label>
        <textarea
          className="w-full px-3 py-2.5 text-sm border rounded-lg resize-none focus:outline-none"
          id="feedback-textarea"
          maxLength={MAX_FEEDBACK_LENGTH}
          placeholder="Share your thoughts, suggestions, or report issues..."
          rows={6}
          style={{
            backgroundColor: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--text-secondary)",
          }}
          value={feedback_text}
          onChange={(e) => set_feedback_text(e.target.value)}
        />
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {feedback_text.length}/{MAX_FEEDBACK_LENGTH}
          </span>
          <Button
            className="h-9 px-4"
            disabled={!feedback_text.trim() || is_sending}
            variant="primary"
            onClick={handle_send}
          >
            {is_sending ? "Sending..." : "Send Feedback"}
          </Button>
        </div>
      </div>

      <div
        className="p-4 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          borderColor: "var(--border-secondary)",
        }}
      >
        <p
          className="text-sm font-medium mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Other Ways to Reach Us
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Email: support@astermail.org
        </p>
      </div>
    </div>
  );
}
