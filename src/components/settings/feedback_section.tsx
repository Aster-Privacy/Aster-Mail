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
import { useState, useCallback } from "react";
import {
  ChatBubbleBottomCenterTextIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { api_client } from "@/services/api/client";
import { API_ENDPOINTS } from "@/services/api/endpoints";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

const MAX_FEEDBACK_LENGTH = 2000;

export function FeedbackSection() {
  const { t } = use_i18n();
  const [feedback_text, set_feedback_text] = useState("");
  const [is_sending, set_is_sending] = useState(false);

  const handle_send = useCallback(async () => {
    if (!feedback_text.trim()) return;

    set_is_sending(true);

    try {
      const response = await api_client.post<{ success: boolean }>(
        API_ENDPOINTS.core.feedback.base,
        { message: feedback_text.trim() },
      );

      if (response.data?.success) {
        show_toast(t("settings.thank_you_feedback"), "success");
        set_feedback_text("");
      } else if (response.code === "FORBIDDEN") {
        show_toast(t("settings.too_many_requests"), "warning");
      } else if (response.code === "UNAUTHORIZED") {
        show_toast(t("settings.please_log_in_feedback"), "warning");
      } else {
        show_toast(
          response.error || t("settings.failed_send_feedback"),
          "error",
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_send_feedback"), "error");
    } finally {
      set_is_sending(false);
    }
  }, [feedback_text]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ChatBubbleBottomCenterTextIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.your_feedback")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <textarea
          className="aster_input resize-none"
          id="feedback-textarea"
          maxLength={MAX_FEEDBACK_LENGTH}
          placeholder={t("settings.feedback_placeholder")}
          rows={6}
          style={{ padding: "10px 14px" }}
          value={feedback_text}
          onChange={(e) => set_feedback_text(e.target.value)}
        />
        <p className="text-xs mt-2 text-txt-muted">
          {t("settings.feedback_not_encrypted")}
        </p>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-txt-muted">
            {feedback_text.length}/{MAX_FEEDBACK_LENGTH}
          </span>
          <Button
            className="h-9 px-4"
            disabled={!feedback_text.trim() || is_sending}
            variant="depth"
            onClick={handle_send}
          >
            {is_sending
              ? t("settings.sending")
              : t("settings.send_feedback_button")}
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <EnvelopeIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.other_ways_to_reach")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-xs text-txt-muted">
          {t("settings.email_label")}{" "}
          <a
            className="text-[var(--accent-color)] hover:underline cursor-pointer"
            href="mailto:hello@astermail.org"
          >
            hello@astermail.org
          </a>
        </p>
      </div>
    </div>
  );
}
