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
import { useEffect, useState } from "react";
import {
  ExclamationCircleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsRow } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { ButtonSpinner } from "@/components/ui/spinner";
import {
  request_external_pgp_key_load,
  set_external_key_published,
} from "@/services/crypto/external_pgp_key";
import {
  external_key_expires_soon,
  format_external_fingerprint,
  use_external_key_state,
} from "@/components/settings/encryption/use_external_key_state";

export function MobileExternalKeyGroup() {
  const { t } = use_i18n();
  const key_state = use_external_key_state();
  const [busy, set_busy] = useState(false);

  useEffect(() => {
    void request_external_pgp_key_load();
  }, []);

  const record = key_state.record;

  if (!record) return null;

  const stop_publishing = async () => {
    if (busy) return;

    set_busy(true);
    const result = await set_external_key_published(false);

    set_busy(false);
    show_toast(
      result.ok
        ? t("settings.external_key_unpublished_toast")
        : t("settings.external_key_error_generic"),
      result.ok ? "success" : "error",
    );
  };

  const needs_reimport = key_state.status === "needs_reimport";
  const notice =
    !needs_reimport &&
    record.expires_at &&
    external_key_expires_soon(record.expires_at)
      ? t("settings.external_key_expires_soon_short")
      : undefined;

  return (
    <SettingsGroup title={t("settings.external_key_title")}>
      {needs_reimport && (
        <div
          className="flex items-start gap-2.5 px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]"
          role="alert"
          style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
        >
          <ExclamationCircleIcon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mobile-danger)]"
          />
          <p>{t("settings.external_key_needs_reimport")}</p>
        </div>
      )}
      <SettingsRow
        description={notice ?? format_external_fingerprint(record.fingerprint)}
        icon={<KeyIcon className="h-4 w-4" />}
        label={t("settings.external_key_your_key")}
        value={
          record.published
            ? t("settings.external_key_published")
            : t("settings.external_key_not_published")
        }
      />
      {record.published && !needs_reimport && (
        <SettingsRow
          destructive
          label={t("settings.external_key_stop_publishing")}
          trailing={busy ? <ButtonSpinner /> : undefined}
          on_press={stop_publishing}
        />
      )}
    </SettingsGroup>
  );
}
