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
import { useState, useEffect, useRef, useCallback } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { api_client } from "@/services/api/client";
import { ignore_error } from "@/lib/ignore_error";
import {
  PENDING_DELETION_EVENT,
  PENDING_DELETION_SERVER_CODE,
} from "@/services/api/client/helpers";

interface AccountStatus {
  status: string;
  deletion_scheduled_at: string | null;
  days_until_deletion: number | null;
}

export function PendingDeletionDialog() {
  const { t } = use_i18n();
  const { is_authenticated, logout } = use_auth();
  const was_authenticated = useRef(false);
  const [is_visible, set_is_visible] = useState(false);
  const [days_remaining, set_days_remaining] = useState<number | null>(null);
  const [is_busy, set_is_busy] = useState(false);
  const [has_error, set_has_error] = useState(false);

  const is_signing_out = useRef(false);

  const handle_pending_signal = useCallback(() => {
    if (is_signing_out.current) return;
    set_is_visible(true);
  }, []);

  useEffect(() => {
    window.addEventListener(PENDING_DELETION_EVENT, handle_pending_signal);

    return () => {
      window.removeEventListener(PENDING_DELETION_EVENT, handle_pending_signal);
    };
  }, [handle_pending_signal]);

  useEffect(() => {
    if (!is_authenticated) {
      if (was_authenticated.current) {
        set_is_visible(false);
        set_days_remaining(null);
        set_has_error(false);
      }
      was_authenticated.current = false;

      return;
    }

    was_authenticated.current = true;
    is_signing_out.current = false;

    let cancelled = false;

    const check_status = async () => {
      const response = await api_client.get<AccountStatus>(
        "/core/v1/account/status",
        { skip_cache: true },
      );

      if (cancelled) return;

      if (response.server_code === PENDING_DELETION_SERVER_CODE) {
        set_is_visible(true);

        return;
      }

      if (response.data?.status === "pending_deletion") {
        if (response.data.days_until_deletion !== null) {
          set_days_remaining(response.data.days_until_deletion);
        }
        set_is_visible(true);
      }
    };

    check_status();

    return () => {
      cancelled = true;
    };
  }, [is_authenticated]);

  const handle_keep = async () => {
    set_is_busy(true);
    set_has_error(false);

    const response = await api_client.post<{ success: boolean }>(
      "/core/v1/account/cancel-deletion",
      {},
    );

    if (response.data?.success) {
      window.location.reload();

      return;
    }

    set_has_error(true);
    set_is_busy(false);
  };

  const handle_sign_out = async () => {
    set_is_busy(true);
    set_has_error(false);
    is_signing_out.current = true;

    try {
      await logout();
    } catch (caught) {
      ignore_error(
        "components/common/pending_deletion_dialog:handle_sign_out",
        caught,
      );
    }

    set_is_visible(false);
    set_is_busy(false);
  };

  if (!is_visible) {
    return null;
  }

  return (
    <div
      aria-labelledby="pending_deletion_title"
      aria-modal="true"
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      role="dialog"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-xl"
        style={{
          backgroundColor: "var(--bg-secondary, var(--bg-primary))",
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
          <p
            className="font-semibold text-base"
            id="pending_deletion_title"
            style={{ color: "var(--text-primary)" }}
          >
            {t("common.pending_deletion_title")}
          </p>
        </div>

        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {days_remaining === null
            ? t("common.pending_deletion_body")
            : t("common.pending_deletion_days", {
                days: days_remaining,
              })}
        </p>

        {has_error ? (
          <p className="text-sm mb-4" style={{ color: "#ef4444" }}>
            {t("common.pending_deletion_error")}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            className="w-full rounded-[14px] px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={is_busy}
            style={{
              backgroundColor: "var(--accent-color)",
              color: "var(--accent-fg, #ffffff)",
            }}
            onClick={handle_keep}
          >
            {is_busy
              ? t("common.pending_deletion_cancelling")
              : t("common.pending_deletion_keep")}
          </button>
          <button
            className="w-full rounded-[14px] px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
            disabled={is_busy}
            style={{
              backgroundColor: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-secondary)",
            }}
            onClick={handle_sign_out}
          >
            {t("common.pending_deletion_sign_out")}
          </button>
        </div>
      </div>
    </div>
  );
}
