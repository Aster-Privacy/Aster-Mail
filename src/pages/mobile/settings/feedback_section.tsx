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
import { motion } from "framer-motion";
import { CheckIcon } from "@heroicons/react/24/outline";

import { SettingsHeader } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { api_client } from "@/services/api/client";
import { API_ENDPOINTS } from "@/services/api/endpoints";

export function FeedbackSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const [message, set_message] = useState("");
  const [is_sending, set_is_sending] = useState(false);
  const [sent, set_sent] = useState(false);

  const handle_submit = useCallback(async () => {
    if (!message.trim() || is_sending) return;
    set_is_sending(true);
    try {
      await api_client.post<{ success: boolean }>(
        API_ENDPOINTS.core.feedback.base,
        { message: message.trim() },
      );
      set_sent(true);
      set_message("");
    } catch {
    } finally {
      set_is_sending(false);
    }
  }, [message, is_sending]);

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.feedback")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        {sent ? (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-16">
            <CheckIcon className="h-12 w-12 text-[var(--color-success,#22c55e)]" />
            <p className="text-center text-[15px] text-[var(--mobile-text-primary)]">
              {t("settings.thank_you_feedback")}
            </p>
          </div>
        ) : (
          <div className="px-4 pt-4">
            <p className="mb-3 text-[14px] text-[var(--mobile-text-muted)]">
              {t("settings.feedback_description")}
            </p>
            <textarea
              className="w-full resize-none rounded-xl bg-[var(--mobile-bg-card)] p-4 text-[15px] text-[var(--mobile-text-primary)] placeholder:text-[var(--mobile-text-muted)] outline-none"
              maxLength={2000}
              placeholder={t("settings.feedback_placeholder")}
              rows={6}
              value={message}
              onChange={(e) => set_message(e.target.value)}
            />
            <p className="mt-1.5 text-[12px] text-[var(--mobile-text-muted)]">
              {t("settings.feedback_not_encrypted")}
            </p>
            <motion.button
              className="mt-4 flex w-full items-center justify-center rounded-xl px-4 py-3.5 text-[16px] font-semibold text-white disabled:opacity-50"
              disabled={!message.trim() || is_sending}
              style={{
                background:
                  "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                boxShadow:
                  "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
              type="button"
              onClick={handle_submit}
            >
              {is_sending ? (
                <Spinner size="md" />
              ) : (
                t("settings.send_feedback_button")
              )}
            </motion.button>
            <div className="mt-6 rounded-xl bg-[var(--mobile-bg-card)] px-4 py-3.5">
              <p className="text-[13px] font-medium text-[var(--mobile-text-muted)]">
                {t("settings.other_ways_to_reach")}
              </p>
              <a
                className="mt-1 block text-[14px] font-medium"
                href="mailto:hello@astermail.org"
                style={{ color: "var(--color-primary, #3b82f6)" }}
              >
                hello@astermail.org
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
