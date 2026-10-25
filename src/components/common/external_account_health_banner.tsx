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
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { StatusBanner } from "@aster/ui";

import { use_preferences } from "@/contexts/preferences_context";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  build_alert_signature,
  get_external_account_alerts,
} from "@/lib/external_account_health";
import { list_external_accounts } from "@/services/api/external_accounts";
import {
  get_external_account_health_generation,
  has_published_external_account_health,
  use_external_account_health,
} from "@/stores/external_account_health_store";

export function ExternalAccountHealthBanner() {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { preferences, update_preference, is_loading, has_loaded_from_server } =
    use_preferences();
  const records = use_external_account_health();
  const health_generation = get_external_account_health_generation();
  const [dismissed_signature, set_dismissed_signature] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (is_loading || !has_loaded_from_server) return;
    if (has_published_external_account_health()) return;
    void list_external_accounts();
  }, [is_loading, has_loaded_from_server, health_generation]);

  const alerts = useMemo(
    () => get_external_account_alerts(records, Date.now()),
    [records],
  );
  const signature = build_alert_signature(alerts);
  const is_dismissed =
    dismissed_signature === signature ||
    preferences.external_account_health_banner_dismissed === signature;

  const stored_dismissal = preferences.external_account_health_banner_dismissed;
  const is_resolved =
    has_published_external_account_health() &&
    records.every((record) => record.problem_since === null);

  useEffect(() => {
    if (is_loading || !has_loaded_from_server) return;
    if (!is_resolved || !stored_dismissal) return;
    set_dismissed_signature(null);
    update_preference("external_account_health_banner_dismissed", "", true);
  }, [
    is_loading,
    has_loaded_from_server,
    is_resolved,
    stored_dismissal,
    update_preference,
  ]);

  const should_hide =
    is_loading ||
    !has_loaded_from_server ||
    alerts.length === 0 ||
    is_dismissed;

  const handle_review = useCallback(() => {
    const only = alerts.length === 1 ? alerts[0] : null;
    const section =
      only?.state === "needs_reauth" && only.record.protocol === "oauth_imap"
        ? "import"
        : "external_accounts";

    window.dispatchEvent(
      new CustomEvent("navigate-settings", { detail: section }),
    );
  }, [alerts]);

  const handle_dismiss = useCallback(() => {
    if (!signature) return;
    set_dismissed_signature(signature);
    update_preference(
      "external_account_health_banner_dismissed",
      signature,
      true,
    );
  }, [signature, update_preference]);

  let message = t("common.external_account_health_banner_multiple");

  if (alerts.length === 1) {
    const [{ record, state }] = alerts;

    message =
      state === "needs_reauth"
        ? t("common.external_account_health_banner_reauth", {
            email: record.email,
          })
        : t("common.external_account_health_banner_failing", {
            email: record.email,
          });
  }

  return (
    <StatusBanner
      actions={[
        {
          label: t("common.external_account_health_banner_action"),
          on_click: handle_review,
        },
        {
          label: t("common.external_account_health_banner_dismiss"),
          on_click: handle_dismiss,
          emphasis: "secondary",
        },
      ]}
      icon={ExclamationTriangleIcon}
      is_visible={!should_hide}
      message={message}
      reduce_motion={reduce_motion}
      role="status"
      tone="warning"
      variant="prompt"
    />
  );
}
