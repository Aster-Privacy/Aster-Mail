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
import { useNavigate } from "react-router-dom";
import {
  ChatBubbleBottomCenterTextIcon,
  EnvelopeIcon,
  LifebuoyIcon,
  QuestionMarkCircleIcon,
  ShieldExclamationIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";
import {
  IslandRow,
  IslandSection,
  IslandSections,
  PillButton,
} from "@aster/ui";

import { Button } from "@/components/ui/button";

import { is_desktop } from "@/native/invoke_bridge";
import { api_client } from "@/services/api/client";
import { API_ENDPOINTS } from "@/services/api/endpoints";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { open_external } from "@/utils/open_link";

const MAX_FEEDBACK_LENGTH = 2000;

const SUPPORT_ADDRESS = "hello@astermail.org";
const SECURITY_ADDRESS = "security@astermail.org";
const HELP_CENTER_URL = "https://astermail.org/help";
const STATUS_PAGE_URL = "https://status.astermail.org";

const FEEDBACK_CATEGORIES = [
  { value: "general", label_key: "settings.feedback_category_general" },
  { value: "feature", label_key: "settings.feedback_category_idea" },
  { value: "bug", label_key: "settings.feedback_category_bug" },
] as const;

type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["value"];

const ROW_ICON_CLASS = "h-[22px] w-[22px]";

export function FeedbackSection() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [feedback_text, set_feedback_text] = useState("");
  const [is_sending, set_is_sending] = useState(false);
  const [category, set_category] = useState<FeedbackCategory>("general");

  const compose_to = useCallback(
    (address: string) => {
      if (window.location.pathname.startsWith("/settings")) {
        navigate("/");
      }
      window.dispatchEvent(
        new CustomEvent("aster:open-compose-prefilled", {
          detail: { to: [address], subject: "", body: "" },
        }),
      );
    },
    [navigate],
  );

  const handle_send = useCallback(async () => {
    if (!feedback_text.trim()) return;

    set_is_sending(true);

    try {
      const response = await api_client.post<{ success: boolean }>(
        API_ENDPOINTS.core.feedback.base,
        {
          message: feedback_text.trim(),
          category,
          platform: is_desktop() ? "desktop" : "web",
        },
      );

      if (response.data?.success) {
        show_toast(t("settings.thank_you_feedback"), "success");
        set_feedback_text("");
        set_category("general");
      } else if (
        response.code === "RATE_LIMIT_EXCEEDED" ||
        response.code === "FORBIDDEN"
      ) {
        show_toast(t("settings.too_many_requests"), "warning");
      } else if (response.code === "UNAUTHORIZED") {
        show_toast(t("settings.please_log_in_feedback"), "warning");
      } else {
        show_toast(t("settings.failed_send_feedback"), "error");
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_send_feedback"), "error");
    } finally {
      set_is_sending(false);
    }
  }, [feedback_text, category, t]);

  return (
    <IslandSections>
      <IslandSection
        description={t("settings.feedback_intro")}
        icon={<ChatBubbleBottomCenterTextIcon />}
        island_class_name="space-y-3"
        padding="md"
        title={t("settings.your_feedback")}
      >
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_CATEGORIES.map((option) => (
            <PillButton
              key={option.value}
              aria-pressed={category === option.value}
              size="sm"
              variant={category === option.value ? "filled" : "neutral"}
              onClick={() => set_category(option.value)}
            >
              {t(option.label_key)}
            </PillButton>
          ))}
        </div>
        <textarea
          aria-label={t("settings.your_feedback")}
          className="aster_input resize-none"
          id="feedback-textarea"
          maxLength={MAX_FEEDBACK_LENGTH}
          placeholder={t("settings.feedback_placeholder")}
          rows={6}
          style={{ padding: "10px 14px" }}
          value={feedback_text}
          onChange={(e) => set_feedback_text(e.target.value)}
        />
        <p className="text-xs text-txt-muted">
          {t("settings.feedback_not_encrypted")}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs tabular-nums text-txt-muted">
            {feedback_text.length}/{MAX_FEEDBACK_LENGTH}
          </span>
          <Button
            className="h-9 px-4"
            disabled={!feedback_text.trim() || is_sending}
            is_loading={is_sending}
            variant="depth"
            onClick={handle_send}
          >
            {t("settings.send_feedback_button")}
          </Button>
        </div>
      </IslandSection>

      <IslandSection
        description={t("settings.support_intro")}
        icon={<LifebuoyIcon />}
        title={t("settings.other_ways_to_reach")}
      >
        <IslandRow
          chevron
          description={SUPPORT_ADDRESS}
          icon={<EnvelopeIcon className={ROW_ICON_CLASS} />}
          label={t("settings.support_email_label")}
          on_press={() => compose_to(SUPPORT_ADDRESS)}
        />
        <IslandRow
          chevron
          description={t("settings.support_help_desc")}
          icon={<QuestionMarkCircleIcon className={ROW_ICON_CLASS} />}
          label={t("settings.support_help_label")}
          on_press={() => open_external(HELP_CENTER_URL)}
        />
        <IslandRow
          chevron
          description={t("settings.support_status_desc")}
          icon={<SignalIcon className={ROW_ICON_CLASS} />}
          label={t("settings.support_status_label")}
          on_press={() => open_external(STATUS_PAGE_URL)}
        />
        <IslandRow
          chevron
          description={SECURITY_ADDRESS}
          icon={<ShieldExclamationIcon className={ROW_ICON_CLASS} />}
          label={t("settings.support_security_label")}
          on_press={() => compose_to(SECURITY_ADDRESS)}
        />
      </IslandSection>
    </IslandSections>
  );
}
