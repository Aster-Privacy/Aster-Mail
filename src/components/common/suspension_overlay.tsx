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
import { SuspensionBannerView } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

const APPEAL_URL = "https://astermail.org/appeal";

export function SuspensionBanner() {
  const { t } = use_i18n();
  const [is_visible, set_is_visible] = useState(false);
  const [reason, set_reason] = useState("");

  const handle_suspension = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const raw_reason = detail?.reason || "";
      const lower = raw_reason.toLowerCase().trim();
      const is_generic =
        !lower ||
        lower === "account suspended" ||
        lower === "account suspended.";

      set_reason(
        is_generic ? t("common.account_suspended_default_reason") : raw_reason,
      );
      set_is_visible(true);
    },
    [t],
  );

  useEffect(() => {
    const stored = sessionStorage.getItem("aster_suspended");

    if (stored === "true") {
      set_reason(t("common.account_suspended_default_reason"));
      set_is_visible(true);
    }

    window.addEventListener("aster:account-suspended", handle_suspension);

    return () => {
      window.removeEventListener("aster:account-suspended", handle_suspension);
    };
  }, [handle_suspension, t]);

  if (!is_visible) {
    return null;
  }

  return (
    <SuspensionBannerView
      appeal_href={APPEAL_URL}
      appeal_label={t("common.submit_an_appeal")}
      label={t("common.account_suspended_label")}
      reason={reason}
    />
  );
}
