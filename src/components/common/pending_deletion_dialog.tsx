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
import { PendingDeletionDialogView } from "@aster/ui";

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
    <PendingDeletionDialogView
      body={
        days_remaining === null
          ? t("common.pending_deletion_body")
          : t("common.pending_deletion_days", {
              days: days_remaining,
            })
      }
      error_message={has_error ? t("common.pending_deletion_error") : null}
      is_busy={is_busy}
      keep_label={
        is_busy
          ? t("common.pending_deletion_cancelling")
          : t("common.pending_deletion_keep")
      }
      sign_out_label={t("common.pending_deletion_sign_out")}
      title={t("common.pending_deletion_title")}
      on_keep={handle_keep}
      on_sign_out={handle_sign_out}
    />
  );
}
