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
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  get_recovery_methods,
  RecoveryMethods,
} from "@/services/api/recovery";
import { RecoveryCodesModal } from "@/components/settings/security/recovery_codes_modal";

export function AccountRecoverySection() {
  const { t } = use_i18n();
  const [methods, set_methods] = useState<RecoveryMethods | null>(null);
  const [show_codes_modal, set_show_codes_modal] = useState(false);

  const fetch_methods = useCallback(async () => {
    const response = await get_recovery_methods();

    if (response.data) set_methods(response.data);
  }, []);

  useEffect(() => {
    fetch_methods();
  }, [fetch_methods]);

  const has_codes = methods?.has_codes ?? false;
  const has_offline_method = has_codes || (methods?.has_phrase ?? false);

  return (
    <div id="sec-recovery">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <LifebuoyIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.account_recovery_title")}
        </h3>
        <p className="text-sm mt-1 text-txt-muted">
          {t("settings.account_recovery_desc")}
        </p>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      {methods && (
        <div className="flex items-start gap-3 p-3 rounded-lg border bg-surf-tertiary border-edge-secondary">
          {has_offline_method ? (
            <ShieldCheckIcon className="w-5 h-5 flex-shrink-0 text-green-500" />
          ) : (
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-500" />
          )}
          <div>
            <p className="text-sm font-medium text-txt-primary">
              {has_offline_method
                ? t("settings.recovery_status_protected")
                : t("settings.recovery_status_at_risk")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {has_offline_method
                ? t("settings.recovery_status_protected_desc")
                : t("settings.recovery_status_at_risk_desc")}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between py-4">
        <div className="flex-1 pr-4">
          <p className="text-sm font-medium text-txt-primary flex items-center gap-2">
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
          </p>
          <p className="text-sm mt-0.5 text-txt-muted">
            {t("settings.recovery_codes_row_desc")}
          </p>
        </div>
        <Button
          variant={has_codes ? "secondary" : "depth"}
          onClick={() => set_show_codes_modal(true)}
        >
          {has_codes
            ? t("settings.recovery_codes_regenerate")
            : t("settings.recovery_codes_generate")}
        </Button>
      </div>

      {methods?.has_phrase && (
        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary flex items-center gap-2">
              {t("settings.legacy_phrase_row")}
              <Badge color="green">
                {t("settings.recovery_method_active")}
              </Badge>
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.legacy_phrase_row_desc")}
            </p>
          </div>
        </div>
      )}

      <RecoveryCodesModal
        has_codes={has_codes}
        is_open={show_codes_modal}
        on_close={() => set_show_codes_modal(false)}
        on_saved={fetch_methods}
      />
    </div>
  );
}
