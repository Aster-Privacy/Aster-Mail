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
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsRow } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import {
  get_codes_status,
  get_recovery_methods,
  type CodesStatus,
  type RecoveryMethods,
} from "@/services/api/recovery";
import {
  RecoveryCodesModal,
  type RecoveryCodesModalMode,
} from "@/components/settings/security/recovery_codes_modal";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

const LOW_CODES_THRESHOLD = 3;

function format_codes_date(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(app_locale(), {
      timeZone: get_display_time_zone(),
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function RecoveryCodesGroup() {
  const { t } = use_i18n();
  const [methods, set_methods] = useState<RecoveryMethods | null>(null);
  const [status, set_status] = useState<CodesStatus | null>(null);
  const [load_error, set_load_error] = useState(false);
  const [modal_open, set_modal_open] = useState(false);
  const [modal_mode, set_modal_mode] =
    useState<RecoveryCodesModalMode>("regenerate");

  const fetch_methods = useCallback(async () => {
    const [methods_response, status_response] = await Promise.all([
      get_recovery_methods(),
      get_codes_status(),
    ]);

    if (methods_response.data) {
      set_methods(methods_response.data);
      set_load_error(false);
    } else {
      set_load_error(true);
    }

    set_status(status_response.data ?? null);
  }, []);

  useEffect(() => {
    void fetch_methods();
  }, [fetch_methods]);

  const has_codes = methods?.has_codes ?? false;
  const is_low =
    has_codes && status !== null && status.remaining <= LOW_CODES_THRESHOLD;

  const open_modal = (mode: RecoveryCodesModalMode) => {
    set_modal_mode(mode);
    set_modal_open(true);
  };

  return (
    <>
      <SettingsGroup title={t("settings.account_recovery_title")}>
        {load_error && !methods ? (
          <div className="px-4 py-3">
            <LoadFailedNotice on_retry={() => void fetch_methods()} />
          </div>
        ) : (
          <>
            {is_low && (
              <div className="flex items-start gap-2 px-4 pt-3 text-[13px] text-[var(--text-muted)]">
                <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />
                <span>{t("settings.recovery_codes_low")}</span>
              </div>
            )}
            {has_codes && (
              <SettingsRow
                description={
                  status?.created_at
                    ? t("settings.recovery_codes_status", {
                        date: format_codes_date(status.created_at),
                        remaining: status.remaining,
                        total: status.total,
                      })
                    : undefined
                }
                label={t("settings.recovery_codes_show")}
                on_press={() => open_modal("show")}
              />
            )}
            <SettingsRow
              description={
                has_codes ? undefined : t("settings.recovery_codes_row_desc")
              }
              label={
                has_codes
                  ? t("settings.recovery_codes_regenerate")
                  : t("settings.recovery_codes_generate")
              }
              on_press={() => open_modal("regenerate")}
            />
          </>
        )}
      </SettingsGroup>
      <RecoveryCodesModal
        has_codes={has_codes}
        is_open={modal_open}
        mode={modal_mode}
        on_close={() => set_modal_open(false)}
        on_saved={fetch_methods}
      />
    </>
  );
}
