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
import { useCallback, useEffect, useState } from "react";
import { PauseCircleIcon } from "@heroicons/react/24/outline";
import { PillButton } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  format_date,
  get_pause_status,
  resume_paused_subscription,
  type PauseStatusResponse,
} from "@/services/api/billing";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { BillingNotice } from "@/components/settings/billing/billing_layout";
import { server_error_text } from "@/components/settings/billing/server_error_text";

interface PauseNoticeCardProps {
  refresh_key: string;
  on_changed: () => Promise<void>;
  on_cancel_plan: () => void;
}

export function PauseNoticeCard({
  refresh_key,
  on_changed,
  on_cancel_plan,
}: PauseNoticeCardProps) {
  const { t } = use_i18n();
  const [status, set_status] = useState<PauseStatusResponse | null>(null);
  const [is_busy, set_is_busy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await get_pause_status();

      set_status(response.data ?? null);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refresh_key]);

  if (!status || status.status === "none") return null;

  const is_paused = status.status === "paused";

  const handle_resume = async () => {
    if (is_busy) return;
    set_is_busy(true);
    try {
      const response = await resume_paused_subscription();

      if (response.data) {
        show_toast(
          is_paused
            ? t("settings.pause_resumed_toast")
            : t("settings.pause_schedule_cleared_toast"),
          "success",
        );
        request_cache.invalidate("/payments/v1");
        request_cache.invalidate("/sync/v1");
        invalidate_mail_stats();
        await on_changed();
        await load();

        return;
      }
      show_toast(
        server_error_text(response.error, t("settings.pause_resume_failed")),
        "error",
      );
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.pause_resume_failed"), "error");
    } finally {
      set_is_busy(false);
    }
  };

  return (
    <BillingNotice
      body={
        is_paused
          ? t("settings.pause_active_body")
          : t("settings.pause_scheduled_body", {
              start: format_date(status.pause_starts_at),
              end: format_date(status.pause_ends_at),
            })
      }
      icon={PauseCircleIcon}
      title={
        is_paused
          ? t("settings.pause_active_title", {
              date: format_date(status.pause_ends_at),
            })
          : t("settings.pause_scheduled_title")
      }
      tone="neutral"
    >
      <PillButton
        disabled={is_busy}
        size="sm"
        type="button"
        variant="filled"
        onClick={handle_resume}
      >
        {is_paused
          ? t("settings.pause_resume_action")
          : t("settings.pause_cancel_scheduled_action")}
      </PillButton>
      {is_paused && (
        <PillButton
          disabled={is_busy}
          size="sm"
          type="button"
          variant="outline"
          onClick={on_cancel_plan}
        >
          {t("settings.cancel_plan")}
        </PillButton>
      )}
    </BillingNotice>
  );
}
