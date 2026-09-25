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
import { get_recovery_methods, RecoveryMethods } from "@/services/api/recovery";
import { RecoveryCodesModal } from "@/components/settings/security/recovery_codes_modal";

export function AccountRecoverySection() {
  const { t } = use_i18n();
  const [methods, set_methods] = useState<RecoveryMethods | null>(null);
  const [show_codes_modal, set_show_codes_modal] = useState(false);
  const [load_error, set_load_error] = useState(false);

  const fetch_methods = useCallback(async () => {
    const response = await get_recovery_methods();

    if (response.data) {
      set_methods(response.data);
      set_load_error(false);
    } else {
      set_load_error(true);
    }
  }, []);

  useEffect(() => {
    fetch_methods();
  }, [fetch_methods]);

  const has_codes = methods?.has_codes ?? false;
  const has_offline_method = has_codes || (methods?.has_phrase ?? false);

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

        <Island>
          <IslandRow
            description={t("settings.recovery_codes_row_desc")}
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
                <Button
                  variant={has_codes ? "secondary" : "depth"}
                  onClick={() => set_show_codes_modal(true)}
                >
                  {has_codes
                    ? t("settings.recovery_codes_regenerate")
                    : t("settings.recovery_codes_generate")}
                </Button>
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
        on_close={() => set_show_codes_modal(false)}
        on_saved={fetch_methods}
      />
    </>
  );
}
