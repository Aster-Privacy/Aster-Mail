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
import { useState, useEffect, useCallback } from "react";
import {
  LifebuoyIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Island, IslandRow, IslandSection } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { SETTINGS_ANCHORS } from "@/lib/settings_links";
import {
  get_codes_status,
  get_recovery_methods,
  CodesStatus,
  RecoveryMethods,
} from "@/services/api/recovery";
import {
  RecoveryCodesModal,
  RecoveryCodesModalMode,
} from "@/components/settings/security/recovery_codes_modal";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

const LOW_CODES_THRESHOLD = 3;

function format_date(iso: string): string {
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

export function AccountRecoverySection({
  on_changed,
}: {
  on_changed?: () => void;
} = {}) {
  const { t } = use_i18n();
  const [methods, set_methods] = useState<RecoveryMethods | null>(null);
  const [status, set_status] = useState<CodesStatus | null>(null);
  const [show_codes_modal, set_show_codes_modal] = useState(false);
  const [modal_mode, set_modal_mode] =
    useState<RecoveryCodesModalMode>("regenerate");
  const [load_error, set_load_error] = useState(false);

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
    fetch_methods();
  }, [fetch_methods]);

  const has_codes = methods?.has_codes ?? false;
  const has_offline_method = has_codes || (methods?.has_phrase ?? false);
  const remaining = status?.remaining ?? 0;
  const is_low =
    has_codes && status !== null && remaining <= LOW_CODES_THRESHOLD;

  const open_modal = (mode: RecoveryCodesModalMode) => {
    set_modal_mode(mode);
    set_show_codes_modal(true);
  };

  return (
    <>
      <IslandSection
        bare
        description={t("settings.account_recovery_desc")}
        icon={<LifebuoyIcon />}
        id={SETTINGS_ANCHORS.account_recovery}
        title={t("settings.account_recovery_title")}
        trailing={
          methods && has_offline_method ? (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: "var(--color-success)" }}
            >
              <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
              {t("settings.recovery_status_protected")}
            </span>
          ) : undefined
        }
      >
        {load_error && !methods && (
          <Island className="flex items-start gap-3" padding="md">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm text-txt-muted">
              {t("settings.failed_load_security_status")}
            </p>
          </Island>
        )}

        {methods && !has_offline_method && (
          <Island className="flex items-start gap-3" padding="md">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.recovery_status_at_risk")}
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.recovery_status_at_risk_desc")}
              </p>
            </div>
          </Island>
        )}

        {is_low && (
          <Island className="flex items-start gap-3" padding="md">
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm text-txt-muted">
              {t("settings.recovery_codes_low")}
            </p>
          </Island>
        )}

        <Island>
          <IslandRow
            description={
              has_codes && status?.created_at
                ? t("settings.recovery_codes_status", {
                    date: format_date(status.created_at),
                    remaining: status.remaining,
                    total: status.total,
                  })
                : t("settings.recovery_codes_row_desc")
            }
            label={
              <span className="inline-flex flex-wrap items-center gap-2">
                {t("settings.recovery_codes_row")}
                {methods &&
                  (has_codes ? (
                    <Badge color="green">
                      {t("settings.recovery_method_active")}
                    </Badge>
                  ) : (
                    <Badge color="gray">
                      {t("settings.recovery_method_not_set")}
                    </Badge>
                  ))}
              </span>
            }
            layout="stacked"
            trailing={
              load_error && !methods ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void fetch_methods()}
                >
                  {t("settings.try_again")}
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {has_codes && (
                    <Button
                      variant="secondary"
                      onClick={() => open_modal("show")}
                    >
                      {t("settings.recovery_codes_show")}
                    </Button>
                  )}
                  <Button
                    variant={has_codes ? "secondary" : "depth"}
                    onClick={() => open_modal("regenerate")}
                  >
                    {has_codes
                      ? t("settings.recovery_codes_regenerate")
                      : t("settings.recovery_codes_generate")}
                  </Button>
                </div>
              )
            }
          />

          {methods?.has_phrase && (
            <IslandRow
              description={t("settings.legacy_phrase_row_desc")}
              label={
                <span className="inline-flex flex-wrap items-center gap-2">
                  {t("settings.legacy_phrase_row")}
                  <Badge color="green">
                    {t("settings.recovery_method_active")}
                  </Badge>
                </span>
              }
            />
          )}
        </Island>
      </IslandSection>

      <RecoveryCodesModal
        has_codes={has_codes}
        is_open={show_codes_modal}
        mode={modal_mode}
        on_close={() => set_show_codes_modal(false)}
        on_saved={() => {
          void fetch_methods();
          on_changed?.();
        }}
      />
    </>
  );
}
