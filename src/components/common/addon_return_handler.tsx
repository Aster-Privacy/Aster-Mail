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
import { useEffect, useRef } from "react";

import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth_context";
import { ignore_error } from "@/lib/ignore_error";

const ADDON_RETURN_KEY = "aster_addon_return";

export function AddonReturnHandler() {
  const { t } = use_i18n();
  const { is_authenticated } = use_auth();
  const handled = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("addon_purchase");

    if (outcome !== "success" && outcome !== "cancelled") return;

    try {
      sessionStorage.setItem(ADDON_RETURN_KEY, outcome);
    } catch (caught) {
      ignore_error("components/common/addon_return_handler:stash", caught);
    }
    params.delete("addon_purchase");
    const query = params.toString();

    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  useEffect(() => {
    if (!is_authenticated || handled.current) return;

    let outcome: string | null = null;

    try {
      outcome = sessionStorage.getItem(ADDON_RETURN_KEY);
      if (outcome) sessionStorage.removeItem(ADDON_RETURN_KEY);
    } catch (caught) {
      ignore_error("components/common/addon_return_handler:consume", caught);
    }

    if (!outcome) return;

    handled.current = true;

    if (outcome !== "success") return;

    request_cache.invalidate("/payments/v1");
    request_cache.invalidate("/sync/v1");
    invalidate_mail_stats();
    window.dispatchEvent(new CustomEvent("aster:plan-changed"));
    show_toast(t("settings.addon_purchased"), "success");
  }, [is_authenticated, t]);

  return null;
}
