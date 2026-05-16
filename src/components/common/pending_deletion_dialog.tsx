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
import { useState, useEffect, useRef } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { api_client } from "@/services/api/client";

interface AccountStatus {
  status: string;
  deletion_scheduled_at: string | null;
  days_until_deletion: number | null;
}

export function PendingDeletionDialog() {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const was_authenticated = useRef(false);
  const [is_visible, set_is_visible] = useState(false);
  const [days_remaining, set_days_remaining] = useState<number>(30);
  const [is_cancelling, set_is_cancelling] = useState(false);

  useEffect(() => {
    if (!is_authenticated) {
      if (was_authenticated.current) {
        set_is_visible(false);
        sessionStorage.removeItem("aster_deletion_dismissed");
      }
      was_authenticated.current = false;
      return;
    }

    was_authenticated.current = true;

    const check_status = async () => {
      const already_dismissed = sessionStorage.getItem("aster_deletion_dismissed");
      if (already_dismissed === "true") return;

      const response = await api_client.get<AccountStatus>("/core/v1/account/status");
      if (
        response.data?.status === "pending_deletion" &&
        response.data.days_until_deletion !== null
      ) {
        set_days_remaining(response.data.days_until_deletion ?? 30);
        set_is_visible(true);
      }
    };

    check_status();
  }, [is_authenticated]);

  const handle_keep = async () => {
    set_is_cancelling(true);
    const response = await api_client.post<{ success: boolean }>(
      "/core/v1/account/cancel-deletion",
      {}
    );

    if (response.data?.success) {
      set_is_visible(false);
      sessionStorage.removeItem("aster_deletion_dismissed");
    }

    set_is_cancelling(false);
  };

  const handle_dismiss = () => {
    sessionStorage.setItem("aster_deletion_dismissed", "true");
    set_is_visible(false);
  };

  if (!is_visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-xl"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <div className="flex items-start gap-3 mb-4">
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            fill="currentColor"
            style={{ color: "#ef4444" }}
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
              fillRule="evenodd"
            />
          </svg>
          <div>
            <p
              className="font-semibold text-base"
              style={{ color: "var(--text-primary)" }}
            >
              {t("common.pending_deletion_title")}
            </p>
          </div>
        </div>

        <p
          className="text-sm mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("common.pending_deletion_days", { days: String(days_remaining) })}
        </p>

        <p
          className="text-sm mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          {t("common.pending_deletion_cancel_prompt")}
        </p>

        <div className="flex flex-col gap-2">
          <button
            className="w-full rounded-[14px] px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={is_cancelling}
            style={{
              backgroundColor: "var(--accent-color)",
              color: "#fff",
            }}
            onClick={handle_keep}
          >
            {is_cancelling
              ? t("common.pending_deletion_cancelling")
              : t("common.pending_deletion_keep")}
          </button>
          <button
            className="w-full rounded-[14px] px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
            disabled={is_cancelling}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-secondary)",
            }}
            onClick={handle_dismiss}
          >
            {t("common.pending_deletion_dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
